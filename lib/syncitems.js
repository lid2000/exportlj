const moment = require("moment");
const ljReq = require("./livejournal");
const getEvents = require("./getevents");
const config = require('../config.json');
const {url, username, password} = config;

// fun fact - most of this is redundant. all you really need is the time of the first item that hasn't been synced.

const syncItems = function(db, lastsync) {
	return {
		lastsync: lastsync ? moment.unix(lastsync): false,
		firstsync: false,
		total: 0,
		entries: [],
		comments: [],
		db,
		sync: function() {
			const obj = {
				mode: "syncitems"
			};
			if (this.lastsync) obj['lastsync'] = this.lastsync.format("YYYY-MM-DD HH:mm:ss");
			const lj = new ljReq(url, username, password);
			const handleResponse = (data) => {
				const total = data['sync_total'];
				const count = data['sync_count'];
				for (let i = 1; i <= count; i++) {
					const sNum = "sync_" + i;
					if (!data[sNum + '_action']) continue;
					const syncObj = {
						action: data[sNum + '_action'],
						item: data[sNum + '_item'],
						time: data[sNum + '_time']
					};
					const matches = /^(\w)\-(\d+)$/.exec(syncObj['item']);
					syncObj['id'] = matches[2];
					switch (matches[1]) {
						case "L":
							this.entries.push(syncObj);
							break;
						case "C":
							this.comments.push(syncObj);
							break;
					}
					const lastsync = moment(syncObj['time']);
					if (!this.lastsync || (this.lastsync.valueOf() < lastsync.valueOf())) this.lastsync = lastsync;
					if (!this.firstsync || (this.firstsync.valueOf() > lastsync.valueOf())) this.firstsync = lastsync;
				}
				if (!this.total) this.total = total;
				const downloaded = this.entries.length + this.comments.length;
				if (!this.entries.length) {
					console.log("No new entries to download.");
					return;
				}
				console.log("Downloaded indexes for " + downloaded + " events, " + total + " more to go (" + Math.round(downloaded / (downloaded + parseInt(total)) * 100) + "%)...");
				if (count == total) {
					// we're finished!
					// now to run getevents
					console.log("Downloaded indexes!");
					const events = new getEvents(this.db);
					const toSync = {};
					this.entries.forEach(function(entry) {
						toSync[entry['id']] = {
							downloaded: false,
							time: moment(entry['time'])
						}
					});
					events.toSync = toSync;
					events.lastsync = moment(this.firstsync);
					events.getEvents();
				} else {
					this.sync();
				}
			};
			lj.send(obj, handleResponse);
		}
	}
};

module.exports = syncItems;
