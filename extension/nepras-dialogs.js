(() => {
  "use strict";
  if (window.neprasDialog) return;

  function sanitizeUserFacingText(value) {
    let text = String(value ?? "");

    const replacements = [
      [/Response\s*=\s*true/gi, "تأكيد نجاح الحفظ"],
      [/Response\s*true/gi, "تأكيد نجاح الحفظ"],
      [/\bAPI\b/gi, "المسار السريع"],
      [/CORS\s*\/?\s*Network/gi, "الاتصال بالخدمة"],
      [/\bCORS\b/gi, "الاتصال بالخدمة"],
      [/\bHTTP\s*\d{3}\b/gi, "خطأ من خادم الوزارة"],
      [/\bHTTP\b/gi, "خادم الوزارة"],
      [/\bEndpoint\b/gi, "خدمة الحفظ"],
      [/\bJSON\b/gi, "البيانات"],
      [/\bRetry\b/gi, "إعادة المحاولة"],
      [/XHR_NETWORK_ERROR(?:_OR_CORS)?/gi, "تعذر الاتصال بخدمة الحفظ"],
      [/ATTENDANCE_[A-Z0-9_:-]+/g, "تعذر إكمال الحفظ السريع"],
      [/FAST_[A-Z0-9_:-]+/g, "تعذر إكمال العملية السريعة"]
    ];

    for (const [pattern, replacement] of replacements) {
      text = text.replace(pattern, replacement);
    }

    return text;
  }

  // الهروب من ui/escape.js (مصدر واحد). تحويل السطر الجديد إلى <br> لرسائل الحوارات.
  function escapeHtml(value) {
    return NeprasEscape.multiline(value);
  }

  const FILE_READY_MAX_AGE_MS = 15000;
  let pendingGeneratedFile = null;
  let pendingGeneratedFileTimer = null;

  function generatedFileTimestamp(date = new Date()) {
    const pad = value => String(value).padStart(2, "0");
    const ms = String(date.getMilliseconds()).padStart(3, "0");
    return [
      date.getFullYear(),
      pad(date.getMonth() + 1),
      pad(date.getDate())
    ].join("-") + "_" + [
      pad(date.getHours()),
      pad(date.getMinutes()),
      pad(date.getSeconds())
    ].join("-") + `-${ms}`;
  }

  // نظّم كل الملفات التي ينزّلها نبراس داخل فولدر واحد بترتيب فرعي حسب نوع الملف،
  // بدل أن تتناثر مباشرة في فولدر التنزيلات الرئيسي.
  // ملاحظة: هذا يعتمد على أن كروم/إيدج يدعمان مسارات فرعية داخل الاسم المُمرَّر لـ
  // download attribute أو chrome.downloads.download؛ متصفحات أخرى قد تتجاهل الفولدر
  // وتحفظ الملف مباشرة (لن يفشل الحفظ في هذه الحالة، فقط لن يُنظَّم).
  const NEPRAS_DOWNLOAD_ROOT = "Nepras";

  function getNeprasDownloadSubfolder(ext) {
    switch (String(ext || "").toLowerCase()) {
      case ".xlsx":
      case ".xls":
      case ".csv":
        return "Excel";
      case ".pdf":
        return "PDF";
      case ".txt":
        return "Logs";
      case ".zip":
        return "Individual";
      default:
        return "Other";
    }
  }

  // اسم الأداة (لو موجود) يتحول لاسم فولدر آمن، بدل التصنيف حسب امتداد الملف.
  // كده كل ملفات "صحف الأحوال" مثلًا تتجمع في فولدر واحد باسمها هي، حتى لو
  // نوعين مختلفين من الملفات (PDF وZIP) طلعوا من نفس الأداة.
  function sanitizeNeprasFolderName(name) {
    return String(name || "")
      .trim()
      .replace(/[\\/:*?"<>|]+/g, "_")
      .replace(/\s+/g, " ")
      .slice(0, 60);
  }

  function prepareGeneratedFilename(rawName, toolFolder, options = {}) {
    const original = String(rawName || "ملف").trim() || "ملف";
    const dot = original.lastIndexOf(".");
    const ext = dot > 0 ? original.slice(dot) : "";
    let base = dot > 0 ? original.slice(0, dot) : original;

    // احذف أي ختم وقت قديم أضافه نبراس
    base = base
      .replace(/[\\/:*?"<>|]+/g, "_")
      .replace(/(?:[_-]\d{4}[-_]\d{2}[-_]\d{2}(?:[-_]\d{2}){0,3}(?:[-_]\d{3})?)+$/g, "")
      .replace(/[_-]+$/g, "") || "ملف";

    // القوالب والنماذج الرسمية الثابتة تُحفظ باسمها النظيف المباشر بدون تشويه بختم زمني
    const isTemplate = options.isTemplate || /قالب|نموذج|template/i.test(original) || /قالب|نموذج|template/i.test(String(toolFolder || ""));
    const finalBaseName = isTemplate ? `${base}${ext}` : `${base}_${generatedFileTimestamp()}${ext}`;
    const subfolder = sanitizeNeprasFolderName(toolFolder) || getNeprasDownloadSubfolder(ext);
    return `${NEPRAS_DOWNLOAD_ROOT}/${subfolder}/${finalBaseName}`;
  }

  function getRecentGeneratedFile() {
    if (!pendingGeneratedFile) return null;
    if (Date.now() - Number(pendingGeneratedFile.startedAt || 0) > FILE_READY_MAX_AGE_MS) {
      pendingGeneratedFile = null;
      return null;
    }
    return pendingGeneratedFile;
  }

  function clearPendingGeneratedFileTimer() {
    if (pendingGeneratedFileTimer) {
      clearTimeout(pendingGeneratedFileTimer);
      pendingGeneratedFileTimer = null;
    }
  }

  function registerGeneratedFile(fileName, options = {}) {
    const safeName = String(fileName || "").trim();
    if (!/\.(?:xlsx?|pdf|csv|zip)$/i.test(safeName)) return null;

    clearPendingGeneratedFileTimer();
    pendingGeneratedFile = {
      fileName: safeName,
      startedAt: Date.now(),
      title: String(options.title || "تم حفظ الملف بنجاح"),
      message: String(options.message || `تم إنشاء الملف وحفظه بنجاح.\n${safeName}`),
      // v1.2.75: «فتح الملف» يعتمد على chrome.downloads؛ لا نعرضه إن حُفظ الملف بمسار احتياطي.
      canOpen: options.canOpen !== false,
      consumed: false
    };

    try {
      chrome.runtime.sendMessage({
        action: "NEPRAS_FILE_GENERATED",
        payload: {
          fileName: pendingGeneratedFile.fileName,
          startedAt: pendingGeneratedFile.startedAt,
          title: pendingGeneratedFile.title,
          message: pendingGeneratedFile.message
        }
      }).catch?.(() => {});
    } catch (_) {}

    // بعض عمليات نبراس تعرض بالفعل رسالة نجاح بعد إنشاء الملف.
    // ننتظر قليلًا لإضافة زر «فتح الملف» لنفس الرسالة، وإن لم توجد نعرض رسالة مستقلة.
    pendingGeneratedFileTimer = setTimeout(() => {
      const info = getRecentGeneratedFile();
      if (!info || info.consumed) return;
      info.consumed = true;
      open({
        type: "success",
        title: info.title,
        message: info.message,
        fileInfo: info,
        okText: "إغلاق"
      }).catch(() => {});
    }, Number(options.fallbackDelay || 850));

    return pendingGeneratedFile;
  }

  function requestOpenGeneratedFile(fileInfo) {
    if (!fileInfo?.fileName) return;
    try {
      chrome.runtime.sendMessage({
        action: "NEPRAS_OPEN_GENERATED_FILE",
        fileName: fileInfo.fileName,
        startedAt: Number(fileInfo.startedAt || 0)
      }).catch?.(() => {});
    } catch (_) {}
  }

  // الواجهة تُرسم الآن داخل Shadow DOM بأنماط تُطبَّق عبر adoptedStyleSheets (ui/nepras-ui.js).
  // هذا لا يمرّ عبر وسم <style> فلا تمنعه سياسة CSP لبعض صفحات الوزارة، ويدعم hover/focus/الوضع الداكن،
  // ولا تتسرّب إليه أنماط الصفحة. هذا الملف يحفظ واجهة neprasDialog القديمة فقط (مع أسماء الملفات المُنشأة).

  // ---- واجهة الحوار: محوّل إلى NeprasUI.dialog (المرحلة 2) ----
  const TITLES = {
    info: (globalThis.NeprasBrand?.name || "نبراس"),
    success: "تمت العملية بنجاح",
    warning: "تنبيه",
    error: "تعذر إكمال العملية",
    question: "تأكيد العملية"
  };

  function closeExisting() {
    try { window.NeprasUI?.dialog.close(); } catch (_) {}
  }

  function open(options = {}) {
    const UI = window.NeprasUI;
    if (!UI) {
      // احتياط: لو لم يُحمَّل نظام الرسائل لأي سبب نستخدم حوار المتصفح الأصلي بدل فقدان الرسالة.
      const text = sanitizeUserFacingText(options.message || "");
      if (options.input) return Promise.resolve(window.prompt(text, options.defaultValue || ""));
      if (options.cancel) return Promise.resolve(window.confirm(text));
      window.alert(text); return Promise.resolve(true);
    }
    const L = window.NeprasLegacy;
    const type = options.type || "info";
    let fileInfo = options.fileInfo || null;
    if (!fileInfo && type === "success") {
      const recent = getRecentGeneratedFile();
      if (recent && !recent.consumed) {
        fileInfo = recent;
        recent.consumed = true;
        clearPendingGeneratedFileTimer();
      }
    }

    const clean = (v) => L.stripEmoji(sanitizeUserFacingText(v));
    const spec = {
      kind: type,
      title: clean(options.title || TITLES[type] || TITLES.info),
      subtitle: options.subtitle ? clean(options.subtitle) : "",
      note: options.note ? clean(options.note) : "",
      danger: !!options.danger,
      dismissible: options.overlayClose !== false,
      primary: { label: options.okText || "موافق", value: options.input ? undefined : true },
    };
    if (options.html != null) spec.html = sanitizeUserFacingText(options.html);
    else spec.markup = clean(options.message || "");

    if (options.input) {
      spec.input = { type: options.inputType || "text", value: options.defaultValue || "", placeholder: options.placeholder || "" };
    }
    if (options.cancel) spec.secondary = { label: options.cancelText || "إلغاء", value: options.input ? null : false };
    if (fileInfo?.fileName && fileInfo.canOpen !== false) {
      // «فتح الملف» يصير الإجراء الأبرز، و«موافق» ثانويًا
      spec.extra = [{ label: "فتح الملف", icon: "folder", value: "open_file", onClick: () => requestOpenGeneratedFile(fileInfo) }];
    }
    // v1.2.75: أزرار إضافية وإجراء للزر الرئيسي وتفاصيل فنية (تُستخدم في حوار «حفظ الملف» اليدوي).
    if (Array.isArray(options.extra) && options.extra.length) spec.extra = [...(spec.extra || []), ...options.extra];
    if (typeof options.onOk === "function") spec.primary.onClick = options.onOk;
    if (options.technical) spec.technical = String(options.technical);
    return UI.dialog.open(spec);
  }

  // v1.0 — نقطة تنزيل موحّدة لكل ملفات نبراس (بدل a.download + a.click()).
  // اسم الملف اللي بيرجع من prepareGeneratedFilename ممكن يحتوي فولدر فرعي
  // (مثلاً "Nepras/Excel/اسم.xlsx"). وسم <a> بيتجاهل الفولدر ده أو يستبدله في
  // كروم الحديث، بينما chrome.downloads.download (اللي بيتنفذ في الخلفية)
  // بيدعمه فعليًا. عشان كده لازم نبعت البيانات كـ base64 لصفحة الخلفية بدل
  // ما نضغط على رابط الـ blob هنا في صفحة الموقع.
  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || "");
        const idx = result.indexOf(",");
        resolve(idx >= 0 ? result.slice(idx + 1) : result);
      };
      reader.onerror = () => reject(reader.error || new Error("FILE_READ_FAILED"));
      reader.readAsDataURL(blob);
    });
  }

  // ---------------------------------------------------------------------------
  // v1.2.75 — تنزيل موثوق على الموبايل (Edge/Kiwi على أندرويد) وعلى الكمبيوتر.
  // الترتيب:
  //   1) chrome.downloads عبر الخلفية (يحفظ في فولدر Nepras/... على الكمبيوتر، والخلفية
  //      تعيد المحاولة باسم بلا فولدرات وتتحقق أن التنزيل لم يُقطع).
  //   2) إن فشل: على الكمبيوتر ننزّل تلقائيًا عبر وسم <a download>.
  //      وعلى الموبايل نعرض حوار «حفظ الملف» — لأن المتصفح يتجاهل النقر البرمجي بدون لمسة
  //      من المستخدم (انتهت لمسته الأصلية أثناء تجهيز الملف)، فنطلب لمسة جديدة.
  // ---------------------------------------------------------------------------
  // رابط data: في chrome.downloads محدود بنحو 2MB في كروم (base64)، فالملفات الأكبر تفشل
  // في الخطوة 1 ثم تُحفظ بالمسار الاحتياطي؛ الحد أدناه يمنع فقط نقل ملفات ضخمة عبر الرسائل.
  const BACKGROUND_DOWNLOAD_MAX_BYTES = 25 * 1024 * 1024;

  function isMobileBrowser() {
    try {
      const ua = String(navigator.userAgent || "");
      if (/Android|iPhone|iPad|iPod|Mobile|Kiwi|EdgA|EdgiOS/i.test(ua)) return true;
      if (navigator.userAgentData?.mobile) return true;
      const shortSide = Math.min(Number(screen?.width || 9999), Number(screen?.height || 9999));
      const coarse = !!window.matchMedia?.("(pointer: coarse)")?.matches;
      return Number(navigator.maxTouchPoints || 0) > 0 && (shortSide <= 1000 || coarse);
    } catch (_) {
      return false;
    }
  }

  function flatFilename(name) {
    return String(name || "").replace(/\\/g, "/").split("/").pop() || "ملف";
  }

  function saveBlobViaAnchor(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.rel = "noopener";
    a.style.display = "none";
    (document.body || document.documentElement).appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => { try { URL.revokeObjectURL(url); } catch (_) {} }, 60000);
  }

  async function promptManualSave(blob, fileName, reason) {
    let file = null;
    try { file = new File([blob], fileName, { type: blob.type || "application/octet-stream" }); } catch (_) {}
    let outcome = null;

    const extra = [];
    let canShare = false;
    try { canShare = !!(file && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })); } catch (_) {}
    if (canShare) {
      extra.push({
        label: "مشاركة الملف",
        value: "shared",
        onClick: async () => {
          try { await navigator.share({ files: [file], title: fileName }); outcome = "shared"; }
          catch (_) { outcome = null; }
        }
      });
    }

    const result = await open({
      type: "warning",
      title: "اضغط «حفظ الملف» لإتمام التنزيل",
      message: `الملف جاهز، لكن المتصفح لم يسمح بحفظه تلقائيًا.\nاضغط الزر أدناه لحفظه في مجلد التنزيلات.\n${fileName}`,
      okText: "حفظ الملف",
      cancel: true,
      cancelText: "إلغاء",
      overlayClose: false,
      onOk: () => { try { saveBlobViaAnchor(blob, fileName); outcome = "saved"; } catch (_) { outcome = null; } },
      extra,
      technical: reason ? `سبب فشل التنزيل التلقائي: ${reason}` : ""
    });

    // احتياط: لو استُخدم حوار المتصفح الأصلي (confirm) لا يُنفَّذ onOk، فنحفظ هنا.
    if (outcome === null && result === true) {
      try { saveBlobViaAnchor(blob, fileName); outcome = "saved"; } catch (_) {}
    }
    if (outcome !== "saved" && outcome !== "shared") throw new Error("DOWNLOAD_CANCELLED");
    return outcome;
  }

  async function triggerDownload(blob, rawName, options = {}) {
    if (!blob) throw new Error("DOWNLOAD_BLOB_MISSING");
    const finalFileName = prepareGeneratedFilename(rawName, options.folder, options);
    const flatName = flatFilename(finalFileName);

    let method = "";
    let downloadId = null;
    let savedName = finalFileName;
    let failure = "";

    // 1) chrome.downloads عبر الخلفية
    if (blob.size <= BACKGROUND_DOWNLOAD_MAX_BYTES) {
      try {
        const base64 = await blobToBase64(blob);
        const mimeType = blob.type || options.mimeType || "application/octet-stream";
        const result = await chrome.runtime.sendMessage({
          action: "NEPRAS_DOWNLOAD_FILE",
          filename: finalFileName,
          mimeType,
          base64
        });
        if (result?.ok) {
          method = "downloads";
          downloadId = result.downloadId;
          savedName = result.filename || finalFileName;
        } else {
          failure = result?.message || "DOWNLOAD_FAILED";
        }
      } catch (error) {
        failure = error?.message || String(error);
      }
    } else {
      failure = "FILE_TOO_LARGE";
    }

    // 2) المسار الاحتياطي
    if (!method) {
      console.warn("[Nepras] chrome.downloads failed, using fallback:", failure);
      savedName = flatName;
      if (isMobileBrowser()) {
        await promptManualSave(blob, flatName, failure);
        method = "manual";
      } else {
        saveBlobViaAnchor(blob, flatName);
        method = "anchor";
      }
    }

    if (options.registerSuccess !== false) {
      registerGeneratedFile(savedName, { ...options, canOpen: method === "downloads" });
    }

    return { finalFileName: savedName, downloadId, method };
  }

  window.neprasDialog = {
    open,
    triggerDownload,
    alert(message, options={}) { return open({ ...options, message, type: options.type || 'info' }); },
    success(message, options={}) { return open({ ...options, message, type:'success' }); },
    error(message, options={}) { return open({ ...options, message, type:'error' }); },
    warning(message, options={}) { return open({ ...options, message, type:'warning' }); },
    confirm(message, options={}) { return open({ ...options, message, type: options.type || 'question', cancel:true, okText: options.okText || 'نعم، متابعة', cancelText: options.cancelText || 'إلغاء' }); },
    prompt(message, defaultValue='', options={}) { return open({ ...options, message, type: options.type || 'question', input:true, defaultValue, cancel:true, okText: options.okText || 'تطبيق', cancelText: options.cancelText || 'إلغاء' }); },
    close() { closeExisting(); },
    prepareGeneratedFilename,
    registerGeneratedFile,
    openGeneratedFile(fileInfo) { requestOpenGeneratedFile(fileInfo || getRecentGeneratedFile()); },
    escapeHtml,
    sanitizeUserFacingText
  };
})();
