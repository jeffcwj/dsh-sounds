// Test harness for the dsh-sounds client bundle: stubs the module loader,
// DOM/Audio/fetch, and the sessions service, then drives the detection
// engine through realistic session-list and conversation-snapshot changes.
// Usage: node scripts/test-client.mjs  (run after scripts/build-client.mjs)
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bundleCode = readFileSync(join(root, "lib", "client.js"), "utf8");

// ---- stubs ----
let registered = null;
globalThis.window = {
  __ModuleLoader__: { load: (handoff) => { registered = handoff; } },
};
// document stub: capture gesture listeners so tests can unlock autoplay,
// plus the style-injection surface used by the settings section; hasFocus
// is controllable so notification tests can simulate background tabs
const docListeners = {};
let pageFocusedFlag = true;
globalThis.document = {
  addEventListener: (type, fn) => { docListeners[type] = fn; },
  removeEventListener: (type) => { delete docListeners[type]; },
  getElementById: () => null,
  createElement: (tag) => ({ tagName: tag, style: {}, setAttribute() {}, textContent: "" }),
  head: { appendChild: () => {} },
  hasFocus: () => pageFocusedFlag,
};

// Notification stub: records created toasts; permission controllable
const notifications = [];
class NotificationStub {
  constructor(title, opts) {
    notifications.push({ title, body: opts?.body, tag: opts?.tag });
  }
  close() {}
}
NotificationStub.permission = "granted";
NotificationStub.requestPermission = async () => { NotificationStub.permission = "granted"; return "granted"; };
globalThis.Notification = NotificationStub;

const played = [];
globalThis.Audio = class {
  constructor(src) { this.src = src; this.volume = 1; }
  play() { played.push({ src: this.src, volume: this.volume }); return Promise.resolve(); }
};

// fetch stub: settings.get returns the configured value (default: rejected -> fallback defaults)
let settingsGetValue = Symbol("reject");
globalThis.fetch = (url, init) => {
  const body = JSON.parse(init.body);
  if (body.method === "settings.get") {
    if (settingsGetValue === Symbol("reject")) return Promise.reject(new Error("offline"));
    return Promise.resolve({ json: () => Promise.resolve({ ok: true, value: settingsGetValue }) });
  }
  if (body.method === "settings.update") {
    settingsGetValue = { ...(settingsGetValue === Symbol("reject") ? {} : settingsGetValue), ...body.patch };
    return Promise.resolve({ json: () => Promise.resolve({ ok: true, value: settingsGetValue }) });
  }
  return Promise.reject(new Error("unknown method"));
};

// localStorage stub: persists per-event switches across re-activations
const lsStore = {};
globalThis.localStorage = {
  getItem: (key) => (key in lsStore ? lsStore[key] : null),
  setItem: (key, value) => { lsStore[key] = String(value); },
  removeItem: (key) => { delete lsStore[key]; },
};

// expected data URIs built from the bundled assets (exact-match identity)
const expectedUris = {};
for (const file of readdirSync(join(root, "assets")).filter((n) => n.endsWith(".mp3"))) {
  expectedUris[file.replace(/\.mp3$/, "")] = "data:audio/mpeg;base64," + readFileSync(join(root, "assets", file)).toString("base64");
}

// ---- load the bundle through the real registration path ----
// The factory now requires platform seed modules; stub them with minimal
// stand-ins (the settings UI component never renders in this harness).
const fakeReact = {
  createElement: () => ({}),
  useState: (init) => [typeof init === "function" ? init() : init, () => {}],
  useEffect: () => {},
};
const fakeUiPrimitives = { Menu: () => null, Button: () => null };
eval(bundleCode); // executes window.__ModuleLoader__.load(...)
assert.ok(registered, "bundle must register via __ModuleLoader__.load");
const entry = registered.factory((spec) => {
  if (spec === "react") return fakeReact;
  if (spec === "@deepseek-ai/dsh-client-ui-primitives") return fakeUiPrimitives;
  throw new Error(`unexpected require("${spec}")`);
});
assert.equal(entry.name, "dsh-sounds");
assert.deepEqual(entry.inject, ["sessions", "slots"]);
assert.equal(typeof entry.apply, "function");

