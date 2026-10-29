import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
//#region lib/types/index.js
/**
* dsh-sounds host half: owns the user-facing `dsh-sounds` preferences
* (enabled / volume / which sound plays for which event) and serves the
* fenced `/sounds/api` JSON routes the browser half uses to read and merge
* those preferences. The browser half plays the actual audio — this half
* holds the persistence seam and nothing else, so the plugin stays a thin,
* safe surface: two POST methods, one trust fence, validated updates.
*
* DSH 0.2.x removed `settings.register(namespace, schema)`: plugin options
* are now plain loader-row Config schemas, appropriate for DEPLOYMENT
* options, not per-user preferences. The preferences here are user state,
* so they live in a small JSON document under the DSH home
* (`<DSH_HOME>/storages/plugin-data/dsh-sounds.json`) written atomically
* (temp file + rename). The wire contract with the browser half is
* unchanged: `settings.get` -> `{ value, revision }`, `settings.update`
* -> apply patch, bump revision, optional optimistic-concurrency check.
*
* Sound choices are names from the bundled opencode sound pack (45 files:
* alert-* / bip-bop-* / nope-* / staplebops-* / yup-*). The defaults mirror
* opencode's built-in "OpenCode Default" pack mapping:
*   done (agent turn completed)  -> bip-bop-01
*   error (turn failed)          -> nope-03
*   subagentDone (background)    -> yup-01
*   question (agent asks input)  -> bip-bop-03
*   permission (approval pending)-> staplebops-06
* @module dsh-sounds
*/
/** Stable Cordis plugin name (matches the loader row and the client bundle id). */
const name = "dsh-sounds";
/** Services required before mounting: the webserver routes and the Connection trust fence. */
const inject = ["webServer", "connection"];
/** Preference defaults (also the shape validation whitelist). */
const DEFAULTS = Object.freeze({
	enabled: true,
	volume: 0.4,
	done: "bip-bop-01",
	error: "nope-03",
	subagentDone: "yup-01",
	question: "bip-bop-03",
	permission: "staplebops-06"
});
/** Sound-name preference keys (each must be a non-empty string). */
const NAME_KEYS = ["done", "error", "subagentDone", "question", "permission"];
/** Structured plugin-route failure. */
var SoundsError = class extends Error {
	code;
	status;
	constructor(code, message, status = 400) {
		super(message);
		this.code = code;
		this.status = status;
	}
};
//#endregion
//#region lib/types/store.js
/**
* The preferences document path: `<DSH_HOME>/storages/plugin-data/dsh-sounds.json`.
* DSH_HOME wins when the host exports it; otherwise the conventional `~/.dsh`
* home (the same directory the host keeps `sessions/` and `storages/` in).
*/
function prefsPath() {
	const home = process.env.DSH_HOME !== undefined && process.env.DSH_HOME !== "" ? process.env.DSH_HOME : join(homedir(), ".dsh");
	return join(home, "storages", "plugin-data", "dsh-sounds.json");
}
/** Coerce one parsed document into { value, revision } with defaults filled in. */
function normalizeState(document) {
	const value = { ...DEFAULTS };
	let revision = 0;
	if (document !== null && typeof document === "object") {
		const candidate = document.value !== null && typeof document.value === "object" ? document.value : document;
		if (typeof candidate.enabled === "boolean") value.enabled = candidate.enabled;
		else if (candidate.enabled === "true" || candidate.enabled === "false") value.enabled = candidate.enabled === "true";
		const volume = typeof candidate.volume === "number" ? candidate.volume : Number(candidate.volume);
		if (Number.isFinite(volume)) value.volume = Math.min(1, Math.max(0, volume));
		for (const key of NAME_KEYS) {
			if (typeof candidate[key] === "string" && candidate[key] !== "") value[key] = candidate[key];
		}
		if (typeof document.revision === "number" && Number.isSafeInteger(document.revision) && document.revision >= 0) revision = document.revision;
	}
	return { value, revision };
}
/** Read the preferences document; missing or unreadable files yield defaults. */
function readState() {
	let raw;
	try {
		raw = readFileSync(prefsPath(), "utf8");
	} catch {
		return { value: { ...DEFAULTS }, revision: 0 };
	}
	try {
		return normalizeState(JSON.parse(raw));
	} catch {
		return { value: { ...DEFAULTS }, revision: 0 };
	}
}
/** Atomically persist the preferences document (temp file + rename). */
function writeState(state) {
	const target = prefsPath();
	mkdirSync(dirname(target), { recursive: true });
	const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
	writeFileSync(temp, `${JSON.stringify({ value: state.value, revision: state.revision }, null, 2)}\n`, "utf8");
	renameSync(temp, target);
}
/**
* Validate and fold a partial update into the current value.
* @returns the merged value (caller persists it).
*/
function mergePatch(current, patch) {
	if (patch === null || typeof patch !== "object" || Array.isArray(patch)) {
		throw new SoundsError("bad-request", "missing or invalid \"patch\"");
	}
	const next = { ...current };
	if ("enabled" in patch) {
		if (typeof patch.enabled !== "boolean") throw new SoundsError("bad-request", "\"enabled\" must be a boolean");
		next.enabled = patch.enabled;
	}
	if ("volume" in patch) {
		if (typeof patch.volume !== "number" || !Number.isFinite(patch.volume)) throw new SoundsError("bad-request", "\"volume\" must be a number");
		next.volume = Math.min(1, Math.max(0, patch.volume));
	}
	for (const key of NAME_KEYS) {
		if (!(key in patch)) continue;
		if (typeof patch[key] !== "string" || patch[key] === "") throw new SoundsError("bad-request", `"${key}" must be a non-empty string`);
		next[key] = patch[key];
	}
	return next;
}
//#endregion
//#region lib/types/http.js
/** Read and JSON-parse a request body (empty body parses as {}). */
function readJson(req) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		req.on("data", (chunk) => {
			chunks.push(chunk);
		});
		req.on("end", () => {
			try {
				resolve(chunks.length === 0 ? {} : JSON.parse(Buffer.concat(chunks).toString("utf8")));
			} catch {
				reject(new SoundsError("bad-request", "request body is not valid JSON"));
			}
		});
		req.on("error", reject);
	});
}
/** Write a JSON response with the given status. */
function writeJson(res, status, body) {
	const payload = JSON.stringify(body);
	res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
	res.end(payload);
}
/** Write the success envelope. */
function writeOk(res, value) {
	writeJson(res, 200, { ok: true, value: value.value, revision: value.revision });
}
/** Write the failure envelope for any thrown value (unknown → internal 500). */
function writeError(res, error) {
	if (error instanceof SoundsError) {
		writeJson(res, error.status, {
			ok: false,
			error: {
				code: error.code,
				message: error.message
			}
		});
		return;
	}
	writeJson(res, 500, {
		ok: false,
		error: {
			code: "internal",
			message: error instanceof Error ? error.message : String(error)
		}
	});
}
//#endregion
//#region lib/types/index.js (apply)
/**
* Plugin body: mount the fenced preferences routes.
* @param ctx - host plugin context (webServer, connection).
*/
function apply(ctx) {
	ctx.effect(() => ctx.webServer.register({
		kind: "prefix",
		path: "/sounds/api",
		handler: async (req, res) => {
			// Same browser-trust fence the core /api transport uses (DNS-rebinding
			// and cross-site defense): `undefined` means the request is trusted.
			const rejection = ctx.connection.requestRejection(req);
			if (rejection !== undefined) {
				res.statusCode = rejection;
				res.end();
				return;
			}
			if (req.method !== "POST") {
				writeJson(res, 405, {
					ok: false,
					error: {
						code: "method-not-allowed",
						message: "method not allowed"
					}
				});
				return;
			}
			let body;
			try {
				body = await readJson(req);
			} catch (error) {
				writeError(res, error);
				return;
			}
			const method = typeof body?.method === "string" ? body.method : "";
			try {
				switch (method) {
					case "settings.get":
						writeOk(res, readState());
						break;
					case "settings.update": {
						const state = readState();
						const expectedRevision = typeof body.expectedRevision === "number" ? body.expectedRevision : void 0;
						if (expectedRevision !== void 0 && expectedRevision !== state.revision) {
							throw new SoundsError("conflict", `revision ${state.revision} does not match expected ${expectedRevision}`, 409);
						}
						const next = { value: mergePatch(state.value, body.patch), revision: state.revision + 1 };
						writeState(next);
						writeOk(res, next);
						break;
					}
					default:
						throw new SoundsError("not-found", `unknown method ${JSON.stringify(method)}`, 404);
				}
			} catch (error) {
				writeError(res, error);
			}
		}
	}), "dsh-sounds: preferences routes");
}
//#endregion
export { apply, inject, name };
