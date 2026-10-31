// ============================================================
// 📦 MODULE: modules/export.js
// 🚀 نبراس - نظام سحب وتصدير بيانات التلاميذ
// ============================================================

let isScrapeCancelled = false;
let currentExportRunning = false;
let _shouldSaveCancelledData = false;
let _currentDeepScrapedData = [];
let _cancelledSaveContext = null;

// ============================================================
// v1.0 — إيقاف موحّد وفوري + حماية من إعادة تشغيل عملية موقوفة
// ============================================================
function neprasRequestGlobalStop(reason = "user_stop") {
  isScrapeCancelled = true;
  try {
    window.__NEPRAS_STOP_ALL_REQUESTED__ = true;
    window.__NEPRAS_STOP_REASON__ = String(reason || "user_stop");
    window.dispatchEvent(new CustomEvent("nepras:stop-all", {
      detail: { reason: window.__NEPRAS_STOP_REASON__ }
    }));
  } catch (_) {}

  // v1.0: أوقف أيضًا أي fetch جارٍ داخل Service Worker لهذا التبويب.
  // هذا يجعل زر الإيقاف في صفحة «بحث عن تلميذ» فوريًا حتى أثناء طلب API طويل.
  try {
    chrome.runtime.sendMessage({
      action: "NEPRAS_ABORT_STUDENT_TAB_FETCHES",
      reason: String(reason || "user_stop")
    }).catch(() => {});
  } catch (_) {}
}

function neprasResetGlobalStop() {
  isScrapeCancelled = false;
  try {
    window.__NEPRAS_STOP_ALL_REQUESTED__ = false;
    window.__NEPRAS_STOP_REASON__ = "";
  } catch (_) {}
}

function neprasIsGlobalStopRequested() {
  try {
    return isScrapeCancelled === true || window.__NEPRAS_STOP_ALL_REQUESTED__ === true;
  } catch (_) {
    return isScrapeCancelled === true;
  }
}

window.neprasRequestGlobalStop = neprasRequestGlobalStop;
window.neprasResetGlobalStop = neprasResetGlobalStop;
window.neprasIsGlobalStopRequested = neprasIsGlobalStopRequested;

// ============================================================
// 💾 تسجيل لقطة قابلة للحفظ عند الإيقاف
// ============================================================

function neprasSetCancelledSaveContext(getData, fileName, exporter = exportToFormattedExcel) {
  _cancelledSaveContext = { getData, fileName, exporter };
  try {
    window._neprasCancelledSaveContext = _cancelledSaveContext;
    window._neprasCancelledDataSaved = false;
  } catch (_) {}
}

function neprasClearCancelledSaveContext() {
  _cancelledSaveContext = null;
  try {
    window._neprasCancelledSaveContext = null;
    window._neprasCancelledDataSaved = false;
    window._neprasCurrentTableProgress = [];
  } catch (_) {}
}

function neprasSaveCancelledSnapshot() {
  try {
    const ctx = _cancelledSaveContext || window._neprasCancelledSaveContext;
    if (!ctx || typeof ctx.getData !== "function") return false;
    if (window._neprasCancelledDataSaved) return true;

    const raw = ctx.getData();
    const data = Array.isArray(raw) ? raw.filter(Boolean) : [];
    if (!data.length) return false;

    ctx.exporter(data, ctx.fileName);
    window._neprasCancelledDataSaved = true;
    return true;
  } catch (error) {
    console.error("Nepras: فشل حفظ البيانات عند الإيقاف:", error);
    showFloatingStatus(`❌ تعذر حفظ البيانات التي تم تنزيلها: ${error?.message || error}`, false);
    return false;
  }
}


// ============================================================
// 🧹 تنظيف أوامر نبراس بعد الانتهاء/الإيقاف
// ============================================================


async function neprasPrepareStudentCommandState(
  reason = "student_pre_run"
) {
  // أي أمر جديد يبدأ بعلم إيقاف نظيف.
  neprasResetGlobalStop();

  try {
    await chrome.runtime.sendMessage({
      action:
        "NEPRAS_PREPARE_COMMAND_STATE",
      reason:
        String(reason || "student_pre_run")
    });
  } catch (_) {}

  // تنظيف محلي من آثار عملية انتهت بالفعل.
  // لا نغيّر isScrapeCancelled هنا؛ كل محرك جديد هو الذي يبدأه بقيمته الصحيحة.
  try {
    window._neprasCancelledDataSaved = false;
    window._neprasCurrentTableProgress = [];
    window._neprasCurrentDeepGradeData = [];
  } catch (_) {}

  neprasClearCancelledSaveContext();
}

async function neprasCleanupStudentCommandState(reason = "finished") {
  try {
    if (
      typeof chrome !== "undefined" &&
      chrome.storage?.local
    ) {
      await chrome.storage.local.remove([
        "pendingExportTask",
        "exportTask",
        "pendingClassReportTask"
      ]);
    }
  } catch (_) {}

  try {
    await chrome.runtime.sendMessage({
      action: "NEPRAS_CLEANUP_COMMAND_STATE",
      scope: "student",
      reason: String(reason || "finished")
    });
  } catch (_) {}
}

function neprasResetLocalCommandArtifacts() {
  _shouldSaveCancelledData = false;

  try {
    window._shouldSaveCancelledData = false;
    window._neprasCancelledDataSaved = false;
    window._currentDeepScrapedData = [];
  } catch (_) {}

  neprasClearCancelledSaveContext();
}

// ============================================================
// 🛑 إيقاف العملية
// ============================================================

async function stopScrapingProcess() {
  // v1.0: أي إيقاف لسحب الطلاب يحفظ تلقائيًا ما اكتمل حتى لحظة الإيقاف.
  neprasRequestGlobalStop("student_floating_stop");

  // قوائم الفصول لها محرك مستقل وملف PDF نهائي، لذلك يظل إيقافها مخصصًا لها.
  try {
    if (typeof window.neprasIsClassReportRunning === "function" && window.neprasIsClassReportRunning()) {
      window.neprasStopClassReportTask?.();
      return;
    }
  } catch (_) {}

  const hasSaveContext = !!(_cancelledSaveContext || window._neprasCancelledSaveContext);
  if (!hasSaveContext) {
    showFloatingStatus("🛑 تم إيقاف العملية بواسطة المستخدم.", false);
    hideFloatingStatus(2600);
    neprasCleanupStudentCommandState("stopped").catch(() => {});
    return;
  }

  _shouldSaveCancelledData = true;
  window._shouldSaveCancelledData = true;

  // مهلة قصيرة جدًا تسمح للطلبات التي انتهت بالفعل بتسجيل نتيجتها في لقطة الحفظ.
  await new Promise(resolve => setTimeout(resolve, 320));

  const ctx = _cancelledSaveContext || window._neprasCancelledSaveContext;
  const raw = ctx && typeof ctx.getData === "function" ? ctx.getData() : [];
  const completedCount = Array.isArray(raw) ? raw.filter(Boolean).length : 0;
  const saved = neprasSaveCancelledSnapshot();

  showFloatingStatus(
    saved
      ? `🛑 تم الإيقاف وحفظ البيانات التي اكتمل تنزيلها حتى لحظة الإيقاف — ${completedCount} طالب`
      : "🛑 تم الإيقاف، ولم توجد بيانات مكتملة للحفظ حتى هذه اللحظة.",
    saved ? true : false
  );
  hideFloatingStatus(4200);

  neprasCleanupStudentCommandState("stopped").catch(() => {});
}

// ============================================================
// 📢 Floating Status
// ============================================================

// حالة السحب/التصدير العائمة تُرسم الآن عبر نظام الرسائل الموحّد (ui/nepras-ui.js).
// الدوال القديمة بقيت بنفس الأسماء والتواقيع فتعمل كل مواضع الاستدعاء دون تعديل.
function neprasStudentStopHooks(reason) {
  return {
    // pointerdown يرفع علم الإيقاف قبل أي نافذة/await.
    onStopPointerDown: () => neprasRequestGlobalStop(reason),
    onStop: () => { stopScrapingProcess().catch(() => {}); }
  };
}

function showFloatingStatus(message, isSuccess = null) {
  // بعد طلب الإيقاف لا نسمح لرسالة تقدم متأخرة أن توحي للمستخدم أن العملية ما زالت تعمل.
  if (neprasIsGlobalStopRequested() && isSuccess === null && !String(message || "").includes("إيقاف")) {
    return;
  }
  const L = window.NeprasLegacy;
  if (!L) return;
  const running = L.classify(message, isSuccess) === "running";
  L.status(message, isSuccess, running ? neprasStudentStopHooks("student_floating_stop_pointer") : undefined);
}

function showDeepProgressStatus(title, current, total, subtitle = "") {
  if (neprasIsGlobalStopRequested()) return;
  window.NeprasLegacy?.progress(
    title || "جاري التنزيل الشامل", current, total, subtitle, "green",
    neprasStudentStopHooks("student_deep_progress_stop_pointer")
  );
}

function hideFloatingStatus(delay = 0) {
  window.NeprasLegacy?.hide(delay);
}

// ============================================================
// 🔗 XPath
// ============================================================

const MAIN_SEARCH_LINK_XPATH =
  "/html/body/app-root/app-app-layout/main-menu/div/div/nav/div/ul/li[2]/div/div[2]/a";

const TRANSFER_PAGE_LINK_XPATH =
  "/html/body/app-root/app-app-layout/main-menu/div/div/nav/div/ul/li[4]/div/div[1]/a";

const TRANSFER_OPEN_MODAL_BTN_XPATH =
  "/html/body/app-root/app-app-layout/div/div/div/app-transfer-request/div[1]/form/div/div/div/div[2]/div/button[2]";

const MODAL_SEARCH_BTN_XPATH =
  "/html/body/ngb-modal-window/div/div/app-student-search-get-code/div[2]/div/div/div/div[2]/div/button";

const STANDARD_SEARCH_BTN_XPATH =
  "/html/body/app-root/app-app-layout/div/div/div/app-list-of-students/div[2]/div/div/div/div[2]/div/button";

// ============================================================
// 🎓 الصفوف
// ============================================================

let GRADES_LIST = [];
let NEPRAS_GRADE_SIGNATURE = "";

// ============================================================
// 🎓 المرحلة الدراسية المختارة يدويًا - يمنع التخمين
// ============================================================
const NEPRAS_STAGE_GRADES = {
  KG: [
    { key: 'KG1', label: 'المستوى الأول', aliases: ['المستوى الاول', 'رياض الاطفال المستوى الاول', 'رياض الأطفال المستوى الأول', 'KG1', 'كي جي 1'] },
    { key: 'KG2', label: 'المستوى الثاني', aliases: ['المستوى الثاني', 'رياض الاطفال المستوى الثاني', 'رياض الأطفال المستوى الثاني', 'KG2', 'كي جي 2'] }
  ],
  PRIMARY: [1,2,3,4,5,6].map(n => ({ key: `P${n}`, label: `الصف ${['الأول','الثاني','الثالث','الرابع','الخامس','السادس'][n-1]}`, aliases: [`الصف ${['الأول','الثاني','الثالث','الرابع','الخامس','السادس'][n-1]}`, ['الأول','الثاني','الثالث','الرابع','الخامس','السادس'][n-1]] })),
  PREP: [1,2,3].map(n => ({ key: `M${n}`, label: `الصف ${['الأول','الثاني','الثالث'][n-1]} الإعدادي`, aliases: [`الصف ${['الأول','الثاني','الثالث'][n-1]} الإعدادي`, `ال${['أول','ثاني','ثالث'][n-1]} الإعدادي`, ['الأول','الثاني','الثالث'][n-1]] })),
  GENERAL_SECONDARY: [1,2,3].map(n => ({ key: `S${n}`, label: `الصف ${['الأول','الثاني','الثالث'][n-1]} الثانوي`, aliases: [`الصف ${['الأول','الثاني','الثالث'][n-1]} الثانوي`, `ال${['أول','ثاني','ثالث'][n-1]} الثانوي`, ['الأول','الثاني','الثالث'][n-1]] })),
  TECHNICAL_SECONDARY: [1,2,3,4,5].map(n => ({ key: `T${n}`, label: `الصف ${['الأول','الثاني','الثالث','الرابع','الخامس'][n-1]} الفني`, aliases: [`الصف ${['الأول','الثاني','الثالث','الرابع','الخامس'][n-1]} الفني`, `ال${['أول','ثاني','ثالث','رابع','خامس'][n-1]} الفني`, ['الأول','الثاني','الثالث','الرابع','الخامس'][n-1], `الصف ${['الأول','الثاني','الثالث','الرابع','الخامس'][n-1]} الصناعي`, `الصف ${['الأول','الثاني','الثالث','الرابع','الخامس'][n-1]} التجاري`, `الصف ${['الأول','الثاني','الثالث','الرابع','الخامس'][n-1]} الزراعي`] }))
};

let NEPRAS_SELECTED_STAGE = '';


// ============================================================
// 🧭 أدوات المرحلة والصفوف — v1.0
// ============================================================

const NEPRAS_GRADE_COLORS = [
  "#2563eb", "#059669", "#d97706", "#7c3aed", "#0891b2", "#db2777"
];

function neprasIsStudentListRoute() {
  const path = String(location.pathname || "");
  return /\/student\/list(?:\/|$)/i.test(path) || !!document.querySelector("app-list-of-students");
}

function neprasIsTransferRouteStrict() {
  const path = String(location.pathname || "");
  return /(?:\/student\/transfer-request|\/student\/transfer|\/transfer-request)/i.test(path) || !!document.querySelector("app-transfer-request");
}

function neprasIsPlaceholderGradeText(text) {
  const n = normalizeText(String(text || ""));
  if (!n) return true;
  return ["اختر", "اخترالصف", "اخترالمرحله", "اخترالمرحلة", "الصف", "المرحلة", "--"].some(x => n === normalizeText(x));
}

function neprasIsVisibleElement(el) {
  if (!el) return false;
  const style = window.getComputedStyle ? getComputedStyle(el) : null;
  return !!(el.offsetWidth || el.offsetHeight || el.getClientRects?.().length) &&
    (!style || (style.display !== "none" && style.visibility !== "hidden"));
}

function neprasGetNearbyTextForSelect(sel) {
  if (!sel) return "";
  const chunks = [];
  let p = sel.parentElement;
  for (let i = 0; p && i < 4; i++, p = p.parentElement) {
    chunks.push(String(p.innerText || p.textContent || ""));
  }
  return normalizeText(chunks.join(" "));
}

function neprasFindGradeSelectByLabel() {
  const root = document.querySelector("app-list-of-students") || document;
  const selects = Array.from(root.querySelectorAll("select")).filter(neprasIsVisibleElement);
  if (!selects.length) return null;

  let best = null;
  for (const sel of selects) {
    const options = Array.from(sel.options || []);
    const real = options.filter(o => {
      const t = cleanValue(o.text || o.textContent || "");
      return o.value && t && !neprasIsPlaceholderGradeText(t);
    });
    if (!real.length) continue;

    const attrs = [
      sel.getAttribute("formcontrolname"), sel.getAttribute("name"),
      sel.getAttribute("id"), sel.getAttribute("aria-label"),
      sel.getAttribute("placeholder"), sel.getAttribute("ng-reflect-name")
    ].filter(Boolean).map(normalizeText).join(" ");
    const nearby = neprasGetNearbyTextForSelect(sel);
    const allText = normalizeText(real.map(o => o.text || o.textContent || "").join(" "));

    let score = 0;
    if (attrs.includes("grade") || attrs.includes("class") || attrs.includes("stage")) score += 30;
    if (attrs.includes("صف") || attrs.includes("مرحله")) score += 30;
    if (nearby.includes("الصف")) score += 30;
    if (nearby.includes("مرحله")) score += 10;
    if (/الاول|الثاني|الثالث|الرابع|الخامس|السادس|رياض|ابتد|اعد|ثانوي|فني/.test(allText)) score += 20;
    if (real.length <= 7) score += 5;

    if (!best || score > best.score) best = { sel, score };
  }
  return best;
}

function neprasRefreshGradesListFromPage() {
  if (!NEPRAS_SELECTED_STAGE || !neprasIsStudentListRoute()) {
    GRADES_LIST = [];
    NEPRAS_GRADE_SIGNATURE = "";
    return [];
  }

  const resolved = neprasResolveStageGradesFromPage();
  if (resolved.length) {
    GRADES_LIST = resolved.map((g, i) => ({
      ...g,
      color: NEPRAS_GRADE_COLORS[i % NEPRAS_GRADE_COLORS.length],
      name: g.name || g.label,
      label: g.label || `تنزيل بيانات ${g.name || ""}`
    }));
  } else {
    const specs = neprasGetSelectedStageSpecs();
    GRADES_LIST = specs.map((g, i) => ({
      ...g,
      name: g.label,
      value: g.key,
      label: `تنزيل بيانات ${g.label}`,
      color: NEPRAS_GRADE_COLORS[i % NEPRAS_GRADE_COLORS.length]
    }));
  }

  NEPRAS_GRADE_SIGNATURE = GRADES_LIST.map(g => `${g.value || ""}::${normalizeText(g.name || "")}`).join("|");
  return GRADES_LIST;
}

function neprasSetSelectedStage(stageKey, persist = true) {
  NEPRAS_SELECTED_STAGE = String(stageKey || '').trim();
  if (persist && typeof chrome !== 'undefined' && chrome.storage?.local) {
    chrome.storage.local.set({ neprasSelectedStudentStage: NEPRAS_SELECTED_STAGE }).catch(() => {});
  }
  NEPRAS_GRADE_SIGNATURE = '';
}

async function neprasLoadSelectedStage() {
  if (NEPRAS_SELECTED_STAGE) return NEPRAS_SELECTED_STAGE;
  try {
    const data = await chrome.storage.local.get('neprasSelectedStudentStage');
    NEPRAS_SELECTED_STAGE = String(data?.neprasSelectedStudentStage || '').trim();
  } catch (_) {}
  return NEPRAS_SELECTED_STAGE;
}

function neprasGetSelectedStageSpecs() {
  return Array.isArray(NEPRAS_STAGE_GRADES[NEPRAS_SELECTED_STAGE]) ? NEPRAS_STAGE_GRADES[NEPRAS_SELECTED_STAGE] : [];
}

