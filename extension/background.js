
// قوالب دفاتر الفصول التي يرفعها المستخدم بدل المضمّنة تُحفظ في IndexedDB بأصل الإضافة (modules/class_books_store.js) وتقرؤها الخلفية.
// importScripts في MV3 لا يعمل إلا عند بدء العامل، فيُستدعى هنا مرة واحدة. فشله لا يعطّل شيئًا: نعود للقوالب المضمّنة.
try { if (typeof importScripts === "function") importScripts("modules/nepras_logger.js", "modules/class_books_store.js"); } catch (err) {
  try { if (typeof importScripts === "function") importScripts("modules/class_books_store.js"); } catch (_) {}
  console.warn("[Nepras Handled]", err?.message || err);
}

// ==========================================================
// Nepras — Edge Android action opens full page directly
// Edge Android hosts default_popup inside a draggable bottom sheet.
// Disable the popup only on Android, so tapping the extension action
// opens Nepras as a normal extension tab with reliable vertical scrolling.
// Desktop Edge/Chrome keep the normal popup unchanged.
// ==========================================================
const NEPRAS_MOBILE_FULL_PAGE_URL = chrome.runtime.getURL("popup.html?mobileFull=1");

function neprasGetPlatformInfoSafe() {
  return new Promise((resolve) => {
    try {
      chrome.runtime.getPlatformInfo((info) => resolve(info || {}));
    } catch (_) {
      resolve({});
    }
  });
}

async function neprasConfigureActionSurface() {
  try {
    const info = await neprasGetPlatformInfoSafe();
    const isAndroid = String(info?.os || "").toLowerCase() === "android";
    await chrome.action.setPopup({ popup: isAndroid ? "" : "popup.html" });
    return isAndroid;
  } catch (_) {
    return false;
  }
}

async function neprasOpenOrFocusMobileFullPage() {
  try {
    const tabs = await chrome.tabs.query({});
    const exactPrefix = NEPRAS_MOBILE_FULL_PAGE_URL;
    const existing = (tabs || []).find((tab) =>
      tab?.id != null && String(tab?.url || "").startsWith(exactPrefix)
    );
    if (existing?.id != null) {
      await chrome.tabs.update(existing.id, { active: true });
      return existing;
    }
    return await chrome.tabs.create({ url: NEPRAS_MOBILE_FULL_PAGE_URL, active: true });
  } catch (_) {
    return null;
  }
}

// Configure immediately whenever the MV3 worker wakes, and again on lifecycle events.
neprasConfigureActionSurface().catch(() => {});
chrome.runtime.onInstalled.addListener(() => { neprasConfigureActionSurface().catch(() => {}); });
chrome.runtime.onStartup.addListener(() => { neprasConfigureActionSurface().catch(() => {}); });
// مفاتيح حالة من إصدارات سابقة كانت الوحدة فيها بمسمى آخر (انتهى استعمالها): تُمسح عند التحديث فلا تبقى حالة «جارية» معلّقة.
chrome.runtime.onInstalled.addListener(() => { try { chrome.storage.local.remove(['specialist_running', 'specialist_details', 'specialist_started_at'], () => void chrome.runtime.lastError); } catch (err) { console.warn("[Nepras Handled]", err?.message || err); } }); /* legacy-name */

chrome.action.onClicked.addListener(async () => {
  try {
    const info = await neprasGetPlatformInfoSafe();
    if (String(info?.os || "").toLowerCase() !== "android") return;
    await neprasOpenOrFocusMobileFullPage();
  } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
});

// ==========================================
// 🚀 نبراس - Service Worker / background.js
// ==========================================



// نظام الرسائل الموحّد (المرحلة 2): يُحقن قبل nepras-dialogs.js في كل صفحات الوزارة.
const NEPRAS_UI_FILES = ['ui/brand.js', 'ui/escape.js', 'ui/icons.js', 'ui/messages.ar.js', 'ui/_styles.js', 'ui/nepras-ui.js', 'ui/legacy.js', 'ui/tokens.css', 'ui/buttons.css', 'ui/panel.css', 'ui/buttons.js', 'ui/panel.js'];

// جدول الحقن: المصدر الوحيد لما يُحقن في كل موقع من مواقع الوزارة. الترتيب مهم (ملف يعتمد على ما قبله).
// لإضافة وحدة جديدة: أضفها هنا فقط. اختبار tests/test_manifest.js يتأكد أن كل ملف مذكور موجود.
const NEPRAS_SITE_COMMON_FILES = [
  'nepras-dialogs.js', 'modules/lib_loader.js', 'modules/egypt_ids.js', 'modules/utils.js', 'modules/school_manager.js', 'modules/wait_utils.js', 'modules/checkpoint.js', 'modules/xlsx_writer.js',
  'modules/report_header.js', // الترويسة الموحدة للتقارير الرسمية وشعار الوزارة (نبراس برو 2026)
  'modules/student_api.js', 'modules/export.js', 'modules/school_stats.js',
  'modules/class_lists_excel.js', 'modules/expenses.js', 'modules/ui.js', 'modules/class_reports.js', 'modules/attendance.js',
  'modules/template_fill.js', // ملء القوالب المخصصة على مستوى xlsx (يحفظ تنسيق المستخدم)؛ قبل school_records.js
  'modules/class_books.js', // دفاتر الفصول من القوالب المضمّنة (منقول من ClassBooks)؛ يعتمد على طبقة ZIP في xlsx_writer.js وتستدعيه school_records.js
  'modules/school_records.js', // السجلات والكشوف: جزء من الأدوات المشتركة لموقعي الطلاب والمعلمين
  'modules/smart_analytics.js', // مراجعة وتدقيق البيانات والتحليلات الإحصائية المتقدمة
  'modules/stats_dashboard.js', // مركز الإحصائيات والتقارير الشاملة المتقدمة
  'modules/tablet.js', // تسجيل وتصدير أجهزة التابلت المدرسي
  'modules/add_student.js', // إضافة الطلاب الجدد بالرقم القومي
  'modules/absence_warnings.js', // إنذارات الغياب الرسمية
  'modules/exemption_removal.js', // أداة حذف إعفاءات الطلاب المتقدمة وتحديد نوع الإعفاء
  'modules/quick_edits.js', // أداة تعديل التخصص واللغات والشعب المدرسية
  'modules/student_dossier.js', // الملف الرقمي والبحث الشامل للطالب
  'modules/staff_stats.js', // إحصائيات وسجلات العاملين وكشوف التخصصات
  'modules/staff_annual_reports.js', // تقارير تقويم الأداء السنوية (الكفاية) للمعلمين والعاملين
  'modules/health_records.js', // سجلات ومبادرات التأمين الصحي وسوء التغذية وفحص العيون
  'modules/g9_exam_forms.js', // كشوف ومتابعة استمارة الشهادة الإعدادية الإلكترونية
  'modules/quick_login.js' // خزنة الدخول السريع والتعبئة التلقائية لحساب الوزارة
];
const NEPRAS_SITE_INJECTION = {
  student: [
    'modules/name_fixer.js', // v1.2.78: منقّي أسماء الطلاب (مستقل، لا يعتمد على غيره)
    ...NEPRAS_UI_FILES, ...NEPRAS_SITE_COMMON_FILES, 'modules/assign_plan.js', 'modules/auto_assign.js', 'content.js' // assign_plan.js: منطق التسكين الصرف (خطة وتحقق)، قبل auto_assign.js الذي يستدعيه
  ],
  teacher: [...NEPRAS_UI_FILES, ...NEPRAS_SITE_COMMON_FILES, 'content.js'],
  tansik: [...NEPRAS_UI_FILES, 'nepras-dialogs.js', 'modules/lib_loader.js', 'modules/egypt_ids.js', 'modules/run_report.js', 'modules/accept_plan.js', 'modules/accept_list.js']
};
function neprasSiteInjectionFiles(rawUrl) {
  const key = neprasSiteKeyForUrl(rawUrl);
  if (key === 'student') return NEPRAS_SITE_INJECTION.student;
  if (key === 'teacher') return NEPRAS_SITE_INJECTION.teacher;
  if (key === 'tansik') return NEPRAS_SITE_INJECTION.tansik;
  throw new Error('UNSUPPORTED_HOST');
}

// مكتبات ثقيلة تُحقن عند الطلب فقط (modules/lib_loader.js → NEPRAS_ENSURE_LIB).
// قائمة بيضاء: الاسم → الملف + المتغير العام + المواقع المسموح لها بطلبه.
const NEPRAS_LAZY_LIBS = {
  xlsx: { file: 'xlsx.full.min.js', global: 'XLSX', sites: ['student', 'teacher', 'tansik'] },
  pdflib: { file: 'pdf-lib.min.js', global: 'PDFLib', sites: ['student', 'teacher'] }
};
function neprasSiteKeyForUrl(rawUrl) {
  const url = String(rawUrl || '');
  if (/^https:\/\/teacher\.emis\.gov\.eg(\/|$)/i.test(url)) return 'teacher';
  if (/^https:\/\/tansik-adtik\.emis\.gov\.eg(\/|$)/i.test(url)) return 'tansik';
  if (/^https:\/\/([a-z0-9-]+\.)?emis\.gov\.eg(\/|$)/i.test(url)) return 'student';
  return null;
}
const neprasLibInFlight = new Map();
// يحقن المكتبة في الإطار الذي طلبها فقط (وليس كل إطارات التبويب)، ويعيد {ok:true} بعد أن يصير المتغير العام معرّفًا.
async function neprasEnsureLibForSender(libName, sender) {
  const lib = Object.prototype.hasOwnProperty.call(NEPRAS_LAZY_LIBS, libName) ? NEPRAS_LAZY_LIBS[libName] : null;
  if (!lib) return { ok: false, message: 'UNKNOWN_LIB' };
  const tabId = sender?.tab?.id;
  if (!sender || sender.id !== chrome.runtime.id || tabId == null) return { ok: false, message: 'LIB_FORBIDDEN' };
  const site = neprasSiteKeyForUrl(sender.url || sender.tab?.url);
  if (!site || !lib.sites.includes(site)) return { ok: false, message: 'LIB_FORBIDDEN' };

  const frameId = Number.isInteger(sender.frameId) ? sender.frameId : 0;
  const key = tabId + ':' + frameId + ':' + libName;
  if (neprasLibInFlight.has(key)) return await neprasLibInFlight.get(key);

  const job = (async () => {
    const target = { tabId, frameIds: [frameId] };
    const present = await chrome.scripting.executeScript({
      target, world: 'ISOLATED',
      func: (g) => typeof globalThis[g] !== 'undefined',
      args: [lib.global]
    }).catch(() => []);
    if (present?.[0]?.result === true) return { ok: true, already: true };
    await chrome.scripting.executeScript({ target, world: 'ISOLATED', files: [lib.file] });
    return { ok: true, injected: true };
  })().catch((error) => ({ ok: false, message: error?.message || String(error) }));
  neprasLibInFlight.set(key, job);
  try { return await job; } finally { neprasLibInFlight.delete(key); }
}

// [Phase 4] سجل آخر الملفات المُصدّرة — يُعرض في الـ popup.
const NEPRAS_RECENT_EXPORTS_KEY = 'neprasRecentExports';
const NEPRAS_RECENT_EXPORTS_MAX = 20;

const neprasSiteInjectionInFlight = new Map();

async function neprasInjectFileSequence(tabId, files, world = 'ISOLATED') {
  for (const file of files) {
    if (file.endsWith('.css')) {
      // ملفات الأنماط (ui/buttons.css، ui/panel.css) تُحقن عبر insertCSS، لا executeScript الذي يقبل .js فقط.
      await chrome.scripting.insertCSS({ target: { tabId }, files: [file] });
    } else {
      await chrome.scripting.executeScript({ target: { tabId }, files: [file], world });
    }
  }
}
async function neprasInjectTeacherBridge(tabId, rawUrl) {
  if (neprasSiteKeyForUrl(rawUrl) !== 'teacher') return { ok: true, skipped: true };
  await neprasInjectFileSequence(tabId, ['teacher_api_bridge.js'], 'MAIN');
  return { ok: true, injected: true };
}
async function neprasInjectSiteTools(tabId, rawUrl) {
  const url = String(rawUrl || '');

  // v1.0: منع سباق حقن الملفات.
  // كان page_auth_gate و navigateAndRun يستطيعان بدء حقنين في نفس اللحظة قبل
  // وضع علامة __NEPRAS_TOOLS_LOADED__، فينتج "Identifier ... already been declared".
  if (neprasSiteInjectionInFlight.has(tabId)) {
    return await neprasSiteInjectionInFlight.get(tabId);
  }

  const job = (async () => {
    // Claim ذري داخل نفس isolated world قبل حقن أي ملف.
    const claim = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'ISOLATED',
      func: () => {
        if (globalThis.__NEPRAS_TOOLS_LOADED__) return 'loaded';
        if (globalThis.__NEPRAS_TOOLS_LOADING__) return 'loading';
        globalThis.__NEPRAS_TOOLS_LOADING__ = true;
        return 'claimed';
      }
    }).catch(() => []);

    const state = claim?.[0]?.result;

    if (state === 'loaded') {
      try {
        const hasModule = await chrome.scripting.executeScript({
          target: { tabId },
          world: 'ISOLATED',
          func: () => !!globalThis.__NEPRAS_RECORDS_LOADED__
        });
        const siteKey = neprasSiteKeyForUrl(url);
        if (!hasModule?.[0]?.result && (siteKey === 'student' || siteKey === 'teacher')) {
          await neprasInjectFileSequence(tabId, ['modules/egypt_ids.js', 'modules/template_fill.js', 'modules/class_books.js', 'modules/school_records.js']);
        }
      } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
      return { ok: true, alreadyLoaded: true };
    }
    if (state === 'loading') {
      // حقن آخر بدأ بالفعل. انتظر العلامة بدل إعادة حقن الملفات.
      for (let i = 0; i < 40; i++) {
        await new Promise(r => setTimeout(r, 100));
        const check = await chrome.scripting.executeScript({
          target: { tabId },
          world: 'ISOLATED',
          func: () => ({
            loaded: !!globalThis.__NEPRAS_TOOLS_LOADED__,
            loading: !!globalThis.__NEPRAS_TOOLS_LOADING__
          })
        }).catch(() => []);
        if (check?.[0]?.result?.loaded) return { ok: true, alreadyLoaded: true };
        if (!check?.[0]?.result?.loading) break;
      }
      return { ok: false, message: 'SITE_INJECTION_WAIT_TIMEOUT' };
    }
    if (state !== 'claimed') return { ok: false, message: 'SITE_INJECTION_CLAIM_FAILED' };

    try {
      const siteFiles = neprasSiteInjectionFiles(url);   // يرمي UNSUPPORTED_HOST لموقع غير مدعوم
      if (neprasSiteKeyForUrl(url) === 'teacher') await neprasInjectTeacherBridge(tabId, url);
      await neprasInjectFileSequence(tabId, siteFiles);

      await chrome.scripting.executeScript({
        target: { tabId }, world: 'ISOLATED',
        func: () => {
          globalThis.__NEPRAS_TOOLS_LOADED__ = true;
          globalThis.__NEPRAS_TOOLS_LOADING__ = false;
        }
      });

      return { ok: true, injected: true };
    } catch (error) {
      await chrome.scripting.executeScript({
        target: { tabId }, world: 'ISOLATED',
        func: () => { globalThis.__NEPRAS_TOOLS_LOADING__ = false; }
      }).catch(() => {});
      throw error;
    }
  })();

  neprasSiteInjectionInFlight.set(tabId, job);
  try {
    return await job;
  } finally {
    if (neprasSiteInjectionInFlight.get(tabId) === job) {
      neprasSiteInjectionInFlight.delete(tabId);
    }
  }
}

// ============================================================
// v1.2.78 — سجل عمليات «منقّي أسماء الطلاب» (modules/name_fixer.js)
// السجل فيه أكواد وأسماء طلاب ← يُحفظ في storage.session فقط (لا يُكتب على القرص).
// سكربتات الصفحة لا تصل إلى storage.session (ضُبط على TRUSTED_CONTEXTS لحماية رؤوس Authorization
// المخزّنة فيه)، لذلك تمرّ القراءة والكتابة عبر هذا المعالج بدل توسيع صلاحية الوصول.
// التسلسل (promise chain) يمنع تداخل «اقرأ ← عدّل ← اكتب» عند وصول رسالتين متقاربتين.
// ============================================================
const NEPRAS_NF_LOG_KEY = "nf_log";
const NEPRAS_NF_LOG_MAX = 2000;
let neprasNfLogChain = Promise.resolve();

function neprasIsStudentSender(sender) {
  const url = String(sender?.tab?.url || sender?.url || "");
  return /^https:\/\/student\.emis\.gov\.eg\//i.test(url);
}

function neprasNfLogHandle(request) {
  const job = neprasNfLogChain.then(async () => {
    const op = String(request?.op || "");
    const stored = await chrome.storage.session.get(NEPRAS_NF_LOG_KEY);
    let arr = Array.isArray(stored?.[NEPRAS_NF_LOG_KEY]) ? stored[NEPRAS_NF_LOG_KEY] : [];
    if (op === "get") return { ok: true, entries: arr };
    if (op === "clear") {
      await chrome.storage.session.set({ [NEPRAS_NF_LOG_KEY]: [] });
      return { ok: true };
    }
    if (op === "add") {
      const entry = request?.entry;
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return { ok: false, message: "NF_LOG_BAD_ENTRY" };
      arr.push(entry);
      if (arr.length > NEPRAS_NF_LOG_MAX) arr = arr.slice(arr.length - NEPRAS_NF_LOG_MAX);
      await chrome.storage.session.set({ [NEPRAS_NF_LOG_KEY]: arr });
      return { ok: true };
    }
    return { ok: false, message: "NF_LOG_BAD_OP" };
  });
  neprasNfLogChain = job.catch(() => {}); // فشل عملية واحدة لا يوقف ما بعدها
  return job;
}

// ============================================================
// v1.2.78 — فتح «منقّي أسماء الطلاب» من نافذة نبراس
// 1) تنقية جارية: لا نُنقّل التبويب (قد يكون في منتصف حفظ طالب) ← نُظهره فقط.
// 2) غير ذلك: نفتح قائمة الطلاب (تبويب موجود أو جديد) وننتظر اكتمال تحميلها.
// 3) نحقن أدوات الموقع ثم وحدة المنقّي صراحةً: الحقن آمن للتكرار (حارس __NEPRAS_NAME_FIXER_LOADED__ داخل الملف)،
//    ويغطي صفحة حُمّلت قبل تحديث الإضافة (علامة الأدوات القديمة تمنع إعادة الحقن فلا تجد الوحدة).
// 4) لا نعتمد على ردّ الرسالة (مستمع attendance.js يردّ «success» على أي رسالة) بل نتحقق من ظهور اللوحة في الصفحة.
// ============================================================
const NEPRAS_NF_LIST_URL = "https://student.emis.gov.eg/student/list";
const NEPRAS_NF_HOST = "student.emis.gov.eg";
const NEPRAS_NF_VERIFY_ATTEMPTS = 5;
const NEPRAS_NF_VERIFY_GAP_MS = 1200;

async function neprasNfPanelVisible(tabId) {
  try {
    const res = await chrome.scripting.executeScript({
      target: { tabId },
      world: "ISOLATED",
      func: () => {
        const panel = document.getElementById("nf-panel");
        return !!panel && panel.style.display !== "none";
      }
    });
    return res?.[0]?.result === true;
  } catch (_) {
    return false;
  }
}

