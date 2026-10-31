"use strict";
// Offline tests for shared/host-core.js + shared/nepras-shim.js using an in-memory transport.
const vm = require("vm");
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const root = path.resolve(__dirname, "..");
const shimSrc = fs.readFileSync(path.join(root, "shared", "nepras-shim.js"), "utf8");
const Host = require(path.join(root, "shared", "host-core.js"));

const EXT = "https://app.test/ext/";
const tick = (ms = 10) => new Promise((r) => setTimeout(r, ms));
let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log("  ok  -", name); }
  catch (e) { console.error("  FAIL-", name, "\n", e && e.stack || e); process.exitCode = 1; }
}

// ---- fake host window (receives postMessage from ext iframes)
const hostHandlers = [];
const hostWin = { addEventListener: (t, f) => { if (t === "message") hostHandlers.push(f); } };
global.fetch = async (url) => {
  const rel = String(url).replace(EXT, "");
  const f = path.join(root, "shared", rel === "nepras-shim.js" ? "nepras-shim.js" : rel);
  if (!fs.existsSync(f)) return { ok: false, text: async () => "", status: 404 };
  return { ok: true, text: async () => fs.readFileSync(f, "utf8") };
};

// ---- fake ext iframe context running the real shim
function makeExtCtx(role, href) {
  const handlers = [];
  const win = {
    location: { href, pathname: new URL(href).pathname },
    document: { currentScript: { src: EXT + "nepras-shim.js" } },
    addEventListener: (t, f) => { if (t === "message") handlers.push(f); },
    postMessage: (m) => handlers.forEach((h) => h({ data: m, source: parentObj })),
    console, setTimeout, clearTimeout, JSON, Promise, Date, Math, Error, URL
  };
  const parentObj = { postMessage: (m) => hostHandlers.forEach((h) => h({ data: m, source: win })) };
  win.parent = parentObj;
  win.globalThis = win; win.window = win;
  win.__NEPRAS_CFG__ = { role, mode: "ext" };
  vm.createContext(win);
  vm.runInContext(shimSrc, win);
  return win;
}

// ---- fake backend
function makeBackend() {
  const h = {};
  const saved = [];
  const b = {
    platform: "win", saved, h,
    on: (e, cb) => { (h[e] = h[e] || []).push(cb); },
    emit: (e, ...a) => (h[e] || []).forEach((cb) => cb(...a)),
    state: null,
    loadState: async () => b.state, saveState: (s) => { b.state = s; },
    createTab: async (id, url) => { b.created = (b.created || []).concat({ id, url }); },
    navigate: async (id, url) => { b.navigated = { id, url }; },
    removeTab: async () => {}, setActiveTab: () => {}, reloadTab: async () => {},
    execLog: [],
    exec: async (id, code, world) => { b.execLog.push({ id, world, code }); try { return { ok: true, result: vm.runInNewContext(code, { Promise }) }; } catch (e) { return { ok: false, error: e.message }; } },
    sendToTab: (id, obj) => { b.toTab && b.toTab(id, obj); },
    setWebRequestUrls: (u) => { b.wr = u; },
    saveFile: async (o) => { saved.push(o); return { path: "C:/Docs/Nepras/" + o.filename, size: Buffer.from(o.base64, "base64").length }; },
    deleteFile: async () => {}, openPath: async () => {}, showItem: async () => {}, openFolder: async () => {}
  };
  return b;
}