function neprasResolveStageGradesFromPage() {
  if (!neprasIsStudentListRoute() || !NEPRAS_SELECTED_STAGE) return [];
  const gradeSelect = neprasFindGradeSelectByLabel()?.sel || null;
  if (!gradeSelect) return [];
  const opts = Array.from(gradeSelect.options || [])
    .map(o => ({ value: String(o.value ?? '').trim(), text: cleanValue(o.text || o.textContent || '') }))
    .filter(o => o.value && o.text && !neprasIsPlaceholderGradeText(o.text));
  const result = [];
  const usedValues = new Set();
  for (const spec of neprasGetSelectedStageSpecs()) {
    const found = opts.find(o => spec.aliases.some(a => {
      const n = normalizeText(a);
      const t = normalizeText(o.text);
      return t === n || t.includes(n) || n.includes(t);
    }));
    if (found) {
      usedValues.add(String(found.value));
      result.push({ ...spec, name: found.text, value: found.value, label: `تنزيل بيانات ${found.text}` });
    }
  }

  // v1.0: أي صف إضافي حقيقي يظهر في قائمة الوزارة لا يتم إسقاطه لمجرد أن اسمه
  // غير موجود في القاموس المحلي. هذا مهم للمدارس ذات المسميات/الأنظمة الخاصة.
  for (const opt of opts) {
    if (usedValues.has(String(opt.value))) continue;
    result.push({
      key: `SITE_${String(opt.value)}`,
      name: opt.text,
      value: opt.value,
      label: `تنزيل بيانات ${opt.text}`,
      aliases: [opt.text]
    });
  }

  return result;
}

function neprasGetStageGradesForToolbar() {
  const resolved = neprasResolveStageGradesFromPage();
  const specs = neprasGetSelectedStageSpecs();
  if (resolved.length) return resolved.map((g,i)=>({ ...g, color:NEPRAS_GRADE_COLORS[i%NEPRAS_GRADE_COLORS.length] }));
  return specs.map((sp,i)=>({ ...sp, name:sp.label, value:sp.key, label:`تنزيل بيانات ${sp.label}`, color:NEPRAS_GRADE_COLORS[i%NEPRAS_GRADE_COLORS.length] }));
}

function neprasGetAvailableGradesForPopup() {
  return NEPRAS_SELECTED_STAGE ? neprasGetStageGradesForToolbar().map(g => ({ value: g.value, text: g.name })) : [];
}

window.neprasSetSelectedStage = neprasSetSelectedStage;
window.neprasLoadSelectedStage = neprasLoadSelectedStage;
window.neprasGetStageGrades = () => neprasGetStageSpecsSafe();
function neprasGetStageSpecsSafe() { return Object.fromEntries(Object.entries(NEPRAS_STAGE_GRADES).map(([k,v]) => [k, v.map(x => ({key:x.key,label:x.label,aliases:x.aliases}))])); }

function neprasCleanupLegacyTransferUI() {
  const currentTransferBar = document.getElementById("neprasInPageBarTransfer");
  // Keep the current, single toolbar; remove only known legacy regional/country controls.
  const legacyContainers = new Set();

  const legacyTexts = [
    "سحب القاهرة", "سحب الاسكندرية", "سحب الإسكندرية", "سحب بورسعيد", "سحب السويس",
    "سحب دمياط", "سحب الدقهلية", "سحب الشرقية", "سحب القليوبية", "سحب كفر الشيخ",
    "سحب الغربية", "سحب المنوفية", "سحب البحيرة", "سحب الاسماعيلية", "سحب الإسماعيلية",
    "سحب الجيزة", "سحب بنى سويف", "سحب بني سويف", "سحب الفيوم", "سحب المنيا",
    "سحب اسيوط", "سحب أسيوط", "سحب سوهاج", "سحب قنا", "سحب أسوان", "سحب البحر الاحمر",
    "سحب البحر الأحمر", "سحب الوادي الجديد", "سحب مطروح", "سحب شمال سيناء", "سحب جنوب سيناء",
    "سحب الاقصر", "سحب الأقصر"
  ];
  for (const el of Array.from(document.querySelectorAll("button, a, span, div"))) {
    if (currentTransferBar && currentTransferBar.contains(el)) continue;
    const txt = cleanValue(el.innerText || el.textContent || "");
    if (!txt) continue;
    if (legacyTexts.includes(txt)) {
      const host = el.closest("[id*='transfer'], [class*='transfer'], .nepras-transfer-legacy, .neprasQuickTransferPanel") || el;
      legacyContainers.add(host);
    }
  }
  legacyContainers.forEach(el => { if (el && el !== currentTransferBar) el.remove(); });
}

// ============================================================
// 📋 الـ24 حقل
// ============================================================

const DEEP_HEADERS = [
  "م",
  "كود التلميذ",
  "الرقم القومي",
  "اسم التلميذ",
  "اسم الاب بالكامل",
  "اسم الام كامل",
  "النوع",
  "الديانه",
  "تاريخ الميلاد",
  "محافظة الميلاد",
  "العنوان",
  "رقم التليفون",
  "رقم المحمول",
  "البريد الالكتروني الموحد",
  "البريد الالكتروني البديل",
  "رقم الموبايل الثاني",
  "الصف",
  "نظام التعليم",
  "حالة قيد الطالب",
  "الفصل",
  "الشعبة",
  "التخصص",
  "اللغة الاجنبية الاولى",
  "اللغة الاجنبية الثانية",
  "الموقف من الدمج",
  "الجنسيه",
  "رقم جواز السفر"
];

// ============================================================
// 🏫 اسم المدرسة
// ============================================================

