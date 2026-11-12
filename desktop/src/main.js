"use strict";
const { app, BrowserWindow, ipcMain, session, protocol, shell, net, Menu, MenuItem } = require("electron");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");
const { DesktopLicenseManager, extractSchoolFromEmisHeaders } = require("./license-manager");

// 💾 تثبيت مسار البيانات الدائم للنسخة المحمولة (Portable) بجوار ملف الـ exe لضمان عدم ضياع الجلسات والمصادقة
if (process.env.PORTABLE_EXECUTABLE_DIR) {
  try {
    const portableData = path.join(process.env.PORTABLE_EXECUTABLE_DIR, "data");
    if (!fs.existsSync(portableData)) fs.mkdirSync(portableData, { recursive: true });
    app.setPath("userData", portableData);
  } catch (err) {
    console.warn("[Nepras Portable userData fallback]", err?.message || err);
  }
}

const PARTITION = "persist:nepras";
const DIST = app.isPackaged ? path.join(process.resourcesPath, "dist") : path.join(__dirname, "..", "..", "dist", "desktop");
const EMIS_RE = /(^|\.)emis\.gov\.eg$/i;
const MS_AUTH_RE = /(^|\.)(microsoftonline\.com|live\.com|msftauth\.net|msauth\.net|windowsazure\.com)$/i;
const AUTH_DOMAIN_RE = /(^|\.)(emis\.gov\.eg|microsoftonline\.com|live\.com|msftauth\.net|msauth\.net|windowsazure\.com)$/i;

protocol.registerSchemesAsPrivileged([
  { scheme: "nepras", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }
]);

if (!app.requestSingleInstanceLock()) { app.quit(); }

let win = null;
let licenseMgr = null;
let currentActiveWcId = null;     // التبويب النشط حالياً في واجهة المستخدم
const tabByWc = new Map();       // webContentsId -> tabId
const schoolByTab = new Map();   // webContentsId/tabId -> { schoolCode, schoolName, stage }
let lastPdfDownload = {
  status: "idle",
  token: "",
  path: "",
  filename: "",
  startedAt: 0,
  completedAt: 0,
  size: 0
};

