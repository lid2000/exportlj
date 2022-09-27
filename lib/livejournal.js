import request from 'request';
import md5 from "md5";
import os from "os";
import pkg from "../package.json" assert { type: "json" };
import config from '../config.json' assert { type: "json" };

const version = os.platform() + "-" + pkg.name + "/" + pkg.version;
const {url, username, password} = config;

// my wonderful lj interface. it handles challenge/response stuff transparently so you don't have to think about it

export default function() {
	return {
		url,
		username,
		password,
		getChallenge: function(cb) {
			// every request needs a challenge/response thing added. this runs before any request to get a challenge.
			request.post({
				url: this.url + "/interface/flat",
				form: {ver: 1, mode: "getchallenge"}
			}, (err, res, body) => {
				cb(this.readResponse(body));
			});
		},
		readResponse: function(response) {
			// this just turns lj's flat interface into an object, makes things easier to deal with.
			const out = {};
			const split = response.split("\n");
			for (var i = 0; i < split.length; i+=2) {
				if (split[i]) out[split[i]] = split[i+1];
			}
			return out;
		},
		handleResponse: function(err, res, body) {
			// turn the response into an object + crash and burn if there's an error returned from the api.
			const response = this.readResponse(body);
			if (!response.success || (response.success != "OK")) {
				console.error(response.errmsg || "Server error - got no response.");
				process.exit(1);
			}
			// run our callback now that we've got our response object set up.
			if (this.done) this.done(response);
		},
		send: function(values, cb) {
			this.getChallenge((res) => {
				// once we have a challenge, do the actual request.
				this.done = cb;
				const {challenge} = res;
				const send = Object.assign({}, values);
				send['ver'] = 1;
				send['clientversion'] = version;
				send['user'] = this.username;
				send['auth_method'] = "challenge";
				send['auth_challenge'] = challenge;
				send['auth_response'] = md5(challenge + md5(this.password));
				request.post({
					url: url + "/interface/flat",
					form: send
				}, this.handleResponse.bind(this));
			});
		}
	};
};
