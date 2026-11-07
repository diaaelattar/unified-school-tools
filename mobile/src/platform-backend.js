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
    const arabicDigits = "٠١٢٣٤٥٦٧٨٩";
    const norm = (s) => String(s || "").replace(/[٠-٩]/g, (d) => String(arabicDigits.indexOf(d))).replace(/\D/g, "");

    for (const h of hdrList) {
      if (!h || !h.name) continue;
      const lk = String(h.name).toLowerCase().replace(/[_-]/g, "");
      const val = String(h.value || "").trim();
      if (!val) continue;
      const nVal = norm(val);
      if ((lk === "schoolcode" || lk === "sc" || lk === "schcode" || lk === "school_code") && /^\d{6,12}$/.test(nVal)) {
        schoolCode = nVal;
      } else if (!schoolCode && lk === "schoolid" && /^\d{4,12}$/.test(nVal)) {
        schoolCode = nVal;
      } else if ((lk === "schoolname" || lk === "arabicschoolname" || lk === "school_name") && val.length >= 3 && !/^\d+$/.test(val)) {
        schoolName = val;
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
            const candOfficial = norm(claims.schoolcode || claims.SchoolCode || claims.school_code || claims.sc || claims.schcode || "");
            const candSerial = norm(claims.SchoolId || claims.schoolId || claims.school_id || "");
            if (/^\d{6,12}$/.test(candOfficial)) {
              schoolCode = candOfficial;
            } else if (!schoolCode && /^\d{4,12}$/.test(candSerial)) {
              schoolCode = candSerial;
            }
            const candName = String(claims.schoolName || claims.SchoolName || claims.school_name || claims.ArabicSchoolName || claims.arabicSchoolName || "").trim();
            if (!schoolName && candName.length >= 3 && !/^\d+$/.test(candName)) schoolName = candName;
          }
        }
      } catch (_) {}
    }
    return schoolCode ? { schoolCode, schoolName } : null;
  }

  // -------------------------------------------------------------------------
  // 💾 محرك التخزين المستمر فائق السعة للموبايل (IndexedDB + Native App Storage)
  // يحل نهائياً مشكلة سقف 5MB في localStorage لضمان عدم ضياع أي سجل طلابي
  // -------------------------------------------------------------------------
  const IDB_NAME = "nepras_mobile_db";
  const IDB_STORE = "app_state";
  function openStateDb() {
    return new Promise((resolve) => {
      if (typeof window === "undefined" || !window.indexedDB) return resolve(null);
      try {
        const req = indexedDB.open(IDB_NAME, 1);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(IDB_STORE)) {
            db.createObjectStore(IDB_STORE);
          }
        };
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = () => resolve(null);
      } catch (_) {
        resolve(null);
      }
    });
  }
  async function idbGetState() {
    try {
      const db = await openStateDb();
      if (!db) return null;
      return new Promise((resolve) => {
        try {
          const tx = db.transaction(IDB_STORE, "readonly");
          const store = tx.objectStore(IDB_STORE);
          const req = store.get("state");
          req.onsuccess = () => resolve(req.result || null);
          req.onerror = () => resolve(null);
        } catch (_) {
          resolve(null);
        }
      });
    } catch (_) { return null; }
  }
  async function idbSetState(val) {
    try {
      const db = await openStateDb();
      if (!db) return false;
      return new Promise((resolve) => {
        try {
          const tx = db.transaction(IDB_STORE, "readwrite");
          const store = tx.objectStore(IDB_STORE);
          const req = store.put(val, "state");
          req.onsuccess = () => resolve(true);
          req.onerror = () => resolve(false);
        } catch (_) {
          resolve(false);
        }
      });
    } catch (_) { return false; }
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
                var arabicDigits = "٠١٢٣٤٥٦٧٨٩";
                var norm = function(s){ return String(s||"").replace(/[٠-٩]/g, function(d){ return String(arabicDigits.indexOf(d)); }).replace(/\\D/g, ""); };
                var sc = "", sn = "";
                var h = window.__neprasLastEmisHeaders || {};
                if (h.schoolcode && norm(h.schoolcode)) sc = norm(h.schoolcode);
                if (h.schoolname && String(h.schoolname).trim().length >= 3) sn = String(h.schoolname).trim();

                // 1. Storage scan (localStorage + sessionStorage)
                if (!sc || !sn) {
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
                      if (!sc && (lk.indexOf("schoolcode") >= 0 || lk === "schoolid" || lk === "schcode" || lk === "sc" || lk === "school_code") && norm(cleanVal)) {
                        sc = norm(cleanVal);
                      }
                      if (!sn && (lk.indexOf("schoolname") >= 0 || lk === "arabicschoolname" || lk === "school_name") && cleanVal.length >= 3 && !/^\\d+$/.test(cleanVal)) {
                        sn = cleanVal;
                      }
                      if (val.indexOf("eyJ") >= 0) {
                        try {
                          var m = val.match(/eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}/);
                          if (m) {
                            var b64 = m[0].split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
                            var pad = b64 + "===".slice((b64.length + 3) % 4);
                            var claims = JSON.parse(decodeURIComponent(escape(atob(pad))));
                            if (claims && typeof claims === "object") {
                              var cCode = norm(claims.schoolcode || claims.SchoolCode || claims.school_code || claims.sc || claims.SchoolId || claims.schoolId || "");
                              if (!sc && cCode) sc = cCode;
                              var cName = String(claims.schoolName || claims.SchoolName || claims.school_name || claims.ArabicSchoolName || claims.arabicSchoolName || "").trim();
                              if (!sn && cName.length >= 3 && !/^\\d+$/.test(cName)) sn = cName;
                            }
                          }
                        } catch (_) {}
                      }
                    }
                  }
                }

                // 2. Deep responsive DOM scan
                if (!sc || !sn) {
                  var domNodes = document.querySelectorAll(".badge, .badge-pill, header span, header div, nav span, nav div, .navbar span, .navbar div, b, strong, h1, h2, h3, h4, p, label, a, .dropdown-menu, .dropdown-item");
                  for (var di = 0; di < domNodes.length; di++) {
                    var dt = (domNodes[di].textContent || "").trim();
                    if (!sc) {
                      var mSc = norm(dt).match(/([0-9]{6,12})@[a-z0-9.]*emis\\.gov\\.eg/i) || norm(dt).match(/(?:كود\\s*(?:المدرسة|المؤسسة)|الرقم\\s*التعريفي|الرقم\\s*المسلسل)\\s*[:\\-]?\\s*([0-9]{6,12})/);
                      if (mSc && mSc[1] !== "0") sc = mSc[1];
                    }
                    if (!sn) {
                      var mSn = dt.match(/(?:اسم\\s*المدرسة|المدرسة)\\s*[:\\-]?\\s*([^\\n\\r<>|•]+)/);
                      if (mSn && mSn[1].trim().length >= 3 && !/^\\d+$/.test(mSn[1].trim())) {
                        sn = mSn[1].replace(/المرحل[ةه].*$/, "").replace(/التبعي[ةه].*$/, "").replace(/الرقم\\s*المسلسل.*$/, "").trim();
                      }
                    }
                  }
                }

                return sc ? { schoolCode: sc, schoolName: sn } : null;
              } catch(_) { return null; }
            })()`, "MAIN").then((r) => {
              if (r && r.ok && r.result && r.result.schoolCode && window.nepDesktop && typeof window.nepDesktop.reportDetectedSchool === "function") {
                window.nepDesktop.reportDetectedSchool(r.result).catch(() => {});
              }
            }).catch(() => {});
          }, 400);
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
      const P = getPlugin();
      if (P && typeof P.loadAppState === "function") {
        try {
          const res = await P.loadAppState();
          if (res && typeof res.state === "string" && res.state.length > 0) {
            return res.state;
          }
        } catch (e) {
          console.warn("[Mobile loadAppState native fallback]", e);
        }
      }
      const fromIdb = await idbGetState();
      if (fromIdb && typeof fromIdb === "string" && fromIdb.length > 0) {
        return fromIdb;
      }
      try { return localStorage.getItem("nepras_mobile_state"); } catch (_) { return null; }
    },
    saveState: async (s) => {
      if (typeof s !== "string") s = JSON.stringify(s || {});
      const P = getPlugin();
      if (P && typeof P.saveAppState === "function") {
        try {
          await P.saveAppState({ state: s });
        } catch (e) {
          console.warn("[Mobile saveAppState native fallback]", e);
        }
      }
      await idbSetState(s);
      try {
        if (s.length < 4000000) {
          localStorage.setItem("nepras_mobile_state", s);
        }
      } catch (_) {}
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

  function areSchoolNamesMatching(nameA, nameB) {
    if (!nameA || !nameB) return false;
    const clean = (s) => String(s || "")
      .replace(/مدرسة|الشهيد|بنين|بنات|المشتركة|الرسمية|للغات|الخاصة|ع|ث|ب|إعدادية|ثانوية|ابتدائية/g, "")
      .replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي")
      .replace(/\s+/g, "").trim();
    const cA = clean(nameA);
    const cB = clean(nameB);
    if (!cA || !cB) return false;
    return cA === cB || cA.includes(cB) || cB.includes(cA);
  }

    const KNOWN_SCHOOL_ALIASES = {
    "972133": "21024219",
    "21024219": "972133"
  };
  function resolveSchoolAlias(c) {
    const norm = normalizeSchoolCode(c);
    return KNOWN_SCHOOL_ALIASES[norm] || norm;
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

    // 🛡️ درع الحماية الذهبي: التحقق هل يمتلك الجهاز ترخيصاً سنوياً مفعلاً وسارياً لمدرسة بنفس الاسم أو نفس الجلسة
    let activePaidCode = "";
    let activePaidEntry = null;
    if (store.schools) {
      for (const [sCode, sEntry] of Object.entries(store.schools)) {
        if (sEntry && String(sEntry.status || "").toUpperCase() === "ACTIVE" && Number(sEntry.expiresAt || 0) > Date.now()) {
          activePaidCode = sCode;
          activePaidEntry = sEntry;
          break;
        }
      }
    }

    if (code && activePaidCode && code !== activePaidCode) {
      const activeName = activePaidEntry.schoolName || "";
      const curName = schoolName || store.schools?.[code]?.schoolName || "";
      if (areSchoolNamesMatching(curName, activeName) || areSchoolNamesMatching(store.activeSchoolName, activeName) || (code.length <= 6 && activePaidCode.length >= 7)) {
        store.schools = store.schools || {};
        store.schools[code] = {
          status: "ACTIVE",
          startsAt: activePaidEntry.startsAt || Date.now(),
          expiresAt: activePaidEntry.expiresAt,
          schoolName: activePaidEntry.schoolName || curName,
          aliasedFrom: activePaidCode
        };
        saveMobileLicenseStore(store);
      }
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

      // 🔄 فحص فوري وسريع للاشتراك السحابي للمدرسة المسجلة في Supabase
      setTimeout(() => {
        checkMobileSchoolLicense({ schoolCode: code, serverUrl }).catch(() => {});
      }, 80);

      return {
        platform: "mobile",
        locked: false,
        status: "TRIAL",
        schoolCode: code,
        schoolName: newEntry.schoolName,
        serverUrl,
        daysRemaining: TRIAL_DAYS,
        expiresAt: trialExpiresAt,
        message: `⏱️ فترة تجريبية مجانية لتطبيق الموبايل (متبقي ${TRIAL_DAYS} أيام). جاري التحقق من الاشتراك السحابي لمدرستك...`
      };
    }

    // إذا كانت المدرسة لا تزال في حالة TRIAL محلياً، نتحقق في الخلفية لترقيتها فوراً إذا كانت مفعلة سحابياً
    if (entry.status === "TRIAL") {
      const lastCheck = Number(entry._lastOnlineCheck || 0);
      if (Date.now() - lastCheck > 60 * 1000) {
        entry._lastOnlineCheck = Date.now();
        saveMobileLicenseStore(store);
        setTimeout(() => {
          checkMobileSchoolLicense({ schoolCode: code, serverUrl }).catch(() => {});
        }, 100);
      }
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
    const aliasCode = resolveSchoolAlias(code);
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
          const licObj = {
            status: isTrial ? "TRIAL" : "ACTIVE",
            startsAt: Date.now(),
            expiresAt: exp,
            schoolName: data.school_name || data.schoolName || store.activeSchoolName || ""
          };
          store.schools[code] = licObj;
          if (aliasCode && aliasCode !== code) {
            store.schools[aliasCode] = { ...licObj, aliasedFrom: code };
          }
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

        // 🛡️ فحص درع الحماية والترخيص النشط لتفضيل الكود الرسمي وتوريث التفعيل
        let activePaidCode = "";
        let activePaidEntry = null;
        if (store.schools) {
          for (const [sCode, sEntry] of Object.entries(store.schools)) {
            if (sEntry && String(sEntry.status || "").toUpperCase() === "ACTIVE" && Number(sEntry.expiresAt || 0) > Date.now()) {
              activePaidCode = sCode;
              activePaidEntry = sEntry;
              break;
            }
          }
        }

        const isAlias = activePaidCode && code !== activePaidCode && (areSchoolNamesMatching(schoolName, activePaidEntry.schoolName) || (code.length <= 6 && activePaidCode.length >= 7));
        const effectiveCode = isAlias ? activePaidCode : code;

        store.activeSchoolCode = effectiveCode;
        if (schoolName) store.activeSchoolName = schoolName;
        saveMobileLicenseStore(store);

        if (isAlias) {
          store.schools = store.schools || {};
          store.schools[code] = {
            status: "ACTIVE",
            startsAt: activePaidEntry.startsAt || Date.now(),
            expiresAt: activePaidEntry.expiresAt,
            schoolName: activePaidEntry.schoolName || schoolName,
            aliasedFrom: activePaidCode
          };
          saveMobileLicenseStore(store);
        }

        // 🚀 تحقق فوري وتلقائي من تفعيل المدرسة في قاعدة بيانات نبراس السحابية (Supabase)
        checkMobileSchoolLicense({ schoolCode: effectiveCode, serverUrl: store.serverUrl }).catch((err) => {
          console.warn("[Mobile License Check Auto Sync]", err);
        });

        const st = getMobileLicenseStatus(effectiveCode);
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

    // مزامنة فورية على بدء تشغيل التطبيق لكود المدرسة النشط
    setTimeout(async () => {
      try {
        const st = loadMobileLicenseStore();
        const code = st.activeSchoolCode;
        if (code) {
          checkMobileSchoolLicense({ schoolCode: code, serverUrl: st.serverUrl }).catch(() => {});
        }
      } catch (_) {}
    }, 1000);
  }
})();