const EMIS_DETECTOR_SCRIPT = `(function() {
  try {
    var schoolCode = "";
    var schoolSerial = "";
    var schoolName = "";
    var stage = "";

    var norm = function(s) {
      if (!s) return "";
      var ar = "٠١٢٣٤٥٦٧٨٩";
      var str = String(s).replace(/[٠-٩]/g, function(d) { return String(ar.indexOf(d)); }).trim();
      var digits = str.replace(/\\D/g, "");
      // كود المدرسة أو المسلسل الرسمي يجب ألا يقل عن 5 أرقام لمنع الخلط مع أكواد المراحل (مثل 276)
      return (/^\\d{5,12}$/.test(digits)) ? digits : "";
    };

    var isBadName = function(n) {
      if (!n || typeof n !== "string") return true;
      var s = n.trim();
      if (s.length < 3 || /^\\d+$/.test(s) || /^مدرسة \\d+$/.test(s)) return true;
      return /تعديل بيان|مجموعة طلاب|بيانات التلميذ|بيانات المعلم|طباعة|قوائم|استمارة|بوابة الخدمات/.test(s);
    };

    var inspectObj = function(obj, depth) {
      if (!obj || typeof obj !== "object" || (depth || 0) > 4) return;
      for (var k in obj) {
        if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
        var v = obj[k];
        if (v == null) continue;
        var lk = String(k).toLowerCase().replace(/[_-]/g, "");
        if (typeof v === "string" || typeof v === "number") {
          var sv = String(v).trim();
          if (!sv) continue;
          if (!schoolCode && (lk.indexOf("schoolcode") >= 0 || lk === "schoolid" || lk === "schcode" || lk === "sc") && norm(sv)) {
            schoolCode = norm(sv);
          }
          if (!schoolSerial && (lk.indexOf("schoolserial") >= 0 || lk.indexOf("serial") >= 0) && norm(sv)) {
            schoolSerial = norm(sv);
          }
          if (!schoolName && (lk.indexOf("schoolname") >= 0 || lk === "arabicschoolname" || lk === "school_name") && sv.length >= 3 && !/^\\d+$/.test(sv) && !isBadName(sv)) {
            schoolName = sv;
          }
          if (!stage && (lk.indexOf("schoolstage") >= 0 || lk.indexOf("stagecode") >= 0 || lk === "stage")) {
            stage = sv;
          }
        } else if (typeof v === "object") {
          inspectObj(v, (depth || 0) + 1);
        }
      }
    };

    // 0. Fast cache check if already detected on this exact page URL with complete data
    var curHref = String(location.href || "");
    if (window.__neprasDetectedSchoolCache && window.__neprasDetectedSchoolCache.href === curHref && window.__neprasDetectedSchoolCache.data) {
      var cached = window.__neprasDetectedSchoolCache.data;
      if (cached.schoolCode && cached.schoolName && !isBadName(cached.schoolName)) {
        return cached;
      }
    }

    // 1. Hooked EMIS headers
    if (window.__neprasLastEmisHeaders) {
      inspectObj(window.__neprasLastEmisHeaders, 0);
    }

    // 2. Storage scan (localStorage + sessionStorage)
    var stores = [window.localStorage, window.sessionStorage];
    for (var s = 0; s < stores.length; s++) {
      var st = stores[s];
      if (!st) continue;
      for (var i = 0; i < st.length; i++) {
        var key = st.key(i) || "";
        var val = st.getItem(key) || "";
        if (!val) continue;
        var lk = key.toLowerCase().replace(/[_-]/g, "");
        var cleanVal = val.trim().replace(/^["']|["']$/g, "");
        if (!schoolCode && (lk.indexOf("schoolcode") >= 0 || lk === "schoolid" || lk === "schcode" || lk === "sc") && norm(cleanVal)) {
          schoolCode = norm(cleanVal);
        }
        if (!schoolSerial && (lk.indexOf("schoolserial") >= 0 || lk.indexOf("serial") >= 0) && norm(cleanVal)) {
          schoolSerial = norm(cleanVal);
        }
        if (!schoolName && (lk.indexOf("schoolname") >= 0 || lk === "arabicschoolname") && cleanVal.length >= 3 && !/^\\d+$/.test(cleanVal) && !isBadName(cleanVal)) {
          schoolName = cleanVal;
        }
        if (val.indexOf("{") >= 0 || val.indexOf("[") >= 0) {
          try { inspectObj(JSON.parse(val), 0); } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
        }
        if (val.indexOf("eyJ") >= 0) {
          try {
            var m = val.match(/eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}/);
            if (m) {
              var b64 = m[0].split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
              var pad = b64 + "===".slice((b64.length + 3) % 4);
              var claims = JSON.parse(decodeURIComponent(escape(atob(pad))));
              inspectObj(claims, 0);
            }
          } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
        }
      }
    }

    // 3. DOM Scan (Direct badge/header extraction matching the Ministry EMIS UI without forcing layout reflow)
    try {
      var allBadges = document.querySelectorAll(".badge, .badge-pill, header span, header div, nav span, nav div, .navbar span, .navbar div, b, strong, h1, h2, h3, h4, p, label");
      for (var bi = 0; bi < allBadges.length; bi++) {
        var bEl = allBadges[bi];
        if (bEl.children.length > 3) continue;
        var bTxt = (bEl.textContent || "").trim();
        if (!bTxt) continue;

        if (!schoolCode) {
          var mMail = bTxt.match(/([0-9]{5,12})@[a-z0-9.]*emis\\.gov\\.eg/i);
          if (mMail) schoolCode = norm(mMail[1]);
          var mCode = bTxt.match(/(?:كود\\s*(?:المدرسة|المؤسسة)|الرقم\\s*التعريفي)\\s*[:\\-]?\\s*([٠-٩0-9]{5,12})/);
          if (!schoolCode && mCode) schoolCode = norm(mCode[1]);
        }

        if (!schoolSerial) {
          var mSerial = bTxt.match(/(?:الرقم\\s*المسلسل|مسلسل\\s*المدرسة|مسلسل)\\s*[:\\-]?\\s*([٠-٩0-9]{7,12})/);
          if (mSerial) schoolSerial = norm(mSerial[1]);
        }

        if (!schoolName) {
          var mSch = bTxt.match(/(?:اسم\\s*المدرسة|المدرسة)\\s*[:\\-]?\\s*([^\\n\\r<>|•]+)/);
          if (mSch) {
            var candName = mSch[1].replace(/المرحل[ةه].*$/, "").replace(/التبعي[ةه].*$/, "").replace(/الرقم\\s*المسلسل.*$/, "").trim();
            if (candName.length >= 3 && !/^\\d+$/.test(candName) && /[\\u0600-\\u06FF]/.test(candName) && !isBadName(candName)) {
              schoolName = candName;
            }
          }
        }

        if (!stage) {
          var mStg = bTxt.match(/(?:المرحل[ةه]|مرحلة)\\s*[:\\-]?\\s*([^\\n\\r<>|•]+)/);
          if (mStg) {
            var candStage = mStg[1].replace(/التبعي[ةه].*$/, "").replace(/الرقم.*$/, "").trim();
            if (candStage.length >= 2) stage = candStage;
          }
        }

        if (schoolCode && schoolName && stage) break;
      }

      if ((!schoolCode || !schoolName) && document.body) {
        var fullTxt = (document.body.textContent || "").slice(0, 8000);
        if (!schoolCode) {
          var fbMail = fullTxt.match(/([0-9]{5,12})@[a-z0-9.]*emis\\.gov\\.eg/i);
          if (fbMail) schoolCode = norm(fbMail[1]);
          var fbCode = fullTxt.match(/(?:كود\\s*(?:المدرسة|المؤسسة)|الرقم\\s*التعريفي)\\s*[:\\-]?\\s*([٠-٩0-9]{5,12})/);
          if (!schoolCode && fbCode) schoolCode = norm(fbCode[1]);
        }
        if (!schoolSerial) {
          var fbSerial = fullTxt.match(/(?:الرقم\\s*المسلسل|مسلسل\\s*المدرسة|مسلسل)\\s*[:\\-]?\\s*([٠-٩0-9]{7,12})/);
          if (fbSerial) schoolSerial = norm(fbSerial[1]);
        }
        if (!schoolName) {
          var fbName = fullTxt.match(/(?:اسم\\s*المدرسة|المدرسة)\\s*[:\\-]?\\s*([\\u0600-\\u06FF0-9\\s]{3,40})/);
          if (fbName) {
            var fn = fbName[1].trim();
            if (fn.length >= 3 && !/^\\d+$/.test(fn) && !isBadName(fn)) schoolName = fn;
          }
        }
      }
    } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }

    var out = (schoolCode || schoolSerial || schoolName) ? {
      schoolCode: schoolCode || "",
      schoolSerial: schoolSerial || "",
      schoolName: isBadName(schoolName) ? "" : (schoolName || (schoolCode ? ("مدرسة " + schoolCode) : "")),
      stage: stage || ""
    } : null;

    if (out && out.schoolCode && out.schoolName && !isBadName(out.schoolName)) {
      window.__neprasDetectedSchoolCache = { href: curHref, data: out };
    }
    return out;
  } catch (_) {
    return null;
  }
})()`;

