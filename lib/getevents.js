const moment = require("moment");
const ljReq = require("./livejournal");
const config = require('../config.json');
const decode = require('decode-uri-component');
const {url, username, password} = config;

const makeParams = function(params) {
	const out = {};
	for (let z in params) {
		out[':' + z] = params[z];
	}
	return out;
}

const events = function(db) {
	return {
		db,
		lastsync: false,
		toSync: {},
		processEntries: function(downloaded) {
			const {db} = this;
			const addEntry = db.prepare("insert or replace into entries (id, subject, event, time, security, allowmask, anum, url, poster) values(:id, :subject, :event, :time, :security, :allowmask, :anum, :url, :poster)");
			let newest;
			db.serialize(() => {
				db.run("begin");
				downloaded.forEach(function(entry) {

					const {itemid, subject, event, eventtime, security, allowmask, anum, url, poster} = entry;
					const params = {
						id: itemid,
						subject: decode(subject || ""),
						event: decode(event || ""),
						time: moment(eventtime).unix(),
						security: security || "",
						allowmask: allowmask || 0,
						anum,
						url,
						poster
					};
					addEntry.run(makeParams(params));
					// sometimes entries appear that aren't in the initial syncitems download. why? who knows!
					if (this.toSync[itemid]) this.toSync[itemid]['downloaded'] = true;
				}, this);
				db.run("commit");
			});
			let firstsync;
			for (let z in this.toSync) {
				const e = this.toSync[z];
				if (!e.downloaded && (!firstsync || firstsync.valueOf() > e.time.valueOf())) firstsync = moment(e.time);
			}
			if (firstsync) this.lastsync = firstsync;
		},
		stillToDownload: function() {
			let length = 0;
			for (let z in this.toSync) {
				if (!this.toSync[z].downloaded) length++;
			}
			return length;
		},
		getEvents: function() {
			console.log(this.stillToDownload() + " entries left to download.");
			if (!this.lastsync) throw "Initial sync time not set.";
			const obj = {
				mode: "getevents",
				selecttype: "syncitems",
				lastsync: this.lastsync.subtract(1, "seconds").format("YYYY-MM-DD HH:mm:ss")
			}
			const lj = new ljReq(url, username, password);
			const processEntries = (data) => {
				const entries = [];
				const propCount = data['prop_count'];
				const props = {};
				for (let i = 1; i < propCount; i++) {
					const pNum = "prop_" + i;
					const propID = data[pNum + "_itemid"];
					if (!props[propID]) props[propID] = [];
					props[propID].push({
						event: propID,
						name: data[pNum + "_name"],
						value: data[pNum + "_value"]
					});
				}
				const count = data['events_count'];
				const eAttributes = [
					"eventtime",
					"itemid",
					"security",
					"subject",
					"url",
					"allowmask",
					"anum",
					"event"
				];
				for (let i = 1; i <= count; i++) {
					const event = {};
					const eNum = "events_" + i;
					eAttributes.forEach(function(attr) {
						event[attr] = data[eNum + "_" + attr];
					});
					if (props[event['itemid']]) event['props'] = props[event['itemid']];
					entries.push(event);
				}
				this.processEntries(entries);

				let newestTime, oldestItem;
				const {toSync} = this;
				for (let z in toSync) {
					const eTime = moment(toSync[z].time);
					if (!newestTime || (newestTime.valueOf() < eTime.valueOf())) newestTime = moment(eTime);
					if (!toSync[z]['downloaded']) {
						if (!oldestItem || (this.lastsync.valueOf() > eTime.valueOf())) {
							this.lastsync = moment(eTime);
							oldestItem = z;
						}
					}
				}
				if (oldestItem) {
					this.getEvents();
				} else {
					const updateLastSync = db.prepare('update general set lastsync = :lastsync');
					updateLastSync.run(makeParams({lastsync: newestTime.unix()}));

					console.log("Removing any deleted entries...");
					const delEntry = db.prepare("DELETE from `entries` WHERE `id` = :id");
					for (let z in toSync) {
						if (!toSync[z].downloaded) delEntry.run(makeParams({id: z}));
					}
					console.log("Download complete!");
				}
			};
			lj.send(obj, processEntries);
		}
	}
}

module.exports = events;