async function neprasOpenNameFixer(request) {
  const keepControlWindow = request?.keepControlWindow === true;
  const stored = await chrome.storage.local.get("nf_running");
  const running = stored?.nf_running === true;

  let tab = null;
  if (running) {
    const tabs = await chrome.tabs.query({ url: "https://student.emis.gov.eg/*" });
    tab = tabs.find((t) => !/^\/login(?:[/?#]|$)/i.test(neprasSafeUrl(t.url)?.pathname || "")) || tabs[0] || null;
    if (tab?.id != null) {
      tab = await chrome.tabs.update(tab.id, { active: true });
      if (!keepControlWindow && tab?.windowId != null) {
        await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
      }
      if (tab?.status !== "complete") await neprasWaitForTabComplete(tab.id);
    } else {
      tab = null;
    }
  }

  if (!tab) {
    const resolved = await neprasResolveWorkTab(NEPRAS_NF_LIST_URL, NEPRAS_NF_HOST, { focusWindow: !keepControlWindow });
    tab = resolved.tab;
    if (tab?.id == null) throw new Error("TARGET_TAB_NOT_FOUND");
    if (resolved.navigated || tab.status !== "complete") await neprasWaitForTabComplete(tab.id);
  }

  await neprasInjectSiteTools(tab.id, NEPRAS_NF_LIST_URL);
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: "ISOLATED", files: ["modules/name_fixer.js"] });

  for (let attempt = 0; attempt < NEPRAS_NF_VERIFY_ATTEMPTS; attempt++) {
    // إعادة الإرسال داخل الحلقة: قد لا يكون المستمع جاهزًا في المحاولة الأولى.
    await chrome.tabs.sendMessage(tab.id, { action: "NEPRAS_NAME_FIXER_SHOW" }).catch(() => null);
    await new Promise((r) => setTimeout(r, NEPRAS_NF_VERIFY_GAP_MS));
    if (await neprasNfPanelVisible(tab.id)) return { ok: true, tabId: tab.id, running };
  }
  return { ok: false, message: "NAME_FIXER_PANEL_NOT_SHOWN", tabId: tab.id, running };
}

function neprasIsExtensionPageSender(sender) {
  // يقبل صفحات الإضافة فقط (النافذة المنبثقة/الكبيرة)، لا سكربتات المحتوى ولا صفحات المواقع.
  const base = chrome.runtime.getURL("");
  return !!sender && sender.id === chrome.runtime.id && String(sender.url || "").startsWith(base);
}

console.log("🚀 تم تشغيل background.js الخاص بالإضافة.");

chrome.runtime.onInstalled.addListener(() => {
  console.log("🚀 تم تثبيت إضافة نبراس بنجاح.");
});

// Phase 1b: the legacy status-sheet download watcher (pendingStatusSheets
// Map + its chrome.downloads.onCreated/onChanged listeners) was removed —
// it only served the worker-tab pipeline that has zero callers now. The
// class-report download watcher below is separate and untouched. See
// PHASE_NOTES.md, "Phase 1b".

// ----------------------------------------------------------
// مراقبة تنزيل قوائم الفصول PDF - v1.0
// لا نعتمد على اسم الملف؛ الوزارة تنزل كل التقارير باسم pdf.pdf
// ونربط كل فصل برقم Download ID جديد ظهر بعد الضغط الحالي.
// ----------------------------------------------------------
const pendingClassReportDownloads = new Map();


// ============================================================
// v1.0 — التقاط جلسة API الخاصة بموقع بيانات التلميذ
//
// المشكلة في v1.0/v1.0:
// Manifest V3 يوقف Service Worker تلقائيًا عند الخمول.
// لذلك الـ Map الموجودة في الذاكرة كانت تضيع، وبعد أول تشغيل سريع
// يظهر AUTH_HEADERS_NOT_CAPTURED ويعود نبراس للمسار القديم.
//
// الحل:
// - Cache سريع في الذاكرة.
// - نسخة مؤقتة فقط في chrome.storage.session.
// - storage.session لا تستمر بعد إعادة تشغيل المتصفح.
// - لا يتم حفظ Authorization في chrome.storage.local.
// ============================================================

const neprasStudentApiAuthByTab = new Map();
const neprasTeacherApiAuthByTab = new Map();
const neprasSchoolByTab = new Map(); // tabId -> { schoolCode, schoolName, stage, updatedAt }
const NEPRAS_STUDENT_AUTH_LATEST_KEY = "neprasStudentApiAuthLatestV151";

// Security hardening (v1.0): captured Ministry API credentials remain valid across active school workday (12 hours).
// A fresh site request will automatically capture a new value when needed.
const NEPRAS_STUDENT_AUTH_MAX_AGE_MS = 12 * 60 * 60 * 1000;

function neprasStudentAuthIsFresh(auth) {
  if (!auth?.authorization) return false;
  const capturedAt = Number(auth.capturedAt || 0);
  if (!Number.isFinite(capturedAt) || capturedAt <= 0) return false;
  const age = Date.now() - capturedAt;
  return age >= -60000 && age <= NEPRAS_STUDENT_AUTH_MAX_AGE_MS;
}

function neprasTeacherAuthIsFresh(auth) {
  if (!auth?.authorization) return false;
  const capturedAt = Number(auth.capturedAt || 0);
  if (!Number.isFinite(capturedAt) || capturedAt <= 0) return false;
  const age = Date.now() - capturedAt;
  return age >= -60000 && age <= NEPRAS_STUDENT_AUTH_MAX_AGE_MS;
}


function neprasOpaqueSessionHash(value) {
  const text =
    String(value || "");

  let hash = 2166136261;

  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(
      hash,
      16777619
    );
  }

  return (
    "s-" +
    (hash >>> 0)
      .toString(16)
      .padStart(8, "0")
  );
}

function neprasStudentAuthTabKey(tabId) {
  return `neprasStudentApiAuthTabV151_${tabId}`;
}

try {
  chrome.storage.session?.setAccessLevel?.({
    accessLevel: "TRUSTED_CONTEXTS"
  }).catch(() => {});
} catch (err) { console.warn("[Nepras Handled]", err?.message || err); }

async function neprasPersistStudentApiAuth(tabId, auth) {
  try {
    if (!chrome.storage?.session || !auth?.authorization) {
      return;
    }

    const hasValidTab = Number.isInteger(Number(tabId)) && Number(tabId) >= 0;
    const safeTabId = hasValidTab ? Number(tabId) : -1;

    const safeAuth = {
      authorization: String(auth.authorization || ""),
      schoolcode: String(auth.schoolcode || ""),
      schoolstage: String(auth.schoolstage || ""),
      usertype: String(auth.usertype || "0"),
      capturedAt: Number(auth.capturedAt || Date.now()),
      tabId: safeTabId
    };

    const payload = {
      [NEPRAS_STUDENT_AUTH_LATEST_KEY]: safeAuth
    };
    if (hasValidTab) {
      payload[neprasStudentAuthTabKey(safeTabId)] = safeAuth;
    }
    if (safeAuth.schoolcode) {
      const cleanSc = String(safeAuth.schoolcode).replace(/\D/g, "");
      if (cleanSc) {
        payload[`nepras_student_auth_school_${cleanSc}`] = safeAuth;
      }
    }

    await chrome.storage.session.set(payload);
  } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
}

async function neprasTryRecoverStudentAuthFromTab(tabId) {
  try {
    if (!chrome.scripting?.executeScript) return null;
    const candidateIds = [];
    if (Number.isInteger(Number(tabId)) && Number(tabId) >= 0) {
      candidateIds.push(Number(tabId));
    }
    try {
      const tabs = await chrome.tabs.query({});
      for (const t of tabs || []) {
        if (t?.id != null && /^https:\/\/student\.emis\.gov\.eg(?:\/|$)/i.test(String(t.url || ""))) {
          if (!candidateIds.includes(Number(t.id))) candidateIds.push(Number(t.id));
        }
      }
    } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }

    for (const targetTabId of candidateIds) {
      try {
        const execRes = await chrome.scripting.executeScript({
          target: { tabId: targetTabId },
          world: "MAIN",
          func: () => {
            try {
              const out = {
                authorization: "",
                schoolcode: "",
                schoolstage: "",
                usertype: "0"
              };

              // 1. Check MAIN-world XHR/fetch hook if present
              const hooked = window.__neprasLastEmisHeaders || {};
              if (hooked.authorization) out.authorization = String(hooked.authorization).trim();
              if (hooked.schoolcode) out.schoolcode = String(hooked.schoolcode).trim();
              if (hooked.schoolstage) out.schoolstage = String(hooked.schoolstage).trim();
              if (hooked.usertype != null && String(hooked.usertype) !== "") out.usertype = String(hooked.usertype).trim();

              const jwtRe = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/;

              const inspectObject = (obj, depth = 0) => {
                if (!obj || typeof obj !== "object" || depth > 5) return;
                for (const [k, v] of Object.entries(obj)) {
                  if (v == null) continue;
                  const lk = String(k).toLowerCase().replace(/[_-]/g, "");
                  if (typeof v === "string" || typeof v === "number") {
                    const sv = String(v).trim();
                    if (!sv) continue;
                    if (!out.authorization && jwtRe.test(sv)) {
                      const m = sv.match(jwtRe);
                      if (m) out.authorization = "Bearer " + m[0];
                    }
                    if (!out.schoolcode && (lk === "schoolcode" || lk === "schoolid" || lk === "schcode" || lk === "schoolno")) {
                      if (/^\d{3,12}$/.test(sv)) out.schoolcode = sv;
                    }
                    if (!out.schoolstage && (lk === "schoolstage" || lk === "stagecode" || lk === "stageid" || lk === "schoolstagecode" || lk === "edustage" || lk === "stage")) {
                      if (/^\d{1,3}$/.test(sv)) out.schoolstage = sv;
                    }
                    if ((out.usertype === "0" || !out.usertype) && (lk === "usertype" || lk === "usertypeid" || lk === "roletype")) {
                      if (/^\d{1,3}$/.test(sv)) out.usertype = sv;
                    }
                  } else if (typeof v === "object") {
                    inspectObject(v, depth + 1);
                  }
                }
              };

              for (const store of [window.localStorage, window.sessionStorage]) {
                if (!store) continue;
                for (let i = 0; i < store.length; i++) {
                  const key = store.key(i);
                  if (!key) continue;
                  const raw = store.getItem(key);
                  if (!raw) continue;
                  const trimmed = raw.trim();
                  if (!out.authorization && jwtRe.test(trimmed)) {
                    const m = trimmed.match(jwtRe);
                    if (m) out.authorization = "Bearer " + m[0];
                  }
                  const lk = String(key).toLowerCase().replace(/[_-]/g, "");
                  const cleanVal = trimmed.replace(/^["']|["']$/g, "");
                  if (!out.schoolcode && (lk.includes("schoolcode") || lk === "schoolid" || lk === "schcode") && /^\d{3,12}$/.test(cleanVal)) {
                    out.schoolcode = cleanVal;
                  }
                  if (!out.schoolstage && (lk.includes("schoolstage") || lk.includes("stagecode") || lk === "stageid" || lk === "stage") && /^\d{1,3}$/.test(cleanVal)) {
                    out.schoolstage = cleanVal;
                  }
                  if ((out.usertype === "0" || !out.usertype) && lk.includes("usertype") && /^\d{1,3}$/.test(cleanVal)) {
                    out.usertype = cleanVal;
                  }
                  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
                    try { inspectObject(JSON.parse(trimmed), 0); } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
                  }
                }
              }

              // 3. Decode JWT payload claims if we found a Bearer token
              if (out.authorization) {
                const m = out.authorization.match(jwtRe);
                if (m) {
                  try {
                    const b64 = m[0].split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
                    const pad = b64 + "===".slice((b64.length + 3) % 4);
                    const jsonStr = decodeURIComponent(Array.prototype.map.call(atob(pad), (c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)).join(""));
                    const claims = JSON.parse(jsonStr);
                    inspectObject(claims, 0);
                  } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
                }
              }

              return out.authorization ? out : null;
            } catch (_) {
              return null;
            }
          }
        });

        const recovered = execRes?.[0]?.result;
        if (recovered?.authorization) {
          const merged = {
            ...(neprasStudentApiAuthByTab.get(targetTabId) || {}),
            authorization: String(recovered.authorization),
            ...(recovered.schoolcode ? { schoolcode: String(recovered.schoolcode) } : {}),
            ...(recovered.schoolstage ? { schoolstage: String(recovered.schoolstage) } : {}),
            usertype: String(recovered.usertype || "0"),
            capturedAt: Date.now()
          };
          neprasStudentApiAuthByTab.set(targetTabId, merged);
          await neprasPersistStudentApiAuth(targetTabId, merged);
          return merged;
        }
      } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
    }
  } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
  return null;
}

async function neprasReadStudentApiAuth(tabId, targetSchoolCode = null) {
  const hasTabId = Number.isInteger(Number(tabId)) && Number(tabId) >= 0;
  const numericTabId = hasTabId ? Number(tabId) : null;
  const cleanTargetSchool = targetSchoolCode ? String(targetSchoolCode).replace(/\D/g, "") : null;

  // 1) إذا طُلب كود مدرسة محدد، نبحث أولاً في الذاكرة عن توكن هذه المدرسة حصرياً
  if (cleanTargetSchool) {
    for (const [k, candidate] of neprasStudentApiAuthByTab.entries()) {
      const candSchool = String(candidate?.schoolcode || "").replace(/\D/g, "");
      if (candSchool === cleanTargetSchool && candidate?.authorization && neprasStudentAuthIsFresh(candidate)) {
        return candidate;
      }
    }
  }

  const memory =
    hasTabId
      ? neprasStudentApiAuthByTab.get(numericTabId)
      : null;

  if (memory?.authorization) {
    if (neprasStudentAuthIsFresh(memory)) {
      if (!cleanTargetSchool || String(memory.schoolcode || "").replace(/\D/g, "") === cleanTargetSchool) {
        return memory;
      }
    }
    neprasStudentApiAuthByTab.delete(numericTabId);
  }

  if (!hasTabId) {
    for (const [k, candidate] of neprasStudentApiAuthByTab.entries()) {
      if (candidate?.authorization && neprasStudentAuthIsFresh(candidate)) {
        if (!cleanTargetSchool || String(candidate.schoolcode || "").replace(/\D/g, "") === cleanTargetSchool) {
          return candidate;
        }
      } else if (candidate && !neprasStudentAuthIsFresh(candidate)) {
        neprasStudentApiAuthByTab.delete(k);
      }
    }
  }

  try {
    if (chrome.storage?.session) {
      const tabKey = hasTabId
        ? neprasStudentAuthTabKey(numericTabId)
        : null;
      const schoolKey = cleanTargetSchool ? `nepras_student_auth_school_${cleanTargetSchool}` : null;
      const keys = [NEPRAS_STUDENT_AUTH_LATEST_KEY];
      if (tabKey) keys.push(tabKey);
      if (schoolKey) keys.push(schoolKey);

      const stored = await chrome.storage.session.get(keys);
      const tabAuth = tabKey ? (stored?.[tabKey] || null) : null;
      const schoolAuth = schoolKey ? (stored?.[schoolKey] || null) : null;
      const latestAuth = stored?.[NEPRAS_STUDENT_AUTH_LATEST_KEY] || null;

      const staleKeys = [];
      if (tabKey && tabAuth?.authorization && !neprasStudentAuthIsFresh(tabAuth)) {
        staleKeys.push(tabKey);
      }
      if (schoolKey && schoolAuth?.authorization && !neprasStudentAuthIsFresh(schoolAuth)) {
        staleKeys.push(schoolKey);
      }
      if (latestAuth?.authorization && !neprasStudentAuthIsFresh(latestAuth)) {
        staleKeys.push(NEPRAS_STUDENT_AUTH_LATEST_KEY);
      }
      if (staleKeys.length) {
        await chrome.storage.session.remove([...new Set(staleKeys)]);
      }

      const auth =
        (cleanTargetSchool && neprasStudentAuthIsFresh(schoolAuth) && schoolAuth) ||
        (neprasStudentAuthIsFresh(tabAuth) && tabAuth) ||
        (neprasStudentAuthIsFresh(latestAuth) && (!cleanTargetSchool || String(latestAuth.schoolcode || "").replace(/\D/g, "") === cleanTargetSchool) && latestAuth) ||
        (neprasStudentAuthIsFresh(latestAuth) && latestAuth) ||
        null;

      if (auth?.authorization) {
        if (hasTabId) {
          neprasStudentApiAuthByTab.set(numericTabId, auth);
        }
        return auth;
      }
    }
  } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }

  const recovered = await neprasTryRecoverStudentAuthFromTab(numericTabId);
  if (recovered?.authorization) {
    if (!cleanTargetSchool || String(recovered.schoolcode || "").replace(/\D/g, "") === cleanTargetSchool) {
      if (hasTabId) {
        neprasStudentApiAuthByTab.set(numericTabId, recovered);
      }
      return recovered;
    }
  }

  return null;
}

async function neprasClearStudentApiAuth(tabId) {
  try {
    const hasTabId = Number.isInteger(Number(tabId)) && Number(tabId) >= 0;
    const numericTabId = hasTabId ? Number(tabId) : null;

    if (hasTabId) {
      neprasStudentApiAuthByTab.delete(numericTabId);
    } else {
      neprasStudentApiAuthByTab.clear();
    }

    if (!chrome.storage?.session) return;

    if (!hasTabId) {
      await chrome.storage.session.remove([NEPRAS_STUDENT_AUTH_LATEST_KEY]);
      return;
    }

    const tabKey = neprasStudentAuthTabKey(numericTabId);
    const latest = await chrome.storage.session.get([NEPRAS_STUDENT_AUTH_LATEST_KEY]);
    const latestAuth = latest?.[NEPRAS_STUDENT_AUTH_LATEST_KEY] || null;
    const keys = [tabKey];

    // Do not invalidate another live student tab's Latest credential.
    if (Number(latestAuth?.tabId) === numericTabId) {
      keys.push(NEPRAS_STUDENT_AUTH_LATEST_KEY);
    }

    await chrome.storage.session.remove(keys);
  } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
}

function neprasCaptureStudentApiHeaders(details) {
  try {
    const rawTabId = Number(details?.tabId);
    const tabId = Number.isInteger(rawTabId) && rawTabId >= 0 ? rawTabId : -1;

    const allowedNames = new Set([
      "authorization",
      "schoolcode",
      "schoolstage",
      "usertype"
    ]);

    const captured = {};

    for (const h of details.requestHeaders || []) {
      const name = String(h?.name || "").toLowerCase();
      if (!allowedNames.has(name)) continue;

      const value =
        h?.value == null
          ? ""
          : String(h.value);

      if (value) {
        captured[name] = value;
      }
    }

    if (captured.authorization) {
      const existing = neprasStudentApiAuthByTab.get(tabId) || neprasStudentApiAuthByTab.get(-1) || {};
      const merged = {
        ...existing,
        ...captured,
        capturedAt: Date.now()
      };

      neprasStudentApiAuthByTab.set(
        tabId,
        merged
      );

      neprasPersistStudentApiAuth(
        tabId,
        merged
      );
    }
  } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
}


function neprasCaptureTeacherApiHeaders(details) {
  try {
    const rawTabId =
      Number(details?.tabId);

    const tabId =
      Number.isInteger(rawTabId) && rawTabId >= 0
        ? rawTabId
        : -1;

    const allowed =
      new Set([
        "authorization",
        "ut",
        "ed",
        "md",
        "sc",
        "ty",
        "accept",
        "content-type"
      ]);

    const captured = {};

    for (
      const h of
      details.requestHeaders || []
    ) {
      const name =
        String(
          h?.name || ""
        ).toLowerCase();

      if (!allowed.has(name)) {
        continue;
      }

      const value =
        h?.value == null
          ? ""
          : String(h.value);

      if (value) {
        captured[name] =
          value;
      }
    }

    if (
      captured.authorization ||
      neprasTeacherApiAuthByTab.has(
        tabId
      )
    ) {
      neprasTeacherApiAuthByTab.set(
        tabId,
        {
          ...(
            neprasTeacherApiAuthByTab.get(
              tabId
            ) || {}
          ),
          ...captured,
          capturedAt:
            Date.now()
        }
      );
    }
  } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
}

try {
  chrome.webRequest.onBeforeSendHeaders.addListener(
    neprasCaptureTeacherApiHeaders,
    {
      urls: [
        "https://professopi.emis.gov.eg/*"
      ]
    },
    [
      "requestHeaders",
      "extraHeaders"
    ]
  );
} catch (error) {
  console.warn(
    "Nepras teacher auth capture unavailable:",
    error?.message || error
  );
}