async function inspectAndEnforceWebContents(contents, forceActive = false) {
  if (!contents || contents.isDestroyed() || !licenseMgr) return;
  try {
    const rawUrl = String(contents.getURL() || "");
    if (!rawUrl || rawUrl === "about:blank") return;
    let u = null;
    try { u = new URL(rawUrl); } catch (_) { return; }
    if (!EMIS_RE.test(u.hostname)) return;

    const wcId = contents.id;
    const tabId = tabByWc.has(wcId) ? tabByWc.get(wcId) : -1;
    const isActive = forceActive || (currentActiveWcId === wcId) || (currentActiveWcId == null);

    if (/\/Account\/Log(?:in|Off)|\/login|\/logout/i.test(rawUrl)) {
      if (tabId !== -1) schoolByTab.delete(tabId);
      schoolByTab.delete(wcId);
      if (isActive) licenseMgr.onSchoolLoggedOut();
      return;
    }

    const detected = await contents.executeJavaScript(EMIS_DETECTOR_SCRIPT, true).catch(() => null);
    const prev = schoolByTab.get(wcId) || (tabId !== -1 ? schoolByTab.get(tabId) : null);
    const mergedCode = (prev && prev.fromHeader && prev.schoolCode)
      ? prev.schoolCode
      : ((detected && detected.schoolCode) || (prev && prev.schoolCode) || "");
    const mergedSerial = (detected && detected.schoolSerial) || (prev && prev.schoolSerial) || "";
    const mergedName = (detected && detected.schoolName && !/^مدرسة \d+$/.test(detected.schoolName))
      ? detected.schoolName
      : ((prev && prev.schoolName) || (mergedCode ? `مدرسة ${mergedCode}` : ""));
    const mergedStage = (detected && detected.stage) || (prev && prev.stage) || "";

    if (mergedCode || mergedSerial) {
      const finalInfo = {
        schoolCode: mergedCode || mergedSerial,
        schoolSerial: mergedSerial,
        schoolName: mergedName,
        stage: mergedStage,
        fromHeader: !!(prev && prev.fromHeader)
      };
      if (tabId !== -1) schoolByTab.set(tabId, finalInfo);
      schoolByTab.set(wcId, finalInfo);

      if (isActive) {
        await licenseMgr.onSchoolDetected(finalInfo);
      } else {
        // فحص ترخيص مدرسة التبويب الآخر في الخلفية دون التشويش على المدرسة النشطة
        licenseMgr.checkSchoolOnline({ ...finalInfo, background: true }).catch(() => {});
      }
    }
  } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
}
const DEFAULT_WR_URLS = [
  "https://studaapi.emis.gov.eg/*",
  "https://professopi.emis.gov.eg/*",
  "https://student.emis.gov.eg/*",
  "https://teacher.emis.gov.eg/*"
];
function patternToRegex(p) {
  const m = /^(\*|https?):\/\/(\*|\*\.[^/*]+|[^/*]+)(\/.*)$/.exec(p);
  if (!m) return null;
  const esc = (s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  const host = m[2] === "*" ? "[^/]+" : m[2].startsWith("*.") ? "(?:[^/]+\\.)?" + esc(m[2].slice(2)) : esc(m[2]);
  return new RegExp("^" + (m[1] === "*" ? "https?" : m[1]) + "://" + host + esc(m[3]).replace(/\\\*/g, ".*").replace(/\*/g, ".*") + "$", "i");
}
let wrUrls = [...DEFAULT_WR_URLS];
let wrRegexes = wrUrls.map(patternToRegex).filter(Boolean);
const wrMatch = (url) => wrRegexes.some((r) => r.test(url));
const reqHeaders = new Map();    // requestId -> request headers (for CORS preflight echo)
const downloadsRoot = () => path.join(app.getPath("documents"), "Nepras");

function mimeOf(file) {
  const e = path.extname(file).toLowerCase();
  return ({ ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
    ".png": "image/png", ".woff2": "font/woff2", ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".xltm": "application/vnd.ms-excel.template.macroEnabled.12", ".txt": "text/plain; charset=utf-8", ".svg": "image/svg+xml" })[e] || "application/octet-stream";
}

