/*
 * Nepras host core (shared by Desktop/Electron and Mobile/Capacitor).
 * Emulates the parts of the Chrome extension runtime that the Nepras extension relies on:
 * message routing, storage, tabs, scripting, downloads, webRequest, content-script injection.
 *
 * Platform specifics are injected:
 *   backend: {
 *     platform, loadState(), saveState(str),
 *     createTab(id,url,{active}), navigate(id,url), removeTab(id), setActiveTab(id), reloadTab(id),
 *     exec(id, code, world) -> {ok,result,error}, sendToTab(id,obj),
 *     setWebRequestUrls(patterns[]),
 *     saveFile({filename, base64, mime}) -> {path,size}, deleteFile(path), openPath(path), showItem(path), openFolder(),
 *     on(evt, cb)  evts: tabMessage(id,obj) tabUpdate(id,{url,title,status}) tabLoaded(id,url) tabGone(id)
 *                        request(name,details) download(evt)
 *   }
 *   ui: { openPanel(tabId,url), closePanel(tabId), onActiveTab(id) , iframeFor(win) }
 */
(function (root) {
  "use strict";

  const EXT_ID = "nepras-app-extension-id";

  function matchPattern(pattern) {
    if (pattern === "<all_urls>") return /^(https?|file|ftp|data):/i;
    const m = /^(\*|https?|file|ftp):\/\/(\*|\*\.[^/*]+|[^/*]+)(\/.*)$/.exec(pattern);
    if (!m) return /$^/;
    const esc = (s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    const scheme = m[1] === "*" ? "https?" : m[1];
    let host;
    if (m[2] === "*") host = "[^/]+";
    else if (m[2].startsWith("*.")) host = "(?:[^/]+\\.)?" + esc(m[2].slice(2));
    else host = esc(m[2]);
    const path = esc(m[3]).replace(/\\\*/g, ".*").replace(/\*/g, ".*");
    return new RegExp("^" + scheme + "://" + host + path + "$", "i");
  }
  function matchesAny(patterns, url) {
    const list = Array.isArray(patterns) ? patterns : [patterns];
    return list.some((p) => matchPattern(p).test(String(url || "")));
  }

  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function start(deps) {
    const { backend, ui } = deps;
    const extBase = deps.extBase; // absolute URL ending with '/'
    const manifest = deps.manifest;
    const platform = backend.platform || "win";

    // ------------------------------------------------------------ contexts
    const ctxs = new Map();            // ctxId -> {id, kind:'ext'|'tab', tabId, role, url, post}
    const tabCtx = new Map();          // tabId -> ctx
    const sourceCtx = new Map();       // window -> ctxId  (ext iframes)
    const deliverWait = new Map();     // rid -> resolver
    let ridSeq = 0;

    // ------------------------------------------------------------ tabs model
    const tabs = new Map();            // id -> {id,url,title,status,active,kind,windowId,index}
    let tabSeq = 0;
    let activeTabId = null;
    function tabInfo(t) {
      return t && { id: t.id, index: t.index, windowId: 1, active: t.id === activeTabId, highlighted: t.id === activeTabId, pinned: false,
        incognito: false, url: t.url || t.pendingUrl || "", pendingUrl: t.pendingUrl, title: t.title || "", status: t.status || "complete", favIconUrl: "", discarded: false, audible: false };
    }
    function webTabs() { return [...tabs.values()].filter((t) => t.kind === "web"); }
    function broadcastExt(name, args) {
      for (const c of ctxs.values()) if (c.kind === "ext") c.post({ kind: "event", name, args });
    }
    function setActive(id) {
      if (activeTabId === id) return;
      activeTabId = id;
      if (ui && ui.onActiveTab) ui.onActiveTab(id);
      const t = tabs.get(id);
      if (t && t.kind === "web") backend.setActiveTab(id);
      broadcastExt("tabs.onActivated", [{ tabId: id, windowId: 1 }]);
    }

    async function createTab(props) {
      const url = String(props.url || "about:blank");
      const id = ++tabSeq;
      const isPanel = url.startsWith(extBase) || url.startsWith("blob:") || url.startsWith("data:text/html");
      const t = { id, url: isPanel ? url : "", pendingUrl: isPanel ? undefined : url, title: "", status: isPanel ? "complete" : "loading", kind: isPanel ? "panel" : "web", index: tabs.size };
      tabs.set(id, t);
      if (isPanel) { ui.openPanel(id, url); }
      else { await backend.createTab(id, url, { active: props.active !== false }); }
      if (!isPanel && (props.active !== false || activeTabId == null)) setActive(id);
      broadcastExt("tabs.onCreated", [tabInfo(t)]);
      return tabInfo(t);
    }
    async function removeTab(id) {
      const t = tabs.get(id); if (!t) return;
      tabs.delete(id);
      tabCtx.delete(id);
      if (t.kind === "panel") ui.closePanel(id); else await backend.removeTab(id);
      if (activeTabId === id) {
        activeTabId = null;
        const next = webTabs().pop();
        if (next) setActive(next.id);
      }
      broadcastExt("tabs.onRemoved", [id, { windowId: 1, isWindowClosing: false }]);
    }

    // ------------------------------------------------------------ messaging
    function deliver(ctx, msg, sender) {
      return new Promise((resolve) => {
        const rid = ++ridSeq;
        const timer = setTimeout(() => { deliverWait.delete(rid); resolve({ status: "noresp" }); }, 300000);
        deliverWait.set(rid, (v) => { clearTimeout(timer); resolve(v); });
        ctx.post({ kind: "deliver", rid, msg, sender });
      });
    }
    async function routeRuntimeMessage(from, msg) {
      const targets = [...ctxs.values()].filter((c) => c.kind === "ext" && c.id !== from.id);
      const sender = senderFor(from);
      if (!targets.length) return { __error: "Could not establish connection. Receiving end does not exist." };
      const results = await Promise.all(targets.map((c) => deliver(c, msg, sender)));
      const first = results.find((r) => r.status === "response");
      return first ? { value: first.value } : { value: undefined };
    }
    function senderFor(ctx) {
      if (ctx.kind === "tab") {
        const t = tabs.get(ctx.tabId);
        return { id: EXT_ID, url: ctx.url, origin: safeOrigin(ctx.url), frameId: 0, documentId: ctx.id, tab: t ? tabInfo(t) : undefined };
      }
      return { id: EXT_ID, url: ctx.url, origin: safeOrigin(extBase), frameId: 0, documentId: ctx.id };
    }
    function safeOrigin(u) { try { return new URL(u).origin; } catch (_) { return undefined; } }

    // ------------------------------------------------------------ storage
    const store = { local: {}, session: {}, sync: {}, managed: {} };
    let saveTimer = null;
    function persistSoon() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => { try { backend.saveState(JSON.stringify({ local: store.local, sync: store.sync })); } catch (e) { console.warn("persist failed", e); } }, 400);
    }
    function storageEmit(area, changes) {
      if (!Object.keys(changes).length) return;
      for (const c of ctxs.values()) {
        if (c.kind === "tab" && area === "session") continue;
        c.post({ kind: "event", name: "storage.onChanged", args: [changes, area] });
      }
    }
    function pickKeys(area, keys) {
      const data = store[area]; const out = {};
      if (keys == null) { for (const k of Object.keys(data)) out[k] = clone(data[k]); return out; }
      if (typeof keys === "string") keys = [keys];
      if (Array.isArray(keys)) { for (const k of keys) if (k in data) out[k] = clone(data[k]); return out; }
      for (const k of Object.keys(keys)) out[k] = k in data ? clone(data[k]) : clone(keys[k]);
      return out;
    }

    // ------------------------------------------------------------ files / scripting
    const textCache = new Map();
    async function extText(file) {
      if (textCache.has(file)) return textCache.get(file);
      const res = await fetch(extBase + String(file).replace(/^\//, ""));
      if (!res.ok) throw new Error("Could not load file: " + file);
      const t = await res.text();
      textCache.set(file, t);
      return t;
    }
    async function execIn(tabId, code, world) {
      const t = tabs.get(tabId);
      if (!t || t.kind !== "web") throw new Error("No tab with id: " + tabId);
      const r = await backend.exec(tabId, code, world === "MAIN" ? "MAIN" : "ISOLATED");
      if (!r || !r.ok) throw new Error((r && r.error) || "Script execution failed");
      return r.result;
    }
    async function executeScript(inj) {
      const tabId = Array.isArray(inj.target.tabId) ? inj.target.tabId[0] : inj.target.tabId;
      const world = inj.world || "ISOLATED";
      if (inj.files) {
        await ensureTabShim(tabId);
        for (const f of inj.files) {
          const code = await extText(f);
          await execIn(tabId, code + "\n//# sourceURL=nepras-ext/" + f, world);
        }
        return inj.files.map(() => ({ frameId: 0, result: null })).slice(0, 1);
      }
      if (inj.funcSrc) {
        const code = "(async()=>{const __f=(" + inj.funcSrc + ");return await __f.apply(null," + JSON.stringify(inj.args || []) + ");})()";
        const result = await execIn(tabId, code, world);
        return [{ frameId: 0, result: result === undefined ? null : result }];
      }
      return [];
    }
    async function insertCSS(inj) {
      const tabId = inj.target.tabId;
      let css = inj.css || "";
      for (const f of inj.files || []) css += "\n" + await extText(f);
      const code = "(()=>{const s=document.createElement('style');s.setAttribute('data-nepras-css','1');s.textContent=" + JSON.stringify(css) + ";(document.head||document.documentElement).appendChild(s);})()";
      await execIn(tabId, code, "ISOLATED");
    }

    // content script injection (manifest.content_scripts emulation)
    let shimText = null;
    async function shimSource() { if (!shimText) shimText = await extText("nepras-shim.js"); return shimText; }
    const MAIN_XHR_HOOK = `(()=>{try{if(window.__neprasXhrHooked)return;window.__neprasXhrHooked=true;window.__neprasLastEmisHeaders=window.__neprasLastEmisHeaders||{};const save=(k,v)=>{const lk=String(k||"").toLowerCase();if(["authorization","schoolcode","schoolstage","usertype","ut","ed","md","sc","ty"].includes(lk)&&v!=null&&String(v)!==""){window.__neprasLastEmisHeaders[lk]=String(v);}};const origSet=XMLHttpRequest.prototype.setRequestHeader;XMLHttpRequest.prototype.setRequestHeader=function(k,v){try{save(k,v);}catch(_){}return origSet.apply(this,arguments);};const origFetch=window.fetch;if(typeof origFetch==="function"){window.fetch=function(input,init){try{const h=init&&init.headers;if(h){if(typeof h.forEach==="function")h.forEach((v,k)=>save(k,v));else if(Array.isArray(h))h.forEach(([k,v])=>save(k,v));else if(typeof h==="object")Object.entries(h).forEach(([k,v])=>save(k,v));}}catch(_){}return origFetch.apply(this,arguments);};}if(typeof URL!=="undefined"&&typeof URL.createObjectURL==="function"&&!URL.__neprasPdfHooked){URL.__neprasPdfHooked=true;const origObjUrl=URL.createObjectURL;URL.createObjectURL=function(obj){try{if(obj&&typeof Blob!=="undefined"&&obj instanceof Blob&&(/pdf/i.test(obj.type||"")||(obj.size>100&&obj.size<50*1024*1024))){obj.arrayBuffer().then((ab)=>{const u8=new Uint8Array(ab);if(u8.length>4&&u8[0]===0x25&&u8[1]===0x50&&u8[2]===0x44&&u8[3]===0x46){let bin="";const CH=0x8000;for(let idx=0;idx<u8.length;idx+=CH)bin+=String.fromCharCode.apply(null,u8.subarray(idx,idx+CH));window.__neprasCapturedPdf={base64:btoa(bin),size:u8.length,ts:Date.now()};}}).catch(()=>{});}}catch(_){}return origObjUrl.apply(this,arguments);};}}catch(_){}})();`;
    async function ensureTabShim(tabId) {
      if (tabCtx.has(tabId)) return;
      const t = tabs.get(tabId);
      if (!t || t.kind !== "web") return;
      const cfg = { mode: "tab", extId: EXT_ID, extBase, platform, manifest: { version: manifest.version, manifest_version: 3, name: manifest.name }, messages: deps.messages || {}, ctxId: "t" + tabId + "_" + Date.now().toString(36) };
      const pre = "globalThis.__NEPRAS_CFG__=" + JSON.stringify(cfg) + ";";
      try {
        await execIn(tabId, MAIN_XHR_HOOK, "MAIN").catch(() => {});
        await execIn(tabId, pre + (await shimSource()), "ISOLATED");
      } catch (_) {}
    }
    async function injectContentScripts(tabId, url) {
      const cs = (manifest.content_scripts || []).filter((c) => matchesAny(c.matches, url));
      if (!cs.length) return;
      const cfg = { mode: "tab", extId: EXT_ID, extBase, platform, manifest: { version: manifest.version, manifest_version: 3, name: manifest.name }, messages: deps.messages || {}, ctxId: "t" + tabId + "_" + Date.now().toString(36) };
      const pre = "globalThis.__NEPRAS_CFG__=" + JSON.stringify(cfg) + ";";
      try {
        await execIn(tabId, MAIN_XHR_HOOK, "MAIN").catch(() => {});
        await execIn(tabId, pre + (await shimSource()), "ISOLATED");
        for (const c of cs) for (const f of c.js || []) await execIn(tabId, await extText(f), "ISOLATED");
      } catch (e) { console.warn("[Nepras] content script injection failed", e); }
    }

    // ------------------------------------------------------------ downloads
    const dls = new Map(); let dlSeq = 0;
    function dlItem(o) {
      return Object.assign({ id: 0, url: "", finalUrl: "", referrer: "", filename: "", incognito: false, danger: "safe", mime: "", startTime: new Date().toISOString(),
        endTime: null, state: "in_progress", paused: false, canResume: false, error: undefined, bytesReceived: 0, totalBytes: -1, fileSize: -1, exists: true, byExtensionId: EXT_ID }, o);
    }
    function dlEmitCreated(it) { broadcastExt("downloads.onCreated", [clone(it)]); }
    function dlEmitDone(it, prevState) {
      it.state = "complete"; it.endTime = new Date().toISOString();
      broadcastExt("downloads.onChanged", [{ id: it.id, state: { previous: prevState || "in_progress", current: "complete" }, endTime: { current: it.endTime } }]);
    }
    async function toBase64(url) {
      if (/^data:/i.test(url)) {
        const comma = url.indexOf(",");
        const meta = url.slice(5, comma); const body = url.slice(comma + 1);
        const mime = meta.split(";")[0] || "application/octet-stream";
        if (/;base64/i.test(meta)) return { base64: body.replace(/\s/g, ""), mime };
        const bin = unescape(body); let s = ""; for (let i = 0; i < bin.length; i++) s += String.fromCharCode(bin.charCodeAt(i) & 255);
        return { base64: btoa(s), mime };
      }
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("SERVER_BAD_CONTENT");
      const buf = new Uint8Array(await res.arrayBuffer());
      let s = ""; const CH = 0x8000;
      for (let i = 0; i < buf.length; i += CH) s += String.fromCharCode.apply(null, buf.subarray(i, i + CH));
      return { base64: btoa(s), mime: res.headers.get("content-type") || "" };
    }
    async function download(o) {
      if (!o || !o.url) throw new Error("Invalid URL");
      const id = ++dlSeq;
      const filename = String(o.filename || "download").replace(/\\/g, "/").replace(/^\/+/, "").replace(/\.\.+\//g, "");
      const it = dlItem({ id, url: o.url.length > 200 ? o.url.slice(0, 200) : o.url, finalUrl: o.url.length > 200 ? "" : o.url, filename });
      dls.set(id, it);
      dlEmitCreated(it);
      (async () => {
        try {
          const { base64, mime } = await toBase64(o.url);
          const saved = await backend.saveFile({ filename, base64, mime, conflictAction: o.conflictAction || "uniquify" });
          it.filename = saved.path; it.mime = mime; it.fileSize = it.totalBytes = it.bytesReceived = saved.size;
          dlEmitDone(it);
        } catch (e) {
          it.state = "interrupted"; it.error = "FILE_FAILED";
          broadcastExt("downloads.onChanged", [{ id, state: { previous: "in_progress", current: "interrupted" }, error: { current: "FILE_FAILED" } }]);
        }
      })();
      return id;
    }
    function dlSearch(q) {
      let list = [...dls.values()];
      if (q.id != null) list = list.filter((i) => i.id === q.id);
      if (q.state) list = list.filter((i) => i.state === q.state);
      if (q.url) list = list.filter((i) => i.url === q.url);
      if (q.urlRegex) { const r = new RegExp(q.urlRegex); list = list.filter((i) => r.test(i.url)); }
      if (q.filenameRegex) { const r = new RegExp(q.filenameRegex); list = list.filter((i) => r.test(i.filename)); }
      if (q.mime) list = list.filter((i) => i.mime === q.mime);
      if (q.query && q.query.length) list = list.filter((i) => q.query.every((w) => (i.filename + " " + i.url).toLowerCase().includes(String(w).toLowerCase())));
      if (q.orderBy && q.orderBy[0]) {
        const k = q.orderBy[0].replace("-", ""), desc = q.orderBy[0].startsWith("-");
        list.sort((a, b) => (a[k] > b[k] ? 1 : -1) * (desc ? -1 : 1));
      } else list.sort((a, b) => a.id - b.id);
      if (q.limit != null) list = list.slice(0, q.limit);
      return clone(list);
    }
    // downloads started by pages (e.g. EMIS "download PDF" links)
    backend.on("download", (e) => {
      if (e.phase === "start") {
        const id = ++dlSeq;
        const it = dlItem({ id, url: e.url, finalUrl: e.url, filename: e.path || e.filename || "", mime: e.mime || "", totalBytes: e.total || -1 });
        e._id = id; dls.set(id, it); dlEmitCreated(it);
        e.assign && e.assign(id);
      } else {
        const it = dls.get(e.id); if (!it) return;
        if (e.phase === "done") {
          it.filename = e.path || it.filename;
          it.fileSize = it.bytesReceived = e.size || 0;
          if (it._suppressed) {
            if (it.filename) {
              Promise.resolve(backend.deleteFile(it.filename)).catch(() => {});
            }
            dls.delete(it.id);
            return;
          }
          dlEmitDone(it);
        }
        if (e.phase === "failed") {
          if (it._suppressed) {
            dls.delete(it.id);
            return;
          }
          it.state = "interrupted";
          broadcastExt("downloads.onChanged", [{ id: it.id, state: { previous: "in_progress", current: "interrupted" } }]);
        }
      }
    });

    // ------------------------------------------------------------ webRequest
    const wrRegs = []; // {ctxId,name,filter}
    const recentRequests = []; // buffer last 40 onBeforeSendHeaders so early requests before background registers aren't lost
    function wrSync() {
      const urls = new Set();
      wrRegs.forEach((r) => (r.filter.urls || []).forEach((u) => urls.add(u)));
      backend.setWebRequestUrls([...urls]);
    }
    backend.on("request", (name, details) => {
      if (details && (details.tabId == null || details.tabId < 0) && activeTabId != null) {
        details.tabId = activeTabId;
      }
      if (name === "onBeforeSendHeaders") {
        recentRequests.push({ name, details: clone(details), ts: Date.now() });
        if (recentRequests.length > 40) recentRequests.shift();
      }
      for (const r of wrRegs) {
        if (r.name !== name) continue;
        if (r.filter.urls && !matchesAny(r.filter.urls, details.url)) continue;
        const c = ctxs.get(r.ctxId); if (!c) continue;
        c.post({ kind: "webRequest", name, details });
      }
    });

    // ------------------------------------------------------------ RPC ops
    const ops = {
      "runtime.sendMessage": (ctx, [msg]) => routeRuntimeMessage(ctx, msg),
      "storage.get": (ctx, [area, keys]) => pickKeys(area, keys),
      "storage.set": (ctx, [area, items]) => {
        const ch = {};
        for (const k of Object.keys(items || {})) {
          const nv = clone(items[k]);
          const had = k in store[area];
          if (JSON.stringify(store[area][k]) === JSON.stringify(nv) && had) continue;
          ch[k] = had ? { oldValue: store[area][k], newValue: nv } : { newValue: nv };
          store[area][k] = nv;
        }
        if (area === "local" || area === "sync") persistSoon();
        storageEmit(area, ch);
      },
      "storage.remove": (ctx, [area, keys]) => {
        const ch = {}; for (const k of [].concat(keys)) if (k in store[area]) { ch[k] = { oldValue: store[area][k] }; delete store[area][k]; }
        if (area === "local" || area === "sync") persistSoon();
        storageEmit(area, ch);
      },
      "storage.clear": (ctx, [area]) => {
        const ch = {}; for (const k of Object.keys(store[area])) ch[k] = { oldValue: store[area][k] };
        store[area] = {}; if (area === "local" || area === "sync") persistSoon(); storageEmit(area, ch);
      },
      "storage.bytes": (ctx, [area, keys]) => JSON.stringify(pickKeys(area, keys)).length,

      "tabs.query": (ctx, [q]) => {
        q = q || {};
        let list = [...tabs.values()];
        if (q.currentWindow || q.lastFocusedWindow) list = list.filter((t) => t.kind === "web");
        if (q.active != null) list = list.filter((t) => (t.id === activeTabId) === q.active);
        if (q.url) list = list.filter((t) => (t.url || t.pendingUrl) && matchesAny(q.url, t.url || t.pendingUrl));
        if (q.status) list = list.filter((t) => (t.status || "complete") === q.status);
        if (q.title) list = list.filter((t) => (t.title || "").includes(q.title));
        return list.map(tabInfo);
      },
      "tabs.get": (ctx, [id]) => { const t = tabs.get(id); if (!t) throw new Error("No tab with id: " + id); return tabInfo(t); },
      "tabs.getCurrent": (ctx) => (ctx.kind === "ext" && ctx.panelTabId ? tabInfo(tabs.get(ctx.panelTabId)) : undefined),
      "tabs.create": (ctx, [p]) => createTab(p),
      "tabs.update": async (ctx, [id, props]) => {
        if (id == null) id = activeTabId;
        const t = tabs.get(id); if (!t) throw new Error("No tab with id: " + id);
        if (props.url && t.kind === "web") { t.pendingUrl = props.url; t.status = "loading"; await backend.navigate(id, props.url); }
        if (props.active) setActive(id);
        return tabInfo(t);
      },
      "tabs.remove": async (ctx, [ids]) => { for (const id of [].concat(ids)) await removeTab(id); },
      "tabs.reload": async (ctx, [id]) => { await backend.reloadTab(id == null ? activeTabId : id); },
      "tabs.sendMessage": async (ctx, [tabId, msg]) => {
        let target = tabCtx.get(tabId);
        if (!target) {
          await ensureTabShim(tabId);
          for (let i = 0; i < 10 && !tabCtx.has(tabId); i++) await sleep(50);
          target = tabCtx.get(tabId);
        }
        if (!target) return { __error: "Could not establish connection. Receiving end does not exist." };
        const act = String((msg && msg.action) || "");
        if (ui && ui.onShowBrowser && (
          act === "OPEN_RECORDS_MODAL" ||
          act === "NEPRAS_NAME_FIXER_SHOW" ||
          act === "START_STUDENT_EXTRACTION" ||
          act === "START_CLASS_REPORT_TASK" ||
          act === "START_ATTENDANCE_TASK" ||
          act === "OPEN_TABLET_MODAL" ||
          act === "OPEN_ADD_STUDENT_MODAL" ||
          act === "OPEN_ABSENCE_WARNINGS_MODAL" ||
          act === "OPEN_EXEMPTION_MODAL" ||
          act === "OPEN_QUICK_EDITS_MODAL" ||
          act === "EXECUTE_TEACHER_TASK" ||
          act === "START_ACCEPT_LIST" ||
          act === "START_AUTO_ASSIGN"
        )) {
          try { ui.onShowBrowser(); } catch (_) {}
        }
        const r = await deliver(target, msg, senderFor(ctx));
        return r.status === "response" ? { value: r.value } : { value: undefined };
      },
      "scripting.executeScript": (ctx, [inj]) => executeScript(inj),
      "scripting.insertCSS": (ctx, [inj]) => insertCSS(inj),

      "downloads.download": (ctx, [o]) => download(o),
      "downloads.search": (ctx, [q]) => dlSearch(q),
      "downloads.erase": (ctx, [q]) => {
        const ids = dlSearch(q).map((i) => i.id);
        ids.forEach((id) => {
          const it = dls.get(id);
          if (it && it.state === "in_progress") {
            it._suppressed = true;
          } else {
            dls.delete(id);
          }
          broadcastExt("downloads.onErased", [id]);
        });
        return ids;
      },
      "downloads.removeFile": async (ctx, [id]) => {
        const it = dls.get(id);
        if (it) {
          it._suppressed = true;
          if (it.filename) await backend.deleteFile(it.filename);
          it.exists = false;
        }
      },
      "downloads.cancel": (ctx, [id]) => {
        const it = dls.get(id);
        if (it && it.state === "in_progress") {
          it._suppressed = true;
          it.state = "interrupted";
        }
      },
      "downloads.open": async (ctx, [id]) => { const it = dls.get(id); if (!it) throw new Error("Invalid download id"); await backend.openPath(it.filename); },
      "downloads.show": async (ctx, [id]) => { const it = dls.get(id); if (it) await backend.showItem(it.filename); },
      "downloads.showDefaultFolder": () => backend.openFolder(),

      "webRequest.register": (ctx, [name, filter]) => {
        wrRegs.push({ ctxId: ctx.id, name, filter }); wrSync();
        if (name === "onBeforeSendHeaders") {
          for (const item of recentRequests) {
            if (filter && filter.urls && !matchesAny(filter.urls, item.details.url)) continue;
            ctx.post({ kind: "webRequest", name: item.name, details: item.details });
          }
        }
      }
    };

    async function handleReq(ctx, m) {
      try {
        const fn = ops[m.op];
        if (!fn) throw new Error("Unsupported API: " + m.op);
        const result = await fn(ctx, m.args || []);
        ctx.post({ kind: "res", id: m.id, result });
      } catch (e) {
        ctx.post({ kind: "res", id: m.id, error: String((e && e.message) || e) });
      }
    }
    function onCtxMessage(ctx, m) {
      if (m.url) {
        ctx.url = m.url;
        if (ctx.kind === "tab" && ctx.tabId != null) {
          const t = tabs.get(ctx.tabId);
          if (t && /^https?:/i.test(m.url)) t.url = m.url;
        }
      }
      if (m.kind === "req") handleReq(ctx, m);
      else if (m.kind === "deliverRes") { const w = deliverWait.get(m.rid); if (w) { deliverWait.delete(m.rid); w({ status: m.status, value: m.value }); } }
    }

    // ext iframes
    const messageTarget = (typeof window !== "undefined" && window.addEventListener) ? window : (root && typeof root.addEventListener === "function" ? root : (deps.root || globalThis));
    if (messageTarget && typeof messageTarget.addEventListener === "function") {
      messageTarget.addEventListener("message", (e) => {
        const m = e.data; if (!m || m.__nep !== 1 || !e.source) return;
        let ctx = sourceCtx.get(e.source) && ctxs.get(sourceCtx.get(e.source));
        if (!ctx || (m.ctx && ctx.id !== m.ctx)) {
          if (ctx) { ctxs.delete(ctx.id); for (let i = wrRegs.length - 1; i >= 0; i--) if (wrRegs[i].ctxId === ctx.id) wrRegs.splice(i, 1); }
          const src = e.source;
          ctx = { id: m.ctx, kind: "ext", role: m.role, url: m.url, post: (o) => { try { src.postMessage(Object.assign({ __nep: 1 }, o), "*"); } catch (_) {} } };
          if (ui && ui.panelTabIdFor) ctx.panelTabId = ui.panelTabIdFor(src);
          ctxs.set(ctx.id, ctx); sourceCtx.set(src, ctx.id);
        }
        onCtxMessage(ctx, m);
      });
    }

    // tab contexts
    backend.on("tabMessage", (tabId, m) => {
      let ctx = tabCtx.get(tabId);
      if (!ctx || (m.ctx && ctx.id !== m.ctx)) {
        if (ctx) ctxs.delete(ctx.id);
        ctx = { id: m.ctx, kind: "tab", tabId, role: "tab", url: m.url, post: (o) => backend.sendToTab(tabId, Object.assign({ __nep: 1 }, o)) };
        ctxs.set(ctx.id, ctx); tabCtx.set(tabId, ctx);
      }
      onCtxMessage(ctx, m);
    });
    backend.on("tabUpdate", (tabId, info) => {
      const t = tabs.get(tabId); if (!t) return;
      const change = {};
      if (info.url != null && info.url !== t.url) { t.url = info.url; change.url = info.url; }
      if (info.title != null && info.title !== t.title) { t.title = info.title; change.title = info.title; }
      if (info.status && info.status !== t.status) { t.status = info.status; change.status = info.status; }
      else if (info.status && !t.status) { t.status = info.status; change.status = info.status; }
      if (Object.keys(change).length) broadcastExt("tabs.onUpdated", [tabId, change, tabInfo(t)]);
    });
    backend.on("tabLoaded", (tabId, url) => {
      const t = tabs.get(tabId);
      if (t && url && !t.url) t.url = url;
      injectContentScripts(tabId, url);
    });
    backend.on("tabGone", (tabId) => { if (tabs.has(tabId)) removeTab(tabId); });

    // ------------------------------------------------------------ boot
    async function boot() {
      try {
        const raw = await backend.loadState();
        if (raw) { const s = JSON.parse(raw); store.local = s.local || {}; store.sync = s.sync || {}; }
      } catch (e) { console.warn("state load failed", e); }
    }

    const api = {
      boot, createTab, removeTab, setActive, tabs, ctxs,
      get activeTabId() { return activeTabId; },
      navigateActive: async (url) => {
        if (activeTabId == null || !tabs.get(activeTabId) || tabs.get(activeTabId).kind !== "web") return createTab({ url });
        const t = tabs.get(activeTabId); t.pendingUrl = url; t.status = "loading"; return backend.navigate(activeTabId, url);
      },
      fireInstalled: () => broadcastExt("runtime.onInstalled", [{ reason: "update" }]),
      _matchPattern: matchPattern, _matchesAny: matchesAny
    };
    return api;
  }

  const exported = { start, matchPattern, matchesAny, EXT_ID };
  if (typeof module !== "undefined" && module.exports) module.exports = exported; else root.NeprasHost = exported;
})(typeof window !== "undefined" ? window : globalThis);