try {
  chrome.webRequest.onBeforeSendHeaders.addListener(
    neprasCaptureStudentApiHeaders,
    {
      urls: [
        "https://studaapi.emis.gov.eg/*"
      ]
    },
    [
      "requestHeaders",
      "extraHeaders"
    ]
  );
} catch (error) {
  console.warn(
    "Nepras webRequest auth capture unavailable:",
    error?.message || error
  );
}

try {
  chrome.tabs.onRemoved.addListener(tabId => {
    neprasReleaseSchoolStatsLock(
      "",
      tabId
    ).catch(() => {});

    neprasClearStudentApiAuth(tabId).catch(() => {});
    neprasTeacherApiAuthByTab.delete(tabId);
  });
} catch (err) { console.warn("[Nepras Handled]", err?.message || err); }

// Security hardening (v1.0): if a student tab leaves the Ministry student
// site (logout, expired session, external redirect), discard that tab's API auth.
try {
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    const nextUrl = String(changeInfo?.url || tab?.url || "");
    if (!nextUrl) return;

    if (!/^https:\/\/student\.emis\.gov\.eg(?:\/|$)/i.test(nextUrl) || /\/Account\/Log(?:in|Off)|\/login|\/logout/i.test(nextUrl)) {
      if (neprasStudentApiAuthByTab.has(tabId)) {
        neprasClearStudentApiAuth(tabId).catch(() => {});
      }
    }
    if (changeInfo.status === "complete" && /^https:\/\/student\.emis\.gov\.eg(?:\/|$)/i.test(nextUrl) && !/\/login|\/Account\/Login/i.test(nextUrl)) {
      neprasTryRecoverStudentAuthFromTab(tabId).catch(() => {});
    }
    if (!/^https:\/\/teacher\.emis\.gov\.eg(?:\/|$)/i.test(nextUrl) || /\/Account\/Log(?:in|Off)|\/login|\/logout/i.test(nextUrl)) {
      if (neprasTeacherApiAuthByTab.has(tabId)) {
        neprasTeacherApiAuthByTab.delete(tabId);
      }
    }
  });
} catch (err) { console.warn("[Nepras Handled]", err?.message || err); }

function sendClassReportMessage(tabId, payload) {
  chrome.tabs.sendMessage(tabId, payload).catch(() => {});
}

function clearClassReportPoll(pending) {
  if (!pending) return;
  if (pending.pollTimer) clearInterval(pending.pollTimer);
  if (pending.timeout) clearTimeout(pending.timeout);
  pending.pollTimer = null;
  pending.timeout = null;
}

// v1.0 — الموقع بينزّل ملف PDF حقيقي لكل فصل بمفرده (لأننا بنضغط زر الوزارة
// الحقيقي)، وده كان بيسيب 20 ملف منفصل في فولدر التنزيلات لمستخدم فيه 20 فصل،
// بالإضافة للملف المجمّع النهائي. نبراس بيقرأ محتوى كل فصل عبر رابطه مباشرة
// (fetchPdfBytes، مستقل تمامًا عن سجل التنزيل نفسه)، فمفيش داعي إن ملف الفصل
// الفردي ده يفضل في جهاز المستخدم — نلغيه/نمسحه بمجرد ما نلقط رابطه، ويبقى
// الملف المجمّع النهائي بس هو اللي يفضل ظاهر في فولدر التنزيلات.
// v1.2.24 — إصلاح: ملفات pdf.pdf الفردية كانت تبقى في مجلد التنزيلات الرئيسي.
// السبب: مسار الالتقاط عبر الشبكة (webRequest / "network-pdf") يسبق ظهور عنصر التنزيل في
// chrome.downloads، فيصل بلا downloadId (null) فيتوقف الإخفاء مبكرًا، وبعدها يُنشئ المتصفح
// التنزيل الفعلي ولا يجد من يلغيه. الحل: نتذكّر رابط الملف الملتقط (استخدام واحد لكل التقاط،
// صلاحية دقيقة) ونلغي التنزيل المطابق له تمامًا حين يظهر.
const NEPRAS_CLASS_REPORT_LATE_SUPPRESS_TTL_MS = 60000;
const neprasCapturedClassReportUrls = new Map(); // normalizedUrl -> { count, expiresAt }
const neprasSuppressedDownloadIds = new Set();

function neprasNormalizeReportUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try { const u = new URL(raw); u.hash = ""; return u.href; } catch (_) { return raw.split("#")[0]; }
}

function neprasPruneCapturedClassReportUrls(now = Date.now()) {
  for (const [key, entry] of neprasCapturedClassReportUrls) {
    if (!entry || entry.expiresAt <= now) neprasCapturedClassReportUrls.delete(key);
  }
}

function neprasRememberCapturedClassReportUrl(...urls) {
  const now = Date.now();
  neprasPruneCapturedClassReportUrls(now);
  const keys = new Set(urls.map(neprasNormalizeReportUrl).filter(Boolean));
  for (const key of keys) {
    const entry = neprasCapturedClassReportUrls.get(key);
    neprasCapturedClassReportUrls.set(key, {
      count: (entry?.count || 0) + 1,
      expiresAt: now + NEPRAS_CLASS_REPORT_LATE_SUPPRESS_TTL_MS
    });
  }
}

// يُرجع true (ويستهلك التسجيل مرة واحدة) لو كان هذا التنزيل هو نفس ملف PDF الذي التقطناه عبر الشبكة.
function neprasConsumeCapturedClassReportDownload(item) {
  neprasPruneCapturedClassReportUrls();
  const candidates = [item?.url, item?.finalUrl].map(neprasNormalizeReportUrl).filter(Boolean);
  for (const key of candidates) {
    const entry = neprasCapturedClassReportUrls.get(key);
    if (!entry) continue;
    entry.count -= 1;
    if (entry.count <= 0) neprasCapturedClassReportUrls.delete(key);
    // نستهلك تسجيلًا واحدًا فقط لهذا التنزيل حتى لو طابق الرابطان معًا.
    for (const other of candidates) {
      if (other === key) continue;
      const otherEntry = neprasCapturedClassReportUrls.get(other);
      if (otherEntry) {
        otherEntry.count -= 1;
        if (otherEntry.count <= 0) neprasCapturedClassReportUrls.delete(other);
      }
    }
    return true;
  }
  return false;
}

function neprasSuppressIntermediateClassDownload(downloadId) {
  if (!Number.isInteger(downloadId)) return;
  neprasSuppressedDownloadIds.add(downloadId);
  try {
    chrome.downloads.cancel(downloadId, () => {
      void chrome.runtime.lastError; // نتجاهل الخطأ لو الملف خلص التنزيل بالفعل
      // نجرب نمسح الملف من القرص لو كان خلص قبل ما يتلغي، ثم نشيله من سجل
      // التنزيلات في المتصفح عشان مايفضلش ظاهر كملف منفصل.
      try {
        chrome.downloads.removeFile(downloadId, () => {
          void chrome.runtime.lastError;
          try { chrome.downloads.erase({ id: downloadId }, () => void chrome.runtime.lastError); } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
        });
      } catch (_) {
        try { chrome.downloads.erase({ id: downloadId }, () => void chrome.runtime.lastError); } catch (__) {}
      }
    });
  } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
}

function finishClassReportDownload(tabId, item, source = "downloads") {
  const pending = pendingClassReportDownloads.get(tabId);
  if (!pending || pending.done) return;
  pending.done = true;
  clearClassReportPoll(pending);
  pendingClassReportDownloads.delete(tabId);

  const downloadId = Number.isInteger(item?.id) ? item.id : null;
  const finalUrl = String(item?.finalUrl || item?.url || "");

  sendClassReportMessage(tabId, {
    action: "CLASS_REPORT_DOWNLOAD_READY",
    downloadId,
    url: String(item?.url || finalUrl || ""),
    finalUrl,
    filename: String(item?.filename || ""),
    mime: String(item?.mime || "application/pdf"),
    source,
    classValue: pending.classValue || "",
    classText: pending.classText || ""
  });

  if (downloadId === null) {
    // التقاط عبر الشبكة قبل ظهور التنزيل: نسجّل الرابط لإلغاء التنزيل الفردي حين يظهر.
    neprasRememberCapturedClassReportUrl(item?.url, item?.finalUrl);
  } else {
    neprasSuppressIntermediateClassDownload(downloadId);
  }
}

function failClassReportDownload(tabId, message) {
  const pending = pendingClassReportDownloads.get(tabId);
  if (!pending || pending.done) return;
  pending.done = true;
  clearClassReportPoll(pending);
  pendingClassReportDownloads.delete(tabId);
  sendClassReportMessage(tabId, {
    action: "CLASS_REPORT_DOWNLOAD_ERROR",
    message: message || "فشل تنزيل قائمة الفصل."
  });
}

function isNewClassReportDownload(item, pending) {
  if (!item || pending.done) return false;
  if (pending.knownIds.has(item.id)) return false;

  const startMs = Date.parse(item.startTime || "") || 0;
  if (startMs && startMs + 250 < pending.startedAt) return false;

  // لا نعتمد على اسم الملف؛ pdf.pdf وpdf (n).pdf طبيعيان.
  const filename = String(item.filename || "").toLowerCase();
  const mime = String(item.mime || "").toLowerCase();
  const url = String(item.finalUrl || item.url || "").toLowerCase();
  let decoded = url;
  try { decoded = decodeURIComponent(url); } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }

  const looksPdf =
    mime.includes("application/pdf") ||
    /\.pdf(?:$|[?#])/i.test(filename) ||
    /\.pdf(?:$|[?#])/i.test(url);

  const looksRelevantUrl =
    decoded.includes("class/report") ||
    decoded.includes("report") ||
    decoded.includes("pdf");

  return looksPdf || looksRelevantUrl;
}

function pollClassReportDownload(tabId) {
  const pending = pendingClassReportDownloads.get(tabId);
  if (!pending || pending.done) return;

  chrome.downloads.search({
    orderBy: ["-startTime"],
    limit: 100
  }, (items) => {
    if (chrome.runtime.lastError) return;
    const list = Array.isArray(items) ? items : [];
    const candidate = list.find(item => isNewClassReportDownload(item, pending));
    if (!candidate) return;

    pending.candidateId = candidate.id;
    pending.candidate = candidate;

    const directUrl = String(candidate.finalUrl || candidate.url || "");
    if (directUrl) {
      finishClassReportDownload(tabId, candidate, "downloads-poll");
    } else if (candidate.state === "complete") {
      finishClassReportDownload(tabId, candidate, "downloads-complete");
    } else if (candidate.state === "interrupted") {
      failClassReportDownload(tabId, "تعذر التقاط رابط تقرير الفصل.");
    }
  });
}

chrome.downloads.onCreated.addListener((item) => {
  // ملف فصل سبق التقاطه عبر الشبكة: نلغيه ولا نعتبره إشارة لفصل آخر (يمنع أيضًا الخلط بين فصلين).
  if (neprasConsumeCapturedClassReportDownload(item)) {
    neprasSuppressIntermediateClassDownload(item.id);
    return;
  }
  for (const [tabId, pending] of pendingClassReportDownloads.entries()) {
    if (pending.done) continue;
    if (!isNewClassReportDownload(item, pending)) continue;

    pending.candidateId = item.id;
    pending.candidate = item;

    // v1.0: لا ننتظر اكتمال Download ID. بمجرد ظهور رابط الـ PDF
    // نرسله لمحرك نبراس ليقرأ الملف عبر fetch ويكمل الدمج. هذا يمنع
    // إضافات التحميل الخارجية (مثل IDM) من تعطيل تسلسل قوائم الفصول.
    const directUrl = String(item.finalUrl || item.url || "");
    if (directUrl) {
      finishClassReportDownload(tabId, item, "downloads-created");
      return;
    }

    if (item.state === "complete") {
      finishClassReportDownload(tabId, item, "downloads-complete");
    }
  }
});

chrome.downloads.onChanged.addListener((delta) => {
  if (!delta?.id) return;
  if (neprasSuppressedDownloadIds.has(delta.id) &&
      (delta.state?.current === "complete" || delta.state?.current === "interrupted")) {
    neprasSuppressedDownloadIds.delete(delta.id);
    if (delta.state.current === "complete") {
      try {
        chrome.downloads.removeFile(delta.id, () => {
          void chrome.runtime.lastError;
          try { chrome.downloads.erase({ id: delta.id }, () => void chrome.runtime.lastError); } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
        });
      } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
    } else {
      try { chrome.downloads.erase({ id: delta.id }, () => void chrome.runtime.lastError); } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
    }
    return;
  }
  for (const [tabId, pending] of pendingClassReportDownloads.entries()) {
    if (pending.done || pending.candidateId !== delta.id) continue;

    if (delta.state?.current === "complete") {
      chrome.downloads.search({ id: delta.id }, (items) => {
        const item = items && items[0];
        if (item) finishClassReportDownload(tabId, item, "downloads-complete");
      });
    } else if (delta.state?.current === "interrupted") {
      // لا نفشل فورًا: قد تكون إضافة تحميل خارجية قد استلمت الملف.
      // webRequest / polling سيحاولان التقاط رابط الـ PDF مباشرة.
      pollClassReportDownload(tabId);
    }
  }
});

// v1.0 — مسار مقاوم لإضافات التحميل الخارجية (IDM وغيرها).
// نلتقط استجابة PDF نفسها من شبكة موقع الوزارة ونرسل رابطها فورًا
// لمحرك الدمج، بدل الاعتماد على اكتمال سجل chrome.downloads.
try {
  chrome.webRequest.onHeadersReceived.addListener(
    (details) => {
      try {
        const tabId = Number(details?.tabId);
        if (!Number.isInteger(tabId) || tabId < 0) return;
        const pending = pendingClassReportDownloads.get(tabId);
        if (!pending || pending.done) return;

        const url = String(details?.url || "");
        if (!url) return;

        const headers = Array.isArray(details?.responseHeaders) ? details.responseHeaders : [];
        let contentType = "";
        let disposition = "";
        for (const h of headers) {
          const name = String(h?.name || "").toLowerCase();
          const value = String(h?.value || "");
          if (name === "content-type") contentType = value.toLowerCase();
          if (name === "content-disposition") disposition = value.toLowerCase();
        }

        let decoded = url.toLowerCase();
        try { decoded = decodeURIComponent(url).toLowerCase(); } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }

        const looksPdf =
          contentType.includes("application/pdf") ||
          disposition.includes(".pdf") ||
          /\.pdf(?:$|[?#])/i.test(url);

        const looksReport =
          decoded.includes("class/report") ||
          decoded.includes("report") ||
          decoded.includes("pdf");

        if (!looksPdf || !looksReport) return;

        finishClassReportDownload(tabId, {
          id: null,
          url,
          finalUrl: url,
          filename: "",
          mime: contentType || "application/pdf"
        }, "network-pdf");
      } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
    },
    {
      urls: [
        "https://student.emis.gov.eg/*",
        "https://studaapi.emis.gov.eg/*"
      ]
    },
    ["responseHeaders", "extraHeaders"]
  );
} catch (error) {
  console.warn("Nepras class report network capture unavailable:", error?.message || error);
}

// Phase 1b: statusWorkers Map and sendWorkerMessage() removed — its own
// comment called this "الحفاظ على النظام السابق" (preserving the previous
// system); the worker-tab pipeline it served has zero callers now. See
// PHASE_NOTES.md, "Phase 1b".

// ==========================================================
// 👥 Staff worker batch
// كل موظف في تبويب عامل مستقل، والقائمة الرئيسية لا تغادر مكانها.
// ==========================================================
const staffBatches = new Map();

function staffBatchSendResult(batch, payload) {
  if (!batch?.mainTabId) return;
  chrome.tabs.sendMessage(batch.mainTabId, payload).catch(() => {});
}

function staffBatchCleanup(taskId) {
  const batch = staffBatches.get(taskId);
  if (!batch) return;
  if (batch.workerTabId != null) {
    chrome.tabs.remove(batch.workerTabId).catch(() => {});
  }
  clearTimeout(batch.workerTimeout);
  staffBatches.delete(taskId);
}

function staffBatchCreateWorker(batch) {
  if (batch.cancelled) return;
  const staff = batch.staffList[batch.index];
  if (!staff) {
    staffBatchSendResult(batch, {
      action: "STAFF_BATCH_FINISHED",
      taskId: batch.taskId,
      mode: batch.mode,
      filter: batch.filter,
      rows: batch.results
    });
    staffBatchCleanup(batch.taskId);
    return;
  }

  chrome.tabs.create({
    url: "https://teacher.emis.gov.eg/dashboard/employee",
    active: false
  }, (tab) => {
    if (chrome.runtime.lastError || !tab?.id) {
      const errorRow = {
        "كود الموظف": String(staff.empCode || ""),
        "اسم الموظف الكامل": staff.fullName || "",
        "تصنيف العامل": batch.filter?.type || "",
        "الموقف من العمل": batch.filter?.status || "",
        "حالة التنزيل": `خطأ: ${chrome.runtime.lastError?.message || "تعذر إنشاء تبويب الموظف."}`
      };
      batch.results.push(errorRow);
      batch.index += 1;
      staffBatchCreateWorker(batch);
      return;
    }

    batch.workerTabId = tab.id;
    batch.workerTimeout = setTimeout(() => {
      if (batch.cancelled) return;
      const current = staffBatches.get(batch.taskId);
      if (!current || current.workerTabId !== tab.id) return;

      const errorRow = {
        "كود الموظف": String(staff.empCode || ""),
        "اسم الموظف الكامل": staff.fullName || "",
        "تصنيف العامل": batch.filter?.type || "",
        "الموقف من العمل": batch.filter?.status || "",
        "حالة التنزيل": "خطأ: انتهت مهلة فتح صفحة الموظف أو تنزيل بياناته."
      };
      batch.results.push(errorRow);
      batch.index += 1;
      chrome.tabs.remove(tab.id).catch(() => {});
      batch.workerTabId = null;
      staffBatchCreateWorker(batch);
    }, 90000);

    const task = {
      taskId: batch.taskId,
      workerTabId: tab.id,
      empCode: String(staff.empCode || ""),
      fullName: staff.fullName || "",
      empFlag: staff.empFlag || "",
      filter: batch.filter
    };

    const send = () => {
      const current = staffBatches.get(batch.taskId);
      if (!current || current.cancelled || current.workerTabId !== tab.id) return;
      chrome.tabs.sendMessage(tab.id, { action: "STAFF_WORKER_OPEN", task }, () => {
        if (chrome.runtime.lastError) {
          setTimeout(() => {
            chrome.tabs.sendMessage(tab.id, { action: "STAFF_WORKER_OPEN", task }).catch(() => {});
          }, 1500);
        }
      });
    };

    // Give Angular and content.js enough time to initialize.
    setTimeout(send, 2200);
  });
}


// ----------------------------------------------------------
// التنقل الذكي بين تبويبات مواقع الوزارة - v1.0
// يعيد استخدام التبويب الموجود لنفس الموقع، ولا ينشئ تبويبًا جديدًا
// إلا إذا لم يوجد أي تبويب للموقع المطلوب في النافذة الحالية.
// ----------------------------------------------------------
function neprasSafeUrl(url) {
  try { return new URL(String(url || "")); } catch (_) { return null; }
}

function neprasUrlMatchesTarget(currentUrl, targetUrl) {
  const current = neprasSafeUrl(currentUrl);
  const target = neprasSafeUrl(targetUrl);
  if (!current || !target || current.hostname !== target.hostname) return false;

  if (target.hash) {
    return current.pathname === target.pathname &&
      String(current.hash || "").toLowerCase().startsWith(String(target.hash || "").toLowerCase());
  }

  return current.pathname === target.pathname || current.pathname.startsWith(`${target.pathname}/`);
}

async function neprasWaitForTabComplete(tabId, timeout = 22000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab?.status === "complete") {
        await new Promise(r => setTimeout(r, 500));
        return tab;
      }
    } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error("TAB_LOAD_TIMEOUT");
}

async function neprasSendTabMessageRetry(tabId, message, timeout = 12000) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeout) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, message);
      return response;
    } catch (error) {
      lastError = error;
      await new Promise(r => setTimeout(r, 450));
    }
  }
  throw lastError || new Error("CONTENT_SCRIPT_NOT_READY");
}

