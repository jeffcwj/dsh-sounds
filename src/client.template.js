// dsh-sounds client bundle — built by scripts/build-client.mjs from this
// template. Do not edit lib/client.js directly; edit src/client.template.js
// and re-run the build script.
//
// Module-loader format (the shell's ClientModuleSystem): executing this
// script only REGISTERS the factory; materialization runs factory(require)
// and the returned exports must be a Cordis plugin entry { name, inject,
// apply }. The bundle consumes only platform seed modules (react,
// @deepseek-ai/dsh-client-ui-primitives) through require and plays audio
// through plain DOM APIs; preferences ride the plugin's own fenced
// /sounds/api routes.
//
// Sound assets are opencode's full built-in sound pack (45 files:
// alert-01..10, bip-bop-01..10, nope-01..12, staplebops-01..07, yup-01..06 —
// MIT, https://github.com/anomalyco/opencode, packages/ui/src/assets/audio),
// embedded as base64 data URIs so no extra routes are needed. Default event
// mapping mirrors opencode's built-in "OpenCode Default" pack:
//   done (agent turn completed)     -> bip-bop-01
//   error (turn failed / max-tokens)-> nope-03
//   subagentDone (background done)  -> yup-01
//   question (agent waits for input)-> bip-bop-03
//   permission (approval pending)   -> staplebops-06
// A "声音" section in the DSH Settings panel lets the user pick a sound for
// each event (with per-row preview), adjust volume, and reset to defaults.
window.__ModuleLoader__.load({
  id: "dsh-sounds",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    // Platform seed modules (the shell's frozen module table).
    var React = require("react");
    var UiPrimitives = require("@deepseek-ai/dsh-client-ui-primitives");

    //#region sounds (embedded opencode sound pack)
    /** name -> data URI (injected at build time). */
    var SOUNDS = __SOUNDS_JSON__;
    /** Sound groups (opencode pack families), for the settings menu. */
    var SOUND_GROUPS = [
      { name: "alert", prefix: "alert-" },
      { name: "bip-bop", prefix: "bip-bop-" },
      { name: "nope", prefix: "nope-" },
      { name: "staplebops", prefix: "staplebops-" },
      { name: "yup", prefix: "yup-" }
    ];
    /** Preference defaults; the host settings namespace carries the same values. */
    var DEFAULTS = {
      enabled: true,
      volume: 0.4,
      done: "bip-bop-01",
      error: "nope-03",
      subagentDone: "yup-01",
      question: "bip-bop-03",
      permission: "staplebops-06"
    };
    /** Event rows shown in the settings panel (key -> labels + default). */
    var EVENTS = [
      { key: "done", title: "任务完成", desc: "当前会话的一个回合正常完成", def: "bip-bop-01" },
      { key: "error", title: "任务失败", desc: "回合出错,或达到输出 token 上限", def: "nope-03" },
      { key: "subagentDone", title: "子代理完成", desc: "后台子代理会话结束", def: "yup-01" },
      { key: "question", title: "请求输入", desc: "代理等待你回答问题或选择", def: "bip-bop-03" },
      { key: "permission", title: "权限请求", desc: "代理请求文件或命令权限", def: "staplebops-06" }
    ];
    /** Per-event enable switches (all on by default). */
    var EVENTS_DEFAULT = {
      done: true,
      error: true,
      subagentDone: true,
      question: true,
      permission: true
    };
    /**
    * Per-event switches live in localStorage, NOT in the host settings
    * namespace: the client bundle can then ship switch changes without a
    * host restart (a settings-schema change would require one). The
    * switches render in the settings UI and reset with "恢复默认".
    */
    function loadEventSwitches() {
      var out = Object.assign({}, EVENTS_DEFAULT);
      try {
        if (typeof localStorage === "undefined") return out;
        var raw = localStorage.getItem("dsh-sounds.events");
        if (raw === null) return out;
        var parsed = JSON.parse(raw);
        if (parsed === null || typeof parsed !== "object") return out;
        for (var key in EVENTS_DEFAULT) {
          if (typeof parsed[key] === "boolean") out[key] = parsed[key];
        }
      } catch (error) {
        // Corrupt storage falls back to the defaults.
      }
      return out;
    }
    function saveEventSwitches() {
      try {
        if (typeof localStorage === "undefined") return;
        localStorage.setItem("dsh-sounds.events", JSON.stringify(eventSwitches));
      } catch (error) {
        // Storage can be unavailable (private mode); the session still works.
      }
    }
    var eventSwitches = loadEventSwitches();
    function eventEnabled(kind) {
      return eventSwitches[kind] !== false;
    }
    function setEventEnabled(kind, next) {
      eventSwitches[kind] = next;
      saveEventSwitches();
    }
    function resetEventSwitches() {
      eventSwitches = Object.assign({}, EVENTS_DEFAULT);
      saveEventSwitches();
    }

    //#region notifications
    /**
    * System notifications (Windows notification center via the browser
    * Notification API), mirroring opencode's attention semantics: notify
    * only while the page is NOT focused. Switches live in localStorage
    * (`dsh-sounds.notifications`) like the sound switches, so they ship
    * without a host restart.
    */
    var NOTIFY_DEFAULT = {
      enabled: true,
      done: true,
      error: true,
      subagentDone: true,
      question: true,
      permission: true
    };
    /** Event notification copy (title/body of the system toast). */
    var EVENT_META = {
      done: { title: "任务完成", body: "当前会话的回合已完成" },
      error: { title: "任务失败", body: "回合出错或达到输出上限" },
      subagentDone: { title: "子代理完成", body: "后台子代理会话已结束" },
      question: { title: "请求输入", body: "代理正在等待你的输入" },
      permission: { title: "权限请求", body: "代理正在请求权限" }
    };
    function loadNotifySwitches() {
      var out = Object.assign({}, NOTIFY_DEFAULT);
      try {
        if (typeof localStorage === "undefined") return out;
        var raw = localStorage.getItem("dsh-sounds.notifications");
        if (raw === null) return out;
        var parsed = JSON.parse(raw);
        if (parsed === null || typeof parsed !== "object") return out;
        for (var key in NOTIFY_DEFAULT) {
          if (typeof parsed[key] === "boolean") out[key] = parsed[key];
        }
      } catch (error) {
        // Corrupt storage falls back to the defaults.
      }
      return out;
    }
    function saveNotifySwitches() {
      try {
        if (typeof localStorage === "undefined") return;
        localStorage.setItem("dsh-sounds.notifications", JSON.stringify(notifySwitches));
      } catch (error) {
        // Storage can be unavailable (private mode); notifications stay off.
      }
    }
    var notifySwitches = loadNotifySwitches();
    function notifyEnabled(kind) {
      return notifySwitches.enabled !== false && notifySwitches[kind] !== false;
    }
    function setNotifySwitch(key, next) {
      notifySwitches[key] = next;
      saveNotifySwitches();
    }
    function resetNotifySwitches() {
      notifySwitches = Object.assign({}, NOTIFY_DEFAULT);
      saveNotifySwitches();
    }
    /** Whether the browser exposes the Notification API. */
    function notificationSupported() {
      return typeof Notification !== "undefined";
    }
    /** Current permission state: "granted" | "denied" | "default" | "unsupported". */
    function notifyPermission() {
      if (!notificationSupported()) return "unsupported";
      return Notification.permission;
    }
    /** Ask for permission (must be called from a user gesture). */
    function requestNotifyPermission() {
      if (!notificationSupported()) return Promise.resolve("unsupported");
      if (Notification.permission !== "default") return Promise.resolve(Notification.permission);
      return Notification.requestPermission();
    }
    /** Whether the page currently owns focus (focused pages get no toasts). */
    function pageFocused() {
      if (typeof document === "undefined") return true;
      if (typeof document.hasFocus === "function") return document.hasFocus();
      return true;
    }
    /** Fire one system notification for an event kind (focused/off/denied => no-op). */
    function notify(kind, title, body) {
      if (!notifyEnabled(kind)) return;
      if (!notificationSupported()) return;
      if (Notification.permission !== "granted") return;
      if (pageFocused()) return;
      try {
        var toast = new Notification(title, {
          body: body,
          tag: "dsh-sounds-" + kind,
          silent: false
        });
        toast.onclick = function () {
          try {
            window.focus();
            toast.close();
          } catch (error) {
            // Ignore focus failures.
          }
        };
        // Auto-dismiss so stale toasts never pile up in the center.
        setTimeout(function () {
          try { toast.close(); } catch (error) { /* already gone */ }
        }, 10000);
      } catch (error) {
        // A throwing Notification must never break the event pipeline.
      }
    }
    /** Notify for one event kind using the built-in copy. */
    function notifyEvent(kind) {
      var meta = EVENT_META[kind];
      if (meta === void 0) return;
      notify(kind, meta.title, meta.body);
    }
    //#endregion
    /** Validate one raw settings value into well-formed prefs (defaults fill gaps). */
    function parsePrefs(value) {
      var out = {};
      for (var key in DEFAULTS) {
        var item = value === null || typeof value !== "object" ? void 0 : value[key];
        if (key === "enabled") out[key] = typeof item === "boolean" ? item : DEFAULTS[key];
        else if (key === "volume") out[key] = typeof item === "number" && Number.isFinite(item) ? Math.min(1, Math.max(0, item)) : DEFAULTS[key];
        else out[key] = typeof item === "string" && SOUNDS[item] !== void 0 ? item : DEFAULTS[key];
      }
      return out;
    }
    /** Menu entries for the sound picker: grouped by pack family. */
    function soundMenuItems(selected) {
      var items = [];
      for (var g = 0; g < SOUND_GROUPS.length; g++) {
        var group = SOUND_GROUPS[g];
        if (items.length > 0) items.push({ type: "separator", id: "sep-" + group.name });
        items.push({ type: "label", id: "lbl-" + group.name, text: group.name });
        var names = Object.keys(SOUNDS).filter(function (n) { return n.indexOf(group.prefix) === 0; }).sort();
        for (var i = 0; i < names.length; i++) items.push({ id: names[i], label: names[i] });
      }
      void selected;
      return items;
    }
    //#endregion

    //#region audio
    var prefs = Object.assign({}, DEFAULTS);
    var locked = true;
    var pendingSound = null;
    /** First user gesture unlocks autoplay (browsers gate audio until then). */
    function unlock() {
      if (!locked) return;
      locked = false;
      if (typeof document !== "undefined") {
        document.removeEventListener("pointerdown", unlock, true);
        document.removeEventListener("keydown", unlock, true);
      }
      var pending = pendingSound;
      pendingSound = null;
      if (pending !== null) playName(pending.name, pending.volume);
    }
    function ensureUnlockListener() {
      if (typeof document === "undefined") return;
      document.addEventListener("pointerdown", unlock, true);
      document.addEventListener("keydown", unlock, true);
    }
    /** Play one embedded sound by name; volume clamped to [0,1]. */
    function playName(name, volume) {
      if (!prefs.enabled) return;
      var src = SOUNDS[name];
      if (src === void 0) return;
      var vol = typeof volume === "number" ? Math.min(1, Math.max(0, volume)) : prefs.volume;
      if (typeof Audio === "undefined") return;
      if (locked) {
        // Autoplay-gated: queue the most recent sound for the first gesture.
        pendingSound = { name: name, volume: vol };
        return;
      }
      try {
        var audio = new Audio(src);
        audio.volume = vol;
        var played = audio.play();
        if (played !== void 0 && typeof played.catch === "function") played.catch(function () {});
      } catch (error) {
        // Never let a playback failure break the UI.
      }
    }
    /** Preview one sound from the settings panel: plays regardless of the
    *  enabled switch (the user is auditioning choices), at the current volume. */
    function previewName(name) {
      var src = SOUNDS[name];
      if (src === void 0) return;
      if (typeof Audio === "undefined") return;
      try {
        var audio = new Audio(src);
        audio.volume = prefs.volume;
        var played = audio.play();
        if (played !== void 0 && typeof played.catch === "function") played.catch(function () {});
      } catch (error) {
        // Ignore preview failures (autoplay policy can reject until a gesture).
      }
    }
    /** Play the sound configured for one event kind (honors the per-event switch). */
    function playKind(kind) {
      if (!eventEnabled(kind)) return;
      var name = prefs[kind];
      if (typeof name === "string") playName(name, prefs.volume);
    }
    //#endregion

    //#region prefs wire
    /** POST one /sounds/api method (the plugin's fenced settings route). */
    function callSoundsApi(method, payload) {
      if (typeof fetch === "undefined") return Promise.reject(new Error("fetch unavailable"));
      return fetch("/sounds/api", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(Object.assign({ method: method }, payload))
      }).then(function (response) {
        return response.json();
      }).then(function (json) {
        if (json === null || typeof json !== "object" || json.ok !== true) {
          throw new Error("sounds api rejected " + method);
        }
        return json;
      });
    }
    /** Load prefs with a hard timeout; any failure falls back to defaults. */
    function loadPrefs(callback) {
      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        callback(parsePrefs(void 0));
      }, 2000);
      callSoundsApi("settings.get", {}).then(function (json) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        callback(parsePrefs(json.value));
      }).catch(function () {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        callback(parsePrefs(void 0));
      });
    }
    /** Merge a patch through the host settings namespace and adopt the result. */
    function setPrefs(patch) {
      return callSoundsApi("settings.update", { patch: patch }).then(function (json) {
        prefs = parsePrefs(json.value);
        return prefs;
      });
    }
    //#endregion

    //#region settings UI
    /** Inject the settings-section styles once (module-system-claimed <style>). */
    function ensureSettingsStyles() {
      if (typeof document === "undefined") return;
      if (document.getElementById("dsh-sounds-styles") !== null) return;
      var style = document.createElement("style");
      style.id = "dsh-sounds-styles";
      style.textContent = [
        ".dsh-sounds-section{display:flex;flex-direction:column;gap:16px;padding:2px 0 16px}",
        ".dsh-sounds-intro{font-size:13px;line-height:1.6;color:var(--dsw-alias-label-secondary);margin:0}",
        ".dsh-sounds-group{display:flex;flex-direction:column;gap:2px}",
        ".dsh-sounds-group-heading{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary);margin:0 0 4px}",
        ".dsh-sounds-row{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:10px 2px;border-bottom:1px solid var(--dsw-alias-border-l1)}",
        ".dsh-sounds-row:last-child{border-bottom:none}",
        ".dsh-sounds-row-text{display:flex;flex-direction:column;gap:2px;min-width:0}",
        ".dsh-sounds-title{font-size:13px;color:var(--dsw-alias-label-primary)}",
        ".dsh-sounds-desc{font-size:12px;color:var(--dsw-alias-label-tertiary)}",
        ".dsh-sounds-control{display:flex;align-items:center;gap:8px;flex-shrink:0}",
        ".dsh-sounds-switch{position:relative;display:inline-flex;width:36px;height:20px;flex-shrink:0}",
        ".dsh-sounds-switch input{position:absolute;opacity:0;width:100%;height:100%;margin:0;cursor:pointer}",
        ".dsh-sounds-switch-track{position:absolute;inset:0;border-radius:999px;background:var(--dsw-alias-bg-layer-3);border:1px solid var(--dsw-alias-border-l2);transition:background .15s}",
        ".dsh-sounds-switch-thumb{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:var(--dsw-alias-label-secondary);transition:transform .15s}",
        ".dsh-sounds-switch input:checked ~ .dsh-sounds-switch-track{background:var(--dsw-alias-button-primary-fill);border-color:var(--dsw-alias-button-primary-fill)}",
        ".dsh-sounds-switch input:checked ~ .dsh-sounds-switch-track .dsh-sounds-switch-thumb{transform:translateX(16px);background:var(--dsw-alias-bg-layer-3)}",
        ".dsh-sounds-switch input:focus-visible ~ .dsh-sounds-switch-track{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}",
        ".dsh-sounds-picker{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:5px 10px;cursor:pointer;white-space:nowrap}",
        ".dsh-sounds-preview{font-size:12px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:5px 10px;cursor:pointer}",
        ".dsh-sounds-reset{font-size:12px;color:var(--dsw-alias-label-primary);background:transparent;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:6px 12px;cursor:pointer;align-self:flex-start}",
        ".dsh-sounds-error{font-size:12px;color:#e5484d;background:var(--dsw-alias-bg-layer-2);border:1px solid #e5484d55;border-radius:8px;padding:8px 12px}",
        ".dsh-sounds-volume{width:140px;accent-color:var(--dsw-alias-brand-primary)}",
        ".dsh-sounds-volume-label{font-size:12px;color:var(--dsw-alias-label-secondary);min-width:34px;text-align:right}"
      ].join("");
      document.head.appendChild(style);
    }
    /**
    * The "声音" settings section body: enable switch, volume slider, one
    * picker row per event (grouped sound menu + preview), reset-to-defaults.
    * Written with createElement (no JSX) so the bundle needs no build step.
    */
    function SoundsSection() {
      var createElement = React.createElement;
      var useState = React.useState;
      var useEffect = React.useEffect;
      var Menu = UiPrimitives.Menu;
      var initial = Object.assign({}, prefs);
      var state = useState(initial);
      var prefsState = state[0];
      var setPrefsState = state[1];
      var errorState = useState(null);
      var error = errorState[0];
      var setError = errorState[1];
      var menuState = useState(null);
      var menuFor = menuState[0];
      var setMenuFor = menuState[1];
      var revisionState = useState(void 0);
      var revision = revisionState[0];
      var setRevision = revisionState[1];
      var switchesState = useState(Object.assign({}, eventSwitches));
      var switches = switchesState[0];
      var setSwitches = switchesState[1];

      useEffect(function () {
        var cancelled = false;
        callSoundsApi("settings.get", {}).then(function (json) {
          if (cancelled) return;
          setRevision(json.revision);
          setPrefsState(parsePrefs(json.value));
        }).catch(function () {
          // The local snapshot stays authoritative on a wire failure.
        });
        return function () { cancelled = true; };
      }, []);

      /** Persist one patch: optimistic update, revert + inline error on failure.
      *  Serialized through an in-flight chain so concurrent commits can never
      *  race the settings revision (a stale expectedRevision would be rejected
      *  and the whole slider would snap back). On success only the revision is
      *  adopted — the local optimistic value already is the canonical one, so a
      *  late response can never overwrite a newer local edit. */
      var inFlight = null;
      function commit(patch) {
        var previous = prefsState;
        setPrefsState(Object.assign({}, previous, patch));
        setError(null);
        var task = Promise.resolve(inFlight).then(function () {
          return callSoundsApi("settings.update", {
            patch: patch,
            expectedRevision: revision
          });
        }).then(function (json) {
          setRevision(json.revision);
        }).catch(function (caught) {
          setError("保存失败:" + (caught instanceof Error ? caught.message : String(caught)));
          setPrefsState(previous);
        });
        inFlight = task.then(function () {}, function () {});
        return task;
      }
      /** Commit the volume slider's current value once, after a short quiet
      *  period — dragging fires many onChange events and each one must NOT
      *  hit the wire (that is what made the slider snap back to 40%). */
      var volumeCommitTimer = null;
      function commitVolume(event) {
        var value = Number(event.currentTarget.value);
        if (!Number.isFinite(value)) return;
        if (volumeCommitTimer !== null) clearTimeout(volumeCommitTimer);
        volumeCommitTimer = setTimeout(function () {
          volumeCommitTimer = null;
          commit({ volume: value });
        }, 250);
      }

      var rows = [];
      EVENTS.forEach(function (ev) {
        var current = prefsState[ev.key];
        rows.push(createElement("div", { key: ev.key, className: "dsh-sounds-row" },
          createElement("span", { className: "dsh-sounds-row-text" },
            createElement("span", { className: "dsh-sounds-title" }, ev.title),
            createElement("span", { className: "dsh-sounds-desc" }, ev.desc)
          ),
          createElement("span", { className: "dsh-sounds-control" },
            createElement(Menu, {
              open: menuFor === ev.key,
              anchor: createElement("button", {
                type: "button",
                className: "dsh-sounds-picker",
                onClick: function () { setMenuFor(ev.key); }
              }, current + " ▾"),
              items: soundMenuItems(current),
              selectedId: current,
              onSelect: function (id) {
                setMenuFor(null);
                commit({ [ev.key]: id });
              },
              onClose: function () { setMenuFor(null); }
            }),
            createElement("button", {
              type: "button",
              className: "dsh-sounds-preview",
              onClick: function () { previewName(current); }
            }, "试听"),
            createElement("label", {
              className: "dsh-sounds-switch",
              title: "开关此事件的声音"
            },
              createElement("input", {
                type: "checkbox",
                checked: switches[ev.key] !== false,
                onChange: function (event) {
                  setEventEnabled(ev.key, event.currentTarget.checked);
                  setSwitches(Object.assign({}, eventSwitches));
                }
              }),
              createElement("span", { className: "dsh-sounds-switch-track" },
                createElement("span", { className: "dsh-sounds-switch-thumb" })
              )
            )
          )
        ));
      });

      function onReset() {
        var patch = {};
        EVENTS.forEach(function (ev) { patch[ev.key] = ev.def; });
        commit(patch);
        // 恢复默认同时重置每个事件的独立开关
        resetEventSwitches();
        setSwitches(Object.assign({}, EVENTS_DEFAULT));
        // 以及系统通知的开关
        resetNotifySwitches();
        setNotify(Object.assign({}, NOTIFY_DEFAULT));
      }

      //#region notification rows
      var notifyState = useState(Object.assign({}, notifySwitches));
      var notify = notifyState[0];
      var setNotify = notifyState[1];
      var permState = useState(notifyPermission());
      var permission = permState[0];
      var setPermission = permState[1];
      function onNotifyToggle(key, next) {
        setNotifySwitch(key, next);
        setNotify(Object.assign({}, notifySwitches));
      }
      function onRequestPermission() {
        requestNotifyPermission().then(function (next) {
          setPermission(next);
        });
      }
      var notifyRows = [];
      EVENTS.forEach(function (ev) {
        notifyRows.push(createElement("div", { key: "n-" + ev.key, className: "dsh-sounds-row" },
          createElement("span", { className: "dsh-sounds-row-text" },
            createElement("span", { className: "dsh-sounds-title" }, ev.title),
            createElement("span", { className: "dsh-sounds-desc" }, "系统通知")
          ),
          createElement("label", { className: "dsh-sounds-switch", title: "开关此事件的通知" },
            createElement("input", {
              type: "checkbox",
              checked: notify[ev.key] !== false,
              onChange: function (event) { onNotifyToggle(ev.key, event.currentTarget.checked); }
            }),
            createElement("span", { className: "dsh-sounds-switch-track" },
              createElement("span", { className: "dsh-sounds-switch-thumb" })
            )
          )
        ));
      });
      //#endregion

      var volumePercent = Math.round(prefsState.volume * 100);
      return createElement("div", { className: "dsh-sounds-section" },
        createElement("p", { className: "dsh-sounds-intro" },
          "任务完成、失败、子代理结束、请求输入和权限请求时播放提示音。音色来自 opencode 内置声音包(45 个),可逐事件切换并试听。"
        ),
        createElement("div", { className: "dsh-sounds-group" },
          createElement("div", { className: "dsh-sounds-group-heading" }, "通用"),
          createElement("div", { className: "dsh-sounds-row" },
            createElement("span", { className: "dsh-sounds-row-text" },
              createElement("span", { className: "dsh-sounds-title" }, "启用音效"),
              createElement("span", { className: "dsh-sounds-desc" }, "任务事件发生时播放提示音")
            ),
            createElement("label", { className: "dsh-sounds-switch" },
              createElement("input", {
                type: "checkbox",
                checked: prefsState.enabled,
                onChange: function (event) { commit({ enabled: event.currentTarget.checked }); }
              }),
              createElement("span", { className: "dsh-sounds-switch-track" },
                createElement("span", { className: "dsh-sounds-switch-thumb" })
              )
            )
          ),
          createElement("div", { className: "dsh-sounds-row" },
            createElement("span", { className: "dsh-sounds-row-text" },
              createElement("span", { className: "dsh-sounds-title" }, "音量"),
              createElement("span", { className: "dsh-sounds-desc" }, "默认 40%,与 opencode 一致")
            ),
            createElement("span", { className: "dsh-sounds-control" },
              createElement("input", {
                type: "range",
                className: "dsh-sounds-volume",
                min: 0,
                max: 1,
                step: 0.05,
                value: prefsState.volume,
                onChange: function (event) {
                  // Dragging updates the UI locally only; the wire commit is
                  // debounced on release (commitVolume), so the slider never
                  // fights a stream of stale-revision writes.
                  var value = Number(event.currentTarget.value);
                  setPrefsState(function (prev) {
                    return Object.assign({}, prev, { volume: value });
                  });
                },
                onPointerUp: commitVolume,
                onMouseUp: commitVolume,
                onTouchEnd: commitVolume,
                onKeyUp: commitVolume,
                onBlur: commitVolume
              }),
              createElement("span", { className: "dsh-sounds-volume-label" }, volumePercent + "%")
            )
          )
        ),
        createElement("div", { className: "dsh-sounds-group" },
          createElement("div", { className: "dsh-sounds-group-heading" }, "事件音色"),
          rows
        ),
        createElement("div", { className: "dsh-sounds-group" },
          createElement("div", { className: "dsh-sounds-group-heading" }, "通知"),
          createElement("div", { className: "dsh-sounds-row" },
            createElement("span", { className: "dsh-sounds-row-text" },
              createElement("span", { className: "dsh-sounds-title" }, "系统通知"),
              createElement("span", { className: "dsh-sounds-desc" }, "窗口在后台时,事件发生弹出 Windows 系统通知")
            ),
            createElement("label", { className: "dsh-sounds-switch", title: "开关系统通知" },
              createElement("input", {
                type: "checkbox",
                checked: notify.enabled !== false,
                onChange: function (event) { onNotifyToggle("enabled", event.currentTarget.checked); }
              }),
              createElement("span", { className: "dsh-sounds-switch-track" },
                createElement("span", { className: "dsh-sounds-switch-thumb" })
              )
            )
          ),
          createElement("div", { className: "dsh-sounds-row" },
            createElement("span", { className: "dsh-sounds-row-text" },
              createElement("span", { className: "dsh-sounds-title" }, "通知权限"),
              createElement("span", { className: "dsh-sounds-desc" }, permissionDesc(permission))
            ),
            createElement("span", { className: "dsh-sounds-control" },
              permission === "default" ? createElement("button", {
                type: "button",
                className: "dsh-sounds-preview",
                onClick: onRequestPermission
              }, "请求通知权限") : null
            )
          ),
          notifyRows
        ),
        createElement("button", { type: "button", className: "dsh-sounds-reset", onClick: onReset }, "恢复 opencode 默认"),
        error !== null ? createElement("div", { className: "dsh-sounds-error", role: "alert" }, error) : null
      );
    }
    /** Permission row copy per state. */
    function permissionDesc(permission) {
      if (permission === "granted") return "已授权,通知将显示在 Windows 通知中心";
      if (permission === "denied") return "已拒绝 —— 请在浏览器站点设置中开启通知";
      if (permission === "unsupported") return "当前浏览器不支持系统通知";
      return "未授权 —— 点击右侧按钮开启";
    }
    //#endregion

    //#region detection
    /** Map a turn/end reason to an event kind; null = silent (aborted/blocked/interrupted). */
    function classifyTurnEnd(reasonKind) {
      if (reasonKind === "completed") return "done";
      if (reasonKind === "error") return "error";
      if (reasonKind === "max-tokens") return "error";
      return null;
    }
    /** Resolve a session binding defensively (scope may be mid-teardown). */
    function safeBinding(sessions, id) {
      try {
        var binding = sessions.binding(id);
        return binding === void 0 || binding === null ? null : binding;
      } catch (error) {
        return null;
      }
    }
    /** Closed turn/end events currently in a session's conversation window. */
    function closedTurnEnds(binding) {
      var snap;
      try {
        snap = binding.session.getSnapshot();
      } catch (error) {
        return [];
      }
      if (snap === null || typeof snap !== "object") return [];
      var chat = snap.chat;
      var timeline = chat === null || typeof chat !== "object" ? void 0 : chat.timeline;
      var turns = timeline === null || typeof timeline !== "object" ? void 0 : timeline.turns;
      if (turns === void 0 || turns === null || typeof turns.forEach !== "function") return [];
      var ends = [];
      turns.forEach(function (location, turnNumber) {
        if (location === null || typeof location !== "object") return;
        if (location.status !== "closed") return;
        var end = location.end;
        if (end === void 0 || end === null || typeof end !== "object") return;
        var seq = end.seq;
        if (typeof seq !== "number") return;
        var reason = end.data === null || typeof end.data !== "object" ? void 0 : end.data.reason;
        ends.push({
          seq: seq,
          kind: reason === null || typeof reason !== "object" ? void 0 : reason.kind,
          turn: turnNumber
        });
      });
      return ends;
    }
    //#endregion

    /**
    * Plugin body: watch the sessions service — the list store for running
    * flips / pending interactions, the staged session's conversation window
    * for exact turn/end reasons — and play the matching sound.
    * @param ctx - client Cordis context (sessions service injected).
    */
    exports.name = "dsh-sounds";
    exports.inject = ["sessions", "slots"];
    exports.apply = function (ctx) {
      var runningById = {};
      var pendingById = {};
      /** Per-session high-water mark: turn/end seqs below it are history, never sound. */
      var watermark = {};
      var trackedCurrent = void 0;
      var sessionUnsub = null;
      var evaluating = false;

      /** Seed the watermark from the current window (historical turns stay silent).
      *  While the history window has not landed (cold/loading) the watermark is
      *  left unset: the unseeded branch of processTurnEnds then absorbs whatever
      *  the first landing delivers — so a page load or session switch can never
      *  turn old turns into sound. */
      function seedWatermark(sessionId) {
        var binding = safeBinding(ctx.sessions, sessionId);
        if (binding === null) return;
        var snap;
        try {
          snap = binding.session.getSnapshot();
        } catch (error) {
          return;
        }
        if (snap !== null && typeof snap === "object") {
          var openState = snap.openState;
          if (openState === "cold" || openState === "loading") return;
        }
        var ends = closedTurnEnds(binding);
        var max = 0;
        for (var i = 0; i < ends.length; i++) if (ends[i].seq > max) max = ends[i].seq;
        watermark[sessionId] = max;
      }

      /** Play sounds for turn/end events newer than the session's watermark. */
      function processTurnEnds(sessionId) {
        var binding = safeBinding(ctx.sessions, sessionId);
        if (binding === null) return;
        var ends = closedTurnEnds(binding);
        var current = watermark[sessionId];
        var seeded = typeof current === "number";
        var max = current;
        for (var i = 0; i < ends.length; i++) {
          var end = ends[i];
          if (end.seq > max) max = end.seq;
          if (seeded && end.seq > current) {
            var kind = classifyTurnEnd(end.kind);
            if (kind !== null) {
              playKind(kind);
              notifyEvent(kind);
            }
          }
        }
        watermark[sessionId] = max;
      }

      /** One sweep over the list store: turn ends, running flips, questions. */
      function evaluate() {
        if (evaluating) return;
        evaluating = true;
        try {
          var list;
          try {
            list = ctx.sessions.list.getSnapshot();
          } catch (error) {
            return;
          }
          if (list === null || typeof list !== "object") return;
          var current = list.current;
          if (current !== trackedCurrent) {
            trackedCurrent = current;
            // Re-arm the per-session snapshot subscription: turn/end reasons
            // arrive through the staged session's conversation window, which
            // changes when the user switches sessions.
            if (sessionUnsub !== null) {
              sessionUnsub();
              sessionUnsub = null;
            }
            if (current !== void 0 && current !== null) {
              seedWatermark(current);
              var binding = safeBinding(ctx.sessions, current);
              if (binding !== null) {
                sessionUnsub = binding.session.subscribe(function () {
                  processTurnEnds(current);
                });
              }
            }
          }
          if (current !== void 0 && current !== null) processTurnEnds(current);
          var byId = list.byId;
          if (byId === null || typeof byId !== "object") return;
          for (var id in byId) {
            var row = byId[id];
            if (row === null || typeof row !== "object") continue;
            var wasRunning = runningById[id] === true;
            var isRunning = row.running === true;
            if (wasRunning && !isRunning && id !== current) {
              // A non-staged session finished: we have no window, so no reason
              // detail — play the subagent-done chime (opencode semantics).
              playKind("subagentDone");
              notifyEvent("subagentDone");
            }
            runningById[id] = isRunning;
            var knownPending = Object.prototype.hasOwnProperty.call(pendingById, id);
            var wasPending = pendingById[id] === true;
            var pendingKind = row.pendingInteraction === void 0 || row.pendingInteraction === null ? null : row.pendingInteraction;
            var isPending = pendingKind !== null;
            // Only the transition into a pending state sounds (an interaction
            // already present at page load / on becoming current stays silent).
            // Kind mapping follows opencode: approval -> permission sound,
            // questions (incl. plan reviews) -> question sound.
            if (knownPending && !wasPending && isPending) {
              var pendingKind2 = pendingKind === "approval" ? "permission" : "question";
              playKind(pendingKind2);
              notifyEvent(pendingKind2);
            }
            pendingById[id] = isPending;
          }
        } finally {
          evaluating = false;
        }
      }

      loadPrefs(function (loaded) {
        prefs = loaded;
      });
      ensureUnlockListener();

      // The "声音" settings section (DSH Settings panel). The label is a
      // function per the settings shell contract; the disposer chain keeps
      // re-activation (HMR) clean.
      if (ctx.slots !== void 0 && typeof ctx.slots.inject === "function") {
        ctx.effect(function () {
          ensureSettingsStyles();
          return ctx.slots.inject("settings.section", function () {
            return ctx.slots.register({
              name: "settings.section",
              id: "dsh-sounds",
              order: 200,
              label: function () { return "声音"; }
            }, SoundsSection);
          });
        }, "dsh-sounds: settings section");
      }

      ctx.effect(function () {
        var offList = ctx.sessions.list.subscribe(evaluate);
        evaluate();
        return function () {
          offList();
          if (sessionUnsub !== null) {
            sessionUnsub();
            sessionUnsub = null;
          }
        };
      }, "dsh-sounds: session watch");

      // Console hook for manual verification / ad-hoc control:
      //   window.__dshSounds.prefs()           current prefs
      //   window.__dshSounds.events()          per-event enable switches
      //   window.__dshSounds.play("done")      play one event kind
      //   window.__dshSounds.playName("yup-01") play one embedded sound
      //   window.__dshSounds.preview("yup-01") preview (ignores enabled)
      //   window.__dshSounds.setPrefs({ enabled: false })  persist a patch
      //   window.__dshSounds.setEvent("error", false)      per-event switch
      //   window.__dshSounds.notifications()               notify switches
      //   window.__dshSounds.setNotification("done", false) per-event notify
      var hook = {
        prefs: function () { return Object.assign({}, prefs); },
        events: function () { return Object.assign({}, eventSwitches); },
        notifications: function () { return Object.assign({}, notifySwitches); },
        play: playKind,
        playName: playName,
        preview: previewName,
        setPrefs: setPrefs,
        setEvent: setEventEnabled,
        setNotification: setNotifySwitch
      };
      try {
        window.__dshSounds = hook;
      } catch (error) {
        // Not worth failing the plugin over a console hook.
      }
    };

    return module.exports;
  }
});