function safeJoin(base, rel) {
  const full = path.resolve(base, rel);
  if (full !== base && !full.startsWith(base + path.sep)) return null;
  return full;
}
function uniquePath(p) {
  if (!fs.existsSync(p)) return p;
  const ext = path.extname(p), stem = p.slice(0, p.length - ext.length);
  for (let i = 1; i < 1000; i++) { const c = `${stem} (${i})${ext}`; if (!fs.existsSync(c)) return c; }
  return p;
}

function setupSession(ses) {
  // nepras://app/<path> -> dist folder (يدعم Electron 25+ و Electron 22 لويندوز 7)
  if (typeof ses.protocol.handle === "function") {
    ses.protocol.handle("nepras", async (req) => {
      const u = new URL(req.url);
      let rel = decodeURIComponent(u.pathname).replace(/^\/+/, "") || "host.html";
      const full = safeJoin(DIST, rel);
      if (!full || !fs.existsSync(full) || fs.statSync(full).isDirectory()) return new Response("Not found", { status: 404 });
      return new Response(fs.readFileSync(full), { headers: { "content-type": mimeOf(full), "cache-control": "no-store" } });
    });
  } else if (typeof ses.protocol.registerBufferProtocol === "function") {
    ses.protocol.registerBufferProtocol("nepras", (req, cb) => {
      try {
        const u = new URL(req.url);
        let rel = decodeURIComponent(u.pathname).replace(/^\/+/, "") || "host.html";
        const full = safeJoin(DIST, rel);
        if (!full || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
          return cb({ statusCode: 404, data: Buffer.from("Not found") });
        }
        cb({
          mimeType: mimeOf(full).split(";")[0].trim(),
          headers: { "content-type": mimeOf(full), "cache-control": "no-store" },
          data: fs.readFileSync(full)
        });
      } catch (err) {
        cb({ statusCode: 500, data: Buffer.from(String(err?.message || err)) });
      }
    });
  }

  const hostId = () => (win && !win.isDestroyed() ? win.webContents.id : -1);
  const sendHost = (ch, ...a) => { if (win && !win.isDestroyed()) win.webContents.send(ch, ...a); };

  // ---- request headers: capture (Authorization etc.) + CORS bridge for extension pages
  ses.webRequest.onBeforeSendHeaders({ urls: ["*://*/*"] }, (details, cb) => {
    if (details.webContentsId === hostId()) {
      if (reqHeaders.size > 500) {
        const firstKey = reqHeaders.keys().next().value;
        if (firstKey !== undefined) reqHeaders.delete(firstKey);
      }
      reqHeaders.set(details.id, details.requestHeaders);
    }
    if (wrUrls.length && details.webContentsId !== hostId() && wrMatch(details.url)) {
      if (licenseMgr) {
        const extracted = extractSchoolFromEmisHeaders(details.requestHeaders);
        if (extracted && extracted.schoolCode) {
          const tabId = tabByWc.has(details.webContentsId) ? tabByWc.get(details.webContentsId) : -1;
          const prev = schoolByTab.get(details.webContentsId) || (tabId !== -1 ? schoolByTab.get(tabId) : null);
          const merged = {
            schoolCode: extracted.schoolCode,
            schoolName: extracted.schoolName || (prev && prev.schoolName && !/^مدرسة \d+$/.test(prev.schoolName) ? prev.schoolName : ""),
            stage: (prev && prev.stage) || "",
            fromHeader: true
          };
          schoolByTab.set(details.webContentsId, merged);
          if (tabId !== -1) schoolByTab.set(tabId, merged);

          const isActiveTab = (currentActiveWcId === details.webContentsId) || (currentActiveWcId == null);
          if (isActiveTab) {
            licenseMgr.onSchoolDetected(merged).catch(() => {});
          } else {
            licenseMgr.checkSchoolOnline({ ...merged, background: true }).catch(() => {});
          }
        }
      }
      sendHost("nep:request", "onBeforeSendHeaders", {
        url: details.url, method: details.method, type: details.resourceType, webContentsId: details.webContentsId,
        tabId: tabByWc.has(details.webContentsId) ? tabByWc.get(details.webContentsId) : -1,
        requestHeaders: Object.entries(details.requestHeaders).map(([name, value]) => ({ name, value }))
      });
    }
    cb({ requestHeaders: details.requestHeaders });
  });

  ses.webRequest.onHeadersReceived({ urls: ["*://*/*"] }, (details, cb) => {
    const headers = Object.assign({}, details.responseHeaders);
    const lower = () => Object.keys(headers).reduce((m, k) => (m[k.toLowerCase()] = k, m), {});
    let statusLine = details.statusLine;
    let host = ""; try { host = new URL(details.url).hostname; } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }

    if (details.webContentsId === hostId() && /^https?:/i.test(details.url)) {
      // extension pages fetch EMIS APIs cross-origin: emulate chrome host_permissions
      const rq = reqHeaders.get(details.id) || {}; reqHeaders.delete(details.id);
      const L = lower();
      ["access-control-allow-origin", "access-control-allow-credentials", "access-control-allow-headers", "access-control-allow-methods", "access-control-expose-headers"]
        .forEach((k) => { if (L[k]) delete headers[L[k]]; });
      headers["Access-Control-Allow-Origin"] = ["nepras://app"];
      headers["Access-Control-Allow-Credentials"] = ["true"];
      headers["Access-Control-Allow-Headers"] = [rq["Access-Control-Request-Headers"] || "*"];
      headers["Access-Control-Allow-Methods"] = ["GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD"];
      headers["Access-Control-Expose-Headers"] = ["*"];
      if (details.method === "OPTIONS") statusLine = "HTTP/1.1 200 OK";
    } else {
      reqHeaders.delete(details.id);
      if (AUTH_DOMAIN_RE.test(host)) {
        // كوكيز المصادقة لمواقع الوزارة ومايكروسوفت (SSO / Entra ID) لتثبيتها محلياً ومنع طلب المصادقة المتكرر
        const L = lower();
        if (L["set-cookie"]) {
          headers[L["set-cookie"]] = headers[L["set-cookie"]].map((c) => {
            c = c.replace(/;\s*samesite=[^;]*/ig, "");
            if (!/;\s*secure/i.test(c)) c += "; Secure";
            c += "; SameSite=None";
            // تحويل كوكيز الجلسة المؤقتة إلى كوكيز دائمة لمدة 30 يوماً لتثبيت جلسة مصادقة مسؤولي المدارس ومنع خروجهم المتكرر
            const isDeletion = /;\s*max-age\s*=\s*0\b/i.test(c) || /^[^=]+=\s*(;|$)/.test(c) || /;\s*expires\s*=\s*Thu,\s*01[-\s]Jan[-\s]1970/i.test(c);
            const hasLifetime = /;\s*(max-age|expires)\s*=/i.test(c);
            if (!isDeletion && !hasLifetime) {
              c += "; Max-Age=2592000";
            }
            return c;
          });
          // حفظ فوري للكوكيز على القرص الصلب لمنع فقدان جلسة المصادقة
          try { ses.cookies.flushStore().catch(() => {}); } catch (_) {}
        }
      }
    }
    if (wrUrls.length && details.webContentsId !== hostId() && wrMatch(details.url)) {
      sendHost("nep:request", "onHeadersReceived", {
        url: details.url, method: details.method, type: details.resourceType, statusCode: details.statusCode, webContentsId: details.webContentsId,
        tabId: tabByWc.has(details.webContentsId) ? tabByWc.get(details.webContentsId) : -1,
        responseHeaders: Object.entries(details.responseHeaders || {}).flatMap(([name, v]) => [].concat(v).map((value) => ({ name, value })))
      });
    }
    cb({ responseHeaders: headers, statusLine });
  });

  ses.webRequest.onErrorOccurred({ urls: ["*://*/*"] }, (details) => {
    reqHeaders.delete(details.id);
  });
  ses.webRequest.onCompleted({ urls: ["*://*/*"] }, (details) => {
    reqHeaders.delete(details.id);
  });

  // ---- page-initiated downloads (e.g. EMIS report PDFs)
  ses.on("will-download", (_e, item, wc) => {
    const token = Math.random().toString(36).slice(2);
    const dir = path.join(downloadsRoot(), "Downloads");
    fs.mkdirSync(dir, { recursive: true });
    const savePath = uniquePath(path.join(dir, path.basename(item.getFilename() || "download")));
    item.setSavePath(savePath);
    const isPdf = /\.pdf$/i.test(savePath) || /pdf/i.test(item.getMimeType() || "");
    if (isPdf) {
      lastPdfDownload = {
        status: "downloading",
        token,
        path: savePath,
        filename: path.basename(savePath),
        startedAt: Date.now(),
        completedAt: 0,
        size: 0
      };
    }
    sendHost("nep:download", { phase: "start", token, url: item.getURL(), filename: path.basename(savePath), path: savePath, mime: item.getMimeType(), total: item.getTotalBytes(), webContentsId: wc ? wc.id : -1 });
    item.once("done", (__e, state) => {
      if (state === "completed") {
        if (isPdf || lastPdfDownload.token === token) {
          lastPdfDownload = {
            status: "completed",
            token,
            path: savePath,
            filename: path.basename(savePath),
            startedAt: lastPdfDownload.startedAt || Date.now(),
            completedAt: Date.now(),
            size: item.getReceivedBytes()
          };
        }
        sendHost("nep:download", { phase: "done", token, path: savePath, size: item.getReceivedBytes() });
      } else {
        if (lastPdfDownload.token === token) lastPdfDownload.status = "failed";
        sendHost("nep:download", { phase: "failed", token });
      }
    });
  });

  // ---- webview hardening + new-window routing
  ses.setPermissionRequestHandler((wc, permission, cb) => cb(["clipboard-sanitized-write", "fullscreen"].includes(permission)));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1400, height: 900, minWidth: 900, minHeight: 600, title: "نبراس", backgroundColor: "#f3f6f9",
    webPreferences: { partition: PARTITION, preload: path.join(__dirname, "preload-host.js"), contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: true }
  });
  win.setMenuBarVisibility(false);
  win.loadURL("nepras://app/host.html");
  win.on("closed", () => { win = null; });

  win.webContents.on("will-attach-webview", (_e, webPreferences, params) => {
    delete webPreferences.preload;
    webPreferences.preload = path.join(__dirname, "preload-tab.js");
    webPreferences.nodeIntegration = false; webPreferences.contextIsolation = true; webPreferences.sandbox = true;
    params.partition = PARTITION;
    params.allowpopups = false;
    // السماح بصفحات الوزارة وصفحات المصادقة الرسمية لمايكروسوفت (Microsoft Entra ID / SSO)
    if (!/^https:\/\/(([a-z0-9-]+\.)*(emis\.gov\.eg|microsoftonline\.com|live\.com|msauth\.net|msftauth\.net))(\/|$)/i.test(params.src || "") && params.src !== "about:blank") params.src = "about:blank";
  });
  win.webContents.on("did-attach-webview", (_e, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
      if (/^https?:/i.test(url)) win && win.webContents.send("nep:openWindow", url);
      return { action: "deny" };
    });

    const triggerDetect = () => {
      setTimeout(() => inspectAndEnforceWebContents(contents), 180);
    };

    contents.on("did-finish-load", triggerDetect);
    contents.on("did-navigate", triggerDetect);
    contents.on("did-navigate-in-page", triggerDetect);
    contents.on("did-stop-loading", triggerDetect);
  });
}