async function neprasResolveWorkTab(targetUrl, siteHost, options = {}) {
  // v1.0: search ALL normal browser windows, not only the window that owns the popup.
  // This is important because the extension UI itself is not a work tab.
  const focusWindow = options?.focusWindow !== false;
  const tabs = await chrome.tabs.query({});
  const usable = tabs.filter(tab => tab?.id != null && /^https?:/i.test(String(tab.url || "")));

  const targetSchool = options?.schoolCode ? String(options.schoolCode).replace(/\D/g, "") : null;
  if (targetSchool) {
    const schoolMatchedTab = usable.find(tab => {
      const auth = neprasStudentApiAuthByTab.get(tab.id);
      const sc = String(auth?.schoolcode || "").replace(/\D/g, "");
      return sc === targetSchool;
    });
    if (schoolMatchedTab?.id != null) {
      const isExact = neprasUrlMatchesTarget(schoolMatchedTab.url, targetUrl);
      const tab = isExact
        ? await chrome.tabs.update(schoolMatchedTab.id, { active: true })
        : await chrome.tabs.update(schoolMatchedTab.id, { url: targetUrl, active: true });
      if (focusWindow && tab?.windowId != null) await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
      return { tab, reused: true, navigated: !isExact, created: false };
    }
  }

  const exact = usable.find(tab => neprasUrlMatchesTarget(tab.url, targetUrl));
  if (exact?.id != null) {
    const tab = await chrome.tabs.update(exact.id, { active: true });
    if (focusWindow && tab?.windowId != null) await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
    return { tab, reused: true, navigated: false, created: false };
  }

  const sameSiteCandidates = usable.filter(tab => {
    const u = neprasSafeUrl(tab.url);
    return u && u.hostname === siteHost;
  });

  // v1.0: لا نعتبر /login صفحة عمل صالحة عندما توجد صفحة أخرى من نفس الموقع.
  const sameSite =
    sameSiteCandidates.find(tab => {
      const u = neprasSafeUrl(tab.url);
      return u && !/^\/login(?:[/?#]|$)/i.test(u.pathname || "");
    }) ||
    sameSiteCandidates[0];

  if (sameSite?.id != null) {
    const tab = await chrome.tabs.update(sameSite.id, { url: targetUrl, active: true });
    if (focusWindow && tab?.windowId != null) await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
    return { tab, reused: true, navigated: true, created: false };
  }

  // No suitable tab exists: create one in the last focused normal browser window.
  let windowId;
  try {
    const win = await chrome.windows.getLastFocused({ windowTypes: ["normal"] });
    windowId = win?.id;
  } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
  const createProps = { url: targetUrl, active: true };
  if (windowId != null) createProps.windowId = windowId;
  const tab = await chrome.tabs.create(createProps);
  if (focusWindow && tab?.windowId != null) await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
  return { tab, reused: false, navigated: true, created: true };
}

async function neprasNavigateAndRun(request) {
  const targetUrl = String(request.targetUrl || "").trim();
  const target = neprasSafeUrl(targetUrl);
  const siteHost = String(request.siteHost || target?.hostname || "").trim();
  const messages = Array.isArray(request.messages) ? request.messages.filter(Boolean) : [];
  if (!targetUrl || !siteHost) throw new Error("NAVIGATION_TARGET_MISSING");

  const keepControlWindow = request?.keepControlWindow === true;
  const controlWindowId = Number(request?.controlWindowId);

  const resolved = await neprasResolveWorkTab(
    targetUrl,
    siteHost,
    { focusWindow: !keepControlWindow, schoolCode: request?.schoolCode }
  );
  const tabId = resolved.tab?.id;
  if (tabId == null) throw new Error("TARGET_TAB_NOT_FOUND");

  if (resolved.navigated || resolved.tab?.status !== "complete") {
    await neprasWaitForTabComplete(tabId);
  }

  // v1.0: make sure authenticated page tools are present before sending the command.
  await neprasInjectSiteTools(tabId, targetUrl);

  const responses = [];
  for (const message of messages) {
    responses.push(await neprasSendTabMessageRetry(tabId, message));
  }

  if (keepControlWindow && Number.isFinite(controlWindowId)) {
    await chrome.windows.update(controlWindowId, { focused: true }).catch(() => {});
  }

  return {
    ok: true,
    tabId,
    reused: resolved.reused,
    created: resolved.created,
    navigated: resolved.navigated,
    responses
  };
}



// ============================================================
// v1.0 — قفل عالمي لإحصاء المدرسة
// يمنع تشغيل أكثر من Refresh في نفس الوقت حتى لو كان هناك أكثر
// من تبويب student.emis.gov.eg مفتوحًا.
// التخزين في session فقط، مع TTL حتى لا يبقى القفل إذا أُغلق التبويب فجأة.
// ============================================================

const NEPRAS_SCHOOL_STATS_LOCK_KEY =
  "neprasSchoolStatsRunLockV161";

function neprasSchoolStatsLockKey(schoolCode) {
  const clean = String(schoolCode || "").replace(/\D/g, "");
  return clean ? `neprasSchoolStatsRunLock_${clean}_V161` : NEPRAS_SCHOOL_STATS_LOCK_KEY;
}

const NEPRAS_SCHOOL_STATS_LOCK_TTL_MS =
  120000;

async function neprasAcquireSchoolStatsLock(tabId, schoolCode = null) {
  try {
    const now = Date.now();
    const lockKey = neprasSchoolStatsLockKey(schoolCode);

    const stored =
      await chrome.storage.session.get(
        lockKey
      );

    const current =
      stored?.[
        lockKey
      ] || null;

    const currentAge =
      current?.startedAt
        ? now - Number(current.startedAt)
        : Number.POSITIVE_INFINITY;

    if (
      current?.token &&
      currentAge <
        NEPRAS_SCHOOL_STATS_LOCK_TTL_MS
    ) {
      return {
        ok: false,
        busy: true,
        tabId:
          Number(current.tabId ?? -1),
        startedAt:
          Number(current.startedAt || 0)
      };
    }

    const token =
      `stats-${tabId}-${now}-${Math.random()
        .toString(36)
        .slice(2, 10)}`;

    const lock = {
      token,
      tabId:
        Number(tabId ?? -1),
      startedAt: now
    };

    await chrome.storage.session.set({
      [lockKey]:
        lock
    });

    return {
      ok: true,
      busy: false,
      token
    };
  } catch (error) {
    return {
      ok: false,
      busy: false,
      message:
        error?.message ||
        String(error)
    };
  }
}

async function neprasReleaseSchoolStatsLock(
  token = "",
  tabId = null,
  schoolCode = null
) {
  try {
    const lockKey = neprasSchoolStatsLockKey(schoolCode);
    const stored =
      await chrome.storage.session.get(
        lockKey
      );

    const current =
      stored?.[
        lockKey
      ] || null;

    if (!current?.token) {
      return true;
    }

    const tokenMatches =
      token &&
      String(current.token) ===
        String(token);

    const tabMatches =
      tabId !== null &&
      Number(current.tabId) ===
        Number(tabId);

    if (tokenMatches || tabMatches) {
      await chrome.storage.session.remove(
        lockKey
      );
    }

    return true;
  } catch (_) {
    return false;
  }
}

// ============================================================
// v1.0 — إلغاء طلبات Student API الجارية لكل تبويب
// ============================================================
const neprasStudentFetchControllersByTab = new Map();

function neprasRegisterStudentFetchController(tabId, controller) {
  if (tabId == null || !controller) return;
  if (!neprasStudentFetchControllersByTab.has(tabId)) {
    neprasStudentFetchControllersByTab.set(tabId, new Set());
  }
  neprasStudentFetchControllersByTab.get(tabId).add(controller);
}

function neprasUnregisterStudentFetchController(tabId, controller) {
  const set = neprasStudentFetchControllersByTab.get(tabId);
  if (!set) return;
  set.delete(controller);
  if (!set.size) neprasStudentFetchControllersByTab.delete(tabId);
}

function neprasAbortStudentFetchesForTab(tabId) {
  const set = neprasStudentFetchControllersByTab.get(tabId);
  if (!set) return 0;
  let count = 0;
  for (const controller of set) {
    try { controller.abort(); count++; } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
  }
  neprasStudentFetchControllersByTab.delete(tabId);
  return count;
}

const NEPRAS_COMMAND_STORAGE_KEYS = Object.freeze([
  "pendingTeacherTask",
  "pendingExportTask",
  "exportTask",
  "pendingClassReportTask"
]);

async function neprasClearCommandStorage() {
  try {
    await chrome.storage.local.remove(
      NEPRAS_COMMAND_STORAGE_KEYS
    );
  } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
}

function neprasClearDownloadWatchersForTab(tabId) {
  const pendingClass =
    pendingClassReportDownloads.get(tabId);

  if (pendingClass) {
    clearClassReportPoll(
      pendingClass
    );
    pendingClassReportDownloads.delete(
      tabId
    );
  }
}

async function neprasCleanupCommandState(
  tabId = null,
  scope = "tab"
) {
  await neprasClearCommandStorage();

  if (scope === "global") {
    for (
      const [id, pending]
      of pendingClassReportDownloads.entries()
    ) {
      clearClassReportPoll(pending);
      pendingClassReportDownloads.delete(id);
    }

    return;
  }

  if (tabId != null) {
    neprasClearDownloadWatchersForTab(
      tabId
    );
  }
}

async function neprasStopAllOpenWork() {
  const tabs = await chrome.tabs.query({});
  let sent = 0;

  for (const tab of tabs) {
    if (tab?.id == null) continue;
    const url = String(tab.url || "");

    if (/https:\/\/student\.emis\.gov\.eg\//i.test(url)) {
      // v1.0: ألغِ أيضًا أي Student API fetch جارٍ داخل Service Worker.
      neprasAbortStudentFetchesForTab(tab.id);
      // الغياب السريع له محرك مستقل عن سحب الطلاب، لذلك نوقفه صراحة.
      await chrome.tabs.sendMessage(tab.id, { action: "STOP_ATTENDANCE_TASK" }).catch(() => {});
      await chrome.tabs.sendMessage(tab.id, { action: "STOP_CLASS_REPORT_TASK" }).catch(() => {});
      await chrome.tabs.sendMessage(tab.id, { action: "STOP_STUDENT_EXTRACTION" }).catch(() => {});
      // v1.2.78: منقّي أسماء الطلاب (التقدم يبقى محفوظًا ويمكن استئنافه لاحقًا).
      await chrome.tabs.sendMessage(tab.id, { action: "NEPRAS_NAME_FIXER_STOP" }).catch(() => {});
      // v1.2.79: السجلات والكشوف والخدمات المدرسية المتقدمة
      await chrome.tabs.sendMessage(tab.id, { action: "NEPRAS_RECORDS_STOP" }).catch(() => {});
      sent += 1;
      continue;
    }

    if (/https:\/\/teacher\.emis\.gov\.eg\//i.test(url)) {
      await chrome.tabs.sendMessage(tab.id, { action: "STOP_STAFF_EXTRACTION" }).catch(() => {});
      await chrome.tabs.sendMessage(tab.id, { action: "NEPRAS_RECORDS_STOP" }).catch(() => {});
      sent += 1;
      continue;
    }

    if (/https:\/\/tansik-adtik\.emis\.gov\.eg\//i.test(url)) {
      await chrome.tabs.sendMessage(tab.id, { action: "STOP_ACCEPT_LIST" }).catch(() => {});
      sent += 1;
    }
  }

  // v1.2.78: المنقّي يحفظ حالته في storage.local ويستأنف عند كل تحميل صفحة، فنوقفه مباشرة هنا أيضًا
  // لحالة أن التبويب في منتصف تنقّل ولا مستمع فيه الآن (وإلا استأنف عند اكتمال التحميل).
  try {
    const nf = await chrome.storage.local.get("nf_running");
    if (nf?.nf_running) await chrome.storage.local.set({ nf_running: false });
  } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }

  // v1.2.79: إيقاف ومسح حالة السجلات والكشوف
  try {
    const sp = await chrome.storage.local.get("records_running");
    if (sp?.records_running) await chrome.storage.local.set({ records_running: false, records_details: "" });
  } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }

  // أعطِ أوامر الإيقاف لحظة قصيرة لتغلق محركاتها بشكل طبيعي،
  // ثم امسح أي بقايا أو أوامر معلقة كشبكة أمان.
  await new Promise(
    resolve => setTimeout(resolve, 250)
  );

  await neprasCleanupCommandState(
    null,
    "global"
  );

  return {
    ok: true,
    sent,
    cleaned: true
  };
}


// ============================================================
// v1.0 RC3 — Edge-safe expenses transport
// Edge may block the page-context cross-origin XHR used by the old
// expenses engine with status 0.  Fetch the Ministry API from the
// extension service worker first (host permission is already declared),
// then keep the old page-context route only as a compatibility fallback.
// ============================================================
async function neprasExpensesInflatePdfStreamsV1763(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 8) return [];
  if (typeof DecompressionStream !== "function") {
    throw new Error("PDF_DECOMPRESSION_UNAVAILABLE");
  }

  const bytes = new Uint8Array(buffer);
  const rawText = new TextDecoder("latin1").decode(bytes);
  const parts = [];
  const streamRe = /stream\r?\n/g;
  let match;

  while ((match = streamRe.exec(rawText))) {
    const start = match.index + match[0].length;
    const end = rawText.indexOf("endstream", start);
    if (end < 0) break;

    const dictStart = Math.max(0, match.index - 900);
    const dict = rawText.slice(dictStart, match.index);
    streamRe.lastIndex = end + 9;
    if (!/\/FlateDecode/.test(dict)) continue;

    let e = end;
    while (e > start && (bytes[e - 1] === 10 || bytes[e - 1] === 13)) e--;
    const compressed = bytes.slice(start, e);

    try {
      const ds = new DecompressionStream("deflate");
      const decompressed = await new Response(
        new Blob([compressed]).stream().pipeThrough(ds)
      ).arrayBuffer();
      parts.push(new TextDecoder("latin1").decode(decompressed));
    } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
  }

  return parts;
}

// نسخة مقصودة من modules/egypt_ids.js (NeprasEgypt.isValidNationalId): العامل الخلفي لا يحقن ملفات الصفحة،
// والمدخل هنا نص من 14 رقمًا مستخرج بتعبير نمطي مسبقًا. أي تعديل على قاعدة الصحة يُجرى في الملفين (يحرسه tests/test_egypt_ids.js).
function neprasExpensesValidEgyptianNationalIdV1763(value) {
  const text = String(value || "");
  if (!/^[23]\d{13}$/.test(text)) return false;
  const baseYear = text[0] === "2" ? 1900 : 2000;
  const yy = Number(text.slice(1, 3));
  const mm = Number(text.slice(3, 5));
  const dd = Number(text.slice(5, 7));
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return false;
  const d = new Date(baseYear + yy, mm - 1, dd);
  return d.getFullYear() === baseYear + yy &&
    d.getMonth() === mm - 1 &&
    d.getDate() === dd;
}

