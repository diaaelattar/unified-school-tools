"use strict";
// Preload for the EMIS <webview>. Bridges the isolated "content-script" world (where the chrome.* shim lives)
// to the host page. Page scripts (MAIN world) never see the bridge.
const { contextBridge, ipcRenderer, webFrame } = require("electron");
const WORLD = 1004;
const listeners = [];

// 🔐 استعادة وحفظ جلسة الدخول وتوكن المصادقة (sessionStorage <-> localStorage) والتقاط ملفات الـ PDF قبل إقلاع Angular
const EARLY_MAIN_BOOTSTRAP = `(function() {
  try {
    if (window.__neprasEarlyBootstrapped) return;
    window.__neprasEarlyBootstrapped = true;

    var host = String(location.hostname || "");
    var path = String(location.pathname || "");
    var isEmis = /(^|\\.)emis\\.gov\\.eg$/i.test(host);
    var BACKUP_KEY = "__nepras_session_backup_v1__";

    if (isEmis && window.localStorage && window.sessionStorage) {
      // إذا ضغط المستخدم على تسجيل الخروج الصريح، نمسح النسخة الاحتياطية للجلسة
      if (/\\/logout|\\/LogOff/i.test(path)) {
        try { localStorage.removeItem(BACKUP_KEY); } catch (_) {}
      } else {
        // 1. استعادة sessionStorage فوراً من النسخة الاحتياطية في localStorage قبل إقلاع Angular
        try {
          var rawBackup = localStorage.getItem(BACKUP_KEY);
          if (rawBackup) {
            var parsed = JSON.parse(rawBackup);
            if (parsed && typeof parsed === "object") {
              var keys = Object.keys(parsed);
              for (var i = 0; i < keys.length; i++) {
                var k = keys[i];
                if (k && k !== BACKUP_KEY && sessionStorage.getItem(k) == null && parsed[k] != null) {
                  sessionStorage.setItem(k, String(parsed[k]));
                }
              }
            }
          }
        } catch (_) {}

        // 2. دالة مزامنة sessionStorage إلى localStorage للحفاظ على التوكن عند إغلاق البرنامج أو فتح تبويب جديد
        if (!window.__neprasSessionBackupActive) {
          window.__neprasSessionBackupActive = true;
          var syncTimer = null;
          var syncSessionToBackup = function() {
            syncTimer = null;
            try {
              if (/\\/logout|\\/LogOff/i.test(location.pathname || "")) return;
              var snap = {};
              var hasAuthData = false;
              for (var j = 0; j < sessionStorage.length; j++) {
                var sk = sessionStorage.key(j);
                if (!sk || sk === BACKUP_KEY) continue;
                var sv = sessionStorage.getItem(sk);
                if (sv != null && sv !== "") {
                  snap[sk] = sv;
                  hasAuthData = true;
                }
              }
              if (hasAuthData) {
                localStorage.setItem(BACKUP_KEY, JSON.stringify(snap));
              }
            } catch (_) {}
          };
          var scheduleSync = function() {
            if (syncTimer) return;
            syncTimer = setTimeout(syncSessionToBackup, 600);
          };

          var origSetItem = Storage.prototype.setItem;
          var origRemoveItem = Storage.prototype.removeItem;
          var origClear = Storage.prototype.clear;

          Storage.prototype.setItem = function(k, v) {
            var res = origSetItem.apply(this, arguments);
            if (this === window.sessionStorage) scheduleSync();
            return res;
          };
          Storage.prototype.removeItem = function(k) {
            var res = origRemoveItem.apply(this, arguments);
            if (this === window.sessionStorage && /\\/logout|\\/LogOff/i.test(location.pathname || "")) {
              try { localStorage.removeItem(BACKUP_KEY); } catch (_) {}
            } else if (this === window.sessionStorage) {
              scheduleSync();
            }
            return res;
          };
          Storage.prototype.clear = function() {
            var res = origClear.apply(this, arguments);
            if (this === window.sessionStorage && /\\/logout|\\/LogOff|\\/login/i.test(location.pathname || "")) {
              try { localStorage.removeItem(BACKUP_KEY); } catch (_) {}
            }
            return res;
          };

          // مزامنة أولية وعند إغلاق/إخفاء التبويب دون إجهاد المعالج بحلقة مستمرة
          syncSessionToBackup();
          window.addEventListener("pagehide", syncSessionToBackup);
          document.addEventListener("visibilitychange", function() {
            if (document.visibilityState === "hidden") syncSessionToBackup();
          });
        }

        // 3. استعادة وحفظ هيدرات المصادقة (Authorization / schoolcode / schoolstage / usertype) مبكراً قبل إقلاع Angular
        var HEADERS_BACKUP_KEY = "__nepras_emis_headers_v1__";
        window.__neprasLastEmisHeaders = window.__neprasLastEmisHeaders || {};
        try {
          var rawHdrs = localStorage.getItem(HEADERS_BACKUP_KEY);
          if (rawHdrs) {
            var parsedHdrs = JSON.parse(rawHdrs);
            if (parsedHdrs && typeof parsedHdrs === "object") {
              Object.assign(window.__neprasLastEmisHeaders, parsedHdrs);
            }
          }
        } catch (_) {}

        if (!window.__neprasXhrHooked) {
          window.__neprasXhrHooked = true;
          var saveHdr = function(k, v) {
            var lk = String(k || "").toLowerCase();
            if (["authorization", "schoolcode", "schoolstage", "usertype", "ut", "ed", "md", "sc", "ty"].indexOf(lk) >= 0 && v != null && String(v) !== "") {
              window.__neprasLastEmisHeaders[lk] = String(v);
              try { localStorage.setItem(HEADERS_BACKUP_KEY, JSON.stringify(window.__neprasLastEmisHeaders)); } catch (_) {}
            }
          };
          var origSetReqHeader = XMLHttpRequest.prototype.setRequestHeader;
          XMLHttpRequest.prototype.setRequestHeader = function(k, v) {
            try { saveHdr(k, v); } catch (_) {}
            return origSetReqHeader.apply(this, arguments);
          };
          var origWinFetch = window.fetch;
          if (typeof origWinFetch === "function") {
            window.fetch = function(input, init) {
              try {
                var h = init && init.headers;
                if (h) {
                  if (typeof h.forEach === "function") h.forEach(function(v, k) { saveHdr(k, v); });
                  else if (Array.isArray(h)) h.forEach(function(pair) { if (pair) saveHdr(pair[0], pair[1]); });
                  else if (typeof h === "object") Object.keys(h).forEach(function(k) { saveHdr(k, h[k]); });
                }
              } catch (_) {}
              return origWinFetch.apply(this, arguments);
            };
          }
        }
      }
    }

    // 📄 اعتراض والتقاط ملفات الـ PDF المُنشأة عبر Blob (URL.createObjectURL) في صفحات الوزارة
    if (typeof URL !== "undefined" && typeof URL.createObjectURL === "function" && !URL.__neprasPdfHooked) {
      URL.__neprasPdfHooked = true;
      var origCreateObjectURL = URL.createObjectURL;
      URL.createObjectURL = function(obj) {
        try {
          if (obj && typeof Blob !== "undefined" && obj instanceof Blob) {
            var isPdfBlob = /pdf/i.test(obj.type || "") || (obj.size > 100 && obj.size < 50 * 1024 * 1024);
            if (isPdfBlob) {
              obj.arrayBuffer().then(function(ab) {
                var u8 = new Uint8Array(ab);
                if (u8.length > 4 && u8[0] === 0x25 && u8[1] === 0x50 && u8[2] === 0x44 && u8[3] === 0x46) {
                  var bin = "";
                  var CH = 0x8000;
                  for (var idx = 0; idx < u8.length; idx += CH) {
                    bin += String.fromCharCode.apply(null, u8.subarray(idx, idx + CH));
                  }
                  window.__neprasCapturedPdf = {
                    base64: btoa(bin),
                    size: u8.length,
                    ts: Date.now()
                  };
                }
              }).catch(function() {});
            }
          }
        } catch (_) {}
        return origCreateObjectURL.apply(this, arguments);
      };
    }
  } catch (_) {}
})();`;

try {
  webFrame.executeJavaScript(EARLY_MAIN_BOOTSTRAP, true).catch(() => {});
} catch (_) {}

contextBridge.exposeInIsolatedWorld(WORLD, "neprasBridge", {
  send: (o) => ipcRenderer.sendToHost("nep:msg", o),
  onMessage: (cb) => { listeners.push(cb); }
});
ipcRenderer.on("nep:to", (_e, o) => listeners.forEach((f) => { try { f(o); } catch (_) {} }));

ipcRenderer.on("nep:exec", async (_e, { id, code, world }) => {
  try {
    let result;
    if (world === "MAIN") result = await webFrame.executeJavaScript(code, true);
    else result = await webFrame.executeJavaScriptInIsolatedWorld(WORLD, [{ code }], true);
    let safe;
    try { safe = result === undefined ? null : JSON.parse(JSON.stringify(result)); } catch (_) { safe = null; }
    ipcRenderer.sendToHost("nep:execRes", { id, ok: true, result: safe });
  } catch (e) {
    ipcRenderer.sendToHost("nep:execRes", { id, ok: false, error: String((e && e.message) || e) });
  }
});