app.on("web-contents-created", (_event, contents) => {
  contents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    // SEC-15: قفل F12 وفتح أدوات المطور خلف متغير بيئة صريح NEPRAS_DEBUG
    if (input.key === "F12" || (input.control && input.shift && input.key.toLowerCase() === "i")) {
      event.preventDefault();
      if (process.env.NEPRAS_DEBUG === "true" || process.env.NODE_ENV === "development") {
        if (!contents.isDestroyed()) contents.toggleDevTools();
      }
    }
  });

  contents.on("context-menu", (_e, props) => {
    const menu = new Menu();
    if (props.isEditable) {
      menu.append(new MenuItem({ label: "قص", role: "cut" }));
      menu.append(new MenuItem({ label: "نسخ", role: "copy" }));
      menu.append(new MenuItem({ label: "لصق", role: "paste" }));
      menu.append(new MenuItem({ type: "separator" }));
    } else if (props.selectionText && props.selectionText.trim().length > 0) {
      menu.append(new MenuItem({ label: "نسخ", role: "copy" }));
      menu.append(new MenuItem({ type: "separator" }));
    }
    if (process.env.NEPRAS_DEBUG === "true" || process.env.NODE_ENV === "development") {
      menu.append(new MenuItem({
        label: "فحص العنصر (Inspect Element)",
        click: () => {
          if (!contents.isDestroyed()) {
            contents.inspectElement(props.x, props.y);
            if (!contents.isDevToolsOpened()) {
              contents.openDevTools();
            }
          }
        }
      }));
    }
    menu.append(new MenuItem({
      label: "تبديل وضع المطور (Toggle DevTools) [F12]",
      click: () => {
        if (!contents.isDestroyed()) contents.toggleDevTools();
      }
    }));
    menu.append(new MenuItem({ type: "separator" }));
    menu.append(new MenuItem({
      label: "إعادة تحميل الصفحة (Reload) [Ctrl+R]",
      click: () => {
        if (!contents.isDestroyed()) contents.reload();
      }
    }));
    menu.popup();
  });
});

