import sqlite from "sqlite3";

import ljReq from "./lib/livejournal.js";
import syncItems from "./lib/syncitems.js";
import getComments from "./lib/comments.js";
import makeParams from "./lib/makeparams.js";
import config from "./config.json" assert {type: "json"};

const {username} = config;

// a lot of this is done with callbacks because the database runs async, as does all the requests to the lj server.
//	yeah, annoying.

const db = new sqlite.Database(username + ".sqlite3");
db.serialize(function () {
	// set up the database
	// below options seem to lose data
	//db.run("pragma synchronous = off");
	//db.run("pragma journal_mode = memory");
	db.run(
		"create table if not exists `commenters` ( `id` integer not null unique, `username` text not null, primary key(`id`) )"
	);
	db.run(
		"create table if not exists `comments` ( `id` integer not null, `userid` integer not null, `entryid` integer not null, `parentid` integer not null, `date` integer not null, `subject` text not null, `comment` text not null, primary key (`id`) )"
	);
	db.run(
		"create table if not exists `props` ( `entryid` integer not null, `name` text not null, `value` text not null)"
	);
	db.run("create table if not exists `general`( `lastsync` integer not null)");
	db.get("select * from `general`", {}, function (err, res) {
		if (!res) db.run("insert into `general` (`lastsync`) values (0)");
	});
	db.run(
		"create table if not exists `entries` ( `id` integer not null, `subject` text, `event` text not null, `time` integer not null, `security` text not null, `allowmask` integer, `anum` integer not null, `url`	text not null, `poster` text, primary key(`id`))"
	);
	db.run("create index if not exists `entryindex` on `props` (`entryid`)");
	db.run(
		"create table if not exists `moods` (`id` integer not null, `parent` integer not null, `name` text not null, primary key(`id`))"
	);
	db.run(
		"create table if not exists `userpics` (`name` text not null, `url` text not null, primary key(`name`))"
	);
	db.run(
		"create unique index if not exists `propindex` on `props` (`entryid`, `name`)"
	);
});

db.get("select `lastsync` from `general`", {}, function (err, obj) {
	// we have our lastsync value, so let's get started
	exportLJ(obj ? obj["lastsync"] : 0);
});

const exportLJ = function (lastsync) {
	const lj = new ljReq();
	lj.send(
		{mode: "login", getmoods: 0, getpickws: 1, getpickwurls: 1},
		function (data) {
			// login was successful, so let's start syncing
			// do moods
			const addMood = db.prepare(
				"insert or replace into moods (id, parent, name) values (:id, :parent, :name)"
			);
			for (let i = 1; i <= data.mood_count; i++) {
				const mood = {
					id: data["mood_" + i + "_id"],
					parent: data["mood_" + i + "_parent"],
					name: data["mood_" + i + "_name"]
				};
				if (mood["id"]) addMood.run(makeParams(mood));
			}
			const addUserpic = db.prepare(
				"insert or replace into userpics (name, url) values (:name, :url)"
			);
			addUserpic.run(
				makeParams({name: "__default_pic__", url: data.defaultpicurl})
			);
			for (let i = 1; i <= data.pickw_count; i++) {
				const pic = {
					name: data["pickw_" + i],
					url: data["pickwurl_" + i]
				};
				addUserpic.run(makeParams(pic));
			}
			const sync = new syncItems(db, lastsync);
			sync.sync();
			db.get(
				"select max(`id`) as maxid from comments",
				{},
				function (err, obj) {
					const maxid = obj ? obj["maxid"] : 0;
					const comments = new getComments(db, maxid);
					comments.download();
				}
			);
		}
	);
};