function getSchoolNameFromPage() {
  try {
    const xpath =
      "/html/body/app-root/app-app-layout/main-header/div/div/app-change-school/div/label[1]/span";

    const result = document.evaluate(
      xpath,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    );

    if (result && result.singleNodeValue) {
      const rawName =
        result.singleNodeValue.innerText ||
        result.singleNodeValue.textContent ||
        "";

      const cleanName = rawName.trim().replace(/[/\\?%*:|"<>]/g, "_");
      if (cleanName) {
        return cleanName;
      }
    }
  } catch (err) {
    console.error("خطأ في جلب اسم المدرسة:", err);
  }

  return "المدرسة";
}

// ============================================================
// 🔤 Normalize & Cleaning Tools
// ============================================================

function normalizeText(text) {
  if (text === undefined || text === null) {
    return "";
  }

  return String(text)
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[ؤ]/g, "و")
    .replace(/[ئ]/g, "ي")
    .replace(/[\u064B-\u0652]/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function cleanArabicName(text) {
  if (!text) return "";
  return String(text)
    .replace(/[0-9٠-٩\-_+=/\\|()<>{}\[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanValue(value) {
  if (value === undefined || value === null) {
    return "";
  }

  let str = String(value)
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const norm = normalizeText(str);

  if (
    norm === "اختر" ||
    norm === "اختر--" ||
    norm === "--اختر--" ||
    norm === "اخترالكل" ||
    norm === "اخترالصف" ||
    norm === "اخترالنوع" ||
    norm.startsWith("اختر-") ||
    norm.startsWith("-اختر")
  ) {
    return "";
  }

  return str;
}

// ============================================================
// 🕐 التاريخ والوقت
// ============================================================

function getCurrentFormattedDateTime() {
  const now = new Date();

  const dateOptions = {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  };

  const timeOptions = {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  };

  return `${now.toLocaleDateString("ar-EG", dateOptions)} - ${now.toLocaleTimeString("ar-EG", timeOptions)}`;
}

function getCurrentFormattedDateForFilename() {
  const now = new Date();

  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}_${hh}-${min}`;
}

// ============================================================
// 📁 اسم الملف
// ============================================================

function generateUnifiedFilename(gradeOrType) {
  const schoolName = getSchoolNameFromPage();
  const dateStr = getCurrentFormattedDateForFilename();
  const cleanGrade = String(gradeOrType || "")
    .replace(/[/\\?%*:|"<>]/g, "_")
    .trim();

  return `${cleanGrade}_${schoolName}_${dateStr}`;
}

// ============================================================
// 🔎 XPath Helper
// ============================================================

function getElementByXpath(path, contextDoc = document) {
  try {
    return contextDoc.evaluate(
      path,
      contextDoc,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    ).singleNodeValue;
  } catch (e) {
    return null;
  }
}

// ============================================================
// 🔑 الحصول على قيمة الحقل من الكائنات
// ============================================================

function getFieldValue(obj, fieldType) {
  if (!obj) {
    return "";
  }

  const keys = Object.keys(obj);

  for (const rawKey of keys) {
    const normKey = normalizeText(rawKey);

    switch (fieldType) {
      case "CODE":
        if (normKey.includes("كود") || normKey.includes("كودالتلميذ")) {
          return obj[rawKey];
        }
        break;

      case "NAME": {
        // الاسم يجب أن يؤخذ من عمود الاسم نفسه، وليس من "كود التلميذ"
        // لأن كلمة "التلميذ" موجودة أيضًا داخل مفتاح كود التلميذ.
        const isCodeKey =
          normKey.includes("كود") ||
          normKey.includes("الكود") ||
          normKey.includes("code");

        // أولوية أولى: أي مفتاح يحتوي "اسم" وليس مفتاح كود.
        if (!isCodeKey && normKey.includes("اسم")) {
          return obj[rawKey];
        }

        break;
      }

      case "NATIONAL_ID":
        if (
          normKey.includes("رقمقومي") ||
          normKey.includes("الرقمالقومي") ||
          normKey.includes("قومي")
        ) {
          return obj[rawKey];
        }
        break;

      case "GRADE":
        if (normKey.includes("الصف") || normKey === "صف") {
          return obj[rawKey];
        }
        break;

      case "CLASS":
        if (normKey.includes("الفصل") || normKey === "فصل") {
          return obj[rawKey];
        }
        break;

      case "EDU_TYPE":
        if (
          normKey.includes("نوعيهالتعليم") ||
          normKey.includes("نظامالتعليم") ||
          normKey.includes("نوعالتعليم") ||
          normKey === "تعليم"
        ) {
          return obj[rawKey];
        }
        break;

      case "ENROLL_STATUS":
        if (
          normKey.includes("حالهقيد") ||
          normKey.includes("حالةقيد") ||
          normKey.includes("قيد")
        ) {
          return obj[rawKey];
        }
        break;

      case "DAMG":
        if (normKey.includes("دمج")) {
          return obj[rawKey];
        }
        break;

      case "ACADEMIC_YEAR":
        if (
          normKey.includes("العام") ||
          normKey.includes("عاماكاديمي") ||
          normKey.includes("عاماكاديمى")
        ) {
          return obj[rawKey];
        }
        break;

      case "NATIONALITY":
        if (normKey.includes("جنسي")) {
          return obj[rawKey];
        }
        break;
    }
  }

  // fallback للاسم: مفتاح يحتوي "التلميذ" أو "الطالب" بشرط ألا يكون كودًا
  if (fieldType === "NAME") {
    for (const rawKey of keys) {
      const normKey = normalizeText(rawKey);
      const isCodeKey =
        normKey.includes("كود") ||
        normKey.includes("الكود") ||
        normKey.includes("code");
      if (!isCodeKey && (normKey.includes("التلميذ") || normKey.includes("الطالب"))) {
        return obj[rawKey];
      }
    }
  }

  return "";
}

// ============================================================
// 📝 قراءة قيمة العنصر
// ============================================================

function readControlValue(control) {
  if (!control) {
    return "";
  }

  let val = "";

  if (control.tagName === "SELECT") {
    const selected =
      control.options && control.selectedIndex >= 0
        ? control.options[control.selectedIndex]
        : null;

    val = selected
      ? selected.textContent || selected.innerText || control.value
      : control.value;
  } else if (control.tagName === "INPUT" || control.tagName === "TEXTAREA") {
    val = control.value;

    if (!val) {
      val =
        control.getAttribute("value") ||
        control.innerText ||
        control.textContent ||
        "";
    }
  } else {
    val = control.innerText || control.textContent || control.value || "";
  }

  return cleanValue(val);
}

// ============================================================
// 🔎 البحث الذكي عن عناصر النموذج
// ============================================================

function findControlByLabel(doc, labelPatterns, fieldKeywords = []) {
  if (!Array.isArray(labelPatterns)) {
    labelPatterns = [labelPatterns];
  }

  const normalizedPatterns = labelPatterns.map(normalizeText);

  if (fieldKeywords.length > 0) {
    const controls = Array.from(
      doc.querySelectorAll("input, select, textarea, span, div")
    );

    for (const ctrl of controls) {
      const attrs = [
        ctrl.getAttribute("formcontrolname"),
        ctrl.getAttribute("name"),
        ctrl.getAttribute("id"),
        ctrl.getAttribute("placeholder"),
        ctrl.getAttribute("aria-label"),
        ctrl.getAttribute("ng-reflect-name")
      ]
        .filter(Boolean)
        .map(normalizeText);

      const isMatch = fieldKeywords.some(kw =>
        attrs.some(attr => attr.includes(normalizeText(kw)))
      );

      if (isMatch) {
        if (ctrl.tagName === "INPUT" || ctrl.tagName === "SELECT" || ctrl.tagName === "TEXTAREA") {
          return ctrl;
        }
        const innerCtrl = ctrl.querySelector("input, select, textarea");
        if (innerCtrl) return innerCtrl;
      }
    }
  }

  const labels = Array.from(doc.querySelectorAll("label"));

  for (const label of labels) {
    const labelText = normalizeText(label.innerText || label.textContent || "");

    if (!labelText) continue;

    const matched = normalizedPatterns.some(
      pattern => pattern && (labelText === pattern || labelText.includes(pattern))
    );

    if (!matched) continue;

    const forId = label.getAttribute("for");
    if (forId) {
      const control = doc.getElementById(forId);
      if (control) return control;
    }

    let parent = label.closest(
      ".form-group, .form-row, .row, .col-md-3, .col-md-4, .col-md-6, .col-lg-3, .col-lg-4, .col-lg-6, div"
    );

    if (parent) {
      const control = parent.querySelector("input, select, textarea");
      if (control) return control;
    }
  }

  const textElements = Array.from(doc.querySelectorAll("span, div, th, td"));

  for (const element of textElements) {
    const elementText = normalizeText(element.innerText || element.textContent || "");

    if (!elementText) continue;

    const matched = normalizedPatterns.some(
      pattern => pattern && (elementText === pattern || elementText.includes(pattern))
    );

    if (!matched) continue;

    let parent = element.parentElement;
    for (let level = 0; level < 5 && parent; level++) {
      const control = parent.querySelector("input, select, textarea");
      if (control) return control;
      parent = parent.parentElement;
    }
  }

  return null;
}

// ============================================================
// 🔬 استخراج البيانات العميقة من شاشة الطالب
// ============================================================

function extractStudentDetailsFromDoc(doc) {
  const getByLabel = (patterns, keywords = []) => {
    const control = findControlByLabel(doc, patterns, keywords);
    return readControlValue(control);
  };

  // ----------------------------------------------------------
  // الاسم: نقرأ الحقول الرسمية أولاً، ثم الـXPath القديم، ثم الـlabels.
  // هذا يمنع ضياع الاسم عندما يتغير ترتيب/بنية النموذج.
  // ----------------------------------------------------------
  const directNameControl =
    doc.querySelector("input[formcontrolname='name'], input[formcontrolname='fullname'], input[name='name'], input[id*='fullname' i], input[id*='studentname' i]");

  let directFullName = directNameControl ? readControlValue(directNameControl) : "";

  let studentNameParts = [];
  const studentNamePaths = [
    "/html/body/app-root/app-app-layout/div/div/div/app-edit-student-form/div[2]/div[1]/div/div/div/form/div[1]/div/div[1]/div/div/div[1]/div[1]/input",
    "/html/body/app-root/app-app-layout/div/div/div/app-edit-student-form/div[2]/div[1]/div/div/div/form/div[1]/div/div[1]/div/div/div[1]/div[2]/input",
    "/html/body/app-root/app-app-layout/div/div/div/app-edit-student-form/div[2]/div[1]/div/div/div/form/div[1]/div/div[1]/div/div/div[1]/div[3]/input",
    "/html/body/app-root/app-app-layout/div/div/div/app-edit-student-form/div[2]/div[1]/div/div/div/form/div[1]/div/div[1]/div/div/div[1]/div[4]/input"
  ];

  if (!directFullName) {
    studentNameParts = studentNamePaths
      .map(path => getElementByXpath(path, doc))
      .map(readControlValue)
      .filter(Boolean);
  }

  if (!directFullName && studentNameParts.length === 0) {
    const namedInputs = Array.from(doc.querySelectorAll(
      "app-edit-student-form input[formcontrolname*='name' i], app-edit-student-form input[name*='name' i]"
    )).filter(input => {
      const attrs = `${input.getAttribute('formcontrolname') || ''} ${input.getAttribute('name') || ''} ${input.getAttribute('id') || ''}`.toLowerCase();
      return !attrs.includes('mother') && !attrs.includes('guardian');
    });
    studentNameParts = namedInputs.slice(0, 4).map(readControlValue).filter(Boolean);
  }

  if (!directFullName && studentNameParts.length === 0) {
    const allInputs = Array.from(doc.querySelectorAll("app-edit-student-form input[type='text'], app-edit-student-form input:not([type])"));
    studentNameParts = allInputs.slice(0, 4).map(readControlValue).filter(Boolean);
  }

  let fullName = cleanArabicName(directFullName || studentNameParts.join(" "));
  let fatherFullName = cleanArabicName(studentNameParts.slice(1).join(" "));

  if (!fullName) {
    const p1 = getByLabel(["الاسم الأول", "الاسم الاول"], ["firstname"]);
    const p2 = getByLabel(["اسم الوالد"], ["fathername"]);
    const p3 = getByLabel(["اسم الجد"], ["grandname"]);
    const p4 = getByLabel(["اللقب / العائلة", "اللقب/العائلة"], ["lastname", "family"]);

    fullName = cleanArabicName([p1, p2, p3, p4].filter(Boolean).join(" "));
    fatherFullName = cleanArabicName([p2, p3, p4].filter(Boolean).join(" "));
  }

  if (!fullName) {
    fullName = cleanArabicName(getByLabel(
      ["الاسم بالكامل", "اسم التلميذ بالكامل", "اسم الطالب بالكامل", "اسم التلميذ"],
      ["fullname", "studentname", "st_name"]
    ));
  }

  if (!fatherFullName && fullName) {
    const parts = fullName.split(/\s+/).filter(Boolean);
    if (parts.length > 1) {
      fatherFullName = parts.slice(1).join(" ");
    }
  }

  let motherFullName = "";
  const motherPaths = [
    "/html/body/app-root/app-app-layout/div/div/div/app-edit-student-form/div[2]/div[1]/div/div/div/form/div[1]/div/div[1]/div/div/div[4]/div[1]/input",
    "/html/body/app-root/app-app-layout/div/div/div/app-edit-student-form/div[2]/div[1]/div/div/div/form/div[1]/div/div[1]/div/div/div[4]/div[2]/input",
    "/html/body/app-root/app-app-layout/div/div/div/app-edit-student-form/div[2]/div[1]/div/div/div/form/div[1]/div/div[1]/div/div/div[4]/div[3]/input",
    "/html/body/app-root/app-app-layout/div/div/div/app-edit-student-form/div[2]/div[1]/div/div/div/form/div[1]/div/div[1]/div/div/div[4]/div[4]/input"
  ];

  motherFullName = motherPaths
    .map(path => getElementByXpath(path, doc))
    .map(readControlValue)
    .filter(Boolean)
    .join(" ");

  motherFullName = cleanArabicName(motherFullName);

  if (!motherFullName) {
    const m1 = getByLabel(["اسم الام الأول", "اسم الام الاول", "اسم الأم الأول", "الاسم الأول للام"], ["motherfirst"]);
    const m2 = getByLabel(["اسم الوالد للام", "اسم الوالد للأم", "اسم والد الام"], ["motherfather"]);
    const m3 = getByLabel(["اسم الجد للام", "اسم الجد للأم", "اسم جد الام"], ["mothergrand"]);
    const m4 = getByLabel(["اللقب / العائلة للام", "اللقب/العائلة للام", "لقب الام", "عائلة الام"], ["motherfamily"]);

    const combinedMother = [m1, m2, m3, m4].filter(Boolean).join(" ");
    if (combinedMother.trim().length > 0) {
      motherFullName = cleanArabicName(combinedMother);
    } else {
      const singleMotherField = getByLabel(["اسم الام بالكامل", "اسم الأم بالكامل", "اسم الام", "اسم الأم"], ["mothername", "motherfull"]);
      if (singleMotherField) {
        motherFullName = cleanArabicName(singleMotherField);
      }
    }
  }

  let specialization = getByLabel(
    ["التخصص", "التخصص الدراسي", "المجال", "الفرع"],
    ["specialization", "spec", "specialty", "dept", "major"]
  );

  let rawSection = getByLabel(
    ["الشعبة الدراسية", "الشعبة", "الشعبه"],
    ["section", "branch", "sec", "track"]
  );

  let section = "";
  if (rawSection) {
    const cleanSec = cleanValue(rawSection);
    const validSections = ["علمي", "ادبي", "أدبي", "علمي علوم", "علمي رياضة", "عام", "تكنولوجي"];
    const isVal = validSections.some(s => cleanSec.includes(s));
    
    if (isVal && !cleanSec.includes("اختر")) {
      section = cleanSec;
    }
  }

  if (!section && specialization) {
    if (specialization.includes("علمي")) {
      section = "علمي";
    } else if (specialization.includes("أدبي") || specialization.includes("ادبي")) {
      section = "أدبي";
    } else {
      section = specialization;
    }
  }

  return {
    studentCode: getByLabel(["كود التلميذ", "كود الطالب", "الكود"], ["code", "stcode", "studentcode"]),
    nationalId: getByLabel(["الرقم القومي", "رقم قومي", "قومي"], ["nationalid", "natid", "nid"]),
    fullName,
    fatherFullName,
    motherFullName,
    gender: getByLabel(["النوع", "نوع الطالب", "نوع التلميذ"], ["gender", "sex"]),
    religion: getByLabel(["الديانة", "الديانه"], ["religion", "rel"]),
    dob: getByLabel(["تاريخ الميلاد", "تاريخ ميلاد"], ["dob", "birthdate"]),
    birthGov: getByLabel(["محافظة الميلاد", "محافظه الميلاد"], ["birthgov", "gov"]),
    address: getByLabel(["العنوان"], ["address", "addr"]),
    phone: getByLabel(["رقم التليفون", "التليفون", "تليفون"], ["phone", "tel"]),
    mobile: getByLabel(["رقم المحمول", "المحمول", "محمول"], ["mobile", "mob"]),
    grade: getByLabel(["الصف"], ["grade", "stage"]),
    eduSystem: getByLabel(["نظام التعليم", "نوعية التعليم", "نوعيه التعليم"], ["edusystem", "edutype"]),
    enrollStatus: getByLabel(["حالة قيد الطالب", "حالة القيد", "حاله قيد الطالب"], ["enrollstatus", "status"]),
    classRoom: getByLabel(["الفصل"], ["class", "classroom"]),
    section,
    specialization,
    lang1: getByLabel(["اللغة الاجنبية الأولى", "اللغة الأجنبية الأولى", "اللغة الاجنبية الاولى"], ["lang1", "firstlang"]),
    lang2: getByLabel(["اللغة الاجنبية الثانية", "اللغة الأجنبية الثانية", "اللغة الاجنبية الثانية"], ["lang2", "secondlang"]),
    damg: getByLabel(["الموقف من الدمج", "الدمج"], ["damg", "merge"]),
    nationality: getByLabel(["الجنسية", "الجنسيه"], ["nationality", "nation"]),
    passport: getByLabel(["رقم جواز السفر", "جواز السفر"], ["passport"])
  };
}

// ============================================================
// 🖼️ Iframe Deep Scrape
// ============================================================

async function fetchStudentDetailsViaIframe(code) {
  return new Promise(resolve => {
    let iframe = document.getElementById("neprasScrapeIframe");

    if (!iframe) {
      iframe = document.createElement("iframe");
      iframe.id = "neprasScrapeIframe";
      iframe.style.display = "none";
      iframe.setAttribute("aria-hidden", "true");
      document.body.appendChild(iframe);
    }

    let finished = false;

    const finish = data => {
      if (finished) return;
      finished = true;
      clearInterval(interval);
      resolve(data || {});
    };

    iframe.src = `https://student.emis.gov.eg/student/edit/${encodeURIComponent(code)}`;

    let checkCount = 0;

    const interval = setInterval(() => {
      checkCount++;

      if (isScrapeCancelled) {
        finish({});
        return;
      }

      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;

        if (iframeDoc) {
          const details = extractStudentDetailsFromDoc(iframeDoc);
          const hasData = details.nationalId || details.fullName || details.studentCode;

          if (hasData && checkCount > 8) {
            finish(details);
            return;
          }
        }
      } catch (e) {
        console.warn("Iframe انتظار تحميل صفحة الطالب:", e);
      }

      if (checkCount > 40) {
        try {
          const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
          finish(iframeDoc ? extractStudentDetailsFromDoc(iframeDoc) : {});
        } catch (e) {
          finish({});
        }
      }
    }, 350);
  });
}

// ============================================================
// 🔢 أكواد الطلاب من الصفحة الحالية
// ============================================================

async function collectStudentCodesFromCurrentPage() {
  const codes = [];

  const rows = Array.from(
    document.querySelectorAll("app-list-of-students table tbody tr")
  );

  rows.forEach(tr => {
    const cells = Array.from(tr.querySelectorAll("td"));

    if (!cells.length) return;

    let codeText = cleanValue(cells[0]?.innerText || cells[0]?.textContent || "");
    codeText = codeText.replace(/[^\d]/g, "");

    if (codeText && /^\d+$/.test(codeText)) {
      codes.push(codeText);
    }
  });

  return codes;
}

// ============================================================
// ⚡ v1.0 — Fast Deep API Engine
// صفحة طالب واحدة فقط لالتقاط أسماء الـ Lookups، ثم بقية الطلاب API متوازي.
// ============================================================

function neprasDeepNormalizeLookupKey(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return [];

  const keys = new Set([raw]);

  // Angular <option [ngValue]> قد يظهر مثل "1: 18".
  const nums = raw.match(/-?\d+/g) || [];
  for (const n of nums) keys.add(String(Number(n)));
  if (nums.length) keys.add(String(Number(nums[nums.length - 1])));

  return [...keys];
}

function neprasDeepLookupFromControl(control) {
  const map = {};

  if (!control || String(control.tagName || "").toUpperCase() !== "SELECT") {
    return { map, selectedValue: "", selectedText: "" };
  }

  for (const option of Array.from(control.options || [])) {
    const text = cleanValue(option.text || option.textContent || "");
    if (!text || normalizeText(text).includes(normalizeText("اختر"))) continue;

    const candidates = [
      option.value,
      option.getAttribute("value"),
      option.getAttribute("ng-reflect-value"),
      option.getAttribute("ng-reflect-ng-value")
    ].filter(v => v !== null && v !== undefined && String(v).trim() !== "");

    for (const candidate of candidates) {
      for (const key of neprasDeepNormalizeLookupKey(candidate)) {
        if (!(key in map)) map[key] = text;
      }
    }
  }

  const selected = control.options?.[control.selectedIndex] || null;

  return {
    map,
    selectedValue: String(control.value ?? ""),
    selectedText: selected ? cleanValue(selected.text || selected.textContent || "") : ""
  };
}

function neprasCaptureDeepLookupMapsFromDoc(doc) {
  const spec = {
    religion: {
      labels: ["الديانة", "الديانه"],
      keywords: ["religion", "rel"]
    },
    birthGov: {
      labels: ["محافظة الميلاد", "محافظه الميلاد"],
      keywords: ["birthgov", "gov", "placeofbirth"]
    },
    section: {
      labels: ["الشعبة الدراسية", "الشعبة", "الشعبه"],
      keywords: ["section", "branch", "division", "track"]
    },
    specialization: {
      labels: ["التخصص", "التخصص الدراسي", "المجال", "الفرع"],
      keywords: ["specialization", "spec", "specialty", "dept", "major"]
    },
    lang1: {
      labels: ["اللغة الاجنبية الأولى", "اللغة الأجنبية الأولى", "اللغة الاجنبية الاولى"],
      keywords: ["lang1", "firstlang", "firstlanguage"]
    },
    lang2: {
      labels: ["اللغة الاجنبية الثانية", "اللغة الأجنبية الثانية", "اللغة الاجنبية الثانية"],
      keywords: ["lang2", "secondlang", "secondlanguage"]
    }
  };

  const out = {};

  for (const [key, cfg] of Object.entries(spec)) {
    try {
      const control = findControlByLabel(doc, cfg.labels, cfg.keywords);
      out[key] = neprasDeepLookupFromControl(control);
    } catch (_) {
      out[key] = { map: {}, selectedValue: "", selectedText: "" };
    }
  }

  return out;
}

function neprasDeepLookupText(lookups, key, id, fallback = "") {
  const bucket = lookups?.[key]?.map || {};

  for (const candidate of neprasDeepNormalizeLookupKey(id)) {
    if (bucket[candidate]) return cleanValue(bucket[candidate]);
  }

  return cleanValue(fallback);
}


function neprasMergeDeepLookupBucket(base, incoming) {
  const oldMap =
    base?.map || {};

  const newMap =
    incoming?.map || {};

  return {
    map: {
      ...oldMap,
      ...newMap
    },
    selectedValue:
      incoming?.selectedValue ||
      base?.selectedValue ||
      "",
    selectedText:
      incoming?.selectedText ||
      base?.selectedText ||
      ""
  };
}

function neprasMergeGeneralSpecialLookups(
  lookups,
  apiLookups
) {
  const out = {
    ...(lookups || {})
  };

  if (apiLookups?.section) {
    out.section =
      neprasMergeDeepLookupBucket(
        out.section,
        apiLookups.section
      );
  }

  if (apiLookups?.specialization) {
    out.specialization =
      neprasMergeDeepLookupBucket(
        out.specialization,
        apiLookups.specialization
      );
  }

  if (
    apiLookups?.specializationByGeneral
  ) {
    out.specializationByGeneral = {
      ...(
        out.specializationByGeneral ||
        {}
      ),
      ...apiLookups.specializationByGeneral
    };
  }

  out.__neprasGeneralSpecialSource =
    apiLookups?.stageCode
      ? "API"
      : (
          out.__neprasGeneralSpecialSource ||
          ""
        );

  return out;
}


function neprasMergeStaticDeepLookups(
  lookups,
  apiLookups
) {
  const out = {
    ...(lookups || {})
  };

  for (const key of [
    "religion",
    "birthGov",
    "lang1",
    "lang2",
    "nationality",
    "obstacle"
  ]) {
    if (apiLookups?.[key]) {
      out[key] =
        neprasMergeDeepLookupBucket(
          out[key],
          apiLookups[key]
        );
    }
  }

  out.__neprasStaticLookupDiagnostics =
    apiLookups?.diagnostics || {};

  return out;
}

function neprasDeepExpectedId(value) {
  if (
    value === undefined ||
    value === null
  ) {
    return false;
  }

  const text =
    String(value).trim();

  if (!text) {
    return false;
  }

  const num =
    Number(text);

  if (Number.isFinite(num)) {
    return num > 0;
  }

  return true;
}

function neprasDeepSpecializationText(
  lookups,
  generalId,
  specialId,
  fallback = ""
) {
  const byGeneral =
    lookups?.specializationByGeneral ||
    {};

  const generalKeys =
    neprasDeepNormalizeLookupKey(
      generalId
    );

  const specialKeys =
    neprasDeepNormalizeLookupKey(
      specialId
    );

  for (const g of generalKeys) {
    const bucket =
      byGeneral?.[g] || {};

    for (const s of specialKeys) {
      if (bucket?.[s]) {
        return cleanValue(
          bucket[s]
        );
      }
    }
  }

  return neprasDeepLookupText(
    lookups,
    "specialization",
    specialId,
    fallback
  );
}


// جدول المحافظات من modules/egypt_ids.js (مصدر واحد).
const NEPRAS_EGYPT_GOVERNORATE_BY_CODE = NeprasEgypt.GOVERNORATES;

function neprasDeepBirthGovFallback(placeOfBirth, nationalId = "") {
  const direct = String(placeOfBirth ?? "").replace(/\D/g, "");

  if (direct) {
    const code = direct.padStart(2, "0").slice(-2);
    if (NEPRAS_EGYPT_GOVERNORATE_BY_CODE[code]) {
      return NEPRAS_EGYPT_GOVERNORATE_BY_CODE[code];
    }
  }

  const nid = String(nationalId ?? "").replace(/\D/g, "");
  if (nid.length === 14) {
    const code = nid.slice(7, 9);
    if (NEPRAS_EGYPT_GOVERNORATE_BY_CODE[code]) {
      return NEPRAS_EGYPT_GOVERNORATE_BY_CODE[code];
    }
  }

  return "";
}

function neprasDeepIsPlaceholder(value) {
  const n = normalizeText(String(value || ""));
  return (
    !n ||
    n.includes(normalizeText("اختر")) ||
    n.includes(normalizeText("إختر"))
  );
}

function neprasDeepLookupSize(lookupMaps, key) {
  return Object.keys(
    lookupMaps?.[key]?.map || {}
  ).length;
}

async function neprasWaitAndCaptureDeepLookups(doc, maxMs = 6500) {
  const startedAt = Date.now();
  let best = neprasCaptureDeepLookupMapsFromDoc(doc);

  while (Date.now() - startedAt < maxMs) {
    if (isScrapeCancelled) break;

    const current = neprasCaptureDeepLookupMapsFromDoc(doc);

    for (const key of [
      "religion",
      "birthGov",
      "section",
      "specialization",
      "lang1",
      "lang2"
    ]) {
      if (
        neprasDeepLookupSize(current, key) >
        neprasDeepLookupSize(best, key)
      ) {
        best[key] = current[key];
      }
    }

    // الحقول العامة التي نحتاجها لكل المراحل:
    // الديانة + اللغات. محافظة الميلاد لها fallback ثابت موثوق.
    const coreReady =
      neprasDeepLookupSize(best, "religion") >= 1 &&
      neprasDeepLookupSize(best, "lang1") >= 1 &&
      neprasDeepLookupSize(best, "lang2") >= 1;

    if (coreReady) {
      // نمنح Angular فرصة أخيرة قصيرة لتحميل section/specialization
      // في الصفوف التي تستخدمهما.
      await sleep(450);

      const finalPass =
        neprasCaptureDeepLookupMapsFromDoc(doc);

      for (const key of [
        "religion",
        "birthGov",
        "section",
        "specialization",
        "lang1",
        "lang2"
      ]) {
        if (
          neprasDeepLookupSize(finalPass, key) >
          neprasDeepLookupSize(best, key)
        ) {
          best[key] = finalPass[key];
        }
      }

      break;
    }

    await sleep(350);
  }

  return best;
}

function neprasDeepDateOnly(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : raw;
}

function neprasDeepGetSchoolRowValue(row, keys = []) {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return cleanValue(value);
    }
  }
  return "";
}


function neprasDeepDirectLabel(value) {
  const text = cleanValue(value);

  if (!text) return "";

  if (neprasDeepIsPlaceholder(text)) {
    return "";
  }

  // لو القيمة رقم فقط فهي ID وليست اسمًا.
  if (/^\d+(?:\.0+)?$/.test(text)) {
    return "";
  }

  return text;
}

function neprasDeepFirstDefined(...values) {
  for (const value of values) {
    if (
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ""
    ) {
      return value;
    }
  }

  return "";
}

function neprasBuildDeepStudentFromApi(api, schoolRow, lookups, emailInfo) {
  api = api || {};
  schoolRow = schoolRow || {};
  emailInfo = emailInfo || {};

  const fullName = cleanArabicName([
    api.firstName,
    api.fatherName,
    api.gFatherName,
    api.familyName
  ].filter(Boolean).join(" "));

  const fatherFullName = cleanArabicName([
    api.fatherName,
    api.gFatherName,
    api.familyName
  ].filter(Boolean).join(" "));

  const motherFullName = cleanArabicName([
    api.motherFirstName,
    api.motherSecondName,
    api.motherThirdName,
    api.motherForthName
  ].filter(Boolean).join(" "));

  const gender =
    neprasDeepGetSchoolRowValue(schoolRow, ["النوع"]) ||
    (typeof neprasApiSexName === "function"
      ? neprasApiSexName(api.sexId, api.nationalId)
      : (Number(api.sexId) === 1 ? "ذكر" : Number(api.sexId) === 2 ? "أنثى" : ""));

  const grade =
    neprasDeepGetSchoolRowValue(
      schoolRow,
      ["الصف"]
    );

  const eduSystem =
    neprasDeepGetSchoolRowValue(
      schoolRow,
      ["نوعية التعليم", "نظام التعليم"]
    );

  const enrollStatus =
    neprasDeepGetSchoolRowValue(
      schoolRow,
      ["حالة القيد"]
    );

  const classRoom =
    neprasDeepGetSchoolRowValue(
      schoolRow,
      ["الفصل"]
    );

  const rawSchool =
    schoolRow?.__neprasApiRaw || {};

  const damg =
    neprasDeepGetSchoolRowValue(
      schoolRow,
      ["الموقف من الدمج", "الدمج"]
    ) ||
    neprasDeepLookupText(
      lookups,
      "obstacle",
      neprasDeepFirstDefined(
        api.disabilityId,
        rawSchool.obstacleId
      ),
      ""
    );

  const nationality =
    neprasDeepGetSchoolRowValue(
      schoolRow,
      ["الجنسية"]
    ) ||
    neprasDeepLookupText(
      lookups,
      "nationality",
      neprasDeepFirstDefined(
        api.nationality,
        rawSchool.natId
      ),
      ""
    );

  // GetStudentByStudentCode uses divisionId / specializationId
  // بينما GetSchoolStudent يحمل general / special.
  // بعض البيئات ترجع general/special كـ IDs، وأخرى قد ترجع أسماء.
  // لذلك نغطي الحالتين.
  const generalId =
    neprasDeepFirstDefined(
      api.generalId,
      api.divisionId,
      rawSchool.generalId,
      rawSchool.generalCode,
      rawSchool.general
    );

  const specialId =
    neprasDeepFirstDefined(
      api.specialId,
      api.specializationId,
      rawSchool.specialId,
      rawSchool.specialCode,
      rawSchool.special
    );

  const rawSectionLabel =
    neprasDeepDirectLabel(
      rawSchool.generalName ??
      rawSchool.general
    );

  const rawSpecialLabel =
    neprasDeepDirectLabel(
      rawSchool.specialName ??
      rawSchool.special
    );

  let section =
    rawSectionLabel ||
    neprasDeepLookupText(
      lookups,
      "section",
      generalId,
      ""
    );

  let specialization =
    rawSpecialLabel ||
    neprasDeepSpecializationText(
      lookups,
      generalId,
      specialId,
      ""
    );

  // نفس منطق المحرك القديم عند غياب اسم الشعبة.
  if (!section && specialization) {
    const n = normalizeText(specialization);
    if (n.includes(normalizeText("علمي"))) section = "علمي";
    else if (n.includes(normalizeText("أدبي"))) section = "أدبي";
    else section = specialization;
  }

  return normalizeDeepStudent({
    studentCode: api.stdStudentId || neprasDeepGetSchoolRowValue(schoolRow, ["كود التلميذ", "كود الطالب"]),
    nationalId: api.nationalId || neprasDeepGetSchoolRowValue(schoolRow, ["الرقم القومي"]),
    fullName: fullName || neprasDeepGetSchoolRowValue(schoolRow, ["اسم التلميذ", "اسم الطالب"]),
    fatherFullName,
    motherFullName,
    gender,
    religion:
      neprasDeepLookupText(
        lookups,
        "religion",
        neprasDeepFirstDefined(
          api.religionId,
          rawSchool.religionId
        ),
        ""
      ),
    dob: neprasDeepDateOnly(api.birthDate),
    birthGov:
      neprasDeepLookupText(
        lookups,
        "birthGov",
        api.placeOfBirth,
        ""
      ) ||
      neprasDeepBirthGovFallback(
        api.placeOfBirth,
        api.nationalId
      ),
    address: api.address,
    phone: api.phoneNumber,
    mobile: api.mobileNumber,
    // v1.0: اسم الحقل في API الشامل غير مؤكد 100% (لم يظهر في أي استجابة رأيناها
    // حتى الآن)، لذلك نجرّب أكثر من اسم محتمل. لو ظهر عمود البريد فارغًا لكل
    // الطلاب راجع استجابة GetStudentEmailInfo في Network tab وابعت لي الاسم
    // الصحيح لأضبطه.
    email: neprasDeepFirstDefined(
      emailInfo.unifiedEmail,
      emailInfo.studentEmail,
      emailInfo.email,
      emailInfo.mail,
      api.studentEmail,
      api.unifiedEmail,
      api.email,
      api.mail
    ),
    altEmail: neprasDeepFirstDefined(
      emailInfo.altEmail,
      emailInfo.alternativeEmail,
      emailInfo.secondaryEmail,
      emailInfo.parallelEmail,
      api.altEmail,
      api.alternativeEmail,
      api.secondaryEmail,
      api.parallelEmail
    ),
    mobile2: neprasDeepFirstDefined(
      emailInfo.mobile2,
      emailInfo.secondMobile,
      emailInfo.altMobile,
      emailInfo.mobileNumber2,
      emailInfo.secondMobileNumber
    ),
    grade,
    eduSystem,
    enrollStatus,
    classRoom,
    section,
    specialization,
    lang1: (() => {
      const v = neprasDeepLookupText(
        lookups,
        "lang1",
        neprasDeepFirstDefined(
          api.firstLanguage,
          api.languageId1,
          rawSchool.lang1Id
        ),
        ""
      );
      return neprasDeepIsPlaceholder(v) ? "" : v;
    })(),
    lang2: (() => {
      const v = neprasDeepLookupText(
        lookups,
        "lang2",
        neprasDeepFirstDefined(
          api.secondLanguage,
          api.languageId2,
          rawSchool.lang2Id
        ),
        ""
      );
      return neprasDeepIsPlaceholder(v) ? "" : v;
    })(),
    damg,
    nationality:
      neprasDeepIsPlaceholder(nationality)
        ? ""
        : nationality,
    passport: api.passportId
  });
}

async function neprasDeepFetchApiBatch(items, schoolRowsByCode, lookups, onProgress, onItem) {
  const results = new Map();
  const failed = [];
  const total = items.length;
  let nextIndex = 0;
  let completed = 0;

  // قيمة محافظة نسبيًا: أسرع كثيرًا من iframe ولا تضغط السيرفر بعشرات الطلبات المتزامنة.
  const CONCURRENCY = Math.min(6, Math.max(1, total));

  async function worker() {
    while (true) {
      if (isScrapeCancelled) return;

      const index = nextIndex++;
      if (index >= total) return;

      const code = items[index];

      try {
        const api =
          typeof window.neprasApiGetStudentByCodeRetry === "function"
            ? await window.neprasApiGetStudentByCodeRetry(
                code,
                2
              )
            : await window.neprasApiGetStudentByCode(
                code
              );

        // v1.0: البريد الموحد/البديل والموبايل الثاني من Endpoint منفصل.
        // لو فشل الطلب ده لطالب معيّن، لا نوقف سحب باقي بياناته — بس
        // عمود الإيميل بيفضل فاضي له وبنسجّل تحذير في الـ console.
        let emailInfo = null;
        try {
          emailInfo =
            typeof window.neprasApiGetStudentEmailInfoRetry === "function"
              ? await window.neprasApiGetStudentEmailInfoRetry(code, 2)
              : await window.neprasApiGetStudentEmailInfo(code);
        } catch (emailError) {
          const userStoppedEmail =
            isScrapeCancelled ||
            neprasIsGlobalStopRequested() ||
            emailError?.code === "USER_STOPPED" ||
            String(emailError?.message || "").includes("USER_STOPPED");

          if (userStoppedEmail) return;

          console.warn(`Nepras email info failed for ${code}:`, emailError);
        }

        const row =
          schoolRowsByCode.get(
            String(code)
          ) || {};

        const builtItem =
          neprasBuildDeepStudentFromApi(
            api,
            row,
            lookups,
            emailInfo
          );

        results.set(
          String(code),
          builtItem
        );

        if (typeof onItem === "function") {
          onItem(builtItem, String(code));
        }
      } catch (error) {
        // v1.0: USER_STOPPED هو إيقاف طبيعي من المستخدم، وليس فشل API.
        // لا نسجله كتحذير، لا نضيف الطالب إلى failed، ولا نكمل عداد التقدم.
        const userStopped =
          isScrapeCancelled ||
          neprasIsGlobalStopRequested() ||
          error?.code === "USER_STOPPED" ||
          String(error?.message || "").includes("USER_STOPPED");

        if (userStopped) return;

        console.warn(`Nepras deep API failed for ${code}:`, error);
        failed.push(String(code));
      }

      // قد يصل أمر الإيقاف بعد نجاح الطلب مباشرة؛ لا نُظهر تقدمًا جديدًا بعد الإيقاف.
      if (isScrapeCancelled || neprasIsGlobalStopRequested()) return;

      completed++;
      if (typeof onProgress === "function") {
        onProgress(completed, total, code);
      }
    }
  }

  await Promise.all(
    Array.from({ length: CONCURRENCY }, () => worker())
  );

  return { results, failed };
}

// ============================================================
// 🔬 السحب العميق لصف
// ============================================================

async function processDeepScrapeForGrade(gradeName, options = {}) {
  const batchMode = options?.batchMode === true;
  const suppressExport = options?.suppressExport === true;
  const suppressCleanup = options?.suppressCleanup === true;

  if (currentExportRunning && !batchMode) {
    showFloatingStatus(
      "⚠️ توجد عملية تصدير تعمل بالفعل!",
      false
    );
    hideFloatingStatus(2500);
    return {
      gradeName,
      data: [],
      skipped: true,
      reason: "ANOTHER_EXPORT_RUNNING"
    };
  }

  if (!batchMode) {
    await neprasPrepareStudentCommandState(
      "deep_single_pre_run"
    );
    currentExportRunning = true;
    neprasResetGlobalStop();
    window._shouldSaveCancelledData = false;
    window._neprasCancelledDataSaved = false;
    neprasClearCancelledSaveContext();
    window._currentDeepScrapedData = [];
  }

  try {
    showFloatingStatus(`⚡ تجهيز التنزيل الشامل للصف (${gradeName})...`);

    // ========================================================
    // 1) الصف كاملًا في Request واحد: الأكواد + البيانات التي تظهر بالقائمة.
    // ========================================================
    let fastRows = [];

    if (typeof window.neprasApiTryRowsForGrade === "function") {
      const fast = await window.neprasApiTryRowsForGrade(gradeName);

      if (fast?.ok && Array.isArray(fast.rows)) {
        fastRows = fast.rows;
      } else if (fast?.authFailure) {
        showFloatingStatus(
          "❌ تعذر تجهيز جلسة API تلقائيًا. أعد تحميل صفحة بيانات التلميذ وحاول مرة أخرى.",
          false
        );
        hideFloatingStatus(4500);
        return;
      }
    }

    // fallback لجمع الأكواد فقط إذا تغيّر API.
    if (!fastRows.length) {
      const isMainReady = await goToMainSearchPage();
      if (!isMainReady) {
        showFloatingStatus("❌ تعذر الوصول لصفحة (بحث عن تلميذ)!", false);
        hideFloatingStatus(3000);
        return;
      }

      const searchRes = await selectGradeAndSearchMain(gradeName);
      if (!searchRes.success) {
        showFloatingStatus(
          searchRes.reason === "GRADE_NOT_FOUND"
            ? `⚠️ الصف (${gradeName}) غير متوفر!`
            : `❌ تعذر اختيار الصف!`,
          false
        );
        hideFloatingStatus(3500);
        return;
      }

      let fallbackCodes = [];
      let fallbackPage = 1;
      while (true) {
        if (isScrapeCancelled) break;

        const pageCodes = await collectStudentCodesFromCurrentPage();
        fallbackCodes.push(...pageCodes);

        const nextBtn = findNextPageButton();
        if (!nextBtn || isElementDisabled(nextBtn)) break;

        const firstCodeBefore = pageCodes[0] || "";
        (nextBtn.querySelector("a, button") || nextBtn).click();

        let changed = false;
        for (let wait = 0; wait < 25; wait++) {
          if (isScrapeCancelled) break;
          await sleep(400);
          const after = await collectStudentCodesFromCurrentPage();
          if (after.length && (after[0] || "") !== firstCodeBefore) {
            changed = true;
            break;
          }
        }
        if (!changed) {
          if (!isScrapeCancelled) neprasWarnListTruncated(fallbackPage);
          break;
        }
        fallbackPage++;
      }

      fastRows = [...new Set(fallbackCodes)].map(code => ({
        "كود التلميذ": code
      }));
    }

    const allStudentCodes = [...new Set(
      fastRows
        .map(row => String(row?.["كود التلميذ"] || "").replace(/\D/g, ""))
        .filter(Boolean)
    )];

    if (!allStudentCodes.length && !isScrapeCancelled) {
      showFloatingStatus(`⚠️ لم يتم العثور على أكواد للطلاب في صف (${gradeName})!`, false);
      hideFloatingStatus(3500);
      return;
    }

    const schoolRowsByCode = new Map(
      fastRows.map(row => [
        String(row?.["كود التلميذ"] || "").replace(/\D/g, ""),
        row
      ])
    );

    const deepScrapedData = [];
    const deepLiveBatchResults = new Map();

    const getDeepSnapshot = () =>
      neprasDeepDeduplicateStudents([
        ...deepScrapedData,
        ...Array.from(deepLiveBatchResults.values())
      ]);

    const syncDeepSnapshot = () => {
      const snapshot = getDeepSnapshot();
      if (batchMode) {
        window._neprasCurrentDeepGradeData = snapshot;
      } else {
        window._currentDeepScrapedData = snapshot;
      }
      return snapshot;
    };

    if (batchMode) {
      // أثناء «جميع الصفوف» يحتفظ المحرك الرئيسي بسياق الحفظ الجزئي.
      // هنا نعرض فقط بيانات الصف الجاري حتى يستطيع سياق المجموعة ضمها.
      window._neprasCurrentDeepGradeData = getDeepSnapshot();
    } else {
      neprasSetCancelledSaveContext(
        () => getDeepSnapshot(),
        generateUnifiedFilename(
          `تنزيل_شامل_جزئي_الصف_${gradeName}`
        ),
        exportDeepFormattedExcel
      );

      window._currentDeepScrapedData =
        getDeepSnapshot();
    }

    // ========================================================
    // 2) طالب واحد فقط بالطريقة القديمة:
    //    الهدف ليس السحب، بل قراءة أسماء القوائم المنسدلة (Lookups).
    // ========================================================
    const firstCode = allStudentCodes[0];

    showFloatingStatus(
      `⚙️ تهيئة أسماء الحقول مرة واحدة للصف (${gradeName})...`
    );

    // نفتح طالبًا واحدًا فقط لتهيئة قوائم Angular،
    // لكن لا نعتمد على بياناته المبكرة في التصدير.
    // في v1.0 كان أول طالب أحيانًا يُقرأ قبل اكتمال النموذج،
    // لذلك ظهر كسطر شبه فارغ في Excel.
    const firstLegacyDetails =
      await fetchStudentDetailsViaIframe(
        firstCode
      );

    let lookupMaps = {};

    try {
      const iframe =
        document.getElementById(
          "neprasScrapeIframe"
        );

      const iframeDoc =
        iframe?.contentDocument ||
        iframe?.contentWindow?.document;

      if (iframeDoc) {
        lookupMaps =
          await neprasWaitAndCaptureDeepLookups(
            iframeDoc,
            6500
          );
      }
    } catch (error) {
      console.warn(
        "Nepras lookup hydration:",
        error
      );
    }

    // الطالب الأول أيضًا من API حتى يكون كل الصف بنفس المصدر والدقة.
    try {
      const firstApi =
        typeof window.neprasApiGetStudentByCodeRetry === "function"
          ? await window.neprasApiGetStudentByCodeRetry(
              firstCode,
              2
            )
          : await window.neprasApiGetStudentByCode(
              firstCode
            );

      // v1.0:
      // الشعبة والتخصص لا نعتمد فيهما على iframe.
      // نستخدم نفس Endpoints التي يستخدمها الموقع:
      // General?stageCode=...&AcdCode=...
      // Special?stageCode=...&AcdCode=...&GeneralCode=...
      //
      // من الاختبار الحقيقي للصف الأول الثانوي:
      // generalId=1 => "عام"
      // specialId=1 => "عام"
      try {
        if (
          typeof window.neprasApiGetGeneralSpecialLookups ===
          "function"
        ) {
          const acdCode =
            String(
              firstApi?.acdYearCode ||
              (
                typeof window.neprasApiResolveGradeCode ===
                "function"
                  ? window.neprasApiResolveGradeCode(
                      gradeName
                    )
                  : ""
              ) ||
              ""
            ).trim();

          if (acdCode) {
            const apiGeneralSpecial =
              await window.neprasApiGetGeneralSpecialLookups(
                acdCode
              );

            lookupMaps =
              neprasMergeGeneralSpecialLookups(
                lookupMaps,
                apiGeneralSpecial
              );

            console.log(
              "✅ Nepras General/Special API:",
              {
                stageCode:
                  apiGeneralSpecial?.stageCode ||
                  "",
                acdCode,
                generalCount:
                  Object.keys(
                    apiGeneralSpecial?.section?.map ||
                    {}
                  ).length,
                specialCount:
                  Object.values(
                    apiGeneralSpecial?.specializationByGeneral ||
                    {}
                  ).reduce(
                    (sum, group) =>
                      sum +
                      Object.keys(
                        group || {}
                      ).length,
                    0
                  ),
                generalSample:
                  Object.entries(
                    apiGeneralSpecial?.section?.map ||
                    {}
                  ).slice(0, 5),
                specialSample:
                  Object.entries(
                    apiGeneralSpecial?.specialization?.map ||
                    {}
                  ).slice(0, 5)
              }
            );
          }
        }
      } catch (lookupError) {
        console.warn(
          "Nepras General/Special lookup fallback to iframe:",
          lookupError
        );
      }

      // v1.0: بقية القوائم المرجعية من نفس API الخاص بنموذج الطالب.
      // لو أي Endpoint تغيّر، iframe الموجود بالفعل يظل fallback.
      try {
        if (
          typeof window.neprasApiGetStaticDeepLookups ===
          "function"
        ) {
          const staticLookups =
            await window.neprasApiGetStaticDeepLookups();

          lookupMaps =
            neprasMergeStaticDeepLookups(
              lookupMaps,
              staticLookups
            );

          console.log(
            "✅ Nepras Static Deep Lookups:",
            staticLookups?.diagnostics || {}
          );
        }
      } catch (staticLookupError) {
        console.warn(
          "Nepras static lookup fallback to iframe:",
          staticLookupError
        );
      }

      const firstSchoolRow =
        schoolRowsByCode.get(
          String(firstCode)
        ) || {};

      let firstEmailInfo = null;
      try {
        firstEmailInfo =
          typeof window.neprasApiGetStudentEmailInfoRetry === "function"
            ? await window.neprasApiGetStudentEmailInfoRetry(firstCode, 2)
            : await window.neprasApiGetStudentEmailInfo(firstCode);
      } catch (firstEmailError) {
        console.warn(
          "Nepras email info failed for first student:",
          firstEmailError
        );
      }

      deepScrapedData.push(
        neprasBuildDeepStudentFromApi(
          firstApi,
          firstSchoolRow,
          lookupMaps,
          firstEmailInfo
        )
      );
    } catch (firstApiError) {
      if (
        isScrapeCancelled ||
        neprasIsGlobalStopRequested() ||
        firstApiError?.code === "USER_STOPPED" ||
        String(firstApiError?.message || "").includes("USER_STOPPED")
      ) {
        return {
          gradeName,
          data: deepScrapedData,
          cancelled: true
        };
      }

      console.warn(
        "Nepras deep student fallback:",
        firstApiError
      );

      firstLegacyDetails.studentCode =
        firstLegacyDetails.studentCode ||
        firstCode;

      // لو extractor القديم لم يقرأ محافظة الميلاد،
      // نحاول اشتقاقها من الرقم القومي.
      if (!firstLegacyDetails.birthGov) {
        firstLegacyDetails.birthGov =
          neprasDeepBirthGovFallback(
            "",
            firstLegacyDetails.nationalId
          );
      }

      deepScrapedData.push(
        normalizeDeepStudent(
          firstLegacyDetails
        )
      );
    }

    syncDeepSnapshot();
    showDeepProgressStatus(
      "جاري التنزيل الشامل",
      deepScrapedData.length,
      allStudentCodes.length,
      `الصف: ${gradeName}`
    );

    if (isScrapeCancelled) {
      syncDeepSnapshot();
    } else {
      // ======================================================
      // 3) بقية الصف API مباشر — 6 طلبات متوازية محسوبة.
      // ======================================================
      const remainingCodes =
        allStudentCodes.slice(1);

      const batch = await neprasDeepFetchApiBatch(
        remainingCodes,
        schoolRowsByCode,
        lookupMaps,
        (completed, total, code) => {
          showDeepProgressStatus(
            "جاري التنزيل الشامل",
            completed + 1,
            total + 1,
            `الصف: ${gradeName} — كود الطالب: ${code}`
          );
        },
        (item, code) => {
          if (item) {
            deepLiveBatchResults.set(String(code), item);
            syncDeepSnapshot();
          }
        }
      );

      for (const code of remainingCodes) {
        const item = batch.results.get(String(code));
        if (item) deepScrapedData.push(item);
      }
      deepLiveBatchResults.clear();
      syncDeepSnapshot();

      // ======================================================
      // 4) الطلاب المتعثرين في API: استكمال فوري من بيانات الجدول التي تم سحبها مسبقاً
      //    (يمنع تجميد المتصفح وساعات الانتظار في iframe)
      // ======================================================
      if (!isScrapeCancelled && batch.failed.length) {
        showFloatingStatus(
          `⚡ جاري استكمال ${batch.failed.length} طالب فورياً من بيانات الجدول...`
        );

        for (const code of batch.failed) {
          const row = schoolRowsByCode.get(String(code)) || {};
          const fallbackStudent = {
            studentCode: code,
            studentName: row["اسم الطالب"] || row.name || "",
            nationalId: row["الرقم القومي"] || row.nationalId || "",
            grade: row["الصف"] || gradeName,
            className: row["الفصل"] || row.className || "",
            gender: row["النوع"] || row.gender || "",
            religion: row["الديانة"] || row.religion || "",
            dob: row["تاريخ الميلاد"] || row.dob || "",
            status: row["حالة القيد"] || row.status || "مقيد",
            studyType: row["نوع التعليم"] || row.studyType || "رسمي",
            address: row["العنوان"] || "",
            motherName: row["اسم الأم"] || "",
            phone: row["تليفون الطالب"] || row["محمول"] || row.phone || "",
            fatherNationalId: ""
          };
          deepScrapedData.push(normalizeDeepStudent(fallbackStudent));
        }
        syncDeepSnapshot();
      }
    }

    syncDeepSnapshot();

    if (isScrapeCancelled) {
      if (!suppressExport) {
        const stoppedSnapshot = getDeepSnapshot();
        if (window._neprasCancelledDataSaved) {
          showFloatingStatus(
            `🛑 تم الإيقاف وحفظ البيانات التي اكتمل تنزيلها حتى لحظة الإيقاف — ${stoppedSnapshot.length} طالب`,
            true
          );
        } else if (
          window._shouldSaveCancelledData &&
          stoppedSnapshot.length > 0
        ) {
          exportDeepFormattedExcel(
            stoppedSnapshot,
            generateUnifiedFilename(
              `تنزيل_شامل_جزئي_الصف_${gradeName}`
            )
          );

          window._neprasCancelledDataSaved = true;

          showFloatingStatus(
            `🎉 تم حفظ البيانات التي تم تنزيلها حتى لحظة الإيقاف! عدد الطلاب: ${stoppedSnapshot.length}`,
            true
          );
        } else {
          showFloatingStatus(
            "🛑 تم إيقاف العملية ولم توجد بيانات مكتملة للحفظ حتى هذه اللحظة.",
            false
          );
        }

        hideFloatingStatus(3500);
      }

      return {
        gradeName,
        data: deepScrapedData,
        cancelled: true
      };
    }

    if (deepScrapedData.length) {
      // فحص جودة سريع قبل التصدير.
      const quality = {
        birthGovMissing: 0,
        coreIdentityMissing: 0,
        addressMissing: 0,
        contactMissing: 0,
        sectionMissing: 0,
        specializationMissing: 0,

        // الأهم: حقول كان لها ID في المصدر لكن الاسم لم يتحول.
        mappingExpectedMissing: {
          religion: 0,
          lang1: 0,
          lang2: 0,
          section: 0,
          specialization: 0,
          birthGov: 0,
          nationality: 0,
          obstacle: 0
        }
      };

      for (const student of deepScrapedData) {
        const st = normalizeDeepStudent(student);

        if (!st.birthGov) {
          quality.birthGovMissing++;
        }

        if (
          !st.nationalId ||
          !st.fullName ||
          !st.gender ||
          !st.dob
        ) {
          quality.coreIdentityMissing++;
        }

        if (!st.address) {
          quality.addressMissing++;
        }

        if (!st.phone && !st.mobile) {
          quality.contactMissing++;
        }

        if (!st.section) {
          quality.sectionMissing++;
        }

        if (!st.specialization) {
          quality.specializationMissing++;
        }

        const sourceRow =
          schoolRowsByCode.get(
            String(st.studentCode || "")
          ) || {};

        const raw =
          sourceRow?.__neprasApiRaw || {};

        if (
          !st.birthGov &&
          (
            neprasDeepExpectedId(raw?.placeOfBirth) ||
            String(st.nationalId || "").replace(/\D/g, "").length === 14
          )
        ) {
          quality.mappingExpectedMissing.birthGov++;
        }

        if (
          !st.religion &&
          neprasDeepExpectedId(
            raw?.religionId
          )
        ) {
          quality.mappingExpectedMissing.religion++;
        }

        if (
          !st.lang1 &&
          neprasDeepExpectedId(
            raw?.lang1Id
          )
        ) {
          quality.mappingExpectedMissing.lang1++;
        }

        if (
          !st.lang2 &&
          neprasDeepExpectedId(
            raw?.lang2Id
          )
        ) {
          quality.mappingExpectedMissing.lang2++;
        }

        if (
          !st.section &&
          neprasDeepExpectedId(
            raw?.general
          )
        ) {
          quality.mappingExpectedMissing.section++;
        }

        if (
          !st.specialization &&
          neprasDeepExpectedId(
            raw?.special
          )
        ) {
          quality.mappingExpectedMissing.specialization++;
        }

        if (
          !st.nationality &&
          neprasDeepExpectedId(
            raw?.natId
          )
        ) {
          quality.mappingExpectedMissing.nationality++;
        }

        if (
          !st.damg &&
          neprasDeepExpectedId(
            raw?.obstacleId
          )
        ) {
          quality.mappingExpectedMissing.obstacle++;
        }
      }

      const mappingMissTotal =
        Object.values(
          quality.mappingExpectedMissing
        ).reduce(
          (sum, value) =>
            sum + Number(value || 0),
          0
        );

      console.log(
        "✅ Nepras Deep Quality:",
        {
          ...quality,
          mappingMissTotal
        }
      );

      if (!suppressExport) {
        exportDeepFormattedExcel(
          deepScrapedData,
          generateUnifiedFilename(
            `تنزيل_شامل_بيانات_الصف_${gradeName}`
          )
        );

        showFloatingStatus(
          mappingMissTotal === 0
            ? `🎉 تم التنزيل الشامل بنجاح! ${deepScrapedData.length} طالب — اكتمال الحقول المرجعية 100%`
            : `✅ تم التنزيل الشامل: ${deepScrapedData.length} طالب — تنبيه: ${mappingMissTotal} قيمة مرجعية تحتاج مراجعة`,
          mappingMissTotal === 0
        );

        hideFloatingStatus(3500);
      }

      return {
        gradeName,
        data: deepScrapedData,
        cancelled: false,
        quality,
        mappingMissTotal
      };
    } else {
      if (!suppressExport) {
        showFloatingStatus(
          "⚠️ لم يتم تنزيل أي بيانات!",
          false
        );
        hideFloatingStatus(3500);
      }

      return {
        gradeName,
        data: [],
        cancelled: false,
        empty: true
      };
    }
  } finally {
    if (batchMode) {
      window._neprasCurrentDeepGradeData = [];
    }

    if (!batchMode) {
      currentExportRunning = false;
    }

    if (!suppressCleanup) {
      await neprasCleanupStudentCommandState(
        isScrapeCancelled
          ? "stopped"
          : "finished"
      );

      neprasResetLocalCommandArtifacts();
    }
  }
}


// ============================================================
// 🚀 السحب العميق لجميع الصفوف — ملف Excel واحد
// ============================================================

function neprasDeepDeduplicateStudents(rows) {
  const output = [];
  const seen = new Set();

  for (const row of rows || []) {
    const st = normalizeDeepStudent(row);

    const key =
      String(st.studentCode || "").trim() ||
      String(st.nationalId || "").trim() ||
      `${st.fullName}|${st.dob}`;

    if (!key || !seen.has(key)) {
      if (key) seen.add(key);
      output.push(st);
    }
  }

  return output;
}

async function processDeepScrapeAllGrades() {
  if (!NEPRAS_SELECTED_STAGE) {
    showFloatingStatus(
      "⚠️ اختر المرحلة الدراسية أولًا.",
      false
    );
    hideFloatingStatus(3000);
    return;
  }

  if (currentExportRunning) {
    showFloatingStatus(
      "⚠️ توجد عملية أخرى قيد التنفيذ!",
      false
    );
    hideFloatingStatus(2500);
    return;
  }

  await neprasPrepareStudentCommandState(
    "deep_all_pre_run"
  );

  const grades =
    typeof neprasGetStageGradesForToolbar === "function"
      ? neprasGetStageGradesForToolbar()
      : [];

  if (!grades.length) {
    showFloatingStatus(
      "⚠️ لم يتم التعرف على صفوف المرحلة المختارة.",
      false
    );
    hideFloatingStatus(3500);
    return;
  }

  currentExportRunning = true;
  neprasResetGlobalStop();
  window._shouldSaveCancelledData = false;
  window._neprasCancelledDataSaved = false;
  window._neprasCurrentDeepGradeData = [];

  let allDeepData = [];
  const gradeSummary = [];

  // عند الإيقاف: ملف جزئي واحد يضم الصفوف المكتملة
  // + ما تم سحبه من الصف الجاري حتى لحظة الإيقاف.
  neprasSetCancelledSaveContext(
    () => {
      const current =
        Array.isArray(
          window._neprasCurrentDeepGradeData
        )
          ? window._neprasCurrentDeepGradeData
          : [];

      return neprasDeepDeduplicateStudents([
        ...allDeepData,
        ...current
      ]);
    },
    generateUnifiedFilename(
      "تنزيل_شامل_جزئي_جميع_الصفوف"
    ),
    exportDeepFormattedExcel
  );

  try {
    for (
      let index = 0;
      index < grades.length;
      index++
    ) {
      if (isScrapeCancelled) break;

      const grade = grades[index] || {};
      const gradeName =
        String(
          grade.name ||
          grade.label ||
          ""
        ).trim();

      if (!gradeName) continue;

      showFloatingStatus(
        `🚀 التنزيل الشامل لجميع الصفوف — ${gradeName} (${index + 1}/${grades.length})`
      );

      const result =
        await processDeepScrapeForGrade(
          gradeName,
          {
            batchMode: true,
            suppressExport: true,
            suppressCleanup: true
          }
        );

      const gradeData =
        Array.isArray(result?.data)
          ? result.data
          : [];

      if (gradeData.length) {
        allDeepData =
          neprasDeepDeduplicateStudents([
            ...allDeepData,
            ...gradeData
          ]);
      }

      gradeSummary.push({
        grade: gradeName,
        count: gradeData.length,
        cancelled:
          result?.cancelled === true,
        mappingMissTotal:
          Number(
            result?.mappingMissTotal || 0
          )
      });

      if (result?.cancelled) {
        break;
      }

      // انتهى الصف؛ لا نريد أن يدخل مرتين في سياق الحفظ الجزئي.
      window._neprasCurrentDeepGradeData = [];
    }

    allDeepData =
      neprasDeepDeduplicateStudents(
        allDeepData
      );

    if (isScrapeCancelled) {
      const currentGradeSnapshot =
        Array.isArray(window._neprasCurrentDeepGradeData)
          ? window._neprasCurrentDeepGradeData
          : [];
      const stoppedAllSnapshot = neprasDeepDeduplicateStudents([
        ...allDeepData,
        ...currentGradeSnapshot
      ]);

      if (window._neprasCancelledDataSaved) {
        showFloatingStatus(
          `🛑 تم الإيقاف وحفظ البيانات التي اكتمل تنزيلها حتى لحظة الإيقاف — ${stoppedAllSnapshot.length} طالب`,
          true
        );
      } else if (
        window._shouldSaveCancelledData &&
        stoppedAllSnapshot.length
      ) {
        exportDeepFormattedExcel(
          stoppedAllSnapshot,
          generateUnifiedFilename(
            "تنزيل_شامل_جزئي_جميع_الصفوف"
          )
        );

        window._neprasCancelledDataSaved = true;

        showFloatingStatus(
          `🎉 تم حفظ ملف واحد بالبيانات التي تم تنزيلها حتى لحظة الإيقاف — ${stoppedAllSnapshot.length} طالب`,
          true
        );
      } else {
        showFloatingStatus(
          "🛑 تم إيقاف التنزيل الشامل لجميع الصفوف ولم توجد بيانات مكتملة للحفظ حتى هذه اللحظة.",
          false
        );
      }

      hideFloatingStatus(4000);

      return {
        data: allDeepData,
        cancelled: true,
        grades: gradeSummary
      };
    }

    if (!allDeepData.length) {
      showFloatingStatus(
        "⚠️ لم يتم تنزيل أي بيانات من الصفوف.",
        false
      );
      hideFloatingStatus(3500);

      return {
        data: [],
        cancelled: false,
        grades: gradeSummary
      };
    }

    const totalMappingMisses =
      gradeSummary.reduce(
        (sum, item) =>
          sum +
          Number(
            item.mappingMissTotal || 0
          ),
        0
      );

    // الملف الوحيد النهائي لجميع الصفوف.
    exportDeepFormattedExcel(
      allDeepData,
      generateUnifiedFilename(
        "تنزيل_شامل_بيانات_جميع_الصفوف"
      )
    );

    showFloatingStatus(
      totalMappingMisses === 0
        ? `🎉 تم التنزيل الشامل لجميع الصفوف في ملف Excel واحد — ${allDeepData.length} طالب`
        : `✅ تم جمع جميع الصفوف في ملف واحد — ${allDeepData.length} طالب — تنبيه: ${totalMappingMisses} قيمة مرجعية تحتاج مراجعة`,
      totalMappingMisses === 0
    );

    hideFloatingStatus(4500);

    return {
      data: allDeepData,
      cancelled: false,
      grades: gradeSummary,
      totalMappingMisses
    };
  } finally {
    currentExportRunning = false;
    window._neprasCurrentDeepGradeData = [];

    await neprasCleanupStudentCommandState(
      isScrapeCancelled
        ? "stopped"
        : "finished"
    );

    neprasResetLocalCommandArtifacts();
  }
}

// ============================================================
// 🧹 توحيد الطالب في الـ24 حقل
// ============================================================


const NEPRAS_LANGUAGE_AR_MAP = Object.freeze({
  "english": "الإنجليزية",
  "french": "الفرنسية",
  "german": "الألمانية",
  "italian": "الإيطالية",
  "spanish": "الإسبانية",
  "arabic": "العربية",
  "russian": "الروسية",
  "turkish": "التركية",
  "chinese": "الصينية",
  "japanese": "اليابانية",
  "portuguese": "البرتغالية",
  "greek": "اليونانية",
  "latin": "اللاتينية"
});

function neprasArabicLanguageName(value) {
  const text = cleanValue(value);
  if (!text) return "";

  // منع أي كلمات إنجليزية واستبدال الإعفاء بالمسمى العربي الرسمي "معفى"
  if (/^(not\s*allowed|not_allowed|notallowed|none|n\/?a|معف[ىي]|غير\s*مسموح|لا\s*يوجد)$/i.test(text.trim())) {
    return "معفى";
  }

  // لو الاسم عربي بالفعل نحتفظ به كما هو.
  if (/[\u0600-\u06FF]/.test(text)) {
    return text;
  }

  const key = text
    .toLowerCase()
    .replace(/\blanguage\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return NEPRAS_LANGUAGE_AR_MAP[key] || text;
}

function normalizeDeepStudent(st) {
  st = st || {};

  return {
    studentCode: cleanValue(st.studentCode),
    nationalId: cleanValue(st.nationalId),
    fullName: cleanValue(st.fullName),
    fatherFullName: cleanValue(st.fatherFullName),
    motherFullName: cleanValue(st.motherFullName),
    gender: cleanValue(st.gender),
    religion: cleanValue(st.religion),
    dob: cleanValue(st.dob),
    birthGov: cleanValue(st.birthGov),
    address: cleanValue(st.address),
    phone: cleanValue(st.phone),
    mobile: cleanValue(st.mobile),
    email: cleanValue(st.email),
    altEmail: cleanValue(st.altEmail),
    mobile2: cleanValue(st.mobile2),
    grade: cleanValue(st.grade),
    eduSystem: cleanValue(st.eduSystem),
    enrollStatus: cleanValue(st.enrollStatus),
    classRoom: cleanValue(st.classRoom),
    section: cleanValue(st.section),
    specialization: cleanValue(st.specialization),
    lang1: neprasArabicLanguageName(st.lang1),
    lang2: neprasArabicLanguageName(st.lang2),
    damg: cleanValue(st.damg),
    nationality: cleanValue(st.nationality),
    passport: cleanValue(st.passport)
  };
}

// ============================================================
// 📊 تحويل إلى 24 عمود
// ============================================================

function convertDeepDataToRows(dataList) {
  return dataList.map((st, index) => {
    st = normalizeDeepStudent(st);

    return [
      String(index + 1),
      st.studentCode,
      st.nationalId,
      st.fullName,
      st.fatherFullName,
      st.motherFullName,
      st.gender,
      st.religion,
      st.dob,
      st.birthGov,
      st.address,
      st.phone,
      st.mobile,
      st.email,
      st.altEmail,
      st.mobile2,
      st.grade,
      st.eduSystem,
      st.enrollStatus,
      st.classRoom,
      st.section,
      st.specialization,
      st.lang1,
      st.lang2,
      st.damg,
      st.nationality,
      st.passport
    ];
  });
}

// ============================================================
// 📗 إنشاء Workbook احترافي ملون ومحدد (XLSX) مع ضبط الاتجاه RTL والخط Cairo
// ============================================================

// ZIP/XLSX writing (CRC32, zip container, XML escaping, column letters, cells, table styles,
// table sheet, package assembly) lives in modules/xlsx_writer.js, shared with content.js and
// modules/attendance.js. This file only describes the student data: widths, titles, sheet naming.
function neprasStudentWidth(headers, rows, c) {
  const header = String(headers[c] ?? "").trim();
  let max = Math.max(12, header.length + 4);
  for (let r = 0; r < Math.min(rows.length, 500); r++) {
    const value = String(rows[r]?.[c] ?? "").replace(/[\r\n]+/g, " ").trim();
    max = Math.max(max, value.length + 2);
  }

  // v1.0: all exported tables use a single-line body row.  Text-heavy
  // columns are wider, while shrinkToFit guarantees the complete value stays
  // inside the cell without increasing row height.
  if (neprasXlsxIsNationalIdHeader(header)) return 22;
  if (/اسم التلميذ|اسم الطالب|اسم العامل|الاسم الكامل/.test(header)) return Math.min(48, Math.max(30, max));
  if (/نوع الإعفاء/.test(header)) return Math.min(60, Math.max(42, max));
  if (/الحالة المالية/.test(header)) return Math.min(34, Math.max(24, max));
  if (/المدرسة|الجهة/.test(header)) return Math.min(48, Math.max(26, max));
  if (/الإدارة/.test(header)) return Math.min(34, Math.max(20, max));
  if (/المديرية/.test(header)) return Math.min(30, Math.max(18, max));
  if (/كود التلميذ|كود الطالب/.test(header)) return 18;
  if (/الصف|الفصل|النوع|منازل|مسدد|نسبة|م$/.test(header)) return Math.min(18, Math.max(12, max));
  if (/البيان|الملاحظات|ملاحظات|العنوان|الوظيفة|المؤهل|التخصص|المادة|سبب|الحالة/.test(header)) {
    return Math.min(60, Math.max(28, max));
  }

  return Math.min(c === 0 ? 18 : 44, Math.max(12, max));
}

function neprasStudentCleanTitle(title) {
  const clean = String(title || "")
    .trim()
    .replace(/^نبراس\s*[—\-:|]\s*/i, "")
    .trim();
  return clean || "بيانات";
}

function neprasStudentCountLabel(title) {
  const t = normalizeText(String(title || ""));
  if (/طالب|تلميذ|الطلاب|التلاميذ|مسدد|اعفاء|إعفاء|مصروف/.test(t)) return "عدد الطلاب";
  if (/عامل|موظف|معلم/.test(t)) return "عدد العاملين";
  if (/فصل/.test(t) && !/طالب|تلميذ/.test(t)) return "عدد السجلات";
  return "عدد السجلات";
}

function neprasStudentBuildXlsx(headers, dataRows, title) {
  return neprasXlsxBuildPackage({
    sheets: [{ name: "بيانات الطلاب", xml: neprasStudentBuildSheetXml(headers, dataRows, title, true) }],
    stylesXml: NEPRAS_XLSX_TABLE_STYLES
  });
}

function neprasStudentBuildSheetXml(
  headers,
  dataRows,
  title,
  isSelected = false,
  recordCount = null,
  countLabel = null,
  options = null
) {
  // v1.2.25: options اختياري ولا يغيّر المخرجات القديمة عند غيابه:
  //   infoLines: أسطر معلومات (محافظة/مديرية/إدارة/مدرسة) تُدرج بين العنوان وسطر العدد
  //   rightAlignCols: أرقام أعمدة تُحاذى لليمين بدل قاعدة (العمود 1 و3) الافتراضية
  //   printFit: إعداد طباعة A4 طولي بعرض صفحة واحدة
  // 1.2.90: التخطيط نفسه صار في neprasXlsxBuildTableSheetXml (xlsx_writer.js)، وهنا بيانات الطلاب فقط.
  const infoLines = Array.isArray(options?.infoLines)
    ? options.infoLines.map(v => String(v ?? "")).filter(v => v.trim())
    : [];
  // خطأ قديم: Number(null) === 0 فكان أي ورقة بلا recordCount صريح (إحصاء المدرسة التفصيلي، المصروفات) تُكتب «العدد: 0».
  const hasCount = recordCount !== null && recordCount !== undefined && recordCount !== "" && Number.isFinite(Number(recordCount));
  const effectiveCount = hasCount ? Number(recordCount) : dataRows.length;
  const effectiveLabel = String(countLabel || neprasStudentCountLabel(title));
  return neprasXlsxBuildTableSheetXml({
    headers,
    rows: dataRows,
    title: neprasStudentCleanTitle(title),
    infoLines,
    countLine: `${effectiveLabel}: ${effectiveCount} — تاريخ ووقت التصدير: ${getCurrentFormattedDateTime()}`,
    widths: headers.map((_, c) => neprasStudentWidth(headers, dataRows, c)),
    rightAlignCols: Array.isArray(options?.rightAlignCols) ? options.rightAlignCols : [1, 3],
    numericCols: Array.isArray(options?.numericCols) ? options.numericCols : [],
    selected: isSelected,
    printFit: options?.printFit === true,
    orientation: options?.orientation || "",
    footerSigners: Array.isArray(options?.footerSigners) ? options.footerSigners : null
  });
}

function neprasStudentBuildMultiSheetXlsx(sheetSpecs) {
  const usedNames =
    new Set();

  const sheets =
    (Array.isArray(sheetSpecs)
      ? sheetSpecs
      : []
    )
      .filter(
        spec =>
          Array.isArray(spec?.headers) &&
          spec.headers.length
      )
      .map(
        (spec, index) => ({
          name:
            neprasXlsxSafeSheetName(
              spec.name ||
              `بيانات ${index + 1}`,
              usedNames
            ),
          headers:
            spec.headers,
          rows:
            Array.isArray(spec.rows)
              ? spec.rows
              : [],
          title:
            spec.title ||
            spec.name ||
            `بيانات ${index + 1}`,
          recordCount:
            Number.isFinite(Number(spec.recordCount)) ? Number(spec.recordCount) : null,
          countLabel:
            spec.countLabel || null,
          repeatRows:
            spec.repeatRows || null,
          options:
            (Array.isArray(spec.infoLines) || Array.isArray(spec.rightAlignCols) || Array.isArray(spec.numericCols) || Array.isArray(spec.footerSigners) || spec.orientation || spec.printFit === true)
              ? {
                  infoLines: spec.infoLines,
                  rightAlignCols: spec.rightAlignCols,
                  numericCols: spec.numericCols,
                  footerSigners: spec.footerSigners,
                  orientation: spec.orientation,
                  printFit: spec.printFit === true
                }
              : null
        })
      );

  if (!sheets.length) {
    throw new Error(
      "لا توجد صفحات Excel لإنشائها."
    );
  }

  return neprasXlsxBuildPackage({
    sheets: sheets.map((sheet, i) => ({
      name: sheet.name,
      repeatRows: sheet.repeatRows || (sheet.options?.printFit ? "1:4" : null),
      xml: neprasStudentBuildSheetXml(
        sheet.headers,
        sheet.rows,
        sheet.title,
        i === 0,
        sheet.recordCount,
        sheet.countLabel,
        sheet.options
      )
    })),
    stylesXml: NEPRAS_XLSX_TABLE_STYLES,
    activeTab: true
  });
}


function createRealWorkbook(headers, dataRows, title) {
  return { __neprasStudentXlsxBytes: neprasStudentBuildXlsx(headers, dataRows, title) };
}

// ============================================================
// 💾 تصدير XLSX حقيقي - محرك نبراس المنسق
// ============================================================
async function downloadWorkbook(workbook, fileName, folder = "تصدير الطلاب") {
  const cleanFileName = String(fileName).replace(/[/\\?%*:|"<>]/g, "_").trim();
  if (!workbook?.__neprasStudentXlsxBytes) throw new Error("لم يتم إنشاء ملف Excel بالشكل المتوقع.");
  const blob = new Blob([workbook.__neprasStudentXlsxBytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const rawFileName = `${cleanFileName}.xlsx`;
  if (window.neprasDialog?.triggerDownload) {
    await window.neprasDialog.triggerDownload(blob, rawFileName, {
      title: "تم إنشاء ملف Excel بنجاح",
      message: `تم حفظ الملف بنجاح.`,
      folder
    });
  } else {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = rawFileName; a.style.display = "none";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 15000);
  }
}

// ============================================================
// 📗 تصدير الـ24 حقل
// ============================================================

function exportDeepFormattedExcel(dataList, fileName) {
  if (!dataList || !dataList.length) {
    showFloatingStatus("⚠️ لا توجد بيانات لتصديرها!", false);
    hideFloatingStatus(3000);
    return;
  }

  try {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.set({ neprasCachedStudentsList: dataList }).catch(() => {});
      }
      if (typeof window !== 'undefined') {
        window.neprasCachedStudentsList = dataList;
      }
      if (globalThis.NeprasSchoolManager) {
        (async () => {
          try {
            const activeCode = await globalThis.NeprasSchoolManager.getActiveCode();
            if (activeCode) {
              const existing = (await globalThis.NeprasSchoolManager.loadSchoolStats(activeCode)) || {};
              await globalThis.NeprasSchoolManager.saveSchoolStats(
                activeCode,
                existing.stats || {},
                dataList
              );
            }
          } catch (_) {}
        })();
      }
    } catch (_) {}
    const rows = convertDeepDataToRows(dataList);
    const workbook = createRealWorkbook(DEEP_HEADERS, rows, fileName);
    downloadWorkbook(workbook, fileName, "تصدير بيانات الطلاب");
  } catch (error) {
    console.error("خطأ في تصدير XLSX:", error);
    showFloatingStatus(`❌ حدث خطأ أثناء إنشاء ملف Excel: ${error.message}`, false);
    hideFloatingStatus(5000);
  }
}

// ============================================================
// 📋 استخراج صفوف الجدول الحالي
// ============================================================

function scrapeCurrentPageRows(table) {
  if (!table) return [];

  const headerEls = Array.from(table.querySelectorAll("thead th"));
  if (!headerEls.length) return [];

  const bodyRows = Array.from(table.querySelectorAll("tbody tr"));

  // نحتفظ بالنص الحقيقي للهيدر قبل إنشاء اسم احتياطي مثل عمود_7
  // حتى نستطيع اكتشاف أعمدة الموقع الفارغة/الإجرائية وحذفها من Excel.
  const headerInfo = headerEls.map((th, idx) => {
    const raw = cleanValue(th.innerText || th.textContent || "");
    return {
      raw,
      title: raw || `عمود_${idx + 1}`,
      normalized: normalizeText(raw)
    };
  });

  function isActionText(value) {
    const t = normalizeText(value || "");
    if (!t) return false;

    return (
      t === "تعديل" ||
      t === "حذف" ||
      t === "عرض" ||
      t === "اختيار" ||
      t === "اجراء" ||
      t === "اجراءات" ||
      t === "الاجراء" ||
      t === "الاجراءات" ||
      t === "عمليات" ||
      t.includes("تعديل") ||
      t.includes("حذف") ||
      t.includes("اجراء") ||
      t.includes("اختيار")
    );
  }

  function trailingColumnIsUnwanted(colIndex) {
    const info = headerInfo[colIndex];
    if (!info) return false;

    const headerLooksUnwanted =
      !info.raw ||
      /^عمود[_\s-]*\d+$/i.test(info.title) ||
      isActionText(info.raw);

    // لا نحذف عمودًا له عنوان حقيقي مهم.
    if (!headerLooksUnwanted) return false;

    let hasMeaningfulData = false;

    for (const tr of bodyRows) {
      const cells = Array.from(tr.querySelectorAll("td"));
      const td = cells[colIndex];
      if (!td) continue;

      const value = cleanValue(td.innerText || td.textContent || "");

      // أزرار/روابط تعديل وحذف ليست بيانات تصدير.
      const hasActionControl = !!td.querySelector(
        "button, a.btn, a[role='button'], input[type='button'], input[type='submit']"
      );

      if (!value) continue;
      if (isActionText(value)) continue;
      if (hasActionControl && isActionText(value)) continue;

      hasMeaningfulData = true;
      break;
    }

    return !hasMeaningfulData;
  }

  // نحذف فقط الأعمدة غير المرغوبة من نهاية الجدول.
  // هذا يعالج:
  // - طلبات النقل: عمود_7 الفارغ
  // - السحب العادي للطلاب: عمود_9 الذي يحتوي «تعديل»
  let exportColumnCount = headerInfo.length;

  while (
    exportColumnCount > 0 &&
    trailingColumnIsUnwanted(exportColumnCount - 1)
  ) {
    exportColumnCount--;
  }

  const headers = headerInfo
    .slice(0, exportColumnCount)
    .map(info => info.title);

  if (!headers.length) return [];

  const rowsData = [];

  bodyRows.forEach(tr => {
    const cells = Array.from(tr.querySelectorAll("td"));
    if (!cells.length) return;

    const validCells = cells.slice(0, headers.length);
    const rowObj = {};

    validCells.forEach((td, idx) => {
      const key = headers[idx] || `عمود_${idx + 1}`;
      rowObj[key] = cleanValue(td.innerText || td.textContent || "");
    });

    if (Object.values(rowObj).some(value => value !== "")) {
      rowsData.push(rowObj);
    }
  });

  return rowsData;
}

// ============================================================
// 📚 سحب كل صفحات الجدول
// ============================================================

async function scrapeFullTable(preferredSelector) {
  let table = null;

  for (let i = 0; i < 30; i++) {
    if (isScrapeCancelled) return [];
    await sleep(400);

    if (preferredSelector) {
      table = document.querySelector(preferredSelector);
    }

    if (!table) {
      table = document.querySelector(
        "ngb-modal-window table, app-list-of-students table, app-transfer-request table, table"
      );
    }

    if (table && table.querySelectorAll("tbody tr").length > 0) {
      break;
    }
  }

  if (!table) return [];

  let allData = [];
  try { window._neprasCurrentTableProgress = []; } catch (_) {}
  let pageNumber = 1;
  let truncatedAfterPage = 0;
  const visitedPages = new Set();

  while (true) {
    if (isScrapeCancelled) break;

    showFloatingStatus(`⏳ جاري تنزيل الصفحة رقم (${pageNumber})...`);

    const currentPageRows = scrapeCurrentPageRows(table);
    if (!currentPageRows.length) break;

    const signature = JSON.stringify(currentPageRows[0]);
    if (visitedPages.has(signature)) break;

    visitedPages.add(signature);
    allData = allData.concat(currentPageRows);
    try { window._neprasCurrentTableProgress = removeDuplicateRows(allData); } catch (_) {}

    const nextBtn = findNextPageButton();
    if (!nextBtn || isElementDisabled(nextBtn)) break;

    const firstStudentBefore = JSON.stringify(currentPageRows[0]);
    const clickTarget = nextBtn.querySelector("a, button") || nextBtn;
    clickTarget.click();

    let pageHasChanged = false;

    for (let wait = 0; wait < 25; wait++) {
      if (isScrapeCancelled) break;
      await sleep(400);

      const newPageRows = scrapeCurrentPageRows(table);
      const firstStudentAfter = newPageRows.length ? JSON.stringify(newPageRows[0]) : "";

      if (newPageRows.length && firstStudentAfter !== firstStudentBefore) {
        pageHasChanged = true;
        break;
      }
    }

    if (!pageHasChanged && !isScrapeCancelled) truncatedAfterPage = pageNumber;
    if (!pageHasChanged || isScrapeCancelled) break;

    pageNumber++;
  }

  if (truncatedAfterPage) neprasWarnListTruncated(truncatedAfterPage);

  return removeDuplicateRows(allData);
}

// ============================================================
// 🧹 إزالة الصفوف المكررة
// ============================================================

// تنبيه صريح عند توقف الانتقال بين صفحات القائمة قبل آخر صفحة (بطء الموقع):
// بدونه كانت القائمة تُعاد ناقصة كأنها كاملة.
function neprasWarnListTruncated(lastLoadedPage) {
  const message =
    `توقف تحميل الصفحات بعد الصفحة رقم ${lastLoadedPage} لأن الصفحة التالية لم تظهر في الوقت المحدد (بطء الموقع على الأرجح).\n\n` +
    "قد تكون القائمة المُصدَّرة ناقصة. تأكد من الأعداد أو أعد المحاولة في وقت أقل ازدحامًا.";
  try { console.warn("[نبراس] " + message.replace(/\n+/g, " ")); } catch (_) {}
  try { showFloatingStatus("⚠️ القائمة قد تكون ناقصة: توقف التحميل بعد الصفحة " + lastLoadedPage, false); } catch (_) {}
  try { window.neprasDialog?.warning(message, { title: "القائمة قد تكون ناقصة" }); } catch (_) {}
}

function removeDuplicateRows(rows) {
  const map = new Map();

  rows.forEach(row => {
    const values = Object.values(row).map(cleanValue);
    const key = values.join("||");

    if (!map.has(key)) {
      map.set(key, row);
    }
  });

  return Array.from(map.values());
}

// ============================================================
// 🔗 دمج البيانات
// ============================================================

function mergeStudentDatasets(mainData, transferData) {
  const mergedMap = new Map();

  mainData.forEach(item => {
    const code = cleanValue(getFieldValue(item, "CODE"));
    if (!code) return;

    mergedMap.set(code, {
      code,
      name: cleanValue(getFieldValue(item, "NAME")),
      grade: cleanValue(getFieldValue(item, "GRADE")),
      eduType: cleanValue(getFieldValue(item, "EDU_TYPE")),
      enrollStatus: cleanValue(getFieldValue(item, "ENROLL_STATUS")),
      damg: cleanValue(getFieldValue(item, "DAMG")),
      academicYear: cleanValue(getFieldValue(item, "ACADEMIC_YEAR")),
      nationality: cleanValue(getFieldValue(item, "NATIONALITY")),
      nationalId: "",
      class: ""
    });
  });

  transferData.forEach(item => {
    const code = cleanValue(getFieldValue(item, "CODE"));
    if (!code) return;

    const nationalId = cleanValue(getFieldValue(item, "NATIONAL_ID"));
    const className = cleanValue(getFieldValue(item, "CLASS"));
    const nameInTransfer = cleanValue(getFieldValue(item, "NAME"));
    const gradeInTransfer = cleanValue(getFieldValue(item, "GRADE"));
    const nationalityInTransfer = cleanValue(getFieldValue(item, "NATIONALITY"));

    if (mergedMap.has(code)) {
      const existing = mergedMap.get(code);

      if (nationalId) existing.nationalId = nationalId;
      if (className) existing.class = className;
      if (!existing.name && nameInTransfer) existing.name = nameInTransfer;
      if (!existing.grade && gradeInTransfer) existing.grade = gradeInTransfer;
      if (!existing.nationality && nationalityInTransfer) existing.nationality = nationalityInTransfer;
    } else {
      mergedMap.set(code, {
        code,
        name: nameInTransfer,
        grade: gradeInTransfer,
        eduType: getFieldValue(item, "EDU_TYPE"),
        enrollStatus: getFieldValue(item, "ENROLL_STATUS"),
        damg: getFieldValue(item, "DAMG"),
        academicYear: getFieldValue(item, "ACADEMIC_YEAR"),
        nationality: nationalityInTransfer,
        nationalId,
        class: className
      });
    }
  });

  return Array.from(mergedMap.values()).map(student => ({
    "كود التلميذ": cleanValue(student.code),
    "اسم التلميذ": cleanArabicName(student.name),
    "الرقم القومي": cleanValue(student.nationalId),
    "الصف": cleanValue(student.grade),
    "الفصل": cleanValue(student.class),
    "نوعية التعليم": cleanValue(student.eduType),
    "حالة القيد": cleanValue(student.enrollStatus),
    "الموقف من الدمج": cleanValue(student.damg),
    "العام الأكاديمي": cleanValue(student.academicYear),
    "الجنسية": cleanValue(student.nationality)
  }));
}

// ============================================================
// 📊 تصدير جدول عادي إلى XLSX
// ============================================================

function exportToFormattedExcel(data, fileName) {
  if (!data || !data.length) {
    showFloatingStatus("⚠️ لا توجد بيانات لتصديرها!", false);
    hideFloatingStatus(3000);
    return;
  }

  try {
    const headers = Object.keys(data[0]);
    const rows = data.map(row => headers.map(header => cleanValue(row[header])));
    const workbook = createRealWorkbook(headers, rows, fileName);
    downloadWorkbook(workbook, fileName, "تصدير بيانات الطلاب");
  } catch (error) {
    console.error("خطأ في تصدير Excel:", error);
    showFloatingStatus(`❌ خطأ في إنشاء ملف Excel: ${error.message}`, false);
    hideFloatingStatus(5000);
  }
}

// ============================================================
// 🔄 معالجة صف واحد
// ============================================================

async function processAndExportSingleGrade(gradeName, gradeCode = "") {
  if (currentExportRunning) {
    showFloatingStatus("⚠️ توجد عملية أخرى قيد التنفيذ!", false);
    hideFloatingStatus(2500);
    return;
  }

  await neprasPrepareStudentCommandState(
    "normal_single_pre_run"
  );

  currentExportRunning = true;
  isScrapeCancelled = false;
  neprasClearCancelledSaveContext();

  let mainData = [];
  let transferData = [];
  let finalMergedData = [];
  neprasSetCancelledSaveContext(
    () => finalMergedData.length ? finalMergedData : (mainData.length ? mainData : transferData),
    generateUnifiedFilename(`تنزيل_بيانات_جزئي_${gradeName}`),
    exportToFormattedExcel
  );

  try {
    // ========================================================
    // v1.0 FAST PATH
    // Request واحد للصف بدل المرور على صفحات «بحث» و«طلبات النقل».
    // إذا تعذر لأي سبب نكمل تلقائيًا بالمحرك القديم.
    // ========================================================
    if (typeof window.neprasApiTryRowsForGrade === "function") {
      showFloatingStatus(`⚡ تنزيل سريع للصف (${gradeName})...`);

      const fast =
        await window.neprasApiTryRowsForGrade(
          gradeName,
          String(gradeCode || "").trim()
        );

      if (
        fast?.ok &&
        Array.isArray(fast.rows) &&
        fast.rows.length &&
        !isScrapeCancelled
      ) {
        finalMergedData = fast.rows;

        neprasSetCancelledSaveContext(
          () => finalMergedData,
          generateUnifiedFilename(`تنزيل_بيانات_جزئي_${gradeName}`),
          exportToFormattedExcel
        );

        exportToFormattedExcel(
          finalMergedData,
          generateUnifiedFilename(`تنزيل_بيانات_الصف_${gradeName}`)
        );

        showFloatingStatus(
          `⚡ تم تنزيل صف (${gradeName}) سريعًا بنجاح — ${finalMergedData.length} طالب`,
          true
        );

        hideFloatingStatus(3000);
        return;
      }

      console.warn(
        "Nepras: تعذر Fast API للصف، سيتم استخدام المسار التقليدي.",
        fast?.reason || ""
      );
    }

    const isMainReady = await goToMainSearchPage();

    if (!isMainReady || isScrapeCancelled) {
      if (!isScrapeCancelled) {
        showFloatingStatus("❌ تعذر الوصول لصفحة (بحث عن تلميذ)!", false);
      }
      hideFloatingStatus(3000);
      return;
    }

    showFloatingStatus(`⏳ تنزيل بيانات الصف (${gradeName}) من صفحة (بحث عن تلميذ)...`);

    const mainRes = await selectGradeAndSearchMain(gradeName);

    if (!mainRes.success || isScrapeCancelled) {
      if (!isScrapeCancelled) {
        showFloatingStatus(
          mainRes.reason === "GRADE_NOT_FOUND"
            ? `⚠️ الصف (${gradeName}) غير متوفر!`
            : `❌ تعذر اختيار الصف!`,
          false
        );
      }
      hideFloatingStatus(3500);
      return;
    }

    await sleep(700);
    mainData = await scrapeFullTable("app-list-of-students table");
    neprasSetCancelledSaveContext(
      () => finalMergedData.length ? finalMergedData : mainData,
      generateUnifiedFilename(`تنزيل_بيانات_جزئي_${gradeName}`),
      exportToFormattedExcel
    );

    if (isScrapeCancelled) return;

    const isTransferReady = await goToTransferPage();

    if (!isTransferReady || isScrapeCancelled) {
      if (!isScrapeCancelled) {
        showFloatingStatus("❌ تعذر الوصول لصفحة (طلب النقل)!", false);
      }
      hideFloatingStatus(3000);
      return;
    }

    showFloatingStatus(`⏳ تنزيل الرقم القومي والفصل للصف (${gradeName})...`);

    const transferRes = await selectGradeAndSearchTransferModal(gradeName);

    if (!transferRes.success || isScrapeCancelled) {
      if (!isScrapeCancelled) {
        showFloatingStatus(
          transferRes.reason === "GRADE_NOT_FOUND"
            ? `⚠️ الصف (${gradeName}) غير متوفر!`
            : `❌ تعذر البحث في نافذة النقل!`,
          false
        );
      }
      hideFloatingStatus(3500);
      return;
    }

    await sleep(700);
    transferData = await scrapeFullTable("ngb-modal-window table");
    neprasSetCancelledSaveContext(
      () => finalMergedData.length ? finalMergedData : (mainData.length ? mainData : transferData),
      generateUnifiedFilename(`تنزيل_بيانات_جزئي_${gradeName}`),
      exportToFormattedExcel
    );

    if (isScrapeCancelled) return;

    showFloatingStatus("⏳ جاري ربط البيانات بالرقم القومي وكود التلميذ...");

    finalMergedData = mergeStudentDatasets(mainData, transferData);
    neprasSetCancelledSaveContext(
      () => finalMergedData,
      generateUnifiedFilename(`تنزيل_بيانات_جزئي_${gradeName}`),
      exportToFormattedExcel
    );

    if (finalMergedData.length && !isScrapeCancelled) {
      exportToFormattedExcel(
        finalMergedData,
        generateUnifiedFilename(`تنزيل_بيانات_الصف_${gradeName}`)
      );

      showFloatingStatus(
        `🎉 تم تنزيل صف (${gradeName}) بنجاح! عدد الطلاب: ${finalMergedData.length}`,
        true
      );
    } else if (!isScrapeCancelled) {
      showFloatingStatus(`⚠️ لم يتم العثور على بيانات للصف (${gradeName})!`, false);
    }

    hideFloatingStatus(3500);
  } finally {
    currentExportRunning = false;

    await neprasCleanupStudentCommandState(
      isScrapeCancelled ? "stopped" : "finished"
    );

    neprasResetLocalCommandArtifacts();
  }
}

// ============================================================
// 🚀 جميع الصفوف
// ============================================================

async function processAndExportAllGrades() {
  if (!NEPRAS_SELECTED_STAGE) {
    showFloatingStatus(
      "⚠️ اختر المرحلة الدراسية أولًا من قائمة نبراس.",
      false
    );
    hideFloatingStatus(3000);
    return;
  }

  if (currentExportRunning) {
    showFloatingStatus(
      "⚠️ توجد عملية أخرى قيد التنفيذ!",
      false
    );
    hideFloatingStatus(2500);
    return;
  }

  await neprasPrepareStudentCommandState(
    "normal_all_pre_run"
  );

  currentExportRunning = true;
  isScrapeCancelled = false;

  // مهم جدًا:
  // لا نعتمد على الصف المحدد حاليًا في صفحة الموقع.
  // قائمة نبراس نفسها تعرف المرحلة وعدد صفوفها.
  const gradeObjects =
    typeof neprasGetStageGradesForToolbar === "function"
      ? neprasGetStageGradesForToolbar()
      : [];

  let allMergedData = [];

  neprasSetCancelledSaveContext(
    () => allMergedData,
    generateUnifiedFilename(
      "تنزيل_بيانات_جميع_الصفوف_جزئي"
    ),
    exportToFormattedExcel
  );

  try {
    if (!gradeObjects.length) {
      showFloatingStatus(
        "⚠️ لم يتم التعرف على صفوف المرحلة المختارة.",
        false
      );
      hideFloatingStatus(3500);
      return;
    }

    for (let i = 0; i < gradeObjects.length; i++) {
      if (isScrapeCancelled) break;

      const grade = gradeObjects[i] || {};
      const gName =
        String(
          grade.name ||
          grade.label ||
          ""
        ).trim();

      // لو value الحقيقي رقمي نستخدمه مباشرة.
      // لو كان pseudo key مثل S1/P1/T1 نحوله من اسم الصف إلى 1/2/3...
      let apiGradeCode =
        /^\d+$/.test(String(grade.value || ""))
          ? String(grade.value)
          : "";

      if (
        !apiGradeCode &&
        typeof window.neprasApiResolveGradeCode === "function"
      ) {
        apiGradeCode =
          window.neprasApiResolveGradeCode(
            gName
          );
      }

      showFloatingStatus(
        `⚡ [${i + 1}/${gradeObjects.length}] تنزيل سريع للصف (${gName})...`
      );

      if (
        typeof window.neprasApiTryRowsForGrade === "function"
      ) {
        const fast =
          await window.neprasApiTryRowsForGrade(
            gName,
            apiGradeCode
          );

        if (
          fast?.ok &&
          Array.isArray(fast.rows)
        ) {
          // الصف غير الموجود في الفني 3 سنوات مثلًا يرجع فارغًا ويُتجاهل.
          if (fast.rows.length) {
            allMergedData =
              allMergedData.concat(
                fast.rows
              );

            neprasSetCancelledSaveContext(
              () => allMergedData,
              generateUnifiedFilename(
                "تنزيل_بيانات_جميع_الصفوف_جزئي"
              ),
              exportToFormattedExcel
            );
          }

          continue;
        }

        // فقد جلسة API: لا نضيع وقت المستخدم في pagination.
        if (fast?.authFailure) {
          showFloatingStatus(
            "❌ تعذر تجهيز جلسة API تلقائيًا. أعد تحميل صفحة بيانات التلميذ وحاول مرة أخرى.",
            false
          );
          hideFloatingStatus(4500);
          return;
        }

        console.warn(
          `Nepras: Fast API تعذر للصف ${gName}`,
          fast?.reason || ""
        );
      }

      // fallback تقليدي كشبكة أمان فقط في عطل API غير متعلق بالمصادقة.
      const isMainReady =
        await goToMainSearchPage();

      if (!isMainReady || isScrapeCancelled) {
        continue;
      }

      const searchRes =
        await selectGradeAndSearchMain(
          gName
        );

      if (!searchRes.success || isScrapeCancelled) {
        continue;
      }

      await sleep(700);

      const mainData =
        await scrapeFullTable(
          "app-list-of-students table"
        );

      if (isScrapeCancelled) break;

      const isTransferReady =
        await goToTransferPage();

      if (!isTransferReady || isScrapeCancelled) {
        continue;
      }

      const transferRes =
        await selectGradeAndSearchTransferModal(
          gName
        );

      if (!transferRes.success || isScrapeCancelled) {
        continue;
      }

      await sleep(700);

      const transferData =
        await scrapeFullTable(
          "ngb-modal-window table"
        );

      if (isScrapeCancelled) break;

      allMergedData =
        allMergedData.concat(
          mergeStudentDatasets(
            mainData,
            transferData
          )
        );
    }

    if (
      allMergedData.length &&
      !isScrapeCancelled
    ) {
      allMergedData =
        removeDuplicateRows(
          allMergedData
        );

      try {
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
          chrome.storage.local.set({ neprasCachedStudentsList: allMergedData }).catch(() => {});
        }
      } catch (_) {}

      exportToFormattedExcel(
        allMergedData,
        generateUnifiedFilename(
          "تنزيل_بيانات_جميع_الصفوف"
        )
      );

      showFloatingStatus(
        `🎉 تم تصدير جميع الصفوف بنجاح! عدد الطلاب: ${allMergedData.length}`,
        true
      );
    } else if (!isScrapeCancelled) {
      showFloatingStatus(
        "⚠️ لم يتم العثور على أي بيانات!",
        false
      );
    }

    hideFloatingStatus(4000);
  } finally {
    currentExportRunning = false;

    await neprasCleanupStudentCommandState(
      isScrapeCancelled ? "stopped" : "finished"
    );

    neprasResetLocalCommandArtifacts();
  }
}

// ============================================================
// 🧭 الانتقال إلى بحث عن تلميذ
// ============================================================

async function goToMainSearchPage() {
  if (document.querySelector("app-list-of-students")) {
    return true;
  }

  showFloatingStatus("⏳ جاري الانتقال لصفحة (بحث عن تلميذ)...");

  let link = getElementByXpath(MAIN_SEARCH_LINK_XPATH);

  if (!link) {
    const allLinks = Array.from(document.querySelectorAll("a, span, button"));

    link = allLinks.find(el => {
      const txt = normalizeText(el.innerText || el.textContent || "");
      return txt.includes("بحث") && txt.includes("بيانات");
    });
  }

  if (link) {
    const parentLi = link.closest("li");

    if (parentLi) {
      const parentToggle = parentLi.querySelector("a, div");

      if (parentToggle && parentToggle !== link && parentLi.querySelectorAll("a").length > 1) {
        parentToggle.click();
        await sleep(300);
      }
    }

    link.click();

    for (let i = 0; i < 35; i++) {
      if (isScrapeCancelled) return false;
      await sleep(400);

      if (document.querySelector("app-list-of-students")) {
        await sleep(600);
        return true;
      }
    }
  }

  return false;
}

// ============================================================
// 🧭 الانتقال إلى طلب النقل
// ============================================================

async function goToTransferPage() {
  if (document.querySelector("app-transfer-request")) {
    return true;
  }

  showFloatingStatus("⏳ جاري الانتقال لصفحة (تسجيل طلب النقل)...");

  let link = getElementByXpath(TRANSFER_PAGE_LINK_XPATH);

  if (!link) {
    const allLinks = Array.from(document.querySelectorAll("a, span, button"));

    link = allLinks.find(el => {
      const txt = normalizeText(el.innerText || el.textContent || "");
      return txt.includes("طلب") && txt.includes("نقل");
    });
  }

  if (link) {
    const parentLi = link.closest("li");

    if (parentLi) {
      const parentToggle = parentLi.querySelector("a, div");

      if (parentToggle && parentToggle !== link && parentLi.querySelectorAll("a").length > 1) {
        parentToggle.click();
        await sleep(300);
      }
    }

    link.click();

    for (let i = 0; i < 35; i++) {
      if (isScrapeCancelled) return false;
      await sleep(400);

      if (document.querySelector("app-transfer-request")) {
        await sleep(600);
        return true;
      }
    }
  }

  return false;
}

// ============================================================
// 🎓 اختيار الصف من بحث التلميذ
// ============================================================

function neprasResolveGradeOptionForCurrentStage(gradeSelect, gradeInput) {
  const inputNorm = normalizeText(String(gradeInput || ''));
  const specs = neprasGetSelectedStageSpecs();
  const spec = specs.find(sp => normalizeText(sp.label) === inputNorm || (sp.aliases || []).some(a => { const n=normalizeText(a); return n===inputNorm || inputNorm.includes(n) || n.includes(inputNorm); }));
  const aliases = spec ? [spec.label, ...(spec.aliases || [])] : [String(gradeInput || '')];
  return Array.from(gradeSelect.options || []).find(opt => {
    const t=normalizeText(opt.text || opt.textContent || ''); const v=String(opt.value || '');
    return aliases.some(a => { const n=normalizeText(a); return n && (t===n || t.includes(n) || n.includes(t) || v===String(gradeInput)); });
  }) || null;
}

async function selectGradeAndSearchMain(gradeInput) {
  neprasRefreshGradesListFromPage();
  let gradeSelect = null;

  for (let i = 0; i < 25; i++) {
    if (isScrapeCancelled) return { success: false, reason: "CANCELLED" };
    gradeSelect = neprasFindGradeSelectByLabel()?.sel || null;
    if (gradeSelect) break;
    await sleep(300);
  }

  if (!gradeSelect) {
    return { success: false, reason: "NO_SELECT" };
  }

  const targetOption = neprasResolveGradeOptionForCurrentStage(gradeSelect, gradeInput);

  if (!targetOption) {
    return { success: false, reason: "GRADE_NOT_FOUND" };
  }

  gradeSelect.value = targetOption.value;
  gradeSelect.dispatchEvent(new Event("change", { bubbles: true }));
  gradeSelect.dispatchEvent(new Event("input", { bubbles: true }));

  await sleep(500);

  let searchBtn = getElementByXpath(STANDARD_SEARCH_BTN_XPATH);

  if (!searchBtn) {
    const buttons = Array.from(
      document.querySelectorAll("app-list-of-students button, button")
    );

    searchBtn = buttons.find(b =>
      normalizeText(b.innerText || b.value || "").includes("بحث")
    );
  }

  if (searchBtn) {
    searchBtn.click();
    await sleep(1500);
    return { success: true, text: targetOption.text.trim() };
  }

  return { success: false, reason: "NO_SEARCH_BTN" };
}

// ============================================================
// 🔎 اختيار الصف في طلب النقل
// ============================================================

async function selectGradeAndSearchTransferModal(gradeInput, explicitGradeCode = "") {
  let modal = document.querySelector("ngb-modal-window");

  if (!modal) {
    let openModalBtn = getElementByXpath(TRANSFER_OPEN_MODAL_BTN_XPATH);

    if (!openModalBtn) {
      const buttons = Array.from(
        document.querySelectorAll("app-transfer-request button, button")
      );

      openModalBtn = buttons.find(b =>
        normalizeText(b.innerText || b.value || "").includes("بحث عن كود التلميذ")
      );
    }

    if (openModalBtn) {
      openModalBtn.click();

      for (let i = 0; i < 30; i++) {
        if (isScrapeCancelled) {
          return { success: false, reason: "CANCELLED" };
        }
        await sleep(300);

        modal = document.querySelector("ngb-modal-window");
        if (modal) break;
      }
    }
  }

  if (!modal) {
    return { success: false, reason: "NO_MODAL" };
  }

  let gradeSelect = null;

  for (let i = 0; i < 20; i++) {
    if (isScrapeCancelled) {
      return { success: false, reason: "CANCELLED" };
    }

    const selects = Array.from(modal.querySelectorAll("select"));

    gradeSelect = selects.find(sel => {
      const optionsText = normalizeText(
        Array.from(sel.options).map(o => o.text).join(" ")
      );

      return (
        optionsText.includes("الاول") ||
        optionsText.includes("الثاني") ||
        optionsText.includes("اخترالصف")
      );
    });

    if (gradeSelect) break;
    await sleep(300);
  }

  if (!gradeSelect) {
    return { success: false, reason: "NO_SELECT" };
  }

  const targetNorm = normalizeText(gradeInput);
  const explicitCode = String(explicitGradeCode || "").trim();

  const targetOption = Array.from(gradeSelect.options).find(opt => {
    const normOpt = normalizeText(opt.text);
    const optionValue = String(opt.value ?? "").trim();
    return (
      (explicitCode && optionValue === explicitCode) ||
      normOpt === targetNorm ||
      normOpt.includes(targetNorm) ||
      targetNorm.includes(normOpt) ||
      optionValue === String(gradeInput || "").trim()
    );
  });

  if (!targetOption) {
    return { success: false, reason: "GRADE_NOT_FOUND" };
  }

  gradeSelect.value = targetOption.value;
  gradeSelect.dispatchEvent(new Event("change", { bubbles: true }));
  gradeSelect.dispatchEvent(new Event("input", { bubbles: true }));

  await sleep(500);

  let searchBtn = getElementByXpath(MODAL_SEARCH_BTN_XPATH);

  if (!searchBtn) {
    const buttons = Array.from(modal.querySelectorAll("button"));
    searchBtn = buttons.find(b =>
      normalizeText(b.innerText || b.value || "").includes("بحث")
    );
  }

  if (searchBtn) {
    searchBtn.click();
    await sleep(1500);
    return { success: true, text: targetOption.text.trim() };
  }

  return { success: false, reason: "NO_SEARCH_BTN" };
}

// ============================================================
// ⏭️ Pagination
// ============================================================

function isElementDisabled(el) {
  if (!el) return true;

  if (
    el.disabled ||
    el.classList.contains("disabled") ||
    el.parentElement?.classList.contains("disabled")
  ) {
    return true;
  }

  if (el.getAttribute("aria-disabled") === "true") {
    return true;
  }

  return false;
}

function findNextPageButton() {
  const candidates = Array.from(
    document.querySelectorAll(
      "ul.pagination li, .ngx-pagination li, .pagination button, button, a"
    )
  );

  return candidates.find(el => {
    const text = cleanValue(el.innerText || el.textContent || "");
    const normalized = normalizeText(text);

    const isNextText =
      text === "التالي" ||
      text === "Next" ||
      text === "›" ||
      text === "»" ||
      normalized === "التالي";

    const hasNextClass =
      el.classList.contains("next") ||
      el.parentElement?.classList.contains("next");

    return (isNextText || hasNextClass) && !isElementDisabled(el);
  });
}

// ============================================================
// ⏱️ Sleep
// ============================================================

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================
// 🧰 أشرطة الأدوات
// ============================================================

function injectPageToolbars() {
  // أشرطة «تنزيل بيانات الصف/جميع الصفوف» و«التنزيل الشامل» التي كانت تُحقن داخل صفحة الطلاب أُزيلت:
  // أزرارها كانت تستدعي نفس دوال قسم «الطلاب» في لوحة الإضافة (processAndExportSingleGrade/AllGrades وDeep)
  // فكانت واجهتين لعمل واحد بألوان مختلفة فوق صفحة الوزارة. نُبقي هنا تنظيف أي شريط قديم فقط.
  document.getElementById("neprasInPageBarMain")?.remove();
  document.getElementById("neprasInPageBarDeep")?.remove();
  if (neprasIsStudentListRoute()) neprasCleanupLegacyTransferUI();
}


// ============================================================
// 📝 شريط طلبات النقل — الصف 1 / 2 / 3 + جميع صفوف المدرسة
// ============================================================

async function neprasScrapeTransferGrade(gradeInput, explicitGradeCode = "") {
  // v1.0: نفس GetSchoolStudent يرجع الصف كاملًا دفعة واحدة.
  // لا يوجد تنقل بين صفحات 10 طلاب.
  if (
    typeof window.neprasApiTryRowsForGrade === "function"
  ) {
    const fast =
      await window.neprasApiTryRowsForGrade(
        gradeInput,
        explicitGradeCode,
        { transferOnly: true }
      );

    if (fast?.ok) {
      return {
        success: true,
        data:
          Array.isArray(fast.rows)
            ? fast.rows
            : [],
        fast: true
      };
    }

    if (fast?.authFailure) {
      return {
        success: false,
        reason:
          fast.reason ||
          "FAST_API_AUTH_FAILED"
      };
    }
  }

  // fallback تقليدي فقط إذا تغيّر API نفسه، وليس عند فقد الجلسة.
  const searchRes =
    await selectGradeAndSearchTransferModal(
      gradeInput,
      explicitGradeCode
    );

  if (!searchRes.success) {
    return {
      success: false,
      reason:
        searchRes.reason ||
        "TRANSFER_SEARCH_FAILED"
    };
  }

  const data =
    await scrapeFullTable(
      "ngb-modal-window table, app-transfer-request table"
    );

  return {
    success: true,
    data:
      Array.isArray(data)
        ? data
        : [],
    fast: false
  };
}

function neprasInjectTransferToolbar() {
  const transferContainer = document.querySelector("app-transfer-request");
  const isTransferRoute = neprasIsTransferRouteStrict() || !!transferContainer;

  // خارج صفحة النقل: نظف أي بقايا قديمة ولا تنشئ أي شيء.
  if (!isTransferRoute || !transferContainer) {
    if (typeof neprasCleanupLegacyTransferUI === "function") {
      neprasCleanupLegacyTransferUI();
    }
    document.querySelectorAll(
      "#neprasInPageBarTransfer,.nepras-transfer-btn,.nepras-transfer-fixed-btn,.nepras-transfer-toolbar"
    ).forEach(el => el.remove());
    return;
  }

  if (document.getElementById("neprasInPageBarTransfer")) return;

  const headerTitle =
    transferContainer.querySelector(
      ".card-header, .page-header, h3, h4, h5, div[class*='header']"
    ) || transferContainer.firstElementChild;

  if (!headerTitle) return;

  const parentBlock = headerTitle.parentElement || transferContainer;
  const bar = document.createElement("div");
  bar.id = "neprasInPageBarTransfer";
  bar.setAttribute("data-nepras-transfer-toolbar", "true");
  bar.style.cssText =
    "display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 12px;margin:8px 0;background:#eef6ff;border:2px solid #93c5fd;border-radius:12px;direction:rtl;box-shadow:0 4px 14px rgba(30,64,175,.12);font-family:Tahoma,Arial,sans-serif;";

  const transferGrades =
    typeof neprasGetStageGradesForToolbar === "function"
      ? neprasGetStageGradesForToolbar()
      : [];

  const transferButtons =
    (transferGrades.length
      ? transferGrades
      : [
          { name: "الصف الأول", label: "الصف الأول", color: "#2563eb" },
          { name: "الصف الثاني", label: "الصف الثاني", color: "#059669" },
          { name: "الصف الثالث", label: "الصف الثالث", color: "#d97706" }
        ])
      .map((g, index) => {
        const gradeCode = /^\d+$/.test(String(g?.value || ""))
          ? String(g.value)
          : String(index + 1);
        // الاسم قادم من قائمة الصفوف في صفحة الوزارة، واللون يُقبل بصيغة #hex فقط.
        const gradeColor = /^#[0-9a-fA-F]{3,8}$/.test(String(g?.color || "")) ? g.color : "#2563eb";
        return `
        <button
          class="nepras-transfer-fixed-btn"
          data-grade-input="${NeprasEscape.attr(g.name || g.label || "")}"
          data-grade-code="${NeprasEscape.attr(gradeCode)}"
          style="background:${gradeColor};color:#fff;border:0;padding:8px 13px;border-radius:9px;font-weight:900;cursor:pointer;font-size:12px;min-height:38px;">
          📥 تنزيل بيانات ${NeprasEscape.html(g.name || g.label || "")}
        </button>
      `;
      })
      .join("");

  bar.innerHTML = `
    <span style="font-weight:900;color:#0f172a;font-size:13px;margin-left:4px;">📌 أدوات نبراس:</span>
    ${/* html-safe: مبني أعلاه من قيم مهروبة */ transferButtons}
    <button id="btnExportAllTransfer" style="background:#dc2626;color:#fff;border:0;padding:8px 13px;border-radius:9px;font-weight:900;cursor:pointer;font-size:12px;min-height:38px;">🚀 تنزيل بيانات جميع صفوف المدرسة</button>
  `;

  parentBlock.insertBefore(bar, headerTitle.nextSibling || headerTitle);

  bar.querySelectorAll(".nepras-transfer-fixed-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      // v1.0: التقط بيانات الزر قبل أول await.
      // event.currentTarget قد يصبح null بعد رجوع التنفيذ من await داخل مستمع DOM غير المتزامن.
      const gradeInput =
        btn.getAttribute(
          "data-grade-input"
        ) || "";
      const gradeCode =
        btn.getAttribute(
          "data-grade-code"
        ) || "";

      await neprasPrepareStudentCommandState(
        "transfer_single_pre_run"
      );

      isScrapeCancelled = false;

      try {
        showFloatingStatus(
          `⏳ تنزيل بيانات ${gradeInput}...`
        );

        const result =
          await neprasScrapeTransferGrade(
            gradeInput,
            gradeCode
          );

        if (isScrapeCancelled) return;

        if (
          result.success &&
          result.data.length
        ) {
          exportToFormattedExcel(
            result.data,
            generateUnifiedFilename(
              `بيانات_الصف_${gradeInput}`
            )
          );

          showFloatingStatus(
            `🎉 تم تنزيل بيانات ${gradeInput} بنجاح! عدد الطلاب: ${result.data.length}`,
            true
          );
        } else {
          showFloatingStatus(
            result.reason === "GRADE_NOT_FOUND"
              ? `⚠️ ${gradeInput} غير متوفر في هذه المدرسة.`
              : `❌ تعذر تنزيل بيانات ${gradeInput}.`,
            false
          );
        }

        hideFloatingStatus(4000);
      } finally {
        await neprasCleanupStudentCommandState(
          isScrapeCancelled
            ? "stopped"
            : "finished"
        );
      }
    });
  });

  document.getElementById("btnExportAllTransfer")?.addEventListener("click", async () => {
    await neprasPrepareStudentCommandState(
      "transfer_all_pre_run"
    );

    isScrapeCancelled = false;
    try {

      const grades =
        typeof neprasGetStageGradesForToolbar === "function"
          ? neprasGetStageGradesForToolbar()
          : [];

      if (!grades.length) {
        showFloatingStatus(
          "⚠️ اختر المرحلة التعليمية أولًا.",
          false
        );
        hideFloatingStatus(3500);
        return;
      }

      const allData = [];

      for (let i = 0; i < grades.length; i++) {
        if (isScrapeCancelled) break;

        const g = grades[i];

        showFloatingStatus(
          `⚡ [${i + 1}/${grades.length}] تنزيل سريع للبيانات — ${g.name}...`
        );

        const explicitCode = /^\d+$/.test(String(g?.value || ""))
          ? String(g.value)
          : String(i + 1);

        const result =
          await neprasScrapeTransferGrade(
            g.name,
            explicitCode
          );

        if (
          result.success &&
          result.data.length
        ) {
          allData.push(...result.data);
        } else if (
          result.reason &&
          (
            String(result.reason).includes("AUTH_") ||
            /(?<!\d)(?:401|403)(?!\d)/.test(String(result.reason))
          )
        ) {
          showFloatingStatus(
            "❌ تعذر تجهيز جلسة API تلقائيًا. أعد تحميل صفحة بيانات التلميذ وحاول مرة أخرى.",
            false
          );
          hideFloatingStatus(4500);
          return;
        }
      }

      if (isScrapeCancelled) return;

      if (allData.length) {
        exportToFormattedExcel(
          removeDuplicateRows(allData),
          generateUnifiedFilename(
            "بيانات_جميع_صفوف_المدرسة"
          )
        );

        showFloatingStatus(
          `🎉 تم تصدير جميع الصفوف بسرعة! عدد السجلات: ${allData.length}`,
          true
        );
      } else {
        showFloatingStatus(
          "⚠️ لم يتم العثور على بيانات في أي صف.",
          false
        );
      }

      hideFloatingStatus(4000);
    } finally {
      await neprasCleanupStudentCommandState(
        isScrapeCancelled
          ? "stopped"
          : "finished"
      );
    }
  });
}

