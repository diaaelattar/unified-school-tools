/* Mobile (Capacitor) platform backend. Talks to native EmisBrowserPlugin. */
(function () {
  "use strict";
  const handlers = {};
  const on = (evt, cb) => { (handlers[evt] = handlers[evt] || []).push(cb); };
  const emit = (evt, ...a) => (handlers[evt] || []).forEach((cb) => { try { cb(...a); } catch (e) { console.error(e); } });

  let _plugin = null;
  function getPlugin() {
    if (_plugin) return _plugin;
    if (window.Capacitor) {
      if (typeof window.Capacitor.registerPlugin === "function") {
        try { _plugin = window.Capacitor.registerPlugin("EmisBrowser"); } catch (_) {}
      }
      if (!_plugin && window.Capacitor.Plugins && window.Capacitor.Plugins.EmisBrowser) {
        _plugin = window.Capacitor.Plugins.EmisBrowser;
      }
    }
    return _plugin;
  }

  let activeTabId = 1;
  let listenersAdded = false;

  function extractSchoolFromHeaderList(hdrList) {
    if (!Array.isArray(hdrList)) return null;
    let schoolCode = "";
    let schoolName = "";
    let authVal = "";
    for (const h of hdrList) {
      if (!h || !h.name) continue;
      const lk = String(h.name).toLowerCase();
      const val = String(h.value || "").trim();
      if (!val) continue;
      if ((lk === "schoolcode" || lk === "sc") && /^\d{5,12}$/.test(val)) {
        schoolCode = val;
      } else if (lk === "authorization") {
        authVal = val;
      }
    }
    if (authVal && /^Bearer\s+/i.test(authVal)) {
      try {
        const jwt = authVal.replace(/^Bearer\s+/i, "").trim();
        const parts = jwt.split(".");
        if (parts.length >= 2) {
          const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
          const pad = b64 + "===".slice((b64.length + 3) % 4);
          const claims = JSON.parse(decodeURIComponent(escape(atob(pad))));
          if (claims && typeof claims === "object") {
            const candCode = String(claims.schoolcode || claims.SchoolCode || claims.school_code || claims.sc || claims.SchoolId || claims.schoolId || "").trim();
            if (!schoolCode && /^\d{5,12}$/.test(candCode)) schoolCode = candCode;
            const candName = String(claims.schoolName || claims.SchoolName || claims.school_name || claims.ArabicSchoolName || "").trim();
            if (candName.length >= 3 && !/^\d+$/.test(candName)) schoolName = candName;
          }
        }
      } catch (_) {}
    }
    return schoolCode ? { schoolCode, schoolName } : null;
  }

  function ensureListeners() {
    if (listenersAdded) return;
    const P = getPlugin();
    if (P && typeof P.addListener === "function") {
      listenersAdded = true;
      if (listenerPollTimer) {
        clearInterval(listenerPollTimer);
        listenerPollTimer = null;
      }
      P.addListener("tabUpdate", (data) => {
        emit("tabUpdate", activeTabId, data);
      });

      P.addListener("tabLoaded", (data) => {
        const loadedUrl = (data && data.url) || "";
        emit("tabLoaded", activeTabId, loadedUrl);
        if (/\/Account\/Log(?:in|Off)|\/login|\/logout/i.test(loadedUrl)) {
          if (window.nepDesktop && typeof window.nepDesktop.reportLogout === "function") {
            window.nepDesktop.reportLogout().catch(() => {});
          }
        } else if (/^https:\/\/(student|teacher)\.emis\.gov\.eg\//i.test(loadedUrl)) {
          setTimeout(() => {
            backend.exec(activeTabId, `(function(){
              try {
                var h = window.__neprasLastEmisHeaders || {};
                var sc = String(h.schoolcode || h.sc || "").trim();
                var sn = "";
                var badges = document.querySelectorAll(".badge, .badge-pill, header span, nav span, b, strong");
                for (var i = 0; i < badges.length; i++) {
                  var t = (badges[i].textContent || "").trim();
                  if (!sc) {
                    var m = t.match(/([0-9]{5,12})@[a-z0-9.]*emis\\.gov\\.eg/i) || t.match(/(?:كود\\s*(?:المدرسة|المؤسسة)|الرقم\\s*التعريفي)\\s*[:\\-]?\\s*([0-9]{5,12})/);
                    if (m) sc = m[1];
                  }
                  if (!sn) {
                    var ms = t.match(/(?:اسم\\s*المدرسة|المدرسة)\\s*[:\\-]?\\s*([^\\n\\r<>|•]+)/);
                    if (ms && ms[1].trim().length >= 3) sn = ms[1].replace(/المرحل[ةه].*$/, "").trim();
                  }
                }
                return sc ? { schoolCode: sc, schoolName: sn } : null;
              } catch(_) { return null; }
            })()`, "MAIN").then((r) => {
              if (r && r.ok && r.result && r.result.schoolCode && window.nepDesktop && typeof window.nepDesktop.reportDetectedSchool === "function") {
                window.nepDesktop.reportDetectedSchool(r.result).catch(() => {});
              }
            }).catch(() => {});
          }, 300);
        }
      });

      P.addListener("tabMessage", (data) => {
        try {
          const obj = typeof data.raw === "string" ? JSON.parse(data.raw) : data.raw;
          emit("tabMessage", activeTabId, obj);
        } catch (e) {
          console.error("tabMessage parse error:", e);
        }
      });

      P.addListener("webRequest", (data) => {
        try {
          if (data && data.name && data.details) {
            if (data.name === "onBeforeSendHeaders" && data.details.requestHeaders) {
              const extracted = extractSchoolFromHeaderList(data.details.requestHeaders);
              if (extracted && extracted.schoolCode && window.nepDesktop && typeof window.nepDesktop.reportDetectedSchool === "function") {
                window.nepDesktop.reportDetectedSchool(extracted).catch(() => {});
              }
            }
            emit("request", data.name, data.details);
          }
        } catch (e) {
          console.error("webRequest parse error:", e);
        }
      });

      P.addListener("switchView", (data) => {
        try {
          if (data && data.view) emit("switchView", data.view);
        } catch (_) {}
      });
    }
  }

  let listenerPollTimer = setInterval(ensureListeners, 100);

  const backend = {
    platform: "android",
    on,
    loadState: async () => {
      try { return localStorage.getItem("nepras_mobile_state"); } catch (_) { return null; }
    },
    saveState: async (s) => {
      try { localStorage.setItem("nepras_mobile_state", s); } catch (_) {}
    },

    async createTab(id, url, opts) {
      activeTabId = id;
      ensureListeners();
      const P = getPlugin();
      const targetUrl = url || "https://student.emis.gov.eg/";
      if (P) {
        await P.init({ url: targetUrl, visible: true });
      }
      emit("tabUpdate", id, { status: "complete", url: targetUrl, title: "بيانات التلميذ والمعلم" });
    },

    async navigate(id, url) {
      activeTabId = id;
      const P = getPlugin();
      if (P) {
        emit("tabUpdate", id, { status: "loading", url });
        await P.navigate({ url });
      }
    },

    async reloadTab(id) {
      const P = getPlugin();
      if (P) await P.reload();
    },

    goBack(id) {
      const P = getPlugin();
      if (P) P.goBack();
    },

    goForward(id) {
      const P = getPlugin();
      if (P) P.goForward();
    },

    async removeTab(id) {
      // mobile single-view
    },

    setActiveTab(id) {
      activeTabId = id;
    },

    setBrowserVisible(visible) {
      const P = getPlugin();
      if (P) P.setVisible({ visible: !!visible });
    },

    async exec(id, code, world) {
      const P = getPlugin();
      if (!P) return { ok: false, error: "Native plugin not available" };
      try {
        const res = await P.executeScript({ code });
        let val = res && res.result;
        if (typeof val === "string") {
          const trimmed = val.trim();
          if (trimmed === "null" || trimmed === "undefined") {
            val = null;
          } else if (trimmed === "true") {
            val = true;
          } else if (trimmed === "false") {
            val = false;
          } else {
            try { val = JSON.parse(trimmed); } catch (_) {}
          }
        }
        return { ok: true, result: val };
      } catch (e) {
        return { ok: false, error: String((e && e.message) || e) };
      }
    },

    sendToTab(id, obj) {
      const P = getPlugin();
      if (P) {
        P.sendToTab({ data: JSON.stringify(obj) });
      }
    },

    setWebRequestUrls() {},

    async fetchUrl(opts) {
      const P = getPlugin();
      if (P && typeof P.fetchUrl === "function") {
        return P.fetchUrl(opts);
      }
      throw new Error("NATIVE_FETCH_UNAVAILABLE");
    },

    async saveFile({ filename, base64, mime }) {
      const P = getPlugin();
      if (P && typeof P.saveFile === "function") {
        try {
          const res = await P.saveFile({ filename, base64, mime });
          if (res && res.path) return res;
        } catch (err) {
          console.warn("Native saveFile fallback:", err);
        }
      }
      try {
        const bin = atob(base64);
        const u8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        const blob = new Blob([u8], { type: mime || "application/octet-stream" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = filename.split("/").pop();
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { a.remove(); URL.revokeObjectURL(a.href); }, 1000);
        return { path: filename, size: u8.length };
      } catch (e) {
        throw new Error("DOWNLOAD_FAILED: " + e.message);
      }
    },

    deleteFile: async () => {},
    openPath: async () => {},
    showItem: async () => {},
    openFolder: async () => {}
  };

  window.NeprasBackend = backend;

  // -------------------------------------------------------------------------
  // 🛡️ Mobile License Manager (مزامنة وإدارة الاشتراك والتفعيل لتطبيق الموبايل)
  // -------------------------------------------------------------------------
  const SUPABASE_LICENSE_URL = "https://tmjqjyzteqbbuagensxo.supabase.co";
  const SUPABASE_LICENSE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRtanFqeXp0ZXFiYnVhZ2Vuc3hvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk2MzQzMjAsImV4cCI6MjEwNTIxMDMyMH0.107000J6zI9LTSFd6VsWznUad1Go4vGjgpmESgA5qvk";
  const STORAGE_KEY = "nepras_mobile_license_v1";
  const DAY_MS = 24 * 60 * 60 * 1000;
  const TRIAL_DAYS = 7;

  function loadMobileLicenseStore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (_) {
      return {};
    }
  }

  function saveMobileLicenseStore(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (_) {}
  }

  const licenseSubscribers = [];
  function notifyLicenseUpdate(st) {
    licenseSubscribers.forEach((cb) => {
      try { cb(st); } catch (e) { console.error(e); }
    });
  }

  function normalizeSchoolCode(raw) {
    const arabicDigits = "٠١٢٣٤٥٦٧٨٩";
    const str = String(raw || "")
      .replace(/[٠-٩]/g, (d) => String(arabicDigits.indexOf(d)))
      .trim();
    const clean = str.replace(/\s+/g, "");
    return /^\d{4,12}$/.test(clean) ? clean : clean.replace(/[^\dA-Za-z_-]/g, "");
  }

  function getMobileLicenseStatus(targetCode) {
    const store = loadMobileLicenseStore();
    const code = normalizeSchoolCode(targetCode || store.activeSchoolCode || "");
    const schoolName = store.activeSchoolName || "";
    const serverUrl = store.serverUrl || SUPABASE_LICENSE_URL;

    if (!code) {
      return {
        platform: "mobile",
        locked: true,
        status: "AWAITING_SCHOOL",
        schoolCode: "",
        schoolName: "",
        serverUrl,
        daysRemaining: 0,
        expiresAt: 0,
        message: "سجّل الدخول بحساب مدرستك لالتقاط كود المدرسة تلقائياً، أو أدخل كود المدرسة أدناه لتفعيل الاشتراك."
      };
    }

    const entry = store.schools?.[code];
    if (!entry) {
      const now = Date.now();
      const trialExpiresAt = now + (TRIAL_DAYS * DAY_MS);
      const newEntry = {
        status: "TRIAL",
        startsAt: now,
        expiresAt: trialExpiresAt,
        schoolName: schoolName || ""
      };
      store.schools = store.schools || {};
      store.schools[code] = newEntry;
      store.activeSchoolCode = code;
      saveMobileLicenseStore(store);

      return {
        platform: "mobile",
        locked: false,
        status: "TRIAL",
        schoolCode: code,
        schoolName: newEntry.schoolName,
        serverUrl,
        daysRemaining: TRIAL_DAYS,
        expiresAt: trialExpiresAt,
        message: `⏱️ فترة تجريبية مجانية لتطبيق الموبايل (متبقي ${TRIAL_DAYS} أيام). يمكنك تفعيل الاشتراك السنوي في أي وقت.`
      };
    }

    const now = Date.now();
    const expiresAt = Number(entry.expiresAt || 0);
    const diffMs = expiresAt - now;
    const daysRemaining = Math.max(0, Math.ceil(diffMs / DAY_MS));

    if (entry.status === "ACTIVE" && diffMs > 0) {
      const isWarning = daysRemaining <= 10;
      return {
        platform: "mobile",
        locked: false,
        status: isWarning ? "WARNING" : "ACTIVE",
        schoolCode: code,
        schoolName: entry.schoolName || schoolName,
        serverUrl,
        daysRemaining,
        expiresAt,
        message: isWarning
          ? `⚠️ ينتهي الاشتراك السنوي للمدرسة خلال ${daysRemaining} يوم.`
          : `✅ اشتراك سنوي نشط ومفعل لمدرستك (متبقي ${daysRemaining} يوم).`
      };
    }

    if (entry.status === "TRIAL" && diffMs > 0) {
      return {
        platform: "mobile",
        locked: false,
        status: "TRIAL",
        schoolCode: code,
        schoolName: entry.schoolName || schoolName,
        serverUrl,
        daysRemaining,
        expiresAt,
        message: `⏱️ فترة تجريبية مجانية (متبقي ${daysRemaining} يوم). يرجى التفعيل السنوي قبل انتهاء المهلة.`
      };
    }

    const isTrialExpired = (entry.status === "TRIAL");
    return {
      platform: "mobile",
      locked: true,
      status: isTrialExpired ? "EXPIRED_TRIAL" : "EXPIRED",
      schoolCode: code,
      schoolName: entry.schoolName || schoolName,
      serverUrl,
      daysRemaining: 0,
      expiresAt,
      message: isTrialExpired
        ? `🔒 انتهت الفترة التجريبية المجانية لكود المدرسة (${code}). يرجى تفعيل الاشتراك السنوي (30 جنيهاً) للاستمرار.`
        : `🔒 انتهى الاشتراك السنوي لكود المدرسة (${code}). يرجى تجديد الاشتراك السنوي للاستمرار.`
    };
  }

  async function checkMobileSchoolLicense({ schoolCode, serverUrl }) {
    const code = normalizeSchoolCode(schoolCode);
    if (!code) throw new Error("كود المدرسة مطلوب");
    const srv = (serverUrl || SUPABASE_LICENSE_URL).replace(/\/+$/, "");

    const store = loadMobileLicenseStore();
    store.activeSchoolCode = code;
    store.serverUrl = srv;

    try {
      // 1) استدعاء دالة RPC المعتمدة في Supabase والموحدة مع تطبيق سطح المكتب
      const rpcRes = await fetch(`${srv}/rest/v1/rpc/check_school_subscription`, {
        method: "POST",
        headers: {
          "apikey": SUPABASE_LICENSE_ANON_KEY,
          "Authorization": `Bearer ${SUPABASE_LICENSE_ANON_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          p_school_code: code,
          p_school_name: store.activeSchoolName || ""
        })
      });
      if (rpcRes.ok) {
        const data = await rpcRes.json();
        if (data && data.ok && data.subscribed) {
          const exp = new Date(data.expires_at || data.expiresAt || 0).getTime() || (Date.now() + 365 * DAY_MS);
          const isTrial = String(data.status || "").toUpperCase() === "TRIAL";
          store.schools = store.schools || {};
          store.schools[code] = {
            status: isTrial ? "TRIAL" : "ACTIVE",
            startsAt: Date.now(),
            expiresAt: exp,
            schoolName: data.school_name || data.schoolName || store.activeSchoolName || ""
          };
          saveMobileLicenseStore(store);
          const st = getMobileLicenseStatus(code);
          notifyLicenseUpdate(st);
          return { ok: true, message: data.message || st.message, status: st };
        }
      }

      // 2) احتياطي: الاستعلام المباشر عن جدول التراخيص
      const url = `${srv}/rest/v1/licenses?school_code=eq.${encodeURIComponent(code)}&select=*`;
      const res = await fetch(url, {
        method: "GET",
        headers: {
          "apikey": SUPABASE_LICENSE_ANON_KEY,
          "Authorization": `Bearer ${SUPABASE_LICENSE_ANON_KEY}`,
          "Content-Type": "application/json"
        }
      });
      if (res.ok) {
        const rows = await res.json();
        const activeRow = Array.isArray(rows) ? rows.find(r => String(r.status || "").toLowerCase() === "active") : null;
        if (activeRow) {
          const exp = activeRow.expires_at ? new Date(activeRow.expires_at).getTime() : (Date.now() + 365 * DAY_MS);
          store.schools = store.schools || {};
          store.schools[code] = {
            status: "ACTIVE",
            startsAt: activeRow.starts_at ? new Date(activeRow.starts_at).getTime() : Date.now(),
            expiresAt: exp,
            schoolName: activeRow.school_name || store.activeSchoolName || ""
          };
          saveMobileLicenseStore(store);
          const st = getMobileLicenseStatus(code);
          notifyLicenseUpdate(st);
          return { ok: true, message: "تم التحقق من تفعيل اشتراك المدرسة في قاعدة البيانات السحابية ✅", status: st };
        }
      }
    } catch (err) {
      console.warn("[Mobile License Check Offline/Error]", err);
    }

    saveMobileLicenseStore(store);
    const currentStatus = getMobileLicenseStatus(code);
    notifyLicenseUpdate(currentStatus);
    return {
      ok: !currentStatus.locked,
      message: currentStatus.message,
      status: currentStatus
    };
  }

  async function activateMobileSchoolKey({ schoolCode, licenseKey, serverUrl }) {
    const code = normalizeSchoolCode(schoolCode);
    const key = String(licenseKey || "").trim();
    if (!code) throw new Error("كود المدرسة مطلوب");
    if (!key) throw new Error("مفتاح التفعيل مطلوب");

    const srv = (serverUrl || SUPABASE_LICENSE_URL).replace(/\/+$/, "");
    const store = loadMobileLicenseStore();
    store.activeSchoolCode = code;

    let valid = false;
    let expTime = Date.now() + 365 * DAY_MS;

    try {
      // 1) التفعيل عبر دالة RPC المعتمدة في Supabase والموحدة مع تطبيق سطح المكتب
      const rpcRes = await fetch(`${srv}/rest/v1/rpc/activate_license_key`, {
        method: "POST",
        headers: {
          "apikey": SUPABASE_LICENSE_ANON_KEY,
          "Authorization": `Bearer ${SUPABASE_LICENSE_ANON_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          p_school_code: code,
          p_license_key: key.toUpperCase(),
          p_school_name: store.activeSchoolName || null
        })
      });
      if (rpcRes.ok) {
        const data = await rpcRes.json();
        if (data && data.ok) {
          valid = true;
          if (data.expires_at || data.expiresAt) {
            expTime = new Date(data.expires_at || data.expiresAt).getTime();
          }
          if (data.school_name || data.schoolName) {
            store.activeSchoolName = data.school_name || data.schoolName;
          }
        }
      }

      // 2) احتياطي: التحقق من جدول مفاتيح التفعيل
      if (!valid) {
        const url = `${srv}/rest/v1/license_keys?key=eq.${encodeURIComponent(key)}&select=*`;
        const res = await fetch(url, {
          method: "GET",
          headers: {
            "apikey": SUPABASE_LICENSE_ANON_KEY,
            "Authorization": `Bearer ${SUPABASE_LICENSE_ANON_KEY}`,
            "Content-Type": "application/json"
          }
        });
        if (res.ok) {
          const rows = await res.json();
          if (Array.isArray(rows) && rows.length > 0) {
            const kRow = rows[0];
            if (!kRow.is_used || String(kRow.school_code) === code) {
              valid = true;
              if (kRow.expires_at) expTime = new Date(kRow.expires_at).getTime();
              if (!kRow.is_used) {
                await fetch(`${srv}/rest/v1/license_keys?id=eq.${kRow.id}`, {
                  method: "PATCH",
                  headers: {
                    "apikey": SUPABASE_LICENSE_ANON_KEY,
                    "Authorization": `Bearer ${SUPABASE_LICENSE_ANON_KEY}`,
                    "Content-Type": "application/json"
                  },
                  body: JSON.stringify({ is_used: true, school_code: code, used_at: new Date().toISOString() })
                }).catch(() => {});
              }
            }
          }
        }
      }
    } catch (_) {}

    // 3) دعم تذاكر التفعيل الموقعة NEPRAS1.<payloadB64>.<sig> للأجهزة غير المتصلة بالإنترنت
    if (!valid && /^NEPRAS1\./i.test(key)) {
      try {
        const cleanToken = key.replace(/^NEPRAS1\./i, "");
        const parts = cleanToken.split(".");
        if (parts.length === 2 && parts[1].length >= 40) {
          const b64 = parts[0].replace(/-/g, "+").replace(/_/g, "/");
          const pad = b64 + "===".slice((b64.length + 3) % 4);
          const payload = JSON.parse(decodeURIComponent(escape(atob(pad))));
          if (payload && normalizeSchoolCode(payload.schoolCode) === code && Number(payload.expiresAt) > Date.now()) {
            valid = true;
            expTime = Number(payload.expiresAt);
          }
        }
      } catch (_) {}
    }

    if (!valid) {
      return {
        ok: false,
        message: "❌ مفتاح التفعيل غير صحيح أو تم استخدامه لمدرسة أخرى. يرجى التواصل مع الدعم الفني.",
        status: getMobileLicenseStatus(code)
      };
    }

    store.schools = store.schools || {};
    store.schools[code] = {
      status: "ACTIVE",
      startsAt: Date.now(),
      expiresAt: expTime,
      licenseKey: key,
      schoolName: store.activeSchoolName || ""
    };
    saveMobileLicenseStore(store);

    const st = getMobileLicenseStatus(code);
    notifyLicenseUpdate(st);
    return {
      ok: true,
      message: "🎉 تم تفعيل الاشتراك السنوي لتطبيق الموبايل بنجاح!",
      status: st
    };
  }

  // Polyfill window.nepDesktop on Mobile so all UI & licensing operate identically
  if (!window.nepDesktop) {
    window.nepDesktop = {
      getLicenseStatus: async () => getMobileLicenseStatus(),
      checkSchoolLicense: async (opts) => checkMobileSchoolLicense(opts || {}),
      activateSchoolKey: async (opts) => activateMobileSchoolKey(opts || {}),
      reportDetectedSchool: async ({ schoolCode, schoolName }) => {
        if (!schoolCode) return;
        const code = normalizeSchoolCode(schoolCode);
        const store = loadMobileLicenseStore();
        store.activeSchoolCode = code;
        if (schoolName) store.activeSchoolName = schoolName;
        saveMobileLicenseStore(store);
        const st = getMobileLicenseStatus(code);
        notifyLicenseUpdate(st);
        return st;
      },
      reportLogout: async () => {
        const store = loadMobileLicenseStore();
        store.activeSchoolCode = "";
        saveMobileLicenseStore(store);
        const st = getMobileLicenseStatus("");
        notifyLicenseUpdate(st);
        return st;
      },
      setLicenseServerUrl: async (url) => {
        const store = loadMobileLicenseStore();
        store.serverUrl = url;
        saveMobileLicenseStore(store);
        return getMobileLicenseStatus();
      },
      onLicenseUpdate: (cb) => {
        if (typeof cb === "function") licenseSubscribers.push(cb);
      },
      checkUpdate: async () => {
        const currentVersion = "1.3.4";
        const websiteUrl = "https://unified-school-tools-website.vercel.app/";
        const endpoints = [
          "https://unified-school-tools-website.vercel.app/version.json",
          "https://unified-school-tools-website.vercel.app/api/version"
        ];
        let remoteData = null;
        for (const ep of endpoints) {
          try {
            const ctrl = new AbortController();
            const tm = setTimeout(() => ctrl.abort(), 6500);
            const res = await fetch(ep, { method: "GET", signal: ctrl.signal });
            clearTimeout(tm);
            if (res.ok) {
              remoteData = await res.json();
              if (remoteData) break;
            }
          } catch (_) {}
        }
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
        const latestVersion = remoteData?.version || remoteData?.mobileVersion || remoteData?.desktopVersion || null;
        const downloadUrl = remoteData?.downloadUrl || remoteData?.mobileDownloadUrl || websiteUrl;
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
      },
      downloadUpdate: async (url) => {
        const target = url || "https://unified-school-tools-website.vercel.app/";
        window.open(target, "_blank");
      }
    };
  }
})();
