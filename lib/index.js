import z from "schemastery";
import { settingsNamespace } from "@deepseek-ai/dsh-settings";
//#region lib/types/index.js
/**
* dsh-sounds host half: owns the user-facing `dsh-sounds` settings namespace
* (enabled / volume / which sound plays for which event) and serves the
* fenced `/sounds/api` JSON routes the browser half uses to read and merge
* those preferences. The browser half plays the actual audio — this half
* holds the settings seam and nothing else, so the plugin stays a thin,
* safe surface: two POST methods, loopback-trust fence, schema-validated
* updates.
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
const NS = "dsh-sounds";
/** Stable Cordis plugin name (matches the loader row and the client bundle id). */
const name = "dsh-sounds";
/** Services required before mounting: the webserver routes and the web runtime's trusted hosts. */
const inject = ["webServer", "webRuntime"];
/** Deployment-level plugin config: nothing today (sounds are user settings). */
const Config = z.object({});
/** User-facing preferences, validated by the settings service. */
const PrefsSchema = z.object({
	enabled: z.boolean().default(true),
	volume: z.number().step(0.05).min(0).max(1).default(0.4),
	done: z.string().default("bip-bop-01"),
	error: z.string().default("nope-03"),
	subagentDone: z.string().default("yup-01"),
	question: z.string().default("bip-bop-03"),
	permission: z.string().default("staplebops-06")
});
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
//#region lib/types/http.js
/** Narrow an unknown parsed JSON payload key to a string, else throw bad-request. */
function requireString(payload, key) {
	const value = payload?.[key];
	if (typeof value !== "string" || value === "") throw new SoundsError("bad-request", `missing or invalid "${key}"`);
	return value;
}
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
	writeJson(res, 200, { ok: true, value });
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
//#region lib/types/trust-fence.js
/**
* Decide whether one /sounds request may reach the plugin routes — the same
* browser-trust fence the core /api transport uses (DNS-rebinding and
* cross-site defense). Loopback hosts pass; remote deployments must be in
* the webserver's trustedHosts.
*/
function header(headers, headerName) {
	if (headers instanceof Headers) return headers.get(headerName) ?? void 0;
	const value = headers[headerName];
	return typeof value === "string" ? value : void 0;
}
function parseAuthority(authority) {
	try {
		return new URL(`http://${authority}`);
	} catch {
		return;
	}
}
function canonicalAuthority(entry, entryUrl) {
	const port = entryUrl.port !== "" ? entryUrl.port : new URL(`https://${entry}`).port;
	return port === "" ? entryUrl.hostname : `${entryUrl.hostname}:${port}`;
}
function isTrustedAuthority(hostUrl, trustedHosts) {
	return trustedHosts.some((entry) => {
		const entryUrl = parseAuthority(entry);
		if (entryUrl === void 0) return false;
		return canonicalAuthority(entry, entryUrl) === entryUrl.hostname ? entryUrl.hostname === hostUrl.hostname : entryUrl.host === hostUrl.host;
	});
}
function isLoopbackHostname(hostname) {
	if (hostname === "localhost" || hostname === "[::1]") return true;
	const parts = hostname.split(".");
	return parts.length === 4 && parts[0] === "127" && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}
function isTrustedApiRequest(request, trustedHosts) {
	const host = header(request.headers, "host");
	if (host === void 0) return false;
	const hostUrl = parseAuthority(host);
	if (hostUrl === void 0) return false;
	if (!isLoopbackHostname(hostUrl.hostname) && !isTrustedAuthority(hostUrl, trustedHosts)) return false;
	if (header(request.headers, "sec-fetch-site") === "cross-site") return false;
	const origin = header(request.headers, "origin");
	if (origin === void 0) return true;
	try {
		return new URL(origin).host === hostUrl.host;
	} catch {
		return false;
	}
}
//#endregion
//#region lib/types/index.js (apply)
/**
* Plugin body: register the settings namespace and mount the fenced routes.
* @param ctx - host plugin context (webServer, webRuntime).
* @param config - deployment-provided config (schema-validated by the Loader).
*/
function apply(ctx, config) {
	void config;
	let settingsFace = null;
	ctx.inject(["settings"], (sctx) => {
		const ns = settingsNamespace(NS);
		const scope = sctx.settings.register(ns, PrefsSchema);
		const viewOf = () => {
			const descriptor = sctx.settings.describe({ redactSecrets: true }).find((candidate) => candidate.ns === ns);
			return descriptor === void 0 ? {
				value: void 0,
				revision: void 0
			} : {
				value: descriptor.value,
				revision: descriptor.revision
			};
		};
		settingsFace = {
			get: viewOf,
			update: async (patch, expectedRevision) => {
				await sctx.settings.update(ns, patch, expectedRevision);
				return viewOf();
			}
		};
		void scope;
	});
	ctx.effect(() => ctx.webServer.register({
		kind: "prefix",
		path: "/sounds/api",
		handler: async (req, res) => {
			if (!isTrustedApiRequest(req, ctx.webRuntime.trustedHosts)) {
				writeJson(res, 403, {
					ok: false,
					error: {
						code: "forbidden",
						message: "forbidden"
					}
				});
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
					case "settings.get": {
						const face = settingsFace;
						writeOk(res, face === null ? { value: void 0, revision: void 0 } : face.get());
						break;
					}
					case "settings.update": {
						const face = settingsFace;
						if (face === null) throw new SoundsError("unavailable", "settings service unavailable", 503);
						const patch = body.patch;
						if (patch === null || typeof patch !== "object" || Array.isArray(patch)) throw new SoundsError("bad-request", "missing or invalid \"patch\"");
						const expectedRevision = typeof body.expectedRevision === "number" ? body.expectedRevision : void 0;
						writeOk(res, await face.update(patch, expectedRevision));
						break;
					}
					default:
						throw new SoundsError("not-found", `unknown method ${JSON.stringify(method)}`, 404);
				}
			} catch (error) {
				writeError(res, error);
			}
		}
	}), "dsh-sounds: settings routes");
}
//#endregion
export { Config, PrefsSchema, apply, inject, name };