// ============================================================
// 🌐 Global Exports

// ============================================================

window.processAndExportSingleGrade = processAndExportSingleGrade;
window.processAndExportAllGrades = processAndExportAllGrades;
window.processDeepScrapeForGrade = processDeepScrapeForGrade;
window.processDeepScrapeAllGrades = processDeepScrapeAllGrades;
window.neprasGetAvailableGradesForPopup = neprasGetAvailableGradesForPopup;
window.neprasRefreshGradesListFromPage = neprasRefreshGradesListFromPage;
window.injectPageToolbars = injectPageToolbars;

// ============================================================
// 🔄 مراقبة الصفحة
// ============================================================

neprasLoadSelectedStage().then(() => { injectPageToolbars(); neprasInjectTransferToolbar(); });
const __neprasPageMonitor = setInterval(() => {
  if (window.__NEPRAS_EXTENSION_CONTEXT_INVALIDATED__) {
    clearInterval(__neprasPageMonitor);
    return;
  }
  injectPageToolbars();
  neprasInjectTransferToolbar();
}, 1000);

// ============================================================
// 📦 مهمة معلقة من Popup
// ============================================================

function neprasIsExtensionContextInvalidated(error) {
  const msg = String(error?.message || error || "");
  return /Extension context invalidated/i.test(msg);
}