// ---- fake sessions service ----
let listState = { ids: [], byId: {}, current: undefined, phase: "ready", subagentsByParent: {}, jobsBySession: {} };
const listListeners = new Set();
const sessionListeners = new Map(); // id -> Set<fn>
const sessionSnapshots = new Map(); // id -> snapshot
const bindings = new Map();

function makeSession(id) {
  const listeners = new Set();
  sessionListeners.set(id, listeners);
  const session = {
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    getSnapshot: () => sessionSnapshots.get(id),
  };
  bindings.set(id, { sessionId: id, session, ctx: null });
  return session;
}
const sessions = {
  list: {
    getSnapshot: () => listState,
    subscribe: (fn) => { listListeners.add(fn); return () => listListeners.delete(fn); },
  },
  binding: (id) => bindings.get(id),
};
function makeCtx() {
  return {
    sessions,
    slots: {
      inject: (name, fn) => { const disposer = fn(); return typeof disposer === "function" ? disposer : () => {}; },
      register: () => () => {},
    },
    effect: (fn) => { const cleanup = fn(); if (typeof cleanup === "function") ctxCleanups.push(cleanup); },
  };
}
const ctxCleanups = [];
/** Dispose every live apply instance (simulates HMR fiber teardown). */
function disposeAll() { while (ctxCleanups.length > 0) { const cleanup = ctxCleanups.shift(); cleanup(); } }
const ctx = makeCtx();
entry.apply(ctx);

// helper: emit a list-store change
function bumpList() { for (const fn of [...listListeners]) fn(); }
function bumpSession(id) { for (const fn of [...sessionListeners.get(id) ?? []]) fn(); }
function setSession(id, { running = false, pendingInteraction }, snapshot = { chat: { timeline: { turns: new Map() } } }) {
  makeSession(id);
  sessionSnapshots.set(id, snapshot);
  listState = {
    ...listState,
    ids: [...new Set([...listState.ids, id])],
    byId: { ...listState.byId, [id]: { id, running, pendingInteraction } },
  };
}
function turnEnd(reasonKind, seq, turn) {
  return {
    status: "closed",
    start: { data: { turn } },
    end: { seq, data: { reason: { kind: reasonKind } } },
  };
}
function snapshotWith(turns) {
  return { chat: { timeline: { turns: new Map(turns.map((t, i) => [i + 1, t])) } } };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 25));

// ---- scenario 1: prefs fallback + historical turns are silent ----
{
  makeSession("s1");
  // Session is current and already contains a completed turn BEFORE apply's first sweep:
  // s1 finishes later; the existing closed turn must NOT play.
  listState = { ...listState, current: "s1", ids: ["s1"], byId: { s1: { id: "s1", running: false } } };
  sessionSnapshots.set("s1", snapshotWith([turnEnd("completed", 10, 1)]));
  await settle(); // let apply's effect + prefs load settle
  assert.equal(played.length, 0, "historical closed turns must stay silent");
}

// ---- scenario 2: current session turn completes -> bip-bop-01 (deferred until unlock) ----
{
  // s1 starts running (no sound on start)
  listState = { ...listState, byId: { s1: { id: "s1", running: true } } };
  bumpList();
  await settle();
  assert.equal(played.length, 0, "turn start must not play");
  // turn finishes: new closed turn (seq 20) + running flip
  sessionSnapshots.set("s1", snapshotWith([turnEnd("completed", 10, 1), turnEnd("completed", 20, 2)]));
  bumpSession("s1");
  listState = { ...listState, byId: { s1: { id: "s1", running: false } } };
  bumpList();
  await settle();
  assert.equal(played.length, 0, "autoplay-locked playback must be deferred, not played");
  console.log("  [ok] completed turn queued while autoplay locked");
}

// ---- scenario 3: first user gesture unlocks and replays the pending sound ----
{
  docListeners.pointerdown();
  await settle();
  assert.equal(played.length, 1, "unlock must replay exactly the pending sound");
  assert.equal(played[0].src, expectedUris["bip-bop-01"], "done must use bip-bop-01");
  console.log("  [ok] gesture unlocked pending sound (embedded audio)");
}

