// ============================================================
// 📥 نبراس — صفحة قبول ملفات الطلاب الجدد
// يعمل على tansik-adtik.emis.gov.eg/#/schoolAdmin/accept-list
// يستورد Excel ويستخدم كود الطالب من الملف كقائمة الطلاب المطلوب فحصهم.
// ملف Excel قد لا يحتوي عمود حالة؛ القرار الفعلي يعتمد على زر الصفحة: «استلام الاوراق» أو «سحب الاوراق».
// ============================================================

(function () {
  "use strict";

  const ACCEPT_ROUTE_RE = /schoolAdmin\/accept-list/i;
  const BAR_ID = "neprasAcceptListToolbar";
  const FILE_INPUT_ID = "neprasAcceptExcelInput";
  const START_BTN_ID = "neprasAcceptStartBtn";
  const STOP_BTN_ID = "neprasAcceptStopBtn";
  const REPORT_BTN_ID = "neprasAcceptReportBtn";
  const STATUS_ID = "neprasAcceptToolbarStatus";

  // توقيتات استلام ملفات الطلاب الجدد — مضبوطة للتنفيذ على الملفات الكبيرة.
  const ACCEPT_TIMINGS = Object.freeze({
    confirmModalTimeoutMs: 2000,
    successModalTimeoutMs: 4000,
    successOkCloseTimeoutMs: 3000,
    savedStateTimeoutMs: 5000,
    betweenStudentsMs: 800,
    retryDelayMs: 500,
    pollConfirmMs: 80,
    pollSuccessMs: 100,
    pollOkMs: 80,
    pollSavedMs: 150
  });

  let importedRecords = [];
  let importedParsed = null; // ناتج parseMatrix كاملًا (المطلوبون والمتجاهَلون والمتعارضون) لتقرير التشغيل
  let lastReport = null;     // تقرير آخر تشغيل (NeprasRunReport.build)؛ يبقى حتى بدء تشغيل جديد
  let running = false;
  let stopRequested = false;
  let lastFileName = "";

  // التطبيع (الأرقام الهندية، الهمزات، المسافات) من accept_plan.js: مصدر واحد للصفحة وقراءة الملف.
  const { clean, norm, statusNorm } = globalThis.NeprasAcceptPlan;

  function isAcceptPage() {
    const href = String(location.href || "");
    const hash = String(location.hash || "");
    return ACCEPT_ROUTE_RE.test(href) || ACCEPT_ROUTE_RE.test(hash) || !!document.querySelector("app-school-admin-accept-list");
  }

  function showStatus(text, kind = "info") {
    const el = document.getElementById(STATUS_ID);
    if (!el) return;
    el.textContent = text;
    el.dataset.kind = kind;
  }

  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function isVisible(el) {
    if (!el) return false;
    const s = getComputedStyle(el);
    return s.display !== "none" && s.visibility !== "hidden" &&
      (!!el.offsetWidth || !!el.offsetHeight || !!el.getClientRects().length);
  }

  function buttonText(el) {
    return norm(el?.innerText || el?.textContent || el?.value || "");
  }

  function isDisabled(el) {
    return !!(el?.disabled || el?.getAttribute("disabled") !== null || el?.classList?.contains("disabled") || el?.getAttribute("aria-disabled") === "true");
  }

  function findAcceptRows() {
    return Array.from(document.querySelectorAll("table tbody tr, table tr"))
      .filter(row => isVisible(row) && row.querySelectorAll("td,th").length >= 2);
  }

  function rowCells(row) {
    return Array.from(row.querySelectorAll("td,th")).map(c => clean(c.innerText || c.textContent || ""));
  }

  function rowCode(row) {
    const cells = rowCells(row);
    // الكود في الصفحة عادة هو أول عمود مرئي في الجدول، لكن نعتمد أيضًا على نمط 7-12 رقمًا.
    const cellDigits = cells.map(c => norm(c).replace(/\D/g, "")).filter(Boolean);
    const exactCode = cellDigits.find(d => /^\d{9}$/.test(d));
    if (exactCode) return exactCode;
    const likelyCode = cellDigits.find(d => /^\d{8,12}$/.test(d) && !/^20\d{6}$/.test(d));
    if (likelyCode) return likelyCode;
    const text = clean(row.innerText || row.textContent || "");
    const candidates = text.match(/\d{7,12}/g) || [];
    return candidates.find(x => /^\d{9}$/.test(x)) || candidates.find(x => !/^20\d{6}$/.test(x) && !/^\d{1,3}(?:\.\d+)?$/.test(x)) || "";
  }

  function rowName(row) {
    const cells = rowCells(row);
    return cells.find(c => /[ء-ي]{4,}/.test(c) && !/تم تقديم|لم يتم تقديم|استلام|سحب|رفض|الاوراق|الأوراق/.test(c)) || "";
  }

  function findReceiveButton(row) {
    if (!row) return null;
    // الـ HTML الحقيقي للصفحة: button.btn.btn-success > span = «استلام الاوراق»
    return Array.from(row.querySelectorAll('button.btn-success, button')).find(b => {
      if (!isVisible(b) || isDisabled(b)) return false;
      const t = statusNorm(buttonText(b));
      return t === statusNorm('استلام الاوراق');
    }) || null;
  }

  function findWithdrawButton(row) {
    if (!row) return null;
    return Array.from(row.querySelectorAll('button, .btn, [role="button"]')).find(b => {
      if (!isVisible(b)) return false;
      const t = statusNorm(buttonText(b));
      return t === statusNorm('سحب الاوراق') || t.includes(statusNorm('سحب الاوراق'));
    }) || null;
  }

  function visibleElements(selector, root = document) {
    return Array.from(root.querySelectorAll(selector)).filter(isVisible);
  }

  function findExactVisibleText(patterns) {
    const wanted = patterns.map(statusNorm);
    const selectors = 'h1,h2,h3,h4,h5,h6,p,span,div,button,label';
    const all = visibleElements(selectors);
    for (const el of all) {
      const t = statusNorm(el.innerText || el.textContent || '');
      if (!t) continue;
      if (wanted.some(w => t === w || t.includes(w))) return el;
    }
    return null;
  }

  async function waitForExactConfirmModal(timeout = ACCEPT_TIMINGS.confirmModalTimeoutMs) {
    const start = Date.now();
    const needles = [
      'هل أنت متاكد من تغير حالة الطلب ؟',
      'هل أنت متاكد من تغير حالة الطلب',
      'هل أنت متأكد من تغير حالة الطلب ؟',
      'هل أنت متأكد من تغير حالة الطلب'
    ].map(statusNorm);

    while (Date.now() - start < timeout) {
      // الصفحة تستخدم ngb-modal-window فعليًا. نبحث عنه فقط حتى لا نخلط بين
      // modal-window و modal-dialog و modal-content كأنها نوافذ مستقلة.
      const windows = Array.from(document.querySelectorAll('ngb-modal-window'))
        .filter(isVisible);

      for (const win of windows.reverse()) {
        const text = statusNorm(win.innerText || win.textContent || '');
        if (needles.some(n => text.includes(n))) return win;
      }

      await wait(ACCEPT_TIMINGS.pollConfirmMs);
    }
    return null;
  }

  async function waitForExactSuccessModal(timeout = ACCEPT_TIMINGS.successModalTimeoutMs) {
    const start = Date.now();
    const needles = [
      'تم تحديث البيانات بنجاح',
      'تم تحديث البيانات'
    ].map(statusNorm);

    while (Date.now() - start < timeout) {
      const windows = Array.from(document.querySelectorAll('ngb-modal-window'))
        .filter(isVisible);

      for (const win of windows.reverse()) {
        const text = statusNorm(win.innerText || win.textContent || '');
        if (needles.some(n => text.includes(n))) return win;
      }

      await wait(ACCEPT_TIMINGS.pollSuccessMs);
    }
    return null;
  }

  function findButtonByExactText(root, labels) {
    const wanted = labels.map(norm);
    const scope = root || document;
    const buttons = Array.from(scope.querySelectorAll('button, input[type="button"], input[type="submit"], [role="button"], .btn'))
      .filter(isVisible)
      .filter(b => !isDisabled(b));
    return buttons.find(b => {
      const t = buttonText(b);
      return wanted.some(w => t === w || t.includes(w));
    }) || null;
  }

  async function waitForButtonInRootOrDocument(root, labels, timeout = ACCEPT_TIMINGS.successOkCloseTimeoutMs) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      // الأزرار المطلوبة في هذه الصفحة موجودة داخل نفس ngb-modal-window.
      const local = findButtonByExactText(root, labels);
      if (local) return local;
      await wait(ACCEPT_TIMINGS.pollOkMs);
    }
    return null;
  }

  async function waitForReceiveButtonInRow(row, timeout = 4000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const btn = findReceiveButton(row);
      if (btn) return btn;
      await wait(150);
    }
    return null;
  }

  async function waitForRowStateAfterSave(code, timeout = ACCEPT_TIMINGS.savedStateTimeoutMs) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      await wait(ACCEPT_TIMINGS.pollSavedMs);
      const row = findAcceptRows().find(r => rowCode(r) === code);
      if (!row) return true;
      if (findWithdrawButton(row) && !findReceiveButton(row)) return true;
      const text = statusNorm(row.innerText || row.textContent || '');
      if (text === statusNorm('تم تقديم الاوراق') && !findReceiveButton(row)) return true;
    }
    return false;
  }

  async function clickLikeUser(el) {
    if (!el) return false;
    el.scrollIntoView?.({ block: 'center', inline: 'center', behavior: 'instant' });
    await wait(250);
    el.focus?.();
    try {
      el.click();
      return true;
    } catch (_) {
      try {
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        return true;
      } catch (__) {
        return false;
      }
    }
  }

  async function confirmReceive(row, record, index, total) {
    const code = rowCode(row);
    let receive = await waitForReceiveButtonInRow(row, 4000);

    if (!receive) {
      const withdraw = findWithdrawButton(row);
      if (withdraw) return { ok: true, skipped: true, reason: 'ALREADY_RECEIVED' };
      return { ok: false, reason: 'RECEIVE_BUTTON_NOT_FOUND' };
    }

    showStatus(`🟢 (${index}/${total}) تم العثور على «استلام الاوراق» للطالب ${record.name || code}`, 'info');
    if (!(await clickLikeUser(receive))) {
      return { ok: false, reason: 'RECEIVE_CLICK_FAILED' };
    }

    showStatus(`⏳ (${index}/${total}) تم الضغط على «استلام الاوراق» — انتظار نافذة «تاكيد»`, 'info');
    const confirmModal = await waitForExactConfirmModal(ACCEPT_TIMINGS.confirmModalTimeoutMs);
    if (!confirmModal) return { ok: false, reason: 'CONFIRM_MODAL_NOT_APPEARED' };

    showStatus(`✅ (${index}/${total}) ظهرت نافذة «تاكيد» — البحث عن زر التأكيد`, 'info');
    const confirmButton = await waitForButtonInRootOrDocument(confirmModal, ['تاكيد', 'تأكيد'], ACCEPT_TIMINGS.successOkCloseTimeoutMs);
    if (!confirmButton) return { ok: false, reason: 'CONFIRM_BUTTON_NOT_FOUND' };

    showStatus(`🖱️ (${index}/${total}) الضغط على «تاكيد»`, 'info');
    if (!(await clickLikeUser(confirmButton))) {
      return { ok: false, reason: 'CONFIRM_CLICK_FAILED' };
    }

    showStatus(`⏳ (${index}/${total}) تم الضغط على «تاكيد» — انتظار «تم تحديث البيانات بنجاح»`, 'info');
    const successModal = await waitForExactSuccessModal(ACCEPT_TIMINGS.successModalTimeoutMs);
    if (!successModal) return { ok: false, reason: 'SUCCESS_MODAL_NOT_APPEARED' };

    showStatus(`✅ (${index}/${total}) ظهرت رسالة «تم تحديث البيانات بنجاح» — البحث عن «حسنا»`, 'info');
    const okButton = await waitForButtonInRootOrDocument(successModal, ['حسنا', 'حسنًا', 'حسناً', 'موافق', 'OK'], ACCEPT_TIMINGS.successOkCloseTimeoutMs);
    if (!okButton) return { ok: false, reason: 'SUCCESS_OK_BUTTON_NOT_FOUND' };

    showStatus(`🖱️ (${index}/${total}) الضغط على «حسنا» ثم الانتظار للحفظ وإعادة تحديث الصف`, 'info');
    if (!(await clickLikeUser(okButton))) {
      return { ok: false, reason: 'OK_CLICK_FAILED' };
    }

    const closedStart = Date.now();
    while (Date.now() - closedStart < ACCEPT_TIMINGS.successOkCloseTimeoutMs) {
      await wait(250);
      const stillSuccess = findExactVisibleText(['تم تحديث البيانات بنجاح']);
      if (!stillSuccess) break;
    }

    showStatus(`⏳ (${index}/${total}) تم إغلاق الرسالة — انتظار تحديث حالة الطالب ${code}`, 'info');
    const saved = await waitForRowStateAfterSave(code, ACCEPT_TIMINGS.savedStateTimeoutMs);
    if (!saved) return { ok: false, reason: 'SAVE_STATE_NOT_CONFIRMED' };

    await wait(ACCEPT_TIMINGS.betweenStudentsMs);
    showStatus(`✅ (${index}/${total}) تم استلام الطالب ${code} بنجاح`, 'ok');
    return { ok: true, saved: true };
  }

  function parseExcelFile(file) {
    return new Promise((resolve, reject) => {
      if (!file) return reject(new Error("لم يتم اختيار ملف."));
      const reader = new FileReader();
      reader.onload = async e => {
        try {
          let XLSX;
          try { XLSX = await neprasEnsureLib("xlsx"); }
          catch (_) { throw new Error("مكتبة Excel غير متاحة داخل الإضافة."); }
          const wb = XLSX.read(e.target.result, { type: "array", cellDates: false });
          const sheetName = wb.SheetNames[0];
          const matrix = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: "", raw: true });
          resolve({ ...globalThis.NeprasAcceptPlan.parseMatrix(matrix), sheetName });
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error("تعذر قراءة ملف Excel."));
      reader.readAsArrayBuffer(file);
    });
  }

  function pageSignature() {
    return findAcceptRows().map(r => `${rowCode(r)}|${norm(rowName(r))}`).join("||");
  }

  function findNextPageButton() {
    const buttons = Array.from(document.querySelectorAll("button,a,li"))
      .filter(isVisible);
    const candidates = buttons.filter(el => {
      const t = norm(el.innerText || el.textContent || el.getAttribute("aria-label") || "");
      return t === "التالي" || t === "next" || t === "›" || t === ">" || t.includes("التالي");
    });
    return candidates.find(el => !isDisabled(el)) || null;
  }

  async function waitForPageChange(oldSig, timeout = 12000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      await wait(250);
      const sig = pageSignature();
      if (sig && sig !== oldSig) return true;
    }
    return false;
  }

  function ensureToolbarStyle() {
    if (document.getElementById("neprasAcceptToolbarStyle")) return;
    const style = document.createElement("style");
    style.id = "neprasAcceptToolbarStyle";
    style.textContent = `
      @font-face{font-family:"Nepras Sultan Black";src:local("SF Sultan Black"),local("SFSultan-Black"),local("SF Sultan"),local("Sultan Black");font-style:normal;font-weight:900;font-display:swap;unicode-range:U+0600-06FF,U+0750-077F,U+08A0-08FF,U+FB50-FDFF,U+FE70-FEFF}
      @font-face{font-family:"Nepras Sultan Medium";src:local("Sultan_medium/ghayaty2020 medium"),local("Sultan_mediumghayaty2020-medium"),local("Sultan_medium/ghayaty2020"),local("Sultan Medium"),local("Sultan_medium"),local("Sultan medium");font-style:normal;font-weight:500;font-display:swap;unicode-range:U+0600-06FF,U+0750-077F,U+08A0-08FF,U+FB50-FDFF,U+FE70-FEFF}
      #${BAR_ID}{
        display:flex;align-items:center;gap:8px;flex-wrap:wrap;
        margin:10px 14px;padding:11px 14px;
        background:linear-gradient(90deg,#eff6ff,#f8fafc);
        border:2px solid #60a5fa;border-radius:12px;
        direction:rtl;font-family:"Nepras Sultan Medium","Segoe UI",Tahoma,Arial,sans-serif!important;
        box-shadow:0 4px 14px rgba(15,23,42,.12);
        position:relative;z-index:1000;
      }
      #${BAR_ID} .nepras-accept-title{font-family:"Nepras Sultan Medium","Segoe UI",Tahoma,Arial,sans-serif!important;font-synthesis:weight!important;font-weight:900;color:#0f172a;font-size:15px;white-space:nowrap;margin-left:5px}
      #${BAR_ID} button{font-family:"Nepras Sultan Medium","Segoe UI",Tahoma,Arial,sans-serif!important;font-synthesis:weight!important;font-weight:900;font-size:14px;min-height:40px;padding:8px 14px;border-radius:9px;cursor:pointer;border:0;box-shadow:0 2px 7px rgba(15,23,42,.15);transition:.12s}
      #${BAR_ID} button:hover:not(:disabled){transform:translateY(-1px);filter:brightness(.97)}
      #${BAR_ID} button:disabled{opacity:.48;cursor:not-allowed}
      #neprasAcceptImportBtn{background:#2563eb;color:#fff}
      #${START_BTN_ID}{background:#059669;color:#fff}
      #${STOP_BTN_ID}{background:#dc2626;color:#fff}
      #${REPORT_BTN_ID}{background:#475569;color:#fff}
      #${STATUS_ID}{flex:1;min-width:260px;font-size:12px;font-weight:800;color:#334155;padding:7px 10px;background:#fff;border:1px solid #cbd5e1;border-radius:8px}
      #${STATUS_ID}[data-kind="ok"]{color:#166534;border-color:#86efac;background:#f0fdf4}
      #${STATUS_ID}[data-kind="warn"]{color:#92400e;border-color:#fcd34d;background:#fffbeb}
      #${STATUS_ID}[data-kind="error"]{color:#991b1b;border-color:#fca5a5;background:#fef2f2}
      #${STATUS_ID}[data-kind="info"]{color:#1e3a8a}
    `;
    document.documentElement.appendChild(style);
  }

  function createToolbar() {
    if (!isAcceptPage() || document.getElementById(BAR_ID)) return;
    ensureToolbarStyle();

    const host = document.querySelector("app-root") || document.body;
    const bar = document.createElement("div");
    bar.id = BAR_ID;
    bar.dir = "rtl";
    bar.innerHTML = `
      <div class="nepras-accept-title">📂 أدوات نبراس — استلام ملفات الطلاب الجدد</div>
      <input id="${FILE_INPUT_ID}" type="file" accept=".xlsx,.xls,.csv" style="display:none">
      <button id="neprasAcceptImportBtn" type="button">📥 استيراد ملف Excel</button>
      <button id="${START_BTN_ID}" type="button" disabled>▶ بدء استلام الأوراق</button>
      <button id="${STOP_BTN_ID}" type="button" disabled>⏹ إيقاف</button>
      <button id="${REPORT_BTN_ID}" type="button" disabled>📄 تقرير Excel</button>
      <span id="${STATUS_ID}" data-kind="info">لم يتم اختيار ملف.</span>
    `;

    // نضعه أعلى الصفحة بعد شريط/هيدر الوزارة، وليس داخل الجدول حتى لا يتحرك مع pagination.
    const header = document.querySelector("app-school-admin-accept-list .card-header, app-school-admin-accept-list h3, app-school-admin-accept-list h4, app-school-admin-accept-list h5") ||
      document.querySelector("app-school-admin-accept-list")?.firstElementChild;
    if (header?.parentElement) header.parentElement.insertBefore(bar, header.nextSibling);
    else host.insertBefore(bar, host.firstChild);

    const input = bar.querySelector(`#${FILE_INPUT_ID}`);
    const importBtn = bar.querySelector("#neprasAcceptImportBtn");
    const startBtn = bar.querySelector(`#${START_BTN_ID}`);
    const stopBtn = bar.querySelector(`#${STOP_BTN_ID}`);
    const reportBtn = bar.querySelector(`#${REPORT_BTN_ID}`);
    reportBtn.disabled = !lastReport;

    importBtn.addEventListener("click", () => input.click());
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        showStatus("⏳ جاري قراءة ملف Excel...", "info");
        const parsed = await parseExcelFile(file);
        importedRecords = parsed.targets;
        importedParsed = parsed;
        lastFileName = file.name;
        startBtn.disabled = importedRecords.length === 0;
        const summary = globalThis.NeprasAcceptPlan.describeImport(file.name, parsed);
        showStatus(`${summary.text} — التنفيذ على «تم تقديم الاوراق» فقط.`, summary.tone);
      } catch (err) {
        importedRecords = [];
        importedParsed = null;
        startBtn.disabled = true;
        showStatus(`❌ ${err?.message || err}`, "error");
      } finally {
        input.value = "";
      }
    });

    startBtn.addEventListener("click", runReceiveProcess);
    reportBtn.addEventListener("click", downloadRunReport);
    stopBtn.addEventListener("click", () => {
      stopRequested = true;
      showStatus("⏹ جارٍ إيقاف العملية بعد إنهاء الطالب الحالي...", "warn");
    });
  }

  async function waitForPendingRowOnCurrentPage(pending, timeout = 1800) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const rows = findAcceptRows();
      const row = rows.find(r => {
        const code = rowCode(r);
        return code && pending.has(code);
      });
      if (row) return row;
      await wait(180);
    }
    return null;
  }

  async function downloadRunReport() {
    if (!lastReport) { showStatus("⚠️ لا يوجد تقرير بعد: شغّل الاستلام أولًا.", "warn"); return; }
    try {
      const XLSX = await neprasEnsureLib("xlsx");
      const RR = globalThis.NeprasRunReport;
      const wb = RR.buildWorkbook(XLSX, RR.sheets(lastReport));
      const blob = new Blob([XLSX.write(wb, { bookType: "xlsx", type: "array" })], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      await window.neprasDialog.triggerDownload(blob, `تقرير_قبول_الملفات_${NeprasEgypt.todayStamp()}.xlsx`, {
        title: "تم إنشاء تقرير Excel بنجاح",
        message: "تقرير قبول الملفات: ملخص ونتيجة كل طالب وسببها.",
        folder: "قبول ملفات الطلاب الجدد"
      });
    } catch (err) {
      showStatus(`❌ تعذّر إنشاء التقرير: ${err?.message || err}`, "error");
    }
  }

  async function runReceiveProcess() {
    try {
      await chrome.runtime.sendMessage({
        action:
          "NEPRAS_PREPARE_COMMAND_STATE",
        reason:
          "acceptance_pre_run"
      });
    } catch (_) {}

    if (running) return;
    if (!importedRecords.length) {
      showStatus("⚠️ استورد ملف Excel أولًا.", "warn");
      return;
    }

    running = true;
    stopRequested = false;
    const startBtn = document.getElementById(START_BTN_ID);
    const stopBtn = document.getElementById(STOP_BTN_ID);
    const reportBtn = document.getElementById(REPORT_BTN_ID);
    if (startBtn) startBtn.disabled = true;
    if (stopBtn) stopBtn.disabled = false;
    if (reportBtn) reportBtn.disabled = true;
    lastReport = null;
    const startedAt = new Date();
    const parsedForReport = importedParsed;
    const fileForReport = lastFileName;
    let fatalError = "";

    const pending = new Map(importedRecords.map(r => [r.code, r]));
    const done = [];
    const skipped = [];
    const errors = [];
    const visitedPages = new Set();
    let inFlight = null; // الطالب قيد المعالجة الآن: إن انقطعت العملية بخطأ فحالته مجهولة (قد يكون حُفظ في الموقع)
    let pageNo = 0;
    let noTargetPageCycles = 0;

    try {
      while (!stopRequested && pending.size) {
        pageNo++;

        // مهم جدًا: لا نحتفظ بقائمة rows قديمة بعد نجاح أي طالب.
        // Angular يعيد رسم الجدول، وقد تصبح عناصر الصفوف القديمة detached.
        // لذلك نعيد قراءة DOM في كل دورة.
        await wait(250);
        const currentSig = pageSignature();
        if (currentSig) visitedPages.add(currentSig);

        let row = await waitForPendingRowOnCurrentPage(pending, 1800);

        if (!row) {
          noTargetPageCycles++;
          const next = findNextPageButton();

          if (!next) break;

          const oldSig = pageSignature();
          showStatus(`➡️ الانتقال للصفحة التالية — المتبقي: ${pending.size}`, "info");
          next.scrollIntoView?.({ block: "center" });
          await wait(250);
          next.click();

          const changed = await waitForPageChange(oldSig, 12000);
          if (!changed) break;

          // نعيد الدورة من البداية على DOM الجديد.
          noTargetPageCycles = 0;
          continue;
        }

        noTargetPageCycles = 0;

        // ابحث عن السجل مرة أخرى من الـMap الحالية لضمان عدم استخدام object قديم.
        const code = rowCode(row);
        const record = pending.get(code);
        if (!record) continue;
        inFlight = record;

        const sequenceIndex = done.length + skipped.length + errors.length + 1;
        showStatus(`🔎 (${sequenceIndex}/${importedRecords.length}) معالجة الطالب ${record.code}${record.name ? ` — ${record.name}` : ""}`, "info");

        // القرار من Excel فقط: هذه القائمة كلها shouldReceive أصلًا.
        // حالة الصفحة تحدد هل الزر الحالي استلام أم سحب.
        let receive = findReceiveButton(row);
        let withdraw = findWithdrawButton(row);

        if (!receive && !withdraw) {
          await wait(500);
          // أعد العثور على الصف من DOM الحالي قبل إعادة الفحص.
          row = findAcceptRows().find(r => rowCode(r) === code) || null;
          if (row) {
            receive = findReceiveButton(row);
            withdraw = findWithdrawButton(row);
          }
        }

        if (withdraw && !receive) {
          skipped.push({ ...record, reason: "ALREADY_RECEIVED" });
          pending.delete(code);
          showStatus(`⏭️ (${sequenceIndex}/${importedRecords.length}) ${code} — مستلم بالفعل`, "info");
          await wait(ACCEPT_TIMINGS.betweenStudentsMs);
          continue;
        }

        if (!receive) {
          errors.push({ ...record, reason: "RECEIVE_BUTTON_NOT_FOUND" });
          pending.delete(code);
          showStatus(`❌ (${sequenceIndex}/${importedRecords.length}) ${code} — زر استلام الاوراق غير موجود`, "error");
          await wait(800);
          continue;
        }

        let result = await confirmReceive(row, record, sequenceIndex, importedRecords.length);
        console.log("[Nepras AcceptList] نتيجة الطالب:", record.code, record.name, result);

        if (!result.ok && /TIMEOUT|NOT_APPEARED|STATE_NOT_CONFIRMED|NOT_CONFIRMED/.test(result.reason || "")) {
          showStatus(`⚠️ (${sequenceIndex}/${importedRecords.length}) إعادة المحاولة للطالب ${record.code}: ${result.reason || "TIMEOUT"}`, "warn");
          await wait(ACCEPT_TIMINGS.retryDelayMs);

          // مهم: احصل على row جديد من DOM قبل إعادة المحاولة.
          const retryRow = findAcceptRows().find(r => rowCode(r) === code) || null;
          if (retryRow) {
            result = await confirmReceive(retryRow, record, sequenceIndex, importedRecords.length);
          } else {
            result = { ok: false, reason: "RETRY_ROW_NOT_FOUND" };
          }
        }

        console.log("[Nepras AcceptList] النتيجة النهائية:", record.code, record.name, result);

        if (result.ok) {
          if (result.skipped) {
            skipped.push({ ...record, reason: result.reason || "ALREADY_RECEIVED" });
          } else {
            done.push(record);
          }
          pending.delete(code);
          showStatus(
            result.skipped
              ? `⏭️ (${sequenceIndex}/${importedRecords.length}) ${record.code} — مستلم بالفعل`
              : `✅ (${sequenceIndex}/${importedRecords.length}) تم استلام الطالب ${record.code} بنجاح`,
            result.skipped ? "info" : "ok"
          );

          // بعد النجاح، Angular غالبًا يعيد رسم tr بالكامل.
          // لا نعيد استخدام row القديم. ننتظر قليلًا ثم نبدأ دورة DOM جديدة.
          await wait(ACCEPT_TIMINGS.betweenStudentsMs);
          continue;
        }

        errors.push({ ...record, reason: result.reason || "UNKNOWN" });
        pending.delete(code);
        showStatus(`❌ فشل الطالب ${record.code}: ${result.reason || "UNKNOWN"}`, "error");
        await wait(1200);
      }

      const notFound = Array.from(pending.values());
      const processed = done.length + skipped.length + errors.length;

      console.log("Nepras accept-list result", {
        file: lastFileName,
        done,
        skipped,
        errors,
        notFound,
        processed,
        visitedPages: visitedPages.size
      });
    } catch (err) {
      console.error("Nepras accept-list automation error", err);
      fatalError = String(err?.message || err);
      // ما زال في pending يعني أن الانقطاع وقع أثناء معالجته: لا نقول «لم يُعالَج» لطالب قد يكون حُفظ.
      if (inFlight && pending.has(inFlight.code)) {
        errors.push({ ...inFlight, reason: "INTERRUPTED_IN_FLIGHT" });
        pending.delete(inFlight.code);
      }
    } finally {
      running = false;
      // «اكتمل» لا تُقال إلا بحسب التقرير: كل سجل بنتيجته وسببه، والباقي بلا معالجة يُعدّ لا ناجحًا.
      lastReport = globalThis.NeprasAcceptPlan.buildReport({
        fileName: fileForReport, parsed: parsedForReport, done, skipped, errors, notFound: Array.from(pending.values()),
        stopped: stopRequested, fatalError, startedAt, finishedAt: new Date()
      });
      const tone = { done: "ok", warn: "warn", stopped: "warn", failed: "error" }[lastReport.status];
      showStatus(`${{ done: "🎉", warn: "⚠️", stopped: "⏹", failed: "❌" }[lastReport.status]} ${lastReport.headline} — التفاصيل في «تقرير Excel».`, tone);
      if (startBtn) startBtn.disabled = importedRecords.length === 0;
      if (stopBtn) stopBtn.disabled = true;
      if (reportBtn) reportBtn.disabled = false;
    }
  }

  function ensureAcceptToolbar() {
    if (!isAcceptPage()) {
      document.getElementById(BAR_ID)?.remove();
      return;
    }
    createToolbar();
  }

  if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action !== "STOP_ACCEPT_LIST") return false;
      stopRequested = true;
      showStatus(running ? "⏹ جارٍ إيقاف عملية قبول الملفات بعد الخطوة الحالية..." : "⏹ لا توجد عملية قبول ملفات تعمل الآن.", "warn");
      sendResponse?.({ ok: true, running });
      return true;
    });
  }

  // Angular SPA: نعيد الفحص بدون إعادة تحميل الصفحة.
  setTimeout(ensureAcceptToolbar, 700);
  setTimeout(ensureAcceptToolbar, 1500);
  setTimeout(ensureAcceptToolbar, 3000);
  setInterval(ensureAcceptToolbar, 1500);
  window.addEventListener("hashchange", () => setTimeout(ensureAcceptToolbar, 300));
  window.addEventListener("popstate", () => setTimeout(ensureAcceptToolbar, 300));
})();