async function checkAndRunPendingExportTask() {
  try {
    if (
      typeof chrome === "undefined" ||
      !chrome.storage ||
      !chrome.storage.local
    ) {
      return;
    }

    // عند إعادة تحميل/تحديث الإضافة، تظل بعض التبويبات القديمة للحظة
    // بسياق Extension قديم. نتجاهل هذا السياق بدل تسجيل خطأ مزعج للمستخدم.
    try {
      if (!chrome.runtime || !chrome.runtime.id) return;
    } catch (_) {
      return;
    }

    const result = await chrome.storage.local.get("pendingExportTask");
    const task = result.pendingExportTask;

    if (!task) return;

    await chrome.storage.local.remove("pendingExportTask");
    await sleep(1000);

    if (task.type === "SINGLE_GRADE" && (task.grade || task.gradeText)) {
      const gradeName =
        String(
          task.gradeText ||
          task.grade ||
          ""
        ).trim();

      processAndExportSingleGrade(
        gradeName,
        task.grade
      );
    } else if (task.type === "ALL_GRADES") {
      processAndExportAllGrades();
    }
  } catch (e) {
    if (neprasIsExtensionContextInvalidated(e)) {
      try { window.__NEPRAS_EXTENSION_CONTEXT_INVALIDATED__ = true; } catch (_) {}
      return;
    }
    console.error("Pending export error:", e);
  }
}