// ---- scenario 4: current session turn fails -> nope-03 ----
{
  sessionSnapshots.set("s1", snapshotWith([
    turnEnd("completed", 10, 1), turnEnd("completed", 20, 2), turnEnd("error", 30, 3),
  ]));
  bumpSession("s1");
  listState = { ...listState, byId: { s1: { id: "s1", running: false } } };
  bumpList();
  await settle();
  assert.equal(played.length, 2, "error turn must play");
  assert.equal(played[1].src, expectedUris["nope-03"], "error must use nope-03");
  console.log("  [ok] error turn -> nope-03");
}

// ---- scenario 5: max-tokens -> error sound, aborted/blocked -> silent ----
{
  const before = played.length;
  sessionSnapshots.set("s1", snapshotWith([
    turnEnd("completed", 10, 1), turnEnd("completed", 20, 2), turnEnd("error", 30, 3),
    turnEnd("max-tokens", 40, 4), turnEnd("aborted", 50, 5), turnEnd("blocked", 60, 6),
  ]));
  bumpSession("s1");
  await settle();
  assert.equal(played.length, before + 1, "max-tokens plays once; aborted/blocked stay silent");
  assert.equal(played[before].src, expectedUris["nope-03"], "max-tokens must map to the error sound");
  console.log("  [ok] max-tokens -> error sound; aborted/blocked silent");
}

// ---- scenario 6: background session finishes -> yup-01 ----
{
  setSession("s2", { running: true });
  bumpList();
  await settle();
  const before = played.length;
  listState = { ...listState, byId: { ...listState.byId, s2: { id: "s2", running: false } } };
  bumpList();
  await settle();
  assert.equal(played.length, before + 1, "background finish must play subagentDone");
  assert.equal(played[before].src, expectedUris["yup-01"], "subagentDone must use yup-01");
  console.log("  [ok] background finish -> yup-01");
}

// ---- scenario 7: pending interaction (agent asks input) -> bip-bop-03 ----
{
  const before = played.length;
  listState = { ...listState, byId: { ...listState.byId, s1: { id: "s1", running: false, pendingInteraction: "question" } } };
  bumpList();
  await settle();
  assert.equal(played.length, before + 1, "pending interaction must play question sound");
  assert.equal(played[before].src, expectedUris["bip-bop-03"], "question must use bip-bop-03");
  console.log("  [ok] pending interaction (question) -> bip-bop-03");
}

// ---- scenario 9: approval pending -> staplebops-06 (permission) ----
{
  // clear the previous pending state first (a fresh transition is required)
  listState = { ...listState, byId: { ...listState.byId, s1: { id: "s1", running: false } } };
  bumpList();
  const before = played.length;
  listState = { ...listState, byId: { ...listState.byId, s1: { id: "s1", running: false, pendingInteraction: "approval" } } };
  bumpList();
  await settle();
  assert.equal(played.length, before + 1, "approval pending must play permission sound");
  assert.equal(played[before].src, expectedUris["staplebops-06"], "approval must use staplebops-06");
  console.log("  [ok] pending interaction (approval) -> staplebops-06");
}

// ---- scenario 10: plan-review pending -> question sound ----
{
  listState = { ...listState, byId: { ...listState.byId, s1: { id: "s1", running: false } } };
  bumpList();
  const before = played.length;
  listState = { ...listState, byId: { ...listState.byId, s1: { id: "s1", running: false, pendingInteraction: "plan-review" } } };
  bumpList();
  await settle();
  assert.equal(played.length, before + 1, "plan-review pending must play question sound");
  assert.equal(played[before].src, expectedUris["bip-bop-03"], "plan-review must use bip-bop-03");
  console.log("  [ok] pending interaction (plan-review) -> bip-bop-03");
}

// ---- scenario 8: disabled via settings + console hook ----
{
  settingsGetValue = { enabled: false, volume: 0.5 };
  played.length = 0;
  // Simulate re-activation like HMR would: dispose the old fiber, apply fresh
  disposeAll();
  entry.apply(makeCtx());
  await settle();
  listState = { ...listState, byId: { ...listState.byId, s2: { id: "s2", running: false } } };
  bumpList();
  await settle();
  assert.equal(played.length, 0, "disabled prefs must silence everything");
  console.log("  [ok] disabled via settings -> silent");
  // console hook exists, can persist a patch, and plays by name after re-enable
  assert.equal(typeof globalThis.window.__dshSounds, "object");
  await globalThis.window.__dshSounds.setPrefs({ enabled: true });
  globalThis.window.__dshSounds.playName("yup-01");
  assert.ok(played.length >= 1, "console hook must play by name after re-enable");
  assert.equal(played[played.length - 1].src, expectedUris["yup-01"]);
  console.log("  [ok] window.__dshSounds hook works (setPrefs + playName)");
}

