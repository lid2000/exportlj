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
		entries: [],
		processEntries: function(downloaded) {
			const {db} = this;
			const addEntry = db.prepare("insert or replace into entries (id, subject, event, time, security, allowmask, anum, url, poster) values(:id, :subject, :event, :time, :security, :allowmask, :anum, :url, :poster)");
			db.serialize(function() {
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

					for (let i = 0; i < this.entries.length; i++) {
						// entry is added, so delete from the to-be-downloaded list
						if (this.entries[i] && (this.entries[i].id == entry.itemid)) {
							delete this.entries[i];
							return;
						}
					}
				}, this);
				db.run("commit");
			}.bind(this));
			this.entries = this.entries.filter(function(a) {
				return a != undefined;
			});
			let firstsync;
			this.entries.forEach(function(a) {
				if (!firstsync || firstsync.valueOf() > a.time.valueOf()) firstsync = moment(a.time);
			});
			this.lastsync = firstsync;
		},
		getEvents: function() {
			console.log(this.entries.length + " entries left to download.");
			if (!this.lastsync) throw "Initial sync time not set.";
			const obj = {
				mode: "getevents",
				selecttype: "syncitems",
				lastsync: this.lastsync.subtract(1, "seconds").format("YYYY-MM-DD HH:mm:ss")
			}
			const lj = new ljReq(url, username, password);
			const processEntries = function(data) {
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
				if (this.entries.length) this.getEvents();
			}.bind(this);
			lj.send(obj, processEntries);
		}
	}
}

module.exports = events;