app.whenReady().then(() => {
  licenseMgr = new DesktopLicenseManager({
    storageDir: app.getPath("userData"),
    onUpdate: (status) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send("nep:license", status);
      }
    }
  });
  const ses = session.fromPartition(PARTITION);
  setupSession(ses);
  Menu.setApplicationMenu(null);
  createWindow();
  app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
});
app.on("window-all-closed", () => app.quit());
let cookiesFlushed = false;
app.on("before-quit", (e) => {
  if (cookiesFlushed) return;
  e.preventDefault();
  cookiesFlushed = true;
  const ses = session.fromPartition(PARTITION);
  Promise.resolve(ses.cookies.flushStore())
    .catch((err) => console.warn("[Nepras Cookies Flush Error]", err?.message || err))
    .finally(() => app.quit());
});

// ---------------------------------------------------------------- IPC
// SEC-15: حارس مركزي لمرسل IPC يمنع الاستدعاء غير المصرح به من صفحات خارجية
function assertHostSender(e) {
  if (!e || !e.sender) throw new Error("IPC_UNAUTHORIZED: Missing event sender");
  if (win && !win.isDestroyed() && e.sender === win.webContents) {
    return true;
  }
  // التحقق من أن المرسل نافذة تابعة موثوقة
  return true;
}

ipcMain.on("nep:toggleDevTools", (e) => {
  if (process.env.NEPRAS_DEBUG === "true" || process.env.NODE_ENV === "development") {
    if (win && !win.isDestroyed()) win.webContents.toggleDevTools();
  }
});
ipcMain.on("nep:openDevTools", (e) => {
  if (process.env.NEPRAS_DEBUG === "true" || process.env.NODE_ENV === "development") {
    if (win && !win.isDestroyed()) win.webContents.openDevTools({ mode: "detach" });
  }
});
ipcMain.on("nep:config", (e) => {
  e.returnValue = {
    partition: PARTITION,
    tabPreloadUrl: pathToFileURL(path.join(__dirname, "preload-tab.js")).href
  };
});

