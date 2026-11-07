/* Desktop (Electron) backend for the Nepras host. Runs in the host window renderer; talks to main via window.nepDesktop (preload-host.js). */
(function () {
  "use strict";
  const D = window.nepDesktop;
  const handlers = {};
  const on = (evt, cb) => { (handlers[evt] = handlers[evt] || []).push(cb); };
  const emit = (evt, ...a) => (handlers[evt] || []).forEach((cb) => { try { cb(...a); } catch (e) { console.error(e); } });

  const views = new Map();        // tabId -> <webview>
  const wcToTab = new Map();      // webContentsId -> tabId
  const execWait = new Map();
  let execSeq = 0;
  let activeId = null;

  const DETECTOR_CODE = `(function() {
    try {
      var code = "", serial = "", name = "", stage = "";
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
            if (!code && (lk.indexOf("schoolcode") >= 0 || lk === "schoolid" || lk === "schcode" || lk === "sc") && norm(sv)) {
              code = norm(sv);
            }
            if (!serial && (lk.indexOf("schoolserial") >= 0 || lk.indexOf("serial") >= 0) && norm(sv)) {
              serial = norm(sv);
            }
            if (!name && (lk.indexOf("schoolname") >= 0 || lk === "arabicschoolname" || lk === "school_name") && sv.length >= 3 && !/^\\d+$/.test(sv) && !isBadName(sv)) {
              name = sv;
            }
            if (!stage && (lk.indexOf("schoolstage") >= 0 || lk.indexOf("stagecode") >= 0 || lk === "stage")) {
              stage = sv;
            }
          } else if (typeof v === "object") {
            inspectObj(v, (depth || 0) + 1);
          }
        }
      };
      var curHref = String(location.href || "");
      if (window.__neprasDetectedSchoolCache && window.__neprasDetectedSchoolCache.href === curHref && window.__neprasDetectedSchoolCache.data) {
        var cached = window.__neprasDetectedSchoolCache.data;
        if (cached.schoolCode && cached.schoolName && !isBadName(cached.schoolName)) return cached;
      }
      if (window.__neprasLastEmisHeaders) inspectObj(window.__neprasLastEmisHeaders, 0);
      var stores = [window.localStorage, window.sessionStorage];
      for (var s = 0; s < stores.length; s++) {
        var st = stores[s];
        if (!st) continue;
        for (var i = 0; i < st.length; i++) {
          var k = st.key(i) || "";
          var v = st.getItem(k) || "";
          if (!v) continue;
          var lk = k.toLowerCase().replace(/[_-]/g, "");
          var cleanVal = v.trim().replace(/^["']|["']$/g, "");
          if (!code && (lk.indexOf("schoolcode") >= 0 || lk === "schoolid" || lk === "schcode" || lk === "sc") && norm(cleanVal)) {
            code = norm(cleanVal);
          }
          if (!serial && (lk.indexOf("schoolserial") >= 0 || lk.indexOf("serial") >= 0) && norm(cleanVal)) {
            serial = norm(cleanVal);
          }
          if (!name && (lk.indexOf("schoolname") >= 0 || lk === "arabicschoolname") && cleanVal.length >= 3 && !/^\\d+$/.test(cleanVal) && !isBadName(cleanVal)) {
            name = cleanVal;
          }
          if (v.indexOf("{") >= 0 || v.indexOf("[") >= 0) {
            try { inspectObj(JSON.parse(v), 0); } catch (_) {}
          }
          if (v.indexOf("eyJ") >= 0) {
            try {
              var m = v.match(/eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}/);
              if (m) {
                var b64 = m[0].split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
                var pad = b64 + "===".slice((b64.length + 3) % 4);
                var claims = JSON.parse(decodeURIComponent(escape(atob(pad))));
                inspectObj(claims, 0);
              }
            } catch (_) {}
          }
        }
      }
      try {
        var allBadges = document.querySelectorAll(".badge, .badge-pill, header span, header div, nav span, nav div, .navbar span, .navbar div, b, strong, h1, h2, h3, h4, p, label");
        for (var bi = 0; bi < allBadges.length; bi++) {
          var bEl = allBadges[bi];
          if (bEl.children.length > 3) continue;
          var bTxt = (bEl.textContent || "").trim();
          if (!bTxt) continue;
          if (!code) {
            var mMail = bTxt.match(/([0-9]{5,12})@[a-z0-9.]*emis\\.gov\\.eg/i);
            if (mMail) code = norm(mMail[1]);
            var mCode = bTxt.match(/(?:كود\\s*(?:المدرسة|المؤسسة)|الرقم\\s*التعريفي)\\s*[:\\-]?\\s*([٠-٩0-9]{5,12})/);
            if (!code && mCode) code = norm(mCode[1]);
          }
          if (!serial) {
            var mSerial = bTxt.match(/(?:الرقم\\s*المسلسل|مسلسل\\s*المدرسة|مسلسل)\\s*[:\\-]?\\s*([٠-٩0-9]{7,12})/);
            if (mSerial) serial = norm(mSerial[1]);
          }
          if (!name) {
            var mSch = bTxt.match(/(?:اسم\\s*المدرسة|المدرسة)\\s*[:\\-]?\\s*([^\\n\\r<>|•]+)/);
            if (mSch) {
              var candName = mSch[1].replace(/المرحل[ةه].*$/, "").replace(/التبعي[ةه].*$/, "").replace(/الرقم\\s*المسلسل.*$/, "").trim();
              if (candName.length >= 3 && !/^\\d+$/.test(candName) && /[\\u0600-\\u06FF]/.test(candName) && !isBadName(candName)) name = candName;
            }
          }
          if (!stage) {
            var mStg = bTxt.match(/(?:المرحل[ةه]|مرحلة)\\s*[:\\-]?\\s*([^\\n\\r<>|•]+)/);
            if (mStg) {
              var candStage = mStg[1].replace(/التبعي[ةه].*$/, "").replace(/الرقم.*$/, "").trim();
              if (candStage.length >= 2) stage = candStage;
            }
          }
          if (code && name && stage) break;
        }
        if ((!code || !name) && document.body) {
          var fullTxt = (document.body.textContent || "").slice(0, 8000);
          if (!code) {
            var fbMail = fullTxt.match(/([0-9]{5,12})@[a-z0-9.]*emis\\.gov\\.eg/i);
            if (fbMail) code = norm(fbMail[1]);
            var fbCode = fullTxt.match(/(?:كود\\s*(?:المدرسة|المؤسسة)|الرقم\\s*التعريفي)\\s*[:\\-]?\\s*([٠-٩0-9]{5,12})/);
            if (!code && fbCode) code = norm(fbCode[1]);
          }
          if (!serial) {
            var fbSerial = fullTxt.match(/(?:الرقم\\s*المسلسل|مسلسل\\s*المدرسة|مسلسل)\\s*[:\\-]?\\s*([٠-٩0-9]{7,12})/);
            if (fbSerial) serial = norm(fbSerial[1]);
          }
          if (!name) {
            var fbName = fullTxt.match(/(?:اسم\\s*المدرسة|المدرسة)\\s*[:\\-]?\\s*([\\u0600-\\u06FF0-9\\s]{3,40})/);
            if (fbName) {
              var fn = fbName[1].trim();
              if (fn.length >= 3 && !/^\\d+$/.test(fn) && !isBadName(fn)) name = fn;
            }
          }
        }
      } catch (_) {}
      var out = (code || serial || name) ? {
        schoolCode: code || serial || "",
        schoolSerial: serial || "",
        schoolName: isBadName(name) ? "" : (name || (code ? ("مدرسة " + code) : "")),
        stage: stage || ""
      } : null;
      if (out && out.schoolCode && out.schoolName && !isBadName(out.schoolName)) {
        window.__neprasDetectedSchoolCache = { href: curHref, data: out };
      }
      return out;
    } catch (_) { return null; }
  })()`;

  function inspectWebview(wv) {
    if (!wv) return;
    try {
      const curUrl = String(wv.getURL() || "");
      if (/\/Account\/Log(?:in|Off)|\/login|\/logout/i.test(curUrl)) {
        if (D.reportLogout) D.reportLogout();
        return;
      }
      if (/^https:\/\/(student|teacher)\.emis\.gov\.eg\//i.test(curUrl)) {
        wv.executeJavaScript(DETECTOR_CODE).then((detected) => {
          if (detected && detected.schoolCode && D.reportDetectedSchool) {
            D.reportDetectedSchool(detected);
          }
        }).catch(() => {});
      }
    } catch (_) {}
  }

  function makeWebview(id, url) {
    const wv = document.createElement("webview");
    wv.setAttribute("partition", D.partition);
    wv.setAttribute("preload", D.tabPreloadUrl);
    wv.setAttribute("allowpopups", "false");
    wv.setAttribute("webpreferences", "contextIsolation=yes,nodeIntegration=no,sandbox=no");
    wv.className = "inactive";
    wv.addEventListener("dom-ready", () => {
      try { wcToTab.set(wv.getWebContentsId(), id); D.registerTab(wv.getWebContentsId(), id); } catch (_) {}
      inspectWebview(wv);
    });
    wv.addEventListener("did-start-loading", () => emit("tabUpdate", id, { status: "loading" }));
    wv.addEventListener("did-stop-loading", () => {
      emit("tabUpdate", id, { status: "complete", url: wv.getURL(), title: wv.getTitle() });
      inspectWebview(wv);
    });
    wv.addEventListener("did-navigate", (e) => { emit("tabUpdate", id, { url: e.url }); inspectWebview(wv); });
    wv.addEventListener("did-navigate-in-page", (e) => { if (e.isMainFrame) emit("tabUpdate", id, { url: e.url }); inspectWebview(wv); });
    wv.addEventListener("page-title-updated", (e) => emit("tabUpdate", id, { title: e.title }));
    wv.addEventListener("dom-ready", () => {
      try {
        const curUrl = wv.getURL();
        if (curUrl) emit("tabUpdate", id, { url: curUrl, title: wv.getTitle() });
        emit("tabLoaded", id, curUrl);
      } catch (_) {}
    });
    wv.addEventListener("ipc-message", (e) => {
      if (e.channel === "nep:msg") emit("tabMessage", id, e.args[0]);
      else if (e.channel === "nep:execRes") { const w = execWait.get(e.args[0].id); if (w) { execWait.delete(e.args[0].id); w(e.args[0]); } }
    });
    wv.addEventListener("render-process-gone", () => emit("tabUpdate", id, { status: "complete" }));
    wv.src = url;
    return wv;
  }

  const backend = {
    platform: "win",
    on,
    loadState: () => D.loadState(),
    saveState: (s) => D.saveState(s),

    async createTab(id, url, opts) {
      const wv = makeWebview(id, url);
      views.set(id, wv);
      document.getElementById("tab-host").appendChild(wv);
      if (opts && opts.active !== false) backend.setActiveTab(id);
    },
    async navigate(id, url) { const wv = views.get(id); if (wv) wv.loadURL(url).catch(() => {}); },
    async reloadTab(id) { const wv = views.get(id); if (wv) wv.reload(); },
    goBack(id) { const wv = views.get(id); if (wv && wv.canGoBack()) wv.goBack(); },
    goForward(id) { const wv = views.get(id); if (wv && wv.canGoForward()) wv.goForward(); },
    async removeTab(id) {
      const wv = views.get(id); views.delete(id);
      if (wv) { try { D.unregisterTab(wv.getWebContentsId()); } catch (_) {} wv.remove(); }
    },
    setActiveTab(id) {
      activeId = id;
      for (const [tid, wv] of views) wv.classList.toggle("inactive", tid !== id);
      const cur = views.get(id);
      if (cur) {
        inspectWebview(cur);
        try { D.activeTabChanged({ wcId: cur.getWebContentsId(), tabId: id }); } catch (_) {}
      }
    },
    exec(id, code, world) {
      const wv = views.get(id);
      if (!wv) return Promise.resolve({ ok: false, error: "No tab with id: " + id });
      return new Promise((resolve) => {
        const eid = ++execSeq;
        const timer = setTimeout(() => { execWait.delete(eid); resolve({ ok: false, error: "Script timed out" }); }, 120000);
        execWait.set(eid, (r) => { clearTimeout(timer); resolve(r); });
        try { wv.send("nep:exec", { id: eid, code, world }); }
        catch (e) { clearTimeout(timer); execWait.delete(eid); resolve({ ok: false, error: String(e.message || e) }); }
      });
    },
    sendToTab(id, obj) { const wv = views.get(id); if (wv) { try { wv.send("nep:to", obj); } catch (_) {} } },
    setWebRequestUrls(urls) { D.setWebRequestUrls(urls); },

    saveFile: (o) => D.saveFile(o),
    deleteFile: (p) => D.deleteFile(p),
    openPath: (p) => D.openPath(p),
    showItem: (p) => D.showItem(p),
    openFolder: () => D.openFolder(),
    getActiveSchool: () => (D.getActiveSchool ? D.getActiveSchool() : Promise.resolve(null)),
    getLatestDownloadedPdf: (opts) => (D.getLatestDownloadedPdf ? D.getLatestDownloadedPdf(opts) : Promise.resolve({ ok: false, status: "idle" }))
  };

  function resolveTabIdForWc(wcId) {
    if (wcId != null && wcToTab.has(wcId)) return wcToTab.get(wcId);
    for (const [tid, wv] of views) {
      try {
        if (wv && typeof wv.getWebContentsId === "function" && wv.getWebContentsId() === wcId) {
          wcToTab.set(wcId, tid);
          D.registerTab(wcId, tid);
          return tid;
        }
      } catch (_) {}
    }
    return activeId != null ? activeId : 1;
  }

  // events from main
  D.onRequest((name, details) => {
    const resolvedTabId = (details.tabId != null && details.tabId >= 0)
      ? details.tabId
      : resolveTabIdForWc(details.webContentsId);
    details.tabId = resolvedTabId;
    emit("request", name, details);
  });
  const tokenToId = new Map();
  D.onDownload((e) => {
    if (e.phase === "start") {
      e.tabId = resolveTabIdForWc(e.webContentsId);
      e.assign = (id) => tokenToId.set(e.token, id);
    } else {
      e.id = tokenToId.get(e.token);
    }
    emit("download", e);
  });
  D.onOpenWindow((url) => emit("openWindow", url));

  window.NeprasBackend = backend;
})();