(async () => {
  console.log("host-core / shim tests");
  const backend = makeBackend();
  const ui = { openPanel() {}, closePanel() {}, onActiveTab() {} };
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "extension", "manifest.json"), "utf8"));
  const core = Host.start({ backend, ui, extBase: EXT, manifest, root: hostWin });
  await core.boot();

  const bg = makeExtCtx("background", EXT + "_background.html");
  const popup = makeExtCtx("page", EXT + "popup.html");
  await tick();

  await test("match patterns", () => {
    assert(Host.matchesAny(["https://student.emis.gov.eg/*"], "https://student.emis.gov.eg/a/b"));
    assert(!Host.matchesAny(["https://student.emis.gov.eg/*"], "https://x.emis.gov.eg/a"));
    assert(Host.matchesAny("https://*.emis.gov.eg/*", "https://teacher.emis.gov.eg/x"));
    assert(Host.matchesAny("<all_urls>", "https://a.b/c"));
  });

  await test("storage.local set/get + onChanged in other context", async () => {
    let changed = null;
    bg.chrome.storage.onChanged.addListener((c, area) => { changed = { c, area }; });
    await popup.chrome.storage.local.set({ a: 1, b: { x: 2 } });
    const got = await bg.chrome.storage.local.get(["a", "b", "zz"]);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(got)), { a: 1, b: { x: 2 } });
    await tick();
    assert(changed && changed.area === "local" && changed.c.a.newValue === 1);
    const defaults = await popup.chrome.storage.local.get({ a: 9, q: 5 });
    assert.strictEqual(defaults.a, 1); assert.strictEqual(defaults.q, 5);
    await tick(450);
    assert(JSON.parse(backend.state).local.a === 1, "persisted");
  });

  await test("storage.session is not persisted", async () => {
    await bg.chrome.storage.session.set({ s: 1 });
    await tick(450);
    assert(!("s" in (JSON.parse(backend.state).local)));
  });

  await test("runtime.sendMessage popup -> background (async response)", async () => {
    bg.chrome.runtime.onMessage.addListener((req, sender, send) => {
      if (req.action === "PING") { setTimeout(() => send({ ok: true, from: sender.url }), 5); return true; }
    });
    const res = await popup.chrome.runtime.sendMessage({ action: "PING" });
    assert.strictEqual(res.ok, true);
    assert(res.from.endsWith("popup.html"));
  });

  await test("runtime.sendMessage callback style + noresp -> undefined", async () => {
    const r = await new Promise((resolve) => popup.chrome.runtime.sendMessage({ action: "NOPE" }, (x) => resolve(x)));
    assert.strictEqual(r, undefined);
  });

  await test("sender is not delivered to itself", async () => {
    let selfHit = false;
    popup.chrome.runtime.onMessage.addListener(() => { selfHit = true; });
    await popup.chrome.runtime.sendMessage({ action: "X" });
    assert(!selfHit);
  });

  await test("tabs.create/query/get/update", async () => {
    const t = await popup.chrome.tabs.create({ url: "https://student.emis.gov.eg/a", active: true });
    assert(t.id > 0);
    assert.strictEqual(backend.created[0].url, "https://student.emis.gov.eg/a");
    backend.emit("tabUpdate", t.id, { status: "complete", url: "https://student.emis.gov.eg/a", title: "T" });
    const q = await popup.chrome.tabs.query({ url: "https://student.emis.gov.eg/*" });
    assert.strictEqual(q.length, 1); assert.strictEqual(q[0].title, "T");
    const act = await popup.chrome.tabs.query({ active: true, currentWindow: true });
    assert.strictEqual(act[0].id, t.id);
    await popup.chrome.tabs.update(t.id, { url: "https://student.emis.gov.eg/b" });
    assert.strictEqual(backend.navigated.url, "https://student.emis.gov.eg/b");
    globalThis.__tab = t;
  });

  await test("tabs.onUpdated reaches background", async () => {
    let got = null;
    bg.chrome.tabs.onUpdated.addListener((id, changeInfo, tab) => { got = { id, changeInfo, tab }; });
    backend.emit("tabUpdate", globalThis.__tab.id, { status: "loading", url: "https://student.emis.gov.eg/new-load" });
    await tick(50);
    assert(got && got.changeInfo && got.changeInfo.url === "https://student.emis.gov.eg/new-load", "expected changeInfo url");
    assert(got && got.tab && got.tab.status === "loading", "expected tab status loading");
  });

  await test("scripting.executeScript func + files", async () => {
    const id = globalThis.__tab.id;
    const r = await bg.chrome.scripting.executeScript({ target: { tabId: id }, world: "ISOLATED", func: (a, b) => a + b, args: [2, 3] });
    assert.strictEqual(r[0].result, 5);
    const r2 = await bg.chrome.scripting.executeScript({ target: { tabId: id }, func: async () => { await Promise.resolve(); return "ok"; } });
    assert.strictEqual(r2[0].result, "ok");
    await assert.rejects(() => bg.chrome.scripting.executeScript({ target: { tabId: 9999 }, func: () => 1 }), /No tab with id/);
  });

  await test("tabs.sendMessage to tab context (content script) + content->bg message with sender.tab", async () => {
    // simulate a tab context using the real shim in tab mode
    const tabHandlers = [];
    const win = { console, setTimeout, JSON, Promise, Date, Math, Error, URL, location: { href: "https://student.emis.gov.eg/b", pathname: "/b" } };
    win.globalThis = win; win.window = win;
    win.neprasBridge = { send: (o) => backend.emit("tabMessage", globalThis.__tab.id, o), onMessage: (cb) => tabHandlers.push(cb) };
    backend.toTab = (id, obj) => tabHandlers.forEach((h) => h(obj));
    win.__NEPRAS_CFG__ = { mode: "tab", extBase: EXT, extId: "x", platform: "win", manifest: { version: "1" } };
    vm.createContext(win); vm.runInContext(shimSrc, win);
    win.chrome.runtime.onMessage.addListener((m, s, send) => { if (m.action === "HELLO") { send({ hi: 1 }); return true; } });
    await tick();
    const resp = await bg.chrome.tabs.sendMessage(globalThis.__tab.id, { action: "HELLO" });
    assert.deepStrictEqual(JSON.parse(JSON.stringify(resp)), { hi: 1 });

    let seen = null;
    bg.chrome.runtime.onMessage.addListener((m, s, send) => { if (m.action === "FROM_TAB") { seen = s; send({ got: true }); return true; } });
    const r = await win.chrome.runtime.sendMessage({ action: "FROM_TAB" });
    assert.strictEqual(r.got, true);
    assert.strictEqual(seen.tab.id, globalThis.__tab.id);
    assert(seen.url.startsWith("https://student.emis.gov.eg"));
    assert.strictEqual(win.chrome.tabs, undefined, "content scripts have no chrome.tabs");
    await assert.rejects(() => bg.chrome.tabs.sendMessage(4242, { a: 1 }), /Receiving end does not exist/);
  });

  await test("downloads.download data: URL saves file and fires events", async () => {
    const events = [];
    bg.chrome.downloads.onCreated.addListener((i) => events.push(["created", i.id]));
    bg.chrome.downloads.onChanged.addListener((d) => events.push(["changed", d.state && d.state.current]));
    const id = await popup.chrome.downloads.download({ url: "data:text/plain;base64," + Buffer.from("hello").toString("base64"), filename: "Nepras/Excel/a.txt", saveAs: false });
    await tick(60);
    assert.strictEqual(backend.saved[0].filename, "Nepras/Excel/a.txt");
    assert.strictEqual(Buffer.from(backend.saved[0].base64, "base64").toString(), "hello");
    assert(events.some((e) => e[0] === "created") && events.some((e) => e[1] === "complete"));
    const items = await popup.chrome.downloads.search({ id });
    assert.strictEqual(items[0].state, "complete");
    assert.strictEqual(items[0].fileSize, 5);
  });

  await test("webRequest registration reaches backend + dispatches filtered events", async () => {
    let seen = null;
    bg.chrome.webRequest.onBeforeSendHeaders.addListener((d) => { seen = d; }, { urls: ["https://studaapi.emis.gov.eg/*"] }, ["requestHeaders", "extraHeaders"]);
    await tick();
    assert.deepStrictEqual(backend.wr, ["https://studaapi.emis.gov.eg/*"]);
    backend.emit("request", "onBeforeSendHeaders", { url: "https://studaapi.emis.gov.eg/x", requestHeaders: [{ name: "Authorization", value: "Bearer t" }] });
    backend.emit("request", "onBeforeSendHeaders", { url: "https://other.example/x", requestHeaders: [] });
    await tick();
    assert(seen && seen.requestHeaders[0].value === "Bearer t");
  });

  await test("lastError set for callback-style failures", async () => {
    const err = await new Promise((resolve) => popup.chrome.tabs.get(31337, () => resolve(popup.chrome.runtime.lastError)));
    assert(err && /No tab/.test(err.message));
  });

  await test("runtime basics (getURL, manifest, platform, no offscreen)", async () => {
    assert.strictEqual(popup.chrome.runtime.getURL("a/b.js"), EXT + "a/b.js");
    assert.strictEqual(popup.chrome.offscreen, undefined);
    const info = await new Promise((r) => popup.chrome.runtime.getPlatformInfo(r));
    assert.strictEqual(info.os, "win");
  });

  console.log(`${passed} passed`);
  process.exit(process.exitCode || 0);
})();