function neprasExpensesDecodePdfLiteralV17612(raw) {
  return String(raw || "").replace(/\\([0-7]{1,3}|n|r|t|b|f|\\|\(|\))/g, (m, esc) => {
    if (/^[0-7]{1,3}$/.test(esc)) return String.fromCharCode(parseInt(esc, 8));
    return ({ n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", "\\": "\\", "(": "(", ")": ")" })[esc] ?? esc;
  });
}

function neprasExpensesDecodePdfHexV17612(raw) {
  const clean = String(raw || "").replace(/\s+/g, "");
  if (!clean || /[^0-9a-f]/i.test(clean)) return "";
  const even = clean.length % 2 ? clean + "0" : clean;
  const bytes = new Uint8Array(even.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(even.slice(i * 2, i * 2 + 2), 16);
  try {
    if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
      return new TextDecoder("utf-16be").decode(bytes.slice(2));
    }
  } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
  // Many Ministry PDFs encode western digits as two-byte CID/UTF-16BE values without BOM.
  if (bytes.length >= 4 && bytes.length % 2 === 0) {
    let zeroHigh = 0;
    for (let i = 0; i < bytes.length; i += 2) if (bytes[i] === 0) zeroHigh++;
    if (zeroHigh >= Math.ceil(bytes.length / 4)) {
      let out = "";
      for (let i = 0; i < bytes.length; i += 2) out += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
      return out;
    }
  }
  return new TextDecoder("latin1").decode(bytes);
}

function neprasExpensesPdfDisplayChunksV17612(parts) {
  const chunks = [];
  const tokenRe = /\((?:\\.|[^\\()])*\)|<(?!<)([0-9a-fA-F\s]+)>(?!>)/g;
  const decodeTokens = source => {
    let out = "", m;
    tokenRe.lastIndex = 0;
    while ((m = tokenRe.exec(source))) {
      const token = m[0];
      if (token[0] === "(") out += neprasExpensesDecodePdfLiteralV17612(token.slice(1, -1));
      else out += neprasExpensesDecodePdfHexV17612(m[1] || "");
    }
    return out;
  };

  for (const part of (Array.isArray(parts) ? parts : [])) {
    // TJ arrays often split a number into several strings; joining the strings in the
    // same text-showing operator restores the visible number reliably.
    for (const m of part.matchAll(/\[([\s\S]*?)\]\s*TJ/g)) {
      const text = decodeTokens(m[1]);
      if (text) chunks.push(text);
    }
    for (const m of part.matchAll(/(\((?:\\.|[^\\()])*\)|<(?!<)[0-9a-fA-F\s]+>(?!>))\s*Tj/g)) {
      const text = decodeTokens(m[1]);
      if (text) chunks.push(text);
    }
  }
  return chunks;
}

function neprasExpensesPdfSerialCountV17612(chunks) {
  const nums = new Set();
  for (const chunk of (Array.isArray(chunks) ? chunks : [])) {
    const clean = String(chunk || "").trim();
    if (/^\d{1,7}$/.test(clean)) {
      const n = Number(clean);
      if (Number.isSafeInteger(n) && n >= 1) nums.add(n);
    }
  }
  let n = 1;
  while (nums.has(n)) n++;
  return n - 1;
}

async function neprasExpensesExtractPaidPairsV1763(buffer, knownStudents) {
  const bytes = new Uint8Array(buffer || new ArrayBuffer(0));
  const signature = bytes.length >= 5
    ? new TextDecoder("latin1").decode(bytes.slice(0, 8))
    : "";
  if (!signature.startsWith("%PDF")) throw new Error("PAID_REPORT_NOT_PDF");

  const parts = await neprasExpensesInflatePdfStreamsV1763(buffer);
  const rawText = parts.join("\n");
  const displayChunks = neprasExpensesPdfDisplayChunksV17612(parts);
  const displayText = displayChunks.join("\n");
  const text = `${rawText}\n${displayText}`;
  // Search-only representation: joining digits inside each displayed chunk recovers
  // IDs/codes split by PDF kerning commands without joining unrelated table rows.
  const digitSearchText = displayChunks.map(x => String(x || "").replace(/\D/g, "")).join("\n");

  const validNidMatches = [];
  for (const m of text.matchAll(/(?<!\d)([23]\d{13})(?!\d)/g)) {
    if (neprasExpensesValidEgyptianNationalIdV1763(m[1])) validNidMatches.push({ nationalId: m[1], index: m.index });
  }
  const uniqueNids = new Set(validNidMatches.map(x => x.nationalId));
  const studentCodes = new Set();
  for (const m of text.matchAll(/(?<!\d)(\d{9})(?!\d)/g)) studentCodes.add(m[1]);

  const knownList = Array.isArray(knownStudents) ? knownStudents : [];
  const knownByCode = new Map(), knownByNid = new Map();
  for (const student of knownList) {
    const code = String(student?.studentCode || "").trim();
    const nid = String(student?.nationalId || "").trim();
    if (code) knownByCode.set(code, student);
    if (nid) knownByNid.set(nid, student);
    // Direct known-student matching is the most reliable fallback for current pupils.
    if (code && digitSearchText.includes(code)) studentCodes.add(code);
    if (nid && digitSearchText.includes(nid) && neprasExpensesValidEgyptianNationalIdV1763(nid)) uniqueNids.add(nid);
  }

  const reportRows = [], seenReport = new Set();
  for (let i = 0; i < validNidMatches.length; i++) {
    const cur = validNidMatches[i];
    const nextIndex = validNidMatches[i + 1]?.index ?? Math.min(text.length, cur.index + 3000);
    const segment = text.slice(cur.index + cur.nationalId.length, nextIndex);
    const codeMatch = segment.match(/(?<!\d)(\d{9})(?!\d)/);
    if (!codeMatch) continue;
    const code = codeMatch[1];
    const key = `${cur.nationalId}|${code}`;
    if (seenReport.has(key)) continue;
    seenReport.add(key);
    const known = knownByCode.get(code) || knownByNid.get(cur.nationalId) || null;
    reportRows.push({ studentCode: code, nationalId: cur.nationalId, matchedCurrent: !!known });
  }

  for (const student of knownList) {
    const code = String(student?.studentCode || "").trim();
    const nid = String(student?.nationalId || "").trim();
    const exists = (code && studentCodes.has(code)) || (nid && uniqueNids.has(nid));
    if (!exists) continue;
    const already = reportRows.some(row => (code && row.studentCode === code) || (nid && row.nationalId === nid));
    if (!already) reportRows.push({ studentCode: code, nationalId: nid, matchedCurrent: true });
  }

  const paidPairs = reportRows.filter(row => row.matchedCurrent);
  const serialCount = neprasExpensesPdfSerialCountV17612(displayChunks);

  // v1.0: The Ministry report serial column is the authoritative dynamic count
  // whenever a complete 1..N sequence is present.  Do NOT use the largest count
  // of raw 14-digit matches: PDF headers/content can accidentally form a valid-looking
  // Egyptian ID that is not a student row.  This keeps the count school-agnostic:
  // a report ending at 37 => 37, ending at 453 => 453, etc.
  const reportCount = serialCount > 0
    ? serialCount
    : Math.max(reportRows.length, paidPairs.length, uniqueNids.size);
  return {
    paidPairs,
    paidReportRows: reportRows,
    reportCount,
    validNationalIdCount: uniqueNids.size,
    serialCount,
    pairedRowCount: reportRows.length,
    matchedCount: paidPairs.length
  };
}

async function neprasExpensesRemoteBackgroundV1763(captured, knownStudents) {
  const authorization = String(captured?.authorization || "").trim();
  if (!authorization) return { ok: false, code: "AUTH_HEADERS_NOT_CAPTURED" };

  const baseHeaders = {
    "Authorization": authorization,
    ...(captured?.schoolcode ? { "schoolcode": String(captured.schoolcode) } : {}),
    ...(captured?.schoolstage ? { "schoolstage": String(captured.schoolstage) } : {}),
    ...(captured?.usertype != null ? { "usertype": String(captured.usertype || "0") } : {})
  };

  try {
    const [paidRes, exemptRes] = await Promise.all([
      fetch("https://studaapi.emis.gov.eg/api/Reports/GetReportSTDBankPaid", {
        method: "GET",
        headers: { ...baseHeaders, "Accept": "application/pdf,*/*" },
        cache: "no-store",
        credentials: "omit"
      }),
      fetch("https://studaapi.emis.gov.eg/api/StudentEduRelativeData/GetStudentExecludedExpenses", {
        method: "POST",
        headers: { ...baseHeaders, "Accept": "application/json, text/plain, */*" },
        cache: "no-store",
        credentials: "omit"
      })
    ]);

    if (!paidRes.ok) {
      return { ok: false, code: `PAID_REPORT_HTTP_${paidRes.status}` };
    }
    if (!exemptRes.ok) {
      return { ok: false, code: `EXEMPTIONS_HTTP_${exemptRes.status}` };
    }

    const [paidBuffer, exemptText] = await Promise.all([
      paidRes.arrayBuffer(),
      exemptRes.text()
    ]);

    let exemptions = [];
    if (exemptText.trim()) {
      const parsed = JSON.parse(exemptText);
      exemptions = Array.isArray(parsed) ? parsed : [];
    }

    const paidExtract = await neprasExpensesExtractPaidPairsV1763(
      paidBuffer,
      knownStudents
    );
    const paidPairs = Array.isArray(paidExtract?.paidPairs) ? paidExtract.paidPairs : [];

    return {
      ok: true,
      transport: "extension_background",
      paidPairs,
      paidReportRows: Array.isArray(paidExtract?.paidReportRows) ? paidExtract.paidReportRows : [],
      exemptions,
      paidReportCount: Number(paidExtract?.reportCount || 0),
      paidRawCount: Number(paidExtract?.reportCount || 0),
      paidMatchedCount: paidPairs.length,
      paidPairedRowCount: Number(paidExtract?.pairedRowCount || 0),
      exemptionRawCount: exemptions.length
    };
  } catch (error) {
    return {
      ok: false,
      code: error?.message || String(error) || "EXPENSES_BACKGROUND_FETCH_FAILED"
    };
  }
}

function neprasDispatchMessage(request, sender, sendResponse) {
  if (request.action === "NEPRAS_ATTENDANCE_PAGE_SAVE") {
    (async () => {
      try {
        const tabId =
          sender?.tab?.id;

        if (
          tabId == null ||
          tabId < 0
        ) {
          throw new Error(
            "ATTENDANCE_PAGE_TAB_NOT_FOUND"
          );
        }

        const captured =
          (await neprasReadStudentApiAuth(
            tabId
          )) || {};

        const authorization =
          String(
            captured.authorization ||
            ""
          ).trim();

        if (!authorization) {
          throw new Error(
            "AUTH_HEADERS_NOT_CAPTURED"
          );
        }

        const payload =
          Array.isArray(
            request.payload
          )
            ? request.payload
            : [];

        if (!payload.length) {
          throw new Error(
            "ATTENDANCE_PAYLOAD_EMPTY"
          );
        }

        // IMPORTANT:
        // Execute from MAIN world so browser itself supplies:
        // Origin: https://student.emis.gov.eg
        // Referer: https://student.emis.gov.eg/
        //
        // We intentionally do NOT try to spoof Origin/Referer.
        const execution =
          await chrome.scripting.executeScript({
            target: {
              tabId
            },
            world: "MAIN",
            func: async (
              rows,
              authHeaders
            ) => {
              const url =
                "https://studaapi.emis.gov.eg/api/Absence/SaveStudentAbsence";

              return await new Promise(
                resolve => {
                  try {
                    const xhr =
                      new XMLHttpRequest();

                    xhr.open(
                      "POST",
                      url,
                      true
                    );

                    // IMPORTANT v1.0:
                    // لا نستخدم withCredentials=true.
                    // الطلب الأصلي للموقع يعتمد على Authorization/custom headers
                    // وليس على إرسال Cookies كـ credentialed CORS request.
                    // إجبار withCredentials كان سبب XHR_NETWORK_ERROR.
                    xhr.withCredentials =
                      false;

                    xhr.setRequestHeader(
                      "accept",
                      "application/json, text/plain, */*"
                    );

                    xhr.setRequestHeader(
                      "content-type",
                      "application/json"
                    );

                    if (
                      authHeaders.authorization
                    ) {
                      xhr.setRequestHeader(
                        "authorization",
                        authHeaders.authorization
                      );
                    }

                    if (
                      authHeaders.schoolcode
                    ) {
                      xhr.setRequestHeader(
                        "schoolcode",
                        authHeaders.schoolcode
                      );
                    }

                    if (
                      authHeaders.schoolstage
                    ) {
                      xhr.setRequestHeader(
                        "schoolstage",
                        authHeaders.schoolstage
                      );
                    }

                    if (
                      authHeaders.usertype
                    ) {
                      xhr.setRequestHeader(
                        "usertype",
                        authHeaders.usertype
                      );
                    }

                    xhr.onload =
                      () => {
                        const text =
                          String(
                            xhr.responseText ||
                            ""
                          );

                        let data =
                          text;

                        try {
                          data =
                            JSON.parse(
                              text
                            );
                        } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }

                        resolve({
                          ok:
                            xhr.status >= 200 &&
                            xhr.status < 300,
                          status:
                            xhr.status,
                          statusText:
                            xhr.statusText,
                          data,
                          contentType:
                            xhr.getResponseHeader(
                              "content-type"
                            ) || ""
                        });
                      };

                    xhr.onerror =
                      () =>
                        resolve({
                          ok: false,
                          status: 0,
                          statusText:
                            "XHR_NETWORK_ERROR_OR_CORS",
                          data: "",
                          contentType: "",
                          readyState:
                            xhr.readyState
                        });

                    xhr.ontimeout =
                      () =>
                        resolve({
                          ok: false,
                          status: 0,
                          statusText:
                            "XHR_TIMEOUT",
                          data: "",
                          contentType: ""
                        });

                    xhr.timeout =
                      25000;

                    xhr.send(
                      JSON.stringify(
                        rows
                      )
                    );
                  } catch (error) {
                    resolve({
                      ok: false,
                      status: 0,
                      statusText:
                        error?.message ||
                        String(error),
                      data: "",
                      contentType: ""
                    });
                  }
                }
              );
            },
            args: [
              payload,
              {
                authorization,
                schoolcode:
                  String(
                    captured.schoolcode ||
                    ""
                  ),
                schoolstage:
                  String(
                    captured.schoolstage ||
                    ""
                  ),
                usertype:
                  String(
                    captured.usertype ||
                    "0"
                  )
              }
            ]
          });

        const result =
          execution?.[0]?.result ||
          null;

        if (!result) {
          throw new Error(
            "ATTENDANCE_PAGE_XHR_NO_RESULT"
          );
        }

        sendResponse({
          ok:
            result.ok === true &&
            result.data === true,
          status:
            Number(
              result.status || 0
            ),
          statusText:
            String(
              result.statusText || ""
            ),
          data:
            result.data,
          contentType:
            String(
              result.contentType || ""
            ),
          via:
            "student-page-main-xhr"
        });
      } catch (error) {
        sendResponse({
          ok: false,
          status: 0,
          statusText:
            error?.message ||
            String(error),
          data: null,
          via:
            "student-page-main-xhr"
        });
      }
    })();

    return true;
  }

  if (request.action === "NEPRAS_ABORT_STUDENT_TAB_FETCHES") {
    const tabId = sender?.tab?.id;
    const aborted = tabId == null ? 0 : neprasAbortStudentFetchesForTab(tabId);
    sendResponse({ ok: true, aborted });
    return true;
  }

  if (request.action === "NEPRAS_PREPARE_COMMAND_STATE") {
    (async () => {
      try {
        // تنظيف آمن قبل التشغيل:
        // نمسح الأوامر المعلقة القديمة فقط، وأي fetch قديم عالق لنفس التبويب.
        if (sender?.tab?.id != null) {
          neprasAbortStudentFetchesForTab(sender.tab.id);
        }
        await neprasClearCommandStorage();

        sendResponse({
          ok: true,
          prepared: true,
          reason:
            String(
              request.reason ||
              "pre_run"
            )
        });
      } catch (error) {
        sendResponse({
          ok: false,
          prepared: false,
          message:
            error?.message ||
            String(error)
        });
      }
    })();

    return true;
  }

  if (request.action === "NEPRAS_SCHOOL_STATS_LOCK_ACQUIRE") {
    (async () => {
      const result =
        await neprasAcquireSchoolStatsLock(
          sender?.tab?.id ?? -1,
          request?.schoolCode
        );

      sendResponse(result);
    })();

    return true;
  }

  if (request.action === "NEPRAS_SCHOOL_STATS_LOCK_RELEASE") {
    (async () => {
      await neprasReleaseSchoolStatsLock(
        String(request.token || ""),
        sender?.tab?.id ?? null,
        request?.schoolCode
      );

      sendResponse({
        ok: true
      });
    })();

    return true;
  }

  if (request.action === "NEPRAS_CLEANUP_COMMAND_STATE") {
    (async () => {
      try {
        await neprasCleanupCommandState(
          sender?.tab?.id ?? null,
          request.scope === "global"
            ? "global"
            : "tab"
        );

        sendResponse({
          ok: true,
          cleaned: true,
          reason:
            String(
              request.reason || ""
            )
        });
      } catch (error) {
        sendResponse({
          ok: false,
          cleaned: false,
          message:
            error?.message ||
            String(error)
        });
      }
    })();

    return true;
  }

  if (request.action === "NEPRAS_TAB_SCHOOL_DETECTED") {
    (async () => {
      try {
        const tabId = sender?.tab?.id;
        const code = String(request.schoolCode || "").replace(/\D/g, "");
        const name = String(request.schoolName || "").trim();
        const stage = String(request.stage || "").trim();

        if (tabId != null && code) {
          neprasSchoolByTab.set(tabId, { schoolCode: code, schoolName: name, stage, updatedAt: Date.now() });
        }

        if (code && globalThis.NeprasSchoolManager?.registerOrUpdateSchool) {
          await globalThis.NeprasSchoolManager.registerOrUpdateSchool({
            code,
            name,
            stage
          });
        }
        sendResponse({ ok: true, schoolCode: code });
      } catch (err) {
        sendResponse({ ok: false, message: err?.message || String(err) });
      }
    })();
    return true;
  }

  if (request.action === "NEPRAS_GET_ACTIVE_TAB_SCHOOL") {
    (async () => {
      try {
        const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }).catch(() => []);
        if (activeTab?.id != null) {
          let info = neprasSchoolByTab.get(activeTab.id);
          if (!info || !info.schoolCode) {
            info = await chrome.tabs.sendMessage(activeTab.id, { action: "NEPRAS_DETECT_TAB_SCHOOL" }).catch(() => null);
            if (info?.schoolCode) {
              neprasSchoolByTab.set(activeTab.id, { ...info, updatedAt: Date.now() });
              if (globalThis.NeprasSchoolManager?.registerOrUpdateSchool) {
                await globalThis.NeprasSchoolManager.registerOrUpdateSchool({
                  code: info.schoolCode,
                  name: info.schoolName,
                  stage: info.stage
                });
              }
            }
          }
          if (info && info.schoolCode) {
            return sendResponse({ ok: true, ...info, tabId: activeTab.id });
          }
        }
        sendResponse({ ok: false, message: "NO_ACTIVE_SCHOOL" });
      } catch (err) {
        sendResponse({ ok: false, message: err?.message || String(err) });
      }
    })();
    return true;
  }

  if (request.action === "NEPRAS_STUDENT_API_CONTEXT") {
    (async () => {
      try {
        let tabId = sender?.tab?.id;
        if (tabId == null) {
          const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }).catch(() => []);
          if (activeTab?.id != null) tabId = activeTab.id;
        }

        const captured =
          (await neprasReadStudentApiAuth(tabId, request.schoolCode || null)) || {};
        let cleanSchoolCode = String(captured.schoolcode || "").trim().replace(/\D/g, "");
        let cleanSchoolName = String(captured.schoolName || captured.ArabicSchoolName || "").trim();

        // وإذا لم تكن الرؤوس متوفرة بعد، استعن ببيانات المدرسة المكتشفة في التبويب
        if (!cleanSchoolCode && tabId != null && neprasSchoolByTab.has(tabId)) {
          const tabSchool = neprasSchoolByTab.get(tabId);
          cleanSchoolCode = String(tabSchool.schoolCode || "").replace(/\D/g, "");
          if (!cleanSchoolName) cleanSchoolName = tabSchool.schoolName || "";
        }

        sendResponse({
          ok: true,
          schoolstage:
            String(
              captured.schoolstage || ""
            ).trim(),
          hasAuth:
            !!String(
              captured.authorization || ""
            ).trim(),
          schoolcode: cleanSchoolCode,
          schoolName: cleanSchoolName,
          schoolKey: cleanSchoolCode
        });
      } catch (error) {
        sendResponse({
          ok: false,
          schoolstage: "",
          hasAuth: false,
          message:
            error?.message ||
            String(error)
        });
      }
    })();

    return true;
  }

  if (request.action === "NEPRAS_EXPENSES_REMOTE_DATA") {
    (async () => {
      try {
        const tabId = sender?.tab?.id;
        const pageUrl = String(sender?.tab?.url || "");

        if (
          tabId == null ||
          !/^https:\/\/student\.emis\.gov\.eg\//i.test(pageUrl)
        ) {
          sendResponse({ ok: false, message: "STUDENT_PAGE_REQUIRED" });
          return;
        }

        const captured = (await neprasReadStudentApiAuth(tabId)) || {};
        const authorization = String(captured.authorization || "").trim();
        if (!authorization) {
          sendResponse({ ok: false, message: "AUTH_HEADERS_NOT_CAPTURED" });
          return;
        }

        // Edge-safe primary route: extension service worker fetch.
        // The old MAIN-world XHR remains below as a compatibility fallback.
        const directResult = await neprasExpensesRemoteBackgroundV1763(
          captured,
          Array.isArray(request.students) ? request.students : []
        );
        if (directResult?.ok) {
          sendResponse(directResult);
          return;
        }

        const result = await chrome.scripting.executeScript({
          target: { tabId },
          world: "MAIN",
          func: async (headers, knownStudents) => {
            function xhrRequest(url, method, responseType) {
              return new Promise((resolve) => {
                try {
                  const xhr = new XMLHttpRequest();
                  xhr.open(method, url, true);
                  xhr.withCredentials = false;
                  xhr.responseType = responseType || "json";
                  xhr.timeout = 30000;
                  xhr.setRequestHeader("accept", responseType === "arraybuffer" ? "application/pdf,*/*" : "application/json, text/plain, */*");
                  if (headers.authorization) xhr.setRequestHeader("authorization", headers.authorization);
                  if (headers.schoolcode) xhr.setRequestHeader("schoolcode", headers.schoolcode);
                  if (headers.schoolstage) xhr.setRequestHeader("schoolstage", headers.schoolstage);
                  if (headers.usertype) xhr.setRequestHeader("usertype", headers.usertype);

                  xhr.onload = () => resolve({
                    ok: xhr.status >= 200 && xhr.status < 300,
                    status: xhr.status,
                    data: xhr.response
                  });
                  xhr.onerror = () => resolve({ ok: false, status: 0, error: "NETWORK_ERROR" });
                  xhr.ontimeout = () => resolve({ ok: false, status: 0, error: "TIMEOUT" });
                  xhr.send(null);
                } catch (error) {
                  resolve({ ok: false, status: 0, error: error?.message || String(error) });
                }
              });
            }

            async function inflatePdfStreams(buffer) {
              const bytes = new Uint8Array(buffer);
              const rawText = new TextDecoder("latin1").decode(bytes);
              const parts = [];
              const streamRe = /stream\r?\n/g;
              let match;

              while ((match = streamRe.exec(rawText))) {
                const start = match.index + match[0].length;
                const end = rawText.indexOf("endstream", start);
                if (end < 0) break;

                const dictStart = Math.max(0, match.index - 900);
                const dict = rawText.slice(dictStart, match.index);
                streamRe.lastIndex = end + 9;

                if (!/\/FlateDecode/.test(dict)) continue;

                let e = end;
                while (e > start && (bytes[e - 1] === 10 || bytes[e - 1] === 13)) e--;
                const compressed = bytes.slice(start, e);

                try {
                  const ds = new DecompressionStream("deflate");
                  const decompressed = await new Response(
                    new Blob([compressed]).stream().pipeThrough(ds)
                  ).arrayBuffer();
                  parts.push(new TextDecoder("latin1").decode(decompressed));
                } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
              }

              return parts;
            }

            async function extractPaidPairs(buffer, knownStudents) {
              const parts = await inflatePdfStreams(buffer);

              // نسخة مقصودة من modules/egypt_ids.js: هذه الدالة تُسلَّم إلى executeScript فتُنفَّذ في الصفحة معزولة عن أي ملف آخر.
              function isValidEgyptianNationalId(value) {
                const s = String(value || "");
                if (!/^[23]\d{13}$/.test(s)) return false;
                const baseYear = s[0] === "2" ? 1900 : 2000;
                const yy = Number(s.slice(1, 3)), mm = Number(s.slice(3, 5)), dd = Number(s.slice(5, 7));
                if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return false;
                const d = new Date(baseYear + yy, mm - 1, dd);
                return d.getFullYear() === baseYear + yy && d.getMonth() === mm - 1 && d.getDate() === dd;
              }

              function decodeLiteral(rawText) {
                return String(rawText || "").replace(/\\([0-7]{1,3}|n|r|t|b|f|\\|\(|\))/g, (m, esc) => {
                  if (/^[0-7]{1,3}$/.test(esc)) return String.fromCharCode(parseInt(esc, 8));
                  return ({ n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", "\\": "\\", "(": "(", ")": ")" })[esc] ?? esc;
                });
              }
              function decodeHex(rawHex) {
                const clean = String(rawHex || "").replace(/\s+/g, "");
                if (!clean || /[^0-9a-f]/i.test(clean)) return "";
                const even = clean.length % 2 ? clean + "0" : clean;
                const bytes = new Uint8Array(even.length / 2);
                for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(even.slice(i * 2, i * 2 + 2), 16);
                try {
                  if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) return new TextDecoder("utf-16be").decode(bytes.slice(2));
                } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
                if (bytes.length >= 4 && bytes.length % 2 === 0) {
                  let zeroHigh = 0;
                  for (let i = 0; i < bytes.length; i += 2) if (bytes[i] === 0) zeroHigh++;
                  if (zeroHigh >= Math.ceil(bytes.length / 4)) {
                    let out = "";
                    for (let i = 0; i < bytes.length; i += 2) out += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
                    return out;
                  }
                }
                return new TextDecoder("latin1").decode(bytes);
              }
              function displayChunks() {
                const chunks = [];
                const tokenRe = /\((?:\\.|[^\\()])*\)|<(?!<)([0-9a-fA-F\s]+)>(?!>)/g;
                const decodeTokens = source => {
                  let out = "", m; tokenRe.lastIndex = 0;
                  while ((m = tokenRe.exec(source))) {
                    const token = m[0];
                    out += token[0] === "(" ? decodeLiteral(token.slice(1, -1)) : decodeHex(m[1] || "");
                  }
                  return out;
                };
                for (const part of parts) {
                  for (const m of part.matchAll(/\[([\s\S]*?)\]\s*TJ/g)) { const t = decodeTokens(m[1]); if (t) chunks.push(t); }
                  for (const m of part.matchAll(/(\((?:\\.|[^\\()])*\)|<(?!<)[0-9a-fA-F\s]+>(?!>))\s*Tj/g)) { const t = decodeTokens(m[1]); if (t) chunks.push(t); }
                }
                return chunks;
              }

              const chunks = displayChunks();
              const rawText = parts.join("\n"), shownText = chunks.join("\n"), text = `${rawText}\n${shownText}`;
              const digitSearchText = chunks.map(x => String(x || "").replace(/\D/g, "")).join("\n");
              const validNidMatches = [];
              for (const m of text.matchAll(/(?<!\d)([23]\d{13})(?!\d)/g)) if (isValidEgyptianNationalId(m[1])) validNidMatches.push({ nationalId: m[1], index: m.index });
              const uniqueNids = new Set(validNidMatches.map(x => x.nationalId));
              const studentCodes = new Set();
              for (const m of text.matchAll(/(?<!\d)(\d{9})(?!\d)/g)) studentCodes.add(m[1]);

              const knownList = Array.isArray(knownStudents) ? knownStudents : [];
              const knownByCode = new Map(), knownByNid = new Map();
              for (const student of knownList) {
                const code = String(student?.studentCode || "").trim(), nid = String(student?.nationalId || "").trim();
                if (code) knownByCode.set(code, student);
                if (nid) knownByNid.set(nid, student);
                if (code && digitSearchText.includes(code)) studentCodes.add(code);
                if (nid && digitSearchText.includes(nid) && isValidEgyptianNationalId(nid)) uniqueNids.add(nid);
              }

              const reportRows = [], seenReport = new Set();
              for (let i = 0; i < validNidMatches.length; i++) {
                const cur = validNidMatches[i];
                const nextIndex = validNidMatches[i + 1]?.index ?? Math.min(text.length, cur.index + 3000);
                const cm = text.slice(cur.index + cur.nationalId.length, nextIndex).match(/(?<!\d)(\d{9})(?!\d)/);
                if (!cm) continue;
                const code = cm[1], key = `${cur.nationalId}|${code}`;
                if (seenReport.has(key)) continue;
                seenReport.add(key);
                reportRows.push({ studentCode: code, nationalId: cur.nationalId, matchedCurrent: !!(knownByCode.get(code) || knownByNid.get(cur.nationalId)) });
              }
              for (const student of knownList) {
                const code = String(student?.studentCode || "").trim(), nid = String(student?.nationalId || "").trim();
                if (!((code && studentCodes.has(code)) || (nid && uniqueNids.has(nid)))) continue;
                if (!reportRows.some(r => (code && r.studentCode === code) || (nid && r.nationalId === nid))) reportRows.push({ studentCode: code, nationalId: nid, matchedCurrent: true });
              }
              const paidPairs = reportRows.filter(r => r.matchedCurrent);
              const nums = new Set();
              for (const chunk of chunks) { const c = String(chunk || "").trim(); if (/^\d{1,7}$/.test(c)) { const n = Number(c); if (Number.isSafeInteger(n) && n >= 1) nums.add(n); } }
              let serialCount = 1; while (nums.has(serialCount)) serialCount++; serialCount--;
              return {
                paidPairs,
                paidReportRows: reportRows,
                reportCount: Math.max(uniqueNids.size, reportRows.length, paidPairs.length, serialCount),
                validNationalIdCount: uniqueNids.size,
                serialCount,
                pairedRowCount: reportRows.length,
                matchedCount: paidPairs.length
              };
            }

            const [paidResp, exemptResp] = await Promise.all([
              xhrRequest(
                "https://studaapi.emis.gov.eg/api/Reports/GetReportSTDBankPaid",
                "GET",
                "arraybuffer"
              ),
              xhrRequest(
                "https://studaapi.emis.gov.eg/api/StudentEduRelativeData/GetStudentExecludedExpenses",
                "POST",
                "json"
              )
            ]);

            if (!paidResp.ok) {
              return { ok: false, message: `PAID_REPORT_HTTP_${paidResp.status || 0}` };
            }
            if (!exemptResp.ok) {
              return { ok: false, message: `EXEMPTIONS_HTTP_${exemptResp.status || 0}` };
            }

            const paidExtract = await extractPaidPairs(
              paidResp.data,
              knownStudents
            );
            const paidPairs = Array.isArray(paidExtract?.paidPairs) ? paidExtract.paidPairs : [];
            const exemptions = Array.isArray(exemptResp.data) ? exemptResp.data : [];

            return {
              ok: true,
              paidPairs,
              paidReportRows: Array.isArray(paidExtract?.paidReportRows) ? paidExtract.paidReportRows : [],
              exemptions,
              paidReportCount: Number(paidExtract?.reportCount || 0),
              paidRawCount: Number(paidExtract?.reportCount || 0),
              paidMatchedCount: paidPairs.length,
              paidPairedRowCount: Number(paidExtract?.pairedRowCount || 0),
              exemptionRawCount: exemptions.length
            };
          },
          args: [{
            authorization,
            schoolcode: String(captured.schoolcode || ""),
            schoolstage: String(captured.schoolstage || ""),
            usertype: String(captured.usertype || "0")
          }, Array.isArray(request.students) ? request.students.map(s => ({
            studentCode: String(s?.studentCode || ""),
            nationalId: String(s?.nationalId || "")
          })) : []]
        });

        const legacyResult = result?.[0]?.result || { ok: false, message: "EXPENSES_NO_RESULT" };
        if (legacyResult?.ok) {
          sendResponse(legacyResult);
          return;
        }

        const rawCode = String(
          legacyResult?.message || directResult?.code || "EXPENSES_REMOTE_FAILED"
        );
        let friendlyMessage = "تعذر تنزيل بيانات المصروفات من موقع الوزارة. حدّث صفحة الطلاب ثم أعد المحاولة.";
        if (/AUTH_HEADERS_NOT_CAPTURED/i.test(rawCode)) {
          friendlyMessage = "لم تكتمل جلسة موقع الطلاب. حدّث صفحة الطلاب وانتظر تحميلها ثم أعد تحليل المصروفات.";
        } else if (/401|403/.test(rawCode)) {
          friendlyMessage = "انتهت جلسة موقع الطلاب. حدّث الصفحة أو أعد تسجيل الدخول ثم أعد تحليل المصروفات.";
        }
        console.warn("Nepras expenses remote fallback failed:", rawCode);
        sendResponse({ ok: false, message: friendlyMessage, code: rawCode });
      } catch (error) {
        sendResponse({ ok: false, message: error?.message || String(error) });
      }
    })();
    return true;
  }

  if (request.action === "NEPRAS_LOOKUP_STUDENT_NATIONWIDE") {
    if (!neprasIsExtensionPageSender(sender)) {
      sendResponse({ ok: false, message: "LOOKUP_FORBIDDEN" });
      return true;
    }
    (async () => {
      try {
        const nid = String(request?.nationalId || "").replace(/\D/g, "");
        if (!/^\d{14}$/.test(nid)) {
          sendResponse({ok:false, message:"NATIONAL_ID_14_DIGITS_REQUIRED"});
          return;
        }

        const captured = (await neprasReadStudentApiAuth(null)) || {};
        const authorization = String(captured.authorization || "").trim();
        if (!authorization) {
          sendResponse({ok:false, message:"AUTH_HEADERS_NOT_CAPTURED_V1718"});
          return;
        }

        const headers = {
          "Accept":"application/json, text/plain, */*",
          "Authorization":authorization,
          ...(captured.schoolcode ? {"schoolcode":String(captured.schoolcode)} : {}),
          ...(captured.schoolstage ? {"schoolstage":String(captured.schoolstage)} : {}),
          ...(captured.usertype != null ? {"usertype":String(captured.usertype || "0")} : {})
        };

        const url = `https://studaapi.emis.gov.eg/api/Student/IsDocumentIdValid?DocumentId=${encodeURIComponent(nid)}&IdType=1`;
        const res = await fetch(url,{method:"GET",headers,cache:"no-store"});
        const txt = await res.text();
        let data = null;
        try { data = txt ? JSON.parse(txt) : null; } catch (_) { data = null; }

        if (res.status === 401 || res.status === 403) {
          await neprasClearStudentApiAuth(null);
        }

        const rawTextLower = String(txt || "").toLowerCase();
        const looksFound = !!(
          data && typeof data === "object" &&
          /firstname|studentname|fullname|studentcode|schoolname/i.test(JSON.stringify(data))
        );
        sendResponse({
          ok:res.ok,
          status:res.status,
          data,
          found:looksFound,
          explicitNotFound:res.ok && !looksFound && /not found|غير موجود|لا يوجد|false|null/.test(rawTextLower),
          message:res.ok ? "" : `API_HTTP_${res.status}`
        });
      } catch (error) {
        sendResponse({ok:false,message:error?.message || String(error)});
      }
    })();
    return true;
  }

  if (request.action === "NEPRAS_TEACHER_API_FETCH") {
    (async () => {
      try {
        const tabId =
          sender?.tab?.id;

        const pageUrl =
          String(
            sender?.tab?.url || ""
          );

        if (
          tabId == null ||
          !/^https:\/\/teacher\.emis\.gov\.eg\//i.test(
            pageUrl
          )
        ) {
          sendResponse({
            ok: false,
            message:
              "TEACHER_PAGE_REQUIRED"
          });
          return;
        }

        const apiUrl =
          String(
            request?.url || ""
          );

        if (
          !/^https:\/\/professopi\.emis\.gov\.eg\/api\/Employee\/(?:GetEmployeeFullData|EmployeesNadb|CRevisionNew01)(?:\?|$)/i.test(
            apiUrl
          )
        ) {
          sendResponse({
            ok: false,
            message:
              "TEACHER_API_URL_NOT_ALLOWED"
          });
          return;
        }

        let auth =
          neprasTeacherApiAuthByTab.get(
            tabId
          ) || {};

        if (!auth.authorization || !neprasTeacherAuthIsFresh(auth)) {
          for (const [, candidate] of neprasTeacherApiAuthByTab.entries()) {
            if (candidate?.authorization && neprasTeacherAuthIsFresh(candidate)) {
              auth = candidate;
              neprasTeacherApiAuthByTab.set(tabId, candidate);
              break;
            }
          }
        }

        if (!auth.authorization || !neprasTeacherAuthIsFresh(auth)) {
          try {
            const execRes = await chrome.scripting.executeScript({
              target: { tabId },
              world: "MAIN",
              func: () => {
                try {
                  const h = window.__neprasLastEmisHeaders || {};
                  if (h.authorization) return h;
                  const jwtRe = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/;
                  for (const store of [window.localStorage, window.sessionStorage]) {
                    if (!store) continue;
                    for (let i = 0; i < store.length; i++) {
                      const v = store.getItem(store.key(i)) || "";
                      const m = v.match(jwtRe);
                      if (m) return { ...h, authorization: "Bearer " + m[0] };
                    }
                  }
                } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
                return null;
              }
            });
            const rec = execRes?.[0]?.result;
            if (rec?.authorization) {
              auth = { ...rec, capturedAt: Date.now() };
              neprasTeacherApiAuthByTab.set(tabId, auth);
            }
          } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
        }

        if (
          !auth.authorization ||
          !neprasTeacherAuthIsFresh(auth)
        ) {
          sendResponse({
            ok: false,
            message:
              "TEACHER_AUTH_HEADERS_NOT_CAPTURED"
          });
          return;
        }

        const method =
          String(
            request?.method || "GET"
          ).toUpperCase();

        const headers = {
          "Accept":
            request?.responseType ===
              "base64"
              ? "application/pdf,application/octet-stream,*/*"
              : "application/json, text/plain, */*",
          "Authorization":
            String(
              auth.authorization
            )
        };

        for (
          const key of
          ["ut", "ed", "md", "sc", "ty"]
        ) {
          const explicit =
            request?.customHeaders?.[
              key
            ];

          const value =
            explicit != null
              ? explicit
              : auth[key];

          if (
            value != null &&
            String(value) !== ""
          ) {
            headers[key] =
              String(value);
          }
        }

        let body;

        if (
          method !== "GET" &&
          method !== "HEAD" &&
          request?.body != null
        ) {
          headers["Content-Type"] =
            "application/json";

          body =
            typeof request.body ===
              "string"
              ? request.body
              : JSON.stringify(
                  request.body
                );
        }

        const response =
          await fetch(
            apiUrl,
            {
              method,
              headers,
              body,
              cache:
                "no-store"
            }
          );

        if (
          request?.responseType ===
          "base64"
        ) {
          const buffer =
            await response.arrayBuffer();

          const bytes =
            new Uint8Array(
              buffer
            );

          let binary =
            "";

          const chunk =
            0x8000;

          for (
            let i = 0;
            i < bytes.length;
            i += chunk
          ) {
            binary +=
              String.fromCharCode(
                ...bytes.subarray(
                  i,
                  i + chunk
                )
              );
          }

          sendResponse({
            ok:
              response.ok,
            status:
              response.status,
            contentType:
              response.headers.get(
                "content-type"
              ) || "",
            base64:
              btoa(binary),
            message:
              response.ok
                ? ""
                : `TEACHER_API_HTTP_${response.status}`
          });

          return;
        }

        const text =
          await response.text();

        let data =
          null;

        try {
          data =
            text
              ? JSON.parse(text)
              : null;
        } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }

        sendResponse({
          ok:
            response.ok,
          status:
            response.status,
          data,
          text,
          message:
            response.ok
              ? ""
              : `TEACHER_API_HTTP_${response.status}`
        });
      } catch (error) {
        sendResponse({
          ok: false,
          message:
            error?.message ||
            String(error)
        });
      }
    })();

    return true;
  }

  if (request.action === "NEPRAS_CLASS_REPORT_FETCH_DIRECT_V1766") {
    (async () => {
      try {
        const tabId = sender?.tab?.id;
        const pageUrl = String(sender?.tab?.url || "");
        if (tabId == null || !/^https:\/\/student\.emis\.gov\.eg\//i.test(pageUrl)) {
          sendResponse({ ok: false, message: "STUDENT_PAGE_REQUIRED" });
          return;
        }

        const gradeValue = encodeURIComponent(String(request?.gradeValue ?? "").trim());
        const classValue = encodeURIComponent(String(request?.classValue ?? "").trim());
        if (!gradeValue || !classValue) {
          sendResponse({ ok: false, message: "CLASS_REPORT_SELECTION_MISSING" });
          return;
        }

        const captured = (await neprasReadStudentApiAuth(tabId)) || {};
        const headers = { "Accept": "application/pdf,application/octet-stream,*/*" };
        if (captured.authorization) headers["Authorization"] = String(captured.authorization);
        if (captured.schoolcode) headers["schoolcode"] = String(captured.schoolcode);
        if (captured.schoolstage) headers["schoolstage"] = String(captured.schoolstage);
        if (captured.usertype != null && String(captured.usertype) !== "") headers["usertype"] = String(captured.usertype);

        const acdYear = encodeURIComponent(String(captured.acdyear || captured.acdyearcode || "143").trim());
        const candidates = [
          `https://studaapi.emis.gov.eg/api/Reports/GetStudentClassListReport?GradeId=${gradeValue}&ClassId=${classValue}`,
          `https://studaapi.emis.gov.eg/api/Reports/GetStudentClassListReport?GradeCode=${gradeValue}&ClassNo=${classValue}`,
          `https://studaapi.emis.gov.eg/api/Reports/GetStudentClassListReport?ACDYearCode=${acdYear}&GradeId=${gradeValue}&ClassId=${classValue}`,
          `https://studaapi.emis.gov.eg/api/Reports/GetStudentClassListReport?ACDYearCode=${gradeValue}&ClassNo=${classValue}`,
          `https://studaapi.emis.gov.eg/api/Report/GetStudentClassListReport?GradeId=${gradeValue}&ClassId=${classValue}`,
          `https://studaapi.emis.gov.eg/api/Report/GetStudentClassListReport?GradeCode=${gradeValue}&ClassNo=${classValue}`,
          `https://studaapi.emis.gov.eg/api/Report/GetStudentClassListReport?ACDYearCode=${gradeValue}&ClassNo=${classValue}`,
          `https://studaapi.emis.gov.eg/api/Student/GetStudentClassListReport?GradeId=${gradeValue}&ClassId=${classValue}`,
          `https://studaapi.emis.gov.eg/api/Student/GetStudentClassListReport?ACDYearCode=${gradeValue}&ClassNo=${classValue}`,
          `https://studaapi.emis.gov.eg/api/Class/GetStudentClassListReport?GradeId=${gradeValue}&ClassId=${classValue}`,
          `https://studaapi.emis.gov.eg/api/Class/GetStudentClassListReport?ACDYearCode=${gradeValue}&ClassNo=${classValue}`
        ];

        let lastMessage = "CLASS_REPORT_DIRECT_FAILED";
        for (const targetUrl of candidates) {
          const controller = new AbortController();
          neprasRegisterStudentFetchController(tabId, controller);
          try {
            const response = await fetch(targetUrl, {
              method: "GET",
              headers,
              credentials: "omit",
              cache: "no-store",
              redirect: "follow",
              signal: controller.signal
            });
            const buffer = await response.arrayBuffer();
            const bytes = new Uint8Array(buffer || new ArrayBuffer(0));
            const signature = bytes.length >= 5 ? String.fromCharCode(...bytes.subarray(0, 5)) : "";
            const contentType = String(response.headers.get("content-type") || "").toLowerCase();
            if (!response.ok) {
              lastMessage = `CLASS_REPORT_HTTP_${response.status}`;
              continue;
            }
            if (!signature.startsWith("%PDF") && !contentType.includes("application/pdf")) {
              lastMessage = "CLASS_REPORT_NOT_PDF";
              continue;
            }
            let binary = "";
            const chunk = 0x8000;
            for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
            sendResponse({ ok: true, base64: btoa(binary), via: "memory" });
            return;
          } catch (error) {
            lastMessage = error?.name === "AbortError" ? "USER_STOPPED" : (error?.message || String(error));
          } finally {
            neprasUnregisterStudentFetchController(tabId, controller);
          }
        }
        sendResponse({ ok: false, message: lastMessage });
      } catch (error) {
        sendResponse({ ok: false, message: error?.message || String(error) });
      }
    })();
    return true;
  }

  if (request.action === "NEPRAS_CLASS_REPORT_FETCH_PDF") {
    (async () => {
      try {
        const tabId = sender?.tab?.id;
        const pageUrl = String(sender?.tab?.url || "");
        const targetUrl = String(request?.url || "");

        if (
          tabId == null ||
          !/^https:\/\/student\.emis\.gov\.eg\//i.test(pageUrl)
        ) {
          sendResponse({ ok: false, status: 0, message: "STUDENT_PAGE_REQUIRED" });
          return;
        }

        let parsed;
        try { parsed = new URL(targetUrl); } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
        const host = String(parsed?.hostname || "").toLowerCase();
        if (
          parsed?.protocol !== "https:" || parsed?.port !== "" ||
          (host !== "student.emis.gov.eg" && host !== "studaapi.emis.gov.eg")
        ) {
          sendResponse({ ok: false, status: 0, message: "CLASS_REPORT_PDF_URL_NOT_ALLOWED" });
          return;
        }

        const headers = {
          "Accept": "application/pdf,application/octet-stream,*/*"
        };

        // روابط studaapi تحتاج نفس رؤوس جلسة موقع الطلاب التي نستخدمها
        // في بقية محركات نبراس. لا تُرسل هذه الرؤوس لأي نطاق آخر.
        if (host === "studaapi.emis.gov.eg") {
          const captured = (await neprasReadStudentApiAuth(tabId)) || {};
          if (captured.authorization) headers["Authorization"] = String(captured.authorization);
          if (captured.schoolcode) headers["schoolcode"] = String(captured.schoolcode);
          if (captured.schoolstage) headers["schoolstage"] = String(captured.schoolstage);
          if (captured.usertype != null && String(captured.usertype) !== "") {
            headers["usertype"] = String(captured.usertype);
          }
        }

        const controller = new AbortController();
        neprasRegisterStudentFetchController(tabId, controller);
        try {
          const response = await fetch(targetUrl, {
            method: "GET",
            headers,
            credentials: host === "student.emis.gov.eg" ? "include" : "omit",
            cache: "no-store",
            redirect: "follow",
            signal: controller.signal
          });

          const buffer = await response.arrayBuffer();
          const bytes = new Uint8Array(buffer || new ArrayBuffer(0));
          const signature = bytes.length >= 5
            ? String.fromCharCode(...bytes.subarray(0, 5))
            : "";
          const contentType = String(response.headers.get("content-type") || "").toLowerCase();

          if (!response.ok) {
            sendResponse({
              ok: false,
              status: response.status,
              message: `PDF_BG_FETCH_HTTP_${response.status}`
            });
            return;
          }

          if (!signature.startsWith("%PDF") && !contentType.includes("application/pdf")) {
            sendResponse({
              ok: false,
              status: response.status,
              message: "PDF_BG_FETCH_NOT_PDF"
            });
            return;
          }

          let binary = "";
          const chunk = 0x8000;
          for (let i = 0; i < bytes.length; i += chunk) {
            binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
          }

          sendResponse({
            ok: true,
            status: response.status,
            contentType,
            finalUrl: response.url || targetUrl,
            base64: btoa(binary)
          });
        } catch (error) {
          const stopped = error?.name === "AbortError" || controller.signal.aborted;
          sendResponse({
            ok: false,
            status: 0,
            message: stopped ? "USER_STOPPED" : (error?.message || String(error))
          });
        } finally {
          neprasUnregisterStudentFetchController(tabId, controller);
        }
      } catch (error) {
        sendResponse({
          ok: false,
          status: 0,
          message: error?.message || String(error)
        });
      }
    })();
    return true;
  }

  if (request.action === "NEPRAS_STUDENT_PAGE_FETCH") {
    (async () => {
      const tabId = sender?.tab?.id;
      const pageUrl = String(sender?.tab?.url || "");
      const apiUrl = String(request?.url || "");

      if (
        tabId == null ||
        !/^https:\/\/student\.emis\.gov\.eg\//i.test(pageUrl)
      ) {
        sendResponse({
          ok: false,
          message: "STUDENT_PAGE_REQUIRED"
        });
        return;
      }

      let parsedApiUrl;
      try {
        parsedApiUrl = new URL(apiUrl);
      } catch (_) {
        sendResponse({
          ok: false,
          message: "INVALID_STUDENT_API_URL"
        });
        return;
      }

      if (parsedApiUrl.origin !== "https://studaapi.emis.gov.eg") {
        sendResponse({
          ok: false,
          message: "STUDENT_API_ORIGIN_NOT_ALLOWED"
        });
        return;
      }

      const pathname = parsedApiUrl.pathname;
      // رفض الشرطات والنقاط المشفّرة: URL لا يطبّعها فقد يفكّها الخادم لاحقًا.
      if (/%(?:2e|2f|5c)/i.test(pathname)) {
        sendResponse({ ok: false, message: "STUDENT_API_URL_NOT_ALLOWED" });
        return;
      }
      const isAllowedStudentApi =
        pathname.startsWith("/api/Student/") && !pathname.includes("/../") && !pathname.includes("/./");

      const isAllowedGeneralApi = pathname === "/api/General";
      const isAllowedSpecialApi = pathname === "/api/Special";
      const isAllowedDeepLookupApi =
        /^\/api\/(?:Religion|Languages|Nationalities|BirthBranch|Obstacle)$/i.test(pathname);
      const isAllowedAttendanceSaveApi =
        pathname === "/api/Absence/SaveStudentAbsence";
      const isAllowedUnifiedEmailsApi =
        pathname === "/api/UnifiedEmails/GetStudentEmailInfo";

      if (
        !isAllowedStudentApi &&
        !isAllowedGeneralApi &&
        !isAllowedSpecialApi &&
        !isAllowedDeepLookupApi &&
        !isAllowedAttendanceSaveApi &&
        !isAllowedUnifiedEmailsApi
      ) {
        sendResponse({
          ok: false,
          message: "STUDENT_API_URL_NOT_ALLOWED"
        });
        return;
      }

      const safeOptions = request?.options || {};
      const method =
        String(safeOptions.method || "GET").toUpperCase();

      if (
        (
          isAllowedGeneralApi ||
          isAllowedSpecialApi ||
          isAllowedDeepLookupApi ||
          isAllowedUnifiedEmailsApi
        ) &&
        method !== "GET"
      ) {
        sendResponse({
          ok: false,
          message: "LOOKUP_API_GET_ONLY"
        });
        return;
      }

      if (
        isAllowedAttendanceSaveApi &&
        method !== "POST"
      ) {
        sendResponse({
          ok: false,
          message: "ATTENDANCE_SAVE_POST_ONLY"
        });
        return;
      }

      if (isAllowedStudentApi && method !== "GET" && method !== "POST") {
        sendResponse({
          ok: false,
          message: "STUDENT_API_METHOD_NOT_ALLOWED"
        });
        return;
      }

      const body =
        safeOptions.body == null
          ? null
          : String(safeOptions.body);

      const sanitizedExtraHeaders = {};
      if (safeOptions.headers && typeof safeOptions.headers === "object") {
        for (const [k, v] of Object.entries(safeOptions.headers)) {
          const lk = String(k).toLowerCase();
          if (
            lk !== "authorization" &&
            lk !== "schoolcode" &&
            lk !== "schoolstage" &&
            lk !== "usertype" &&
            lk !== "cookie" &&
            lk !== "host" &&
            lk !== "origin" &&
            lk !== "referer"
          ) {
            sanitizedExtraHeaders[k] = v;
          }
        }
      }

      const targetSchoolCode = request?.options?.schoolCode || request?.schoolCode || null;
      const captured =
        (await neprasReadStudentApiAuth(tabId, targetSchoolCode)) || {};

      const authorization =
        String(captured.authorization || "").trim();

      const schoolcode =
        String(captured.schoolcode || "").trim();

      const schoolstage =
        String(captured.schoolstage || "").trim();

      const usertype =
        String(captured.usertype || "0").trim();

      if (!authorization) {
        sendResponse({
          ok: false,
          message: "AUTH_HEADERS_NOT_CAPTURED_V151",
          diagnostics: {
            authorization: false,
            schoolcode: !!schoolcode,
            schoolstage: !!schoolstage
          }
        });
        return;
      }

      // ======================================================
      // v1.0:
      // الـ fetch يتم من Service Worker نفسه.
      // الرؤوس المحمية (Authorization, schoolcode...) توضع أخيراً
      // لمنع أي محاولة تجاوز من الرؤوس الإضافية.
      // ======================================================

      const headers = {
        "Accept": "application/json, text/plain, */*",
        ...(body != null
          ? { "Content-Type": "application/json" }
          : {}),
        ...sanitizedExtraHeaders,
        "Authorization": authorization,
        ...(schoolcode
          ? { "schoolcode": schoolcode }
          : {}),
        ...(schoolstage
          ? { "schoolstage": schoolstage }
          : {}),
        ...(usertype
          ? { "usertype": usertype }
          : {})
      };

      const fetchController = new AbortController();
      neprasRegisterStudentFetchController(tabId, fetchController);

      try {
        const res =
          await fetch(
            parsedApiUrl.href,
            {
              method,
              headers,
              body:
                body != null
                  ? body
                  : undefined,
              cache: "no-store",
              signal: fetchController.signal
            }
          );

        const responseText =
          await res.text();

        const cleanText =
          String(responseText || "").trim().replace(/^\uFEFF/, "");

        let data = null;

        try {
          data =
            cleanText
              ? JSON.parse(cleanText)
              : null;
        } catch (_) {
          data = cleanText;
        }

        if (res.status === 401 || res.status === 403) {
          await neprasClearStudentApiAuth(tabId);
        }

        sendResponse({
          ok: res.ok,
          status: res.status,
          statusText: res.statusText,
          data,
          via: "extension-background-v1.0",
          diagnostics: {
            authorization: true,
            schoolcode: !!schoolcode,
            schoolstage: !!schoolstage,
            usertype: !!usertype,
            restoredFromSession:
              !neprasStudentApiAuthByTab.has(tabId)
          }
        });
      } catch (error) {
        const aborted = error?.name === "AbortError" || fetchController.signal.aborted;
        sendResponse({
          ok: false,
          status: 0,
          message:
            aborted
              ? "USER_STOPPED"
              : (error?.message || String(error)),
          via: "extension-background",
          diagnostics: {
            authorization: true,
            schoolcode: !!schoolcode,
            schoolstage: !!schoolstage,
            usertype: !!usertype
          }
        });
      } finally {
        neprasUnregisterStudentFetchController(tabId, fetchController);
      }
    })();

    return true;
  }
  if (request.action === "NEPRAS_NAVIGATE_WORK") {
    if (!neprasIsExtensionPageSender(sender)) {
      sendResponse({ ok: false, message: "NAVIGATE_FORBIDDEN" });
      return true;
    }
    (async () => {
      try {
        if (!neprasSiteKeyForUrl(request?.targetUrl)) throw new Error("NAVIGATION_TARGET_NOT_ALLOWED");
        const result = await neprasNavigateAndRun(request);
        sendResponse(result);
      } catch (error) {
        console.error("Nepras smart navigation failed:", error);
        sendResponse({ ok: false, message: error?.message || String(error) });
      }
    })();
    return true;
  }

  if (request.action === "NEPRAS_STOP_ALL_WORK") {
    (async () => {
      try {
        sendResponse(await neprasStopAllOpenWork());
      } catch (error) {
        sendResponse({ ok: false, message: error?.message || String(error) });
      }
    })();
    return true;
  }
  if (request.action === "STAFF_BATCH_START") {
    const task = request.task || {};
    const mainTabId = sender.tab?.id;
    if (!task.taskId || !mainTabId || !Array.isArray(task.staffList)) {
      sendResponse({ ok: false, message: "بيانات عملية تنزيل العاملين غير مكتملة أو تعذر تحديد التبويب الرئيسي." });
      return true;
    }
    if (staffBatches.size) {
      sendResponse({ ok: false, message: "هناك عملية تنزيل عاملين تعمل بالفعل." });
      return true;
    }

    const batch = {
      taskId: task.taskId,
      mainTabId,
      mode: task.mode || "CORE",
      filter: task.filter || {},
      staffList: task.staffList,
      results: Array.isArray(task.results) ? task.results : [],
      index: Number(task.index || 0),
      workerTabId: null,
      workerTimeout: null,
      cancelled: false
    };

    staffBatches.set(batch.taskId, batch);
    staffBatchCreateWorker(batch);
    sendResponse({ ok: true, taskId: batch.taskId });
    return true;
  }

  if (request.action === "STAFF_WORKER_RESULT") {
    const taskId = request.taskId;
    const batch = staffBatches.get(taskId);
    if (!batch || batch.cancelled) {
      sendResponse({ ok: false, message: "عملية تنزيل العاملين غير موجودة أو متوقفة." });
      return true;
    }

    if (batch.workerTabId != null && sender.tab?.id != null && sender.tab.id !== batch.workerTabId) {
      sendResponse({ ok: false, message: "نتيجة من تبويب غير متوقع." });
      return true;
    }

    clearTimeout(batch.workerTimeout);
    const row = request.row || {};
    batch.results.push(row);
    batch.index += 1;

    staffBatchSendResult(batch, {
      action: "STAFF_BATCH_RESULT",
      taskId,
      ok: !!request.ok,
      row,
      index: batch.index,
      total: batch.staffList.length,
      success: batch.results.filter((r) => (r["حالة التنزيل"] ?? r["حالة السحب"]) === "تم بنجاح").length, // compat-legacy-term
      errors: batch.results.filter((r) => (r["حالة التنزيل"] ?? r["حالة السحب"]) !== "تم بنجاح").length, // compat-legacy-term
      filter: batch.filter
    });

    const oldTab = batch.workerTabId;
    batch.workerTabId = null;
    if (oldTab != null) chrome.tabs.remove(oldTab).catch(() => {});

    setTimeout(() => {
      const current = staffBatches.get(taskId);
      if (!current || current.cancelled) return;
      staffBatchCreateWorker(current);
    }, 300);

    sendResponse({ ok: true });
    return true;
  }

  if (request.action === "STAFF_BATCH_STOP") {
    for (const [taskId, batch] of staffBatches.entries()) {
      batch.cancelled = true;
      clearTimeout(batch.workerTimeout);
      if (batch.workerTabId != null) chrome.tabs.remove(batch.workerTabId).catch(() => {});
      staffBatchSendResult(batch, {
        action: "STAFF_BATCH_FINISHED",
        taskId,
        mode: batch.mode,
        filter: batch.filter,
        rows: batch.results,
        stopped: true
      });
      staffBatches.delete(taskId);
    }
    sendResponse({ ok: true });
    return true;
  }

  if (request.action === "WATCH_CLASS_REPORT_DOWNLOAD") {
    const tabId = sender.tab?.id;
    if (!tabId) {
      sendResponse({ ok: false, message: "تعذر تحديد تبويب تقرير قوائم الفصول." });
      return true;
    }

    const old = pendingClassReportDownloads.get(tabId);
    if (old) clearClassReportPoll(old);

    const pending = {
      tabId,
      startedAt: Date.now(),
      candidateId: null,
      candidate: null,
      classValue: String(request.classValue || ""),
      classText: String(request.classText || ""),
      knownIds: new Set(),
      pollTimer: null,
      timeout: null,
      done: false
    };

    // نأخذ snapshot قبل أن نسمح للصفحة بالضغط على زر التقرير،
    // حتى لا نخلط بين pdf قديم وDownload ID الجديد.
    chrome.downloads.search({
      orderBy: ["-startTime"],
      limit: 100
    }, (items) => {
      if (!chrome.runtime.lastError && Array.isArray(items)) {
        for (const item of items) pending.knownIds.add(item.id);
      }

      pendingClassReportDownloads.set(tabId, pending);

      pending.timeout = setTimeout(() => {
        failClassReportDownload(tabId, "تعذر التقاط ملف قائمة الفصل. حاول مرة أخرى أو عطّل التقاط ملفات PDF في برنامج التحميل الخارجي مؤقتًا.");
      }, 45000);

      pending.pollTimer = setInterval(() => pollClassReportDownload(tabId), 400);
      pollClassReportDownload(tabId);
      sendResponse({ ok: true, waitingForNewDownloadId: true });
    });

    return true;
  }

  if (request.action === "CANCEL_CLASS_REPORT_DOWNLOAD_WATCH") {
    const tabId = sender.tab?.id;
    const pending = tabId != null ? pendingClassReportDownloads.get(tabId) : null;
    if (pending) {
      clearClassReportPoll(pending);
      pendingClassReportDownloads.delete(tabId);
    }
    sendResponse({ ok: true });
    return true;
  }

  // Phase 1b: WATCH_STATUS_SHEET_DOWNLOAD, CANCEL_STATUS_SHEET_DOWNLOAD,
  // START_STATUS_WORKER, STATUS_WORKER_PDF_READY, STATUS_WORKER_SKIP and
  // STATUS_WORKER_ERROR handlers removed — all six served only the dead
  // worker-tab status-sheet pipeline. See PHASE_NOTES.md, "Phase 1b".

  // v1.0 — التنزيل الفعلي لملفات نبراس المولّدة يتم من هنا (الخلفية) عبر
  // chrome.downloads.download بدل a.click() في صفحة الموقع. السبب: مسار
  // download attribute في وسم <a> لا يدعم إنشاء فولدرات فرعية (يستبدل "/"
  // بشكل مختلف حسب النسخة)، بينما chrome.downloads.download يدعم فولدرات
  // فرعية داخل اسم الملف (filename) بشكل موثّق ومستقر عبر كروم/إيدج.
  // v1.2.75 — إصلاح التنزيل على الموبايل (Edge/Kiwi على أندرويد):
  //  1) كان الرد ok:true يُرسَل بمجرد الحصول على downloadId، حتى لو تحوّل التنزيل بعدها إلى
  //     interrupted (مثلًا FILE_ACCESS_DENIED بسبب فولدر فرعي، أو رابط data أكبر من ~2MB)،
  //     فتظهر «تم الحفظ» ولا يوجد ملف. الآن ننتظر نتيجة التنزيل فعليًا.
  //  2) إن فشل الاسم ذو الفولدر الفرعي (Nepras/Excel/x.xlsx) نعيد المحاولة باسم الملف فقط.
  //  3) إن لم تتوفر chrome.downloads أو فشلت المحاولتان نرد بفشل صريح ليتولى الصفحة الاحتياط.
  if (request.action === "NEPRAS_DOWNLOAD_FILE") {
    if (!neprasIsExtensionPageSender(sender) && !neprasSiteKeyForUrl(sender?.tab?.url)) {
      sendResponse({ ok: false, message: "DOWNLOAD_FORBIDDEN" });
      return true;
    }
    (async () => {
      try {
        const filename = String(request.filename || "").replace(/^\/+/, "");
        const dlExt = (neprasDownloadBasename(filename).toLowerCase().match(/\.[^.]+$/) || [""])[0];
        if (!NEPRAS_DOWNLOAD_ALLOWED_EXTS.includes(dlExt)) {
          sendResponse({ ok: false, message: "DOWNLOAD_EXT_NOT_ALLOWED" });
          return;
        }
        const mimeType = String(request.mimeType || "application/octet-stream");
        const base64 = String(request.base64 || "");
        if (!filename || !base64) {
          sendResponse({ ok: false, message: "DOWNLOAD_MISSING_DATA" });
          return;
        }
        if (typeof chrome.downloads?.download !== "function") {
          sendResponse({ ok: false, message: "DOWNLOADS_API_UNAVAILABLE" });
          return;
        }
        // v1.2.77: رابط data: أكبر من ~2MB يُرفض في كروم (Invalid URL) فكان الملف الكبير (مثل ZIP عشرات
        // الصحف) يسقط للمسار الاحتياطي ويُحفظ في التنزيلات مباشرة بدل مجلد Nepras. للملفات الكبيرة نصنع
        // رابط blob: عبر مستند offscreen (إن وُجد)، وإلا نرجع لرابط data: كما كان.
        let sourceUrl = `data:${mimeType};base64,${base64}`;
        let blobNote = "";
        if (base64.length > NEPRAS_DATA_URL_MAX_CHARS) {
          const blob = await neprasMakeBlobUrl(base64, mimeType);
          if (blob.ok) sourceUrl = blob.url;
          else blobNote = blob.message || "BLOB_URL_FAILED";
        }
        const candidates = [filename];
        const flatName = neprasDownloadBasename(filename);
        if (flatName && flatName !== filename) candidates.push(flatName);

        let lastError = "DOWNLOAD_FAILED";
        for (const name of candidates) {
          const started = await neprasStartDownload(sourceUrl, name);
          if (!started.ok) { lastError = started.message || lastError; continue; }
          const outcome = await neprasWaitDownloadOutcome(started.downloadId);
          if (outcome.state === "interrupted") {
            lastError = outcome.error || "DOWNLOAD_INTERRUPTED";
            try { chrome.downloads.erase({ id: started.downloadId }, () => void chrome.runtime.lastError); } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
            continue;
          }
          sendResponse({ ok: true, downloadId: started.downloadId, filename: name, state: outcome.state });
          return;
        }
        sendResponse({ ok: false, message: blobNote ? `${lastError} (blob: ${blobNote})` : lastError });
      } catch (error) {
        sendResponse({ ok: false, message: error?.message || String(error) });
      }
    })();
    return true;
  }

  return false;
}