// ---- scenario 11: preview ignores the enabled switch ----
{
  settingsGetValue = { enabled: false, volume: 0.5, done: "yup-01" };
  await globalThis.window.__dshSounds.setPrefs({ enabled: false });
  played.length = 0;
  globalThis.window.__dshSounds.preview("alert-01");
  assert.equal(played.length, 1, "preview must play even while disabled");
  assert.equal(played[0].src, expectedUris["alert-01"], "preview plays the named sound");
  globalThis.window.__dshSounds.play("done");
  assert.equal(played.length, 1, "event play stays silent while disabled");
  console.log("  [ok] preview bypasses enabled; event plays respect it");
}

// ---- scenario 12: per-event switch off -> that event silent, others play ----
{
  await globalThis.window.__dshSounds.setPrefs({ enabled: true });
  const h = globalThis.window.__dshSounds;
  h.setEvent("error", false);
  // persisted to localStorage
  const stored = JSON.parse(globalThis.localStorage.getItem("dsh-sounds.events"));
  assert.equal(stored.error, false, "switch must persist to localStorage");
  assert.equal(h.events().error, false, "hook reports the switch off");
  // an error turn ends -> silent
  const before = played.length;
  sessionSnapshots.set("s1", snapshotWith([
    turnEnd("completed", 10, 1), turnEnd("completed", 20, 2), turnEnd("error", 30, 3),
    turnEnd("max-tokens", 40, 4), turnEnd("aborted", 50, 5), turnEnd("blocked", 60, 6),
    turnEnd("error", 70, 7),
  ]));
  bumpSession("s1");
  await settle();
  assert.equal(played.length, before, "error event disabled -> error turn silent");
  // a completed turn still plays
  sessionSnapshots.set("s1", snapshotWith([
    turnEnd("completed", 10, 1), turnEnd("completed", 20, 2), turnEnd("error", 30, 3),
    turnEnd("max-tokens", 40, 4), turnEnd("aborted", 50, 5), turnEnd("blocked", 60, 6),
    turnEnd("error", 70, 7), turnEnd("completed", 80, 8),
  ]));
  bumpSession("s1");
  await settle();
  assert.equal(played.length, before + 1, "done still plays while error is off");
  assert.equal(played[before].src, expectedUris["yup-01"], "done uses its configured sound");
  h.setEvent("error", true);
  console.log("  [ok] per-event switch gates only its own event");
}

// ---- scenario 13: switches survive re-activation (page reload equivalent) ----
{
  const h = globalThis.window.__dshSounds;
  h.setEvent("subagentDone", false);
  played.length = 0;
  // re-activate like a fresh page (dispose the old fiber, new ctx, same module state)
  disposeAll();
  entry.apply(makeCtx());
  await settle();
  // a background session finishes -> silent (switch still off)
  setSession("s3", { running: true });
  bumpList();
  await settle();
  listState = { ...listState, byId: { ...listState.byId, s3: { id: "s3", running: false } } };
  bumpList();
  await settle();
  assert.equal(played.length, 0, "persisted subagentDone switch stays off across re-activation");
  assert.equal(JSON.parse(globalThis.localStorage.getItem("dsh-sounds.events")).subagentDone, false,
    "localStorage still carries the switch");
  // restore for hygiene
  h.setEvent("subagentDone", true);
  console.log("  [ok] switches persist across re-activation");
}

// ---- scenario 14: background tab + completed turn -> system notification ----
{
  pageFocusedFlag = false; // simulate the tab in the background
  const before = notifications.length;
  sessionSnapshots.set("s1", snapshotWith([
    turnEnd("completed", 10, 1), turnEnd("completed", 20, 2), turnEnd("error", 30, 3),
    turnEnd("max-tokens", 40, 4), turnEnd("aborted", 50, 5), turnEnd("blocked", 60, 6),
    turnEnd("error", 70, 7), turnEnd("completed", 80, 8), turnEnd("completed", 90, 9),
  ]));
  bumpSession("s1");
  await settle();
  assert.equal(notifications.length, before + 1, "background tab must fire a notification");
  assert.equal(notifications[before].title, "任务完成", "notification title matches the event");
  assert.ok(notifications[before].body.length > 0, "notification carries a body");
  assert.ok(notifications[before].tag.includes("done"), "notification tagged per event");
  pageFocusedFlag = true;
  console.log("  [ok] background tab + completed -> system notification");
}

