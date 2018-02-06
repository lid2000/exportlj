const sqlite = require("sqlite3").verbose();

const ljReq = require("./lib/livejournal");
const syncItems = require("./lib/syncitems");
const config = require('./config.json');

const {url, username, password} = config;

const db = new sqlite.Database(username + ".sqlite3");
db.serialize(function() {
	db.run("CREATE TABLE IF NOT EXISTS `propmap` ( `id` INTEGER NOT NULL, `propname` NVARCHAR NOT NULL, PRIMARY KEY(`id`))");
	db.run("CREATE TABLE IF NOT EXISTS `props` ( `itemid` INTEGER NOT NULL, `propid` INTEGER NOT NULL, `value` NVARCHAR NOT NULL)");
	db.run("CREATE TABLE IF NOT EXISTS `general`( `lastsync` INTEGER)");
	db.run("CREATE TABLE IF NOT EXISTS `entries` ( `id` INTEGER NOT NULL, `subject` NVARCHAR, `event` TEXT NOT NULL, `time` INTEGER NOT NULL, `security` NVARCHAR NOT NULL, `allowmask` INTEGER, `anum` INTEGER NOT NULL, `url`	NVARCHAR NOT NULL, `poster` NVARCHAR, PRIMARY KEY(`id`))");
	db.run("CREATE UNIQUE INDEX IF NOT EXISTS `id` ON `props` (`itemid`,	`propid`)");
});

const lj = new ljReq(url, username, password);
lj.send({mode: "login", getmoods: 0, getpickws: 1, getpickwurls: 1}, function(data) {
	const sync = new syncItems(db);
	sync.sync();
});