// ============================================================
// v1.0 — فتح آخر ملف أنشأه نبراس
// ============================================================
function neprasDownloadBasename(value) {
  return String(value || "").replace(/\\/g, "/").split("/").pop() || "";
}

// v1.2.77 — عتبة طول base64 التي نتجاوزها إلى رابط blob: (حد رابط data: في كروم ~2,097,152 حرفًا).
// أقل من الحد بهامش كافٍ كي لا نقترب منه.
const NEPRAS_DATA_URL_MAX_CHARS = 1500000;
// الامتدادات التي تُنتجها نبراس فقط؛ أي امتداد آخر (exe, html, js...) يُرفض.
const NEPRAS_DOWNLOAD_ALLOWED_EXTS = [".xlsx", ".xlsm", ".xltm", ".xls", ".pdf", ".csv", ".zip", ".txt", ".log", ".nepras", ".json"];
let neprasOffscreenPromise = null;

// ينشئ مستند offscreen مرة واحدة (أو يستخدم الموجود). يرجع true/false ولا يرمي استثناءً.
function neprasEnsureOffscreenDocument() {
  if (typeof chrome.offscreen?.createDocument !== "function") return Promise.resolve(false);
  if (neprasOffscreenPromise) return neprasOffscreenPromise;
  neprasOffscreenPromise = (async () => {
    try {
      if (typeof chrome.runtime.getContexts === "function") {
        const existing = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
        if (Array.isArray(existing) && existing.length) return true;
      }
      await chrome.offscreen.createDocument({
        url: "offscreen.html",
        reasons: ["BLOBS"],
        justification: "تحويل ملفات نبراس الكبيرة (ZIP/PDF) إلى رابط blob لحفظها في مجلد Nepras."
      });
      return true;
    } catch (error) {
      if (/single offscreen|already exists/i.test(String(error?.message || error))) return true;
      return false;
    }
  })();
  // عند الفشل لا نُبقي النتيجة مخزّنة كي تُعاد المحاولة في التنزيل التالي.
  neprasOffscreenPromise.then((ok) => { if (!ok) neprasOffscreenPromise = null; });
  return neprasOffscreenPromise;
}