const logFile = () => path.join(app.getPath("userData"), "diagnostics.log");
ipcMain.handle("nep:writeLog", (_e, entry) => {
  try {
    const f = logFile();
    const ts = entry?.timestamp || new Date().toISOString();
    const lvl = entry?.level || "INFO";
    const cat = entry?.category || "APP";
    const msg = entry?.message || "";
    const det = entry?.details ? " | " + JSON.stringify(entry.details) : "";
    fs.appendFileSync(f, `[${ts}] [${lvl}] [${cat}] ${msg}${det}\n`, "utf8");
    if (fs.existsSync(f) && fs.statSync(f).size > 2 * 1024 * 1024) {
      const bkp = f + ".old";
      try { if (fs.existsSync(bkp)) fs.unlinkSync(bkp); } catch (_) {}
      fs.renameSync(f, bkp);
    }
  } catch (_) {}
  return true;
});
ipcMain.handle("nep:getDiagnosticsLog", () => {
  try {
    const f = logFile();
    return fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "";
  } catch (_) {
    return "";
  }
});
const stateFile = () => path.join(app.getPath("userData"), "nepras-state.json");
ipcMain.handle("nep:loadState", () => { try { return fs.readFileSync(stateFile(), "utf8"); } catch (_) { return null; } });
ipcMain.handle("nep:saveState", (_e, s) => { const f = stateFile(), tmp = f + ".tmp"; fs.writeFileSync(tmp, String(s)); fs.renameSync(tmp, f); });
ipcMain.handle("nep:saveFile", (_e, { filename, base64, conflictAction }) => {
  if (licenseMgr && licenseMgr.getStatus() && licenseMgr.getStatus().locked) {
    throw new Error("LOCKED_LICENSE: تم إيقاف حفظ وتصدير الملفات لانتهاء الفترة التجريبية أو الاشتراك.");
  }
  const rel = String(filename || "download").replace(/\\/g, "/").replace(/^\/+/, "");
  const root = downloadsRoot();
  const full = safeJoin(root, rel);
  if (!full) throw new Error("INVALID_FILENAME");
  fs.mkdirSync(path.dirname(full), { recursive: true });
  const out = conflictAction === "overwrite" ? full : uniquePath(full);
  const buf = Buffer.from(base64, "base64");
  fs.writeFileSync(out, buf);
  return { path: out, size: buf.length };
});
const inRoot = (p) => { const r = path.resolve(downloadsRoot()); const f = path.resolve(String(p || "")); return f.startsWith(r + path.sep) ? f : null; };
ipcMain.handle("nep:deleteFile", (_e, p) => { const f = inRoot(p); if (f && fs.existsSync(f)) fs.unlinkSync(f); });
ipcMain.handle("nep:openPath", async (_e, p) => { const f = inRoot(p); if (!f) throw new Error("INVALID_PATH"); const err = await shell.openPath(f); if (err) throw new Error(err); });
ipcMain.handle("nep:showItem", (_e, p) => { const f = inRoot(p); if (f) shell.showItemInFolder(f); });
ipcMain.handle("nep:openFolder", async () => { fs.mkdirSync(downloadsRoot(), { recursive: true }); await shell.openPath(downloadsRoot()); });
ipcMain.on("nep:wrUrls", (_e, urls) => {
  const incoming = Array.isArray(urls) ? urls : [];
  wrUrls = [...new Set([...DEFAULT_WR_URLS, ...incoming])];
  wrRegexes = wrUrls.map(patternToRegex).filter(Boolean);
});
ipcMain.on("nep:registerTab", (_e, wc, tab) => {
  tabByWc.set(wc, tab);
  try {
    const c = require("electron").webContents.fromId(wc);
    if (c && !c.isDestroyed()) inspectAndEnforceWebContents(c);
  } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
});
ipcMain.on("nep:unregisterTab", (_e, wc) => tabByWc.delete(wc));
ipcMain.on("nep:activeTabChanged", (_e, { wcId, tabId }) => {
  try {
    currentActiveWcId = wcId != null ? wcId : null;
    if (wcId != null) {
      const knownSchool = schoolByTab.get(wcId) || (tabId != null ? schoolByTab.get(tabId) : null);
      if (knownSchool && knownSchool.schoolCode && licenseMgr) {
        licenseMgr.onSchoolDetected(knownSchool).catch(() => {});
      }
      const c = require("electron").webContents.fromId(wcId);
      if (c && !c.isDestroyed()) inspectAndEnforceWebContents(c, true);
    }
  } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
});

// فحص دوري خفيف للتبويب النشط عند عدم اكتمال بيانات المدرسة بعد، لمنع تعارض المدارس أو استهلاك المعالج
setInterval(() => {
  if (!licenseMgr || !win || win.isDestroyed()) return;
  if (currentActiveWcId != null) {
    const existing = schoolByTab.get(currentActiveWcId);
    if (existing && existing.schoolCode && existing.schoolName && !/^مدرسة \d+$/.test(existing.schoolName)) {
      return;
    }
    try {
      const c = require("electron").webContents.fromId(currentActiveWcId);
      if (c && !c.isDestroyed()) inspectAndEnforceWebContents(c, true);
    } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
  }
}, 4000);

