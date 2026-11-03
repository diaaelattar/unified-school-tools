/*
 * Nepras chrome.* compatibility shim (shared by Desktop/Electron and Mobile/Capacitor).
 *
 * Runs in three kinds of contexts:
 *   - "ext"  : extension pages hosted in an <iframe> of the host page (popup.html, _background.html)
 *   - "tab"  : EMIS pages (content-script world); transport is injected by the platform backend
 * All chrome.* calls are forwarded to the host router (shared/host-core.js) as RPC requests.
 * The extension source is NOT modified: only this file is added in front of it at build time.
 */
(function () {
  "use strict";
  if (globalThis.__NEPRAS_SHIM_INSTALLED__) {
    if (typeof globalThis.__NEPRAS_SHIM_HELLO__ === "function") {
      try { globalThis.__NEPRAS_SHIM_HELLO__(); } catch (_) {}
    }
    return;
  }
  if (
    typeof chrome !== "undefined" &&
    chrome.runtime &&
    chrome.runtime.id &&
    !globalThis.__NEPRAS_CFG__ &&
    ((typeof location !== "undefined" && location.protocol === "chrome-extension:") ||
      (typeof window !== "undefined" && window.parent === window))
  ) {
    return;
  }
  const CFG = globalThis.__NEPRAS_CFG__ || {};
  const MODE = CFG.mode || "ext";
  const EXT_ID = CFG.extId || "nepras-app-extension-id";
  let EXT_BASE = CFG.extBase;
  if (!EXT_BASE) {
    try {
      const src = document.currentScript && document.currentScript.src;
      EXT_BASE = new URL("./", src || location.href).href;
    } catch (_) { EXT_BASE = "/"; }
  }
  const PLATFORM = CFG.platform || "win";
  const MANIFEST = CFG.manifest || { version: "0.0.0", manifest_version: 3, name: "Nepras" };
  const CTX_ID = CFG.ctxId || ("c" + Math.random().toString(36).slice(2) + Date.now().toString(36));
  const ROLE = CFG.role || (MODE === "tab" ? "tab" : (/_background\.html/.test(location.pathname) ? "background" : "page"));
  globalThis.__NEPRAS_SHIM_INSTALLED__ = true;

  // ---------------------------------------------------------------- transport
  let transport;
  if (MODE === "tab") {
    const b = globalThis.neprasBridge;
    transport = { post: (o) => b.send(o), listen: (cb) => b.onMessage(cb) };
  } else {
    transport = {
      post: (o) => parent.postMessage(Object.assign({ __nep: 1, ctx: CTX_ID, role: ROLE }, o), "*"),
      listen: (cb) => addEventListener("message", (e) => {
        if (e.source === parent && e.data && e.data.__nep === 1) cb(e.data);
      })
    };
  }
  const pending = new Map();
  let seq = 0;
  function rpc(op, args) {
    return new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      transport.post({ kind: "req", id, op, args, url: String(location.href), ctx: CTX_ID, role: ROLE });
    });
  }

  // ---------------------------------------------------------------- helpers
  function makeEvent() {
    const ls = [];
    return {
      addListener(fn) { if (typeof fn === "function" && !ls.includes(fn)) ls.push(fn); },
      removeListener(fn) { const i = ls.indexOf(fn); if (i >= 0) ls.splice(i, 1); },
      hasListener(fn) { return ls.includes(fn); },
      hasListeners() { return ls.length > 0; },
      _ls: ls,
      _fire(...a) { ls.slice().forEach((fn) => { try { fn(...a); } catch (e) { console.error(e); } }); }
    };
  }
  const runtime = { id: EXT_ID, lastError: undefined };
  // chrome-style dual API: callback if last arg is a function, otherwise Promise.
  function dual(impl) {
    return function (...args) {
      let cb = null;
      if (args.length && typeof args[args.length - 1] === "function") cb = args.pop();
      const p = Promise.resolve().then(() => impl(...args));
      if (!cb) return p;
      p.then((v) => { runtime.lastError = undefined; try { cb(v); } finally { runtime.lastError = undefined; } },
        (e) => {
          runtime.lastError = { message: String((e && e.message) || e) };
          try { cb(undefined); } finally { runtime.lastError = undefined; }
        });
    };
  }
  const call = (op) => (...args) => rpc(op, args);

  // ---------------------------------------------------------------- runtime
  runtime.getURL = (p) => EXT_BASE + String(p || "").replace(/^\//, "");
  runtime.getManifest = () => MANIFEST;
  runtime.getPlatformInfo = dual(() => ({ os: PLATFORM, arch: "x86-64", nacl_arch: "x86-64" }));
  runtime.onMessage = makeEvent();
  runtime.onInstalled = makeEvent();
  runtime.onStartup = makeEvent();
  runtime.onConnect = makeEvent();
  runtime.connect = () => { throw new Error("runtime.connect is not supported in Nepras app"); };
  runtime.getContexts = dual(async () => []);
  runtime.openOptionsPage = dual(async () => {});
  runtime.reload = () => {};
  runtime.sendMessage = dual(async (...a) => {
    const msg = (typeof a[0] === "string" && a.length > 1 && typeof a[1] === "object") ? a[1] : a[0];
    const res = await rpc("runtime.sendMessage", [msg]);
    if (res && res.__error) throw new Error(res.__error);
    return res ? res.value : undefined;
  });

  // inbound deliver (runtime.onMessage dispatch)
  function handleDeliver(m) {
    let responded = false, isAsync = false;
    const reply = (status, value) => transport.post({ kind: "deliverRes", rid: m.rid, status, value });
    const sendResponse = (v) => { if (!responded) { responded = true; reply("response", v); } };
    const ls = runtime.onMessage._ls.slice();
    for (const l of ls) {
      try {
        const r = l(m.msg, m.sender, sendResponse);
        if (r === true) isAsync = true;
      } catch (e) { console.error(e); }
    }
    if (!responded && !isAsync) reply("noresp");
  }

  // ---------------------------------------------------------------- storage
  function makeArea(area) {
    const ev = makeEvent();
    const a = {
      get: dual((keys) => rpc("storage.get", [area, keys === undefined ? null : keys])),
      set: dual((items) => rpc("storage.set", [area, items])),
      remove: dual((keys) => rpc("storage.remove", [area, keys])),
      clear: dual(() => rpc("storage.clear", [area])),
      getBytesInUse: dual((keys) => rpc("storage.bytes", [area, keys === undefined ? null : keys])),
      setAccessLevel: dual(async () => {}),
      onChanged: ev
    };
    a.QUOTA_BYTES = area === "session" ? 10485760 : 10485760;
    return a;
  }
  const storage = { local: makeArea("local"), session: makeArea("session"), sync: makeArea("sync"), managed: makeArea("managed"), onChanged: makeEvent() };

  // ---------------------------------------------------------------- tabs / windows
  const tabs = {
    TAB_ID_NONE: -1,
    query: dual((q) => rpc("tabs.query", [q || {}])),
    get: dual((id) => rpc("tabs.get", [id])),
    getCurrent: dual(() => rpc("tabs.getCurrent", [])),
    create: dual((p) => rpc("tabs.create", [p || {}])),
    update: dual((...a) => {
      const [id, props] = typeof a[0] === "object" ? [undefined, a[0]] : a;
      return rpc("tabs.update", [id, props || {}]);
    }),
    remove: dual((ids) => rpc("tabs.remove", [ids])),
    reload: dual((id) => rpc("tabs.reload", [id])),
    sendMessage: dual(async (tabId, msg, opts) => {
      const res = await rpc("tabs.sendMessage", [tabId, msg, opts || {}]);
      if (res && res.__error) throw new Error(res.__error);
      return res ? res.value : undefined;
    }),
    onUpdated: makeEvent(), onRemoved: makeEvent(), onCreated: makeEvent(), onActivated: makeEvent()
  };
  const WIN = { id: 1, focused: true, type: "normal", state: "normal", incognito: false, alwaysOnTop: false };
  const windows = {
    WINDOW_ID_NONE: -1, WINDOW_ID_CURRENT: -2,
    getCurrent: dual(async () => ({ ...WIN })),
    getLastFocused: dual(async () => ({ ...WIN })),
    getAll: dual(async (o) => {
      const w = { ...WIN };
      if (o && o.populate) w.tabs = await rpc("tabs.query", [{}]);
      return [w];
    }),
    update: dual(async () => ({ ...WIN })),
    create: dual(async (p) => {
      const t = await rpc("tabs.create", [{ url: p && (p.url || (p.urls && p.urls[0])), active: true }]);
      return { ...WIN, id: 2, tabs: [t] };
    }),
    get: dual(async () => ({ ...WIN })),
    remove: dual(async () => {}),
    onFocusChanged: makeEvent(), onCreated: makeEvent(), onRemoved: makeEvent()
  };

  // ---------------------------------------------------------------- scripting
  function serializeInjection(inj) {
    const o = { target: inj.target, world: inj.world || "ISOLATED" };
    if (inj.files) o.files = inj.files;
    if (typeof inj.func === "function") { o.funcSrc = inj.func.toString(); o.args = inj.args || []; }
    if (inj.css) o.css = inj.css;
    return o;
  }
  const scripting = {
    executeScript: dual((inj) => rpc("scripting.executeScript", [serializeInjection(inj)])),
    insertCSS: dual((inj) => rpc("scripting.insertCSS", [serializeInjection(inj)])),
    removeCSS: dual(async () => {})
  };

  // ---------------------------------------------------------------- downloads
  const downloads = {
    download: dual(async (o) => {
      let finalObj = o;
      if (o && o.url && String(o.url).startsWith("blob:")) {
        try {
          const res = await fetch(o.url);
          const buf = new Uint8Array(await res.arrayBuffer());
          let s = ""; const CH = 0x8000;
          for (let i = 0; i < buf.length; i += CH) s += String.fromCharCode.apply(null, buf.subarray(i, i + CH));
          finalObj = Object.assign({}, o, { base64Data: btoa(s), mimeType: res.headers.get("content-type") || "application/octet-stream" });
        } catch (_) {}
      }
      return rpc("downloads.download", [finalObj]);
    }),
    search: dual((q) => rpc("downloads.search", [q || {}])),
    erase: dual((q) => rpc("downloads.erase", [q || {}])),
    removeFile: dual((id) => rpc("downloads.removeFile", [id])),
    cancel: dual((id) => rpc("downloads.cancel", [id])),
    open: dual((id) => rpc("downloads.open", [id])),
    show: (id) => { rpc("downloads.show", [id]).catch(() => {}); },
    showDefaultFolder: () => { rpc("downloads.showDefaultFolder", []).catch(() => {}); },
    onCreated: makeEvent(), onChanged: makeEvent(), onErased: makeEvent()
  };

  // ---------------------------------------------------------------- webRequest (events are produced by the platform backend)
  function wrEvent(name) {
    const ev = makeEvent();
    const add = ev.addListener;
    ev.addListener = function (fn, filter, extra) {
      add(fn);
      rpc("webRequest.register", [name, filter || {}, extra || []]).catch(() => {});
    };
    return ev;
  }
  const webRequest = {
    onBeforeSendHeaders: wrEvent("onBeforeSendHeaders"),
    onSendHeaders: wrEvent("onSendHeaders"),
    onHeadersReceived: wrEvent("onHeadersReceived"),
    onCompleted: wrEvent("onCompleted"),
    onBeforeRequest: wrEvent("onBeforeRequest")
  };

  // ---------------------------------------------------------------- action / misc
  const action = {
    setPopup: dual(async () => {}), getPopup: dual(async () => ""),
    setBadgeText: dual(async () => {}), setBadgeBackgroundColor: dual(async () => {}), setTitle: dual(async () => {}), setIcon: dual(async () => {}),
    onClicked: makeEvent()
  };
  const offscreen = undefined; // forces background.js to use its documented data: URL fallback
  const i18n = {
    getMessage: (k) => (CFG.messages && CFG.messages[k] && CFG.messages[k].message) || "",
    getUILanguage: () => "ar"
  };

  const chromeObj = { runtime, storage, tabs, windows, scripting, downloads, webRequest, action, i18n, offscreen, extension: { getURL: runtime.getURL } };
  if (MODE === "tab") { // content scripts only get a subset in real Chrome
    delete chromeObj.tabs; delete chromeObj.windows; delete chromeObj.scripting; delete chromeObj.downloads;
    delete chromeObj.webRequest; delete chromeObj.action;
    chromeObj.storage = { local: storage.local, onChanged: storage.onChanged };
    chromeObj.tabs = undefined;
  }
  globalThis.chrome = chromeObj;
  globalThis.browser = undefined;

  // ---------------------------------------------------------------- inbound
  transport.listen(function (m) {
    if (!m) return;
    switch (m.kind) {
      case "res": {
        const p = pending.get(m.id); if (!p) return; pending.delete(m.id);
        if (m.error) p.reject(new Error(m.error)); else p.resolve(m.result);
        break;
      }
      case "deliver": handleDeliver(m); break;
      case "event": {
        const [ns, name] = String(m.name).split(".");
        if (ns === "storage" && name === "onChanged") {
          const [changes, area] = m.args;
          if (MODE === "tab" && area === "session") return;
          (storage[area] && storage[area].onChanged)._fire(changes);
          storage.onChanged._fire(changes, area);
        } else if (chromeObj[ns] && chromeObj[ns][name] && chromeObj[ns][name]._fire) {
          chromeObj[ns][name]._fire(...(m.args || []));
        }
        break;
      }
      case "webRequest": {
        const ev = chromeObj.webRequest && chromeObj.webRequest[m.name];
        if (ev) ev._fire(m.details);
        break;
      }
    }
  });

  // ext page lifecycle: announce readiness so host can route to it
  if (MODE === "ext") {
    try {
      window.close = () => { transport.post({ kind: "closePage", ctx: CTX_ID, role: ROLE }); };
    } catch (_) {}
    // On Mobile (Capacitor), proxy cross-origin EMIS fetches through the native Android HttpURLConnection bridge
    try {
      const hostBackend = window.parent && window.parent.NeprasBackend;
      if (hostBackend && hostBackend.platform === "android" && typeof hostBackend.fetchUrl === "function" && typeof window.fetch === "function") {
        const origFetch = window.fetch.bind(window);
        window.fetch = async function (input, init = {}) {
          const urlStr = typeof input === "string" ? input : (input && input.url) || "";
          if (/^https:\/\/[a-z0-9-]+\.emis\.gov\.eg\//i.test(urlStr)) {
            try {
              const headers = {};
              const hIn = init.headers || (input && input.headers);
              if (hIn) {
                if (typeof hIn.forEach === "function") hIn.forEach((v, k) => { headers[k] = String(v); });
                else if (Array.isArray(hIn)) hIn.forEach(([k, v]) => { headers[k] = String(v); });
                else if (typeof hIn === "object") Object.keys(hIn).forEach((k) => { if (hIn[k] != null) headers[k] = String(hIn[k]); });
              }
              const body = typeof init.body === "string" ? init.body : null;
              const r = await hostBackend.fetchUrl({ url: urlStr, method: init.method || "GET", headers, body });
              let respBody;
              if (r && r.base64) {
                const bin = atob(r.base64);
                const u8 = new Uint8Array(bin.length);
                for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
                respBody = u8.buffer;
              } else {
                respBody = typeof r?.text === "string" ? r.text : "";
              }
              return new Response(respBody, {
                status: (r && r.status) || 200,
                headers: (r && r.headers) || {}
              });
            } catch (proxyErr) {
              console.warn("[Nepras Shim] Proxy fetch error, falling back:", proxyErr);
              return origFetch(input, init);
            }
          }
          return origFetch(input, init);
        };
      }
    } catch (_) {}
    globalThis.__NEPRAS_SHIM_HELLO__ = () => {
      transport.post({ kind: "hello", ctx: CTX_ID, role: ROLE, url: String(location.href) });
    };
    globalThis.__NEPRAS_SHIM_HELLO__();
  } else {
    globalThis.__NEPRAS_SHIM_HELLO__ = () => {
      transport.post({ kind: "hello", ctx: CTX_ID, role: "tab", url: String(location.href) });
    };
    globalThis.__NEPRAS_SHIM_HELLO__();
  }
})();