// يرجع {ok:true, url} أو {ok:false, message}. لا يرمي استثناءً.
// إن كان المستند أُغلق منذ آخر استخدام (Receiving end does not exist) نعيد إنشاءه ونحاول مرة ثانية.
async function neprasMakeBlobUrl(base64, mimeType) {
  let lastMessage = "BLOB_URL_FAILED";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (!(await neprasEnsureOffscreenDocument())) return { ok: false, message: "OFFSCREEN_UNAVAILABLE" };
      const res = await chrome.runtime.sendMessage({ target: "nepras-offscreen", type: "MAKE_BLOB_URL", base64, mimeType });
      if (res?.ok && typeof res.url === "string" && res.url.startsWith("blob:")) return { ok: true, url: res.url };
      lastMessage = res?.message || lastMessage;
      return { ok: false, message: lastMessage };
    } catch (error) {
      lastMessage = error?.message || String(error);
      neprasOffscreenPromise = null;
    }
  }
  return { ok: false, message: lastMessage };
}

// v1.2.75 — يبدأ تنزيلًا ويرجع {ok, downloadId} أو {ok:false, message} دون أن يرمي استثناءً.
function neprasStartDownload(url, filename) {
  return new Promise((resolve) => {
    try {
      chrome.downloads.download({ url, filename, saveAs: false }, (downloadId) => {
        const err = chrome.runtime.lastError;
        if (err || !Number.isInteger(downloadId)) {
          resolve({ ok: false, message: err?.message || "DOWNLOAD_FAILED" });
          return;
        }
        resolve({ ok: true, downloadId });
      });
    } catch (error) {
      resolve({ ok: false, message: error?.message || String(error) });
    }
  });
}

