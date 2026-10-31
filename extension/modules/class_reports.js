// ==========================================================
// 📚 نبراس - قوائم الفصول | v1.0 Download-ID tracking
// صفحة الوزارة: https://student.emis.gov.eg/class/report
// ==========================================================

(() => {
  const REPORT_URL = "https://student.emis.gov.eg/class/report";
  const TASK_KEY = "pendingClassReportTask";
  const WAIT_GRADE_OPTIONS_MS = 12000;
  const WAIT_CLASS_OPTIONS_MS = 12000;
  const WAIT_CLASS_POPULATE_MS = 12000;
  const DOWNLOAD_TIMEOUT_MS = 45000;
  const BETWEEN_CLASSES_MS = 900;

  let running = false;
  let cancelled = false;
  let activeDownloadCancel = null;

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  function norm(text) {
    return String(text || "")
      .replace(/\u00A0/g, " ")
      .replace(/[أإآ]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/ة/g, "ه")
      .replace(/[ًٌٍَُِّْـ]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function compact(text) {
    return norm(text).replace(/[\s\-–—_]/g, "");
  }

  function status(text, ok = null) {
    try {
      if (typeof showFloatingStatus === "function") { showFloatingStatus(text, ok); return; }
    } catch (_) {}
    window.NeprasLegacy?.status(text, ok);
  }

  // بطاقة التقدّم الموحّدة (ui/nepras-ui.js): عملية طويلة بزر إيقاف، وتنتهي بملخص نجاح/إيقاف/خطأ.
  function progressStatus(current, total, title = "جاري تجهيز قوائم الفصول", subtitle = "", tone = "green") {
    const L = window.NeprasLegacy;
    if (!L) return;
    if (tone === "orange" && /^تم إيقاف/.test(title)) { L.status(`⏹ ${title}\n${subtitle}`); return; }
    if (tone === "orange" && /^تم /.test(title)) { L.status(`⚠️ ${title}\n${subtitle}`); return; }
    if (tone === "green" && /^تم /.test(title)) { L.status(`✅ ${title}\n${subtitle}`, true); return; }
    L.progress(title, current, total, subtitle, tone, { onStop: () => stopClassReportTask() });
  }

  async function fetchClassReportDirectBytesV1766(gradeValue, classValue) {
    const result = await chrome.runtime.sendMessage({
      action: "NEPRAS_CLASS_REPORT_FETCH_DIRECT_V1766",
      gradeValue: String(gradeValue ?? ""),
      classValue: String(classValue ?? "")
    });
    if (!result?.ok) throw new Error(result?.message || "تعذر تجهيز قائمة الفصل.");
    return base64ToUint8Array(result.base64 || "");
  }

  function stopClassReportTask() {
    cancelled = true;

    try {
      chrome.storage.local.remove(
        TASK_KEY
      ).catch(() => {});
    } catch (_) {}

    try {
      chrome.runtime.sendMessage({
        action:
          "CANCEL_CLASS_REPORT_DOWNLOAD_WATCH"
      }).catch(() => {});
    } catch (_) {}

    try {
      chrome.runtime.sendMessage({
        action:
          "NEPRAS_CLEANUP_COMMAND_STATE",
        scope: "student",
        reason: "class_reports_stopped"
      }).catch(() => {});
    } catch (_) {}

    try {
      activeDownloadCancel?.();
    } catch (_) {}

    activeDownloadCancel = null;

    if (running) {
      status(
        "🛑 جارٍ إيقاف عملية قوائم الفصول...",
        false
      );
    }
  }

  // يستخدمه زر الإيقاف العام الموجود في الشريط العلوي.
  window.neprasStopClassReportTask = stopClassReportTask;
  window.neprasIsClassReportRunning = () => running;

  async function waitFor(predicate, timeout, interval = 120) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      if (cancelled) throw new Error("CANCELLED");
      let value = null;
      try { value = await predicate(); } catch (_) {}
      if (value) return value;
      await sleep(interval);
    }
    return null;
  }

  function visible(el) {
    if (!el) return false;
    const s = getComputedStyle(el);
    return s.display !== "none" && s.visibility !== "hidden" && el.getClientRects().length > 0;
  }

  function getReportSelects() {
    return [...document.querySelectorAll("select")].filter(visible);
  }

  function findGradeSelect() {
    const direct = document.querySelector(
      "select[formcontrolname='levelControl'], select[formcontrolname='gradeControl'], select#levelControl, select#gradeControl, select[name*='grade' i], select[name*='level' i]"
    );
    if (direct && visible(direct)) return direct;
    const selects = getReportSelects();
    const byOption = selects.find(sel => {
      const texts = [...(sel.options || [])].map(o => o.text || "");
      return texts.some(t => /صف|أول|ثان|ثالث|رابع|خامس|سادس/.test(t));
    });
    if (byOption) return byOption;
    return selects[0] || null;
  }

  function findClassSelect() {
    const direct = document.querySelector(
      "select[formcontrolname='classControl'], select#classControl, select[name='classControl'], select[name='class'], select[id*='class' i], select[name*='class' i]"
    );
    if (direct && visible(direct)) return direct;
    const selects = getReportSelects();
    const byOption = selects.find(sel => {
      const texts = [...(sel.options || [])].map(o => o.text || "");
      return texts.some(t => /فصل|1\/|2\/|3\/|4\/|5\/|6\//.test(t));
    });
    if (byOption) return byOption;
    return selects[1] || null;
  }

  function findReportButton() {
    const wanted = compact("تقرير قوائم الفصول");
    return [...document.querySelectorAll("button, a, input[type='button'], input[type='submit']")]
      .filter(visible)
      .find(el => compact(el.innerText || el.textContent || el.value || "") === wanted)
      || [...document.querySelectorAll("button, a")].filter(visible)
        .find(el => compact(el.innerText || el.textContent || "").includes(wanted));
  }

  function dispatchSelectEvents(select) {
    try {
      select.dispatchEvent(new Event("input", { bubbles: true, cancelable: true, composed: true }));
    } catch (_) {}
    try {
      select.dispatchEvent(new Event("change", { bubbles: true, cancelable: true, composed: true }));
    } catch (_) {}
    try {
      select.dispatchEvent(new Event("blur", { bubbles: true, cancelable: true, composed: true }));
    } catch (_) {}
  }

  function tryAngularSelectModel(select, value) {
    // بعض صفحات Angular تستجيب بشكل مختلف عن select.value + change.
    // نستخدم Angular DevTools API إن كانت مكشوفة، ثم نترك الـDOM يتزامن.
    try {
      const ng = window.ng;
      if (!ng || typeof ng.getDirectives !== "function") return false;
      const directives = ng.getDirectives(select) || [];
      let changed = false;
      for (const dir of directives) {
        try {
          if (dir.control && typeof dir.control.setValue === "function") {
            dir.control.setValue(String(value), { emitEvent: true, emitModelToViewChange: true, emitViewToModelChange: true });
            changed = true;
          }
        } catch (_) {}
        try {
          if (typeof dir.viewToModelUpdate === "function") {
            dir.viewToModelUpdate(String(value));
            changed = true;
          }
        } catch (_) {}
      }
      return changed;
    } catch (_) {
      return false;
    }
  }

  function nativeSelect(select, value, { userLike = false } = {}) {
    if (!select) return false;
    try {
      if (userLike) {
        try { select.focus({ preventScroll: true }); } catch (_) { try { select.focus(); } catch (_) {} }
        for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup"]) {
          try { select.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window })); } catch (_) {}
        }
      }

      const textValue = String(value);
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
      if (setter) setter.call(select, textValue);
      else select.value = textValue;

      const idx = [...(select.options || [])].findIndex(o => String(o.value) === textValue);
      if (idx >= 0) {
        for (let j = 0; j < (select.options || []).length; j++) {
          try { select.options[j].selected = (j === idx); } catch (_) {}
        }
        select.selectedIndex = idx;
      }

      // أولًا نحاول تحديث نموذج Angular الحقيقي، ثم نرسل الأحداث الأصلية.
      tryAngularSelectModel(select, textValue);
      dispatchSelectEvents(select);

      return String(select.value) === textValue;
    } catch (_) {
      return false;
    }
  }

  function classOptionsSignature() {
    const select = findClassSelect();
    if (!select) return "NO_CLASS_SELECT";
    return [...(select.options || [])]
      .map(o => `${String(o.value)}=>${compact(o.textContent || o.text || "")}`)
      .join("|");
  }

  async function selectOptionRobust(select, value, expectedText = "", timeout = 3500, verifyGradeEffect = false) {
    const wantedValue = String(value);
    const started = Date.now();
    let attempt = 0;

    while (Date.now() - started < timeout) {
      if (cancelled) throw new Error("CANCELLED");
      attempt += 1;
      const current = [...(select?.options || [])].find(o => String(o.value) === wantedValue);
      if (!current) {
        await sleep(150);
        continue;
      }

      nativeSelect(select, wantedValue, { userLike: true });

      if (attempt % 2 === 0) {
        tryAngularSelectModel(select, wantedValue);
        dispatchSelectEvents(select);
      }

      const selected = () => {
        const opt = select.options?.[select.selectedIndex];
        return !!(opt && String(select.value) === wantedValue &&
          (!expectedText || compact(opt.textContent || "") === compact(expectedText)));
      };

      if (selected()) {
        if (!verifyGradeEffect) return true;

        // لا نعتبر اختيار الصف ناجحًا لمجرد تغيير DOM value.
        // يجب أن تستجيب Angular وتملأ قائمة الفصل فعليًا.
        const effect = await waitFor(() => {
          const currentGrade = String(select?.value || "");
          const selectedTextNow = compact(select?.options?.[select.selectedIndex]?.textContent || "");
          const gradeIsApplied = currentGrade === wantedValue &&
            (!expectedText || selectedTextNow === compact(expectedText));
          if (!gradeIsApplied) return null;

          const classSelect = findClassSelect();
          const ready = classSelect && readOptions(classSelect).length > 0;
          if (!ready) return null;

          return {
            gradeValue: currentGrade,
            gradeText: selectedTextNow,
            classSignature: classOptionsSignature()
          };
        }, 4500, 120);

        if (effect) return true;
      }

      await sleep(attempt % 2 === 0 ? 180 : 120);
    }
    return false;
  }

  function chooseOptionByAliases(select, aliases) {
    const aliasCompacts = aliases.map(compact).filter(Boolean);
    const options = [...(select?.options || [])];

    // 1) أولوية مطلقة لتطابق القيمة كاملة؛ لا تستخدم includes() على value
    // لأن القيمة "-1" (الخيار الافتراضي) كانت تطابق "1" بالخطأ.
    let option = options.find(o => {
      const v = compact(o.value || "");
      return v && aliasCompacts.includes(v);
    });
    if (option) return option;

    // 2) تطابق النص كاملًا.
    option = options.find(o => {
      const t = compact(o.textContent || o.text || "");
      return t && aliasCompacts.includes(t);
    });
    if (option) return option;

    // 3) تطابق جزئي للنص فقط، وليس للقيمة.
    option = options.find(o => {
      const t = compact(o.textContent || o.text || "");
      return t && aliasCompacts.some(a => t.includes(a) || a.includes(t));
    });

    return option || null;
  }

  function readOptions(select) {
    return [...(select?.options || [])]
      .map(o => ({ value: String(o.value ?? ""), text: String(o.textContent || o.text || "").trim(), disabled: !!o.disabled }))
      .filter(o => !o.disabled && o.text && !/^(اختر|select|--)/i.test(o.text));
  }

  async function ensureOnReportPage() {
    if (!location.href.startsWith(REPORT_URL)) {
      location.href = REPORT_URL;
      await waitFor(() => location.href.startsWith(REPORT_URL), 5000, 100);
      await sleep(1200);
    }
    await waitFor(() => document.body && document.querySelectorAll("select").length >= 1, 12000, 150);
  }

  function gradeAliases(task) {
    const label = String(task.gradeText || task.grade || "").trim();
    const g = String(task.grade || "").trim();
    const stage = String(task.stage || "").trim();
    const names = [];
    if (label) names.push(label);
    if (g) names.push(g);

    const map = {
      "1": ["الصف الاول", "الصف الاول الابتدائي", "الصف الاول الاعدادي", "الصف الاول الثانوي", "الصف الاول الفني", "الأول", "الاول", "1"],
      "2": ["الصف الثاني", "الصف الثاني الابتدائي", "الصف الثاني الاعدادي", "الصف الثاني الثانوي", "الصف الثاني الفني", "الثاني", "الثانى", "2"],
      "3": ["الصف الثالث", "الصف الثالث الابتدائي", "الصف الثالث الاعدادي", "الصف الثالث الثانوي", "الصف الثالث الفني", "الثالث", "3"],
      "4": ["الصف الرابع", "الصف الرابع الابتدائي", "الصف الرابع الفني", "الرابع", "4"],
      "5": ["الصف الخامس", "الصف الخامس الابتدائي", "الصف الخامس الفني", "الخامس", "5"],
      "6": ["الصف السادس", "الصف السادس الابتدائي", "السادس", "6"]
    };
    if (map[g]) names.push(...map[g]);
    if (stage === "PRIMARY") names.push(`الصف ${g}`);
    if (stage === "PREP") names.push(`الصف ${g} الاعدادي`, `ال${g} الاعدادي`);
    if (stage === "GENERAL_SECONDARY") names.push(`الصف ${g} الثانوي`, `ال${g} الثانوي`);
    if (stage === "TECHNICAL_SECONDARY") names.push(`الصف ${g} الفني`, `ال${g} الفني`, `الصف ${g} الصناعي`, `الصف ${g} التجاري`, `الصف ${g} الزراعي`);
    return [...new Set(names)];
  }

  async function selectGrade(task) {
    const select = await waitFor(() => {
      const s = findGradeSelect();
      if (!s) return null;
      const aliases = gradeAliases(task);
      return chooseOptionByAliases(s, aliases) ? s : null;
    }, WAIT_GRADE_OPTIONS_MS, 150);

    if (!select) {
      const current = findGradeSelect();
      const options = current ? readOptions(current).map(o => o.text).join(" | ") : "NO_GRADE_SELECT";
      throw new Error(`GRADE_NOT_FOUND: ${options}`);
    }

    // في صفحة تقرير قوائم الفصول قيم الصفوف هي 1/2/3...
    // نستخدم قيمة task.grade مباشرة أولًا لأنها الأكثر موثوقية.
    const taskGradeValue = String(task.grade || "").trim();
    let option = taskGradeValue
      ? [...(select.options || [])].find(o => String(o.value) === taskGradeValue)
      : null;

    if (!option) {
      option = chooseOptionByAliases(select, gradeAliases(task));
    }

    if (!option || String(option.value) === "-1") {
      throw new Error(`GRADE_OPTION_NOT_FOUND_OR_PLACEHOLDER: ${taskGradeValue || ""}`);
    }

    // مهم عند الانتقال بين الصفوف: نعيد قائمة الفصل إلى "اختر" أولًا
    // حتى لا تعتمد عملية التحقق على اختلاف أسماء الفصول بين الصفوف.
    // أحيانًا تكون فصول الصف 1 و2 و3 بنفس القيم، ولذلك يجب أن يكون
    // معيار النجاح هو تغير الصف نفسه + إعادة تهيئة قائمة الفصل، وليس اختلاف
    // بصمة خيارات الفصل.
    const classBefore = findClassSelect();
    if (classBefore) {
      const placeholder = [...(classBefore.options || [])].find(o => String(o.value) === "-1");
      if (placeholder && String(classBefore.value) !== "-1") {
        nativeSelect(classBefore, "-1", { userLike: false });
        await sleep(180);
      }
    }

    const ok = await selectOptionRobust(select, option.value, option.textContent || option.text || "", 7000, true);
    if (!ok) {
      const actual = `${select.value}=>${String(select.options?.[select.selectedIndex]?.textContent || "").trim()}`;
      throw new Error(`GRADE_CHANGE_NOT_APPLIED_BY_ANGULAR: المطلوب ${option.value}=>${String(option.textContent || option.text || "").trim()} | الحالي ${actual}`);
    }

    // v1.0: لا نعرض رسالة تقنية منفصلة بعد اختيار الصف؛
    // نافذة التقدم الحديثة هي المصدر الوحيد لحالة العملية.
    return select;
  }

  async function collectClassOptions() {
    window.__neprasClassOptionsStableState = null;
    const stable = await waitFor(() => {
      const select = findClassSelect();
      if (!select) return null;
      const options = readOptions(select);
      if (!options.length) return null;

      const snapshot = options.map(o => `${o.value}=>${o.text}`).join("|");
      const state = window.__neprasClassOptionsStableState || { snapshot: "", hits: 0, first: Date.now() };

      if (state.snapshot === snapshot) state.hits += 1;
      else {
        state.snapshot = snapshot;
        state.hits = 1;
        state.first = Date.now();
      }
      window.__neprasClassOptionsStableState = state;

      if (state.hits >= 2 && Date.now() - state.first >= 220) {
        return { select, options };
      }
      return null;
    }, WAIT_CLASS_OPTIONS_MS + WAIT_CLASS_POPULATE_MS, 120);

    window.__neprasClassOptionsStableState = null;

    if (!stable) {
      const select = findClassSelect();
      const debug = select
        ? [...select.options].map(o => `${o.value}=>${(o.textContent || "").trim()}`).join(" | ")
        : "NO_SECOND_SELECT";
      throw new Error(`NO_CLASS_OPTIONS: ${debug}`);
    }

    return stable;
  }

  async function waitForDownloadSignal(tabbedClass, timeout = DOWNLOAD_TIMEOUT_MS) {
    return await new Promise((resolve, reject) => {
      let settled = false;

      const cleanup = () => {
        clearTimeout(timer);
        chrome.runtime.onMessage.removeListener(listener);
        if (activeDownloadCancel === cancelNow) activeDownloadCancel = null;
      };

      const cancelNow = () => {
        if (settled) return;
        settled = true;
        cleanup();
        try { chrome.runtime.sendMessage({ action: "CANCEL_CLASS_REPORT_DOWNLOAD_WATCH" }).catch(() => {}); } catch (_) {}
        reject(new Error("CANCELLED"));
      };

      activeDownloadCancel = cancelNow;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        chrome.runtime.sendMessage({ action: "CANCEL_CLASS_REPORT_DOWNLOAD_WATCH" }).catch(() => {});
        reject(new Error("PDF_DOWNLOAD_TIMEOUT"));
      }, timeout);

      const listener = (request) => {
        if (settled) return;
        if (cancelled) {
          cancelNow();
          return;
        }
        if (request.action === "CLASS_REPORT_DOWNLOAD_ERROR") {
          settled = true;
          cleanup();
          reject(new Error(request.message || "PDF_DOWNLOAD_ERROR"));
          return;
        }
        if (request.action !== "CLASS_REPORT_DOWNLOAD_READY") return;
        settled = true;
        cleanup();
        resolve(request);
      };

      chrome.runtime.onMessage.addListener(listener);
      chrome.runtime.sendMessage({
        action: "WATCH_CLASS_REPORT_DOWNLOAD",
        classValue: tabbedClass.value,
        classText: tabbedClass.text
      }).catch(err => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(err);
      });
    });
  }

  function base64ToUint8Array(base64) {
    const clean = String(base64 || "").trim();
    if (!clean) throw new Error("PDF_FETCH_EMPTY");
    const binary = atob(clean);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  async function fetchPdfBytesViaBackground(url) {
    if (!url) throw new Error("PDF_URL_MISSING");
    const result = await chrome.runtime.sendMessage({
      action: "NEPRAS_CLASS_REPORT_FETCH_PDF",
      url
    });
    if (!result?.ok) {
      throw new Error(result?.message || `PDF_BG_FETCH_HTTP_${result?.status || 0}`);
    }
    const bytes = base64ToUint8Array(result.base64 || "");
    if (bytes.byteLength < 100) throw new Error("PDF_FETCH_EMPTY");
    const sig = String.fromCharCode(...bytes.subarray(0, Math.min(bytes.length, 5)));
    if (!sig.startsWith("%PDF")) throw new Error("PDF_FETCH_NOT_PDF");
    return bytes;
  }

  async function fetchPdfBytes(url) {
    if (!url) throw new Error("PDF_URL_MISSING");

    // v1.0: المسار الأساسي يتم من Service Worker حتى لا تتدخل إضافات
    // التحميل الخارجية (IDM وغيرها) في قراءة الملف الذي سيُدمج.
    try {
      return await fetchPdfBytesViaBackground(url);
    } catch (backgroundError) {
      // احتياطي للمتصفحات التي تسمح بقراءة الرابط مباشرة من صفحة الوزارة.
      try {
        const response = await fetch(url, {
          credentials: "include",
          cache: "no-store"
        });
        if (!response.ok) throw new Error(`PDF_FETCH_HTTP_${response.status}`);
        const buffer = await response.arrayBuffer();
        if (!buffer || buffer.byteLength < 100) throw new Error("PDF_FETCH_EMPTY");
        const bytes = new Uint8Array(buffer);
        const sig = String.fromCharCode(...bytes.subarray(0, Math.min(bytes.length, 5)));
        if (!sig.startsWith("%PDF")) throw new Error("PDF_FETCH_NOT_PDF");
        return bytes;
      } catch (directError) {
        throw new Error(`PDF_FETCH_FAILED:${backgroundError?.message || backgroundError}|${directError?.message || directError}`);
      }
    }
  }


  async function fetchClassReportViaUI(cls, settleMs = 1200) {
    const classSelect = findClassSelect();
    if (!classSelect) throw new Error("قائمة الفصول غير موجودة.");

    const ok = await selectOptionRobust(classSelect, cls.value, cls.text, 5000);
    if (!ok) throw new Error(`تعذر اختيار الفصل ${cls.text}`);

    let settled = false;
    for (let sAttempt = 1; sAttempt <= 3; sAttempt++) {
      if (window.NeprasWait?.settleAfterSelect) {
        const settle = await window.NeprasWait.settleAfterSelect(classSelect, cls.value, {
          minMs: Math.max(settleMs, 1000),
          maxExtraMs: 3500,
          quietMs: 300,
          getButton: findReportButton,
          isCancelled: () => cancelled
        });
        console.info(`[ClassReports][DEBUG] ${cls.text} (${cls.value}) — استقرار الصفحة محاولة ${sAttempt}: ${settle.ok ? "تم" : "لم يكتمل (" + settle.reasons.join(",") + ")"} بعد ${settle.waitedMs}ms`);
        if (settle.ok && String(classSelect.value) === String(cls.value)) {
          settled = true;
          break;
        }
      } else {
        await sleep(settleMs);
        if (String(classSelect.value) === String(cls.value)) {
          settled = true;
          break;
        }
      }
      nativeSelect(classSelect, cls.value, { userLike: true });
      await sleep(350);
    }

    if (String(classSelect.value) !== String(cls.value)) {
      throw new Error(`تعذر تثبيت اختيار الفصل ${cls.text} في نموذج الوزارة.`);
    }

    const reportBtn = findReportButton();
    if (!reportBtn) throw new Error("زر تقرير قوائم الفصول غير موجود في الصفحة.");

    // نفعّل المراقب في الخلفية قبل الضغط على الزر لضمان التقاط الـ Download ID
    const downloadPromise = waitForDownloadSignal(cls, 30000);
    reportBtn.click();

    const signal = await downloadPromise;
    if (!signal?.url) throw new Error("لم يتم استقبال رابط تنزيل ملف PDF للفصل.");

    return await fetchPdfBytes(signal.url);
  }

  // مهلات إعادة المحاولة المتصاعدة: إن جاءت النتيجة الأولى صغيرة بشكل مريب (على الأرجح لأن الزر ضُغط قبل أن
  // يسري اختيار الفصل) يُعاد الفصل نفسه بمهلة أطول بدل الاستسلام، فالمشكلة متقطعة لا ثابتة.
  const UI_RETRY_SETTLE_MS = [1200, 2200, 3200];

  // ملف PDF يبدو سليمًا (توقيع %PDF وأكبر من ترويسة فارغة). لا يثبت أن فيه طلابًا؛ هذا بالمقارنة بالأحجام فقط.
  function looksLikePdf(bytes) {
    if (!bytes || bytes.byteLength <= 100) return false;
    return String.fromCharCode(...bytes.subarray(0, 5)).startsWith("%PDF");
  }

  /**
   * يعيد { bytes, unverified, suspicious } أو null.
   *   unverified: جاء من رابط API مباشر مُخمَّن (لا توثيق رسمي له) ولا دليل أن محتواه لهذا الفصل بالذات.
   *   suspicious: أصغر بوضوح من أحجام الفصول السابقة رغم كل المحاولات.
   */
  async function fetchClassBytesWithFallback(gradeValue, cls) {
    let lastUiBytes = null;

    // الأساس: اختيار الفصل في الصفحة فعليًا والضغط على زر التقرير الحقيقي ثم انتظار التنزيل الحقيقي (المسار المؤكد).
    for (let i = 0; i < UI_RETRY_SETTLE_MS.length; i++) {
      try {
        const bytes = await fetchClassReportViaUI(cls, UI_RETRY_SETTLE_MS[i]);
        console.info(`[ClassReports][DEBUG] ${cls.text} (${cls.value}) — محاولة UI #${i + 1} (مهلة ${UI_RETRY_SETTLE_MS[i]}ms): ${bytes ? bytes.byteLength : 0} بايت`);
        if (looksLikePdf(bytes)) {
          lastUiBytes = bytes;
          if (!classReportIsSuspiciouslySmall(bytes.byteLength)) {
            classReportRecordSize(bytes.byteLength);
            return { bytes, unverified: false, suspicious: false };
          }
          console.warn(`[ClassReports][DEBUG] ${cls.text}: الحجم (${bytes.byteLength} بايت) أصغر بشكل مريب من متوسط الفصول السابقة — إعادة محاولة بمهلة أطول.`);
        }
      } catch (uiErr) {
        console.warn(`[ClassReports] UI fetch failed for ${cls.text} (${cls.value}), attempt ${i + 1}:`, uiErr?.message || uiErr);
      }
    }

    // الاحتياط الأخير: رابط API مباشر مُخمَّن. يُجرَّب بعد كل محاولات الواجهة لا قبلها، وما يأتي منه يُعلَّم «غير مؤكد»
    // ويُذكر في رسالة النهاية، لأن سلامة توقيع PDF لا تعني أن الملف لهذا الفصل.
    try {
      const bytes = await fetchClassReportDirectBytesV1766(gradeValue, cls.value);
      console.info(`[ClassReports][DEBUG] ${cls.text} (${cls.value}) — محاولة API المباشر: ${bytes ? bytes.byteLength : 0} بايت`);
      if (looksLikePdf(bytes)) {
        classReportRecordSize(bytes.byteLength);
        return { bytes, unverified: true, suspicious: false };
      }
    } catch (apiErr) {
      console.warn(`[ClassReports] Direct API fetch failed for ${cls.text} (${cls.value}):`, apiErr?.message || apiErr);
    }

    // لا نتيجة موثوقة: نُبقي آخر نتيجة من الواجهة (مشكوك فيها) بدل تخطي الفصل، ونعلّمها ليظهر تنبيه في النهاية.
    if (lastUiBytes) return { bytes: lastUiBytes, unverified: false, suspicious: true };
    return null;
  }

  // إحصاء بسيط لأحجام ملفات PDF الناجحة في نفس عملية التشغيل، عشان نكتشف لو
  // فصل معيّن رجع بحجم أصغر بكتير من إخوته (علامة على تقرير فارغ أو ناقص)
  // بدل ما نعتمد على رقم ثابت مش هنعرف نحدده صح من غير عينات حقيقية.
  let classReportSizeSamples = [];

  function classReportResetSizeSamples() {
    classReportSizeSamples = [];
  }

  function classReportRecordSize(size) {
    classReportSizeSamples.push(size);
  }

  function classReportIsSuspiciouslySmall(size) {
    // محتاجين على الأقل عيّنتين قبل ما نحكم على أي فصل بإنه "صغير مريب" —
    // من غير مرجع كافٍ، أي حجم ممكن يكون طبيعي (فصل فيه عدد طلاب قليل فعلاً).
    if (classReportSizeSamples.length < 2) return false;
    const sorted = [...classReportSizeSamples].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    if (median < 3000) return false; // القيم كلها صغيرة أصلاً، مفيش أساس مقارنة موثوق
    return size < median * 0.35;
  }

  /**
   * يمرّ على فصول الصف فصلًا فصلًا ويصنّف كل فصل، دون أن يلمس الصفحة (الدوال الممرَّرة هي التي تفعل):
   *   fetchOne(cls) ← { bytes, unverified, suspicious } أو null، وaddToMerged(bytes) ترمي إن تعذّرت قراءة الملف.
   * التصنيف: included (دُمج) / unavailable (لم يُرجع الموقع قائمة: فارغ أو فشل) / unreadable (ملف غير سليم)،
   * ومن included ما هو unverified (رابط مُخمَّن) أو suspicious (أصغر من المتوقع).
   */
  async function collectClassPdfs(classes, { fetchOne, addToMerged, isCancelled, onProgress, retryPauseMs = 600, pauseMs = 0 }) {
    const r = { included: [], unavailable: [], unreadable: [], unverified: [], suspicious: [] };
    for (let i = 0; i < classes.length; i++) {
      if (isCancelled()) throw new Error("CANCELLED");
      const cls = classes[i];
      if (onProgress) onProgress(i, cls, r);

      let got = null;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          got = await fetchOne(cls);
          if (got) break;
        } catch (err) {
          if (isCancelled()) throw err;
        }
        if (attempt < 2) await sleep(retryPauseMs);
      }

      if (!got) {
        console.warn(`[ClassReports] Class ${cls.text} returned no PDF data (may be empty). Skipping.`);
        r.unavailable.push(cls.text);
      } else {
        try {
          await addToMerged(got.bytes);
          r.included.push(cls.text);
          if (got.unverified) r.unverified.push(cls.text);
          if (got.suspicious) r.suspicious.push(cls.text);
        } catch (pdfErr) {
          console.warn(`[ClassReports] PDF parsing failed for ${cls.text}:`, pdfErr);
          r.unreadable.push(cls.text);
        }
      }
      if (onProgress) onProgress(i + 1, null, r);
      if (pauseMs) await sleep(pauseMs);
    }
    return r;
  }

  /**
   * ملخص نهاية العملية: اسم الملف وعنوان الرسالة ونصها ولون البطاقة. النجاح الكامل وحده يُقال «بنجاح»؛
   * أي فصل ناقص أو غير مؤكد يظهر في اسم الملف (X من Y) وفي الرسالة بسببه، فلا يظن المستخدم أن الملف كامل.
   */
  function describeOutcome({ gradeText, total, result }) {
    const included = result.included.length;
    const complete = included === total;
    const clean = complete && !result.unverified.length && !result.suspicious.length && !result.unreadable.length;
    const safe = String(gradeText || "الصف").replace(/[\/:*?"<>|]/g, "_");
    const fileName = complete ? `قوائم_فصول_${safe}_${included}_فصل.pdf` : `قوائم_فصول_${safe}_${included}_من_${total}_فصل.pdf`;
    const list = (a) => a.join("، ");

    const lines = [clean
      ? `تم حفظ ملف PDF واحد يضم ${included} فصل بنجاح.`
      : `تم حفظ ملف PDF واحد (الفصول المضمَّنة: ${included} من ${total}).`];
    if (result.unavailable.length) lines.push(`لم يُضمَّن: ${list(result.unavailable)} — لم يُرجع الموقع قائمة لها (قد تكون بلا طلاب، أو تعذّر تنزيلها). إن كان فيها طلاب فأعد المحاولة.`);
    if (result.unreadable.length) lines.push(`لم يُضمَّن: ${list(result.unreadable)} — ملف PDF الذي أرجعه الموقع لها غير سليم.`);
    if (result.suspicious.length) lines.push(`⚠️ حجم قوائم ${list(result.suspicious)} أصغر من المتوقع رغم إعادة المحاولة؛ راجعها للتأكد من اكتمالها.`);
    if (result.unverified.length) lines.push(`⚠️ قوائم ${list(result.unverified)} نُزّلت بمسار احتياطي لا يمكن التأكد منه؛ راجع أن كل قائمة تخص فصلها.`);

    return {
      fileName,
      complete: clean,
      tone: clean ? "green" : "orange",
      title: clean ? "تم تجهيز قوائم الفصول بنجاح" : "تم تجهيز قوائم الفصول مع ملاحظات",
      subtitle: clean ? `تم تنزيل ملف واحد يضم ${included} فصل` : `تم تنزيل ملف (الفصول المضمَّنة: ${included} من ${total}) — راجع الرسالة للتفاصيل`,
      message: lines.join("\n")
    };
  }

  window.NeprasClassReportsCore = Object.freeze({ collectClassPdfs, describeOutcome, looksLikePdf });

  async function runTask(task) {
    if (running) {
      status("توجد عملية قوائم فصول تعمل بالفعل.", false);
      return;
    }

    try {
      await chrome.runtime.sendMessage({ action: "NEPRAS_PREPARE_COMMAND_STATE", reason: "class_reports_pre_run" });
    } catch (_) {}

    running = true;
    cancelled = false;
    classReportResetSizeSamples();
    const gradeText = String(task.gradeText || task.grade || "الصف");

    try {
      progressStatus(0, 1, "جاري تجهيز قوائم الفصول", gradeText);
      await ensureOnReportPage();
      if (typeof window.neprasApiAutoPrimeSession === "function") {
        try { await window.neprasApiAutoPrimeSession(gradeText, String(task.grade || "")); } catch (_) {}
      }
      const gradeSelect = await selectGrade(task);
      const gradeValue = String(gradeSelect?.value || task.grade || "").trim();
      const classResult = await collectClassOptions();
      const classes = readOptions(classResult.select);
      if (!classes.length) throw new Error("لا توجد فصول لهذا الصف.");
      try { await neprasEnsureLib("pdflib"); } catch (_) { throw new Error("تعذر تجهيز ملف PDF."); }

      const merged = await PDFLib.PDFDocument.create();
      const result = await collectClassPdfs(classes, {
        fetchOne: (cls) => fetchClassBytesWithFallback(gradeValue, cls),
        addToMerged: async (bytes) => {
          const src = await PDFLib.PDFDocument.load(bytes);
          const pages = await merged.copyPages(src, src.getPageIndices());
          for (const page of pages) merged.addPage(page);
        },
        isCancelled: () => cancelled,
        pauseMs: BETWEEN_CLASSES_MS,
        onProgress: (done, cls, r) => {
          const missing = r.unavailable.length + r.unreadable.length;
          const note = missing ? ` (تعذّر ${missing})` : "";
          progressStatus(done, classes.length, "جاري تجهيز قوائم الفصول", cls
            ? `فصل ${cls.text} (${done + 1} من ${classes.length})`
            : `تم تجهيز ${r.included.length} من ${classes.length} فصل${note}`);
        }
      });

      if (cancelled) throw new Error("CANCELLED");
      if (!result.included.length) {
        throw new Error("تعذر تنزيل ملفات PDF لأي فصل من فصول هذا الصف. يرجى التأكد من تسجيل الطلاب واكتمال بيانات الفصول في موقع الوزارة.");
      }

      progressStatus(classes.length, classes.length, "جاري إنشاء الملف النهائي", "تجميع القوائم في ملف واحد");
      const out = await merged.save();
      const blob = new Blob([out], { type: "application/pdf" });
      const outcome = describeOutcome({ gradeText, total: classes.length, result });
      const rawFileName = outcome.fileName;

      let finalFileName = rawFileName;
      if (window.neprasDialog?.triggerDownload) {
        const result = await window.neprasDialog.triggerDownload(blob, rawFileName, {
          title: outcome.title,
          message: outcome.message,
          folder: "قوائم الفصول"
        });
        finalFileName = result.finalFileName;
      } else {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = rawFileName;
        anchor.style.display = "none";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 15000);
      }
      progressStatus(classes.length, classes.length, outcome.title, outcome.subtitle, outcome.tone);
      window.NeprasLegacy?.hide(4500);
    } catch (error) {
      const message = error?.message || String(error || "");
      if (message === "CANCELLED" || message === "USER_STOPPED") {
        progressStatus(0, 1, "تم إيقاف العملية", "لم يتم تنزيل ملف جزئي", "orange");
      } else {
        console.error("Nepras class reports:", error);
        // رسائل الأداة نفسها عربية وتقول السبب (لا فصول، لم يُرجع الموقع أي قائمة...)؛ أخطاء المتصفح الإنجليزية لا تُعرض خامًا.
        const reason = /[\u0600-\u06FF]/.test(message) ? message : "لم يتم تنزيل ملف ناقص. حاول مرة أخرى.";
        progressStatus(0, 1, "تعذر تجهيز قوائم الفصول", reason, "red");
      }
    } finally {
      running = false;
      // لا نغلق بطاقة النتيجة (نجاح/إيقاف/خطأ)؛ نغلق فقط بطاقة تقدّم ما زالت تعمل بالخطأ.
      try {
        const card = window.NeprasUI?.getProgress("main");
        if (card && card.running) card.close();
      } catch (_) {}
      try { await chrome.storage.local.remove(TASK_KEY); } catch (_) {}
      try {
        await chrome.runtime.sendMessage({
          action: "NEPRAS_CLEANUP_COMMAND_STATE",
          scope: "student",
          reason: cancelled ? "class_reports_stopped" : "class_reports_finished"
        });
      } catch (_) {}
      activeDownloadCancel = null;
    }
  }

  async function checkPending() {
    try {
      const data = await chrome.storage.local.get(TASK_KEY);
      const task = data?.[TASK_KEY];
      if (task?.type !== "CLASS_REPORT_GRADE") return;
      await chrome.storage.local.remove(TASK_KEY);
      await sleep(900);
      runTask(task);
    } catch (_) {}
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "EXECUTE_CLASS_REPORT_TASK" && request.task) {
      runTask(request.task);
      sendResponse?.({ ok: true });
      return true;
    }
    if (request.action === "STOP_CLASS_REPORT_TASK") {
      stopClassReportTask();
      sendResponse?.({ ok: true, running });
      return true;
    }
    return false;
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(checkPending, 1000), { once: true });
  } else {
    setTimeout(checkPending, 1000);
  }
})();
