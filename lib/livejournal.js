
const request = require('request');
const md5 = require("md5");

const os = require("os");
const package = require("../package.json");
const version = os.platform() + "-" + package.name + "/" + package.version;

const ljReq = function(url, username, password) {
	return {
		url,
		username,
		password,
		getChallenge: function(cb) {
			request.post({
				url: this.url + "/interface/flat",
				form: {ver: 1, mode: "getchallenge"}
			}, (err, res, body) => {
				cb(this.readResponse(body));
			});
		},
		readResponse: function(response) {
			const out = {};
			const split = response.split("\n");
			for (var i = 0; i < split.length; i+=2) {
				if (split[i]) out[split[i]] = split[i+1];
			}
			return out;
		},
		handleResponse: function(err, res, body) {
			const response = this.readResponse(body);
			if (!response.success || (response.success != "OK")) throw response.errmsg || "Server error - got no response.";
			if (this.done) this.done(response);
		},
		send: function(values, cb) {
			this.getChallenge((res) => {
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

module.exports = ljReq;