// v1.2.75 — ينتظر (حتى timeoutMs) حالة التنزيل: complete | interrupted | pending.
// pending = لم نستطع الجزم (بعض متصفحات الموبايل لا تُحدّث الحالة أو لا تدعم search)،
// وفي هذه الحالة نعتبر التنزيل ناجحًا كي لا نُكرّر الملف.
async function neprasWaitDownloadOutcome(downloadId, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const items = await neprasDownloadsSearchAsync({ id: downloadId });
    const item = items[0];
    if (!item) return { state: "pending" };
    if (item.state === "complete") return { state: "complete" };
    if (item.state === "interrupted") return { state: "interrupted", error: item.error || "DOWNLOAD_INTERRUPTED" };
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return { state: "pending" };
}

function neprasDownloadsSearchAsync(query) {
  return new Promise((resolve) => {
    try {
      chrome.downloads.search(query, (items) => {
        if (chrome.runtime.lastError) return resolve([]);
        resolve(Array.isArray(items) ? items : []);
      });
    } catch (_) {
      resolve([]);
    }
  });
}

function neprasDownloadsOpenAsync(downloadId) {
  return new Promise((resolve) => {
    try {
      if (typeof chrome.downloads?.open !== "function") {
        return resolve({ ok: false, message: "OPEN_NOT_SUPPORTED" });
      }
      chrome.downloads.open(downloadId, () => {
        if (chrome.runtime.lastError) {
          return resolve({ ok: false, message: chrome.runtime.lastError.message || "OPEN_FAILED" });
        }
        resolve({ ok: true, opened: true });
      });
    } catch (error) {
      resolve({ ok: false, message: error?.message || String(error) });
    }
  });
}

async function neprasShowDownloadFallback(downloadId) {
  try {
    if (typeof chrome.downloads?.show === "function") {
      chrome.downloads.show(downloadId);
      return { ok: true, shown: true };
    }
  } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
  try {
    if (typeof chrome.downloads?.showDefaultFolder === "function") {
      chrome.downloads.showDefaultFolder();
      return { ok: true, shownFolder: true };
    }
  } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
  return { ok: false, message: "OPEN_NOT_SUPPORTED" };
}

async function neprasOpenGeneratedDownload(fileName, startedAt = 0) {
  const wanted = neprasDownloadBasename(fileName);
  if (!wanted) return { ok: false, message: "NO_FILENAME" };

  const wantedLower = wanted.toLocaleLowerCase();
  const ext = (wantedLower.match(/\.[^.]+$/) || [""])[0];
  const ALLOWED_EXTS = [".xlsx", ".pdf", ".zip", ".csv"];
  if (!ext || !ALLOWED_EXTS.includes(ext)) {
    return { ok: false, message: "EXT_NOT_ALLOWED" };
  }

  const now = Date.now();
  const minTime = startedAt ? Math.max(0, Number(startedAt) - 5000) : (now - 300000);

  let candidate = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const items = await neprasDownloadsSearchAsync({ orderBy: ["-startTime"], limit: 100 });
    const recent = items.filter((item) => {
      const startMs = Date.parse(item?.startTime || "") || 0;
      return startMs >= minTime;
    });

    candidate = recent.find((item) =>
      neprasDownloadBasename(item?.filename).toLocaleLowerCase() === wantedLower &&
      (String(item?.url || "").startsWith("blob:") || item?.byExtensionId === chrome.runtime.id)
    ) || null;

    if (!candidate && ext) {
      candidate = recent.find((item) => {
        const base = neprasDownloadBasename(item?.filename).toLocaleLowerCase();
        return base.endsWith(ext) && (
          String(item?.url || "").startsWith("blob:") ||
          item?.byExtensionId === chrome.runtime.id
        );
      }) || null;
    }

    if (candidate?.state === "complete") break;
    if (candidate?.state === "interrupted") {
      return { ok: false, message: candidate?.error || "DOWNLOAD_INTERRUPTED" };
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  if (!candidate) return { ok: false, message: "DOWNLOAD_NOT_FOUND" };

  const opened = await neprasDownloadsOpenAsync(candidate.id);
  if (opened.ok) return { ...opened, downloadId: candidate.id };

  const fallback = await neprasShowDownloadFallback(candidate.id);
  return { ...fallback, downloadId: candidate.id, openError: opened.message };
}


chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const action = String(request?.action || '');

  if (action === 'NEPRAS_OPEN_GENERATED_FILE') {
    if (!neprasIsExtensionPageSender(sender) && !neprasIsStudentSender(sender) && neprasSiteKeyForUrl(sender?.tab?.url) !== 'teacher') {
      sendResponse({ ok: false, message: 'OPEN_FILE_FORBIDDEN' });
      return true;
    }
    (async () => {
      try {
        sendResponse(await neprasOpenGeneratedDownload(request?.fileName || "", request?.startedAt || 0));
      } catch (error) {
        sendResponse({ ok: false, message: error?.message || String(error) });
      }
    })();
    return true;
  }

  if (action === 'NEPRAS_ENABLE_COPY') {
    if (!neprasIsExtensionPageSender(sender)) {
      sendResponse({ ok: false, message: 'ENABLE_COPY_FORBIDDEN' });
      return true;
    }
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) {
          sendResponse({ ok: false, message: 'لا يوجد تبويب نشط' });
          return;
        }
        await chrome.scripting.executeScript({
          target: { tabId: tab.id, allFrames: true },
          func: () => {
            const style = document.createElement('style');
            style.textContent = '*, *::before, *::after { user-select: auto !important; -webkit-user-select: auto !important; }';
            document.head?.appendChild(style);
            const stop = (e) => e.stopPropagation();
            ['copy', 'cut', 'selectstart', 'contextmenu', 'dragstart'].forEach((ev) => {
              window.addEventListener(ev, stop, true);
              document.addEventListener(ev, stop, true);
            });
            document.oncopy = null;
            document.oncontextmenu = null;
            document.onselectstart = null;
            if (document.body) {
              document.body.oncopy = null;
              document.body.oncontextmenu = null;
              document.body.onselectstart = null;
            }
          }
        });
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, message: e?.message || String(e) });
      }
    })();
    return true;
  }

  if (action === 'NEPRAS_FILE_GENERATED') {
    if (!neprasIsExtensionPageSender(sender) && !neprasIsStudentSender(sender) && neprasSiteKeyForUrl(sender?.tab?.url) !== 'teacher') {
      sendResponse({ ok: false, message: 'FORBIDDEN' });
      return true;
    }
    sendResponse({ ok: true });
    // [Phase 4] تسجيل سجل «آخر الملفات المُصدّرة» — يُقرأ لاحقًا من الـ popup.
    // نكتب هنا (وليس في popup.js) لأن التصدير غالبًا يحدث والنافذة المنبثقة
    // مغلقة، وservice worker الخلفية هو السياق الوحيد المضمون تشغيله وقتها.
    (async () => {
      try {
        const fileName = String(request?.payload?.fileName || "").trim();
        if (!fileName) return;
        const startedAt = Number(request?.payload?.startedAt || Date.now());
        const stored = await chrome.storage.local.get(NEPRAS_RECENT_EXPORTS_KEY);
        const list = Array.isArray(stored?.[NEPRAS_RECENT_EXPORTS_KEY]) ? stored[NEPRAS_RECENT_EXPORTS_KEY] : [];
        list.unshift({ fileName, startedAt });
        const trimmed = list.slice(0, NEPRAS_RECENT_EXPORTS_MAX);
        await chrome.storage.local.set({ [NEPRAS_RECENT_EXPORTS_KEY]: trimmed });
      } catch (_) {
        // تجاهل بصمت: هذا السجل تحسيني فقط ولا يجب أن يوقف أي مسار تنزيل حقيقي.
      }
    })();
    return true;
  }

  if (action === 'NEPRAS_NAME_FIXER_OPEN') {
    if (!neprasIsExtensionPageSender(sender)) { sendResponse({ ok: false, message: 'NF_OPEN_FORBIDDEN' }); return true; }
    neprasOpenNameFixer(request)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, message: error?.message || String(error) }));
    return true;
  }

  if (action === 'NEPRAS_NAME_FIXER_LOG' || action === 'NEPRAS_NF_LOG') {
    if (!neprasIsStudentSender(sender)) { sendResponse({ ok: false, message: 'NF_LOG_FORBIDDEN' }); return true; }
    neprasNfLogHandle(request)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, message: error?.message || String(error) }));
    return true;
  }

  if (action === 'NEPRAS_ENSURE_LIB') {
    neprasEnsureLibForSender(String(request?.lib || ''), sender).then(sendResponse);
    return true;
  }

  // قالب دفاتر الفصول: المرفوع من المستخدم (IndexedDB) إن وُجد لهذا المفتاح، وإلا المضمّن مع الإضافة (templates/classbooks).
  // يُقرأ هنا لا من الصفحة: فلا يُعلَن في web_accessible_resources ولا تنكشف الإضافة لصفحات الوزارة، ومخزن المستخدم في أصل الإضافة لا تصله الصفحة.
  // المرسِل: سكربت الإضافة في موقع الطلاب فقط، والمسار محصور بنمط القوالب. تعذّر قراءة مخزن المستخدم لا يوقف العمل: يُستعمل المضمّن ويُبلَّغ بـ customError.
  if (action === 'NEPRAS_READ_BUNDLED_TEMPLATE') {
    (async () => {
      try {
        if (sender?.id !== chrome.runtime.id || !neprasIsStudentSender(sender)) return sendResponse({ ok: false, message: 'TEMPLATE_FORBIDDEN' });
        const file = String(request?.file || '');
        if (!/^templates\/classbooks\/[a-z0-9_]+\.xltm$/.test(file)) return sendResponse({ ok: false, message: 'TEMPLATE_UNKNOWN' });
        const key = String(request?.key || '');
        if (key && !/^[a-z0-9_]{1,32}$/.test(key)) return sendResponse({ ok: false, message: 'TEMPLATE_UNKNOWN' });

        let bytes = null;
        let custom = null;
        let customError = '';
        if (key && globalThis.NeprasCbTemplateStore) {
          try {
            const mine = await globalThis.NeprasCbTemplateStore.get(key);
            if (mine) { bytes = mine.bytes; custom = { name: mine.name, savedAt: mine.savedAt, size: mine.size }; }
          } catch (error) {
            customError = error?.message || String(error);
          }
        }
        if (!bytes) {
          const res = await fetch(chrome.runtime.getURL(file));
          if (!res.ok) return sendResponse({ ok: false, message: 'HTTP_' + res.status });
          bytes = new Uint8Array(await res.arrayBuffer());
        }
        let binary = '';
        for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        sendResponse({ ok: true, base64: btoa(binary), custom, customError });
      } catch (error) {
        sendResponse({ ok: false, message: error?.message || String(error) });
      }
    })();
    return true;
  }

  if (action === 'NEPRAS_REQUEST_BRIDGE_INJECTION') {
    (async () => {
      const tabId = sender?.tab?.id;
      const url = sender?.tab?.url || sender?.url || '';
      if (tabId == null) return sendResponse({ ok: false, message: 'NO_SENDER_TAB' });
      try { sendResponse(await neprasInjectTeacherBridge(tabId, url)); }
      catch (error) { sendResponse({ ok: false, message: error?.message || String(error) }); }
    })();
    return true;
  }

  if (action === 'NEPRAS_REQUEST_SITE_INJECTION') {
    (async () => {
      const tabId = sender?.tab?.id;
      const url = sender?.tab?.url || sender?.url || '';
      if (tabId == null) return sendResponse({ ok: false, message: 'NO_SENDER_TAB' });
      try { sendResponse(await neprasInjectSiteTools(tabId, url)); }
      catch (error) { sendResponse({ ok: false, message: error?.message || String(error) }); }
    })();
    return true;
  }

  (async () => {
    const keepChannel = neprasDispatchMessage(request, sender, sendResponse);
    if (keepChannel === false) {
      sendResponse({ ok: false, unhandled: true, message: 'UNKNOWN_ACTION' });
    }
  })().catch((error) => sendResponse({ ok: false, message: error?.message || String(error) }));
  return true;
});

// Phase 1b: the "re-send status-worker commands after tab navigation"
// chrome.tabs.onUpdated listener was removed along with statusWorkers.

chrome.tabs.onRemoved.addListener((tabId) => {
  neprasAbortStudentFetchesForTab(tabId);

  const pendingClass = pendingClassReportDownloads.get(tabId);
  if (pendingClass) {
    clearTimeout(pendingClass.timeout);
    pendingClassReportDownloads.delete(tabId);
  }

  for (const [taskId, batch] of staffBatches.entries()) {
    if (batch.mainTabId === tabId) {
      batch.cancelled = true;
      clearTimeout(batch.workerTimeout);
      if (batch.workerTabId != null) chrome.tabs.remove(batch.workerTabId).catch(() => {});
      staffBatches.delete(taskId);
    } else if (batch.workerTabId === tabId && !batch.cancelled) {
      clearTimeout(batch.workerTimeout);
      batch.workerTabId = null;
      const staff = batch.staffList[batch.index];
      batch.results.push({
        "كود الموظف": String(staff?.empCode || ""),
        "اسم الموظف الكامل": staff?.fullName || "",
        "تصنيف العامل": batch.filter?.type || "",
        "الموقف من العمل": batch.filter?.status || "",
        "حالة التنزيل": "خطأ: أُغلق تبويب الموظف قبل اكتمال التنزيل."
      });
      batch.index += 1;
      staffBatchCreateWorker(batch);
    }
  }
});

// Execute pending teacher task requested by popup/navigation.
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== "complete") return;
  chrome.storage.local.get("pendingTeacherTask", (result) => {
    const task = result?.pendingTeacherTask;
    if (!task || task.tabId !== tabId) return;
    chrome.tabs.sendMessage(tabId, {
      action: "EXECUTE_TEACHER_TASK",
      taskType: task.type
    }).then(() => {
      chrome.storage.local.remove("pendingTeacherTask");
    }).catch(() => {
      setTimeout(() => {
        chrome.tabs.sendMessage(tabId, {
          action: "EXECUTE_TEACHER_TASK",
          taskType: task.type
        }).then(() => chrome.storage.local.remove("pendingTeacherTask")).catch(() => {});
      }, 1200);
    });
  });
});