// ============================================================
// 📩 استقبال رسالة Popup
// ============================================================

if (
  typeof chrome !== "undefined" &&
  chrome.runtime &&
  chrome.runtime.onMessage
) {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "STOP_STUDENT_EXTRACTION") {
      // v1.0: زر الإيقاف الرئيسي يحفظ تلقائيًا أي بيانات طلاب اكتمل سحبها
      // حتى لحظة الإيقاف، بنفس مبدأ حفظ العاملين الجزئي.
      try {
        neprasRequestGlobalStop("popup_stop_all");

        const hasSaveContext = !!(_cancelledSaveContext || window._neprasCancelledSaveContext);
        if (hasSaveContext) {
          _shouldSaveCancelledData = true;
          window._shouldSaveCancelledData = true;
        }

        setTimeout(() => {
          const ctx = _cancelledSaveContext || window._neprasCancelledSaveContext;
          const raw = ctx && typeof ctx.getData === "function" ? ctx.getData() : [];
          const completedCount = Array.isArray(raw) ? raw.filter(Boolean).length : 0;
          const saved = hasSaveContext ? neprasSaveCancelledSnapshot() : false;

          showFloatingStatus(
            saved
              ? `🛑 تم الإيقاف وحفظ البيانات التي اكتمل تنزيلها حتى لحظة الإيقاف — ${completedCount} طالب`
              : "🛑 تم إيقاف العملية بواسطة المستخدم.",
            saved ? true : false
          );
          hideFloatingStatus(saved ? 4200 : 2800);
          neprasCleanupStudentCommandState("stopped_from_popup").catch(() => {});

          if (sendResponse) {
            sendResponse({
              success: true,
              stopped: true,
              saved,
              completedCount
            });
          }
        }, hasSaveContext ? 320 : 0);
      } catch (_) {
        isScrapeCancelled = true;
        try { window.__NEPRAS_STOP_ALL_REQUESTED__ = true; } catch (_) {}
        if (sendResponse) sendResponse({ success: true, stopped: true, saved: false });
      }
      return true;
    }

    if (request.action === "EXECUTE_PENDING_TASK" && request.task) {
      try {
        chrome.storage.local.remove("pendingExportTask");
      } catch (e) {}

      if (request.task.type === "SINGLE_GRADE") {
        const gradeName =
          String(
            request.task.gradeText ||
            request.task.grade ||
            ""
          ).trim();

        processAndExportSingleGrade(
          gradeName,
          request.task.grade
        );
      } else if (request.task.type === "ALL_GRADES") {
        processAndExportAllGrades();
      }

      if (sendResponse) {
        sendResponse({ success: true });
      }

      return true;
    }
  });
}

// ============================================================
// 🚀 بدء المهام المعلقة
// ============================================================

if (
  document.readyState === "complete" ||
  document.readyState === "interactive"
) {
  setTimeout(checkAndRunPendingExportTask, 1200);
} else {
  document.addEventListener("DOMContentLoaded", () =>
    setTimeout(checkAndRunPendingExportTask, 1200)
  );
}

// ============================================================
// ✅ نهاية export.js
// ============================================================

window.neprasStudentBuildMultiSheetXlsx = neprasStudentBuildMultiSheetXlsx;
window.selectGradeAndSearchMain = selectGradeAndSearchMain;
window.scrapeFullTable = scrapeFullTable;
window.goToMainSearchPage = goToMainSearchPage;
