// ============================================================
// نبراس — أداة حذف إعفاءات الطلاب المتقدمة
// مبنية على محرك الأتمتة الميداني مع دعم الفرز والتحديد الذكي لنوع الإعفاء
// ============================================================

(function () {
  "use strict";

  // حالة الإيقاف والتحكم
  let isCancelled = false;

  function neprasExemptionStopRequested() {
    try {
      return isCancelled ||
        window.__NEPRAS_STOP_ALL_REQUESTED__ === true ||
        (typeof window.neprasIsGlobalStopRequested === "function" && window.neprasIsGlobalStopRequested());
    } catch (_) {
      return isCancelled;
    }
  }

  function neprasExemptionResetStop() {
    isCancelled = false;
  }

  function neprasExemptionRequestStop() {
    isCancelled = true;
    try {
      if (typeof window.neprasRequestGlobalStop === "function") {
        window.neprasRequestGlobalStop("exemption_removal_stop");
      }
    } catch (_) {}
  }

  // أدوات مساعدة لفحص العناصر وانتظارها
  function sleep(ms) {
    return new Promise((resolve) => {
      const start = Date.now();
      const interval = 100;
      const check = () => {
        if (neprasExemptionStopRequested()) {
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

  function waitForElement(selector, options = {}) {
    const {
      timeout = 8000,
      checkDisabled = false,
      checkHidden = false,
      visible = true
    } = options;

    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const interval = 200;

      const check = () => {
        if (neprasExemptionStopRequested()) {
          reject(new Error("CANCELLED"));
          return;
        }

        const el = document.querySelector(selector);
        if (el) {
          let isValid = true;
          if (checkDisabled && el.disabled) isValid = false;
          if (checkHidden && el.hidden) isValid = false;
          if (visible && el.offsetParent === null && !el.hidden) isValid = false;
          if (isValid) {
            resolve(el);
            return;
          }
        }

        if (Date.now() - startTime > timeout) {
          reject(new Error(`Timeout waiting for element: ${selector}`));
          return;
        }

        setTimeout(check, interval);
      };
      check();
    });
  }

  function waitForElementToDisappear(selector, timeout = 6000) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const interval = 200;
      const check = () => {
        if (neprasExemptionStopRequested()) { resolve(false); return; }
        const el = document.querySelector(selector);
        if (!el || el.offsetParent === null || el.hidden) {
          resolve(true);
          return;
        }
        if (Date.now() - startTime > timeout) {
          resolve(false);
          return;
        }
        setTimeout(check, interval);
      };
      check();
    });
  }

  function findButtonByText(text, exact = false) {
    const buttons = document.querySelectorAll("button, a.btn, input[type='button'], input[type='submit']");
    for (const btn of buttons) {
      const btnText = (btn.textContent || btn.value || "").trim();
      if (exact) {
        if (btnText === text) return btn;
      } else {
        if (btnText.includes(text)) return btn;
      }
    }
    return null;
  }

  // تأكيد رسائل ونوافذ الحذف تلقائياً
  function waitForAndAcceptConfirmation(timeout = 4000) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const interval = 120;

      const knownConfirmSelectors = [
        ".modal-footer button.btn-success[type='submit']",
        ".modal.show .modal-footer .btn-success",
        ".modal.in .modal-footer .btn-success",
        ".modal-footer button.btn-danger",
        ".swal2-popup.swal2-show .swal2-confirm",
        ".swal2-confirm",
        ".p-confirm-dialog .p-confirm-dialog-accept",
        ".p-dialog .p-confirm-dialog-accept",
        ".toast-container .btn",
        ".ngx-toastr .btn"
      ];

      const confirmWords = ["نعم", "تأكيد", "موافق", "تأكيد الحذف", "حذف", "Yes", "OK", "Confirm", "Delete"];
      const cancelWords = ["لا", "إلغاء", "رجوع", "إغلاق", "Cancel", "No", "Close"];

      const isVisible = (el) => !!el && el.offsetParent !== null;

      const check = () => {
        if (neprasExemptionStopRequested()) { resolve(false); return; }

        for (const sel of knownConfirmSelectors) {
          const btn = document.querySelector(sel);
          if (isVisible(btn)) {
            btn.click();
            resolve(true);
            return;
          }
        }

        const containers = document.querySelectorAll(
          ".modal-footer, .modal.show, .modal.in, .swal2-popup, .p-dialog, .p-confirm-dialog, .toast, .ngx-toastr, [role='alertdialog'], [role='dialog']"
        );
        for (const container of containers) {
          if (!isVisible(container)) continue;
          const buttons = container.querySelectorAll("button, a.btn");
          for (const btn of buttons) {
            const text = (btn.textContent || "").trim();
            if (!text) continue;
            const isCancel = cancelWords.some(w => text.includes(w));
            if (isCancel) continue;
            const isConfirm = confirmWords.some(w => text.includes(w));
            if (isConfirm) {
              btn.click();
              resolve(true);
              return;
            }
          }
        }

        if (Date.now() - startTime > timeout) {
          resolve(false);
          return;
        }
        setTimeout(check, interval);
      };
      check();
    });
  }

  // خريطة أنواع الإعفاءات الشائعة للتعرف الذكي
  const KNOWN_EXEMPTION_TYPES = [
    { code: "all", label: "جميع أنواع الإعفاءات المسجلة (حذف الكل)" },
    { code: "5", label: "تكافل وكرامة / مشروطية التعليم (كود 5)" },
    { code: "1", label: "أبناء العاملين بالتربية والتعليم" },
    { code: "2", label: "أبناء الشهداء ومصابي العمليات" },
    { code: "3", label: "يتامى الأب" },
    { code: "4", label: "أبناء المرأة المعيلة والمطلقة ومهجورة العائل" },
    { code: "6", label: "بحث اجتماعي / حالات الضمان الاجتماعي" },
    { code: "7", label: "طلاب مدارس حلايب وشلاتين والمناطق الحدودية" },
    { code: "8", label: "طلاب مدارس التربية الخاصة ومدارس الفصل الواحد" },
    { code: "custom", label: "تحديد كود أو نص إعفاء مخصص" }
  ];

  /**
   * معالجة فحص وحذف إعفاء طالب واحد
   * @param {string} studentCode كود التلميذ
   * @param {Object} options خيارات الحذف { targetType, specificCode, specificText }
   */
  async function processStudentExemption(studentCode, options = {}) {
    const targetType = options.targetType || "all";
    const specificCode = String(options.specificCode || "").trim();
    const specificText = String(options.specificText || "").trim();

    const log = [];
    log.push(`بدء معالجة كود الطالب: ${studentCode}`);

    try {
      if (neprasExemptionStopRequested()) {
        throw new Error("CANCELLED");
      }

      // 1. كتابة كود الطالب في حقل البحث
      const inputSelector = 'input[formcontrolname="studentCode"], input#studentCode, input[name="studentCode"]';
      const input = await waitForElement(inputSelector, { timeout: 6000 });
      if (!input) {
        throw new Error("لم يتم العثور على حقل إدخال كود الطالب في الصفحة.");
      }

      input.value = studentCode;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      log.push(`تمت كتابة الكود: ${studentCode}`);

      // 2. الضغط على زر عرض بيانات التلميذ
      const showBtn = findButtonByText("عرض بيانات التلميذ") || findButtonByText("عرض البيانات");
      if (!showBtn) {
        throw new Error("لم يتم العثور على زر 'عرض بيانات التلميذ'.");
      }

      if (showBtn.disabled) {
        await waitForElement("button.btn-primary:not([disabled])", { timeout: 3000 }).catch(() => null);
      }
      showBtn.click();
      log.push("تم الضغط على زر عرض بيانات التلميذ.");

      // 3. انتظار قائمة نوع الإعفاء
      const selectSelector = 'select[formcontrolname="excecTypeControl"], select#excecTypeControl, select[name="excecTypeControl"]';
      const select = await waitForElement(selectSelector, { timeout: 9000, checkDisabled: false });
      if (!select) {
        throw new Error("لم يتم العثور على قائمة نوع الإعفاء للطالب.");
      }

      await waitForElementToDisappear(".spinner, .loader, .loading, .overlay-spinner", 4000);

      // 4. قراءة القيمة الحالية ونوع الإعفاء
      const selectedValue = String(select.value || "").trim();
      const selectedIndex = select.selectedIndex;
      const selectedText = (selectedIndex >= 0 && select.options[selectedIndex])
        ? select.options[selectedIndex].text.trim()
        : "";

      log.push(`قيمة نوع الإعفاء الحالية: ${selectedValue} (${selectedText || "بدون وصف"})`);

      // فحص هل الطالب لديه إعفاء مسجل أساساً
      const hasExemption = Boolean(selectedValue && selectedValue !== "0" && selectedValue !== "-1" && selectedValue !== "");

      if (!hasExemption) {
        log.push("تخطي الطالب: لا يوجد إعفاء مسجل حالياً للطالب.");
        return {
          code: studentCode,
          status: "skipped",
          deleted: false,
          currentValue: selectedValue,
          currentText: selectedText,
          reason: "لا يوجد إعفاء مسجل للطالب على الموقع",
          log
        };
      }

      // 5. التحقق من مطابقة نوع الإعفاء المطلوب حذفه
      let shouldDelete = false;
      let matchReason = "";

      if (targetType === "all") {
        shouldDelete = true;
        matchReason = `حذف شامل لكل الإعفاءات (النوع الحالي: ${selectedText || selectedValue})`;
      } else {
        // فحص مطابقة الكود أو النص
        const matchByCode = Boolean(specificCode && selectedValue === specificCode);
        const matchByText = Boolean(specificText && selectedText.includes(specificText));

        if (matchByCode || matchByText) {
          shouldDelete = true;
          matchReason = `تطابق نوع الإعفاء المستهدف: [${selectedText || selectedValue}]`;
        } else {
          shouldDelete = false;
          matchReason = `نوع الإعفاء الحالي [${selectedText || selectedValue}] لا يطابق النوع المطلوب حذفه`;
        }
      }

      if (!shouldDelete) {
        log.push(`تخطي الطالب: ${matchReason}`);
        return {
          code: studentCode,
          status: "skipped",
          deleted: false,
          currentValue: selectedValue,
          currentText: selectedText,
          reason: matchReason,
          log
        };
      }

      // 6. تنفيذ الحذف
      const deleteButton = document.querySelector("button.btn-danger[type='submit'], button.btn-danger");
      let deleteBtnFound = false;

      if (deleteButton && deleteButton.offsetParent !== null) {
        deleteButton.click();
        deleteBtnFound = true;
      } else {
        const altDelete = findButtonByText("حذف");
        if (altDelete) {
          altDelete.click();
          deleteBtnFound = true;
        }
      }

      if (!deleteBtnFound) {
        throw new Error("لم يتم العثور على زر الحذف في نموذج الصفحة.");
      }

      log.push("تم الضغط على زر الحذف، جاري انتظار وتأكيد العملية...");

      // 7. التقاط وتأكيد رسالة التأكيد
      const confirmed = await waitForAndAcceptConfirmation(4500);
      log.push(confirmed ? "تم تأكيد رسالة الحذف بنجاح." : "تم الحذف بدون نافذة تأكيد إضافية.");

      await sleep(1000);

      return {
        code: studentCode,
        status: "deleted",
        deleted: true,
        currentValue: selectedValue,
        currentText: selectedText,
        reason: confirmed ? "تم الحذف وتأكيده بنجاح" : "تم تنفيذ أمر الحذف",
        log
      };

    } catch (err) {
      if (err.message === "CANCELLED" || neprasExemptionStopRequested()) {
        log.push("تم إلغاء العملية بناءً على طلب المستخدم.");
        return {
          code: studentCode,
          status: "cancelled",
          deleted: false,
          reason: "تم إلغاء العملية بواسطة المستخدم",
          log
        };
      }

      log.push(`خطأ: ${err.message || String(err)}`);
      return {
        code: studentCode,
        status: "error",
        deleted: false,
        reason: err.message || String(err),
        log
      };
    }
  }

  /**
   * تشغيل دورة حذف الإعفاءات لمجموعة طلاب من كشف Excel
   * @param {Array<Object>} studentsRows صفوف الطلاب المقروءة من Excel
   * @param {Object} options إعدادات الحذف { codeColName, targetType, specificCode, specificText, onProgress, onLog }
   */
  async function runBatchExemptionRemoval(studentsRows, options = {}) {
    neprasExemptionResetStop();

    const codeCol = options.codeColName || "كود التلميذ";
    const onProgress = typeof options.onProgress === "function" ? options.onProgress : () => {};
    const onLog = typeof options.onLog === "function" ? options.onLog : () => {};

    const results = [];
    let deletedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    const total = studentsRows.length;
    onLog(`بدء معالجة حذف الإعفاءات لـ ${total} طالب...`, "info");

    for (let i = 0; i < total; i++) {
      if (neprasExemptionStopRequested()) {
        onLog(`تم إيقاف العملية عند الطالب رقم ${i + 1} بواسطة المستخدم.`, "warn");
        for (let j = i; j < total; j++) {
          const row = studentsRows[j];
          const c = String(row[codeCol] || row["كود"] || Object.values(row)[0] || "").trim();
          results.push({
            code: c,
            status: "not_processed",
            deleted: false,
            reason: "لم تتم معالجته (تم إيقاف العملية)"
          });
        }
        break;
      }

      const row = studentsRows[i];
      const code = String(row[codeCol] || row["كود"] || row["كود الطالب"] || Object.values(row)[0] || "").trim();

      if (!code) {
        results.push({
          code: "غير محدد",
          status: "error",
          deleted: false,
          reason: "صف خالي من كود التلميذ"
        });
        errorCount++;
        continue;
      }

      onProgress(i + 1, total, code);

      const res = await processStudentExemption(code, options);
      results.push(res);

      if (res.deleted) {
        deletedCount++;
        onLog(`[${i + 1}/${total}] ✅ تم حذف إعفاء الطالب: ${code}`, "success");
      } else if (res.status === "skipped") {
        skippedCount++;
        onLog(`[${i + 1}/${total}] ⏩ تخطي: ${code} — ${res.reason}`, "warn");
      } else if (res.status === "error") {
        errorCount++;
        onLog(`[${i + 1}/${total}] ❌ خطأ: ${code} — ${res.reason}`, "error");
      }

      // فاصل زمني بسيط بين الطلاب لعدم إجهاد خادم الوزارة
      const keepGoing = await sleep(700);
      if (!keepGoing) break;
    }

    onLog(`اكتملت المعالجة: تم الحذف: ${deletedCount} | تخطي: ${skippedCount} | أخطاء: ${errorCount}`, "info");

    return {
      total,
      deletedCount,
      skippedCount,
      errorCount,
      results,
      cancelled: neprasExemptionStopRequested()
    };
  }

  /**
   * إنشاء نموذج Excel فارغ لحذف الإعفاءات
   */
  function buildExemptionRemovalTemplateWorkbook(xlsxLib) {
    const lib = xlsxLib || globalThis.XLSX;
    if (!lib) throw new Error("مكتبة Excel غير محملة.");

    const headers = ["كود التلميذ", "اسم التلميذ (اختياري)", "الصف (اختياري)", "ملاحظات (اختياري)"];
    const rows = [
      headers,
      ["1234567", "مثال: أحمد محمد علي", "الصف الأول", "حذف إعفاء تكافل وكرامة"],
      ["2345678", "مثال: فاطمة إبراهيم محمود", "الصف الثاني", ""]
    ];

    const ws = lib.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 18 }, { wch: 30 }, { wch: 16 }, { wch: 30 }];
    ws["!views"] = [{ RTL: true }];

    const wb = lib.utils.book_new();
    lib.utils.book_append_sheet(wb, ws, "كشف_حذف_الإعفاءات");
    return wb;
  }

  /**
   * إنشاء كشف Excel رسمي لنتائج عملية حذف الإعفاءات
   * @param {Array<Object>} originalRows الصفوف الأصلية من ملف المستخدم
   * @param {Array<Object>} results نتائج المعالجة
   * @param {Array<string>} headers العناوين الأصلية
   */
  function buildExemptionRemovalResultsWorkbook(originalRows, results, headers, xlsxLib) {
    const lib = xlsxLib || globalThis.XLSX;
    if (!lib) throw new Error("مكتبة Excel غير محملة.");

    const statusLabels = {
      deleted: "تم الحذف بنجاح",
      skipped: "لم يُحذف (تخطي/عدم تطابق)",
      error: "خطأ أثناء المعالجة",
      cancelled: "تم الإلغاء أثناء المعالجة",
      not_processed: "لم تتم معالجته (توقف)"
    };

    const outHeaders = ["م", ...(headers || ["كود التلميذ"]), "حالة الحذف", "نوع الإعفاء بالمنظومة", "السبب والتفاصيل"];
    const outRows = [outHeaders];

    results.forEach((item, idx) => {
      const orig = originalRows && originalRows[idx] ? originalRows[idx] : {};
      const rowData = [idx + 1];

      (headers || ["كود التلميذ"]).forEach(h => {
        rowData.push(orig[h] != null ? orig[h] : "");
      });

      rowData.push(statusLabels[item.status] || item.status || "—");
      rowData.push(item.currentText || item.currentValue || "—");
      rowData.push(item.reason || "");

      outRows.push(rowData);
    });

    const ws = lib.utils.aoa_to_sheet(outRows);
    ws["!views"] = [{ RTL: true }];

    // ملخص إحصائي
    const summaryRows = [
      ["تقرير نتائج أتمتة حذف إعفاءات الطلاب"],
      [""],
      ["البيان", "العدد"],
      ["إجمالي الطلاب المفحوصين", results.length],
      ["تم حذف الإعفاء بنجاح", results.filter(r => r.status === "deleted").length],
      ["تم التخطي (لا يستوفي شرط الحذف)", results.filter(r => r.status === "skipped").length],
      ["أخطاء أثناء المعالجة", results.filter(r => r.status === "error").length],
      ["لم تتم معالجتها", results.filter(r => r.status === "not_processed" || r.status === "cancelled").length]
    ];
    const wsSummary = lib.utils.aoa_to_sheet(summaryRows);
    wsSummary["!views"] = [{ RTL: true }];

    const wb = lib.utils.book_new();
    lib.utils.book_append_sheet(wb, ws, "نتائج_حذف_الإعفاءات");
    lib.utils.book_append_sheet(wb, wsSummary, "ملخص_العمليات");

    return wb;
  }

  // التصدير وتجميد الكائن
  const NeprasExemptionRemoval = Object.freeze({
    KNOWN_EXEMPTION_TYPES,
    processStudentExemption,
    runBatchExemptionRemoval,
    buildExemptionRemovalTemplateWorkbook,
    buildExemptionRemovalResultsWorkbook,
    requestStop: neprasExemptionRequestStop,
    resetStop: neprasExemptionResetStop,
    isStopRequested: neprasExemptionStopRequested
  });

  globalThis.NeprasExemptionRemoval = NeprasExemptionRemoval;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = NeprasExemptionRemoval;
  }
})();
