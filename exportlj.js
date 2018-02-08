const sqlite = require("sqlite3").verbose();

const ljReq = require("./lib/livejournal");
const syncItems = require("./lib/syncitems");
const getComments = require("./lib/comments");
const config = require('./config.json');

const {username} = config;

// a lot of this is done with callbacks because the database runs async, as does all the requests to the lj server.
//	yeah, annoying.

const db = new sqlite.Database(username + ".sqlite3");
db.serialize(function() {
	// set up the database
	db.run("create table if not exists `commenters` ( `id` integer not null unique, `username` text not null, primary key(`id`) )");
	db.run("create table if not exists `comments` ( `id` integer not null, `userid` integer not null, `entryid` integer not null, `parentid` integer not null, `date` integer not null, `subject` text not null, `comment` text not null )");
	db.run("create table if not exists `props` ( `id` integer not null, `name` text not null, primary key(`id`))");
	db.run("create table if not exists `propmap` ( `entryid` integer not null, `propid` integer not null, `value` text not null)");
	db.run("create table if not exists `general`( `lastsync` integer not null)");
	db.get("select * from `general`", {}, function(err, res) {
		if (!res) db.run("insert into `general` (`lastsync`) values (0)");
	});
	db.run("create table if not exists `entries` ( `id` integer not null, `subject` text, `event` text not null, `time` integer not null, `security` text not null, `allowmask` integer, `anum` integer not null, `url`	text not null, `poster` text, primary key(`id`))");
	db.run("create unique index if not exists `id` on `propmap` (`entryid`, `propid`)");
});

db.get("select `lastsync` from `general`", {}, function(err, obj) {
	// we have our lastsync value, so let's get started
	exportLJ(obj ? obj['lastsync'] : 0);
});

const exportLJ = function(lastsync) {
	const lj = new ljReq();
	lj.send({mode: "login", getmoods: 0, getpickws: 1, getpickwurls: 1}, function(data) {
		// login was successful, so let's start syncing
		// TODO: save moods, pics etc somewhere
		const sync = new syncItems(db, lastsync);
		sync.sync();
		db.get("select max(`id`) as maxid from comments", {}, function(err, obj) {
			const maxid = obj ? obj['maxid'] : 0;
			const comments = new getComments(db, maxid);
			comments.download();
		});
	});
}
