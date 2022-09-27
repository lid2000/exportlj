export default function (params) {
	// the sqlite library requires an object with placeholders preceeded with colons, so this creates one.
	const out = {};
	for (let z in params) {
		out[":" + z] = params[z];
	}
	return out;
}