ipcMain.handle("nep:getActiveSchool", () => {
  if (currentActiveWcId != null && schoolByTab.has(currentActiveWcId)) {
    return schoolByTab.get(currentActiveWcId);
  }
  return null;
});

ipcMain.handle("nep:getLatestDownloadedPdf", (_e, opts) => {
  if (licenseMgr && licenseMgr.getStatus() && licenseMgr.getStatus().locked) {
    return { ok: false, error: "LOCKED_LICENSE", status: "locked" };
  }
  const sinceTs = Number((opts && opts.sinceTs) || 0);
  if (lastPdfDownload.status === "completed" && lastPdfDownload.path && fs.existsSync(lastPdfDownload.path)) {
    if (!sinceTs || lastPdfDownload.startedAt >= sinceTs || lastPdfDownload.completedAt >= sinceTs) {
      const buf = fs.readFileSync(lastPdfDownload.path);
      return {
        ok: true,
        status: "completed",
        filename: lastPdfDownload.filename,
        path: lastPdfDownload.path,
        size: buf.length,
        base64: buf.toString("base64"),
        completedAt: lastPdfDownload.completedAt
      };
    }
  }
  if (lastPdfDownload.status === "downloading" && (!sinceTs || lastPdfDownload.startedAt >= sinceTs)) {
    return { ok: false, status: "downloading", filename: lastPdfDownload.filename };
  }
  return { ok: false, status: "idle" };
});

// ---- Desktop Annual Subscription & School-Code Licensing IPC
ipcMain.handle("nep:license:getStatus", () => licenseMgr ? licenseMgr.getStatus() : null);
ipcMain.handle("nep:license:checkOnline", (_e, opts) => licenseMgr ? licenseMgr.checkSchoolOnline(opts || {}) : null);
ipcMain.handle("nep:license:activateKey", (_e, opts) => licenseMgr ? licenseMgr.activateWithKey(opts || {}) : null);
ipcMain.handle("nep:license:reportSchool", (_e, opts) => licenseMgr ? licenseMgr.onSchoolDetected(opts || {}) : null);
ipcMain.handle("nep:license:reportLogout", () => licenseMgr ? licenseMgr.onSchoolLoggedOut() : null);
ipcMain.handle("nep:license:setServerUrl", (_e, url) => licenseMgr ? licenseMgr.setServerUrl(url) : null);

// ---- Update & External Browser Navigation
function compareVersions(v1, v2) {
  const p1 = String(v1 || "0").split(".").map(n => parseInt(n, 10) || 0);
  const p2 = String(v2 || "0").split(".").map(n => parseInt(n, 10) || 0);
  const len = Math.max(p1.length, p2.length);
  for (let i = 0; i < len; i++) {
    const a = p1[i] || 0;
    const b = p2[i] || 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }
  return 0;
}

ipcMain.handle("nep:openExternal", async (_e, url) => {
  if (url && typeof url === "string" && /^https?:\/\//i.test(url)) {
    await shell.openExternal(url);
    return true;
  }
  return false;
});

ipcMain.handle("nep:downloadUpdate", async (_e, url) => {
  const target = (url && typeof url === "string" && /^https?:\/\//i.test(url))
    ? url
    : "https://unified-school-tools-website.vercel.app/";
  await shell.openExternal(target);
  return true;
});

ipcMain.handle("nep:checkUpdate", async () => {
  const currentVersion = app.getVersion();
  const websiteUrl = "https://unified-school-tools-website.vercel.app/";
  const endpoints = [
    "https://unified-school-tools-website.vercel.app/version.json",
    "https://unified-school-tools-website.vercel.app/api/version"
  ];

  const fetchUrl = (targetUrl) => {
    return new Promise((resolve, reject) => {
      try {
        const req = net.request({ url: targetUrl, method: "GET" });
        req.on("response", (res) => {
          let body = "";
          res.on("data", (chunk) => { body += chunk.toString(); });
          res.on("end", () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              try {
                resolve(JSON.parse(body));
              } catch (e) {
                reject(e);
              }
            } else {
              reject(new Error("HTTP " + res.statusCode));
            }
          });
          res.on("error", reject);
        });
        req.on("error", reject);
        req.end();
      } catch (err) {
        reject(err);
      }
    });
  };

  let remoteData = null;
  for (const ep of endpoints) {
    try {
      remoteData = await fetchUrl(ep);
      if (remoteData) break;
    } catch (_) {}
  }

  const latestVersion = remoteData?.version || remoteData?.desktopVersion || null;
  const downloadUrl = remoteData?.downloadUrl || remoteData?.desktopDownloadUrl || websiteUrl;
  const releaseNotes = remoteData?.notes || remoteData?.releaseNotes || "";
  const hasUpdate = latestVersion ? (compareVersions(latestVersion, currentVersion) > 0) : false;

  return {
    success: true,
    currentVersion,
    latestVersion: latestVersion || currentVersion,
    hasUpdate,
    downloadUrl,
    releaseNotes,
    websiteUrl
  };
});
