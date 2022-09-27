import moment from "moment";
import decode from "decode-uri-component";

import ljReq from "./livejournal.js";
import makeParams from "./makeparams.js";

export default function (db) {
	return {
		db,
		lastsync: false,
		toSync: {},
		processEntries: function (downloaded) {
			// we have downloaded entries, so add them to the database.
			const {db} = this;
			const addEntry = db.prepare(
				"insert or replace into entries (id, subject, event, time, security, allowmask, anum, url, poster) values(:id, :subject, :event, :time, :security, :allowmask, :anum, :url, :poster)"
			);
			const addProp = db.prepare(
				"insert or replace into props (entryid, name, value) values (:entryid, :name, :value)"
			);
			let newest;
			db.serialize(() => {
				// all entries are added in a transaction. probably better to do *everything* in a giant transaction but i'm sick of dealing with async garbage.
				downloaded.forEach(function (entry) {
					const {
						itemid,
						subject,
						event,
						eventtime,
						security,
						allowmask,
						anum,
						url,
						poster
					} = entry;
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
					entry.props.forEach(function (prop) {
						addProp.run(
							makeParams({
								entryid: itemid,
								name: prop["name"],
								value: prop["value"]
							})
						);
					});
					// update the toSync hash so we know what's been downloaded already.
					// sometimes entries appear that aren't in the initial syncitems download. why? who knows!
					if (this.toSync[itemid]) this.toSync[itemid]["downloaded"] = true;
				}, this);
			});
			let firstsync;
			// set the next lastsync value to the earliest time in the toSync array that isn't marked as downloaded.
			for (let z in this.toSync) {
				const e = this.toSync[z];
				if (
					!e.downloaded &&
					(!firstsync || firstsync.valueOf() > e.time.valueOf())
				)
					firstsync = moment(e.time);
			}
			if (firstsync) this.lastsync = firstsync;
		},
		stillToDownload: function () {
			// return number of entries to download remaining.
			let length = 0;
			for (let z in this.toSync) {
				if (!this.toSync[z].downloaded) length++;
			}
			return length;
		},
		getEvents: function () {
			// this loops and makes requests to the server until there's no entries left to get.
			console.log(this.stillToDownload() + " entries left to download.");
			if (!this.lastsync) throw "Initial sync time not set.";
			const obj = {
				mode: "getevents",
				selecttype: "syncitems",
				// never understood the minus one second part, but we end up stuck in a loop otherwise.
				lastsync: this.lastsync
					.subtract(1, "seconds")
					.format("YYYY-MM-DD HH:mm:ss")
			};
			const lj = new ljReq();
			const processEntries = (data) => {
				const entries = [];
				const propCount = data["prop_count"];
				const props = {};
				// props are extra metadata attached to the entry. moods, tags, whatever.
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
				const count = data["events_count"];
				// these are all the available event attributes returned by the server.
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
					eAttributes.forEach(function (attr) {
						event[attr] = data[eNum + "_" + attr];
					});
					// if a bunch of props matches an event, attach it to it.
					event["props"] = props[event["itemid"]] || [];
					entries.push(event);
				}
				this.processEntries(entries);

				// this next bit is so we can tell if we're finished downloading entries or not.
				// it's needed because if there's been deletions since a sync and then the user syncs, we end up forever downloading otherwise.
				// at least that's what my old code says - i haven't actually tested it.
				let newestTime, oldestItem;
				const {toSync} = this;
				for (let z in toSync) {
					const eTime = moment(toSync[z].time);
					if (!newestTime || newestTime.valueOf() < eTime.valueOf())
						newestTime = moment(eTime);
					if (!toSync[z]["downloaded"]) {
						if (!oldestItem || this.lastsync.valueOf() > eTime.valueOf()) {
							this.lastsync = moment(eTime);
							oldestItem = z;
						}
					}
				}
				// if there's still undownloaded items in the toSync hash, go download them.
				if (oldestItem) {
					this.getEvents();
				} else {
					// save final lastsync value for next time
					const updateLastSync = db.prepare(
						"update general set lastsync = :lastsync"
					);
					updateLastSync.run(makeParams({lastsync: newestTime.unix()}));

					// if anything was in syncitems but not returned by getevents, we can assume the entry was deleted.
					// this deletes it locally as well.
					console.log("Removing any deleted entries...");
					const delEntry = db.prepare("DELETE from `entries` WHERE `id` = :id");
					for (let z in toSync) {
						if (!toSync[z].downloaded) delEntry.run(makeParams({id: z}));
					}
					// woo! done!
					console.log("Download complete!");
				}
			};
			lj.send(obj, processEntries);
		}
	};
}