// ---- scenario 15: focused page -> no notification ----
{
  const before = notifications.length;
  sessionSnapshots.set("s1", snapshotWith([
    turnEnd("completed", 10, 1), turnEnd("completed", 20, 2), turnEnd("error", 30, 3),
    turnEnd("max-tokens", 40, 4), turnEnd("aborted", 50, 5), turnEnd("blocked", 60, 6),
    turnEnd("error", 70, 7), turnEnd("completed", 80, 8), turnEnd("completed", 90, 9),
    turnEnd("completed", 100, 10),
  ]));
  bumpSession("s1");
  await settle();
  assert.equal(notifications.length, before, "focused page must stay silent");
  console.log("  [ok] focused page -> no notification");
}

// ---- scenario 16: per-event notify switch off -> that event silent ----
{
  const h = globalThis.window.__dshSounds;
  h.setNotification("question", false);
  pageFocusedFlag = false;
  // clear pending, then a fresh question arrives
  listState = { ...listState, byId: { ...listState.byId, s1: { id: "s1", running: false } } };
  bumpList();
  const before = notifications.length;
  listState = { ...listState, byId: { ...listState.byId, s1: { id: "s1", running: false, pendingInteraction: "question" } } };
  bumpList();
  await settle();
  assert.equal(notifications.length, before, "question notify switch off -> no notification");
  h.setNotification("question", true);
  // master switch off silences everything
  h.setNotification("enabled", false);
  const before2 = notifications.length;
  sessionSnapshots.set("s1", snapshotWith([
    turnEnd("completed", 10, 1), turnEnd("completed", 20, 2), turnEnd("error", 30, 3),
    turnEnd("max-tokens", 40, 4), turnEnd("aborted", 50, 5), turnEnd("blocked", 60, 6),
    turnEnd("error", 70, 7), turnEnd("completed", 80, 8), turnEnd("completed", 90, 9),
    turnEnd("completed", 100, 10), turnEnd("completed", 110, 11),
  ]));
  bumpSession("s1");
  await settle();
  assert.equal(notifications.length, before2, "master notify switch off -> no notification");
  h.setNotification("enabled", true);
  pageFocusedFlag = true;
  console.log("  [ok] notify switches gate notifications independently");
}

// ---- scenario 17: denied permission + persistence across re-activation ----
{
  NotificationStub.permission = "denied";
  pageFocusedFlag = false;
  const before = notifications.length;
  sessionSnapshots.set("s1", snapshotWith([
    turnEnd("completed", 10, 1), turnEnd("completed", 20, 2), turnEnd("error", 30, 3),
    turnEnd("max-tokens", 40, 4), turnEnd("aborted", 50, 5), turnEnd("blocked", 60, 6),
    turnEnd("error", 70, 7), turnEnd("completed", 80, 8), turnEnd("completed", 90, 9),
    turnEnd("completed", 100, 10), turnEnd("completed", 110, 11), turnEnd("completed", 120, 12),
  ]));
  bumpSession("s1");
  await settle();
  assert.equal(notifications.length, before, "denied permission -> no notification");
  NotificationStub.permission = "granted";
  pageFocusedFlag = true;
  // persistence: a notify switch survives re-activation (fresh page equivalent)
  const h = globalThis.window.__dshSounds;
  h.setNotification("subagentDone", false);
  assert.equal(JSON.parse(globalThis.localStorage.getItem("dsh-sounds.notifications")).subagentDone, false,
    "notify switch persists to localStorage");
  disposeAll();
  entry.apply(makeCtx());
  await settle();
  assert.equal(globalThis.window.__dshSounds.notifications().subagentDone, false,
    "notify switch survives re-activation");
  h.setNotification("subagentDone", true);
  console.log("  [ok] denied permission silent; switches persist across re-activation");
}

console.log("ALL CLIENT TESTS PASSED");
process.exit(0);
