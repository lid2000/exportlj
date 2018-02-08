const request = require("request");
const qs = require("querystring");
const pixl = require("pixl-xml");
const ljReq = require("./livejournal");
const config = require('../config.json');
const makeParams = require("./makeparams");
const moment = require("moment");
const {url} = config;

const getComments = function(db, startFrom) {
	return {
		db,
		session: false,
		metadata: [],
		users: [],
		maxid: 0,
		metaDownloaded: startFrom,
		commentDownloaded: startFrom,
		numCommentDownloaded: 0,
		startid: 0,
		makeSession: function(cb) {
			const lj = new ljReq();
			const params = {
				mode: "sessiongenerate",
				expiration: "short"
			};
			lj.send(params, (obj) => {
				const session = obj['ljsession'];
				this.session = session;
				cb();
			});
		},
		commentRequest: function(values, cb) {
			if (!this.session) {
				console.error("Trying to retrieve comments with no session set!");
				process.exit(1);
			}
			const exUrl = url + "/export_comments.bml?" + qs.stringify(values);
			const jar = request.jar();
			const cookie = request.cookie("ljsession=" + this.session);
			jar.setCookie(cookie, exUrl);
			request({
				url: exUrl,
				jar
			}, function(err, res, body) {
				const xml = pixl.parse(body);
				cb(xml);
			});
		},
		download: function() {
			if (!this.session) {
				this.makeSession(this.download.bind(this));
			} else {
				const processMeta = function(xml) {
					this.maxid = parseInt(xml.maxid);
					if (xml.comments.comment) {
						xml.comments.comment.forEach(function(c) {
							const id = parseInt(c['id']);
							this.metadata.push(c);
							if (id > this.metaDownloaded) this.metaDownloaded = id;
						}, this);
					}
					if (xml.usermaps.usermap) {
						const addUsers = this.db.prepare("insert or replace into `commenters` (`id`, `username`) values (:id, :user)");
						xml.usermaps.usermap.forEach(function(u) {
							this.users.push(u);
							addUsers.run(makeParams(u));
						}, this);
					}
					console.log("Got metadata for " + this.metadata.length + " new comments.");
					if (this.maxid > this.metaDownloaded) {
						this.download();
					} else {
						// all metadata downloaded, now let's get comments
						this.downloadComments();
					}
				};
				this.commentRequest({
					get: "comment_meta",
					startid: this.metaDownloaded ? this.metaDownloaded + 1 : 0
				}, processMeta.bind(this));
			}
		},
		downloadComments: function() {
			const processComments = function(xml) {
				const {db} = this;
				if (xml.comments.comment) {
					const addComment = db.prepare("insert or replace into `comments` (`id`, `userid`, `entryid`, `parentid`, `date`, `subject`, `comment`) values (:id, :userid, :entryid, :parentid, :date, :subject, :comment)");
					xml.comments.comment.forEach(function(c) {
						const id = parseInt(c['id']);
						if (id > this.commentDownloaded) this.commentDownloaded = id;
						const params = {
							id: c['id'],
							userid: c['posterid'] || 0,
							entryid: c['jitemid'],
							parentid: c['parentid'] || 0,
							date: moment(c['date']).unix(),
							subject: c['subject'] || "",
							comment: c['body'] || ""
						}
						addComment.run(makeParams(params));
					}, this);
					this.numCommentDownloaded += xml.comments.comment.length;
					console.log("Downloaded " + this.numCommentDownloaded + " of " + this.metadata.length + " comments (" + Math.ceil(this.numCommentDownloaded / this.metadata.length * 100) + "%)...")
				}
				if ((this.maxid > this.commentDownloaded) || (!xml.comments.comment && (this.maxid > this.commentDownloaded + 1000))) {
					this.downloadComments();
				} else {
					// we're done
					if (this.metadata.length) console.log("Finished downloading comments!");
				}
			}
			this.commentRequest({
				get: "comment_body",
				startid: this.commentDownloaded ? this.commentDownloaded + 1 : 0
			}, processComments.bind(this));
		}
	}
}

module.exports = getComments;
