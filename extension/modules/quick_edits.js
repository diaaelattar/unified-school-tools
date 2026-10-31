// ============================================================
// نبراس — أداة تعديل التخصص واللغات المتقدمة
// تدعم تعديل اللغة الأولى، اللغة الثانية، والشعبة/التخصص لصفوف الثانوي والفني
// تدعم التعديل الفردي عبر ملفات Excel والتعديل الجماعي المباشر للفصل أو الصف بالكامل
// ============================================================

(function () {
  "use strict";

  // حالة الإيقاف والتحكم
  let isCancelled = false;

  function neprasQuickEditsStopRequested() {
    try {
      return isCancelled ||
        window.__NEPRAS_STOP_ALL_REQUESTED__ === true ||
        (typeof window.neprasIsGlobalStopRequested === "function" && window.neprasIsGlobalStopRequested());
    } catch (_) {
      return isCancelled;
    }
  }

  function neprasQuickEditsResetStop() {
    isCancelled = false;
  }

  function neprasQuickEditsRequestStop() {
    isCancelled = true;
    try {
      if (typeof window.neprasRequestGlobalStop === "function") {
        window.neprasRequestGlobalStop("quick_edits_stop");
      }
    } catch (_) {}
  }

  function sleep(ms) {
    return new Promise((resolve) => {
      const start = Date.now();
      const interval = 100;
      const check = () => {
        if (neprasQuickEditsStopRequested()) {
          resolve(false);
          return;
        }
        if (Date.now() - start >= ms) {
          resolve(true);
          return;
        }
        setTimeout(check, interval);
      };
      check();
    });
  }

  async function persistQuickEditsState(state) {
    try {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        await chrome.storage.local.set({
          nepras_quick_edits_active_results: {
            ...state,
            timestamp: Date.now()
          }
        });
      }
    } catch (_) {}
  }

  // قاموس اللغات المعتمدة في منظومة الوزارة
  const LANGUAGES_MAP = {
    "1": "لغة انجليزية",
    "2": "لغة فرنسية",
    "3": "لغة المانية",
    "4": "لغة ايطالية",
    "5": "لغة اسبانية",
    "6": "لغة صينية",
    "7": "معفي",
    "8": "لغة روسية",
    "9": "لغة يابانية"
  };

  /**
   * تحويل اسم اللغة بالعربية أو الإنجليزية إلى كود اللغة في الوزارة
   * @param {string|number} rawLang
   * @returns {string} كود اللغة
   */
  function resolveLanguageCode(rawLang) {
    if (rawLang == null) return "";
    const clean = String(rawLang).trim();
    if (LANGUAGES_MAP[clean]) return clean;

    const norm = clean
      .replace(/[أإآ]/g, "ا")
      .replace(/ة/g, "ه")
      .replace(/ى/g, "ي")
      .toLowerCase();

    if (norm.includes("معف") || norm.includes("اعفاء") || norm.includes("exempt")) return "7";
    if (norm.includes("انجل") || norm.includes("انجليز") || norm.includes("eng")) return "1";
    if (norm.includes("فرنس") || norm.includes("فرنساوي") || norm.includes("fren")) return "2";
    if (norm.includes("المان") || norm.includes("germ")) return "3";
    if (norm.includes("ايطال") || norm.includes("ital")) return "4";
    if (norm.includes("اسبان") || norm.includes("span")) return "5";
    if (norm.includes("صين") || norm.includes("chin")) return "6";
    if (norm.includes("روس") || norm.includes("russ")) return "8";
    if (norm.includes("يابان") || norm.includes("japan")) return "9";

    return "";
  }

  /**
   * تحويل كود نوع التعديل
   * 0: اللغة الأولى
   * 1: اللغة الثانية
   * 2: التخصص / الشعبة
   */
  const EDIT_TYPES = [
    { code: "0", label: "اللغة الأولى", controlName: "firstLangControl" },
    { code: "1", label: "اللغة الثانية", controlName: "secondLangControl" },
    { code: "2", label: "التخصص / الشعبة", controlName: "specControl" }
  ];

  /**
   * تفعيل تغيير القوائم المنسدلة في Angular مع مطابقة الخيار وإرسال كافة الأحداث الرسمية
   */
  function setAngularSelectValue(selectElem, val) {
    if (!selectElem) return false;
    const strVal = String(val).trim();

    // 1. البحث عن الخيار المطابق بالقيمة أو النص وتحديده صراحة
    let foundIndex = -1;
    if (selectElem.options && selectElem.options.length) {
      for (let i = 0; i < selectElem.options.length; i++) {
        const opt = selectElem.options[i];
        if (opt.value === strVal || opt.text.trim() === strVal || (strVal.length > 2 && opt.text.trim().includes(strVal))) {
          foundIndex = i;
          break;
        }
      }
    }

    if (foundIndex >= 0) {
      for (let j = 0; j < selectElem.options.length; j++) {
        selectElem.options[j].selected = (j === foundIndex);
      }
      selectElem.selectedIndex = foundIndex;
      selectElem.value = selectElem.options[foundIndex].value;
    } else {
      selectElem.value = strVal;
    }

    // 2. إرسال أحداث التفاعل الرسمية لـ Angular لضمان تفعيل الحقل ونقله لحالة dirty وvalid
    try { selectElem.focus(); } catch (_) {}
    selectElem.dispatchEvent(new Event("focus", { bubbles: true, composed: true }));
    selectElem.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    selectElem.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    try { selectElem.blur(); } catch (_) {}
    try { selectElem.dispatchEvent(new CustomEvent("blur", { bubbles: true, composed: true })); } catch (_) {}
    return true;
  }

  /**
   * قراءة ومطابقة صفوف الطلاب من ملف Excel
   */
  function parseQuickEditsExcel(rows, headers) {
    if (!Array.isArray(rows) || !rows.length) return [];

    let idxCode = -1;
    let idxGrade = -1;
    let idxClass = -1;
    let idxL1 = -1;
    let idxL2 = -1;
    let idxSpec = -1;

    const cleanHeaders = (headers || Object.keys(rows[0] || {})).map(h => String(h || "").trim());

    cleanHeaders.forEach((h, i) => {
      const norm = h.replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي");
      if (norm.includes("كود") || norm.includes("studentcode") || norm.includes("الرقم القومي") || norm.includes("code")) {
        if (idxCode === -1) idxCode = i;
      }
      if (norm.includes("صف") || norm.includes("مرحله") || norm.includes("level")) {
        if (idxGrade === -1) idxGrade = i;
      }
      if (norm.includes("فصل") || norm.includes("class")) {
        if (idxClass === -1) idxClass = i;
      }
      if (norm.includes("لغه اولي") || norm.includes("اللغه الاولي") || norm.includes("lang1") || norm.includes("l1")) {
        idxL1 = i;
      }
      if (norm.includes("لغه ثانيه") || norm.includes("اللغه الثانيه") || norm.includes("lang2") || norm.includes("l2")) {
        idxL2 = i;
      }
      if (norm.includes("تخصص") || norm.includes("شعبه") || norm.includes("spec") || norm.includes("track")) {
        idxSpec = i;
      }
    });

    if (idxCode === -1) idxCode = 0; // افتراض أول عمود إن لم يوجد اسم صريح

    return rows.map((r, rowIndex) => {
      const rowArr = Array.isArray(r) ? r : cleanHeaders.map(h => r[h]);
      const code = String(rowArr[idxCode] || "").trim();
      const grade = idxGrade >= 0 ? String(rowArr[idxGrade] || "").trim() : "";
      const classNo = idxClass >= 0 ? String(rowArr[idxClass] || "").trim() : "";
      const l1 = idxL1 >= 0 ? String(rowArr[idxL1] || "").trim() : "";
      const l2 = idxL2 >= 0 ? String(rowArr[idxL2] || "").trim() : "";
      const spec = idxSpec >= 0 ? String(rowArr[idxSpec] || "").trim() : "";

      return {
        rowIndex: rowIndex + 1,
        code,
        grade,
        classNo,
        l1,
        l1Code: resolveLanguageCode(l1),
        l2,
        l2Code: resolveLanguageCode(l2),
        spec,
        rawRow: r
      };
    }).filter(item => Boolean(item.code));
  }

  /**
   * إنشاء نموذج Excel فارغ لتعديل التخصص واللغات
   */
  function buildQuickEditsTemplateWorkbook(xlsxLib) {
    const lib = xlsxLib || globalThis.XLSX;
    if (!lib) throw new Error("مكتبة Excel غير محملة.");

    const headers = [
      "كود التلميذ",
      "اسم التلميذ (اختياري)",
      "الصف",
      "الفصل",
      "اللغة الأولى",
      "اللغة الثانية",
      "الشعبة / التخصص"
    ];

    const sampleRows = [
      headers,
      ["1234567", "مثال: حسام علي حسن", "الصف الأول", "1", "لغة انجليزية", "لغة فرنسية", "عام"],
      ["2345678", "مثال: مريم خالد إبراهيم", "الصف الثاني", "2", "لغة انجليزية", "لغة المانية", "علمي"],
      ["3456789", "مثال: كيرلس سمير جرجس", "الصف الثالث", "1", "لغة انجليزية", "معفي", "أدبي"]
    ];

    const ws = lib.utils.aoa_to_sheet(sampleRows);
    ws["!cols"] = [
      { wch: 16 }, { wch: 28 }, { wch: 14 }, { wch: 10 }, { wch: 18 }, { wch: 18 }, { wch: 20 }
    ];
    ws["!views"] = [{ RTL: true }];

    const wb = lib.utils.book_new();
    lib.utils.book_append_sheet(wb, ws, "تعديل_التخصص_واللغات");
    return wb;
  }

  /**
   * إنشاء كشف نتائج عملية تعديل التخصص واللغات
   */
  function buildQuickEditsResultsWorkbook(records, results, xlsxLib) {
    const lib = xlsxLib || globalThis.XLSX;
    if (!lib) throw new Error("مكتبة Excel غير محملة.");

    const outHeaders = [
      "م",
      "كود التلميذ",
      "اسم التلميذ",
      "الصف",
      "الفصل",
      "نوع التعديل",
      "القيمة المطلوبة",
      "حالة التعديل",
      "السبب والتفاصيل"
    ];

    const outRows = [outHeaders];

    results.forEach((item, idx) => {
      outRows.push([
        idx + 1,
        item.code || "—",
        item.name || "—",
        item.grade || "—",
        item.classNo || "—",
        item.editTypeLabel || item.editType || "—",
        item.targetValue || "—",
        item.success ? "تم الحفظ بنجاح" : (item.skipped ? "تخطي" : "فشل"),
        item.reason || ""
      ]);
    });

    const ws = lib.utils.aoa_to_sheet(outRows);
    ws["!views"] = [{ RTL: true }];

    const summaryRows = [
      ["تقرير نتائج تعديل التخصص واللغات"],
      [""],
      ["البيان", "العدد"],
      ["إجمالي السجلات المفحوصة", results.length],
      ["تم التعديل والحفظ بنجاح", results.filter(r => r.success).length],
      ["تم التخطي (محدث مسبقاً / غير مطلوب)", results.filter(r => r.skipped).length],
      ["سجلات فشل تعديلها", results.filter(r => !r.success && !r.skipped).length]
    ];
    const wsSummary = lib.utils.aoa_to_sheet(summaryRows);
    wsSummary["!views"] = [{ RTL: true }];

    const wb = lib.utils.book_new();
    lib.utils.book_append_sheet(wb, ws, "نتائج_التعديلات");
    lib.utils.book_append_sheet(wb, wsSummary, "ملخص_التعديل");

    return wb;
  }

  // ============================================================
  // محرك التنفيذ الآلي على صفحة موقع الوزارة (DOM Automation)
  // ============================================================

  /**
   * انتظار اكتمال تحميل جدول الطلاب في الصفحة
   */
  async function waitForTableLoad(maxWaitMs = 6000) {
    const start = Date.now();
    await sleep(400);
    while (Date.now() - start < maxWaitMs) {
      if (neprasQuickEditsStopRequested()) return false;
      const rows = document.querySelectorAll("#DataTables_Table_1 tbody tr, table.dataTable tbody tr, table tbody tr");
      if (rows.length > 0) {
        const firstText = rows[0].innerText.trim();
        if (!/لا توجد بيانات|No data|جاري التحميل/i.test(firstText)) {
          return true;
        }
      }
      await sleep(250);
    }
    return false;
  }

  /**
   * توسيع عدد صفوف الجدول ليظهر 100 طالب لتفادي الصفحات المقسمة
   */
  async function ensureAllRowsVisible() {
    const lengthSel = document.querySelector('select[name*="length"], .dataTables_length select');
    if (lengthSel) {
      const opts = Array.from(lengthSel.options || []);
      const opt100 = opts.find(o => o.value === "100" || o.value === "50" || parseInt(o.value) >= 100);
      const targetOpt = opt100 || opts[opts.length - 1];
      if (targetOpt && lengthSel.value !== targetOpt.value) {
        setAngularSelectValue(lengthSel, targetOpt.value);
        await sleep(700);
      }
    }
  }

  /**
   * الضغط على زر الحفظ وتأكيد الحفظ في النوافذ المنبثقة (SweetAlert)
   */
  async function waitForAndConfirmSave(maxWaitMs = 5000) {
    const start = Date.now();
    let confirmed = false;

    while (Date.now() - start < maxWaitMs) {
      const container = document.querySelector(".swal2-popup, .swal2-container, .swal2-modal, .modal.show, [role='dialog']");
      if (container) {
        const swalConfirm = container.querySelector(".swal2-confirm") ||
          Array.from(container.querySelectorAll("button, input[type='button'], a.btn")).find(b =>
            /نعم|تاكيد|تأكيد|حفظ|موافق|yes|ok|confirm/i.test(b.innerText || "")
          );

        if (swalConfirm && swalConfirm.offsetParent !== null) {
          swalConfirm.click();
          confirmed = true;
          await sleep(1000);

          // إغلاق أي نافذة لاحقة ("تم الحفظ بنجاح")
          const secondary = document.querySelector(".swal2-confirm, .swal2-actions button");
          if (secondary && secondary.offsetParent !== null) {
            secondary.click();
          }
          break;
        }
      }
      await sleep(250);
    }
    return confirmed;
  }

  /**
   * البحث عن القائمة المنسدلة للغة أو التخصص في النموذج العلوي لصفحة الوزارة
   */
  function findTopLanguageSelect() {
    // 1. بالمعرفات الرسمية الأكثر شيوعاً في منظومة الوزارة
    const candidates = [
      'select[formcontrolname="firstLangControl"]',
      'select[formcontrolname="secondLangControl"]',
      'select[formcontrolname="langControl"]',
      'select[formcontrolname="languageControl"]',
      'select[formcontrolname="specControl"]'
    ];
    for (const selStr of candidates) {
      const el = document.querySelector(selStr);
      if (el && el.offsetParent !== null) return el;
    }

    // 2. أي قائمة منسدلة ظاهرة داخل النموذج بخلاف الصف والفصل ونوع التعديل
    const allSelects = Array.from(document.querySelectorAll("form select.form-select, form select"));
    for (const s of allSelects) {
      const fcn = s.getAttribute("formcontrolname") || "";
      if (["levelControl", "classControl", "editTypeControl"].includes(fcn)) continue;
      if (s.offsetParent !== null) {
        return s;
      }
    }

    // 3. مطابقة على القوائم التي تحتوي خيارات اللغات
    for (const s of allSelects) {
      const text = s.innerText || "";
      if (text.includes("فرنسية") || text.includes("انجليزية") || text.includes("اختر اللغة")) {
        return s;
      }
    }

    return null;
  }

  /**
   * إلغاء تحديد كافة صفوف الجدول ورأس الجدول لضمان دقة العمل
   */
  function uncheckAllTableRows() {
    const allCheckboxes = document.querySelectorAll(
      "#DataTables_Table_1 tbody input[type='checkbox'], table.dataTable tbody input[type='checkbox'], table tbody input[type='checkbox']"
    );
    allCheckboxes.forEach(chk => {
      if (chk.checked) {
        chk.checked = false;
        chk.dispatchEvent(new Event("input", { bubbles: true }));
        chk.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });

    const headerChk = document.querySelector(
      "#DataTables_Table_1 thead input[type='checkbox'], table thead input[type='checkbox']"
    );
    if (headerChk && headerChk.checked) {
      headerChk.checked = false;
      headerChk.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  /**
   * التنفيذ الفعلي لعملية تعديل التخصص واللغات
   */
  async function executeQuickEdits(payload, onProgress) {
    if (typeof document === "undefined") {
      throw new Error("لا يمكن تشغيل التنفيذ الآلي خارج بيئة المتصفح.");
    }

    const levelSelect = document.querySelector('select[formcontrolname="levelControl"], select#levelControl');
    const classSelect = document.querySelector('select[formcontrolname="classControl"], select#classControl');
    const editTypeSelect = document.querySelector('select[formcontrolname="editTypeControl"]');

    if (!levelSelect && !classSelect && !editTypeSelect) {
      throw new Error("يرجى فتح صفحة تعديل اللغات والتخصص بموقع الوزارة أولاً (student.emis.gov.eg).");
    }

    neprasQuickEditsResetStop();

    const scope = payload.options?.scope || "grade"; // "grade" | "class"
    const targetGrade = String(payload.options?.grade || "1");
    const targetClass = String(payload.options?.classNo || "");
    const mode = payload.mode || "excel"; // "direct" | "excel"
    const records = payload.records || [];
    const directEditType = String(payload.options?.directEditType || "1"); // 0=l1, 1=l2, 2=spec
    const directValue = String(payload.options?.directValue || "2"); // مثلاً 2 للفرنسية

    // 1. اختيار وتأكيد الصف الدراسي أولاً
    if (levelSelect) {
      setAngularSelectValue(levelSelect, targetGrade);
      await sleep(1200); // انتظار تحميل قائمة الفصول التابعة لهذا الصف
    }

    // 2. حصر الفصول المطلوب العمل عليها لهذا الصف
    let classesToProcess = [];
    if (scope === "class" && targetClass) {
      classesToProcess = [{ value: targetClass, text: `فصل ${targetClass}` }];
    } else {
      let freshClassSelect = document.querySelector('select[formcontrolname="classControl"], select#classControl');
      let waitOptCount = 0;
      while (freshClassSelect && freshClassSelect.options.length <= 1 && waitOptCount < 8) {
        await sleep(300);
        waitOptCount++;
        freshClassSelect = document.querySelector('select[formcontrolname="classControl"], select#classControl');
      }

      const opts = Array.from(freshClassSelect ? freshClassSelect.options : []);
      classesToProcess = opts
        .filter(o => o.value !== "-1" && o.value !== "" && o.value !== "0")
        .map(o => ({ value: o.value, text: o.text.trim() || `فصل ${o.value}` }));

      if (!classesToProcess.length) {
        for (let c = 1; c <= 20; c++) classesToProcess.push({ value: String(c), text: `فصل ${c}` });
      }
    }

    // بناء خريطة السجلات لملف Excel
    const recordMap = new Map();
    if (mode === "excel") {
      records.forEach(r => {
        if (r.code) recordMap.set(String(r.code).trim(), r);
      });
    }

    const results = [];
    let totalUpdated = 0;
    let totalProcessed = 0;

    await persistQuickEditsState({
      status: "running",
      mode,
      targetGrade,
      targetClass,
      directEditType,
      directValue,
      recordsCount: records.length,
      records,
      results: [],
      totalProcessed: 0,
      totalUpdated: 0,
      completed: false
    });

    // 3. التنقل بين الفصول وتعديل الطلاب
    for (let cIdx = 0; cIdx < classesToProcess.length; cIdx++) {
      if (neprasQuickEditsStopRequested()) break;

      const classItem = classesToProcess[cIdx];
      const classProgressMsg = `جاري تأكيد الصف وتجهيز ${classItem.text} (${cIdx + 1} من ${classesToProcess.length})...`;

      if (typeof window.showFloatingStatus === "function") {
        window.showFloatingStatus(`⏳ ${classProgressMsg}`);
      }

      if (onProgress) {
        onProgress({
          phase: "class_start",
          currentClass: classItem.text,
          classIndex: cIdx + 1,
          totalClasses: classesToProcess.length,
          totalUpdated,
          message: classProgressMsg
        });
      }

      // 🌟 إعادة جلب عنصر الصف وتأكيد اختياره دائماً قبل معالجة أي فصل! 🌟
      const curLevelSelect = document.querySelector('select[formcontrolname="levelControl"], select#levelControl');
      if (curLevelSelect) {
        setAngularSelectValue(curLevelSelect, targetGrade);
        await sleep(800); // إتاحة وقت كافٍ لـ Angular لتثبيت الصف وتحميل الفصول
      }

      // 🌟 إعادة جلب عنصر الفصل واختياره وتأكيد اختياره 🌟
      const curClassSelect = document.querySelector('select[formcontrolname="classControl"], select#classControl');
      if (curClassSelect) {
        setAngularSelectValue(curClassSelect, classItem.value);
        await sleep(1800); // إتاحة وقت للاتصال بالسيرفر وجلب جدول الطلاب
      }

      // انتظار تحميل الجدول
      const tableLoaded = await waitForTableLoad(5000);
      if (!tableLoaded) {
        continue; // الفصل فارغ أو تعذر تحميله
      }

      // إظهار كافة صفوف الفصل
      await ensureAllRowsVisible();

      const rows = Array.from(document.querySelectorAll("#DataTables_Table_1 tbody tr, table.dataTable tbody tr, table tbody tr"));

      // ────────────────────────────────────────────────────────────
      // المسار الأول: التطبيق المباشر (Direct Bulk)
      // يتم اختيار نوع التعديل ثم اختيار اللغة المحددة من الكمبوبوكس العلوي بالموقع،
      // ثم تحديد الطلاب والضغط على حفظ
      // ────────────────────────────────────────────────────────────
      if (mode === "direct") {
        // 1. تحديد نوع التعديل في رأس الصفحة (0 للغة الأولى، 1 للغة الثانية، 2 للتخصص)
        if (editTypeSelect && editTypeSelect.value !== directEditType) {
          setAngularSelectValue(editTypeSelect, directEditType);
          await sleep(500);
        }

        // 2. اختيار اللغة المحددة من الكمبوبوكس الخاص بها في الموقع أولاً
        const topLangSelect = findTopLanguageSelect();
        if (topLangSelect) {
          setAngularSelectValue(topLangSelect, directValue);
          await sleep(400);
        }

        // 3. تحديد الطلاب بالجدول وتحديث خياراتهم
        uncheckAllTableRows();
        let classModifiedCount = 0;

        for (let rIdx = 0; rIdx < rows.length; rIdx++) {
          if (neprasQuickEditsStopRequested()) break;
          const tr = rows[rIdx];
          const tds = Array.from(tr.querySelectorAll("td"));
          if (tds.length < 3) continue;

          totalProcessed++;

          let code = "";
          if (tds[1]) {
            const m = tds[1].innerText.trim().match(/\b\d{6,14}\b/);
            if (m) code = m[0];
          }
          if (!code) {
            for (const td of tds) {
              const m = td.innerText.trim().match(/\b\d{6,14}\b/);
              if (m) { code = m[0]; break; }
            }
          }
          const studentName = tds[2] ? tds[2].innerText.trim() : "";

          // تحديث القائمة المنسدلة في صف الطالب لتطابق القيمة
          const selL1 = tds[3]?.querySelector("select") || tr.querySelector("td:nth-child(4) select");
          const selL2 = tds[4]?.querySelector("select") || tr.querySelector("td:nth-child(5) select");

          if (directEditType === "0" && selL1) {
            setAngularSelectValue(selL1, directValue);
          } else if (directEditType === "1" && selL2) {
            setAngularSelectValue(selL2, directValue);
          } else if (directEditType === "2") {
            const selSpec = tds[5]?.querySelector("select") || tr.querySelector("td:nth-child(6) select");
            if (selSpec) setAngularSelectValue(selSpec, directValue);
          }

          // تحديد مربع الاختيار للطالب
          const chk = tr.querySelector("input[type='checkbox']");
          if (chk) {
            chk.checked = true;
            chk.dispatchEvent(new Event("input", { bubbles: true }));
            chk.dispatchEvent(new Event("change", { bubbles: true }));
            try { chk.dispatchEvent(new Event("click", { bubbles: true })); } catch (_) {}
          }

          classModifiedCount++;
          totalUpdated++;

          results.push({
            code: code || "—",
            name: studentName,
            grade: targetGrade,
            classNo: classItem.value,
            success: true,
            reason: `تم التعديل بالقيمة المطلوبة (${LANGUAGES_MAP[directValue] || directValue})`
          });
        }

        // تحديد خانة رأس الجدول لتأكيد التحديد الكلي في Angular
        const theadChk = document.querySelector("#DataTables_Table_1 thead input[type='checkbox'], table thead input[type='checkbox']");
        if (theadChk && !theadChk.checked) {
          theadChk.checked = true;
          theadChk.dispatchEvent(new Event("change", { bubbles: true }));
        }

        // 4. الضغط على زر الحفظ وتأكيد الحفظ
        if (classModifiedCount > 0) {
          if (typeof window.showFloatingStatus === "function") {
            window.showFloatingStatus(`💾 جاري حفظ ${classItem.text} (${LANGUAGES_MAP[directValue] || directValue})...`);
          }

          const saveBtn = document.querySelector(".buttonBlock button[type='submit'], button.btn-success[type='submit'], button[type='submit'].btn-success");
          if (saveBtn) {
            try { saveBtn.scrollIntoView({ block: "center" }); } catch (_) {}
            await sleep(300);
            saveBtn.click();
            await sleep(600);
            await waitForAndConfirmSave(5000);
            await sleep(1500);
          }
        }
      }
      // ────────────────────────────────────────────────────────────
      // المسار الثاني: التطبيق عبر ملف Excel (Smart Language Batches)
      // تجميع الطلاب حسب كل لغة محددة، واختيار كل لغة على حدة في الكمبوبوكس العلوي
      // ثم تحديد طلاب تلك اللغة وحفظهم، وتكرار ذلك لكل لغة
      // ────────────────────────────────────────────────────────────
      else {
        // حصر طلاب الفصل وتصنيفهم حسب نوع التعديل واللغة المطلوبة
        const targetEditType = directEditType; // افتراضياً اللغة الثانية أو الأولى
        if (editTypeSelect && editTypeSelect.value !== targetEditType) {
          setAngularSelectValue(editTypeSelect, targetEditType);
          await sleep(500);
        }

        // تجميع الطلاب حسب كود اللغة المطلوبة في هذا الفصل
        const langGroups = new Map(); // langCode -> Array of { tr, code, name, targetVal, rowSelect }

        for (let rIdx = 0; rIdx < rows.length; rIdx++) {
          const tr = rows[rIdx];
          const tds = Array.from(tr.querySelectorAll("td"));
          if (tds.length < 3) continue;

          totalProcessed++;

          let code = "";
          if (tds[1]) {
            const m = tds[1].innerText.trim().match(/\b\d{6,14}\b/);
            if (m) code = m[0];
          }
          if (!code) {
            for (const td of tds) {
              const m = td.innerText.trim().match(/\b\d{6,14}\b/);
              if (m) { code = m[0]; break; }
            }
          }
          const studentName = tds[2] ? tds[2].innerText.trim() : "";

          if (code && recordMap.has(code)) {
            const rec = recordMap.get(code);
            let targetVal = "";
            let rowSelect = null;

            if (targetEditType === "0") {
              targetVal = rec.l1Code;
              rowSelect = tds[3]?.querySelector("select") || tr.querySelector("td:nth-child(4) select");
            } else if (targetEditType === "1") {
              targetVal = rec.l2Code;
              rowSelect = tds[4]?.querySelector("select") || tr.querySelector("td:nth-child(5) select");
            } else if (targetEditType === "2") {
              targetVal = rec.spec;
              rowSelect = tds[5]?.querySelector("select") || tr.querySelector("td:nth-child(6) select");
            }

            if (targetVal) {
              if (!langGroups.has(targetVal)) langGroups.set(targetVal, []);
              langGroups.get(targetVal).push({ tr, code, name: studentName, targetVal, rowSelect });
            }
          }
        }

        // تنفيذ الحفظ لكل لغة على حدة في هذا الفصل
        for (const [langCode, studentList] of langGroups.entries()) {
          if (neprasQuickEditsStopRequested()) break;
          if (!studentList.length) continue;

          const langLabel = LANGUAGES_MAP[langCode] || `كود ${langCode}`;
          if (typeof window.showFloatingStatus === "function") {
            window.showFloatingStatus(`⏳ جاري ضبط كمبوبوكس اللغة: (${langLabel}) لـ ${studentList.length} طالب بـ ${classItem.text}...`);
          }

          // 1. اختيار اللغة المحددة من الكمبوبوكس الخاص بها في الموقع أولاً
          const topLangSelect = findTopLanguageSelect();
          if (topLangSelect) {
            setAngularSelectValue(topLangSelect, langCode);
            await sleep(400);
          }

          // 2. إلغاء تحديد كافة الطلاب أولاً لضمان عدم إرسال طلاب لغة أخرى
          uncheckAllTableRows();

          // 3. تحديد فقط الطلاب التابعين لهذه اللغة وتحديث قوائمهم
          studentList.forEach(st => {
            const chk = st.tr.querySelector("input[type='checkbox']");
            if (chk) {
              chk.checked = true;
              chk.dispatchEvent(new Event("input", { bubbles: true }));
              chk.dispatchEvent(new Event("change", { bubbles: true }));
              try { chk.dispatchEvent(new Event("click", { bubbles: true })); } catch (_) {}
            }
            if (st.rowSelect) {
              setAngularSelectValue(st.rowSelect, langCode);
            }
            totalUpdated++;
            results.push({
              code: st.code,
              name: st.name,
              grade: targetGrade,
              classNo: classItem.value,
              success: true,
              reason: `تم التعديل وحفظ لغة: ${langLabel}`
            });
          });

          // 4. الضغط على زر الحفظ وتأكيد الحفظ لهذه اللغة
          if (typeof window.showFloatingStatus === "function") {
            window.showFloatingStatus(`💾 جاري حفظ طلاب (${langLabel}) في ${classItem.text}...`);
          }

          const saveBtn = document.querySelector(".buttonBlock button[type='submit'], button.btn-success[type='submit'], button[type='submit'].btn-success");
          if (saveBtn) {
            try { saveBtn.scrollIntoView({ block: "center" }); } catch (_) {}
            await sleep(300);
            saveBtn.click();
            await sleep(600);
            await waitForAndConfirmSave(5000);
            await sleep(1500);
          }
        }
      }

      await sleep(1000);

      await persistQuickEditsState({
        status: "running",
        mode,
        targetGrade,
        targetClass,
        directEditType,
        directValue,
        recordsCount: records.length,
        records,
        results,
        totalProcessed,
        totalUpdated,
        completed: false
      });
    }

    if (typeof window.hideFloatingStatus === "function") {
      window.hideFloatingStatus();
    }

    const finalResult = {
      ok: true,
      status: "completed",
      totalProcessed,
      totalUpdated,
      successCount: totalUpdated,
      failCount: results.filter(r => !r.success && !r.skipped).length,
      skippedCount: results.filter(r => r.skipped).length,
      classesCount: classesToProcess.length,
      records,
      results,
      completed: true
    };
    await persistQuickEditsState(finalResult);
    return finalResult;
  }

  // التصدير وتجميد الكائن
  const NeprasQuickEdits = Object.freeze({
    LANGUAGES_MAP,
    EDIT_TYPES,
    resolveLanguageCode,
    parseQuickEditsExcel,
    buildQuickEditsTemplateWorkbook,
    buildQuickEditsResultsWorkbook,
    executeQuickEdits,
    requestStop: neprasQuickEditsRequestStop,
    resetStop: neprasQuickEditsResetStop,
    isStopRequested: neprasQuickEditsStopRequested
  });

  globalThis.NeprasQuickEdits = NeprasQuickEdits;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = NeprasQuickEdits;
  }
})();
