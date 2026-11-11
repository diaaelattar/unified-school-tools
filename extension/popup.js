document.addEventListener("DOMContentLoaded", async () => {
  const neprasPopupParams = new URLSearchParams(location.search);
  const neprasIsLargeWindow = neprasPopupParams.get("large") === "1";
  if (neprasIsLargeWindow) {
    document.documentElement.classList.add("large-window-mode");
  }

  const neprasManifestVersion = chrome.runtime.getManifest?.().version || "";
  const neprasTopVersion = document.getElementById("nepras-version-top");
  const neprasSupportVersion = document.getElementById("nepras-version");
  if (neprasTopVersion) neprasTopVersion.textContent = `v${neprasManifestVersion}`;
  if (neprasSupportVersion) neprasSupportVersion.textContent = `v${neprasManifestVersion}`;

  const stageSelect = document.getElementById("stage-select");
  const btnExportSingle = document.getElementById("btn-export-single");
  const gradeSelect = document.getElementById("grade-select");
  const gradePickerButton = document.getElementById("grade-picker-button");
  const gradePickerMenu = document.getElementById("grade-picker-menu");
  const btnExportAll = document.getElementById("btn-export-all");
  const btnStudentModeNormal = document.getElementById("btn-student-mode-normal");
  const btnStudentModeDeep = document.getElementById("btn-student-mode-deep");
  const studentScrapeModeHint = document.getElementById("student-scrape-mode-hint");
  let studentScrapeMode = "normal";
  const classReportGradeSelect = document.getElementById("class-report-grade-select");
  const btnClassReport = document.getElementById("btn-class-report");
  const btnRefreshGrades = document.getElementById("btn-refresh-grades");
  const btnQuickAttendance = document.getElementById("btn-quick-attendance");
  const btnSchoolStatsRefresh = document.getElementById("btn-school-stats-refresh");
  const btnSchoolStatsExport = document.getElementById("btn-school-stats-export");
  const schoolStatsEmpty = document.getElementById("school-stats-empty");
  const schoolStatsContent = document.getElementById("school-stats-content");
  const schoolStatsMeta = document.getElementById("school-stats-meta");
  const schoolStatsStatuses = document.getElementById("school-stats-statuses");
  const schoolStatsGradeBody = document.getElementById("school-stats-grade-body");
  const schoolStatsGradeHead = document.getElementById("school-stats-grade-head");
  const schoolStatsDetailModal = document.getElementById("school-stats-detail-modal");
  const schoolStatsDetailTitle = document.getElementById("school-stats-detail-title");
  const schoolStatsDetailCount = document.getElementById("school-stats-detail-count");
  const schoolStatsDetailBody = document.getElementById("school-stats-detail-body");
  const schoolStatsDetailClose = document.getElementById("school-stats-detail-close");
  const schoolStatsDetailSearch = document.getElementById("school-stats-detail-search");
  const schoolStatsDetailExport = document.getElementById("school-stats-detail-export");
  const schoolDeepProgressCard = document.getElementById("school-deep-progress-card");
  const deepProgressIcon = document.getElementById("deep-progress-icon");
  const deepProgressTitle = document.getElementById("deep-progress-title");
  const deepProgressBadge = document.getElementById("deep-progress-badge");
  const deepProgressBarFill = document.getElementById("deep-progress-bar-fill");
  const deepProgressSubtitle = document.getElementById("deep-progress-subtitle");
  const deepProgressCounts = document.getElementById("deep-progress-counts");

  function renderDeepProgressUI(p) {
    if (!schoolDeepProgressCard) return;
    if (!p) {
      schoolDeepProgressCard.classList.add("hidden");
      return;
    }
    const isRunning = p.running === true;
    const isDone = p.done === true;
    const isStopped = p.stopped === true;
    if (!isRunning && !isDone && !isStopped) {
      schoolDeepProgressCard.classList.add("hidden");
      return;
    }
    schoolDeepProgressCard.classList.remove("hidden");
    if (isRunning) {
      schoolDeepProgressCard.style.borderColor = "#bae6fd";
      schoolDeepProgressCard.style.background = "#f0f9ff";
      if (deepProgressIcon) deepProgressIcon.textContent = "🔄";
      if (deepProgressTitle) {
        deepProgressTitle.textContent = p.title || "جاري تنزيل وتحديث البيانات الشاملة للمدرسة...";
        deepProgressTitle.style.color = "#0369a1";
      }
      const pct = Math.max(0, Math.min(100, Number(p.percent || 0)));
      if (deepProgressBadge) {
        deepProgressBadge.textContent = `${pct}%`;
        deepProgressBadge.style.background = "#e0f2fe";
        deepProgressBadge.style.color = "#0284c7";
      }
      if (deepProgressBarFill) {
        deepProgressBarFill.style.width = `${pct}%`;
        deepProgressBarFill.style.background = "linear-gradient(90deg, #0284c7, #10b981)";
      }
      if (deepProgressSubtitle) deepProgressSubtitle.textContent = p.subtitle || "يتم سحب وتدقيق بيانات الطلاب في الخلفية...";
      if (deepProgressCounts) {
        if (p.total > 0 && p.current != null) {
          deepProgressCounts.textContent = `(${p.current} / ${p.total})`;
        } else {
          deepProgressCounts.textContent = "";
        }
      }
    } else if (isDone) {
      schoolDeepProgressCard.style.borderColor = "#86efac";
      schoolDeepProgressCard.style.background = "#f0fdf4";
      if (deepProgressIcon) deepProgressIcon.textContent = "✅";
      if (deepProgressTitle) {
        deepProgressTitle.textContent = "اكتمل تنزيل وتحديث البيانات الشاملة بنجاح!";
        deepProgressTitle.style.color = "#15803d";
      }
      if (deepProgressBadge) {
        deepProgressBadge.textContent = "100%";
        deepProgressBadge.style.background = "#dcfce7";
        deepProgressBadge.style.color = "#16a34a";
      }
      if (deepProgressBarFill) {
        deepProgressBarFill.style.width = "100%";
        deepProgressBarFill.style.background = "#16a34a";
      }
      if (deepProgressSubtitle) {
        deepProgressSubtitle.textContent = p.message || `تم حفظ ${p.total || ""} طالب وتحديث إحصاء المدرسة وكافة التقارير.`;
      }
      if (deepProgressCounts) deepProgressCounts.textContent = "";
      loadSavedSchoolStats().catch(() => {});
      if (typeof updateStatsCenterStatus === "function") updateStatsCenterStatus().catch(() => {});
      if (typeof window.updateSmartAnalyticsStatus === "function") window.updateSmartAnalyticsStatus();
      clearTimeout(renderDeepProgressUI._t);
      renderDeepProgressUI._t = setTimeout(() => {
        schoolDeepProgressCard.classList.add("hidden");
      }, 10000);
    } else if (isStopped) {
      schoolDeepProgressCard.style.borderColor = "#fde68a";
      schoolDeepProgressCard.style.background = "#fffbeb";
      if (deepProgressIcon) deepProgressIcon.textContent = "⚠️";
      if (deepProgressTitle) {
        deepProgressTitle.textContent = "تم إيقاف التنزيل الشامل";
        deepProgressTitle.style.color = "#b45309";
      }
      if (deepProgressBadge) {
        deepProgressBadge.textContent = "توقف";
        deepProgressBadge.style.background = "#fef3c7";
        deepProgressBadge.style.color = "#d97706";
      }
      if (deepProgressSubtitle) deepProgressSubtitle.textContent = p.message || "تم إيقاف العملية.";
      if (deepProgressCounts) deepProgressCounts.textContent = "";
      clearTimeout(renderDeepProgressUI._t);
      renderDeepProgressUI._t = setTimeout(() => {
        schoolDeepProgressCard.classList.add("hidden");
      }, 7000);
    }
  }
  let schoolStatsDetailRows = [];
  let schoolStatsDetailFilter = null;

  const btnToggleKeepOpen = document.getElementById("btn-toggle-keep-open");
  const lblToggleKeepOpen = document.getElementById("lbl-toggle-keep-open");
  const btnSettingsKeepOpen = document.getElementById("btn-settings-keep-open");
  const lblSettingsKeepOpen = document.getElementById("lbl-settings-keep-open");

  const KEEP_OPEN_STORAGE_KEY = "neprasKeepPopupOpen";
  let neprasKeepPopupOpen = false;

  async function loadKeepOpenSetting() {
    try {
      const data = await chrome.storage.local.get(KEEP_OPEN_STORAGE_KEY);
      neprasKeepPopupOpen = data?.[KEEP_OPEN_STORAGE_KEY] === true;
    } catch (_) {
      neprasKeepPopupOpen = false;
    }
    updateKeepOpenUI();
  }

  function updateKeepOpenUI() {
    const text = neprasKeepPopupOpen ? "حالة إبقاء الأداة نشطة: مفعلة" : "حالة إبقاء الأداة نشطة: معطلة";
    const menuText = neprasKeepPopupOpen ? "إبقاء الأداة نشطة (مفعل)" : "إبقاء الأداة نشطة (معطل)";
    if (lblToggleKeepOpen) lblToggleKeepOpen.textContent = menuText;
    if (lblSettingsKeepOpen) lblSettingsKeepOpen.textContent = text;
    if (btnToggleKeepOpen) {
      btnToggleKeepOpen.classList.toggle("is-active", neprasKeepPopupOpen);
      NeprasButtons?.setIcon?.(btnToggleKeepOpen, neprasKeepPopupOpen ? "check" : "close");
    }
    if (btnSettingsKeepOpen) {
      btnSettingsKeepOpen.classList.toggle("n-btn--primary", neprasKeepPopupOpen);
      btnSettingsKeepOpen.classList.toggle("n-btn--secondary", !neprasKeepPopupOpen);
      NeprasButtons?.setIcon?.(btnSettingsKeepOpen, neprasKeepPopupOpen ? "check" : "close");
    }
  }

  async function toggleKeepOpenSetting() {
    neprasKeepPopupOpen = !neprasKeepPopupOpen;
    updateKeepOpenUI();
    try {
      await chrome.storage.local.set({ [KEEP_OPEN_STORAGE_KEY]: neprasKeepPopupOpen });
      showNeprasPopupNotice(
        neprasKeepPopupOpen
          ? "تم تفعيل إبقاء الأداة نشطة ومفتوحة بعد أداء الوظائف."
          : "تم إلغاء إبقاء الأداة مفتوحة (سيتم إغلاق النافذة تلقائيًا لمتابعة الموقع).",
        "info",
        "تنشيط الأداة"
      );
    } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
  }

  btnToggleKeepOpen?.addEventListener("click", toggleKeepOpenSetting);
  btnSettingsKeepOpen?.addEventListener("click", toggleKeepOpenSetting);

  const btnPopupCheckUpdate = document.getElementById("btn-check-extension-update");
  if (btnPopupCheckUpdate) {
    btnPopupCheckUpdate.addEventListener("click", () => {
      showNeprasPopupNotice("جاري التحقق من التحديثات من الموقع الرسمي...", "info", "تحديث نبراس");
      window.open("https://unified-school-tools-website.vercel.app/", "_blank");
    });
  }

  const btnPopupCopyPhone = document.getElementById("btn-popup-copy-phone");
  if (btnPopupCopyPhone) {
    btnPopupCopyPhone.addEventListener("click", async () => {
      const phone = "01118209309";
      try {
        if (navigator?.clipboard?.writeText) {
          await navigator.clipboard.writeText(phone);
        } else {
          const input = document.createElement("input");
          input.value = phone;
          document.body.appendChild(input);
          input.select();
          document.execCommand("copy");
          input.remove();
        }
        btnPopupCopyPhone.textContent = "تم النسخ!";
        setTimeout(() => { btnPopupCopyPhone.textContent = "نسخ"; }, 2500);
        showNeprasPopupNotice("تم نسخ رقم الدعم (01118209309) بنجاح. جزاكم الله خيراً 🌸", "success", "نسخ الرقم");
      } catch (_) {
        showNeprasPopupNotice("رقم فودافون كاش / إنستاباي: 01118209309", "info", "رقم الدعم");
      }
    });
  }

  // معالجات الاشتراك السنوي وتنويه الدعم ونافذة الاشتراك (مطابقة لتطبيق سطح المكتب)
  const supportModal = document.getElementById("nepras-support-modal");
  const btnSupportProject = document.getElementById("btn-support-project");
  const btnMenuSupport = document.getElementById("btn-menu-support");
  const btnBannerOpenModal = document.getElementById("btn-banner-open-modal");
  const btnCloseSupport = document.getElementById("btn-close-support-modal");
  const btnDismissSupport = document.getElementById("btn-dismiss-support");
  const btnCopyModalPhone = document.getElementById("btn-copy-support-number");
  const btnBannerCopyPhone = document.getElementById("btn-banner-copy-phone");
  const btnDismissSubBanner = document.getElementById("btn-dismiss-sub-banner");
  const neprasSubBanner = document.getElementById("nepras-sub-banner");

  const openSupportModal = () => {
    if (supportModal) {
      supportModal.classList.remove("hidden");
      supportModal.removeAttribute("hidden");
    }
  };
  const closeSupportModal = () => {
    if (supportModal) {
      supportModal.classList.add("hidden");
      supportModal.setAttribute("hidden", "");
    }
  };

  if (btnSupportProject) btnSupportProject.addEventListener("click", openSupportModal);
  if (btnMenuSupport) btnMenuSupport.addEventListener("click", openSupportModal);
  if (btnBannerOpenModal) btnBannerOpenModal.addEventListener("click", openSupportModal);
  if (btnCloseSupport) btnCloseSupport.addEventListener("click", closeSupportModal);
  if (btnDismissSupport) btnDismissSupport.addEventListener("click", closeSupportModal);
  if (supportModal) {
    supportModal.addEventListener("click", (e) => {
      if (e.target === supportModal) closeSupportModal();
    });
  }

  const copyPhoneGeneric = async (btn) => {
    const phone = "01118209309";
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(phone);
      } else {
        const input = document.createElement("input");
        input.value = phone;
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        input.remove();
      }
      if (btn) {
        const orig = btn.textContent;
        btn.textContent = "✅ تم النسخ!";
        setTimeout(() => { btn.textContent = orig; }, 2500);
      }
      showNeprasPopupNotice("تم نسخ رقم الاشتراك (01118209309) بنجاح 🌸", "success", "نسخ الرقم");
    } catch (_) {
      showNeprasPopupNotice("رقم فودافون كاش / إنستاباي: 01118209309", "info", "رقم الاشتراك");
    }
  };

  if (btnCopyModalPhone) {
    btnCopyModalPhone.addEventListener("click", () => copyPhoneGeneric(btnCopyModalPhone));
  }
  if (btnBannerCopyPhone) {
    btnBannerCopyPhone.addEventListener("click", () => copyPhoneGeneric(btnBannerCopyPhone));
  }
  if (btnDismissSubBanner && neprasSubBanner) {
    btnDismissSubBanner.addEventListener("click", () => {
      neprasSubBanner.style.display = "none";
      try { sessionStorage.setItem("nepras_dismiss_sub_banner", "1"); } catch (_) {}
    });
    try {
      if (sessionStorage.getItem("nepras_dismiss_sub_banner") === "1") {
        neprasSubBanner.style.display = "none";
      }
    } catch (_) {}
  }

  const btnExportDiagnostics = document.getElementById("btn-export-diagnostics");
  if (btnExportDiagnostics) {
    btnExportDiagnostics.addEventListener("click", () => {
      try {
        if (globalThis.NeprasLogger && typeof globalThis.NeprasLogger.downloadDiagnosticsFile === "function") {
          const ok = globalThis.NeprasLogger.downloadDiagnosticsFile();
          if (ok) {
            showNeprasPopupNotice("تم تصدير ملف تقرير التشخيص بنجاح. يمكنك إرسال هذا الملف للدعم الفني لحل أي مشكلة فوراً.", "success", "سجل التشخيص");
          } else {
            showNeprasPopupNotice("تعذر تحميل ملف التشخيص في هذه البيئة.", "error", "سجل التشخيص");
          }
        } else {
          showNeprasPopupNotice("مسجل التشخيص غير متاح.", "warn", "سجل التشخيص");
        }
      } catch (err) {
        showNeprasPopupNotice("خطأ أثناء تصدير السجل: " + (err?.message || err), "error", "سجل التشخيص");
      }
    });
  }
  awaitSafe(loadKeepOpenSetting());

  function shouldAutoClosePopup() {
    if (neprasIsLargeWindow) return false;
    if (neprasKeepPopupOpen) return false;
    const isMobile = document.documentElement.classList.contains("nepras-mobile") ||
                     new URLSearchParams(location.search).get("mobileFull") === "1" ||
                     /Android|Mobile/i.test(navigator.userAgent);
    if (isMobile) return false;
    return true;
  }
  const btnExpensesRefresh = document.getElementById("btn-expenses-refresh");
  const btnExpensesExport = document.getElementById("btn-expenses-export");
  const expensesEmpty = document.getElementById("expenses-empty");
  const expensesContent = document.getElementById("expenses-content");
  const expensesMeta = document.getElementById("expenses-meta");
  const expensesDetailModal = document.getElementById("expenses-detail-modal");
  const expensesDetailTitle = document.getElementById("expenses-detail-title");
  const expensesDetailCount = document.getElementById("expenses-detail-count");
  const expensesDetailBody = document.getElementById("expenses-detail-body");
  const expensesDetailClose = document.getElementById("expenses-detail-close");
  const expensesDetailSearch = document.getElementById("expenses-detail-search");
  const expensesDetailExport = document.getElementById("expenses-detail-export");
  let expensesDetailRows = [];
  let expensesDetailCategory = "all";
  const nationwideStudentNationalId = document.getElementById("nationwide-student-national-id");
  const btnNationwideStudentSearch = document.getElementById("btn-nationwide-student-search");
  const nationwideStudentResult = document.getElementById("nationwide-student-result");

  const teacherTaskButtons = Array.from(document.querySelectorAll("[data-teacher-task]"));
  const btnOpenAcceptList = document.getElementById("btn-open-accept-list");
  const acceptSectionCard = document.querySelector(".accept-card");
  const btnStopActive = document.getElementById("btn-stop-active");
  const btnClosePopup = document.getElementById("btn-close-popup");
  const btnOpenLargeWindow = document.getElementById("btn-open-large-window");
  const neprasSiteStatus = document.getElementById("nepras-site-status");
  const btnThemeToggle = document.getElementById("btn-theme-toggle");
  const btnHelp = document.getElementById("btn-help");
  const helpModal = document.getElementById("nepras-help-modal");
  const btnCloseHelp = document.getElementById("btn-close-help");
  // الإشعارات والحوارات تُرسم عبر نظام الرسائل الموحّد (ui/nepras-ui.js)


  function neprasIsMinistryLoginUrl(rawUrl) {
    const value = String(rawUrl || "");
    return (
      /login\.microsoftonline\.com/i.test(value) ||
      /\/login(?:[/?#]|$)/i.test(value)
    );
  }

  // يرجع true دائمًا: مواضع قديمة تكتب `neprasNotice?.(...) || neprasDialog?.warning(...)` وكانت تُظهر
  // الإشعار والحوار معًا (أيقونتان لرسالة واحدة). الآن يظهر إشعار واحد فقط.
  function showNeprasPopupNotice(message, type = "info", title = "", options = {}) {
    window.NeprasLegacy?.notice(message, type, title, options);
    return true;
  }

  window.neprasNotice = showNeprasPopupNotice;

  async function neprasUnifiedDownload(blob, rawName, folder, successMsg) {
    const safeFolder = String(folder || "قوالب_نبراس").trim().replace(/[\\/:*?"<>|]+/g, "_");
    const safeName = String(rawName || "نموذج_نبراس.xlsx").trim().replace(/[\\/:*?"<>|]+/g, "_");
    const finalRelPath = `Nepras/${safeFolder}/${safeName}`;

    // 0) على تطبيق الهاتف (Android / Capacitor): الحفظ المباشر عبر الجسر الأصلي هو الأكثر استقراراً وموثوقية
    const mobileBackend = (typeof window !== "undefined" && (window.NeprasBackend || window.parent?.NeprasBackend));
    if (mobileBackend && typeof mobileBackend.saveFile === "function") {
      try {
        const base64 = await new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => {
            const res = String(r.result || "");
            const idx = res.indexOf(",");
            resolve(idx >= 0 ? res.slice(idx + 1) : res);
          };
          r.onerror = () => reject(r.error || new Error("FILE_READ_FAILED"));
          r.readAsDataURL(blob);
        });
        await mobileBackend.saveFile({
          filename: finalRelPath,
          base64,
          mime: blob.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        });
        showNeprasPopupNotice(successMsg || `تم حفظ ${safeName} بنجاح في مجلد التنزيلات.`, "success", "تم التنزيل");
        return;
      } catch (mobileErr) {
        console.warn("[Nepras] mobile direct saveFile error, falling back:", mobileErr);
      }
    }

    // 1) في نافذة الامتداد المباشرة (popup)، تتوفر chrome.downloads برابط blob محلي
    // وهو المسار الأكثر أماناً وموثوقية الذي يضمن حفظ الملف باسمه العربي الصريح ومجلده المخصص
    if (typeof chrome !== "undefined" && chrome.downloads?.download) {
      try {
        const url = URL.createObjectURL(blob);
        chrome.downloads.download({
          url,
          filename: finalRelPath,
          saveAs: false
        }, (downloadId) => {
          const err = chrome.runtime.lastError;
          setTimeout(() => { try { URL.revokeObjectURL(url); } catch (err) { console.warn("[Nepras Handled]", err?.message || err); } }, 30000);
          if (err || !downloadId) {
            console.warn("[Nepras] popup chrome.downloads failed, trying background:", err);
            fallbackToBackground();
          } else {
            if (window.neprasDialog?.registerGeneratedFile) {
              window.neprasDialog.registerGeneratedFile(finalRelPath, { isTemplate: true, canOpen: true });
            }
            showNeprasPopupNotice(successMsg || `تم تنزيل ${safeName} بنجاح في مجلد Nepras/${safeFolder}.`, "success", "تم التنزيل");
          }
        });
        return;
      } catch (e) {
        console.warn("[Nepras] direct download exception:", e);
      }
    }

    async function fallbackToBackground() {
      if (window.neprasDialog?.triggerDownload) {
        try {
          await window.neprasDialog.triggerDownload(blob, safeName, {
            folder: safeFolder,
            isTemplate: true,
            registerSuccess: false
          });
          showNeprasPopupNotice(successMsg || `تم تنزيل ${safeName} بنجاح.`, "success", "تم التنزيل");
          return;
        } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
      }
      // مسار احتياطي أخير
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = safeName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      showNeprasPopupNotice(successMsg || `تم حفظ ${safeName} بنجاح.`, "success", "تم التنزيل");
    }

    fallbackToBackground();
  }

  async function neprasUnifiedDownloadXlsx(wb, rawName, folder, successMsg) {
    if (wb instanceof Uint8Array || (wb && wb.buffer instanceof ArrayBuffer)) {
      const blob = new Blob([wb], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      });
      await neprasUnifiedDownload(blob, rawName, folder, successMsg);
      return;
    }
    if (typeof XLSX === "undefined") return;

    let wbout = null;
    if (typeof window !== "undefined" && typeof window.neprasXlsxConvertWorkbookToStyledPackage === "function") {
      try {
        wbout = window.neprasXlsxConvertWorkbookToStyledPackage(wb);
      } catch (styleErr) {
        console.warn("[Nepras] تعذر تطبيق التنسيق الملكي للأوفيس، جاري استخدام التصدير القياسي:", styleErr);
      }
    }
    if (!wbout) {
      wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    }

    const blob = new Blob([wbout], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
    await neprasUnifiedDownload(blob, rawName, folder, successMsg);
  }

  window.neprasUnifiedDownload = neprasUnifiedDownload;
  window.neprasUnifiedDownloadXlsx = neprasUnifiedDownloadXlsx;

  // شارة الاتصال في الهيدر: نقطة + نص (الحالة تُعرض بالنص وباللون معًا)
  function setSiteLabel(text) {
    if (!neprasSiteStatus) return;
    (neprasSiteStatus.querySelector(".n-status__label") || neprasSiteStatus).textContent = text;
  }

  async function neprasRefreshMinistryReadyStatus() {
    if (!neprasSiteStatus) return;

    try {
      const tabs = await chrome.tabs.query({});
      const ministryTabs = tabs.filter(tab =>
        /https:\/\/(student|teacher)\.emis\.gov\.eg\//i.test(String(tab?.url || "")) ||
        /https:\/\/tansik-adtik\.emis\.gov\.eg\//i.test(String(tab?.url || ""))
      );

      const readyTab = ministryTabs.find(tab =>
        tab?.status === "complete" &&
        !neprasIsMinistryLoginUrl(tab?.url)
      );

      neprasSiteStatus.classList.remove("site-ready", "site-waiting", "site-closed");

      if (readyTab) {
        setSiteLabel("جاهز للعمل");
        neprasSiteStatus.classList.add("site-ready");
        neprasSiteStatus.title = "تم رصد جلسة موقع الوزارة بعد تسجيل الدخول";
      } else if (ministryTabs.length) {
        setSiteLabel("سجّل الدخول للموقع");
        neprasSiteStatus.classList.add("site-waiting");
        neprasSiteStatus.title = "موقع الوزارة مفتوح لكن لم يتم رصد صفحة عمل جاهزة بعد";
      } else {
        setSiteLabel("افتح موقع الوزارة");
        neprasSiteStatus.classList.add("site-closed");
        neprasSiteStatus.title = "افتح موقع الطلاب أو المعلمين ثم سجّل الدخول";
      }
    } catch (_) {
      setSiteLabel("حالة الموقع غير معروفة");
      neprasSiteStatus.classList.remove("site-ready", "site-waiting");
      neprasSiteStatus.classList.add("site-closed");
    }
  }

  async function neprasOpenPersistentLargeWindow() {
    const largeUrl = chrome.runtime.getURL("popup.html?large=1");

    const closeCurrentPopup = () => {
      // إغلاق النافذة المنبثقة الأصلية فورًا حتى لا تظل ظاهرة وتتداخل مع النافذة الأكبر
      try { window.close(); } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
      setTimeout(() => {
        try { window.close(); } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
      }, 50);
    };

    if (!chrome.windows?.getAll || !chrome.windows?.create) {
      try {
        await chrome.tabs.create({ url: largeUrl, active: true });
        closeCurrentPopup();
        return;
      } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
      try {
        window.open(largeUrl, "_blank");
        closeCurrentPopup();
      } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
      return;
    }

    try {
      const windows = await chrome.windows.getAll({ populate: true });
      const existing = windows.find(win =>
        (win.tabs || []).some(tab =>
          String(tab?.url || "").startsWith(largeUrl)
        )
      );

      if (existing?.id != null) {
        await chrome.windows.update(existing.id, { focused: true });
        closeCurrentPopup();
        return;
      }

      await chrome.windows.create({
        url: largeUrl,
        type: "popup",
        width: 1120,
        height: 860,
        focused: true
      });
      closeCurrentPopup();
    } catch (_) {
      window.open(largeUrl, "_blank", "popup,width=1120,height=860");
      closeCurrentPopup();
    }
  }

  await neprasRefreshMinistryReadyStatus();
  const neprasSiteStatusTimer = setInterval(neprasRefreshMinistryReadyStatus, 3500);
  window.addEventListener("pagehide", () => clearInterval(neprasSiteStatusTimer), { once: true });

  btnOpenLargeWindow?.addEventListener("click", neprasOpenPersistentLargeWindow);

  const STAGE_GRADES = {
    KG: [
      { value: "KG1", text: "المستوى الأول", aliases: ["المستوى الأول", "المستوى الاول", "رياض الأطفال المستوى الأول", "رياض الاطفال المستوى الاول", "KG1", "كي جي 1"] },
      { value: "KG2", text: "المستوى الثاني", aliases: ["المستوى الثاني", "رياض الأطفال المستوى الثاني", "رياض الاطفال المستوى الثاني", "KG2", "كي جي 2"] }
    ],
    PRIMARY: ["الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس"].map((t, i) => ({ value: String(i + 1), text: `الصف ${t}`, aliases: [`الصف ${t}`, t] })),
    PREP: ["الأول", "الثاني", "الثالث"].map((t, i) => ({ value: String(i + 1), text: `الصف ${t} الإعدادي`, aliases: [`الصف ${t} الإعدادي`, `ال${t} الإعدادي`, t] })),
    GENERAL_SECONDARY: ["الأول", "الثاني", "الثالث"].map((t, i) => ({ value: String(i + 1), text: `الصف ${t} الثانوي`, aliases: [`الصف ${t} الثانوي`, `ال${t} الثانوي`, t] })),
    TECHNICAL_SECONDARY: ["الأول", "الثاني", "الثالث", "الرابع", "الخامس"].map((t, i) => ({ value: String(i + 1), text: `الصف ${t} الفني`, aliases: [`الصف ${t} الفني`, `ال${t} الفني`, t, `الصف ${t} الصناعي`, `الصف ${t} التجاري`, `الصف ${t} الزراعي`] }))
  };

  // الهروب من ui/escape.js (مصدر واحد، تحمّله popup.html قبل هذا الملف).
  function escapeHtml(value) {
    return NeprasEscape.html(value);
  }

  function isSecondaryStage(stageKey) {
    return stageKey === "GENERAL_SECONDARY" || stageKey === "TECHNICAL_SECONDARY";
  }

  function updateAcceptSectionVisibility(stageKey) {
    if (!acceptSectionCard) return;
    const show = isSecondaryStage(stageKey);
    acceptSectionCard.classList.toggle("is-hidden", !show);
  }

  // ==========================================================
  // الشكل العام: فاتح / ليلي + إغلاق + دليل الاستخدام
  // ==========================================================
  function setThemeButton(dark) {
    if (!btnThemeToggle) return;
    NeprasButtons.setLabel(btnThemeToggle, dark ? "العودة للوضع الفاتح" : "الوضع الليلي");
    NeprasButtons.setIcon(btnThemeToggle, dark ? "sun" : "moon");
  }

  async function applySavedTheme() {
    let theme = "light";
    try {
      const data = await chrome.storage.local.get("neprasTheme");
      theme = data?.neprasTheme === "dark" ? "dark" : "light";
    } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
    document.body.classList.toggle("theme-dark", theme === "dark");
    setThemeButton(theme === "dark");
    return theme;
  }

  btnThemeToggle?.addEventListener("click", async () => {
    const dark = !document.body.classList.contains("theme-dark");
    document.body.classList.toggle("theme-dark", dark);
    setThemeButton(dark);
    try { await chrome.storage.local.set({ neprasTheme: dark ? "dark" : "light" }); } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
  });
  awaitSafe(applySavedTheme());

  btnClosePopup?.addEventListener("click", async () => {
    try {
      const params = new URLSearchParams(location.search);
      if (params.get("mobileFull") === "1" && chrome.tabs?.getCurrent && chrome.tabs?.remove) {
        const tab = await chrome.tabs.getCurrent();
        if (tab?.id != null) { await chrome.tabs.remove(tab.id); return; }
      }
    } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
    try { window.close(); } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
  });
  function setHelpVisible(visible) {
    if (!helpModal) return;
    helpModal.hidden = !visible;
    document.body.classList.toggle("modal-open", visible);
    if (visible) {
      window.neprasTrapFocus?.(helpModal, { onEscape: () => setHelpVisible(false) });
    } else {
      window.neprasReleaseFocusTrap?.(helpModal);
    }
  }
  btnHelp?.addEventListener("click", () => setHelpVisible(true));
  btnCloseHelp?.addEventListener("click", () => setHelpVisible(false));
  helpModal?.addEventListener("click", (e) => { if (e.target === helpModal) setHelpVisible(false); });

  // ==========================================================
  // الشريط الجانبي: 6 مجموعات (tablist عمودي). محتوى المجموعة المختارة يظهر كاملًا بلا أكورديون.
  // ==========================================================
  const GROUP_KEY = "neprasLastGroup";
  const tabs = Array.from(document.querySelectorAll(".n-sidebar [role=tab]"));
  const groupsEl = Array.from(document.querySelectorAll(".n-group"));
  const contentEl = document.getElementById("n-content");

  // المرحلة الدراسية تظهر فقط في المجموعات التي تعتمد عليها (الطلاب/التقارير/الفصول، والحضور لأن «قبول الملفات» يتبع المرحلة)،
  // وأثناء البحث السريع (قد تظهر أقسام من أي مجموعة).
  const STAGE_GROUPS = new Set(["students", "reports", "classes", "attendance"]);
  function syncStageRow() {
    const row = document.getElementById("n-stage-row");
    if (!row) return;
    const active = document.querySelector(".n-sidebar [role=tab][aria-selected=true]")?.dataset.group;
    row.hidden = !(document.getElementById("n-content")?.classList.contains("is-searching") || STAGE_GROUPS.has(active));
  }

  function showGroup(id, opts) {
    const target = tabs.find((t) => t.dataset.group === id) || tabs[0];
    if (!target) return;
    for (const t of tabs) {
      const on = t === target;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
    }
    for (const g of groupsEl) g.classList.toggle("is-active", g.dataset.group === target.dataset.group);
    if (!(opts && opts.keepScroll)) {
      if (contentEl) contentEl.scrollTop = 0;
      document.body.scrollTop = 0; // في الموبايل الجسم هو من يُمرَّر
    }
    if (opts && opts.focus) target.focus();
    try { if (getComputedStyle(target.parentElement).flexDirection === "row") target.scrollIntoView({ block: "nearest", inline: "nearest" }); } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
    if (!(opts && opts.silent)) { try { chrome.storage.local.set({ [GROUP_KEY]: target.dataset.group }); } catch (err) { console.warn("[Nepras Handled]", err?.message || err); } }
    syncStageRow();
    document.dispatchEvent(new CustomEvent("nepras:group-shown", { detail: { group: target.dataset.group } }));
  }

  // اتجاه القائمة يتبع الشاشة: عمودي في النافذة، أفقي (شريط سفلي) في الموبايل — للقارئات الشاشية والأسهم
  const tablistEl = document.querySelector(".n-sidebar");
  const syncTablistOrientation = () => tablistEl?.setAttribute("aria-orientation", getComputedStyle(tablistEl).flexDirection === "row" ? "horizontal" : "vertical");
  syncTablistOrientation();
  window.addEventListener("resize", syncTablistOrientation);

  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => showGroup(tab.dataset.group));
    tab.addEventListener("keydown", (e) => {
      const rtl = getComputedStyle(document.documentElement).direction === "rtl";
      const horizontal = getComputedStyle(tab.parentElement).flexDirection === "row";
      let next = null;
      if (e.key === "ArrowDown" || (horizontal && e.key === (rtl ? "ArrowLeft" : "ArrowRight"))) next = (i + 1) % tabs.length;
      else if (e.key === "ArrowUp" || (horizontal && e.key === (rtl ? "ArrowRight" : "ArrowLeft"))) next = (i - 1 + tabs.length) % tabs.length;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = tabs.length - 1;
      if (next === null) return;
      e.preventDefault();
      showGroup(tabs[next].dataset.group, { focus: true });
    });
  });
  // استعادة آخر مجموعة فُتحت (بدون كتابة جديدة في التخزين)
  awaitSafe((async () => {
    try {
      const saved = (await chrome.storage.local.get(GROUP_KEY))[GROUP_KEY];
      if (saved) showGroup(saved, { silent: true });
    } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
  })());

  // ==========================================================
  // [Phase 4] بحث سريع + فتح/طي كل الأقسام + سجل آخر الملفات المُصدّرة
  // كتلة جديدة كليًا ومعزولة (IIFE) — لا تُعدّل أي دالة أو متغيّر موجود.
  // ==========================================================
  (function setupNeprasQuickTools() {
    const searchInput = document.getElementById("nepras-quick-search");
    const clearSearchBtn = document.getElementById("btn-clear-quick-search");
    const getCards = () => Array.from(document.querySelectorAll(".n-section[data-section]"));

    function applyQuickSearch(query) {
      const q = String(query || "").trim().toLowerCase();
      if (clearSearchBtn) clearSearchBtn.hidden = !q;
      // أثناء البحث تظهر الأقسام المطابقة من كل المجموعات معًا؛ وعند المسح نرجع للمجموعة المختارة.
      const contentEl2 = document.getElementById("n-content");
      contentEl2?.classList.toggle("is-searching", !!q);
      syncStageRow();
      getCards().forEach((card) => {
        if (!q) {
          card.classList.remove("is-search-hidden");
          return;
        }
        const title = card.querySelector(".n-section__copy h2")?.textContent || "";
        const sub = card.querySelector(".n-section__copy p")?.textContent || "";
        const haystack = (title + " " + sub).toLowerCase();
        card.classList.toggle("is-search-hidden", !haystack.includes(q));
      });
      const anyShown = getCards().some((c) => !c.classList.contains("is-search-hidden") && !c.classList.contains("is-hidden"));
      const emptyEl = document.getElementById("n-search-empty");
      if (emptyEl) emptyEl.hidden = !q || anyShown;
    }

    searchInput?.addEventListener("input", () => applyQuickSearch(searchInput.value));
    clearSearchBtn?.addEventListener("click", () => {
      if (searchInput) searchInput.value = "";
      applyQuickSearch("");
      searchInput?.focus();
    });

    // -------- شريط الأوامر (البحث) في الهيدر: زر أيقونة يفتح/يغلق صفًّا ثابتًا أسفل الهيدر.
    // الإغلاق (Esc، النقر خارجه، أو ضغط الزر مجددًا) يمسح البحث دائمًا فيرجع المحتوى لحالته الطبيعية. --------
    const cmdBtn = document.getElementById("btn-command-search");
    const cmdBar = document.getElementById("n-command-bar");
    let cmdOutsideHandler = null;

    function closeCommandBar({ returnFocus = true } = {}) {
      if (!cmdBar || cmdBar.hidden) return;
      cmdBar.hidden = true;
      cmdBtn?.setAttribute("aria-expanded", "false");
      if (searchInput) searchInput.value = "";
      applyQuickSearch("");
      if (cmdOutsideHandler) { document.removeEventListener("mousedown", cmdOutsideHandler, true); cmdOutsideHandler = null; }
      if (returnFocus) cmdBtn?.focus();
    }
    function openCommandBar() {
      if (!cmdBar || !cmdBar.hidden) return;
      cmdBar.hidden = false;
      cmdBtn?.setAttribute("aria-expanded", "true");
      searchInput?.focus();
      cmdOutsideHandler = (e) => {
        if (!cmdBar.contains(e.target) && e.target !== cmdBtn && !cmdBtn?.contains(e.target)) closeCommandBar({ returnFocus: false });
      };
      document.addEventListener("mousedown", cmdOutsideHandler, true);
    }
    cmdBtn?.addEventListener("click", () => (cmdBar?.hidden ? openCommandBar() : closeCommandBar()));
    cmdBar?.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeCommandBar(); }
    });

    // -------- سجل آخر الملفات المُصدّرة (يقرأ من chrome.storage.local
    // الذي يكتبه background.js عند كل NEPRAS_FILE_GENERATED) --------
    const exportsListEl = document.getElementById("nepras-recent-exports-list");
    const clearExportsBtn = document.getElementById("btn-clear-recent-exports");

    function formatNeprasRelativeTime(ts) {
      const diffMs = Date.now() - Number(ts || 0);
      const minutes = Math.floor(diffMs / 60000);
      if (minutes < 1) return "الآن";
      if (minutes < 60) return `منذ ${minutes} دقيقة`;
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return `منذ ${hours} ساعة`;
      const days = Math.floor(hours / 24);
      if (days < 7) return `منذ ${days} يوم`;
      try {
        return new Date(ts).toLocaleDateString("ar-EG", { day: "numeric", month: "short" });
      } catch (_) {
        return "";
      }
    }

    async function renderRecentExports() {
      if (!exportsListEl) return;
      let items = [];
      try {
        const stored = await chrome.storage.local.get("neprasRecentExports");
        items = Array.isArray(stored?.neprasRecentExports) ? stored.neprasRecentExports : [];
      } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }

      if (!items.length) {
        exportsListEl.innerHTML = '<div class="recent-exports-empty">لا توجد ملفات مُصدّرة بعد. ستظهر هنا كل مرة تُنشئ فيها ملف Excel أو PDF.</div>';
        return;
      }

      exportsListEl.innerHTML = "";
      items.slice(0, 15).forEach((item) => {
        const row = document.createElement("div");
        row.className = "recent-export-item";
        const nameEl = document.createElement("span");
        nameEl.className = "recent-export-name";
        nameEl.textContent = String(item?.fileName || "");
        const timeEl = document.createElement("span");
        timeEl.className = "recent-export-time";
        timeEl.textContent = formatNeprasRelativeTime(item?.startedAt);
        row.appendChild(nameEl);
        row.appendChild(timeEl);
        exportsListEl.appendChild(row);
      });
    }

    clearExportsBtn?.addEventListener("click", async (event) => {
      event.stopPropagation();
      try { await chrome.storage.local.set({ neprasRecentExports: [] }); } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
      renderRecentExports();
    });

    document.addEventListener("nepras:group-shown", (e) => { if (e.detail?.group === "files") renderRecentExports(); });

    renderRecentExports();
  })();

  function renderStageGradeHints(stageKey) {
    const grades = STAGE_GRADES[stageKey] || [];
    if (!gradePickerButton || !gradePickerMenu || !gradeSelect) return;

    gradeSelect.value = "";
    gradePickerButton.textContent = grades.length ? "اختر الصف الدراسي..." : "اختر المرحلة أولًا...";
    gradePickerButton.dataset.text = "";

    if (!grades.length) {
      gradePickerMenu.innerHTML = '<div style="padding:10px;text-align:center;font-weight:900;color:#64748b;">اختر المرحلة من الأعلى.</div>';
      return;
    }

    gradePickerMenu.innerHTML = grades.map((g) =>
      `<button type="button" class="grade-option" role="option" data-value="${escapeHtml(g.value)}" data-text="${escapeHtml(g.text)}">${escapeHtml(g.text)}</button>`
    ).join("");

    gradePickerMenu.querySelectorAll(".grade-option").forEach((btn) => {
      btn.addEventListener("click", () => {
        gradeSelect.value = btn.dataset.value || "";
        gradePickerButton.textContent = btn.dataset.text || "اختر الصف الدراسي...";
        gradePickerButton.dataset.text = btn.dataset.text || "";
        closeGradePickerMenu();
        gradePickerMenu.querySelectorAll(".grade-option").forEach((x) => x.classList.remove("selected"));
        btn.classList.add("selected");
      });
    });
  }

  function renderClassReportGrades(stageKey) {
    if (!classReportGradeSelect) return;
    const grades = STAGE_GRADES[stageKey] || [];
    classReportGradeSelect.innerHTML = '<option value="" disabled selected>اختر الصف المطلوب...</option>';
    grades.forEach((g) => {
      const opt = document.createElement("option");
      opt.value = g.value;
      opt.textContent = `قوائم فصول ${g.text}`;
      opt.dataset.text = g.text;
      classReportGradeSelect.appendChild(opt);
    });
    if (!grades.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "اختر المرحلة الدراسية أولًا...";
      opt.disabled = true;
      classReportGradeSelect.appendChild(opt);
    }
  }

  async function broadcastStageToOpenStudentTabs(stageKey) {
    if (!stageKey) return;
    try {
      const tabs = await chrome.tabs.query({});
      const studentTabs = tabs.filter((tab) => /https:\/\/student\.emis\.gov\.eg\//i.test(String(tab.url || "")));
      for (const tab of studentTabs) {
        if (!tab?.id) continue;
        await chrome.tabs.sendMessage(tab.id, { action: "SET_STUDENT_STAGE", stage: stageKey }).catch(() => {});
        await chrome.tabs.sendMessage(tab.id, { action: "REFRESH_STUDENT_TOOLBARS" }).catch(() => {});
      }
    } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
  }

  async function setStage(stageKey) {
    if (!stageKey) return;
    try { await chrome.storage.local.set({ neprasSelectedStudentStage: stageKey }); } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
    renderStageGradeHints(stageKey);
    renderClassReportGrades(stageKey);
    updateAcceptSectionVisibility(stageKey);

    // ربط تلقائي بملف المدرسة المخصص لهذه المرحلة إن وجد
    try {
      if (globalThis.NeprasSchoolManager && typeof switchSchoolProfile === "function") {
        const schools = await globalThis.NeprasSchoolManager.getSchoolsList();
        const matchingSchool = schools.find(s => s.stage === stageKey);
        const activeCode = await globalThis.NeprasSchoolManager.getActiveCode();
        if (matchingSchool && matchingSchool.code !== activeCode) {
          await switchSchoolProfile(matchingSchool.code);
          const sel = document.getElementById("school-profile-select");
          if (sel) sel.value = matchingSchool.code;
        }
      }
    } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }

    await broadcastStageToOpenStudentTabs(stageKey);
  }

  async function loadSavedStage() {
    let stage = "";
    try {
      const data = await chrome.storage.local.get("neprasSelectedStudentStage");
      stage = String(data?.neprasSelectedStudentStage || "").trim();
    } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }

    if (stageSelect && stage && STAGE_GRADES[stage]) {
      stageSelect.value = stage;
      renderStageGradeHints(stage);
      renderClassReportGrades(stage);
      updateAcceptSectionVisibility(stage);
    } else {
      renderStageGradeHints("");
      renderClassReportGrades("");
      updateAcceptSectionVisibility("");
    }
    return stage;
  }

  async function loadAvailableGrades() {
    const stage = stageSelect?.value || (await loadSavedStage());
    if (!stage) {
      renderStageGradeHints("");
      renderClassReportGrades("");
      return;
    }
    await setStage(stage);
  }

  stageSelect?.addEventListener("change", loadAvailableGrades);
  awaitSafe(loadSavedStage());
  btnRefreshGrades?.addEventListener("click", loadAvailableGrades);

  // v1.0: القائمة كانت position:absolute جوه #n-content اللي عنده
  // overflow-y:auto، فلو القائمة اتفتحت وملهاش مساحة كافية تحت الزر
  // جوه المساحة المرئية للـ popup، الجزء الزايد كان بيتقصّ (يختفي) بدل
  // ما يظهر أو يعمل scroll. الحل: نحوّلها لـ position:fixed بالنسبة
  // للـ viewport (بره تقصّ overflow الخاص بـ #n-content) ونحسب
  // مكانها وارتفاعها بالجافاسكريبت، ونقلبها لفوق الزر لو المساحة تحت
  // مش كافية.
  function positionGradePickerMenu() {
    if (!gradePickerButton || !gradePickerMenu) return;

    const rect = gradePickerButton.getBoundingClientRect();
    const gap = 5;
    const preferredMax = 210; // نفس max-height الأصلية في popup.css
    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    const openUpward = spaceBelow < 120 && spaceAbove > spaceBelow;

    gradePickerMenu.style.position = "fixed";
    gradePickerMenu.style.left = `${rect.left}px`;
    gradePickerMenu.style.right = "auto";
    gradePickerMenu.style.width = `${rect.width}px`;
    gradePickerMenu.style.maxHeight =
      `${Math.max(100, Math.min(preferredMax, openUpward ? spaceAbove : spaceBelow))}px`;

    if (openUpward) {
      gradePickerMenu.style.top = "auto";
      gradePickerMenu.style.bottom = `${window.innerHeight - rect.top + gap}px`;
    } else {
      gradePickerMenu.style.bottom = "auto";
      gradePickerMenu.style.top = `${rect.bottom + gap}px`;
    }
  }

  function closeGradePickerMenu() {
    gradePickerMenu?.classList.remove("open");
    gradePickerButton?.setAttribute("aria-expanded", "false");
    window.removeEventListener("scroll", positionGradePickerMenu, true);
    window.removeEventListener("resize", positionGradePickerMenu);
  }

  gradePickerButton?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!stageSelect?.value) return;
    const open = gradePickerMenu?.classList.toggle("open");
    gradePickerButton.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      positionGradePickerMenu();
      // #n-content بيعمل scroll وده بيحرّك مكان الزر من غير resize event،
      // فلازم نعيد الحساب مع أي scroll (capture:true عشان نلقط الـ scroll
      // حتى لو حصل جوه container مش الـ window نفسه) وأي resize للـ popup.
      window.addEventListener("scroll", positionGradePickerMenu, true);
      window.addEventListener("resize", positionGradePickerMenu);
    } else {
      window.removeEventListener("scroll", positionGradePickerMenu, true);
      window.removeEventListener("resize", positionGradePickerMenu);
    }
  });

  document.addEventListener("click", (e) => {
    if (!gradePickerButton || !gradePickerMenu) return;
    if (!gradePickerMenu.contains(e.target) && e.target !== gradePickerButton) {
      closeGradePickerMenu();
    }
  });

  // ==========================================================
  // إحصاء المدرسة — عرض آخر نتيجة محفوظة
  // ==========================================================

  function schoolStatsDetailFilterLabel(filter = {}) {
    const parts = [];

    if (filter.grade) parts.push(filter.grade);
    else parts.push("كل الصفوف");

    if (filter.status) parts.push(filter.status);
    if (filter.integrated === true) parts.push("طلاب الدمج");
    if (filter.mode) parts.push(filter.mode);
    if (filter.gender) parts.push(filter.gender);

    if (
      !filter.status &&
      filter.integrated !== true &&
      !filter.mode &&
      !filter.gender
    ) {
      parts.push("إجمالي الطلاب");
    }

    return parts.join(" — ");
  }

  function renderSchoolStatsDetailRows(rows) {
    if (!schoolStatsDetailBody) return;

    const q =
      String(schoolStatsDetailSearch?.value || "")
        .trim()
        .toLowerCase();

    const visible = !q
      ? rows
      : rows.filter(row =>
          [
            row.name,
            row.code,
            row.nationalId,
            row.grade,
            row.className,
            row.gender,
            row.mode,
            row.integrated,
            row.integrationType,
            row.status
          ]
            .join(" ")
            .toLowerCase()
            .includes(q)
        );

    schoolStatsDetailBody.innerHTML = visible.length
      ? visible.map((row, index) => `
          <tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(row.name || "")}</td>
            <td dir="ltr">${escapeHtml(row.code || "")}</td>
            <td dir="ltr">${escapeHtml(row.nationalId || "")}</td>
            <td>${escapeHtml(row.grade || "")}</td>
            <td>${escapeHtml(row.className || "")}</td>
            <td>${escapeHtml(row.gender || "")}</td>
            <td>${escapeHtml(row.mode || "")}</td>
            <td>${escapeHtml(row.integrated || "")}</td>
            <td>${escapeHtml(row.integrationType || "—")}</td>
            <td>${escapeHtml(row.status || "")}</td>
          </tr>
        `).join("")
      : `<tr><td colspan="11" class="school-stats-detail-empty">لا توجد نتائج مطابقة.</td></tr>`;

    if (schoolStatsDetailCount) {
      schoolStatsDetailCount.textContent =
        q
          ? `${visible.length} من ${rows.length} طالب`
          : `${rows.length} طالب`;
    }
  }

  function popupSchoolStatsMatchesDetail(row, filter = {}) {
    if (
      filter.grade &&
      String(row.grade || "").trim() !== String(filter.grade).trim()
    ) return false;

    if (
      filter.gender &&
      String(row.gender || "").trim() !== String(filter.gender).trim()
    ) return false;

    if (
      filter.mode &&
      String(row.mode || "").trim() !== String(filter.mode).trim()
    ) return false;

    if (
      filter.integrated === true &&
      String(row.integrated || "") !== "نعم"
    ) return false;

    if (
      filter.integrated === false &&
      String(row.integrated || "") === "نعم"
    ) return false;

    if (
      filter.status &&
      String(row.status || "").trim() !== String(filter.status).trim()
    ) return false;

    return true;
  }

  function popupNormalizeOldSchoolStatsRow(row) {
    const pick = (keys) => {
      for (const key of keys) {
        if (
          row &&
          Object.prototype.hasOwnProperty.call(
            row,
            key
          ) &&
          String(
            row[key] ?? ""
          ).trim() !== ""
        ) {
          return String(
            row[key] ?? ""
          ).trim();
        }
      }

      return "";
    };

    const canonicalAlready =
      (Object.prototype.hasOwnProperty.call(row || {}, "name") && row?.name) ||
      (Object.prototype.hasOwnProperty.call(row || {}, "code") && row?.code);

    if (canonicalAlready) {
      const rawDamg = String(row?.integrationType || row?.damg || row?.["الموقف من الدمج"] || row?.["نوع الدمج"] || "").trim();
      const isPosDamg = rawDamg && !/^(—|-|لا|لا يوجد|لايوجد|غير مدمج|0|false)$/i.test(rawDamg);
      const isInt = String(row?.integrated || row?.["الدمج"] || "").trim() === "نعم" || isPosDamg;
      return {
        grade: String(row?.grade || row?.["الصف"] || "").trim(),
        code: String(row?.code || row?.studentCode || row?.["كود التلميذ"] || "").trim(),
        name: String(row?.name || row?.fullName || row?.["اسم التلميذ"] || "").trim(),
        nationalId: String(row?.nationalId || row?.["الرقم القومي"] || "").trim(),
        gender: String(row?.gender || row?.["النوع"] || "").trim(),
        mode: String(row?.mode || row?.eduSystem || row?.studyType || row?.["نوعية التعليم"] || "").trim(),
        className: String(row?.className || row?.classRoom || row?.["الفصل"] || "").trim(),
        integrated: isInt ? "نعم" : "لا",
        integrationType: isInt ? (isPosDamg ? rawDamg : "دمج تربوي") : "—",
        status: String(row?.status || row?.enrollStatus || row?.["حالة القيد"] || "").trim(),
        religion: String(row?.religion || row?.["الديانة"] || "").trim()
      };
    }

    const pickedDamg = pick(["نوع الدمج", "الموقف من الدمج", "حالة الدمج", "damg", "integrationType"]);
    const isPosPickedDamg = pickedDamg && !/^(—|-|لا|لا يوجد|لايوجد|غير مدمج|0|false)$/i.test(pickedDamg);
    const pickedIntegrated = (row?.__neprasStatsIntegrated === "نعم" || pick(["الدمج", "integrated"]) === "نعم" || isPosPickedDamg) ? "نعم" : "لا";
    return {
      grade: row?.__neprasGrade || pick(["الصف", "grade"]),
      code: pick(["كود التلميذ", "كود الطالب", "كود", "studentCode", "code"]),
      name: pick(["اسم التلميذ", "اسم الطالب", "الاسم بالكامل", "الاسم", "fullName", "name"]),
      nationalId: pick(["الرقم القومي", "رقم قومي", "nationalId", "nid"]),
      gender: row?.__neprasStatsGender || pick(["النوع", "gender"]),
      mode: row?.__neprasStatsMode || pick(["نوعية التعليم", "نوع التعليم", "نظام التعليم", "eduSystem", "studyType", "mode"]),
      className: pick(["الفصل", "الصف الفصل", "اسم الفصل", "classRoom", "className"]),
      integrated: pickedIntegrated,
      integrationType: pickedIntegrated === "نعم" ? (isPosPickedDamg ? pickedDamg : "دمج تربوي") : "—",
      status: row?.__neprasStatsStatus || pick(["حالة القيد", "حالة قيد الطالب", "الحالة", "enrollStatus", "status"]),
      religion: pick(["الديانة", "religion"])
    };
  }

  function popupSynthesizeSchoolStatsFromRows(rowsInput, baseStats = {}) {
    const list = Array.isArray(rowsInput) ? rowsInput : [];
    if (!list.length) return null;

    const normStr = (v) => String(v ?? "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").trim();
    const statusBucket = (rawStatus) => {
      const r = String(rawStatus || "").trim();
      const n = normStr(r);
      if (!n) return "غير محدد";
      if (n.includes("ناجح") && n.includes("منقول")) return "ناجح ومنقول";
      if (n.includes("باق") && n.includes("اعاد")) return "باقون للإعادة";
      if (n.includes("راسب")) return "راسبون";
      if (n.includes("منقطع")) return "منقطعون";
      if (n.includes("مفصول")) return "مفصولون";
      if (n.includes("محول")) return "محولون";
      if (n.includes("منقول")) return "منقولون";
      if (n.includes("مقيد")) return "مقيدون";
      if (n.includes("مستجد")) return "مستجدون";
      return r;
    };

    const byGrade = new Map();
    const detailRows = [];

    for (const rawRow of list) {
      if (!rawRow || typeof rawRow !== "object") continue;
      const d = popupNormalizeOldSchoolStatsRow(rawRow);
      let gender = d.gender;
      if (!gender || (gender !== "بنين" && gender !== "بنات")) {
        const ng = normStr(gender);
        if (ng.includes("ذكر") || ng.includes("بنين") || ng.includes("ولد")) gender = "بنين";
        else if (ng.includes("انث") || ng.includes("بنات") || ng.includes("بنت")) gender = "بنات";
        else {
          const nidDigits = String(d.nationalId || "").replace(/\D/g, "");
          if (nidDigits.length === 14) {
            const gDigit = Number(nidDigits[12]);
            if (Number.isFinite(gDigit)) gender = (gDigit % 2 === 1) ? "بنين" : "بنات";
          }
        }
      }
      const modeNorm = normStr(d.mode);
      const statusNorm = normStr(d.status);
      const isWorker = modeNorm.includes("عمال") || modeNorm.includes("عمل") || statusNorm.includes("عمال");
      const isHome = !isWorker && (modeNorm.includes("منازل") || modeNorm.includes("منزل"));
      const eduMode = isWorker ? "عمال" : (isHome ? "منازل" : "منتظم");
      const stBucket = statusBucket(d.status);
      const gName = d.grade || "غير محدد";

      const enrichedDetail = {
        ...rawRow,
        ...d,
        grade: gName,
        gender: gender || "غير محدد",
        mode: isHome ? "منازل" : (isWorker ? "عمال" : (d.mode || eduMode)),
        status: stBucket !== "غير محدد" ? stBucket : d.status
      };
      detailRows.push(enrichedDetail);

      if (!byGrade.has(gName)) {
        byGrade.set(gName, {
          grade: gName,
          total: 0,
          boys: 0,
          girls: 0,
          unknownGender: 0,
          classesSet: new Set(),
          homes: 0,
          integrated: 0,
          statuses: {},
          seenKeys: new Set()
        });
      }
      const gObj = byGrade.get(gName);
      const uKey = String(d.code || d.nationalId || (d.name + "|" + gObj.total)).trim();
      if (gObj.seenKeys.has(uKey)) continue;
      gObj.seenKeys.add(uKey);

      gObj.total++;
      if (gender === "بنين") gObj.boys++;
      else if (gender === "بنات") gObj.girls++;
      else gObj.unknownGender++;

      if (isHome) gObj.homes++;
      if (!isHome && !isWorker && d.className && !/^(0|-1|--|-|اختر|بدون فصل|لا يوجد|غير محدد|عام)$/i.test(normStr(d.className))) {
        gObj.classesSet.add(d.className.trim());
      }
      if (d.integrated === "نعم") gObj.integrated++;
      if (stBucket && stBucket !== "غير محدد") {
        gObj.statuses[stBucket] = (gObj.statuses[stBucket] || 0) + 1;
      }
    }

    const grades = Array.from(byGrade.values()).map((g) => ({
      grade: g.grade,
      total: g.total,
      boys: g.boys,
      girls: g.girls,
      unknownGender: g.unknownGender,
      classes: g.classesSet.size,
      homes: g.homes,
      integrated: g.integrated,
      statuses: g.statuses
    }));

    if (typeof window.NeprasStatsDashboard?.sortGrades === "function") {
      grades.sort((a, b) => window.NeprasStatsDashboard.sortGrades(a.grade, b.grade));
    }

    const statuses = {};
    for (const g of grades) {
      for (const [k, v] of Object.entries(g.statuses || {})) {
        statuses[k] = (statuses[k] || 0) + v;
      }
    }

    return {
      ...baseStats,
      version: 161,
      source: baseStats?.source || "neprasCachedStudentsList",
      schoolName: baseStats?.schoolName || document.getElementById("sc-meta-school")?.value?.trim() || "المدرسة الحالية",
      stage: baseStats?.stage || stageSelect?.value || "",
      generatedAt: baseStats?.generatedAt || new Date().toISOString(),
      total: grades.reduce((s, g) => s + g.total, 0),
      boys: grades.reduce((s, g) => s + g.boys, 0),
      girls: grades.reduce((s, g) => s + g.girls, 0),
      unknownGender: grades.reduce((s, g) => s + g.unknownGender, 0),
      classes: grades.reduce((s, g) => s + g.classes, 0),
      homes: grades.reduce((s, g) => s + g.homes, 0),
      integrated: grades.reduce((s, g) => s + g.integrated, 0),
      statuses,
      grades,
      detailRows,
      rows: detailRows
    };
  }

  async function openSchoolStatsDetails(filter = {}) {

    schoolStatsDetailFilter = { ...filter };

    if (schoolStatsDetailTitle) {
      schoolStatsDetailTitle.textContent =
        schoolStatsDetailFilterLabel(filter);
    }

    if (schoolStatsDetailCount) {
      schoolStatsDetailCount.textContent = "جارٍ التحميل...";
    }

    if (schoolStatsDetailBody) {
      schoolStatsDetailBody.innerHTML =
        `<tr><td colspan="11" class="school-stats-detail-empty">جارٍ تجهيز القائمة...</td></tr>`;
    }

    if (schoolStatsDetailSearch) {
      schoolStatsDetailSearch.value = "";
    }

    if (schoolStatsDetailModal) {
      schoolStatsDetailModal.hidden = false;
      window.neprasTrapFocus?.(schoolStatsDetailModal, { onEscape: closeSchoolStatsDetails, initialFocus: "#school-stats-detail-search" });
    }

    try {
      // نقرأ من التخزين مباشرة؛ لا حاجة للاتصال بتبويب الموقع
      // لأن الإحصاء الكامل محفوظ بالفعل.
      const stored =
        await chrome.storage.local.get([
          "neprasSchoolStatsV1",
          "neprasCachedStudentsList"
        ]);

      let stats =
        stored?.neprasSchoolStatsV1;

      if ((!stats || (!stats.detailRows?.length && !stats.rows?.length)) && Array.isArray(stored?.neprasCachedStudentsList) && stored.neprasCachedStudentsList.length) {
        stats = popupSynthesizeSchoolStatsFromRows(stored.neprasCachedStudentsList, stats || {});
      }

      if (!stats) {
        throw new Error(
          "لا يوجد إحصاء مدرسة محفوظ. اضغط «تحديث إحصاء المدرسة» أو «تنزيل وتحديث البيانات الشاملة للمدرسة» أولًا."
        );
      }

      let rows = [];

      if (
        Array.isArray(stats.detailRows) &&
        stats.detailRows.length
      ) {
        rows =
          stats.detailRows.map(
            popupNormalizeOldSchoolStatsRow
          );
      } else if (
        Array.isArray(stats.rows)
      ) {
        rows = stats.rows.map(
          popupNormalizeOldSchoolStatsRow
        );
      }

      schoolStatsDetailRows =
        rows.filter(
          row =>
            popupSchoolStatsMatchesDetail(
              row,
              filter
            )
        );

      if (schoolStatsDetailTitle) {
        schoolStatsDetailTitle.textContent =
          schoolStatsDetailFilterLabel(
            filter
          );
      }

      renderSchoolStatsDetailRows(
        schoolStatsDetailRows
      );
    } catch (error) {
      schoolStatsDetailRows = [];

      if (schoolStatsDetailBody) {
        schoolStatsDetailBody.innerHTML =
          `<tr><td colspan="11" class="school-stats-detail-empty">❌ ${escapeHtml(error?.message || String(error))}</td></tr>`;
      }

      if (schoolStatsDetailCount) {
        schoolStatsDetailCount.textContent =
          "تعذر التحميل";
      }
    }
  }

  function closeSchoolStatsDetails() {
    if (schoolStatsDetailModal) {
      schoolStatsDetailModal.hidden = true;
      window.neprasReleaseFocusTrap?.(schoolStatsDetailModal);
    }

    schoolStatsDetailRows = [];
    schoolStatsDetailFilter = null;
  }

  // رسوم لوحة إحصاء المدرسة (SVG محلي بلا مكتبات). تُبنى من نفس كائن stats المعروض في الجداول.
  function renderSchoolStatsCharts(stats, statusNames) {
    const host = document.getElementById("school-stats-charts");
    if (!host || !window.NeprasCharts) return;
    try {
      const shortGrade = (g) => String(g || "").replace(/^الصف\s*/, "").trim() || "—";
      const grades = (stats.grades || []).filter(g => Number(g.total || 0) > 0);

      const byGrade = window.NeprasCharts.barH({
        title: "الطلاب حسب الصف والنوع",
        subtitle: "العدد الإجمالي عند طرف كل عمود",
        rowHeader: "الصف",
        series: [{ name: "بنين" }, { name: "بنات" }],
        stacked: true,
        unit: "طالب",
        rows: grades.map(g => ({ label: shortGrade(g.grade), values: [Number(g.boys || 0), Number(g.girls || 0)] }))
      });

      const byStatus = window.NeprasCharts.barH({
        title: "حالات الطلاب",
        rowHeader: "الحالة",
        series: [{ name: "عدد الطلاب" }],
        unit: "طالب",
        rows: (statusNames || []).map(name => ({ label: name, values: [Number(stats.statuses?.[name] || 0)] }))
      });

      const density = window.NeprasCharts.barH({
        title: "متوسط كثافة الفصل لكل صف",
        subtitle: "الخطان المرجعيان: 30 (منخفضة) و50 (مرتفعة جدًا) طالبًا في الفصل",
        rowHeader: "الصف",
        series: [{ name: "طالب لكل فصل" }],
        unit: "طالب/فصل",
        minMax: 60,
        refLines: [{ value: 30, label: "30" }, { value: 50, label: "50" }],
        rows: grades.filter(g => Number(g.classes || 0) > 0)
          .map(g => ({ label: shortGrade(g.grade), values: [Math.round((Number(g.total) / Number(g.classes)) * 10) / 10] }))
      });

      host.innerHTML = /* html-safe: كل نص من البيانات مهروب داخل NeprasCharts.barH عبر NeprasEscape.html */ byGrade + byStatus + density;
      window.NeprasCharts.attach(host);
    } catch (error) {
      console.warn("[نبراس] تعذّر رسم الرسوم البيانية:", error?.message || error);
      host.textContent = "";
    }
  }

  function renderSchoolStats(stats) {
    const hasStudents = Array.isArray(window.neprasCachedStudentsList) && window.neprasCachedStudentsList.length > 0;
    if (!(stats && Array.isArray(stats.grades) && stats.grades.length) && hasStudents) {
      stats = popupSynthesizeSchoolStatsFromRows(window.neprasCachedStudentsList, stats || {});
    }
    window.currentRenderedSchoolStats = stats || null;
    const has = !!(stats && Array.isArray(stats.grades) && stats.grades.length);
    if (schoolStatsEmpty) schoolStatsEmpty.hidden = has;
    // إظهار لوحة إحصاء المدرسة دائماً في تبويب التقارير والإحصاء
    if (schoolStatsContent) schoolStatsContent.hidden = false;
    const canExport = has || hasStudents;
    if (btnSchoolStatsExport) NeprasButtons.disable(btnSchoolStatsExport, canExport ? null : "لا توجد بيانات للتصدير. حدّث إحصاء المدرسة أولًا.");

    const setText = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = String(value ?? 0);
    };

    if (!has) {
      setText("stat-school-total", 0);
      setText("stat-school-boys", 0);
      setText("stat-school-girls", 0);
      setText("stat-school-classes", 0);
      setText("stat-school-homes", 0);
      setText("stat-school-integrated", 0);
      if (schoolStatsMeta) schoolStatsMeta.textContent = "لم يتم تحميل بيانات الإحصاء بعد";
      if (schoolStatsStatuses) {
        schoolStatsStatuses.innerHTML = "<div class=\"school-status-empty\">اضغط «تحديث إحصاء المدرسة» أو «تنزيل وتحديث البيانات الشاملة للمدرسة» لعرض حالات الطلاب.</div>";
      }
      if (schoolStatsGradeHead) {
        schoolStatsGradeHead.innerHTML = ["الصف", "الإجمالي", "بنين", "بنات", "الفصول", "منازل", "دمج"].map(name => "<th>" + escapeHtml(name) + "</th>").join("");
      }
      if (schoolStatsGradeBody) {
        schoolStatsGradeBody.innerHTML = "<tr><td colspan=\"7\" style=\"text-align:center;color:#64748b;padding:12px;\">لا توجد بيانات معروضة بعد — اضغط «تحديث إحصاء المدرسة» أو «تنزيل وتحديث البيانات الشاملة للمدرسة»</td></tr>";
      }
      const chartHost = document.getElementById("school-stats-charts");
      if (chartHost) chartHost.textContent = "";
      return;
    }
    setText("stat-school-total", stats.total);
    setText("stat-school-boys", stats.boys);
    setText("stat-school-girls", stats.girls);
    setText("stat-school-classes", stats.classes);
    setText("stat-school-homes", stats.homes || 0);
    setText("stat-school-integrated", stats.integrated);

    if (schoolStatsMeta) {
      let when = "";
      try { when = new Date(stats.generatedAt).toLocaleString("ar-EG"); } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
      schoolStatsMeta.textContent = `${stats.schoolName || "المدرسة الحالية"}${when ? ` • آخر تحديث: ${when}` : ""}`;
    }

    const statusPriority = [
      "ناجح ومنقول",
      "مقيدون",
      "مستجدون",
      "باقون للإعادة",
      "راسبون",
      "منقطعون",
      "محولون",
      "منقولون",
      "مفصولون"
    ];

    const rawStatusNames = Object.keys(stats.statuses || {})
      .filter(k => k !== "غير محدد" && Number(stats.statuses?.[k] || 0) > 0);

    const statusNames = [
      ...statusPriority.filter(name => rawStatusNames.includes(name)),
      ...rawStatusNames
        .filter(name => !statusPriority.includes(name))
        .sort((a, b) => a.localeCompare(b, "ar"))
    ];

    if (schoolStatsStatuses) {
      schoolStatsStatuses.innerHTML = statusNames.length
        ? statusNames.map(name => `
            <button class="school-status-card school-stat-click"
                    type="button"
                    data-stat-status="${escapeHtml(name)}"
                    title="عرض أسماء الطلاب">
              <b>${Number(stats.statuses?.[name] || 0)}</b>
              <span>${escapeHtml(name)}</span>
            </button>`).join("")
        : '<div class="school-status-empty">لا توجد حالات إضافية ظاهرة في بيانات القائمة.</div>';
    }

    if (schoolStatsGradeHead) {
      const fixedHeaders = ["الصف", "الإجمالي", "بنين", "بنات", "الفصول", "منازل", "دمج"];
      schoolStatsGradeHead.innerHTML = [
        ...fixedHeaders,
        ...statusNames
      ].map(name => `<th>${escapeHtml(name)}</th>`).join("");
    }

    if (schoolStatsGradeBody) {
      const detailCell = (value, attrs, title = "عرض أسماء الطلاب") =>
        `<td><button type="button" class="school-stat-cell school-stat-click" ${attrs} title="${title}">${Number(value || 0)}</button></td>`;

      const gradeRows = stats.grades.map(g => `
        <tr>
          <td>${escapeHtml(g.grade)}</td>
          ${detailCell(g.total, `data-stat-grade="${escapeHtml(g.grade)}"`)}
          ${detailCell(g.boys, `data-stat-grade="${escapeHtml(g.grade)}" data-stat-gender="بنين"`)}
          ${detailCell(g.girls, `data-stat-grade="${escapeHtml(g.grade)}" data-stat-gender="بنات"`)}
          <td>${Number(g.classes || 0)}</td>
          ${detailCell(g.homes, `data-stat-grade="${escapeHtml(g.grade)}" data-stat-mode="منازل"`)}
          ${detailCell(g.integrated, `data-stat-grade="${escapeHtml(g.grade)}" data-stat-integrated="1"`)}
          ${statusNames.map(name =>
            detailCell(
              g.statuses?.[name],
              `data-stat-grade="${escapeHtml(g.grade)}" data-stat-status="${escapeHtml(name)}"`
            )
          ).join("")}
        </tr>`).join("");

      const totalRow = `
        <tr class="school-stats-total-row">
          <td>الإجمالي</td>
          ${detailCell(stats.total, ``)}
          ${detailCell(stats.boys, `data-stat-gender="بنين"`)}
          ${detailCell(stats.girls, `data-stat-gender="بنات"`)}
          <td>${Number(stats.classes || 0)}</td>
          ${detailCell(stats.homes, `data-stat-mode="منازل"`)}
          ${detailCell(stats.integrated, `data-stat-integrated="1"`)}
          ${statusNames.map(name =>
            detailCell(
              stats.statuses?.[name],
              `data-stat-status="${escapeHtml(name)}"`
            )
          ).join("")}
        </tr>`;

      schoolStatsGradeBody.innerHTML = /* html-safe: صفوف مبنية من detailCell والقيم فيها مهروبة أو أرقام */ gradeRows + /* html-safe: كما سبق */ totalRow;
    }

    renderSchoolStatsCharts(stats, statusNames);

    document.querySelectorAll(".school-stat-click").forEach(button => {
      button.addEventListener("click", () => {
        const filter = {};

        const grade = button.dataset.statGrade;
        const gender = button.dataset.statGender;
        const mode = button.dataset.statMode;
        const status = button.dataset.statStatus;
        const integrated = button.dataset.statIntegrated;

        if (grade) filter.grade = grade;
        if (gender) filter.gender = gender;
        if (mode) filter.mode = mode;
        if (status) filter.status = status;
        if (integrated === "1") filter.integrated = true;

        openSchoolStatsDetails(filter);
      });
    });
  }


  function isStudentBoy(r) {
    if (typeof NeprasEgypt?.isMale === "function") {
      const m = NeprasEgypt.isMale(r);
      if (typeof m === "boolean") return m;
    }
    const g = String(r?.gender || r?.["النوع"] || "").trim();
    if (g.includes("بنين") || g.includes("ذكر")) return true;
    const nid = String(r?.nationalId || r?.["الرقم القومي"] || "").replace(/\D/g, "");
    if (nid.length === 14) return Number(nid[12]) % 2 === 1;
    return false;
  }

  function isStudentGirl(r) {
    if (typeof NeprasEgypt?.isMale === "function") {
      const m = NeprasEgypt.isMale(r);
      if (typeof m === "boolean") return !m;
    }
    const g = String(r?.gender || r?.["النوع"] || "").trim();
    if (g.includes("بنات") || g.includes("انثى") || g.includes("أنثى")) return true;
    const nid = String(r?.nationalId || r?.["الرقم القومي"] || "").replace(/\D/g, "");
    if (nid.length === 14) return Number(nid[12]) % 2 === 0;
    return false;
  }

  function popupExpensesRowsByCategory(result, category) {
    const rows =
      Array.isArray(result?.rows)
        ? result.rows
        : [];

    const paidReportRows =
      Array.isArray(result?.paidReportRows)
        ? result.paidReportRows
        : [];

    if (typeof category === "string" && category.startsWith("grade:")) {
      const parts = category.split(":");
      const gradeName = parts[1] || "";
      const sub = parts[2] || "all";
      const gradeRows = rows.filter(r => String(r.grade || "").trim() === gradeName.trim());
      if (sub === "all") return gradeRows;
      if (sub === "homes") return gradeRows.filter(r => r.isHome);
      if (sub === "paid") return gradeRows.filter(r => !r.isHome && r.paid);
      if (sub === "paid_full") return gradeRows.filter(r => !r.isHome && r.paid && r.exemptionClass !== "partial" && r.exemptionClass !== "full");
      if (sub === "paid_partial") return gradeRows.filter(r => !r.isHome && r.paid && r.exemptionClass === "partial");
      if (sub === "paid_exempt") return gradeRows.filter(r => !r.isHome && r.paid && r.exemptionClass === "full");
      if (sub === "unpaid") return gradeRows.filter(r => !r.isHome && !r.paid);
      if (sub === "unpaid_full") return gradeRows.filter(r => !r.isHome && !r.paid && r.exemptionClass !== "partial" && r.exemptionClass !== "full");
      if (sub === "unpaid_partial") return gradeRows.filter(r => !r.isHome && !r.paid && r.exemptionClass === "partial");
      if (sub === "unpaid_exempt") return gradeRows.filter(r => !r.isHome && !r.paid && r.exemptionClass === "full");
      return gradeRows;
    }

    if (category === "boys") return rows.filter(isStudentBoy);
    if (category === "girls") return rows.filter(isStudentGirl);

    if (category === "homes") {
      return rows.filter(r => r.isHome);
    }

    if (category === "paid") {
      return paidReportRows.length
        ? [...paidReportRows]
        : rows.filter(r => !r.isHome && r.paid);
    }

    if (category === "paid_full") {
      return rows.filter(r => !r.isHome && r.paid && r.exemptionClass !== "partial" && r.exemptionClass !== "full");
    }

    if (category === "paid_partial") {
      return rows.filter(r => !r.isHome && r.paid && r.exemptionClass === "partial");
    }

    if (category === "paid_exempt") {
      return rows.filter(r => !r.isHome && r.paid && r.exemptionClass === "full");
    }

    if (category === "reportOnly") return paidReportRows.filter(r => r.__paidReportOnly);

    if (category === "unpaid") {
      return rows.filter(r => !r.isHome && !r.paid);
    }

    if (category === "unpaid_full") {
      return rows.filter(r => !r.isHome && !r.paid && r.exemptionClass !== "partial" && r.exemptionClass !== "full");
    }

    if (category === "unpaid_partial") {
      return rows.filter(r => !r.isHome && !r.paid && r.exemptionClass === "partial");
    }

    if (category === "unpaid_exempt") {
      return rows.filter(r => !r.isHome && !r.paid && r.exemptionClass === "full");
    }

    if (category === "allExemptions") {
      return rows.filter(r => r.exemptionClass !== "none");
    }

    if (category === "fullExempt") {
      return rows.filter(r => r.exemptionClass === "full");
    }

    if (category === "partialExempt") {
      return rows.filter(r => r.exemptionClass === "partial");
    }

    if (category === "due") {
      return rows.filter(
        r =>
          !r.isHome &&
          !r.paid &&
          (
            r.exemptionClass === "none" ||
            r.exemptionClass === "partial"
          )
      );
    }

    if (category === "review") {
      return rows.filter(
        r =>
          !r.isHome &&
          !r.paid &&
          r.exemptionClass === "review"
      );
    }

    return rows;
  }

  let currentRenderedExpensesResult = null;

  function renderExpenses(result) {
    const has = !!(result && Array.isArray(result.rows));
    currentRenderedExpensesResult = has ? result : null;

    if (expensesEmpty) expensesEmpty.hidden = has;
    if (expensesContent) expensesContent.hidden = !has;
    if (btnExpensesExport) NeprasButtons.disable(btnExpensesExport, has ? null : "لا توجد بيانات للتصدير. حلّل المصروفات والإعفاءات أولًا.");
    const btnExpReport = document.getElementById("btn-expenses-export-report");
    if (btnExpReport) NeprasButtons.disable(btnExpReport, has ? null : "لا توجد بيانات للتصدير.");
    const btnPrintReport = document.getElementById("btn-expenses-print-report");
    if (btnPrintReport) NeprasButtons.disable(btnPrintReport, has ? null : "لا توجد بيانات للطباعة.");

    if (!has) return;

    const rows = result.rows;
    const set = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = String(Number(value || 0));
    };

    // Calculate core metrics
    const total = rows.length;
    const boys = rows.filter(isStudentBoy).length;
    const girls = rows.filter(isStudentGirl).length;
    const homes = rows.filter(r => r.isHome).length;
    const regular = rows.filter(r => !r.isHome).length;

    const paidFull = rows.filter(r => !r.isHome && r.paid && r.exemptionClass !== "partial" && r.exemptionClass !== "full").length;
    const paidPartial = rows.filter(r => !r.isHome && r.paid && r.exemptionClass === "partial").length;
    const paidExempt = rows.filter(r => !r.isHome && r.paid && r.exemptionClass === "full").length;
    const paidTotal = paidFull + paidPartial + paidExempt;

    const unpaidFull = rows.filter(r => !r.isHome && !r.paid && r.exemptionClass !== "partial" && r.exemptionClass !== "full").length;
    const unpaidPartial = rows.filter(r => !r.isHome && !r.paid && r.exemptionClass === "partial").length;
    const unpaidExempt = rows.filter(r => !r.isHome && !r.paid && r.exemptionClass === "full").length;
    const unpaidTotal = unpaidFull + unpaidPartial + unpaidExempt;

    // Header Title, Date & Pill
    const titleEl = document.getElementById("expenses-dashboard-title");
    const dateEl = document.getElementById("expenses-dashboard-date");
    const pillEl = document.getElementById("expenses-dashboard-pill");

    let academicYearStr = "2026 - 2027";
    try {
      const now = new Date(result.generatedAt || Date.now());
      const m = now.getMonth() + 1;
      const y = now.getFullYear();
      const startY = m >= 8 ? y : y - 1;
      academicYearStr = `${startY} - ${startY + 1}`;
    } catch (_) {}

    if (titleEl) titleEl.textContent = `المصروفات الدراسية للعام المالي ${academicYearStr}`;

    let whenFormatted = "";
    try {
      const d = new Date(result.generatedAt || Date.now());
      whenFormatted = d.toLocaleDateString("ar-EG", { year: "numeric", month: "2-digit", day: "2-digit" });
    } catch (_) { whenFormatted = ""; }
    if (dateEl) dateEl.textContent = `آخر تحديث: ${whenFormatted || "اليوم"}`;

    if (pillEl) {
      pillEl.textContent = `قيد: ${total} (بنين: ${boys} • بنات: ${girls}) • انتظام: ${regular} • منازل: ${homes} • مسددون: ${paidTotal} • غير مسدد: ${unpaidTotal}`;
    }

    // 12 KPI Cards
    set("expense-total", total);
    set("expense-boys", boys);
    set("expense-girls", girls);

    set("expense-homes", homes);
    set("expense-paid", paidTotal);
    set("expense-unpaid", unpaidTotal);

    set("expense-paid-full", paidFull);
    set("expense-paid-partial", paidPartial);
    set("expense-paid-exempt", paidExempt);

    set("expense-unpaid-full", unpaidFull);
    set("expense-unpaid-partial", unpaidPartial);
    set("expense-unpaid-exempt", unpaidExempt);

    // Compatibility items
    const paidReportDetailed = Array.isArray(result?.paidReportRows) ? result.paidReportRows : [];
    const reportOnly = paidReportDetailed.filter(r => r.__paidReportOnly).length;
    set("expense-report-only", reportOnly);
    set("expense-all-exemptions", rows.filter(r => r.exemptionClass !== "none").length);
    set("expense-full", rows.filter(r => r.exemptionClass === "full").length);
    set("expense-partial", rows.filter(r => r.exemptionClass === "partial").length);
    set("expense-due", rows.filter(r => !r.isHome && !r.paid && (r.exemptionClass === "none" || r.exemptionClass === "partial")).length);
    set("expense-review", rows.filter(r => !r.isHome && !r.paid && r.exemptionClass === "review").length);

    if (expensesMeta) {
      expensesMeta.textContent =
        `المسددون بالتقرير: ${paidReportDetailed.length || paidTotal}` +
        ` • المطابقون مع الطلاب الحاليين: ${paidTotal}` +
        ` • غير موجودين بالقائمة الحالية: ${reportOnly}` +
        ` • منازل: ${homes}` +
        ` • غير المنازل: ${regular}`;
    }

    // 1. Table: تحليل الصفوف الدراسية — المسدد وغير المسدد حسب الفئة
    renderExpensesGradesTable(rows, total, paidFull, paidPartial, paidExempt, paidTotal, unpaidFull, unpaidPartial, unpaidExempt, unpaidTotal, homes);

    // 2. Progress Bar
    const pctNum = total > 0 ? (paidTotal / total) * 100 : 0;
    const pctStr = pctNum.toFixed(1) + "%";
    const pctEl = document.getElementById("expenses-progress-pct");
    const fillEl = document.getElementById("expenses-progress-fill");
    const subEl = document.getElementById("expenses-progress-sub");
    if (pctEl) pctEl.textContent = pctStr;
    if (fillEl) fillEl.style.width = Math.min(100, Math.max(0, pctNum)) + "%";
    if (subEl) subEl.textContent = `${paidTotal} مسدد من ${total} قيد`;

    // 3. Table: الملخص المالي
    renderExpensesFinancialTable(total, boys, girls, paidFull, paidPartial, paidExempt, paidTotal, unpaidTotal, pctStr);
  }

  function getGradeSortRank(name) {
    const s = String(name || "").trim();
    if (s.includes("الاول") || s.includes("الأول") || s.includes("1")) return 1;
    if (s.includes("الثاني") || s.includes("2")) return 2;
    if (s.includes("الثالث") || s.includes("3")) return 3;
    if (s.includes("الرابع") || s.includes("4")) return 4;
    if (s.includes("الخامس") || s.includes("5")) return 5;
    if (s.includes("السادس") || s.includes("6")) return 6;
    return 99;
  }

  function renderExpensesGradesTable(rows, total, totPaidFull, totPaidPartial, totPaidExempt, totPaidTotal, totUnpaidFull, totUnpaidPartial, totUnpaidExempt, totUnpaidTotal, totHomes) {
    const tbody = document.getElementById("expenses-grades-tbody");
    const tfoot = document.getElementById("expenses-grades-tfoot");
    if (!tbody) return;

    // Extract unique grades
    const gradesSet = new Set();
    rows.forEach(r => {
      const g = String(r.grade || "").trim();
      if (g) gradesSet.add(g);
    });

    const gradesList = Array.from(gradesSet).sort((a, b) => {
      const rA = getGradeSortRank(a);
      const rB = getGradeSortRank(b);
      if (rA !== rB) return rA - rB;
      return a.localeCompare(b, "ar");
    });

    if (!gradesList.length) {
      tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;padding:12px;color:#64748b;">لا توجد صفوف دراسية مسجلة.</td></tr>';
      if (tfoot) tfoot.innerHTML = '';
      return;
    }

    const rowsHtml = gradesList.map(gradeName => {
      const gRows = rows.filter(r => String(r.grade || "").trim() === gradeName);
      const gCount = gRows.length;
      const gHomes = gRows.filter(r => r.isHome).length;

      const gPaidFull = gRows.filter(r => !r.isHome && r.paid && r.exemptionClass !== "partial" && r.exemptionClass !== "full").length;
      const gPaidPartial = gRows.filter(r => !r.isHome && r.paid && r.exemptionClass === "partial").length;
      const gPaidExempt = gRows.filter(r => !r.isHome && r.paid && r.exemptionClass === "full").length;
      const gPaidTotal = gPaidFull + gPaidPartial + gPaidExempt;

      const gUnpaidFull = gRows.filter(r => !r.isHome && !r.paid && r.exemptionClass !== "partial" && r.exemptionClass !== "full").length;
      const gUnpaidPartial = gRows.filter(r => !r.isHome && !r.paid && r.exemptionClass === "partial").length;
      const gUnpaidExempt = gRows.filter(r => !r.isHome && !r.paid && r.exemptionClass === "full").length;
      const gUnpaidTotal = gUnpaidFull + gUnpaidPartial + gUnpaidExempt;

      const gPct = gCount > 0 ? ((gPaidTotal / gCount) * 100).toFixed(1) + "%" : "0.0%";

      return `<tr>
        <td style="font-weight:700;">${escapeHtml(gradeName)}</td>
        <td><button type="button" class="btn-quiet expenses-stat" data-exp-cat="grade:${escapeHtml(gradeName)}:all" style="font-weight:700;color:#1e3a5f;">${gCount}</button></td>
        <td class="cell-green"><button type="button" class="btn-quiet expenses-stat" data-exp-cat="grade:${escapeHtml(gradeName)}:paid_full">${gPaidFull}</button></td>
        <td class="cell-green"><button type="button" class="btn-quiet expenses-stat" data-exp-cat="grade:${escapeHtml(gradeName)}:paid_partial">${gPaidPartial}</button></td>
        <td class="cell-green"><button type="button" class="btn-quiet expenses-stat" data-exp-cat="grade:${escapeHtml(gradeName)}:paid_exempt">${gPaidExempt}</button></td>
        <td class="cell-green" style="font-weight:800;background:#f0fdf4;"><button type="button" class="btn-quiet expenses-stat" data-exp-cat="grade:${escapeHtml(gradeName)}:paid">${gPaidTotal}</button></td>
        <td class="cell-red"><button type="button" class="btn-quiet expenses-stat" data-exp-cat="grade:${escapeHtml(gradeName)}:unpaid_full">${gUnpaidFull}</button></td>
        <td class="cell-red"><button type="button" class="btn-quiet expenses-stat" data-exp-cat="grade:${escapeHtml(gradeName)}:unpaid_partial">${gUnpaidPartial}</button></td>
        <td class="cell-red"><button type="button" class="btn-quiet expenses-stat" data-exp-cat="grade:${escapeHtml(gradeName)}:unpaid_exempt">${gUnpaidExempt}</button></td>
        <td class="cell-red" style="font-weight:800;background:#fef2f2;"><button type="button" class="btn-quiet expenses-stat" data-exp-cat="grade:${escapeHtml(gradeName)}:unpaid">${gUnpaidTotal}</button></td>
        <td><button type="button" class="btn-quiet expenses-stat" data-exp-cat="grade:${escapeHtml(gradeName)}:homes">${gHomes}</button></td>
        <td class="cell-rate">${gPct}</td>
      </tr>`;
    }).join("");

    tbody.innerHTML = rowsHtml;

    if (tfoot) {
      const overallRate = total > 0 ? ((totPaidTotal / total) * 100).toFixed(1) + "%" : "0.0%";
      tfoot.innerHTML = `<tr style="background:#f8fafc;font-weight:800;">
        <td style="font-weight:900;">الإجمالي</td>
        <td><button type="button" class="btn-quiet expenses-stat" data-exp-cat="all" style="font-weight:900;color:#1e3a5f;">${total}</button></td>
        <td class="cell-green"><button type="button" class="btn-quiet expenses-stat" data-exp-cat="paid_full">${totPaidFull}</button></td>
        <td class="cell-green"><button type="button" class="btn-quiet expenses-stat" data-exp-cat="paid_partial">${totPaidPartial}</button></td>
        <td class="cell-green"><button type="button" class="btn-quiet expenses-stat" data-exp-cat="paid_exempt">${totPaidExempt}</button></td>
        <td class="cell-green" style="font-weight:900;background:#dcfce7;"><button type="button" class="btn-quiet expenses-stat" data-exp-cat="paid">${totPaidTotal}</button></td>
        <td class="cell-red"><button type="button" class="btn-quiet expenses-stat" data-exp-cat="unpaid_full">${totUnpaidFull}</button></td>
        <td class="cell-red"><button type="button" class="btn-quiet expenses-stat" data-exp-cat="unpaid_partial">${totUnpaidPartial}</button></td>
        <td class="cell-red"><button type="button" class="btn-quiet expenses-stat" data-exp-cat="unpaid_exempt">${totUnpaidExempt}</button></td>
        <td class="cell-red" style="font-weight:900;background:#fee2e2;"><button type="button" class="btn-quiet expenses-stat" data-exp-cat="unpaid">${totUnpaidTotal}</button></td>
        <td><button type="button" class="btn-quiet expenses-stat" data-exp-cat="homes">${totHomes}</button></td>
        <td class="cell-rate" style="font-size:13px;font-weight:900;">${overallRate}</td>
      </tr>`;
    }
  }

  function renderExpensesFinancialTable(total, boys, girls, paidFull, paidPartial, paidExempt, paidTotal, unpaidTotal, pctStr) {
    const tbody = document.getElementById("expenses-financial-tbody");
    if (!tbody) return;

    const tFull = Number(document.getElementById("tariff-full")?.value) || 395;
    const tPartial = Number(document.getElementById("tariff-partial")?.value) || 259.91;
    const tExempt = Number(document.getElementById("tariff-exempt")?.value) || 39.22;

    const mFull = paidFull * tFull;
    const mPartial = paidPartial * tPartial;
    const mExempt = paidExempt * tExempt;
    const mTotal = mFull + mPartial + mExempt;

    function fmtMoney(num) {
      if (num == null || isNaN(num) || num === 0) return "0";
      return num.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    }

    tbody.innerHTML = `
      <tr>
        <td style="font-weight:800;background:#f8fafc;">العدد</td>
        <td style="font-weight:800;">${total}</td>
        <td>${boys}</td>
        <td>${girls}</td>
        <td class="cell-green">${paidFull}</td>
        <td class="cell-green">${paidPartial}</td>
        <td class="cell-green">${paidExempt}</td>
        <td class="cell-green" style="font-weight:900;background:#dcfce7;">${paidTotal}</td>
        <td class="cell-red" style="font-weight:800;">${unpaidTotal}</td>
        <td class="cell-rate">${pctStr}</td>
      </tr>
      <tr>
        <td style="font-weight:800;background:#f8fafc;">المبلغ (ج)</td>
        <td>—</td>
        <td>—</td>
        <td>—</td>
        <td class="cell-money">${fmtMoney(mFull)}</td>
        <td class="cell-money">${fmtMoney(mPartial)}</td>
        <td class="cell-money">${fmtMoney(mExempt)}</td>
        <td class="cell-money" style="font-weight:900;font-size:13px;background:#dcfce7;">${fmtMoney(mTotal)}</td>
        <td>—</td>
        <td>—</td>
      </tr>
    `;
  }


  async function loadSavedExpenses() {
    try {
      const data = await chrome.storage.local.get(["neprasExpensesAnalysisV1", "neprasExpensesLastError"]);
      renderExpenses(data?.neprasExpensesAnalysisV1 || null);
      if (data?.neprasExpensesLastError && expensesEmpty && !data?.neprasExpensesAnalysisV1) {
        expensesEmpty.textContent = `آخر محاولة: ${data.neprasExpensesLastError}`;
      }
    } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
  }

  function renderExpensesDetailRows(rows) {
    const q = String(expensesDetailSearch?.value || "").trim().toLowerCase();
    const visible = q
      ? rows.filter(r => [r.name, r.code, r.nationalId, r.grade, r.exemptionType, r.financeStatus].some(v => String(v || "").toLowerCase().includes(q)))
      : rows;

    if (expensesDetailBody) {
      expensesDetailBody.innerHTML = visible.length
        ? visible.map((r, i) => `<tr>
            <td>${i + 1}</td>
            <td>${escapeHtml(r.name || "")}</td>
            <td>${escapeHtml(r.code || "")}</td>
            <td>${escapeHtml(r.nationalId || "")}</td>
            <td>${escapeHtml(r.grade || "")}</td>
            <td>${escapeHtml(r.className || "")}</td>
            <td>${r.paid ? "نعم" : "لا"}</td>
            <td>${escapeHtml(r.exemptionType || "—")}</td>
            <td>${r.exemptionPercent == null ? "—" : `${Number(r.exemptionPercent)}%`}</td>
            <td>${escapeHtml(r.financeStatus || "")}</td>
          </tr>`).join("")
        : `<tr><td colspan="10" class="school-stats-detail-empty">لا توجد نتائج مطابقة.</td></tr>`;
    }

    if (expensesDetailCount) expensesDetailCount.textContent = `${visible.length} طالب`;
  }

  async function openExpensesDetails(category) {
    if (expensesDetailModal) {
      expensesDetailModal.hidden = false;
      window.neprasTrapFocus?.(expensesDetailModal, { onEscape: closeExpensesDetails, initialFocus: "#expenses-detail-search" });
    }
    if (expensesDetailSearch) expensesDetailSearch.value = "";

    expensesDetailCategory = category || "all";

    try {
      const data =
        await chrome.storage.local.get(
          "neprasExpensesAnalysisV1"
        );

      const result =
        data?.neprasExpensesAnalysisV1;

      if (!result) {
        throw new Error(
          "لا توجد بيانات تحليل محفوظة."
        );
      }

      let catTitle = "تفاصيل المصروفات";
      if (expensesDetailCategory.startsWith("grade:")) {
        const parts = expensesDetailCategory.split(":");
        const gName = parts[1] || "";
        const sub = parts[2] || "all";
        const subTitles = {
          all: "كل الطلاب",
          homes: "طلاب المنازل",
          paid: "إجمالي المسددين",
          paid_full: "المسددون — سداد كامل",
          paid_partial: "المسددون — أبناء عاملين (50%)",
          paid_exempt: "المسددون — إعفاءات حسب القرار",
          unpaid: "إجمالي غير المسددين",
          unpaid_full: "غير مسدد — سداد كامل",
          unpaid_partial: "غير مسدد — أبناء عاملين (50%)",
          unpaid_exempt: "غير مسدد — إعفاءات حسب القرار"
        };
        catTitle = `${gName} — ${subTitles[sub] || sub}`;
      } else {
        const titleMap = {
          all: "كل الطلاب المقيدين بالمدرسة",
          boys: "الطلاب — بنين",
          girls: "الطالبات — بنات",
          homes: "طلاب المنازل",
          paid: "إجمالي الطلاب المسددين",
          paid_full: "المسددون — سداد كامل",
          paid_partial: "المسددون — أبناء عاملين (سداد 50%)",
          paid_exempt: "المسددون — إعفاءات حسب القرار",
          unpaid: "إجمالي غير المسددين",
          unpaid_full: "غير مسدد — سداد كامل",
          unpaid_partial: "غير مسدد — أبناء عاملين (50%)",
          unpaid_exempt: "غير مسدد — إعفاءات حسب القرار",
          reportOnly: "مسددون بالتقرير وغير موجودين حاليًا",
          allExemptions: "كل الإعفاءات المسجلة",
          fullExempt: "المعفون وفق القرار",
          partialExempt: "أصحاب التخفيض 50%",
          due: "المطلوب منهم السداد",
          review: "حالات تحتاج مراجعة"
        };
        catTitle = titleMap[expensesDetailCategory] || "تفاصيل المصروفات";
      }

      expensesDetailRows =
        popupExpensesRowsByCategory(
          result,
          expensesDetailCategory
        );

      if (expensesDetailTitle) {
        expensesDetailTitle.textContent = catTitle;
      }

      renderExpensesDetailRows(
        expensesDetailRows
      );
    } catch (error) {
      expensesDetailRows = [];

      if (expensesDetailBody) {
        expensesDetailBody.innerHTML =
          `<tr><td colspan="10" class="school-stats-detail-empty">❌ ${escapeHtml(
            error?.message || error
          )}</td></tr>`;
      }

      if (expensesDetailCount) {
        expensesDetailCount.textContent = "0 طالب";
      }
    }
  }

  function neprasNationwideFromExpenseCache(result, nid) {
    const candidates = [
      ...(Array.isArray(result?.paidReportRows) ? result.paidReportRows : []),
      ...(Array.isArray(result?.rows) ? result.rows : [])
    ];

    const row = candidates.find(r =>
      String(r?.nationalId || "").replace(/\D/g, "") === nid
    );

    if (!row) return null;

    let name = String(row?.name || row?.studentName || "").trim();
    name = name
      .replace(/\s*[—-]\s*مسدد بالتقرير\s*[—-]\s*غير موجود حاليًا بالمدرسة\s*$/i, "")
      .trim();

    if (!name || name.includes("غير موجود حاليًا بالمدرسة")) return null;

    return {
      stdStudentId: row?.lookupStudentCode || row?.code || row?.studentCode || "",
      firstName: name,
      mudName: row?.currentDirectorate || "",
      edaraName: row?.currentAdministration || "",
      schoolName: row?.currentSchoolName || "",
      resultStatelName: row?.currentStatus || row?.status || "",
      classNumber: row?.currentClassNumber || row?.className || "",
      acdYear: row?.currentGrade || row?.grade || ""
    };
  }

  function neprasNationwidePick(obj, keys = []) {
    if (!obj || typeof obj !== "object") return "";
    const entries = Object.entries(obj);
    for (const key of keys) {
      const hit = entries.find(([k]) => String(k).toLowerCase() === String(key).toLowerCase());
      if (hit && hit[1] !== undefined && hit[1] !== null && String(hit[1]).trim() !== "") return hit[1];
    }
    return "";
  }

  function neprasNationwideNormalizePayload(payload, nid) {
    const wanted = String(nid || "").replace(/\D/g, "");
    const seen = new Set();
    const candidates = [];

    function visit(value, depth = 0) {
      if (depth > 5 || value == null) return;
      if (Array.isArray(value)) {
        for (const item of value) visit(item, depth + 1);
        return;
      }
      if (typeof value !== "object" || seen.has(value)) return;
      seen.add(value);
      candidates.push(value);
      for (const v of Object.values(value)) {
        if (v && (Array.isArray(v) || typeof v === "object")) visit(v, depth + 1);
      }
    }
    visit(payload);

    const idKeys = ["nationalId","nationalID","documentId","documentID","nid","studentNationalId","studentNationalID"];
    const nameKeys = ["firstName","studentName","fullName","studentFullName","name","arabicName"];
    let best = null;
    let bestScore = -1;

    for (const c of candidates) {
      const rawId = String(neprasNationwidePick(c, idKeys) || "").replace(/\D/g, "");
      const name = String(neprasNationwidePick(c, nameKeys) || "").trim();
      let score = 0;
      if (wanted && rawId === wanted) score += 8;
      if (name) score += 4;
      if (neprasNationwidePick(c,["studentCode","stdStudentId","studentId","code"])) score += 2;
      if (neprasNationwidePick(c,["schoolName","school","schoolNameAr"])) score += 1;
      if (score > bestScore) { best = c; bestScore = score; }
    }

    if (!best || bestScore < 4) return null;

    return {
      stdStudentId: neprasNationwidePick(best,["stdStudentId","studentCode","studentId","code","studentCodeNo"]),
      firstName: neprasNationwidePick(best,nameKeys),
      mudName: neprasNationwidePick(best,["mudName","directorateName","mudiriaName","directorate"]),
      edaraName: neprasNationwidePick(best,["edaraName","administrationName","edara","administration"]),
      schoolName: neprasNationwidePick(best,["schoolName","schoolNameAr","school"]),
      resultStatelName: neprasNationwidePick(best,["resultStatelName","resultStateName","status","studentStatus","enrollStatus"]),
      classNumber: neprasNationwidePick(best,["classNumber","classNo","classRoom","className"]),
      acdYear: neprasNationwidePick(best,["acdYear","acdyear","grade","gradeName","classYearName"])
    };
  }

  async function neprasNationwideDirectLookup(nid) {
    try {
      return await chrome.runtime.sendMessage({
        action:"NEPRAS_LOOKUP_STUDENT_NATIONWIDE",
        nationalId:nid
      });
    } catch (error) {
      return {ok:false,message:error?.message || String(error)};
    }
  }

  async function neprasNationwideLookupViaStudentTab(nid) {
    try {
      const tabs = await chrome.tabs.query({});
      const tab = tabs.find(t => t?.id != null && /^https:\/\/student\.emis\.gov\.eg\//i.test(String(t.url || "")) && !/\/login(?:[/?#]|$)/i.test(String(t.url || "")));
      if (!tab?.id) return {ok:false,message:"STUDENT_TAB_NOT_READY"};
      const result = await chrome.tabs.sendMessage(tab.id,{action:"LOOKUP_STUDENT_ANY_SCHOOL",nationalId:nid});
      if (result?.status === "success") return {ok:true,data:result.data,via:"student-tab"};
      return {ok:false,message:result?.message || "STUDENT_TAB_LOOKUP_FAILED"};
    } catch (error) {
      return {ok:false,message:error?.message || String(error)};
    }
  }

  async function neprasPrimeNationwideSession() {
    const tabs = await chrome.tabs.query({});
    let tab = tabs.find(t =>
      t?.id != null &&
      /^https:\/\/student\.emis\.gov\.eg(?:\/|$)/i.test(String(t.url || "")) &&
      !/\/login(?:[\/?#]|$)/i.test(String(t.url || ""))
    );

    const isMobile = typeof window !== "undefined" && (window.NeprasBackend || window.parent?.NeprasBackend);

    if (!tab?.id && !isMobile) {
      tab = await chrome.tabs.create({
        url: "https://student.emis.gov.eg/student/list",
        active: false
      });

      const started = Date.now();
      while (Date.now() - started < 16000) {
        try {
          tab = await chrome.tabs.get(tab.id);
          if (tab?.status === "complete") break;
        } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
        await new Promise(r => setTimeout(r, 300));
      }
    } else if (isMobile && !tab?.id) {
      tab = tabs[0];
    }

    if (/\/login(?:[\/?#]|$)/i.test(String(tab?.url || ""))) {
      throw new Error("سجّل الدخول إلى بوابة بيانات التلميذ أولًا، ثم أعد المحاولة.");
    }

    if (tab?.id) {
      try {
        await chrome.tabs.sendMessage(tab.id, { action: "PRIME_STUDENT_API_SESSION" });
      } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
    }

    await new Promise(r => setTimeout(r, 800));
  }

  function neprasRenderNationwideStudent(d) {
    nationwideStudentResult.hidden = false;
    nationwideStudentResult.innerHTML =
      `<div class="nationwide-result-title">✅ تم العثور على الطالب</div>` +
      `<div class="nationwide-result-grid">` +
      `<div><span>اسم الطالب</span><b>${escapeHtml(d.firstName || "—")}</b></div>` +
      `<div><span>كود الطالب</span><b>${escapeHtml(d.stdStudentId || "—")}</b></div>` +
      `<div><span>المديرية</span><b>${escapeHtml(d.mudName || "—")}</b></div>` +
      `<div><span>الإدارة</span><b>${escapeHtml(d.edaraName || "—")}</b></div>` +
      `<div><span>المدرسة</span><b>${escapeHtml(d.schoolName || "—")}</b></div>` +
      `<div><span>الصف</span><b>${escapeHtml(d.acdYear || "—")}</b></div>` +
      `<div><span>رقم الفصل</span><b>${escapeHtml(d.classNumber || "—")}</b></div>` +
      `<div><span>حالة القيد</span><b>${escapeHtml(d.resultStatelName || "—")}</b></div>` +
      `</div>`;
  }

  async function lookupStudentNationwide() {
    const nid = String(nationwideStudentNationalId?.value || "").replace(/\D/g, "");
    if (!/^\d{14}$/.test(nid)) {
      window.neprasDialog?.alert("اكتب الرقم القومي كاملًا (14 رقمًا).", {
        type:"warning", title:"الرقم القومي غير مكتمل"
      });
      return;
    }

    if (btnNationwideStudentSearch) {
      NeprasButtons.busy(btnNationwideStudentSearch, true, "جارٍ البحث…");
    }

    try {
      // 1) لو البيانات موجودة بالفعل من تحليل المصروفات، نعرضها فورًا.
      try {
        const stored = await chrome.storage.local.get("neprasExpensesAnalysisV1");
        const cached = neprasNationwideFromExpenseCache(stored?.neprasExpensesAnalysisV1, nid);
        if (cached?.firstName) {
          neprasRenderNationwideStudent(cached);
          return;
        }
      } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }

      // 2) بحث مباشر باستخدام أحدث جلسة API ملتقطة.
      let response = await neprasNationwideDirectLookup(nid);
      let d = neprasNationwideNormalizePayload(response?.data, nid);

      // 3) لو الرد لم يحتوِ بيانات طالب كاملة، نجهز جلسة حقيقية من تبويب الطلاب
      // ثم نعيد البحث من داخل التبويب نفسه. هذا يمنع اعتبار اختلاف شكل رد الـ API
      // على أنه "طالب غير موجود".
      if (!response?.ok || !d?.firstName) {
        await neprasPrimeNationwideSession();

        const pageResponse = await neprasNationwideLookupViaStudentTab(nid);
        const pageData = neprasNationwideNormalizePayload(pageResponse?.data, nid);
        if (pageResponse?.ok && pageData?.firstName) {
          response = pageResponse;
          d = pageData;
        } else {
          const retry = await neprasNationwideDirectLookup(nid);
          const retryData = neprasNationwideNormalizePayload(retry?.data, nid);
          if (retry?.ok && retryData?.firstName) {
            response = retry;
            d = retryData;
          } else if (!response?.ok) {
            response = retry?.ok ? pageResponse : retry;
          }
        }
      }

      if (!response?.ok) {
        const raw = String(response?.message || "");
        if (/AUTH_HEADERS_NOT_CAPTURED|401|403/i.test(raw)) {
          throw new Error("تعذر تجهيز جلسة بوابة بيانات التلميذ. تأكد من تسجيل الدخول إلى بوابة الطالب ثم أعد المحاولة.");
        }
        throw new Error("تعذر تنفيذ البحث الآن. حدّث صفحة بيانات الطلاب ثم أعد المحاولة.");
      }

      if (!d?.firstName) {
        throw new Error("لم يعثر موقع الوزارة على بيانات طالب مطابقة لهذا الرقم القومي.");
      }

      neprasRenderNationwideStudent(d);
    } catch (error) {
      if (nationwideStudentResult) nationwideStudentResult.hidden = true;
      window.neprasDialog?.alert(error?.message || String(error), {
        type:"error", title:"تعذر البحث عن الطالب"
      });
    } finally {
      if (btnNationwideStudentSearch) {
        NeprasButtons.busy(btnNationwideStudentSearch, false);
      }
    }
  }

  // ==========================================================
  // 📊 بحث جماعي عن الطلاب بالرقم القومي (استيراد ملف Excel/CSV)
  // يعيد استخدام نفس محرك البحث الفردي "بحث عن طالب في أي مدرسة"
  // (neprasNationwideDirectLookup / neprasPrimeNationwideSession /
  // neprasNationwideNormalizePayload) على كل رقم قومي بالملف، ثم يبني
  // كشف Excel تفصيلي بالنتائج.
  // ==========================================================
  const bulkNidFileInput = document.getElementById("bulk-nid-file-input");
  const bulkNidFileName = document.getElementById("bulk-nid-file-name");
  const bulkNidSummary = document.getElementById("bulk-nid-summary");
  const btnBulkNidStart = document.getElementById("btn-bulk-nid-start");
  const btnBulkNidStop = document.getElementById("btn-bulk-nid-stop");
  const btnBulkNidDownload = document.getElementById("btn-bulk-nid-download");
  const bulkNidProgressWrap = document.getElementById("bulk-nid-progress-wrap");
  const bulkNidProgressBar = document.getElementById("bulk-nid-progress-bar");
  const bulkNidProgressText = document.getElementById("bulk-nid-progress-text");
  const bulkNidResultBox = document.getElementById("bulk-nid-result-box");

  let bulkNidRows = [];
  let bulkNidParsed = null;
  let bulkNidLastRun = null; // { parsed, results, report }: آخر تشغيل، منه يُبنى ملف التقرير حتى لو اختير ملف آخر بعده
  let bulkNidStopRequested = false;
  let bulkNidRunning = false;
  let bulkNidSourceFileBaseName = "نتائج_البحث";
  let bulkNidSourceFileName = "";

  async function bulkNidParseFile(file) {
    if (typeof XLSX === "undefined") {
      throw new Error("محرك قراءة ملفات Excel غير متاح حاليًا.");
    }

    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheetName = wb.SheetNames?.[0];
    const sheet = sheetName ? wb.Sheets[sheetName] : null;
    if (!sheet) throw new Error("لم يتم العثور على بيانات داخل الملف.");

    // raw:true: الخلية الرقمية تصل عددًا كاملًا لا نصًا معروضًا «3.0101E+13» (التحويل في modules/bulk_nid.js).
    const raw = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: true });
    return globalThis.NeprasBulkNid.parseRows(raw);
  }

  function bulkNidSetProgress(done, total, extraText) {
    if (!bulkNidProgressWrap) return;
    bulkNidProgressWrap.hidden = false;
    const pct = total ? Math.round((done / total) * 100) : 0;
    if (bulkNidProgressBar) bulkNidProgressBar.style.width = `${pct}%`;
    if (bulkNidProgressText) {
      bulkNidProgressText.textContent = `${done} / ${total}` + (extraText ? ` — ${extraText}` : "");
    }
  }

  function bulkNidResetUiForNewFile() {
    bulkNidLastRun = null;
    bulkNidStopRequested = false;
    if (btnBulkNidDownload) btnBulkNidDownload.hidden = true;
    if (bulkNidResultBox) { bulkNidResultBox.hidden = true; bulkNidResultBox.innerHTML = ""; }
    if (bulkNidProgressWrap) bulkNidProgressWrap.hidden = true;
  }

  bulkNidFileInput?.addEventListener("change", async () => {
    const file = bulkNidFileInput.files?.[0];
    if (!file) return;

    bulkNidSourceFileBaseName = file.name.replace(/\.[^.]+$/, "") || "نتائج_البحث";
    bulkNidSourceFileName = file.name;
    if (bulkNidFileName) bulkNidFileName.textContent = file.name;
    bulkNidResetUiForNewFile();

    try {
      const parsed = await bulkNidParseFile(file);
      bulkNidRows = parsed.rows;
      bulkNidParsed = parsed;
      const validCount = parsed.stats.valid;

      if (bulkNidSummary) {
        bulkNidSummary.hidden = false;
        bulkNidSummary.textContent = globalThis.NeprasBulkNid.describeFile(parsed);
      }

      if (btnBulkNidStart) NeprasButtons.disable(btnBulkNidStart, validCount === 0 ? "الملف لا يحتوي أرقامًا قومية صحيحة (14 رقمًا). اختر ملفًا آخر." : null);
    } catch (error) {
      bulkNidRows = [];
      bulkNidParsed = null;
      if (btnBulkNidStart) NeprasButtons.disable(btnBulkNidStart, "تعذرت قراءة الملف. اختر ملفًا آخر.");
      if (bulkNidSummary) { bulkNidSummary.hidden = true; bulkNidSummary.textContent = ""; }
      window.neprasDialog?.alert(error?.message || String(error), {
        type: "error", title: "تعذر قراءة الملف"
      });
    }
  });

  async function bulkNidEnsureSessionPrimed(firstNid) {
    try {
      const probe = await neprasNationwideDirectLookup(firstNid);
      if (probe?.ok) return;
      const msg = String(probe?.message || "");
      if (/AUTH_HEADERS_NOT_CAPTURED/i.test(msg)) {
        await neprasPrimeNationwideSession();
      }
    } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
  }

  async function bulkNidLookupOne(nid) {
    let response = await neprasNationwideDirectLookup(nid);
    let d = neprasNationwideNormalizePayload(response?.data, nid);

    if (!response?.ok || !d?.firstName) {
      const msg = String(response?.message || "");
      if (/AUTH_HEADERS_NOT_CAPTURED/i.test(msg)) {
        await neprasPrimeNationwideSession();
        response = await neprasNationwideDirectLookup(nid);
        d = neprasNationwideNormalizePayload(response?.data, nid);
      }
    }

    if (!response?.ok) {
      const raw = String(response?.message || "");
      const sessionLost = /AUTH_HEADERS_NOT_CAPTURED|401|403/i.test(raw);
      return {
        status: "error",
        reasonCode: sessionLost ? "SESSION_FAILED" : "LOOKUP_FAILED",
        message: sessionLost ? "تعذر الاتصال بجلسة بوابة بيانات الطالب" : "تعذر تنفيذ البحث لهذا الرقم"
      };
    }

    if (!d?.firstName) return { status: "not_found" };
    return { status: "found", data: d };
  }

  async function runBulkNidSearch() {
    if (bulkNidRunning) return;
    const targets = bulkNidRows.filter(r => r.valid14);
    if (!targets.length || !bulkNidParsed) return;

    const parsed = bulkNidParsed;
    const fileName = bulkNidSourceFileName;
    bulkNidRunning = true;
    bulkNidStopRequested = false;
    bulkNidLastRun = null;

    if (btnBulkNidStart) NeprasButtons.busy(btnBulkNidStart, true, "جارٍ البحث…");
    if (btnBulkNidStop) btnBulkNidStop.hidden = false;
    if (btnBulkNidDownload) btnBulkNidDownload.hidden = true;
    if (bulkNidResultBox) bulkNidResultBox.hidden = true;

    const startedAt = new Date();
    bulkNidSetProgress(0, targets.length, "جارٍ تجهيز الاتصال...");

    let run = { results: [], stopped: false, fatalError: "" };
    try {
      await bulkNidEnsureSessionPrimed(targets[0].nationalId);
      // حلقة البحث في modules/bulk_nid.js (تتوقف وحدها إن انقطعت الجلسة)؛ هنا الشبكة والتقدّم فقط.
      run = await globalThis.NeprasBulkNid.runSearch({
        targets,
        lookup: bulkNidLookupOne,
        sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
        isStopped: () => bulkNidStopRequested,
        onProgress: (done, total, t) => bulkNidSetProgress(done, total, `✅ ${t.found} — ❌ ${t.notFound} — ⚠️ ${t.error}`)
      });
    } catch (error) {
      run.fatalError = error?.message || String(error);
    }

    const report = globalThis.NeprasBulkNid.buildReport({
      fileName, parsed, results: run.results, stopped: run.stopped, fatalError: run.fatalError, startedAt, finishedAt: new Date()
    });
    bulkNidLastRun = { parsed, results: run.results, report };

    bulkNidRunning = false;
    if (btnBulkNidStart) NeprasButtons.busy(btnBulkNidStart, false);
    if (btnBulkNidStop) btnBulkNidStop.hidden = true;

    if (bulkNidResultBox) {
      bulkNidResultBox.hidden = false;
      bulkNidResultBox.textContent = "";
      const title = document.createElement("div");
      title.className = "nationwide-result-title";
      title.textContent = `${{ done: "✅", warn: "⚠️", stopped: "⏹", failed: "❌" }[report.status]} ${report.statusLabel}`;
      const note = document.createElement("div");
      note.className = "mini-note";
      note.style.textAlign = "center";
      note.textContent = `${report.headline.replace(/^[^—]+— /, "")} — التفاصيل في ملف النتائج.`;
      bulkNidResultBox.append(title, note);
    }

    if (btnBulkNidDownload) btnBulkNidDownload.hidden = false;
  }

  async function bulkNidDownloadResults() {
    if (!bulkNidLastRun) return;

    try {
      if (typeof XLSX === "undefined") {
        throw new Error("محرك إنشاء ملفات Excel غير متاح حاليًا.");
      }

      const { parsed, results, report } = bulkNidLastRun;
      const RR = globalThis.NeprasRunReport;
      const resultsSheet = globalThis.NeprasBulkNid.buildResultsSheet(parsed, results, report.stopped, report.fatalError);
      const wb = RR.buildWorkbook(XLSX, RR.sheets(report, { recordsSheet: resultsSheet }));

      const rawFileName = `${bulkNidSourceFileBaseName}_نتائج_الرقم_القومي.xlsx`;
      await neprasUnifiedDownloadXlsx(wb, rawFileName, "البحث بالرقم القومي", "تم حفظ كشف نتائج البحث الجماعي بنجاح.");
    } catch (error) {
      window.neprasDialog?.alert(error?.message || String(error), {
        type: "error", title: "تعذر إنشاء ملف النتائج"
      });
    }
  }

  btnBulkNidStart?.addEventListener("click", () => { awaitSafe(runBulkNidSearch()); });
  btnBulkNidStop?.addEventListener("click", () => { bulkNidStopRequested = true; });
  btnBulkNidDownload?.addEventListener("click", bulkNidDownloadResults);

  async function loadSavedSchoolStats() {
    try {
      let activeCode = "";
      if (globalThis.NeprasSchoolManager?.getActiveCode) {
        activeCode = await globalThis.NeprasSchoolManager.getActiveCode();
      }

      let statsToRender = null;
      let studentsToCache = [];

      if (activeCode && globalThis.NeprasSchoolManager?.loadSchoolStats) {
        const loaded = await globalThis.NeprasSchoolManager.loadSchoolStats(activeCode);
        if (loaded && (loaded.stats || (Array.isArray(loaded.students) && loaded.students.length))) {
          statsToRender = loaded.stats || null;
          studentsToCache = (Array.isArray(loaded.students) && loaded.students.length) ? loaded.students : (loaded.stats?.detailRows || []);
        }
      } else {
        const data = await chrome.storage.local.get(["neprasSchoolStatsV1", "neprasSchoolStatsLastError", "neprasCachedStudentsList"]);
        const stats = data?.neprasSchoolStatsV1;
        const statsSchool = stats ? String(stats.schoolCode || stats.schoolKey || stats.code || "").replace(/\D/g, "") : "";
        const isMatch = !activeCode || !statsSchool || statsSchool === activeCode ||
        (globalThis.NeprasSchoolManager?.isSameSchool ? globalThis.NeprasSchoolManager.isSameSchool(statsSchool, activeCode) : false) ||
        (statsSchool === "21024219" && activeCode === "972133") ||
        (statsSchool === "972133" && activeCode === "21024219");

      if (isMatch) {
          statsToRender = stats || null;
          studentsToCache = (Array.isArray(data?.neprasCachedStudentsList) && data.neprasCachedStudentsList.length) ? data.neprasCachedStudentsList : (stats?.detailRows || []);
        }
      }

      window.neprasCachedStudentsList = studentsToCache;
      renderSchoolStats(statsToRender);

      if (typeof window.updateSmartAnalyticsStatus === "function") {
        window.updateSmartAnalyticsStatus();
      }
    } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
  }

  awaitSafe(loadSavedSchoolStats());
  awaitSafe(loadSavedExpenses());

  // v1.0 — الإحصاء والمصروفات Snapshot محفوظ داخل نبراس مع التحقق من كود المدرسة المعروضة
  chrome.storage.local.get("neprasDeepScrapeProgress").then((res) => {
    const p = res?.neprasDeepScrapeProgress;
    if (p && p.running && (Date.now() - Number(p.updatedAt || 0) < 10 * 60 * 1000)) {
      renderDeepProgressUI(p);
    }
  }).catch(() => {});

  chrome.storage.onChanged.addListener(async (changes, areaName) => {
    if (areaName !== "local") return;

    if (changes.neprasDeepScrapeProgress) {
      renderDeepProgressUI(changes.neprasDeepScrapeProgress.newValue);
    }

    if (changes.neprasSchoolStatsV1) {
      const activeCode = globalThis.NeprasSchoolManager ? globalThis.NeprasSchoolManager.cleanCode(await globalThis.NeprasSchoolManager.getActiveCode()) : "";
      const newStats = changes.neprasSchoolStatsV1.newValue;
      const statsSchool = newStats ? String(newStats.schoolCode || newStats.schoolKey || newStats.code || "").replace(/\D/g, "") : "";

      const isMatch = !activeCode || !statsSchool || statsSchool === activeCode ||
        (globalThis.NeprasSchoolManager?.isSameSchool ? globalThis.NeprasSchoolManager.isSameSchool(statsSchool, activeCode) : false) ||
        (statsSchool === "21024219" && activeCode === "972133") ||
        (statsSchool === "972133" && activeCode === "21024219");

      if (isMatch) {
        renderSchoolStats(newStats || null);
        if (newStats?.detailRows?.length || newStats?.rows?.length) {
          const oldList = window.neprasCachedStudentsList || [];
          const newList = newStats.detailRows || newStats.rows;
          window.neprasCachedStudentsList = newList;

          // رصد الفروقات الذكية Smart Delta
          if (globalThis.NeprasLocalDB?.computeDelta && oldList.length > 0 && newList.length > 0) {
            const delta = globalThis.NeprasLocalDB.computeDelta(oldList, newList);
            if (delta.hasChanges) {
              showNeprasPopupNotice(delta.summaryText, "info", "رصد الفروقات الذكية (Smart Delta)");
            }
          }
        }
        if (typeof window.updateSmartAnalyticsStatus === "function") {
          window.updateSmartAnalyticsStatus();
        }
        if (typeof window.updateStatsCenterStatus === "function") {
          window.updateStatsCenterStatus();
        }
      }
    }

    if (changes.neprasCachedStudentsList) {
      if (Array.isArray(changes.neprasCachedStudentsList.newValue)) {
        const oldList = Array.isArray(changes.neprasCachedStudentsList.oldValue) ? changes.neprasCachedStudentsList.oldValue : (window.neprasCachedStudentsList || []);
        const newList = changes.neprasCachedStudentsList.newValue;
        window.neprasCachedStudentsList = newList;
        if (newList.length > 0) {
          const synth = popupSynthesizeSchoolStatsFromRows(newList, window.currentRenderedSchoolStats || {});
          if (synth) renderSchoolStats(synth);
        }

        // رصد الفروقات الذكية Smart Delta
        if (globalThis.NeprasLocalDB?.computeDelta && oldList.length > 0 && newList.length > 0) {
          const delta = globalThis.NeprasLocalDB.computeDelta(oldList, newList);
          if (delta.hasChanges) {
            showNeprasPopupNotice(delta.summaryText, "info", "رصد الفروقات الذكية (Smart Delta)");
          }
        }
      }
      if (typeof window.updateSmartAnalyticsStatus === "function") {
        window.updateSmartAnalyticsStatus();
      }
      if (typeof window.updateStatsCenterStatus === "function") {
        window.updateStatsCenterStatus();
      }
    }

    if (changes.neprasExpensesAnalysisV1) {
      renderExpenses(changes.neprasExpensesAnalysisV1.newValue || null);
    }
  });

  // ==========================================================
  // التنقل الذكي: لا ننشئ تبويبًا جديدًا إذا كان تبويب الموقع موجودًا.
  // Service Worker هو المسؤول عن إعادة استخدام التبويب حتى لا تضيع المهمة
  // عند إغلاق نافذة Popup بعد الانتقال.
  // ==========================================================
  async function neprasPrepareBeforePopupCommand(
    reason = "popup_command"
  ) {
    try {
      await chrome.runtime.sendMessage({
        action:
          "NEPRAS_PREPARE_COMMAND_STATE",
        reason
      });
    } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
  }

  async function navigateAndRun({
    targetUrl,
    siteHost,
    messages = [],
    returnLastResponse = false
  }) {
    // v1.0:
    // مهم أن يكون التنظيف BEFORE إرسال المهمة الجديدة،
    // حتى لا نمسح pending task تم إنشاؤها للتو.
    await neprasPrepareBeforePopupCommand(
      `popup:${siteHost || "unknown"}`
    );

    try {
      let controlWindowId = null;
      const keepWindow = neprasIsLargeWindow || neprasKeepPopupOpen;
      if (keepWindow) {
        try {
          const currentWindow = await chrome.windows.getCurrent();
          controlWindowId = currentWindow?.id ?? null;
        } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
      }

      const activeSchool = (await globalThis.NeprasSchoolManager?.getActiveCode?.()) || null;
      await chrome.runtime.sendMessage({
        action: "NEPRAS_NAVIGATE_WORK",
        targetUrl,
        siteHost,
        messages,
        keepControlWindow: keepWindow,
        controlWindowId,
        schoolCode: activeSchool
      });
    } catch (error) {
      console.error("Nepras smart navigation error:", error);
    }
    if (shouldAutoClosePopup()) {
      try { window.close(); } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
    } else {
      try { window.focus(); } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
    }
  }

  function applyStudentScrapeMode(mode) {
    studentScrapeMode = mode === "deep" ? "deep" : "normal";
    const isDeep = studentScrapeMode === "deep";

    btnStudentModeNormal?.classList.toggle("is-active", !isDeep);
    btnStudentModeDeep?.classList.toggle("is-active", isDeep);
    btnStudentModeNormal?.setAttribute("aria-pressed", String(!isDeep));
    btnStudentModeDeep?.setAttribute("aria-pressed", String(isDeep));

    const T = NeprasTerms.modes[isDeep ? "deep" : "fast"];
    if (btnExportSingle) NeprasButtons.setLabel(btnExportSingle, T.single);
    if (btnExportAll) NeprasButtons.setLabel(btnExportAll, T.all);
    if (studentScrapeModeHint) studentScrapeModeHint.textContent = T.hint;
  }

  btnStudentModeNormal?.addEventListener("click", () => applyStudentScrapeMode("normal"));
  btnStudentModeDeep?.addEventListener("click", () => applyStudentScrapeMode("deep"));
  applyStudentScrapeMode("normal");

  async function triggerExportCommand(commandData) {
    // v1.0: نفس اختيار الصفوف يعمل للسحب العادي أو العميق من واجهة نبراس.
    // grade = كود الصف، و gradeText = اسم الصف المستخدم في المسارات الاحتياطية.
    const stage = commandData?.stage || stageSelect?.value || "";
    const mode = commandData?.mode === "deep" || studentScrapeMode === "deep" ? "deep" : "normal";
    const task = { ...commandData, stage };
    delete task.mode;

    await navigateAndRun({
      targetUrl: "https://student.emis.gov.eg/student/list",
      siteHost: "student.emis.gov.eg",
      messages: [
        { action: "SET_STUDENT_STAGE", stage },
        { action: "REFRESH_STUDENT_TOOLBARS" },
        mode === "deep"
          ? { action: "START_DEEP_EXTRACTION", task }
          : { action: "EXECUTE_PENDING_TASK", task }
      ]
    });
  }

  async function triggerClassReportCommand() {
    const stage = stageSelect?.value || "";
    const option = classReportGradeSelect?.selectedOptions?.[0];
    const grade = classReportGradeSelect?.value || "";
    const gradeText = option?.dataset?.text || option?.textContent?.replace(/^قوائم فصول\s*/, "").trim() || grade;

    if (!stage) {
      NeprasUI.field.error(stageSelect, NeprasUI.msg("stage_required").title);
      return;
    }
    if (!grade) {
      NeprasUI.field.error(classReportGradeSelect, NeprasUI.msg("grade_required").title);
      return;
    }

    const task = {
      type: "CLASS_REPORT_GRADE",
      grade,
      gradeText,
      stage,
      reportUrl: "https://student.emis.gov.eg/class/report"
    };

    await navigateAndRun({
      targetUrl: task.reportUrl,
      siteHost: "student.emis.gov.eg",
      messages: [
        { action: "SET_STUDENT_STAGE", stage },
        { action: "EXECUTE_CLASS_REPORT_TASK", task }
      ]
    });
  }

  async function triggerTeacherCommand(actionType, extra = {}) {
    await navigateAndRun({
      targetUrl: "https://teacher.emis.gov.eg/dashboard/employee",
      siteHost: "teacher.emis.gov.eg",
      messages: [
        { action: "EXECUTE_TEACHER_TASK", taskType: actionType, ...extra }
      ]
    });
  }

  // تذكّر اختيار المستخدم (ملف مجمّع/ملفات فردية) لصحف الأحوال بين مرات فتح البوب-أب.
  const STATUS_SHEETS_MODE_KEY = "neprasStatusSheetsModeV1";
  const statusSheetsModeRadios = Array.from(document.querySelectorAll('input[name="status-sheets-mode"]'));
  if (statusSheetsModeRadios.length) {
    chrome.storage.local.get(STATUS_SHEETS_MODE_KEY).then((data) => {
      const saved = data?.[STATUS_SHEETS_MODE_KEY];
      if (saved === "individual" || saved === "merged") {
        const target = statusSheetsModeRadios.find((r) => r.value === saved);
        if (target) target.checked = true;
      }
    }).catch(() => {});
    statusSheetsModeRadios.forEach((radio) => {
      radio.addEventListener("change", () => {
        if (!radio.checked) return;
        chrome.storage.local.set({ [STATUS_SHEETS_MODE_KEY]: radio.value }).catch(() => {});
      });
    });
  }
  // v1.2.76 — يحلّل مُدخل «صحيفة أحوال فردية»: 14 رقمًا = رقم قومي، 1-10 أرقام = كود معلم.
  // نسخة مطابقة لـ neprasParseStatusSheetLookup في content.js (سياقان منفصلان لا يتشاركان الكود).
  function parseSingleSheetLookup(raw) {
    const cleaned = String(raw ?? "")
      .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
      .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
      .replace(/[\s\-_.,\u200e\u200f\u066c]+/g, "");
    if (!cleaned) return { ok: false, message: "اكتب كود المعلم أو الرقم القومي أولًا." };
    if (!/^\d+$/.test(cleaned)) return { ok: false, message: "المسموح أرقام فقط (كود المعلم أو الرقم القومي)." };
    if (cleaned.length === 14) {
      return /^[23]/.test(cleaned)
        ? { ok: true, value: cleaned }
        : { ok: false, message: "الرقم القومي غير صحيح: يجب أن يبدأ بالرقم 2 أو 3." };
    }
    if (cleaned.length >= 11) {
      return { ok: false, message: `الرقم القومي يتكوّن من 14 رقمًا (المكتوب ${cleaned.length}). وكود المعلم لا يزيد على 10 أرقام.` };
    }
    return { ok: true, value: cleaned };
  }
  function getStatusSheetsMode() {
    return statusSheetsModeRadios.find((r) => r.checked)?.value === "individual" ? "individual" : "merged";
  }

  if (btnExportSingle && gradeSelect) {
    btnExportSingle.addEventListener("click", () => {
      const selectedStage = stageSelect?.value || "";
      const selectedGrade = gradeSelect.value;
      if (!selectedStage) {
        NeprasUI.field.error(stageSelect, NeprasUI.msg("stage_required").title);
        return;
      }
      if (!selectedGrade) {
        NeprasUI.field.error((gradePickerButton || gradeSelect), NeprasUI.msg("grade_required").title);
        return;
      }
      const gradeText = gradePickerButton?.dataset.text || gradePickerButton?.textContent?.trim() || selectedGrade;
      const run = () => triggerExportCommand({ type: "SINGLE_GRADE", grade: selectedGrade, gradeText, stage: selectedStage, mode: studentScrapeMode });
      window.withButtonBusy ? window.withButtonBusy(btnExportSingle, run) : run();
    });
  }

  btnExportAll?.addEventListener("click", () => {
    const selectedStage = stageSelect?.value || "";
    if (!selectedStage) {
      NeprasUI.field.error(stageSelect, NeprasUI.msg("stage_required").title);
      return;
    }
    const run = () => triggerExportCommand({ type: "ALL_GRADES", stage: selectedStage, mode: studentScrapeMode });
    window.withButtonBusy ? window.withButtonBusy(btnExportAll, run) : run();
  });

  let expensesRefreshClickLocked = false;

  btnNationwideStudentSearch?.addEventListener("click", lookupStudentNationwide);
  nationwideStudentNationalId?.addEventListener("keydown", e => { if(e.key === "Enter") lookupStudentNationwide(); });

  btnExpensesRefresh?.addEventListener("click", async () => {
    if (expensesRefreshClickLocked) return;

    const stage = stageSelect?.value || "";
    if (!stage) {
      NeprasUI.field.error(stageSelect, NeprasUI.msg("stage_required").title);
      return;
    }

    expensesRefreshClickLocked = true;
    NeprasButtons.busy(btnExpensesRefresh, true, "جارٍ التحليل…");
    try {
      await chrome.storage.local.remove("neprasExpensesLastError");
      await navigateAndRun({
        targetUrl: "https://student.emis.gov.eg/student/list",
        siteHost: "student.emis.gov.eg",
        messages: [
          { action: "SET_STUDENT_STAGE", stage },
          { action: "START_EXPENSES_ANALYSIS", stage }
        ]
      });
    } finally {
      setTimeout(() => {
        expensesRefreshClickLocked = false;
        NeprasButtons.busy(btnExpensesRefresh, false);
      }, 2500);
    }
  });

  btnExpensesExport?.addEventListener("click", () => {
    const run = async () => {
      await navigateAndRun({
        targetUrl: "https://student.emis.gov.eg/student/list",
        siteHost: "student.emis.gov.eg",
        messages: [{ action: "EXPORT_EXPENSES_EXCEL" }]
      });
    };
    window.withButtonBusy ? window.withButtonBusy(btnExpensesExport, run) : run();
  });

  document.querySelectorAll(".expenses-stat[data-exp-cat]").forEach(btn => {
    btn.addEventListener("click", () => openExpensesDetails(btn.dataset.expCat || "all"));
  });

  function closeExpensesDetails() {
    if (expensesDetailModal) {
      expensesDetailModal.hidden = true;
      window.neprasReleaseFocusTrap?.(expensesDetailModal);
    }
  }
  expensesDetailClose?.addEventListener("click", closeExpensesDetails);
  expensesDetailModal?.addEventListener("click", e => {
    if (e.target === expensesDetailModal) closeExpensesDetails();
  });
  expensesDetailExport?.addEventListener(
    "click",
    async () => {

      NeprasButtons.busy(expensesDetailExport, true, "جارٍ التصدير…");

      try {
        await navigateAndRun({
          targetUrl:
            "https://student.emis.gov.eg/student/list",
          siteHost:
            "student.emis.gov.eg",
          messages: [
            {
              action:
                "EXPORT_EXPENSES_CATEGORY_EXCEL",
              category:
                expensesDetailCategory
            }
          ]
        });
      } finally {
        setTimeout(() => {
          if (expensesDetailExport) {
            NeprasButtons.busy(expensesDetailExport, false);
          }
        }, 900);
      }
    }
  );

  expensesDetailSearch?.addEventListener("input", () => renderExpensesDetailRows(expensesDetailRows));

  let schoolStatsRefreshClickLocked = false;

    btnSchoolStatsRefresh?.addEventListener(
    "click",
    async () => {

      if (schoolStatsRefreshClickLocked) {
        window.neprasNotice?.(
          "تحديث الإحصاء بدأ بالفعل.",
          "warning"
        );
        return;
      }

      let stage = stageSelect?.value || "";
      if (!stage) {
        const savedMeta = (await globalThis.NeprasSchoolManager?.loadSchoolMeta?.()) || {};
        const savedStats = (await globalThis.NeprasSchoolManager?.loadSchoolStats?.())?.stats || {};
        const fallbackStage = savedMeta.stage || savedStats.stage || (await loadSavedStage());
        if (fallbackStage && stageSelect) {
          stageSelect.value = fallbackStage;
          stage = fallbackStage;
          await setStage(fallbackStage);
        }
      }

      if (!stage) {
        NeprasUI.field.error(stageSelect, NeprasUI.msg("stage_required").title);
        showNeprasPopupNotice("يرجى اختيار المرحلة الدراسية أولاً من القائمة العلوية (ابتدائي / إعدادي / ثانوي) للبدء في تحديث الإحصاء.", "warning", "المرحلة الدراسية مطلوبة");
        stageSelect?.focus();
        return;
      }

      try {
        const tabs = await chrome.tabs.query({}).catch(() => []);
        const emisTab = tabs.find(t => t?.url && /student\.emis\.gov\.eg/i.test(t.url));
        if (!emisTab) {
          showNeprasPopupNotice("تنبيه: يرجى التأكد من تسجيل الدخول إلى صفحة المدرسة بموقع الوزارة (student.emis.gov.eg) بالمتصفح ليتمكن نبراس من قراءة الإحصاء.", "info", "تسجيل الدخول لبوابة الوزارة");
        }
      } catch (_) {}

      schoolStatsRefreshClickLocked = true;
      NeprasButtons.busy(btnSchoolStatsRefresh, true, "جارٍ تحديث الإحصاء…");

      try {
        await chrome.storage.local.remove(
          "neprasSchoolStatsLastError"
        );

        await navigateAndRun({
          targetUrl:
            "https://student.emis.gov.eg/student/list",
          siteHost:
            "student.emis.gov.eg",
          messages: [
            {
              action:
                "SET_STUDENT_STAGE",
              stage
            },
            {
              action:
                "START_SCHOOL_STATS",
              stage
            }
          ]
        });
      } finally {
        setTimeout(
          () => {
            schoolStatsRefreshClickLocked =
              false;
            NeprasButtons.busy(btnSchoolStatsRefresh, false);
          },
          2500
        );
      }
    }
  );

  btnSchoolStatsExport?.addEventListener("click", async () => {
    try {
      const stats = window.currentRenderedSchoolStats || (await chrome.storage.local.get("neprasSchoolStatsV1"))?.neprasSchoolStatsV1;
      const students = window.neprasCachedStudentsList || stats?.detailRows || [];
      const meta = (typeof getStatsCenterSchoolMeta === "function" ? getStatsCenterSchoolMeta() : {}) || {};
      meta.school = meta.school || stats?.schoolName || "المدرسة";

      // 1. تصدير المصنف الإحصائي الشامل إذا كانت بيانات الطلاب متاحة بالذاكرة
      if (globalThis.NeprasStatsDashboard?.buildMasterWorkbook && (students?.length || stats?.detailRows?.length)) {
        NeprasButtons.busy(btnSchoolStatsExport, true, "جارٍ تجهيز ملف Excel…");
        const rows = students.length ? students : stats.detailRows;
        const wb = globalThis.NeprasStatsDashboard.buildMasterWorkbook(rows, meta, XLSX);
        const safeName = (meta.school || "المدرسة").replace(/[^\u0600-\u06FFa-zA-Z0-9_-]/g, "_");
        const filename = `احصاء_المدرسة_الشامل_${safeName}_${new Date().toISOString().slice(0, 10)}.xlsx`;
        XLSX.writeFile(wb, filename);
        showNeprasPopupNotice("تم تصدير ملف إحصاء المدرسة الشامل (Excel) بنجاح!", "success", "تصدير الإحصاء");
        return;
      }

      // 2. تصدير إحصائية الصفوف والأعداد إن وُجد كائن stats
      if (stats && Array.isArray(stats.grades) && stats.grades.length && typeof XLSX !== "undefined") {
        NeprasButtons.busy(btnSchoolStatsExport, true, "جارٍ تجهيز ملف Excel…");
        const statusNames = Object.keys(stats.statuses || {});
        const headers = ["الصف", "إجمالي الطلاب", "بنين", "بنات", "عدد الفصول", "طلاب المنازل", "طلاب الدمج", ...statusNames];
        const rows = stats.grades.map(g => [
          g.grade, Number(g.total || 0), Number(g.boys || 0), Number(g.girls || 0),
          Number(g.classes || 0), Number(g.homes || 0), Number(g.integrated || 0),
          ...statusNames.map(s => Number(g.statuses?.[s] || 0))
        ]);
        rows.push([
          "الإجمالي العام", Number(stats.total || 0), Number(stats.boys || 0), Number(stats.girls || 0),
          Number(stats.classes || 0), Number(stats.homes || 0), Number(stats.integrated || 0),
          ...statusNames.map(s => Number(stats.statuses?.[s] || 0))
        ]);
        const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        ws["!views"] = [{ rightToLeft: true }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "إحصاء المدرسة");
        const safeName = (stats.schoolName || meta.school || "المدرسة").replace(/[^\u0600-\u06FFa-zA-Z0-9_-]/g, "_");
        const filename = `احصاء_المدرسة_${safeName}.xlsx`;
        XLSX.writeFile(wb, filename);
        showNeprasPopupNotice("تم تصدير ملف إحصاء المدرسة (Excel) بنجاح!", "success", "تصدير الإحصاء");
        return;
      }

      // 3. محاولة الطلب من تبويب الموقع إن لم تتوفر بيانات بالذاكرة
      await navigateAndRun({
        targetUrl: "https://student.emis.gov.eg/student/list",
        siteHost: "student.emis.gov.eg",
        messages: [{ action: "EXPORT_SCHOOL_STATS_EXCEL" }]
      });
    } catch (err) {
      showNeprasPopupNotice("تعذر تصدير ملف الإكسيل: " + (err?.message || err), "error", "تصدير الإحصاء");
    } finally {
      NeprasButtons.busy(btnSchoolStatsExport, false);
    }
  });

  schoolStatsDetailClose?.addEventListener(
    "click",
    closeSchoolStatsDetails
  );

  schoolStatsDetailModal?.addEventListener(
    "click",
    event => {
      if (event.target === schoolStatsDetailModal) {
        closeSchoolStatsDetails();
      }
    }
  );

  schoolStatsDetailSearch?.addEventListener(
    "input",
    () =>
      renderSchoolStatsDetailRows(
        schoolStatsDetailRows
      )
  );

  schoolStatsDetailExport?.addEventListener(
    "click",
    () => {
      const run = async () => {
        if (!schoolStatsDetailFilter) return;

        await navigateAndRun({
          targetUrl: "https://student.emis.gov.eg/student/list",
          siteHost: "student.emis.gov.eg",
          messages: [
            {
              action: "EXPORT_SCHOOL_STATS_DETAIL_EXCEL",
              filter: schoolStatsDetailFilter
            }
          ]
        });
      };
      window.withButtonBusy ? window.withButtonBusy(schoolStatsDetailExport, run) : run();
    }
  );


  btnClassReport?.addEventListener("click", () => {
    window.withButtonBusy ? window.withButtonBusy(btnClassReport, triggerClassReportCommand) : triggerClassReportCommand();
  });

  async function launchAutoAssignTool(autoExportClasses = false) {
    // v1.0.2: كانت هذه الدالة تفترض أن التبويب الحالي مفتوح بالفعل على
    // صفحة "توزيع وتسكين الطلاب" ولا تنتقل إليها بنفسها (خلافًا لكل أزرار
    // العمليات الأخرى في هذا الملف)، فإذا كان المستخدم على أي صفحة أخرى من
    // موقع الوزارة كانت الأداة تفشل بصمت لعدم عثورها على قوائم الصفوف/الفصول.
    // الحل: استخدام نفس مسار navigateAndRun الموحّد الذي يفتح الرابط الصحيح
    // فعليًا (وينتقل إليه حتى لو كان تبويب آخر من نفس الموقع مفتوحًا على
    // صفحة مختلفة)، تمامًا كما تفعل بقية الأزرار.
    await navigateAndRun({
      targetUrl: "https://student.emis.gov.eg/class/assign",
      siteHost: "student.emis.gov.eg",
      messages: [
        autoExportClasses
          ? { action: "NEPRAS_AUTO_ASSIGN_EXPORT_CLASSES" }
          : { action: "NEPRAS_AUTO_ASSIGN_OPEN" }
      ]
    });
  }

  const btnLaunchAutoAssign = document.getElementById("btn-launch-auto-assign");
  const btnExportClassesExcel = document.getElementById("btn-export-classes-excel");
  const btnClassReportExcel = document.getElementById("btn-class-report-excel");

  btnLaunchAutoAssign?.addEventListener("click", () => {
    const run = () => launchAutoAssignTool(false);
    window.withButtonBusy ? window.withButtonBusy(btnLaunchAutoAssign, run) : run();
  });
  btnExportClassesExcel?.addEventListener("click", () => {
    const run = () => launchAutoAssignTool(true);
    window.withButtonBusy ? window.withButtonBusy(btnExportClassesExcel, run) : run();
  });
  // v1.2.25: قوائم الفصول Excel صارت تُبنى من بيانات /student/list (الكود، الاسم، حالة القيد
  // + المحافظة/المديرية/الإدارة)، والمسار القديم من صفحة التوزيع ما زال متاحًا من زر «تنزيل قوائم المدرسة Excel».
  async function triggerClassListsExcelCommand() {
    const stage = stageSelect?.value || "";
    if (!stage) {
      NeprasUI.field.error(stageSelect, NeprasUI.msg("stage_required").title);
      return;
    }
    await navigateAndRun({
      targetUrl: "https://student.emis.gov.eg/student/list",
      siteHost: "student.emis.gov.eg",
      messages: [
        { action: "SET_STUDENT_STAGE", stage },
        { action: "START_CLASS_LISTS_EXCEL", stage }
      ]
    });
  }

  btnClassReportExcel?.addEventListener("click", () => {
    window.withButtonBusy ? window.withButtonBusy(btnClassReportExcel, triggerClassListsExcelCommand) : triggerClassListsExcelCommand();
  });

  const ATTENDANCE_URL = "https://student.emis.gov.eg/absence/save";
  const ATT_MAX_DAYS = 5; // أقصى عدد أيام في الأسبوع الدراسي (يطابق modules/attendance.js)

  function openAttendancePage() {
    return navigateAndRun({ targetUrl: ATTENDANCE_URL, siteHost: "student.emis.gov.eg", messages: [] });
  }
  btnQuickAttendance?.addEventListener("click", openAttendancePage);

  // ==========================================================
  // الحضور والغياب من اللوحة: أيام ثابتة أو مدى عشوائي لكل طالب.
  // الأوامر تُرسل برسالة NEPRAS_ATTENDANCE_RUN إلى تبويب صفحة الغياب المفتوح (لا نعيد تحميل الصفحة
  // كي لا نفقد الأسبوع والصف والفصل المختارة). لا تبويب مفتوح ⇒ نطلب فتحه أولًا.
  // ==========================================================
  const attMode = () => document.querySelector('input[name="att-mode"]:checked')?.value || "fixed";
  const attDays = document.getElementById("att-days");
  const attMin = document.getElementById("att-min");
  const attMax = document.getElementById("att-max");
  const attHint = document.getElementById("att-hint");

  function attIntIn(el) {
    const raw = String(el?.value ?? "").trim();
    return /^\d{1,2}$/.test(raw) ? Number(raw) : NaN;
  }

  // يرجع { mode, days } أو { mode, min, max }؛ أو null مع رسالة تحت الحقل المعيب
  function readAttendanceSpec() {
    NeprasUI.field.clear(attDays); NeprasUI.field.clear(attMin); NeprasUI.field.clear(attMax);
    if (attMode() === "fixed") {
      const n = attIntIn(attDays);
      if (!Number.isInteger(n) || n > ATT_MAX_DAYS) { NeprasUI.field.error(attDays, "أدخل رقمًا صحيحًا من 0 إلى " + ATT_MAX_DAYS + "."); return null; }
      return { mode: "fixed", days: n };
    }
    const min = attIntIn(attMin), max = attIntIn(attMax);
    if (!Number.isInteger(min) || min > ATT_MAX_DAYS) { NeprasUI.field.error(attMin, "الحد الأدنى: رقم من 0 إلى " + ATT_MAX_DAYS + "."); return null; }
    if (!Number.isInteger(max) || max > ATT_MAX_DAYS) { NeprasUI.field.error(attMax, "الحد الأعلى: رقم من 0 إلى " + ATT_MAX_DAYS + "."); return null; }
    if (min > max) { NeprasUI.field.error(attMin, "الحد الأدنى يجب ألا يزيد عن الحد الأعلى."); return null; }
    return { mode: "range", min, max };
  }

  function refreshAttendanceForm() {
    const range = attMode() === "range";
    document.getElementById("att-fixed-field").hidden = range;
    document.getElementById("att-range-field").hidden = !range;
    if (!attHint) return;
    if (!range) {
      const n = attIntIn(attDays);
      attHint.textContent = Number.isInteger(n) ? "سيُسجَّل لكل طالب " + n + " يوم غياب." : "";
    } else {
      const a = attIntIn(attMin), b = attIntIn(attMax);
      attHint.textContent = Number.isInteger(a) && Number.isInteger(b) && a <= b
        ? "سيحصل كل طالب على عدد عشوائي من الأيام بين " + a + " و" + b + " (المتوسط المتوقع " + (Math.round(((a + b) / 2) * 10) / 10) + ")."
        : "";
    }
  }
  document.querySelectorAll('input[name="att-mode"]').forEach((r) => r.addEventListener("change", refreshAttendanceForm));
  [attDays, attMin, attMax].forEach((el) => el?.addEventListener("input", () => { NeprasUI.field.clear(el); refreshAttendanceForm(); }));
  refreshAttendanceForm();

  async function findAttendanceTab() {
    const tabs = await chrome.tabs.query({ url: "https://student.emis.gov.eg/*" });
    return tabs.find((t) => /absence|attendance/i.test(t.url || "") && !/excuse|generouslineage/i.test(t.url || "")) || null;
  }

  async function fileToBase64(file) {
    const buf = new Uint8Array(await file.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  async function runAttendanceOp(op, button, opts) {
    const o = opts || {};
    const payload = { action: "NEPRAS_ATTENDANCE_RUN", op };
    if (o.needsSpec) { const spec = readAttendanceSpec(); if (!spec) return; payload.spec = spec; }
    if (o.needsFile) {
      const f = document.getElementById("att-file")?.files?.[0];
      if (!f) { NeprasUI.field.error(document.getElementById("att-file"), "اختر ملف الشيت المعبّأ أولًا."); return; }
      if (f.size > 8 * 1024 * 1024) { NeprasUI.field.error(document.getElementById("att-file"), "حجم الملف كبير (الحد 8 ميجا)."); return; }
      payload.file = { name: f.name, type: f.type, b64: await fileToBase64(f) };
    }
    NeprasButtons.busy(button, true);
    try {
      const tab = await findAttendanceTab();
      if (!tab) {
        NeprasUI.toast({ kind: "warning", title: "افتح صفحة تسجيل الغياب أولًا", message: "افتحها من موقع الوزارة، ثم اختر الأسبوع والصف والفصل واضغط عرض الطلاب، وارجع هنا.",
          actions: [{ label: "فتح صفحة تسجيل الغياب", icon: "external", onClick: openAttendancePage }], id: "att-open-first" });
        return;
      }
      let res = null;
      try { res = await chrome.tabs.sendMessage(tab.id, payload); } catch (_) { res = null; }
      if (!res) {
        NeprasUI.toast({ kind: "error", title: "تعذر الاتصال بصفحة الغياب", message: "أعد تحميل صفحة تسجيل الغياب ثم حاول مجددًا.", id: "att-no-reply" });
        return;
      }
      if (res.ok === false) {
        const msgs = {
          not_attendance_page: ["افتح صفحة تسجيل الغياب", "الصفحة المفتوحة ليست صفحة تسجيل الغياب."],
          week_required: ["اختر الأسبوع أولًا", "حدّد الأسبوع في صفحة الغياب ثم أعد المحاولة."],
          no_table: ["لا يوجد جدول طلاب", "اختر الأسبوع والصف والفصل ثم اضغط عرض الطلاب."],
          bad_spec: ["قيمة الغياب غير صالحة", "راجع عدد الأيام أو المدى."],
          no_file: ["اختر الملف أولًا", "لم يصل الملف إلى الصفحة."],
        };
        const m = msgs[res.code] || ["تعذر تنفيذ الأمر", res.message || "أعد المحاولة."];
        NeprasUI.toast({ kind: "warning", title: m[0], message: m[1], id: "att-op-failed" });
        try { await chrome.tabs.update(tab.id, { active: true }); await chrome.windows.update(tab.windowId, { focused: true }); } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
        return;
      }
      // نجح: نُظهر تبويب الوزارة لمتابعة التنفيذ ونغلق النافذة (إلا الكبيرة أو عند تفعيل إبقاء الأداة نشطة)
      try { await chrome.tabs.update(tab.id, { active: true }); await chrome.windows.update(tab.windowId, { focused: true }); } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
      if (shouldAutoClosePopup()) { try { window.close(); } catch (err) { console.warn("[Nepras Handled]", err?.message || err); } }
    } finally {
      NeprasButtons.busy(button, false);
    }
  }

  const attOps = [
    ["btn-att-fill", "fill-days", { needsSpec: true }], ["btn-att-zero", "fill-zero", {}],
    ["btn-att-class", "auto-class", { needsSpec: true }], ["btn-att-full", "auto-full", { needsSpec: true }], ["btn-att-range", "auto-range", { needsSpec: true }],
    ["btn-att-random", "random-students", {}], ["btn-att-template", "download-template", {}], ["btn-att-upload", "smart-upload", { needsFile: true }],
  ];
  for (const [id, op, opts] of attOps) {
    const b = document.getElementById(id);
    b?.addEventListener("click", () => runAttendanceOp(op, b, opts));
  }

  teacherTaskButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const taskType = String(button.dataset.teacherTask || "").trim();
      if (!taskType) return;
      let extra = taskType === "FETCH_STATUS_SHEETS_PDF"
        ? { individual: getStatusSheetsMode() === "individual" }
        : {};
      if (taskType === "FETCH_SINGLE_STATUS_SHEET") {
        // v1.2.76: تحقق فوري في النافذة قبل فتح موقع الوزارة (الصفحة تعيد التحقق أيضًا).
        const input = document.getElementById("single-sheet-input");
        const parsed = parseSingleSheetLookup(input?.value);
        if (!parsed.ok) {
          NeprasUI.field.error(input, parsed.message);
          input?.focus();
          return;
        }
        NeprasUI.field.clear(input);
        extra = { lookup: parsed.value };
      }
      const run = () => triggerTeacherCommand(taskType, extra);
      window.withButtonBusy ? window.withButtonBusy(button, run) : run();
    });
  });

  // v1.2.77 — النافذة بارتفاع ثابت وبلا تمرير للصفحة نفسها. أي تمرير للجذر (مثل تركيز المتصفح لحقل
  // ملف مخفي خارج الشاشة) كان يزيح الواجهة كلها للأعلى ويترك فراغًا أسفل الفوتر، فنرجعه فورًا.
  // لا يعمل إن كان التمرير مسموحًا (overflow غير hidden) كما في بعض واجهات الموبايل.
  (() => {
    const root = document.scrollingElement || document.documentElement;
    const locked = () => {
      const h = getComputedStyle(document.documentElement).overflowY;
      const b = getComputedStyle(document.body).overflowY;
      return h !== "auto" && h !== "scroll" && b !== "auto" && b !== "scroll";
    };
    window.addEventListener("scroll", () => {
      if (root.scrollTop !== 0 && locked()) root.scrollTop = 0;
    }, { passive: true });
  })();

  // Enter داخل حقل الصحيفة الفردية = ضغط الزر.
  document.getElementById("single-sheet-input")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); document.getElementById("btn-single-status-sheet")?.click(); }
  });

  btnOpenAcceptList?.addEventListener("click", () => {
    const run = async () => {
      await navigateAndRun({
        targetUrl: "https://tansik-adtik.emis.gov.eg/#/schoolAdmin/accept-list",
        siteHost: "tansik-adtik.emis.gov.eg",
        messages: []
      });
    };
    window.withButtonBusy ? window.withButtonBusy(btnOpenAcceptList, run) : run();
  });

  // ==========================================================
  // v1.2.78 — منقّي أسماء الطلاب (modules/name_fixer.js)
  // الفتح كله في الخلفية (NEPRAS_NAME_FIXER_OPEN): تفتح القائمة أو تُظهر التبويب الجاري، تحقن الوحدة،
  // وتتحقق فعليًا من ظهور اللوحة. هنا نعرض الفشل فقط.
  // ==========================================================
  const btnOpenNameFixer = document.getElementById("btn-open-name-fixer");
  const nameFixerStatus = document.getElementById("name-fixer-status");

  async function openNameFixer() {
    await neprasPrepareBeforePopupCommand("popup:name-fixer");
    let res = null;
    const keepWindow = neprasIsLargeWindow || neprasKeepPopupOpen;
    try {
      res = await chrome.runtime.sendMessage({
        action: "NEPRAS_NAME_FIXER_OPEN",
        keepControlWindow: keepWindow
      });
    } catch (error) {
      console.error("Nepras name-fixer open error:", error);
    }
    if (res?.ok === true) {
      if (shouldAutoClosePopup()) { try { window.close(); } catch (err) { console.warn("[Nepras Handled]", err?.message || err); } }
      else { try { window.focus(); } catch (err) { console.warn("[Nepras Handled]", err?.message || err); } }
      return;
    }
    NeprasUI.toast({
      kind: "warning",
      title: "تعذر فتح منقّي الأسماء",
      message: "افتح موقع الطلاب في الوزارة وسجّل الدخول، ثم أعد المحاولة.",
      id: "nf-open-failed"
    });
  }

  btnOpenNameFixer?.addEventListener("click", () => {
    window.withButtonBusy ? window.withButtonBusy(btnOpenNameFixer, openNameFixer) : openNameFixer();
  });

  async function renderNameFixerStatus() {
    if (!nameFixerStatus) return;
    try {
      const s = await chrome.storage.local.get(["nf_running", "nf_target_codes", "nf_current_index"]);
      if (!s.nf_running) { nameFixerStatus.hidden = true; return; }
      const total = Array.isArray(s.nf_target_codes) ? s.nf_target_codes.length : 0;
      const done = Math.min(Math.max(Number(s.nf_current_index) || 0, 0), total);
      nameFixerStatus.textContent = `التنقية جارية الآن: ${done} من ${total} طالب.`;
      nameFixerStatus.hidden = false;
    } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
  }
  awaitSafe(renderNameFixerStatus());
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if ("nf_running" in changes || "nf_current_index" in changes || "nf_target_codes" in changes) renderNameFixerStatus();
    });
  } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }

  // ============================================================
  // v1.2.79: السجلات والكشوف والخدمات المدرسية المتقدمة
  // ============================================================
  async function runRecordsAction(actionName, extraPayload = {}, targetUrl = "https://student.emis.gov.eg/student/list") {
    const stage = stageSelect?.value || "";
    const msgs = [];
    if (stage) msgs.push({ action: "SET_STUDENT_STAGE", stage });
    msgs.push({ action: actionName, ...extraPayload });
    await navigateAndRun({
      targetUrl,
      siteHost: "student.emis.gov.eg",
      messages: msgs
    });
  }

  const btnRecordsAnemia = document.getElementById("btn-records-anemia");
  const btnRecordsHealthFollowup = document.getElementById("btn-records-health-followup");
  const btnRecordsEyes = document.getElementById("btn-records-eyes");
  const btnRecordsMonthlyAbsence = document.getElementById("btn-records-monthly-absence");
  const btnRecordsSchoolBudget = document.getElementById("btn-records-school-budget");
  const btnRecordsBehavior5 = document.getElementById("btn-records-behavior-5");
  const btnRecordsClassGrades = document.getElementById("btn-records-class-grades");
  const btnRecordsClassAbsence = document.getElementById("btn-records-class-absence");
  const btnRecordsClassSummary = document.getElementById("btn-records-class-summary");
  const btnRecordsTwoCol = document.getElementById("btn-records-two-col");
  const btnRecordsNewcomers41 = document.getElementById("btn-records-newcomers-41");
  const btnRecordsCallList = document.getElementById("btn-records-call-list");
  const btnRecordsOrphans = document.getElementById("btn-records-orphans");
  const btnRecordsMerge = document.getElementById("btn-records-merge");
  const btnRecordsEnrollment = document.getElementById("btn-records-enrollment");
  const btnRecordsManazel = document.getElementById("btn-records-manazel");
  const btnRecordsWorkers = document.getElementById("btn-records-workers");
  const btnRecordsCustomEightCols = document.getElementById("btn-records-custom-eight-cols");
  const btnStudentCustomEightCols = document.getElementById("btn-student-custom-eight-cols");
  const btnRecordsDownloadAnyTable = document.getElementById("btn-records-download-any-table");
  const btnRecordsNidCheck = document.getElementById("btn-records-nid-check");
  const inputRecordsNid = document.getElementById("input-records-nid");
  const nidResultEl = document.getElementById("records-nid-result");

  btnRecordsAnemia?.addEventListener("click", () => {
    window.withButtonBusy ? window.withButtonBusy(btnRecordsAnemia, () => runRecordsAction("NEPRAS_RECORDS_ANEMIA")) : runRecordsAction("NEPRAS_RECORDS_ANEMIA");
  });

  btnRecordsHealthFollowup?.addEventListener("click", () => {
    window.withButtonBusy ? window.withButtonBusy(btnRecordsHealthFollowup, () => runRecordsAction("NEPRAS_RECORDS_HEALTH_FOLLOWUP")) : runRecordsAction("NEPRAS_RECORDS_HEALTH_FOLLOWUP");
  });

  btnRecordsEyes?.addEventListener("click", () => {
    window.withButtonBusy ? window.withButtonBusy(btnRecordsEyes, () => runRecordsAction("NEPRAS_RECORDS_EYES")) : runRecordsAction("NEPRAS_RECORDS_EYES");
  });

  btnRecordsMonthlyAbsence?.addEventListener("click", () => {
    window.withButtonBusy ? window.withButtonBusy(btnRecordsMonthlyAbsence, () => runRecordsAction("NEPRAS_RECORDS_MONTHLY_ABSENCE")) : runRecordsAction("NEPRAS_RECORDS_MONTHLY_ABSENCE");
  });

  btnRecordsSchoolBudget?.addEventListener("click", () => {
    window.withButtonBusy ? window.withButtonBusy(btnRecordsSchoolBudget, () => runRecordsAction("NEPRAS_RECORDS_SCHOOL_BUDGET")) : runRecordsAction("NEPRAS_RECORDS_SCHOOL_BUDGET");
  });

  btnRecordsBehavior5?.addEventListener("click", () => {
    window.withButtonBusy ? window.withButtonBusy(btnRecordsBehavior5, () => runRecordsAction("NEPRAS_RECORDS_BEHAVIOR_5")) : runRecordsAction("NEPRAS_RECORDS_BEHAVIOR_5");
  });

  btnRecordsClassGrades?.addEventListener("click", () => {
    window.withButtonBusy ? window.withButtonBusy(btnRecordsClassGrades, () => runRecordsAction("NEPRAS_RECORDS_CLASS_REGISTERS", { registerType: "grades" })) : runRecordsAction("NEPRAS_RECORDS_CLASS_REGISTERS", { registerType: "grades" });
  });

  btnRecordsClassAbsence?.addEventListener("click", () => {
    window.withButtonBusy ? window.withButtonBusy(btnRecordsClassAbsence, () => runRecordsAction("NEPRAS_RECORDS_CLASS_REGISTERS", { registerType: "absence" })) : runRecordsAction("NEPRAS_RECORDS_CLASS_REGISTERS", { registerType: "absence" });
  });

  btnRecordsClassSummary?.addEventListener("click", () => {
    window.withButtonBusy ? window.withButtonBusy(btnRecordsClassSummary, () => runRecordsAction("NEPRAS_RECORDS_CLASS_REGISTERS", { registerType: "summary" })) : runRecordsAction("NEPRAS_RECORDS_CLASS_REGISTERS", { registerType: "summary" });
  });

  btnRecordsTwoCol?.addEventListener("click", () => {
    const sortMode = document.getElementById("two-col-sort-mode")?.value || "gender_boys";
    window.withButtonBusy ? window.withButtonBusy(btnRecordsTwoCol, () => runRecordsAction("NEPRAS_RECORDS_TWO_COLUMN_LISTS", { sortMode })) : runRecordsAction("NEPRAS_RECORDS_TWO_COLUMN_LISTS", { sortMode });
  });

  btnRecordsNewcomers41?.addEventListener("click", () => {
    window.withButtonBusy ? window.withButtonBusy(btnRecordsNewcomers41, () => runRecordsAction("NEPRAS_RECORDS_NEWCOMERS_41")) : runRecordsAction("NEPRAS_RECORDS_NEWCOMERS_41");
  });

  btnRecordsCallList?.addEventListener("click", () => {
    window.withButtonBusy ? window.withButtonBusy(btnRecordsCallList, () => runRecordsAction("NEPRAS_RECORDS_CALL_LIST")) : runRecordsAction("NEPRAS_RECORDS_CALL_LIST");
  });

  btnRecordsOrphans?.addEventListener("click", () => {
    window.withButtonBusy ? window.withButtonBusy(btnRecordsOrphans, () => runRecordsAction("NEPRAS_RECORDS_ORPHANS_EXEMPTIONS")) : runRecordsAction("NEPRAS_RECORDS_ORPHANS_EXEMPTIONS");
  });

  btnRecordsMerge?.addEventListener("click", () => {
    window.withButtonBusy ? window.withButtonBusy(btnRecordsMerge, () => runRecordsAction("NEPRAS_RECORDS_SPECIAL_NEEDS_MERGE")) : runRecordsAction("NEPRAS_RECORDS_SPECIAL_NEEDS_MERGE");
  });

  btnRecordsEnrollment?.addEventListener("click", () => {
    window.withButtonBusy ? window.withButtonBusy(btnRecordsEnrollment, () => runRecordsAction("NEPRAS_RECORDS_ENROLLMENT_REGISTERS")) : runRecordsAction("NEPRAS_RECORDS_ENROLLMENT_REGISTERS");
  });

  btnRecordsManazel?.addEventListener("click", () => {
    window.withButtonBusy ? window.withButtonBusy(btnRecordsManazel, () => runRecordsAction("NEPRAS_RECORDS_MANAZEL")) : runRecordsAction("NEPRAS_RECORDS_MANAZEL");
  });

  btnRecordsWorkers?.addEventListener("click", () => {
    window.withButtonBusy ? window.withButtonBusy(btnRecordsWorkers, () => runRecordsAction("NEPRAS_RECORDS_WORKERS")) : runRecordsAction("NEPRAS_RECORDS_WORKERS");
  });

  btnRecordsCustomEightCols?.addEventListener("click", async () => {
    const selectedGrade = gradeSelect?.value || "";
    let selectedStage = stageSelect?.value || "";
    if (!selectedStage) {
      try {
        const stored = await chrome.storage.local.get("neprasSelectedStudentStage");
        selectedStage = stored?.neprasSelectedStudentStage || "";
      } catch (_) {}
    }
    window.withButtonBusy
      ? window.withButtonBusy(btnRecordsCustomEightCols, () => runRecordsAction("NEPRAS_RECORDS_CUSTOM_EIGHT_COLUMNS", { selectedGrade, selectedStage }))
      : runRecordsAction("NEPRAS_RECORDS_CUSTOM_EIGHT_COLUMNS", { selectedGrade, selectedStage });
  });

  btnStudentCustomEightCols?.addEventListener("click", async () => {
    const selectedGrade = gradeSelect?.value || "";
    let selectedStage = stageSelect?.value || "";
    if (!selectedStage) {
      try {
        const stored = await chrome.storage.local.get("neprasSelectedStudentStage");
        selectedStage = stored?.neprasSelectedStudentStage || "";
      } catch (_) {}
    }
    window.withButtonBusy
      ? window.withButtonBusy(btnStudentCustomEightCols, () => runRecordsAction("NEPRAS_RECORDS_CUSTOM_EIGHT_COLUMNS", { selectedGrade, selectedStage }))
      : runRecordsAction("NEPRAS_RECORDS_CUSTOM_EIGHT_COLUMNS", { selectedGrade, selectedStage });
  });

  // ===== استمارة الشهادة الإعدادية الإلكترونية (كشوف المسجلين والمتخلفين كاملة البيانات) =====
  const btnG9ExportUnregistered = document.getElementById("btn-g9-export-unregistered");
  const btnG9ExportRegistered = document.getElementById("btn-g9-export-registered");
  const btnG9ExportMaster = document.getElementById("btn-g9-export-master");
  const btnOpenG9ExamPage = document.getElementById("btn-open-g9-exam-page");

  async function handleG9ExportClick(mode) {
    let label = "الكشف الشامل الموحد";
    if (mode === "UNREGISTERED") label = "كشف المتخلفين عن التسجيل";
    else if (mode === "REGISTERED") label = "كشف المسجلين للاستمارة";

    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
      const onExamPage = activeTab?.url && activeTab.url.includes("/exams/followUpG9ExamReg");

      if (!onExamPage) {
        if (typeof showNeprasPopupNotice === "function") {
          showNeprasPopupNotice(`جاري الانتقال لصفحة متابعة تسجيل استمارة الشهادة الإعدادية لاستخراج ${label}...`, "info", "استمارة الإعدادية");
        }
        await neprasNavigateStudentSpa({
          targetUrl: "https://student.emis.gov.eg/exams/followUpG9ExamReg",
          routeMatch: "/exams/followUpG9ExamReg"
        });
        if (typeof showNeprasPopupNotice === "function") {
          showNeprasPopupNotice(`تم الانتقال لصفحة استمارة الإعدادية بنجاح! اضغط الآن على زر "${label}" في نافذة نبراس لتنزيل الإكسيل فوراً.`, "success", "استمارة الإعدادية");
        }
        return;
      }

      if (typeof showNeprasPopupNotice === "function") {
        showNeprasPopupNotice(`جاري سحب وتدقيق ${label} وتنزيله كملف Excel كامل البيانات...`, "info", "استمارة الإعدادية");
      }

      // جلب كاش بيانات الطلاب (السحب الشامل) لدمجه فوراً وتعبئة الرقم القومي وتاريخ الميلاد والديانة
      let cachedStudents = [];
      try {
        if (typeof getOrLoadStudents === "function") {
          cachedStudents = await getOrLoadStudents();
        }
      } catch (_) {}

      chrome.tabs.sendMessage(activeTab.id, {
        action: "NEPRAS_G9_EXAM_EXPORT",
        mode,
        cachedStudents: cachedStudents || []
      }, (resp) => {
        if (chrome.runtime.lastError) {
          if (typeof showNeprasPopupNotice === "function") {
            showNeprasPopupNotice("تعذر إرسال الأمر للصفحة. يرجى إعادة تحديث صفحة متابعة الاستمارة بالمتصفح.", "error", "استمارة الإعدادية");
          }
          return;
        }
        if (resp && resp.ok) {
          if (typeof showNeprasPopupNotice === "function") {
            showNeprasPopupNotice(`تم استخراج ${label} وتنزيله كملف Excel بنجاح!`, "success", "استمارة الإعدادية");
          }
        } else {
          if (typeof showNeprasPopupNotice === "function") {
            showNeprasPopupNotice(resp?.message || "حدث خطأ أثناء استخراج الكشف.", "error", "استمارة الإعدادية");
          }
        }
      });
    } catch (err) {
      if (typeof showNeprasPopupNotice === "function") {
        showNeprasPopupNotice(err?.message || "حدث خطأ غير متوقع", "error", "استمارة الإعدادية");
      }
    }
  }

  btnG9ExportUnregistered?.addEventListener("click", () => handleG9ExportClick("UNREGISTERED"));
  btnG9ExportRegistered?.addEventListener("click", () => handleG9ExportClick("REGISTERED"));
  btnG9ExportMaster?.addEventListener("click", () => handleG9ExportClick("MASTER"));
  btnOpenG9ExamPage?.addEventListener("click", async () => {
    await neprasNavigateStudentSpa({
      targetUrl: "https://student.emis.gov.eg/exams/followUpG9ExamReg",
      routeMatch: "/exams/followUpG9ExamReg"
    });
  });

  // ===== التنقل الذكي داخل موقع الوزارة (Angular SPA) بدون إعادة تحميل أو طلب تسجيل دخول من جديد =====
  async function neprasNavigateStudentSpa({ targetUrl, routeMatch, onStatus }) {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const notify = (msg) => { if (typeof onStatus === "function") onStatus(msg); };

    let tab = null;
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
      if (activeTab?.id && /^https:\/\/student\.emis\.gov\.eg\//i.test(String(activeTab.url || ""))) {
        tab = activeTab;
      } else {
        const allTabs = await chrome.tabs.query({});
        tab = allTabs.find((t) => /^https:\/\/student\.emis\.gov\.eg\//i.test(String(t?.url || ""))) || null;
      }
    } catch (_) {}

    if (!tab?.id) {
      notify("جاري فتح موقع بيانات التلميذ...");
      tab = await chrome.tabs.create({ url: targetUrl, active: true });
      return { ok: true, tab, created: true };
    }

    const curUrl = String(tab.url || "");
    if (/\/login(?:[/?#]|$)/i.test(curUrl)) {
      await chrome.tabs.update(tab.id, { active: true }).catch(() => {});
      return { ok: false, isLogin: true, tab, message: "يرجى تسجيل الدخول في موقع بيانات التلميذ أولاً ثم إعادة المحاولة." };
    }

    if (!tab.active) {
      await chrome.tabs.update(tab.id, { active: true }).catch(() => {});
    }

    if (routeMatch && !curUrl.toLowerCase().includes(String(routeMatch).toLowerCase())) {
      notify("جاري الانتقال داخلياً إلى صفحة التقرير بدون إعادة تحميل الجلسة...");
      let spaWorked = false;

      // 1) التنقل الداخلي المباشر في سياق Angular (MAIN world) للحفاظ على جلسة الدخول 100%
      try {
        const execRes = await chrome.scripting?.executeScript?.({
          target: { tabId: tab.id },
          world: "MAIN",
          func: (targetPath) => {
            try {
              if (location.pathname.toLowerCase().includes(targetPath.toLowerCase())) {
                return { ok: true, alreadyThere: true };
              }
              const anchors = Array.from(document.querySelectorAll("a[href], a[routerlink], [ng-reflect-router-link]"));
              const matchAnchor = anchors.find((a) => {
                const href = (a.getAttribute("href") || a.getAttribute("routerlink") || a.getAttribute("ng-reflect-router-link") || "").toLowerCase();
                return href.includes(targetPath.toLowerCase());
              });
              if (matchAnchor) {
                matchAnchor.click();
                return { ok: true, method: "anchor_click" };
              }
              const absenceAnchor = anchors.find((a) => {
                const txt = (a.innerText || a.textContent || "").trim();
                return txt.includes("غياب") || txt.includes("absence");
              });
              if (absenceAnchor) {
                absenceAnchor.click();
                return { ok: true, method: "anchor_absence_click" };
              }
              return { ok: false, method: "need_tabs_update" };
            } catch (e) {
              return { ok: false, error: e?.message || String(e) };
            }
          },
          args: [routeMatch]
        });
        if (execRes?.[0]?.result?.ok) {
          spaWorked = true;
        }
      } catch (_) {}

      // 2) مسار بديل عبر content.js إن لم يتوفر executeScript
      if (!spaWorked) {
        try {
          const msgRes = await chrome.tabs.sendMessage(tab.id, {
            action: "NEPRAS_SPA_NAVIGATE",
            targetPath: routeMatch
          });
          if (msgRes?.ok) spaWorked = true;
        } catch (_) {}
      }

      if (spaWorked) {
        await sleep(1000);
      } else {
        await chrome.tabs.update(tab.id, { url: targetUrl, active: true });
        const loadStart = Date.now();
        while (Date.now() - loadStart < 15000) {
          await sleep(500);
          try {
            const allT = await chrome.tabs.query({});
            const freshT = allT.find(t => t.id === tab.id);
            if (freshT?.status === "complete") break;
          } catch (_) {}
        }
        await sleep(1200);
      }
    }

    return { ok: true, tab };
  }

  // ===== دالة موحدة للسحب التلقائي لملفات PDF من بوابة الوزارة =====
  async function neprasAutoDownloadMinistryPdf({ targetUrl, routeMatch, selector, textMatch, onStatus }) {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const notify = (msg) => { if (typeof onStatus === "function") onStatus(msg); };

    const navRes = await neprasNavigateStudentSpa({ targetUrl, routeMatch, onStatus });
    if (!navRes.ok || !navRes.tab?.id) {
      return { ok: false, message: navRes.message || "يرجى تسجيل الدخول في موقع بيانات التلميذ أولاً." };
    }
    const tab = navRes.tab;

    // انتظار اكتمال تحميل الصفحة واستقرار مسار Angular
    const waitStart = Date.now();
    while (Date.now() - waitStart < 12000) {
      try {
        const all = await chrome.tabs.query({});
        const fresh = all.find((t) => t.id === tab.id) || tab;
        const u = String(fresh.url || "");
        if (/\/login(?:[/?#]|$)/i.test(u)) {
          return { ok: false, message: "انتهت جلسة الوزارة أو لم يتم تسجيل الدخول بعد. يرجى تسجيل الدخول في التبويب المفتوح." };
        }
        if (fresh.status === "complete" && (!routeMatch || u.toLowerCase().includes(routeMatch.toLowerCase()))) {
          break;
        }
      } catch (_) {}
      await sleep(400);
    }

    try {
      await chrome.runtime.sendMessage({ action: "NEPRAS_REQUEST_SITE_INJECTION" });
    } catch (_) {}

    const sinceTs = Date.now() - 500;
    try {
      await chrome.scripting?.executeScript?.({
        target: { tabId: tab.id },
        world: "MAIN",
        func: () => {
          window.__neprasCapturedPdf = null;
          if (!window.__neprasPdfHookInstalled && typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
            window.__neprasPdfHookInstalled = true;
            const origCreate = URL.createObjectURL.bind(URL);
            URL.createObjectURL = function (obj) {
              const u = origCreate(obj);
              try {
                if (obj instanceof Blob && (obj.type === "application/pdf" || obj.size > 1024)) {
                  const reader = new FileReader();
                  reader.onloadend = () => {
                    const b64 = typeof reader.result === "string" ? reader.result.split(",")[1] || "" : "";
                    if (b64.startsWith("JVBERi")) {
                      window.__neprasCapturedPdf = { base64: b64, size: obj.size, ts: Date.now() };
                    }
                  };
                  reader.readAsDataURL(obj);
                }
              } catch (_) {}
              return u;
            };
          }
        }
      });
    } catch (_) {}

    // البحث عن زر التقرير والضغط عليه تلقائياً مرة واحدة فقط (مع إعادة المحاولة فقط إذا لم يكن السكربت جاهزاً بعد)
    notify("جاري الضغط على زر استخراج ملف الـ PDF من موقع الوزارة...");
    let clicked = false;
    let lastClickErr = "";
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const res = await chrome.tabs.sendMessage(tab.id, {
          action: "NEPRAS_CLICK_REPORT_BUTTON",
          selector: selector || ".buttonBlock button, button.btn-success, .btn-success, a.btn-success, button",
          textMatch: textMatch || "رصد الغياب",
          timeoutMs: 8000
        });
        if (res && res.ok) {
          clicked = true;
          break;
        }
        lastClickErr = res?.message || "";
      } catch (e) {
        lastClickErr = e?.message || "";
        try {
          await chrome.runtime.sendMessage({ action: "NEPRAS_REQUEST_SITE_INJECTION" });
        } catch (_) {}
      }
      await sleep(1000);
    }

    if (!clicked) {
      return {
        ok: false,
        message: lastClickErr || "تعذر العثور على زر التقرير في صفحة الوزارة. تأكد من تسجيل الدخول وتحميل الصفحة بالكامل."
      };
    }

    notify("تم طلب التقرير من خادم الوزارة... جاري انتظار تنزيل واستلام ملف الـ PDF...");
    const dlStart = Date.now();
    const hostDesktop = window.nepDesktop || window.parent?.nepDesktop;
    while (Date.now() - dlStart < 35000) {
      // 1) فحص الـ PDF الملتقط داخل الصفحة (عبر createObjectURL hook)
      try {
        const execRes = await chrome.scripting?.executeScript?.({
          target: { tabId: tab.id },
          world: "MAIN",
          func: () => window.__neprasCapturedPdf || null
        });
        const captured = execRes?.[0]?.result;
        if (captured && captured.base64 && (!captured.ts || captured.ts >= sinceTs)) {
          return { ok: true, base64: captured.base64, size: captured.size || 0, source: "page_blob" };
        }
      } catch (_) {}

      // 2) فحص الـ PDF الملتقط عبر Electron will-download
      if (hostDesktop?.getLatestDownloadedPdf) {
        try {
          const dl = await hostDesktop.getLatestDownloadedPdf({ sinceTs });
          if (dl && dl.ok && dl.base64) {
            return { ok: true, base64: dl.base64, filename: dl.filename, size: dl.size || 0, source: "electron_download" };
          }
        } catch (_) {}
      }

      await sleep(650);
    }

    return {
      ok: false,
      message: "استغرق خادم الوزارة وقتاً طويلاً لتجهيز ملف الـ PDF أو تم حفظه مباشرة في التنزيلات. يمكنك اختياره من زر الاستيراد اليدوي."
    };
  }

  function neprasBase64ToUint8Array(base64) {
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    return bytes;
  }

  // ===== استوديو بطاقات وكارنيهات الطلاب =====
  const btnOpenStudentCardsWithData = document.getElementById("btn-open-student-cards-with-data");
  const btnOpenStudentCardsStudio = document.getElementById("btn-open-student-cards-studio");

  async function openStudentCards(autoDownloadPdf = false) {
    if (autoDownloadPdf) {
      showNeprasPopupNotice("جاري فتح لوحة الوزارة وسحب «كشف بيانات الدخول للطلاب لمنصة التدريب» تلقائياً...", "info", "استوديو البطاقات");
      const dlRes = await neprasAutoDownloadMinistryPdf({
        targetUrl: "https://student.emis.gov.eg/dashboard",
        routeMatch: "/dashboard",
        selector: ".actionsHomeBtns a, a",
        textMatch: "كشف بيانات الدخول"
      });

      if (dlRes && dlRes.ok && dlRes.base64) {
        const pdfPayload = { base64: dlRes.base64, ts: Date.now() };
        try {
          await chrome.storage.local.set({ neprasTrainingCardsPdf: pdfPayload });
          localStorage.setItem("neprasTrainingCardsPdf", JSON.stringify(pdfPayload));
        } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
        showNeprasPopupNotice("تم سحب كشف منصة التدريب (PDF) بنجاح! جاري فتح الاستوديو وعرض البطاقات...", "success", "استوديو البطاقات");
      } else {
        // في حال تعذر السحب المباشر، نتحقق إن كانت هناك بيانات محفوظة مسبقاً
        let baseList = [];
        let schoolInfo = null;
        try {
          const stored = await chrome.storage.local.get(["neprasCachedStudentsList", "neprasSchoolStatsV1"]);
          baseList = Array.isArray(stored?.neprasCachedStudentsList) && stored.neprasCachedStudentsList.length
            ? stored.neprasCachedStudentsList
            : (stored?.neprasSchoolStatsV1?.detailRows || []);
          schoolInfo = stored?.neprasSchoolStatsV1?.meta || null;
        } catch (_) {}
        if (baseList.length) {
          const payload = { students: baseList, schoolInfo: schoolInfo || { schoolName: "المدرسة" }, timestamp: Date.now() };
          try {
            await chrome.storage.local.set({ neprasStudentCardsPayload: payload });
            localStorage.setItem("neprasStudentCardsPayload", JSON.stringify(payload));
          } catch (_) {}
        }
        showNeprasPopupNotice(
          (dlRes?.message || "تعذر سحب ملف الـ PDF تلقائياً.") + " تم فتح الاستوديو ويمكنك رفع ملف הـ PDF يدوياً إن لزم.",
          "warning",
          "تنبيه استوديو البطاقات"
        );
      }
    }

    const cardsUrl = (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL)
      ? chrome.runtime.getURL("student-cards.html")
      : "student-cards.html";

    if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.create) {
      chrome.tabs.create({ url: cardsUrl });
    } else {
      window.open(cardsUrl, "_blank");
    }
  }

  btnOpenStudentCardsWithData?.addEventListener("click", () => {
    const run = () => openStudentCards(true);
    window.withButtonBusy ? window.withButtonBusy(btnOpenStudentCardsWithData, run) : run();
  });
  btnOpenStudentCardsStudio?.addEventListener("click", () => openStudentCards(false));



  // ===== دفاتر الفصول (1.2.92): بطاقة الإعدادات هنا، والمحرّك داخل صفحة الموقع (modules/class_books.js ثم runClassBooksExport) =====
  const CB_KEY = "neprasClassBooksSettings";
  const CB_WEEKDAYS = ["الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت", "الأحد"]; // مطابقة لقائمة القوالب (يفحصها tests/test_class_books_runner.js)
  const cbCard = document.querySelector('[data-section="class-books"]');
  const btnClassBooks = document.getElementById("btn-class-books");
  const cbNote = document.getElementById("cb-note");
  const cbRows = () => Array.from(document.querySelectorAll("#cb-jobs .cb-job"));
  const cbField = (id) => document.getElementById(id);
  const cbText = (id) => String(cbField(id)?.value ?? "").trim();
  const CB_TEXT_IDS = ["cb-year", "cb-deputy", "cb-director", "cb-alert", "cb-art-term", "cb-off1", "cb-off2", "cb-art-m1", "cb-art-m2", "cb-art-m3", "cb-art-e1", "cb-art-e2"];

  // لقطة الحالة كما هي في الحقول (تُحفظ وتُستعاد حرفيًا)
  function cbSnapshot() {
    const jobs = {};
    for (const row of cbRows()) jobs[row.dataset.job] = { enabled: row.querySelector('input[type="checkbox"]').checked, grades: row.querySelector(".cb-grades").value };
    const fields = {};
    for (const id of CB_TEXT_IDS) fields[id] = cbText(id);
    const sortMode = cbField("cb-sort-mode")?.value || (cbField("cb-sort")?.checked ? "alpha" : "gender_boys");
    return {
      jobs,
      fields,
      sortMode,
      sortNames: sortMode !== "site",
      trial: !!cbField("cb-trial")?.checked
    };
  }

  function cbParseGrades(text) {
    const digits = NeprasEgypt.toLatinDigits(text || ""); // المحوّل المشترك (modules/egypt_ids.js)
    const list = [...new Set((digits.match(/[1-6]/g) || []).map(Number))].sort((a, b) => a - b);
    return list.length ? list : undefined; // فارغ = كل الصفوف
  }

  // اللقطة ← الرسالة المرسلة إلى الصفحة (ما يفهمه runClassBooksExport)
  function cbToSettings(snap) {
    const f = snap.fields;
    const jobs = {};
    for (const [id, j] of Object.entries(snap.jobs)) jobs[id] = { enabled: !!j.enabled, grades: cbParseGrades(j.grades) };
    const sortMode = snap.sortMode || (snap.sortNames ? "alpha" : "gender_boys");
    return {
      jobs,
      sortNames: snap.sortNames,
      sortMode,
      trial: snap.trial,
      yearText: f["cb-year"], deputyName: f["cb-deputy"], directorName: f["cb-director"], alertDays: parseInt(f["cb-alert"], 10) || 0,
      weeklyOff1: f["cb-off1"], weeklyOff2: f["cb-off2"], artTerm: f["cb-art-term"],
      artMonths: [f["cb-art-m1"], f["cb-art-m2"], f["cb-art-m3"]], artExamMonths: [f["cb-art-e1"], f["cb-art-e2"]]
    };
  }

  function cbApply(saved) {
    if (!saved || typeof saved !== "object") return;
    for (const row of cbRows()) {
      const j = saved.jobs?.[row.dataset.job];
      if (!j) continue;
      row.querySelector('input[type="checkbox"]').checked = !!j.enabled;
      row.querySelector(".cb-grades").value = String(j.grades || "");
    }
    for (const id of CB_TEXT_IDS) {
      const el = cbField(id);
      if (el && saved.fields && typeof saved.fields[id] === "string") el.value = saved.fields[id];
    }
    if (cbField("cb-sort-mode")) {
      cbField("cb-sort-mode").value = saved.sortMode || (saved.sortNames ? "alpha" : "gender_boys");
    }
    if (cbField("cb-sort")) {
      cbField("cb-sort").checked = saved.sortMode ? (saved.sortMode !== "site") : !!saved.sortNames;
    }
    if (cbField("cb-trial")) cbField("cb-trial").checked = !!saved.trial;
  }

  function cbSave() { try { chrome.storage.local.set({ [CB_KEY]: cbSnapshot() }); } catch (err) { console.warn("[Nepras Handled]", err?.message || err); } }

  // الأنواع التي تناسب المرحلة المختارة فقط تظهر؛ ورياض الأطفال بلا دفاتر
  function cbRefreshStage() {
    const stage = stageSelect?.value || "";
    for (const row of cbRows()) row.hidden = !!stage && !row.dataset.stages.split(" ").includes(stage);
    if (!cbNote) return;
    cbNote.hidden = !(stage === "KG" || !stage);
    cbNote.textContent = stage === "KG" ? "دفاتر الفصول غير متاحة لمرحلة رياض الأطفال." : "اختر المرحلة الدراسية من الأعلى ليظهر ما يناسبها من الدفاتر.";
  }

  if (cbCard) {
    for (const id of ["cb-off1", "cb-off2"]) {
      const sel = cbField(id);
      if (!sel) continue;
      const first = document.createElement("option");
      first.value = ""; first.textContent = "كما في القالب";
      sel.appendChild(first);
      for (const d of CB_WEEKDAYS) { const o = document.createElement("option"); o.value = d; o.textContent = d; sel.appendChild(o); }
    }
    cbCard.addEventListener("change", cbSave);
    stageSelect?.addEventListener("change", cbRefreshStage);
    cbRefreshStage();
    chrome.storage.local.get(CB_KEY).then((d) => cbApply(d?.[CB_KEY])).catch(() => {}).then(() => loadSavedStage()).then(cbRefreshStage).catch(() => {});
  }

  // ===== قوالب دفاتر الفصول (1.2.93): تنزيل القالب للتعديل، رفع قالبك بدل المضمّن، واستعادة المضمّن =====
  // قالب المستخدم يُحفظ في IndexedDB بأصل الإضافة (modules/class_books_store.js) لأن حجمه ميغابايتات؛ والخلفية هي التي تقرؤه عند الإنشاء.
  // رفعه يمرّ على NeprasClassBooks.checkTemplateUpload: نوع الدفتر الصحيح، خلايا الأسماء والترويسة، وبناء دفتر تجريبي منه فعلًا.
  const cbTplList = document.getElementById("cb-tpl-list");
  const CB_TPL_FOLDER = "قوالب دفاتر الفصول";
  const cbTplReady = () => !!(window.NeprasClassBooks && window.NeprasCbTemplateStore);

  function cbTplNode(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
  }

  function cbTplShortName(name) {
    const text = String(name || "");
    return text.length > 24 ? text.slice(0, 21) + "…" : text;
  }

  function cbTplSetBusy(row, busy, label) {
    row.querySelectorAll("button, input").forEach((el) => { el.disabled = !!busy; });
    row.classList.toggle("is-busy", !!busy);
    const badge = row.querySelector(".cb-tpl-badge");
    if (badge && label) badge.textContent = label;
  }

  async function cbTplDownload(key) {
    const CB = window.NeprasClassBooks;
    const spec = CB.BUNDLED_TEMPLATES[key];
    let bytes, name, mime = "application/octet-stream";
    const mine = await window.NeprasCbTemplateStore.get(key).catch(() => null);
    if (mine) {
      bytes = mine.bytes; name = mine.name;
    } else {
      const res = await fetch(chrome.runtime.getURL(spec.file));
      if (!res.ok) throw new Error("تعذّر فتح القالب المضمّن");
      const copy = await CB.editableCopy(new Uint8Array(await res.arrayBuffer()), spec.label);
      bytes = copy.bytes; name = `${spec.label}.${copy.ext}`; mime = copy.mime;
    }
    await window.neprasDialog.triggerDownload(new Blob([bytes], { type: mime }), name, { folder: CB_TPL_FOLDER, registerSuccess: false });
    NeprasUI.toast({
      kind: "success", id: "cb-tpl-dl", title: "تم تنزيل القالب",
      message: `في التنزيلات داخل Nepras/${CB_TPL_FOLDER}. افتحه في Excel وعدّله واحفظه، ثم ارفعه من «رفع قالبك».`
    });
  }

  async function cbTplUpload(key, file) {
    const CB = window.NeprasClassBooks;
    if (!/\.(xlsx|xlsm|xltx|xltm)$/i.test(file.name)) {
      NeprasUI.toast({ kind: "error", id: "cb-tpl-err", title: "تعذّر اعتماد القالب", message: "الملف ليس مصنف Excel. احفظ قالبك بصيغة xlsx أو xlsm أو xltm ثم أعد الرفع." });
      return;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = await CB.checkTemplateUpload(bytes, key, file.name);
    if (!result.ok) {
      NeprasUI.toast({ kind: "error", id: "cb-tpl-err", title: "تعذّر اعتماد القالب", message: result.errors.join(" ") });
      return;
    }
    await window.NeprasCbTemplateStore.put(key, file.name, bytes);
    NeprasUI.toast(result.warnings.length
      ? { kind: "warning", id: "cb-tpl-ok", title: "اعتُمد القالب مع تنبيه", message: result.warnings.join(" ") }
      : { kind: "success", id: "cb-tpl-ok", title: "اعتُمد قالبك", message: `ستُنشأ دفاتر هذا النوع من «${cbTplShortName(file.name)}».` });
  }

  async function cbRenderTemplates() {
    if (!cbTplList) return;
    if (!cbTplReady()) { document.getElementById("cb-tpl-box")?.setAttribute("hidden", ""); return; }
    const CB = window.NeprasClassBooks;
    let mine = {};
    try { mine = await window.NeprasCbTemplateStore.list(); } catch (_) { /* المخزن غير متاح: تبقى القوالب المضمّنة */ }
    const rows = [];
    for (const [key, spec] of Object.entries(CB.BUNDLED_TEMPLATES)) {
      const custom = mine[key];
      const row = cbTplNode("div", "cb-tpl-row");
      row.dataset.key = key;
      const head = cbTplNode("div", "cb-tpl-head");
      head.appendChild(cbTplNode("span", "cb-tpl-name", spec.label));
      head.appendChild(cbTplNode("span", "cb-tpl-badge" + (custom ? " is-custom" : ""), custom ? `قالبك: ${cbTplShortName(custom.name)}` : "المضمّن"));
      const actions = cbTplNode("div", "cb-tpl-actions");
      const dl = cbTplNode("button", "n-btn n-btn--secondary n-btn--sm", custom ? "تنزيل قالبك" : "تنزيل للتعديل");
      dl.type = "button";
      // زر حقيقي يفتح منتقي الملفات (لا label: قواعد حقول البطاقات القديمة تغيّر خط الـ label وتفسد مظهر الزر)
      const up = cbTplNode("button", "n-btn n-btn--secondary n-btn--sm", "رفع قالبك");
      up.type = "button";
      const input = document.createElement("input");
      input.type = "file"; input.hidden = true; input.accept = ".xlsx,.xlsm,.xltx,.xltm";
      up.addEventListener("click", () => input.click());
      actions.append(dl, up, input);

      const guard = async (label, work) => {
        cbTplSetBusy(row, true, label);
        try { await work(); } catch (err) {
          NeprasUI.toast({ kind: "error", id: "cb-tpl-err", title: "تعذّرت العملية", message: String((err && err.message) || err) });
        } finally { cbRenderTemplates(); }
      };
      dl.addEventListener("click", () => guard("جارٍ التجهيز...", () => cbTplDownload(key)));
      input.addEventListener("change", () => {
        const file = input.files && input.files[0];
        input.value = "";
        if (file) guard("جارٍ فحص القالب...", () => cbTplUpload(key, file));
      });
      if (custom) {
        const restore = cbTplNode("button", "n-btn n-btn--ghost n-btn--sm", "استعادة المضمّن");
        restore.type = "button";
        restore.addEventListener("click", () => guard("جارٍ الاستعادة...", async () => {
          await window.NeprasCbTemplateStore.remove(key);
          NeprasUI.toast({ kind: "info", id: "cb-tpl-ok", title: "عاد القالب المضمّن", message: spec.label });
        }));
        actions.appendChild(restore);
      }
      row.append(head, actions);
      rows.push(row);
    }
    cbTplList.replaceChildren(...rows);
  }
  cbRenderTemplates();

  btnClassBooks?.addEventListener("click", () => {
    const stage = stageSelect?.value || "";
    if (!stage) { NeprasUI.field.error(stageSelect, NeprasUI.msg("stage_required").title); return; }
    if (stage === "KG") { NeprasUI.toast({ kind: "info", title: "غير متاح لرياض الأطفال", message: "دفاتر الفصول للمراحل الابتدائية والإعدادية والثانوية.", id: "cb-kg" }); return; }
    const snap = cbSnapshot();
    if (!cbRows().some((row) => !row.hidden && snap.jobs[row.dataset.job]?.enabled)) {
      NeprasUI.toast({ kind: "warning", title: "لم تختر نوع دفتر", message: "فعّل نوعًا واحدًا على الأقل من القائمة.", id: "cb-none" });
      return;
    }
    cbSave();
    const run = () => runRecordsAction("NEPRAS_RECORDS_CLASSBOOKS", { settings: cbToSettings(snap) });
    window.withButtonBusy ? window.withButtonBusy(btnClassBooks, run) : run();
  });

  btnRecordsDownloadAnyTable?.addEventListener("click", async () => {
    async function doDownload() {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const activeTab = tabs[0];
      if (!activeTab?.id) {
        NeprasUI.toast({ kind: "warning", title: "لا يوجد تبويب نشط", message: "افتح صفحة الوزارة التي يظهر بها الجدول أولاً." });
        return;
      }
      try {
        const res = await chrome.tabs.sendMessage(activeTab.id, { action: "NEPRAS_RECORDS_DOWNLOAD_ANY_TABLE" });
        if (res && res.ok) {
          NeprasUI.toast({ kind: "success", title: "تم تنزيل الجدول بنجاح", message: res.filename || "تم إنشاء الملف وتنزيله في مجلد التحميلات." });
        } else {
          NeprasUI.toast({ kind: "warning", title: "تنبيه", message: res?.error || "لم يتم العثور على جداول صالحة للتنزيل في هذه الصفحة." });
        }
      } catch (err) {
        NeprasUI.toast({ kind: "error", title: "تعذر التنزيل", message: "تأكد من فتح صفحة موقع الوزارة واكتمال تحميلها." });
      }
    }
    window.withButtonBusy ? window.withButtonBusy(btnRecordsDownloadAnyTable, doDownload) : doDownload();
  });

  // فحص ملف القالب قبل حفظه. XLSX.read يقبل أي نص كأنه CSV فينجح مع ملف ليس مصنفًا، فلا تكفي قراءته وحدها؛ نتحقق أيضًا من:
  // الامتداد، وتوقيع ZIP (xlsx وxlsm وxltx وxltm كلها ZIP)، والحجم (القالب يُحفظ نصًّا base64 في chrome.storage.local ومساحته محدودة).
  // يرمي خطأً برسالة عربية للمستخدم، ويعيد المصنف المقروء.
  const TEMPLATE_MAX_BYTES = 2 * 1024 * 1024;
  function checkTemplateFile(fileName, buffer, xlsxLib) {
    if (!/\.(xlsx|xlsm|xltx|xltm)$/i.test(String(fileName || ''))) {
      throw new Error('الملف ليس مصنف Excel. احفظ قالبك بصيغة xlsx ثم أعد الرفع.');
    }
    const bytes = new Uint8Array(buffer);
    if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4B || bytes[2] !== 0x03 || bytes[3] !== 0x04) {
      throw new Error('محتوى الملف ليس مصنف Excel صالحًا (تالف أو بصيغة أخرى بامتداد xlsx).');
    }
    if (bytes.length > TEMPLATE_MAX_BYTES) {
      throw new Error(`حجم القالب ${(bytes.length / 1048576).toFixed(1)} ميغابايت والحد ${TEMPLATE_MAX_BYTES / 1048576} ميغابايت. صغّر الصور داخله (مثل الشعار) ثم أعد الرفع.`);
    }
    let wb;
    try {
      wb = xlsxLib.read(buffer, { type: 'array' });
    } catch (_) {
      throw new Error('تعذر قراءة الملف كمصنف Excel (قد يكون تالفًا).');
    }
    if (!wb.SheetNames || !wb.SheetNames.length) throw new Error('الملف لا يحتوي على أوراق صالحة');
    return wb;
  }

  // إدارة قوالب السجلات المدرسية (Template Manager) في النافذة المنبثقة
  const btnTogglePopupTpl = document.getElementById("btn-toggle-popup-tpl");
  const popupTplContainer = document.getElementById("popup-tpl-container");
  const popupTplList = document.getElementById("popup-tpl-list");

  const POPUP_TEMPLATES = [
    { key: "behavior", name: "سجل 5 سلوك ومواظبة" },
    { key: "anemia", name: "كشوف فحص مبادرة 100 مليون صحة" },
    { key: "grades", name: "سجل الدرجات والتقييمات الأسبوعية" },
    { key: "absence", name: "سجل الغياب الأسبوعي للفصل" },
    { key: "summary", name: "سجل أعمال السنة المجمع" },
    { key: "twocol", name: "قوائم الفصول (نظام العمودين)" },
    { key: "newcomers_41", name: "كشف 41 مستجدين" },
    { key: "enrollment", name: "سجل القيد الشامل للمدرسة" }
  ];

  async function renderPopupTemplateList() {
    if (!popupTplList) return;
    const stored = await chrome.storage.local.get(POPUP_TEMPLATES.map(t => `nepras_tpl_${t.key}`));
    popupTplList.innerHTML = POPUP_TEMPLATES.map(t => {
      const custom = stored[`nepras_tpl_${t.key}`];
      const isCustom = custom && custom.name;
      return `
        <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:6px;padding:6px 8px;display:flex;flex-direction:column;gap:5px;">
          <div style="display:flex;align-items:center;justify-content:space-between;font-size:11.5px;font-weight:700;color:#1e293b;">
            <span>${escapeHtml(t.name)}</span>
            <span style="font-size:10px;padding:1px 5px;border-radius:4px;background:${isCustom ? '#dcfce7' : '#f1f5f9'};color:${isCustom ? '#15803d' : '#64748b'};border:${isCustom ? '1px solid #86efac' : 'none'};">
              ${isCustom ? `✓ مخصص (${escapeHtml(custom.name.slice(0, 12))})` : 'افتراضي'}
            </span>
          </div>
          <div style="display:flex;gap:4px;">
            <button class="n-btn n-btn--secondary n-btn--sm btn-popup-tpl-dl" data-key="${escapeHtml(t.key)}" type="button" style="flex:1;font-size:10.5px;padding:4px 6px;">📥 تنزيل النموذج</button>
            <label class="n-btn n-btn--secondary n-btn--sm" style="flex:1;font-size:10.5px;padding:4px 6px;cursor:pointer;text-align:center;display:flex;align-items:center;justify-content:center;">
              📤 رفع قالبك
              <input type="file" accept=".xlsx,.xlsm,.xltx,.xltm" data-key="${escapeHtml(t.key)}" class="popup-tpl-input" style="display:none;">
            </label>
            ${isCustom ? `<button class="n-btn n-btn--ghost n-btn--sm btn-popup-tpl-rst" data-key="${escapeHtml(t.key)}" type="button" style="padding:4px 6px;color:#dc2626;" title="استعادة الافتراضي">🔄</button>` : ''}
          </div>
        </div>
      `;
    }).join('');

    // Download handlers
    popupTplList.querySelectorAll('.btn-popup-tpl-dl').forEach(btn => {
      btn.addEventListener('click', async () => {
        const key = btn.getAttribute('data-key');
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const activeTab = tabs[0];
        if (activeTab?.id) {
          try {
            await chrome.tabs.sendMessage(activeTab.id, { action: 'NEPRAS_RECORDS_DOWNLOAD_TEMPLATE', templateKey: key });
            NeprasUI.toast({ kind: "success", title: "تم التنزيل", message: "تم تنزيل النموذج في مجلد Downloads/Nepras/قوالب_السجلات/" });
            return;
          } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
        }
        runRecordsAction('NEPRAS_RECORDS_DOWNLOAD_TEMPLATE', { templateKey: key });
      });
    });

    // Upload handlers
    popupTplList.querySelectorAll('.popup-tpl-input').forEach(input => {
      input.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        const key = input.getAttribute('data-key');
        if (!file || !key) return;

        const reader = new FileReader();
        reader.onload = async (ev) => {
          try {
            const buffer = ev.target.result;
            checkTemplateFile(file.name, buffer, window.XLSX);

            let binary = '';
            const bytes = new Uint8Array(buffer);
            for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
            const base64 = btoa(binary);

            try {
              await chrome.storage.local.set({
                [`nepras_tpl_${key}`]: { name: file.name, size: file.size, updatedAt: Date.now(), base64 }
              });
            } catch (storageErr) {
              if (/quota/i.test(String(storageErr && storageErr.message))) {
                throw new Error('مساحة تخزين الإضافة لا تكفي لهذا القالب. استعد الافتراضي في قالب آخر أو صغّر صور هذا القالب.');
              }
              throw storageErr;
            }
            NeprasUI.toast({ kind: "success", title: "تم اعتماد القالب بنجاح", message: `تم حفظ قالب ${file.name}` });
            renderPopupTemplateList();
          } catch (err) {
            NeprasUI.toast({ kind: "error", title: "خطأ في الملف", message: err.message });
          }
        };
        reader.readAsArrayBuffer(file);
        input.value = '';
      });
    });

    // Reset handlers
    popupTplList.querySelectorAll('.btn-popup-tpl-rst').forEach(btn => {
      btn.addEventListener('click', async () => {
        const key = btn.getAttribute('data-key');
        await chrome.storage.local.remove([`nepras_tpl_${key}`]);
        NeprasUI.toast({ kind: "info", title: "تم استعادة القالب الافتراضي" });
        renderPopupTemplateList();
      });
    });
  }

  btnTogglePopupTpl?.addEventListener('click', () => {
    const isHidden = popupTplContainer.style.display === 'none';
    popupTplContainer.style.display = isHidden ? 'flex' : 'none';
    if (isHidden) renderPopupTemplateList();
  });

  // فاحص الرقم القومي والسن في 1 أكتوبر
  // التحليل من modules/egypt_ids.js (مصدر واحد: يتحقق أن تاريخ الميلاد حقيقي ويقبل الأرقام الهندية).
  // السن في 1 أكتوبر هنا للعام الدراسي الجاري (يبدأ من أغسطس): NeprasEgypt.academicYearStart.
  function parseNidDetails(nid) {
    const p = NeprasEgypt.parseNationalId(nid);
    if (!p) return null;
    const age = NeprasEgypt.ageOnOct1(p.birthDate, NeprasEgypt.academicYearStart());
    return {
      nationalId: p.nationalId,
      birthDate: p.birthDateStr,
      governorate: NeprasEgypt.GOVERNORATES[p.nationalId.substring(7, 9)] || 'محافظة غير محددة',
      gender: p.gender,
      ageOnOct1: age.text
    };
  }

  function evaluateNidInPopup() {
    if (!inputRecordsNid || !nidResultEl) return;
    const val = inputRecordsNid.value.trim();
    if (!val) {
      nidResultEl.innerHTML = '<span style="color:var(--n-danger,#ef4444);">يرجى إدخال الرقم القومي المكون من 14 رقماً.</span>';
      nidResultEl.hidden = false;
      return;
    }
    const info = parseNidDetails(val);
    if (!info) {
      nidResultEl.innerHTML = '<span style="color:var(--n-danger,#ef4444);font-weight:bold;">الرقم القومي غير صحيح أو غير مطابق للمواصفات المصرية.</span>';
      nidResultEl.hidden = false;
      return;
    }
    nidResultEl.innerHTML = `
      <div style="font-weight:bold;color:var(--n-primary,#1e3a8a);margin-bottom:4px;">بيانات الرقم القومي المفحوص:</div>
      <div>• <b>تاريخ الميلاد:</b> ${escapeHtml(info.birthDate)}</div>
      <div>• <b>المحافظة:</b> ${escapeHtml(info.governorate)}</div>
      <div>• <b>النوع:</b> ${escapeHtml(info.gender)}</div>
      <div>• <b>السن في 1 أكتوبر:</b> <span style="color:#059669;font-weight:bold;">${escapeHtml(info.ageOnOct1)}</span></div>
    `;
    nidResultEl.hidden = false;
  }

  btnRecordsNidCheck?.addEventListener("click", evaluateNidInPopup);
  inputRecordsNid?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") evaluateNidInPopup();
  });

  // زر «إيقاف العملية الجارية» يظهر فقط أثناء تشغيل عملية: مؤشراتها في التخزين (أوامر معلّقة، قفل الإحصاء،
  // حالة سحب العاملين) أو زر مشغول في هذه النافذة. إن لم تُرَ أي عملية يختفي الزر بدل أن يبقى أحمر دائمًا.
  // شبكة أمان: «إيقاف كل العمليات» موجود دائمًا في قسم الإعدادات، والبطاقة داخل صفحة الوزارة فيها إيقاف خاص بها.
  const ACTIVE_LOCAL_KEYS = ["pendingTeacherTask", "pendingExportTask", "exportTask", "pendingClassReportTask", "neprasStaffApiRunState_v13", "nf_running", "records_running"];
  const STATS_LOCK_KEY = "neprasSchoolStatsRunLockV161";
  const STATS_LOCK_TTL_MS = 120000;

  async function hasActiveWork() {
    if (document.querySelector(".n-btn.is-loading")) return true;
    try {
      const local = await chrome.storage.local.get(ACTIVE_LOCAL_KEYS);
      if (ACTIVE_LOCAL_KEYS.some((k) => local[k] && local[k].stopRequested !== true)) return true;
      const sess = await chrome.storage.session.get(STATS_LOCK_KEY);
      const lock = sess?.[STATS_LOCK_KEY];
      if (lock?.token && Date.now() - Number(lock.startedAt || 0) < STATS_LOCK_TTL_MS) return true;
    } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
    return false;
  }

  async function syncStopVisibility() {
    if (!btnStopActive || btnStopActive.classList.contains("is-loading")) return;
    btnStopActive.hidden = !(await hasActiveWork());
  }

  async function stopAllWork(button) {
    NeprasButtons.busy(button, true, "جارٍ الإيقاف…");
    let msg;
    try {
      const result = await chrome.runtime.sendMessage({ action: "NEPRAS_STOP_ALL_WORK" });
      msg = result?.ok
        ? { kind: "success", title: "تم إيقاف العمليات", message: "أُوقفت العمليات الجارية ونُظّفت الحالة المعلّقة." }
        : { kind: "info", title: "لا توجد عملية جارية", message: "لا شيء لإيقافه الآن." };
    } catch (_) {
      msg = { kind: "error", title: "تعذر إيقاف العمليات", message: "أعد فتح النافذة ثم حاول مرة أخرى." };
    }
    NeprasButtons.busy(button, false);
    NeprasUI.toast(msg);
    syncStopVisibility();
  }

  btnStopActive?.addEventListener("click", () => stopAllWork(btnStopActive));
  document.getElementById("btn-stop-all-settings")?.addEventListener("click", (e) => stopAllWork(e.currentTarget));
  document.addEventListener("nepras:busy", () => syncStopVisibility());
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && ACTIVE_LOCAL_KEYS.some((k) => k in changes)) syncStopVisibility();
    });
    chrome.storage.session.onChanged?.addListener((changes) => { if (STATS_LOCK_KEY in changes) syncStopVisibility(); });
  } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
  syncStopVisibility();

  chrome.runtime.onMessage.addListener((request) => {
    if (!request || typeof request !== "object") return;

    if (request.action === "NEPRAS_FILE_GENERATED" && request.payload?.fileName) {
      showNeprasPopupNotice(
        request.payload.message || `تم حفظ الملف بنجاح.\n${request.payload.fileName}`,
        "success",
        request.payload.title || "تم إنشاء الملف بنجاح",
        { fileInfo: request.payload }
      );
      return;
    }

    if (request.action === "NEPRAS_USER_NOTICE" && request.payload) {
      showNeprasPopupNotice(
        request.payload.message || "",
        request.payload.type || "info",
        request.payload.title || "تنبيه"
      );
      return;
    }

    if (request.action === "EXPENSES_ANALYSIS_FINISHED" && request.result) {
      showNeprasPopupNotice(
        `تم تحليل بيانات المصروفات والإعفاءات بنجاح.
المسددون: ${Number(request.result.paid || 0)}
المطلوب منهم السداد: ${Number(request.result.due || 0)}`,
        "success",
        "اكتمل تحليل المصروفات"
      );
      return;
    }

    if (request.action === "SCHOOL_STATS_FINISHED" && request.result) {
      const stats = request.result;
      if (stats) {
        renderSchoolStats(stats);
        if (Array.isArray(stats.detailRows) && stats.detailRows.length) {
          window.neprasCachedStudentsList = stats.detailRows;
        }
      }
      const total = Number(request.result.totalStudents || request.result.total || 0);
      showNeprasPopupNotice(
        `تم تحديث إحصاء المدرسة بنجاح.
إجمالي الطلاب: ${total}`,
        "success",
        "اكتمل تحديث الإحصاء"
      );
      return;
    }

    if (request.action === "NEPRAS_ADD_STUDENT_PROGRESS") {
      const summaryEl = document.getElementById("add-student-summary");
      if (summaryEl) {
        summaryEl.hidden = false;
        const isErr = request.status === "error";
        const badgeColor = isErr ? "#dc2626" : "#16a34a";
        const bg = isErr ? "#fef2f2" : "#f0fdf4";
        const border = isErr ? "#fecaca" : "#bbf7d0";
        summaryEl.innerHTML = `
          <div style="background:${/* html-safe */ bg}; border:1px solid ${/* html-safe */ border}; border-radius:6px; padding:8px 10px; margin-top:6px; font-size:12px; line-height:1.6;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
              <strong style="color:${/* html-safe */ badgeColor};">جارٍ الحفظ والتأكيد (${/* html-safe */ Number(request.current || 0)} من ${/* html-safe */ Number(request.total || 0)})</strong>
              <span style="font-family:monospace; font-size:11px; background:#fff; padding:1px 6px; border-radius:4px; border:1px solid ${/* html-safe */ border};">${escapeHtml(request.nationalId || '')}</span>
            </div>
            <div style="color:#1e293b; font-weight:600;">${escapeHtml(request.name || 'طالب جديد')}</div>
            <div style="color:${/* html-safe */ badgeColor}; font-size:11px; margin-top:2px;">${escapeHtml(request.message || '')}</div>
          </div>
        `;
      }
    }

    if (request.action === "NEPRAS_EXEMPTION_PROGRESS") {
      const pWrap = document.getElementById("exemption-progress-wrap");
      const pBar = document.getElementById("exemption-progress-bar");
      const pText = document.getElementById("exemption-progress-text");
      if (pWrap && pBar && pText) {
        pWrap.hidden = false;
        const cur = Number(request.current || 0);
        const tot = Number(request.total || 1);
        const pct = Math.round((cur / tot) * 100);
        pBar.style.width = pct + "%";
        pText.textContent = `${cur} من ${tot} (${pct}%) — كود: ${request.code || ""}`;
      }
    }

    if (request.action === "NEPRAS_EXEMPTION_LOG") {
      const statusEl = document.getElementById("exemption-status");
      if (statusEl) {
        statusEl.hidden = false;
        const color = request.logType === "error" ? "#dc2626" : (request.logType === "success" ? "#16a34a" : "#2563eb");
        statusEl.innerHTML = `<span style="color:${/* html-safe */ color}; font-weight:600;">● ${escapeHtml(request.message || "")}</span>`;
      }
    }

    if (request.action === "NEPRAS_QUICK_EDITS_PROGRESS") {
      const pWrap = document.getElementById("quick-edits-progress-wrap");
      const pBar = document.getElementById("quick-edits-progress-bar");
      const pText = document.getElementById("quick-edits-progress-text");
      if (pWrap && pBar && pText) {
        pWrap.hidden = false;
        if (request.classIndex && request.totalClasses) {
          const cCur = Number(request.classIndex);
          const cTot = Number(request.totalClasses);
          const pct = Math.round((cCur / cTot) * 100);
          pBar.style.width = pct + "%";
          pText.textContent = `${request.currentClass || `فصل ${cCur}`} (${cCur} من ${cTot}) — تم تعديل ${request.totalUpdated || 0} طالب`;
        } else {
          const cur = Number(request.current || 0);
          const tot = Number(request.total || 1);
          const pct = Math.round((cur / tot) * 100);
          pBar.style.width = pct + "%";
          pText.textContent = `${cur} من ${tot} (${pct}%) — كود: ${request.code || ""}`;
        }
      }
    }
  });

  function neprasInitEnhancedTools() {
    // تفعيل النسخ والتحديد
    const btnCopyEnabler = document.getElementById("btn-copy-enabler");
    if (btnCopyEnabler) {
      btnCopyEnabler.addEventListener("click", async () => {
        try {
          const res = await chrome.runtime.sendMessage({ action: "NEPRAS_ENABLE_COPY" });
          if (res && res.ok) {
            showNeprasPopupNotice("تم تفعيل النسخ والتحديد وتجاوز قيود الصفحة بنجاح.", "success", "تفعيل النسخ");
          } else {
            showNeprasPopupNotice(res?.message || "تعذر تفعيل النسخ على هذه الصفحة.", "warning", "تفعيل النسخ");
          }
        } catch (err) {
          showNeprasPopupNotice(err?.message || String(err), "error", "خطأ");
        }
      });
    }

    // تابلت المدرسي
    const ADD_STUDENT_URL = "https://student.emis.gov.eg/student/add";
    const TABLET_URL = "https://student.emis.gov.eg/student/tablet";

    const btnOpenTabletPage = document.getElementById("btn-open-tablet-page");
    if (btnOpenTabletPage) {
      btnOpenTabletPage.addEventListener("click", async () => {
        await navigateAndRun({
          targetUrl: TABLET_URL,
          siteHost: "student.emis.gov.eg"
        });
      });
    }

    const btnTabletExport = document.getElementById("btn-tablet-export-current");
    const btnTabletTemplate = document.getElementById("btn-tablet-template");
    const tabletFileInput = document.getElementById("tablet-file-input");
    const tabletFileName = document.getElementById("tablet-file-name");
    const tabletSummary = document.getElementById("tablet-summary");
    const btnTabletStart = document.getElementById("btn-tablet-start");
    let parsedTabletPlan = null;

    if (btnTabletTemplate) {
      btnTabletTemplate.addEventListener("click", async () => {
        const wb = window.NeprasTablet?.buildTemplateWorkbook
          ? window.NeprasTablet.buildTemplateWorkbook(typeof XLSX !== "undefined" ? XLSX : null)
          : null;
        if (!wb) {
          showNeprasPopupNotice("تعذر بناء نموذج التابلت: وحدة التابلت غير متوفرة.", "error", "خطأ");
          return;
        }
        await neprasUnifiedDownloadXlsx(wb, "نموذج_تسجيل_التابلت_المدرسي.xlsx", "التابلت_المدرسي", "تم تنزيل نموذج تسجيل التابلت المدرسي بنجاح.");
      });
    }

    if (tabletFileInput) {
      tabletFileInput.addEventListener("change", async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (tabletFileName) tabletFileName.textContent = file.name;
        try {
          const buf = await file.arrayBuffer();
          const wb = XLSX.read(buf, { type: "array" });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
          if (window.NeprasTablet) {
            parsedTabletPlan = window.NeprasTablet.parseTabletSheet(matrix);
            if (tabletSummary) {
              tabletSummary.hidden = false;
              tabletSummary.textContent = `تم فحص الملف: ${parsedTabletPlan.stats.valid} جهاز صالح للتسجيل، ${parsedTabletPlan.stats.rejected} مرفوض أو به مشكلة.`;
            }
            if (btnTabletStart) {
              btnTabletStart.removeAttribute("aria-disabled");
              btnTabletStart.removeAttribute("data-reason");
            }
          }
        } catch (err) {
          showNeprasPopupNotice("تعذر قراءة ملف التابلت: " + (err.message || String(err)), "error", "خطأ في الملف");
        }
      });
    }

    async function neprasFindStudentTab(targetRoute = "") {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
      const urlMatches = (url) => {
        const u = String(url || "");
        if (!/^https:\/\/student\.emis\.gov\.eg\//i.test(u) || /\/login(?:[/?#]|$)/i.test(u)) return false;
        if (targetRoute && !u.toLowerCase().includes(targetRoute.toLowerCase())) return false;
        return true;
      };

      if (activeTab?.id && urlMatches(activeTab.url)) {
        return activeTab;
      }
      const tabs = await chrome.tabs.query({}).catch(() => []);
      const found = tabs.find(t => t?.id != null && urlMatches(t.url));
      return found || null;
    }

    async function neprasSendMessageToStudentTab(payload, errorPrefix = "تعذر إرسال الأمر", targetRoute = "", autoNavUrl = "") {
      let tab = await neprasFindStudentTab(targetRoute);
      if (!tab?.id && autoNavUrl) {
        await navigateAndRun({
          targetUrl: autoNavUrl,
          siteHost: "student.emis.gov.eg",
          messages: [payload]
        });
        return { ok: true, navigated: true };
      }
      if (!tab?.id) {
        showNeprasPopupNotice("يرجى فتح صفحة بيانات الطلاب بموقع الوزارة (student.emis.gov.eg) أولاً.", "warning", "تنبيه");
        return null;
      }
      try {
        const res = await chrome.tabs.sendMessage(tab.id, payload);
        return res || { ok: true };
      } catch (err) {
        const msg = String(err?.message || "");
        if (msg.includes("Could not establish connection") || msg.includes("Receiving end does not exist")) {
          showNeprasPopupNotice("فُقد الاتصال بالصفحة بسبب تحديث الإضافة. يرجى تحديث صفحة بيانات الطلاب (F5) في المتصفح مرة واحدة ثم إعادة المحاولة.", "warning", "تنبيه تحديث الصفحة");
          return null;
        }
        showNeprasPopupNotice(`${errorPrefix}: ${err?.message || String(err)}`, "error", "خطأ");
        return null;
      }
    }

    if (btnTabletStart) {
      btnTabletStart.addEventListener("click", async () => {
        if (!parsedTabletPlan || !parsedTabletPlan.rows.length) {
          showNeprasPopupNotice("يرجى اختيار ملف صالح يحتوي على بيانات التابلت أولاً.", "warning", "تنبيه");
          return;
        }
        const res = await neprasSendMessageToStudentTab({
          action: "NEPRAS_START_TABLET_REGISTER",
          plan: parsedTabletPlan.rows
        }, "تعذر إرسال أمر التسجيل", "student/tablet", TABLET_URL);
        if (res) {
          showNeprasPopupNotice("بدأت عملية تسجيل أجهزة التابلت على موقع الوزارة.", "success", "بدء التسجيل");
        }
      });
    }

    if (btnTabletExport) {
      btnTabletExport.addEventListener("click", async () => {
        await neprasSendMessageToStudentTab({ action: "NEPRAS_EXPORT_TABLET_TABLE" }, "تعذر تصدير جدول التابلت", "student/tablet", TABLET_URL);
      });
    }

    // إضافة الطلاب الجدد
    const btnOpenAddStudentPage = document.getElementById("btn-open-add-student-page");
    if (btnOpenAddStudentPage) {
      btnOpenAddStudentPage.addEventListener("click", async () => {
        await navigateAndRun({
          targetUrl: ADD_STUDENT_URL,
          siteHost: "student.emis.gov.eg"
        });
      });
    }

    const btnAddStudentTemplate = document.getElementById("btn-add-student-template");
    const addStudentFileInput = document.getElementById("add-student-file-input");
    const addStudentFileName = document.getElementById("add-student-file-name");
    const addStudentSummary = document.getElementById("add-student-summary");
    const btnAddStudentStart = document.getElementById("btn-add-student-start");
    const btnQuickAddNidStart = document.getElementById("btn-quick-add-nid-start");
    const inputQuickAddNid = document.getElementById("input-quick-add-nid");
    let parsedAddStudentPlan = null;

    if (btnAddStudentTemplate) {
      btnAddStudentTemplate.addEventListener("click", async () => {
        try {
          const resp = await fetch(chrome.runtime.getURL("templates/student_add_template.xlsx"));
          if (!resp.ok) throw new Error("تعذر قراءة ملف النموذج المحدث المنسق.");
          const blob = await resp.blob();
          await neprasUnifiedDownload(blob, "نموذج_بيانات_التلاميذ_محدث.xlsx", "الطلاب_الجدد", "تم تنزيل نموذج إضافة الطلاب الجدد المحدث المنسق بالكامل بنجاح.");
        } catch (err) {
          console.warn("Falling back to runtime workbook builder:", err);
          const wb = window.NeprasAddStudent?.buildTemplateWorkbook
            ? window.NeprasAddStudent.buildTemplateWorkbook(typeof XLSX !== "undefined" ? XLSX : null)
            : null;
          if (!wb) {
            showNeprasPopupNotice("تعذر بناء نموذج الطلاب الجدد: " + (err.message || "خطأ غير متوقع"), "error", "خطأ");
            return;
          }
          await neprasUnifiedDownloadXlsx(wb, "نموذج_بيانات_التلاميذ_محدث.xlsx", "الطلاب_الجدد", "تم تنزيل نموذج إضافة الطلاب الجدد بنجاح.");
        }
      });
    }

    // ==========================================
    // المركز الإحصائي والتقارير المدرسية الشاملة (مدمج بالكامل داخل اللوحة)
    // ==========================================
    let statsCenterCustomStudents = null;

    async function getStatsCenterStudents() {
      if (Array.isArray(statsCenterCustomStudents) && statsCenterCustomStudents.length) {
        return statsCenterCustomStudents;
      }
      return await getOrLoadStudents();
    }

    let currentSchoolLogo = null;

    function updateSchoolLogoPreviewUI(logoUrl) {
      const previewImg = document.getElementById("sc-meta-logo-preview");
      const statusText = document.getElementById("sc-meta-logo-status");
      const btnRemove = document.getElementById("btn-sc-meta-logo-remove");
      const warningsBadgeImg = document.getElementById("warnings-school-logo-badge");
      const warningsStatusText = document.getElementById("warnings-school-logo-status");
      const warningsSchoolNameBadge = document.getElementById("warnings-school-name-badge");
      const schoolNameInput = document.getElementById("sc-meta-school");

      const defaultMinistryLogo = globalThis.NeprasReportHeader?.LOGO_B64 || "assets/logo.png";
      const activeLogo = (logoUrl && typeof logoUrl === "string" && logoUrl.trim()) ? logoUrl.trim() : null;
      currentSchoolLogo = activeLogo;

      if (previewImg) {
        previewImg.src = activeLogo || defaultMinistryLogo;
      }
      if (statusText) {
        statusText.textContent = activeLogo ? "شعار مخصص للمدرسة (معتمد للطباعة)" : "الافتراضي: شعار وزارة التربية والتعليم الرسمي";
        statusText.style.color = activeLogo ? "#0f766e" : "#64748b";
        statusText.style.fontWeight = activeLogo ? "700" : "normal";
      }
      if (btnRemove) {
        btnRemove.hidden = !activeLogo;
      }
      if (warningsBadgeImg) {
        warningsBadgeImg.src = activeLogo || defaultMinistryLogo;
      }
      if (warningsStatusText) {
        warningsStatusText.textContent = activeLogo ? "شعار مخصص معتمد" : "شعار الوزارة الافتراضي";
        warningsStatusText.style.color = activeLogo ? "#0f766e" : "#64748b";
      }
      if (warningsSchoolNameBadge) {
        warningsSchoolNameBadge.textContent = schoolNameInput?.value?.trim() || "المدرسة الحالية";
      }
    }

    function getStatsCenterMeta() {
      const year = document.getElementById("sc-meta-year")?.value?.trim() || (globalThis.NeprasEgypt?.academicYearLabel?.() || "2026 / 2027").replace(" / ", "-");
      const school = document.getElementById("sc-meta-school")?.value?.trim() || "المدرسة";
      const dir = document.getElementById("sc-meta-dir")?.value?.trim() || "";
      const admin = document.getElementById("sc-meta-admin")?.value?.trim() || "";
      const affairs = document.getElementById("sc-meta-affairs")?.value?.trim() || "";
      const principal = document.getElementById("sc-meta-principal")?.value?.trim() || "";
      const safeName = (school || "المدرسة").replace(/[\\/:*?"<>|]/g, "_");

      const stage = stageSelect?.value || "";

      try {
        const metaObj = { year, schoolName: school, directorate: dir, administration: admin, affairs, principal, stage, logo: currentSchoolLogo || null };
        chrome.storage.local.set({
          nepras_report_header_meta: metaObj
        });
        if (globalThis.NeprasSchoolManager?.saveSchoolMeta) {
          globalThis.NeprasSchoolManager.saveSchoolMeta(null, metaObj);
        }
      } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }

      const metaResult = { year, school, dir, admin, affairs, principal, safeName, stage, logo: currentSchoolLogo || null };
      return metaResult;
    }
    window.getStatsCenterMeta = getStatsCenterMeta;

    async function initStatsCenterMeta() {
      try {
        let meta = null;
        if (globalThis.NeprasSchoolManager?.loadSchoolMeta) {
          meta = await globalThis.NeprasSchoolManager.loadSchoolMeta();
        }
        if (!meta) {
          meta = {};
        }

        const setField = (id, val) => {
          const el = document.getElementById(id);
          if (el) el.value = val || "";
        };
        if (meta.year) setField("sc-meta-year", meta.year);
        setField("sc-meta-school", meta.schoolName || "");
        setField("sc-meta-dir", meta.directorate || "");
        setField("sc-meta-admin", meta.administration || "");
        setField("sc-meta-affairs", meta.affairs || "");
        setField("sc-meta-principal", meta.principal || "");
        currentSchoolLogo = meta.logo || meta.schoolLogo || null;
        updateSchoolLogoPreviewUI(currentSchoolLogo);
      } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
    }
    initStatsCenterMeta();

    const scMetaLogoInput = document.getElementById("sc-meta-logo-input");
    const btnScMetaLogoRemove = document.getElementById("btn-sc-meta-logo-remove");
    const scMetaSchoolInput = document.getElementById("sc-meta-school");

    if (scMetaSchoolInput) {
      scMetaSchoolInput.addEventListener("input", () => {
        const warningsSchoolNameBadge = document.getElementById("warnings-school-name-badge");
        if (warningsSchoolNameBadge) {
          warningsSchoolNameBadge.textContent = scMetaSchoolInput.value.trim() || "المدرسة الحالية";
        }
      });
    }

    if (scMetaLogoInput) {
      scMetaLogoInput.addEventListener("change", (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type || !file.type.startsWith("image/")) {
          showNeprasPopupNotice("يرجى اختيار ملف صورة صالح (PNG, JPG, WebP, SVG).", "warning", "شعار المدرسة");
          return;
        }
        if (file.size > 2 * 1024 * 1024) {
          showNeprasPopupNotice("حجم ملف الشعار يتجاوز 2 ميجابايت. يُفضل اختيار ملف أصغر حجماً لتفادي بطء تجهيز مستندات الطباعة.", "warning", "شعار المدرسة");
        }
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result;
          currentSchoolLogo = dataUrl;
          updateSchoolLogoPreviewUI(currentSchoolLogo);
          getStatsCenterMeta();
          showNeprasPopupNotice("تم حفظ واعتماد شعار المدرسة الرسمي بنجاح في كافة الإنذارات والمطبوعات.", "success", "شعار المدرسة");
        };
        reader.onerror = () => {
          showNeprasPopupNotice("تعذر قراءة ملف الصورة المحدد. يرجى تجربة ملف آخر.", "error", "شعار المدرسة");
        };
        reader.readAsDataURL(file);
        e.target.value = "";
      });
    }

    if (btnScMetaLogoRemove) {
      btnScMetaLogoRemove.addEventListener("click", () => {
        currentSchoolLogo = null;
        updateSchoolLogoPreviewUI(null);
        getStatsCenterMeta();
        showNeprasPopupNotice("تمت إزالة الشعار المخصص واستعادة شعار الوزارة الرسمي بنجاح.", "info", "شعار المدرسة");
      });
    }

    const btnWarningsQuickHeaderSettings = document.getElementById("btn-warnings-quick-header-settings");
    if (btnWarningsQuickHeaderSettings) {
      btnWarningsQuickHeaderSettings.addEventListener("click", () => {
        const tabReports = document.getElementById("tab-reports");
        if (tabReports) tabReports.click();

        const metaDetails = document.querySelector(".stats-center-meta-details");
        if (metaDetails) {
          metaDetails.open = true;
          metaDetails.scrollIntoView({ behavior: "smooth", block: "center" });
          metaDetails.style.transition = "outline 0.3s ease";
          metaDetails.style.outline = "2px solid #0f766e";
          setTimeout(() => { metaDetails.style.outline = ""; }, 2500);
        }
      });
    }

    // ==========================================================
    // Multi-School Profile Manager & Switcher UI
    // ==========================================================
    const schoolProfileSelect = document.getElementById("school-profile-select");
    const btnAddSchoolProfile = document.getElementById("btn-add-school-profile");
    const btnRemoveSchoolProfile = document.getElementById("btn-remove-school-profile");

    async function resolveCurrentTabSchool() {
      try {
        // 1. استعلام الخلفية عن التبويب النشط
        const bg = await chrome.runtime.sendMessage({ action: "NEPRAS_GET_ACTIVE_TAB_SCHOOL" }).catch(() => null);
        if (bg?.schoolCode) {
          return { schoolCode: String(bg.schoolCode).replace(/\D/g, ""), schoolName: bg.schoolName || "", stage: bg.stage || "" };
        }

        // 2. فحص نافذة سطح المكتب (Electron)
        const hostD = window.nepDesktop || window.parent?.nepDesktop;
        if (hostD?.getActiveSchool) {
          const ds = await hostD.getActiveSchool().catch(() => null);
          if (ds?.schoolCode) {
            return { schoolCode: String(ds.schoolCode).replace(/\D/g, ""), schoolName: ds.schoolName || "", stage: ds.stage || "" };
          }
        }

        // 3. سؤال التبويب النشط مباشرة في المتصفح
        const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }).catch(() => []);
        if (activeTab?.id != null) {
          const tabResp = await chrome.tabs.sendMessage(activeTab.id, { action: "NEPRAS_DETECT_TAB_SCHOOL" }).catch(() => null);
          if (tabResp?.schoolCode) {
            return { schoolCode: String(tabResp.schoolCode).replace(/\D/g, ""), schoolName: tabResp.schoolName || "", stage: tabResp.stage || "" };
          }
        }

        // 4. سياق الرؤوس المخزنة
        if (typeof window.neprasApiGetContext === "function") {
          const ctx = await window.neprasApiGetContext().catch(() => null);
          const c = String(ctx?.schoolcode || ctx?.schoolKey || "").replace(/\D/g, "");
          if (c) {
            return { schoolCode: c, schoolName: ctx?.schoolName || "", stage: ctx?.schoolstage || "" };
          }
        }
      } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
      return null;
    }

    const STAGE_NAMES_AR = {
      "KG": "رياض أطفال",
      "1": "المرحلة الابتدائية",
      "PRIMARY": "المرحلة الابتدائية",
      "2": "المرحلة الإعدادية",
      "3": "المرحلة الإعدادية",
      "PREP": "المرحلة الإعدادية",
      "4": "المرحلة الثانوية",
      "5": "المرحلة الثانوية",
      "6": "المرحلة الثانوية",
      "GENERAL_SECONDARY": "الثانوية العامة",
      "TECHNICAL_SECONDARY": "الثانوية الفنية"
    };

    async function refreshSchoolProfilesUI(selectedCode = "") {
      if (!schoolProfileSelect || !globalThis.NeprasSchoolManager) return;
      const schools = await globalThis.NeprasSchoolManager.getSchoolsList();
      const activeCode = (selectedCode !== undefined && selectedCode !== null)
        ? selectedCode
        : (await globalThis.NeprasSchoolManager.getActiveCode());

      schoolProfileSelect.innerHTML = '<option value="">المدرسة الحالية (تلقائي من تبويب الموقع)</option>';
      schools.forEach((s) => {
        const opt = document.createElement("option");
        opt.value = s.code;
        const mappedStage = STAGE_NAMES_AR[String(s.stage || "").trim().toUpperCase()] || s.stage || "";
        const stageLabel = mappedStage ? ` [${mappedStage}]` : "";
        opt.textContent = `${s.name} (${s.code})${stageLabel}`;
        if (s.code === activeCode) opt.selected = true;
        schoolProfileSelect.appendChild(opt);
      });
      if (!activeCode) {
        schoolProfileSelect.value = "";
      }
      if (btnRemoveSchoolProfile) {
        btnRemoveSchoolProfile.hidden = !schoolProfileSelect.value;
      }
    }

    async function switchSchoolProfile(code) {
      if (!globalThis.NeprasSchoolManager) return;

      let targetCode = code ? globalThis.NeprasSchoolManager.cleanCode(code) : "";
      let isAutoTab = !code;

      if (isAutoTab) {
        const detected = await resolveCurrentTabSchool();
        if (detected?.schoolCode) {
          targetCode = detected.schoolCode;
          await globalThis.NeprasSchoolManager.registerOrUpdateSchool({
            code: detected.schoolCode,
            name: detected.schoolName,
            stage: detected.stage
          });
        }
      }

      await globalThis.NeprasSchoolManager.setActiveCode(targetCode);

      const hostD = window.nepDesktop || window.parent?.nepDesktop;
      if (targetCode && hostD?.reportDetectedSchool) {
        hostD.reportDetectedSchool({ schoolCode: targetCode });
      }

      const setMetaField = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val || "";
      };

      if (targetCode) {
        let data = await globalThis.NeprasSchoolManager.loadSchoolStats(targetCode);
        let meta = await globalThis.NeprasSchoolManager.loadSchoolMeta(targetCode);
        if ((!data || (!data.stats && (!Array.isArray(data.students) || !data.students.length))) && (targetCode === "972133" || targetCode === "21024219")) {
          const altCode = targetCode === "972133" ? "21024219" : "972133";
          const altData = await globalThis.NeprasSchoolManager.loadSchoolStats(altCode);
          if (altData && (altData.stats || (Array.isArray(altData.students) && altData.students.length))) data = altData;
          if (!meta || !meta.schoolName || /^مدرسة \d+$/.test(meta.schoolName)) {
            const altMeta = await globalThis.NeprasSchoolManager.loadSchoolMeta(altCode);
            if (altMeta) meta = altMeta;
          }
        }

        setMetaField("sc-meta-year", meta?.year);
        setMetaField("sc-meta-school", meta?.schoolName || meta?.school || `مدرسة ${targetCode}`);
        setMetaField("sc-meta-dir", meta?.directorate || meta?.dir || "");
        setMetaField("sc-meta-admin", meta?.administration || meta?.admin || "");
        setMetaField("sc-meta-affairs", meta?.affairs || "");
        setMetaField("sc-meta-principal", meta?.principal || "");
        currentSchoolLogo = meta?.logo || meta?.schoolLogo || null;
        updateSchoolLogoPreviewUI(currentSchoolLogo);

        if (data && (data.stats || (Array.isArray(data.students) && data.students.length))) {
          window.neprasCachedStudentsList = (Array.isArray(data.students) && data.students.length) ? data.students : (data.stats?.detailRows || []);
          renderSchoolStats(data.stats);
          if (stageSelect && data.stats?.stage) {
            stageSelect.value = data.stats.stage;
            await setStage(data.stats.stage);
          }
        } else {
          // تفريغ الإحصاء المعروض فوراً لمنع بقاء أرقام المدرسة السابقة على الشاشة!
          window.neprasCachedStudentsList = [];
          renderSchoolStats(null);
          if (schoolStatsEmpty) {
            const dispName = meta?.schoolName || `مدرسة ${targetCode}`;
            schoolStatsEmpty.textContent = `مدرسة: ${dispName} (كود: ${targetCode}) — لا توجد إحصائيات محفوظة بعد. اضغط على «تحديث إحصاء المدرسة» لجلب بياناتها.`;
          }
        }
      } else {
        // فحص واسترجاع آخر مدرسة نشطة أو لقطة إحصاء محفوظة بالذاكرة لعرضها بدلاً من تفريغ الشاشة
        let fallbackStats = null;
        let fallbackStudents = [];
        let fallbackMeta = null;
        const savedActive = (await globalThis.NeprasSchoolManager?.getActiveCode?.()) || "";
        const allSchools = (await globalThis.NeprasSchoolManager?.listSchools?.()) || [];
        const candidateCode = savedActive || (allSchools[0]?.code) || "";
        if (candidateCode) {
          const loaded = await globalThis.NeprasSchoolManager.loadSchoolStats(candidateCode);
          fallbackMeta = await globalThis.NeprasSchoolManager.loadSchoolMeta(candidateCode);
          if (loaded && loaded.stats) {
            fallbackStats = loaded.stats;
            fallbackStudents = loaded.students || loaded.stats.detailRows || [];
          }
        }
        if (!fallbackStats) {
          const raw = await chrome.storage.local.get(["neprasSchoolStatsV1", "neprasCachedStudentsList"]);
          if (raw?.neprasSchoolStatsV1) {
            fallbackStats = raw.neprasSchoolStatsV1;
            fallbackStudents = Array.isArray(raw.neprasCachedStudentsList) ? raw.neprasCachedStudentsList : (fallbackStats.detailRows || []);
          }
        }
        if (fallbackStats && fallbackStats.grades && fallbackStats.grades.length) {
          renderSchoolStats(fallbackStats);
          window.neprasCachedStudentsList = fallbackStudents;
          if (stageSelect && fallbackStats.stage) {
            stageSelect.value = fallbackStats.stage;
            await setStage(fallbackStats.stage);
          }
          if (fallbackMeta) {
            setMetaField("sc-meta-year", fallbackMeta.year || "2026-2027");
            setMetaField("sc-meta-school", fallbackMeta.schoolName || fallbackStats.schoolName || "");
            setMetaField("sc-meta-dir", fallbackMeta.directorate || fallbackStats.directorate || "");
            setMetaField("sc-meta-admin", fallbackMeta.administration || fallbackStats.administration || "");
            setMetaField("sc-meta-affairs", fallbackMeta.affairs || "");
            setMetaField("sc-meta-principal", fallbackMeta.principal || "");
            currentSchoolLogo = fallbackMeta.logo || null;
            updateSchoolLogoPreviewUI(currentSchoolLogo);
          }
        } else {
          renderSchoolStats(null);
          window.neprasCachedStudentsList = [];
          if (schoolStatsEmpty) {
            schoolStatsEmpty.textContent = "لا توجد إحصائيات محفوظة بعد. يرجى فتح صفحة المدرسة بموقع الوزارة والضغط على «تحديث إحصاء المدرسة».";
          }
          setMetaField("sc-meta-school", "");
          setMetaField("sc-meta-dir", "");
          setMetaField("sc-meta-admin", "");
          setMetaField("sc-meta-affairs", "");
          setMetaField("sc-meta-principal", "");
          currentSchoolLogo = null;
          updateSchoolLogoPreviewUI(null);
        }
      }

      await updateStatsCenterStatus();
      if (typeof window.updateSmartAnalyticsStatus === "function") window.updateSmartAnalyticsStatus();
      if (typeof window.updateAbsenceWarningsUI === "function") await window.updateAbsenceWarningsUI();
      await refreshSchoolProfilesUI(code);
      showNeprasPopupNotice("تم ضبط ملف المدرسة بنجاح.", "success", "ملف المدرسة");
    }

    schoolProfileSelect?.addEventListener("change", (e) => {
      switchSchoolProfile(e.target.value);
    });

    btnAddSchoolProfile?.addEventListener("click", async () => {
      const meta = getStatsCenterMeta();
      const code = prompt("يرجى كتابة كود هذه المدرسة / المرحلة لحفظها كملف مستقل:", "")?.trim();
      if (!code) return;
      const clean = globalThis.NeprasSchoolManager?.cleanCode(code);
      if (!clean) {
        showNeprasPopupNotice("كود المدرسة غير صالح (يجب أن يحتوي على أرقام).", "error", "خطأ");
        return;
      }

      const st = await getOrLoadStudents();
      const currentStats = (await globalThis.NeprasSchoolManager?.loadSchoolStats?.(clean))?.stats || {};

      await globalThis.NeprasSchoolManager.registerOrUpdateSchool({
        code: clean,
        name: meta.school,
        directorate: meta.dir,
        administration: meta.admin,
        affairs: meta.affairs,
        principal: meta.principal,
        stage: stageSelect?.value || ""
      });
      await globalThis.NeprasSchoolManager.saveSchoolStats(clean, { ...currentStats, schoolName: meta.school, schoolKey: clean, stage: stageSelect?.value || "" }, st);
      await refreshSchoolProfilesUI(clean);
      await switchSchoolProfile(clean);
      showNeprasPopupNotice(`تم حفظ بيانات المدرسة (كود: ${clean}) كملف مستقل بنجاح.`, "success", "تم الحفظ المستقل");
    });

    btnRemoveSchoolProfile?.addEventListener("click", async () => {
      const code = schoolProfileSelect?.value;
      if (!code || !globalThis.NeprasSchoolManager) return;
      const schools = await globalThis.NeprasSchoolManager.getSchoolsList();
      const target = schools.find((s) => s.code === code);
      const name = target?.name || `كود ${code}`;
      const confirmed = confirm(`هل ترغب بالتأكيد في حذف ملف مدرسة "${name}" (${code}) من قائمة المدارس المحفوظة؟`);
      if (!confirmed) return;

      await globalThis.NeprasSchoolManager.removeSchool(code);
      await switchSchoolProfile("");
      await refreshSchoolProfilesUI("");
      showNeprasPopupNotice(`تم حذف ملف مدرسة "${name}" بنجاح.`, "success", "حذف المدرسة");
    });

    const btnExportSchoolProfile = document.getElementById("btn-export-school-profile");
    const btnImportSchoolProfile = document.getElementById("btn-import-school-profile");
    const schoolFileInput = document.getElementById("school-file-input");

    btnExportSchoolProfile?.addEventListener("click", async () => {
      try {
        if (!globalThis.NeprasSchoolManager?.exportSchoolPackage) {
          showNeprasPopupNotice("وحدة إدارة المدارس غير متوفرة.", "error", "خطأ");
          return;
        }
        const activeCode = schoolProfileSelect?.value || (await globalThis.NeprasSchoolManager.getActiveCode());
        if (!activeCode) {
          showNeprasPopupNotice("يرجى اختيار مدرسة من القائمة أو حفظ المدرسة الحالية أولاً قبل التصدير.", "warning", "تنبيه التصدير");
          return;
        }
        const pkg = await globalThis.NeprasSchoolManager.exportSchoolPackage(activeCode);
        const jsonStr = JSON.stringify(pkg, null, 2);
        const blob = new Blob([jsonStr], { type: "application/json;charset=utf-8" });
        const cleanName = (pkg.schoolName || ("مدرسة_" + pkg.schoolCode)).replace(/[/\\:*?"<>|]/g, "_").trim();
        const fileName = cleanName + "_(" + pkg.schoolCode + ").nepras";

        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);

        showNeprasPopupNotice(
          "تم تصدير ملف المدرسة (" + cleanName + ") بنجاح! تم حفظ كشف الطلاب (" + (pkg.students?.length || 0) + ") والإحصاء والغياب والترويسة في ملف جاهز للاستيراد على أي جهاز.",
          "success",
          "تم تصدير ملف المدرسة"
        );
      } catch (err) {
        showNeprasPopupNotice("فشل تصدير ملف المدرسة: " + (err?.message || String(err)), "error", "خطأ في التصدير");
      }
    });

    btnImportSchoolProfile?.addEventListener("click", () => {
      if (schoolFileInput) {
        schoolFileInput.value = "";
        schoolFileInput.click();
      }
    });

    schoolFileInput?.addEventListener("change", async (e) => {
      const file = e.target?.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        let parsed = null;
        try {
          parsed = JSON.parse(text);
        } catch (_) {
          throw new Error("الملف المختار ليس ملف بيانات صالح (صيغة JSON غير سليمة).");
        }
        if (!globalThis.NeprasSchoolManager?.importSchoolPackage) {
          throw new Error("وحدة استيراد المدارس غير متوفرة.");
        }
        const res = await globalThis.NeprasSchoolManager.importSchoolPackage(parsed);
        await refreshSchoolProfilesUI(res.schoolCode);
        await switchSchoolProfile(res.schoolCode);
        showNeprasPopupNotice(res.message, "success", "تم استيراد المدرسة بنجاح");
      } catch (err) {
        showNeprasPopupNotice("فشل استيراد ملف المدرسة: " + (err?.message || String(err)), "error", "خطأ في الاستيراد");
      } finally {
        if (schoolFileInput) schoolFileInput.value = "";
      }
    });

    async function initSchoolManagerIntegration() {
      try {
        const detected = await resolveCurrentTabSchool();
        if (detected?.schoolCode) {
          await globalThis.NeprasSchoolManager?.registerOrUpdateSchool?.({
            code: detected.schoolCode,
            name: detected.schoolName,
            stage: detected.stage
          });
          const currentActive = await globalThis.NeprasSchoolManager?.getActiveCode?.();
          if (!currentActive || currentActive === detected.schoolCode) {
            await switchSchoolProfile(detected.schoolCode);
            await refreshSchoolProfilesUI(detected.schoolCode);
            return;
          }
        }
      } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }

      const savedActive = (await globalThis.NeprasSchoolManager?.getActiveCode?.()) || "";
      if (savedActive) {
        await switchSchoolProfile(savedActive);
      } else {
        await switchSchoolProfile("");
      }
      await refreshSchoolProfilesUI();
    }

    window.refreshSchoolProfilesUI = refreshSchoolProfilesUI;
    window.switchSchoolProfile = switchSchoolProfile;
    initSchoolManagerIntegration();

    async function updateStatsCenterStatus() {
      const statusText = document.getElementById("stats-center-status-text");
      const validityBadge = document.getElementById("stats-center-validity-badge");
      const monthSelect = document.getElementById("sc-month-select");
      if (!statusText) return;

      const activeCode = globalThis.NeprasSchoolManager ? globalThis.NeprasSchoolManager.cleanCode(await globalThis.NeprasSchoolManager.getActiveCode()) : "";
      const list = await getStatsCenterStudents();
      statusText.textContent = "";
      const dot = document.createElement("span");
      dot.style.fontWeight = "700";

      if (list && list.length > 0) {
        dot.style.color = "#0f766e";
        dot.textContent = "● ";
        const countB = document.createElement("b");
        countB.textContent = String(list.length);
        statusText.append(dot, document.createTextNode("بيانات المدرسة جاهزة: "), countB, document.createTextNode(" طالباً متاحاً لإعداد كافة التقارير فوراً."));
      } else {
        dot.style.color = "#d97706";
        dot.textContent = "● ";
        statusText.append(dot, document.createTextNode("لا توجد بيانات طلاب محفوظة. اضغط «تحديث البيانات الشاملة» أو اختر «ملف خارجي»."));
      }

      // تحديث شارة الصلاحية وقائمة الشهور التاريخية من NeprasLocalDB
      if (globalThis.NeprasLocalDB) {
        try {
          if (validityBadge && activeCode) {
            const valStatus = await globalThis.NeprasLocalDB.getMonthlyValidityStatus(activeCode);
            validityBadge.textContent = "";
            const vDot = document.createElement("span");
            vDot.style.color = valStatus.statusBadge.color;
            vDot.style.fontWeight = "900";
            vDot.textContent = "● ";
            validityBadge.append(vDot, document.createTextNode(valStatus.statusBadge.text));
          } else if (validityBadge) {
            validityBadge.textContent = "";
          }

          if (monthSelect && activeCode) {
            const months = await globalThis.NeprasLocalDB.listAvailableMonths(activeCode);
            const currentVal = monthSelect.value || "latest";
            monthSelect.innerHTML = '<option value="latest">الأحدث (البيانات النشطة)</option>';
            months.forEach((m) => {
              const opt = document.createElement("option");
              opt.value = m.monthKey;
              opt.textContent = `${m.monthLabel} (${m.totalStudents || 0} طالب)`;
              if (m.monthKey === currentVal) opt.selected = true;
              monthSelect.appendChild(opt);
            });
          }
        } catch (e) {
          console.warn("[NeprasLocalDB UI]", e);
        }
      }
    }
    window.updateStatsCenterStatus = updateStatsCenterStatus;
    updateStatsCenterStatus();

    // ربط قائمة الشهور التاريخية لعرض أي شهر بـ Zero Latency
    const scMonthSelect = document.getElementById("sc-month-select");
    if (scMonthSelect && !scMonthSelect.dataset.listenerBound) {
      scMonthSelect.dataset.listenerBound = "true";
      scMonthSelect.addEventListener("change", async (e) => {
        const val = e.target.value;
        const activeCode = globalThis.NeprasSchoolManager ? globalThis.NeprasSchoolManager.cleanCode(await globalThis.NeprasSchoolManager.getActiveCode()) : "";
        if (!activeCode) return;

        if (val === "latest") {
          statsCenterCustomStudents = null;
          const loaded = await globalThis.NeprasSchoolManager.loadSchoolStats(activeCode);
          if (loaded?.stats) renderSchoolStats(loaded.stats);
          window.neprasCachedStudentsList = loaded?.students || loaded?.stats?.detailRows || [];
          await updateStatsCenterStatus();
          showNeprasPopupNotice("تم الرجوع إلى أحدث لقطة بيانات معتمدة للمدرسة.", "success", "البيانات الحالية");
        } else if (globalThis.NeprasLocalDB?.getSnapshotByMonth) {
          const snap = await globalThis.NeprasLocalDB.getSnapshotByMonth(activeCode, val);
          if (snap) {
            statsCenterCustomStudents = snap.students || [];
            window.neprasCachedStudentsList = snap.students || [];
            if (snap.stats) renderSchoolStats(snap.stats);
            await updateStatsCenterStatus();
            showNeprasPopupNotice(`تم استرجاع وعرض لقطة شهر ${snap.monthLabel} بنجاح من قاعدة البيانات المحلية (${snap.students.length} طالباً).`, "success", "الأرشيف الشهري (Zero Latency)");
          } else {
            showNeprasPopupNotice("تعذر العثور على لقطة هذا الشهر في قاعدة البيانات المحلية.", "warning", "تنبيه");
          }
        }
      });
    }

    const btnStatsCenterRefresh = document.getElementById("btn-stats-center-refresh");
    if (btnStatsCenterRefresh) {
      btnStatsCenterRefresh.addEventListener("click", async () => {
        const activeCode = globalThis.NeprasSchoolManager ? globalThis.NeprasSchoolManager.cleanCode(await globalThis.NeprasSchoolManager.getActiveCode()) : "";
        statsCenterCustomStudents = null;
        if (scMonthSelect) scMonthSelect.value = "latest";

        // فحص قاعدة البيانات المحلية أولاً Zero Latency
        if (activeCode && globalThis.NeprasLocalDB?.getLatestSnapshot) {
          const snap = await globalThis.NeprasLocalDB.getLatestSnapshot(activeCode);
          if (snap) {
            window.neprasCachedStudentsList = snap.students || [];
            if (snap.stats) renderSchoolStats(snap.stats);
            await updateStatsCenterStatus();
            showNeprasPopupNotice(`تم تحميل بيانات المدرسة فورياً من قاعدة البيانات المحلية: ${snap.students?.length || 0} طالباً (${snap.monthLabel}).`, "success", "قاعدة البيانات المحلية (Zero Latency)");
            return;
          }
        }

        const list = await getOrLoadStudents();
        await updateStatsCenterStatus();
        if (list && list.length) {
          showNeprasPopupNotice(`تم تحديث عرض بيانات المدرسة: ${list.length} طالباً.`, "success", "اكتمل التحديث");
        } else {
          showNeprasPopupNotice("لا توجد بيانات محفوظة محلياً بعد. اضغط على «تحديث البيانات الشاملة» لجلب بيانات المدرسة من موقع الوزارة.", "warning", "تنبيه");
        }
      });
    }

    async function triggerSchoolDeepExtraction() {
      const stage = stageSelect?.value || "";
      if (!stage) {
        NeprasUI.field.error(stageSelect, NeprasUI.msg("stage_required").title);
        showNeprasPopupNotice("يرجى اختيار المرحلة التعليمية أولاً من أعلى الشاشة.", "warning", "المرحلة مطلوبة");
        return;
      }
      renderDeepProgressUI({
        running: true,
        title: "جاري بدء التنزيل والتحديث الشامل لبيانات المدرسة...",
        percent: 0,
        subtitle: "يتم فتح صفحة الطلاب والاتصال بمنظومة الوزارة في الخلفية..."
      });
      showNeprasPopupNotice("جاري بدء التنزيل والتحديث الشامل لبيانات المدرسة بالكامل من منظومة الوزارة...", "info", "تحديث البيانات الشاملة");
      await triggerExportCommand({ type: "ALL_GRADES", stage, mode: "deep" });
    }

    const btnStatsCenterFetchDeep = document.getElementById("btn-stats-center-fetch-deep");
    btnStatsCenterFetchDeep?.addEventListener("click", triggerSchoolDeepExtraction);

    const btnSchoolDeepStatsRefresh = document.getElementById("btn-school-deep-stats-refresh");
    btnSchoolDeepStatsRefresh?.addEventListener("click", triggerSchoolDeepExtraction);

    const btnAnalyticsDeepRefresh = document.getElementById("btn-analytics-deep-refresh");
    btnAnalyticsDeepRefresh?.addEventListener("click", triggerSchoolDeepExtraction);

    const statsCenterFileInput = document.getElementById("stats-center-file-input");
    if (statsCenterFileInput) {
      statsCenterFileInput.addEventListener("change", async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
          if (!window.NeprasStatsDashboard?.readWorkbookFromExcel) {
            throw new Error("قارئ ملفات الإكسيل غير متوفر.");
          }
          const { json } = await window.NeprasStatsDashboard.readWorkbookFromExcel(file);
          if (!json || !json.length) throw new Error("الملف المختار فارغ أو لا يحتوي على صفوف بيانات صالحة.");
          statsCenterCustomStudents = json;
          updateStatsCenterStatus();
          showNeprasPopupNotice(`تمت قراءة الملف الخارجي بنجاح: ${file.name} (${json.length} طالباً).`, "success", "تمت قراءة الملف");
        } catch (err) {
          showNeprasPopupNotice("تعذر قراءة ملف الإكسيل: " + (err.message || String(err)), "error", "خطأ في الملف");
        }
      });
    }

    async function exportStatsCenterSingleReport(buildFn, sheetName, filePrefix) {
      const students = await getStatsCenterStudents();
      if (!students || !students.length) {
        showNeprasPopupNotice("لا توجد بيانات طلاب متاحة حالياً. يرجى تحديث البيانات من الموقع أو استيراد ملف إكسيل أولاً.", "warning", "تنبيه");
        return;
      }
      if (!buildFn) {
        showNeprasPopupNotice("دالة بناء هذا التقرير غير متوفرة.", "error", "خطأ");
        return;
      }
      try {
        const meta = getStatsCenterMeta();
        const ws = buildFn(students, meta);
        const wb = XLSX.utils.book_new();
        if (!wb.Workbook) wb.Workbook = {};
        if (!wb.Workbook.Views) wb.Workbook.Views = [{ RTL: true }];
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
        const fileName = `${filePrefix}_${meta.safeName}.xlsx`;
        await neprasUnifiedDownloadXlsx(wb, fileName, sheetName, `تم تصدير تقرير: ${sheetName} بنجاح.`);
      } catch (err) {
        showNeprasPopupNotice("تعذر تصدير التقرير: " + (err.message || String(err)), "error", "خطأ في التصدير");
      }
    }

    const btnScExportMaster = document.getElementById("btn-sc-export-master");
    if (btnScExportMaster) {
      btnScExportMaster.addEventListener("click", async () => {
        const students = await getStatsCenterStudents();
        if (!students || !students.length) {
          showNeprasPopupNotice("لا توجد بيانات طلاب متاحة حالياً. يرجى تحديث البيانات من الموقع أولاً.", "warning", "تنبيه");
          return;
        }
        if (!window.NeprasStatsDashboard?.buildMasterWorkbook) {
          showNeprasPopupNotice("وحدة المصنف الشامل غير محملة.", "error", "خطأ");
          return;
        }
        try {
          const meta = getStatsCenterMeta();
          const wb = window.NeprasStatsDashboard.buildMasterWorkbook(students, meta, XLSX);
          const fileName = `الاحصائية_الشاملة_${meta.safeName}.xlsx`;
          await neprasUnifiedDownloadXlsx(wb, fileName, "الاحصائية_الشاملة", "تم تصدير المصنف الإحصائي الشامل (15 تقريراً معتمداً) بنجاح.");
        } catch (err) {
          showNeprasPopupNotice("تعذر تصدير المصنف الشامل: " + (err.message || String(err)), "error", "خطأ");
        }
      });
    }

    const reportMappings = [
      { id: "btn-sc-gender", fn: "buildGenderStatsSheet", sheet: "الفصول والنوع", prefix: "احصائية_الفصول_والنوع" },
      { id: "btn-sc-enrollment", fn: "buildEnrollmentStatsSheet", sheet: "حالات القيد", prefix: "احصائية_حالات_القيد" },
      { id: "btn-sc-religion", fn: "buildReligionStatsSheet", sheet: "الديانة", prefix: "احصائية_الديانة" },
      { id: "btn-sc-age", fn: "buildAgeStatsSheet", sheet: "الفئات العمرية", prefix: "احصائية_الفئات_العمرية" },
      { id: "btn-sc-integration", fn: "buildIntegrationStatsSheet", sheet: "كشف الدمج", prefix: "كشف_الدمج_والتربية_الخاصة" },
      { id: "btn-sc-density", fn: "buildDensityStatsSheet", sheet: "كثافة الفصول", prefix: "كثافة_الفصول_والاعداد" },
      { id: "btn-sc-dataguard", fn: "buildDataGuardStatsSheet", sheet: "تدقيق البيانات", prefix: "تقرير_تدقيق_وسلامة_البيانات" },
      { id: "btn-sc-siblings", fn: "buildSiblingsStatsSheet", sheet: "الأشقاء والإخوة", prefix: "احصائية_الاشقاء_والاخوة" },
      { id: "btn-sc-demographics", fn: "buildDemographicsStatsSheet", sheet: "التوزيع الجغرافي", prefix: "التوزيع_الجغرافي_للمحافظات" },
      { id: "btn-sc-languages", fn: "buildLanguagesStatsSheet", sheet: "اللغات والشعب", prefix: "احصائية_اللغات_والشعب" },
      { id: "btn-sc-secondary-tracks", fn: "buildSecondaryTracksStatsSheet", sheet: "الثانوي - مسارات وشعب", prefix: "احصائية_الثانوي_العام_مسارات_وشعب" },
      { id: "btn-sc-anomalies", fn: "buildAnomaliesStatsSheet", sheet: "مطابقة السن", prefix: "مطابقة_السن_القانوني" },
      { id: "btn-sc-quality", fn: "buildQualityStatsSheet", sheet: "جودة البيانات", prefix: "تقرير_جودة_البيانات_والنواقص" },
      { id: "btn-sc-mothernames", fn: "buildMotherNamesAnalysisSheet", sheet: "أسماء الأمهات", prefix: "تحليل_اسماء_الامهات" },
      { id: "btn-sc-manager-sheet", fn: "buildPrincipalDashboardSheet", sheet: "اللوحة الإحصائية", prefix: "اللوحة_الاحصائية_لمدير_المدرسة" }
    ];

    reportMappings.forEach((rm) => {
      const btn = document.getElementById(rm.id);
      if (btn) {
        btn.addEventListener("click", () => {
          const fn = window.NeprasStatsDashboard?.[rm.fn];
          exportStatsCenterSingleReport(fn, rm.sheet, rm.prefix);
        });
      }
    });

    const btnScBirthMonths = document.getElementById("btn-sc-birthmonths");
    if (btnScBirthMonths) {
      btnScBirthMonths.addEventListener("click", async () => {
        const students = await getStatsCenterStudents();
        if (!students || !students.length) {
          showNeprasPopupNotice("لا توجد بيانات طلاب متاحة حالياً. يرجى تحديث البيانات من الموقع أولاً.", "warning", "تنبيه");
          return;
        }
        if (!window.NeprasStatsDashboard?.buildBirthMonthsStatsSheet) {
          showNeprasPopupNotice("وحدة مواليد الشهور غير متوفرة.", "error", "خطأ");
          return;
        }
        try {
          const meta = getStatsCenterMeta();
          const resolveRowGrade = (r) =>
            window.NeprasStatsDashboard?.normalizeStudentRecord
              ? window.NeprasStatsDashboard.normalizeStudentRecord(r).grade
              : String(r?.["الصف"] || r?.grade || "").trim();
          const grades = [...new Set(students.map(resolveRowGrade).filter((g) => g && g !== "غير محدد"))];
          if (typeof window.NeprasStatsDashboard?.sortGrades === "function") {
            grades.sort(window.NeprasStatsDashboard.sortGrades);
          }
          const wb = XLSX.utils.book_new();
          if (!wb.Workbook) wb.Workbook = {};
          if (!wb.Workbook.Views) wb.Workbook.Views = [{ RTL: true }];

          if (grades.length === 0) {
            const ws = window.NeprasStatsDashboard.buildBirthMonthsStatsSheet(students, "جميع الصفوف", meta);
            XLSX.utils.book_append_sheet(wb, ws, "مواليد الشهور");
          } else {
            grades.forEach((g) => {
              const gData = students.filter((r) => resolveRowGrade(r) === g);
              const safeSheet = String(g).replace(/[\\/:*?"<>|]/g, "").substring(0, 31);
              const ws = window.NeprasStatsDashboard.buildBirthMonthsStatsSheet(gData, g, meta);
              XLSX.utils.book_append_sheet(wb, ws, safeSheet);
            });
          }
          const fName = `ترتيب_القبول_مواليد_الشهور_${meta.safeName}.xlsx`;
          await neprasUnifiedDownloadXlsx(wb, fName, "مواليد_الشهور", "تم تصدير كشف ترتيب القبول ومواليد الشهور بنجاح.");
        } catch (err) {
          showNeprasPopupNotice("تعذر تصدير تقرير مواليد الشهور: " + (err.message || String(err)), "error", "خطأ");
        }
      });
    }

    if (addStudentFileInput) {
      addStudentFileInput.addEventListener("change", async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (addStudentFileName) addStudentFileName.textContent = file.name;
        try {
          const buf = await file.arrayBuffer();
          const wb = XLSX.read(buf, { type: "array" });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
          if (window.NeprasAddStudent) {
            parsedAddStudentPlan = window.NeprasAddStudent.parseAddStudentSheet(matrix);
            if (addStudentSummary) {
              addStudentSummary.hidden = false;
              addStudentSummary.textContent = `تم فحص الملف: ${parsedAddStudentPlan.stats.valid} طالب جاهز للإضافة، ${parsedAddStudentPlan.stats.rejected} مرفوض أو به بيانات غير صالحة.`;
            }
            if (btnAddStudentStart) {
              btnAddStudentStart.removeAttribute("aria-disabled");
              btnAddStudentStart.removeAttribute("data-reason");
            }
          }
        } catch (err) {
          showNeprasPopupNotice("تعذر قراءة ملف الطلاب: " + (err.message || String(err)), "error", "خطأ في الملف");
        }
      });
    }

    if (btnAddStudentStart) {
      btnAddStudentStart.addEventListener("click", async () => {
        if (!parsedAddStudentPlan || !parsedAddStudentPlan.rows.length) {
          showNeprasPopupNotice("يرجى اختيار ملف صالح لإضافة الطلاب أولاً.", "warning", "تنبيه");
          return;
        }
        showNeprasPopupNotice("بدأت عملية إضافة الطلاب وحفظ بياناتهم آلياً على موقع الوزارة...", "info", "بدء الإضافة");
        const res = await neprasSendMessageToStudentTab({
          action: "NEPRAS_START_ADD_STUDENTS",
          students: parsedAddStudentPlan.rows
        }, "تعذر إرسال أمر الإضافة", "student/add", ADD_STUDENT_URL);
        if (res) {
          if (res.ok === false) {
            showNeprasPopupNotice("تنبيه من موقع الوزارة: " + (res.message || "تعذر بدء العملية"), "warning", "تنبيه");
          } else {
            const added = res.addedCount || 0;
            const failed = res.failedCount || 0;
            const msg = failed > 0
              ? `تم الانتهاء من فحص وإضافة الطلاب:\nتم حفظ وتأكيد: ${added} طالب\nتعذر حفظ: ${failed} طالب (راجع التنبيهات المذكورة).`
              : `اكتملت عملية إضافة وحفظ وتأكيد بيانات جميع الطلاب (${added} طالب) بنجاح.`;
            showNeprasPopupNotice(msg, failed > 0 ? "warning" : "success", "اكتمل تسجيل الطلاب");
          }
        }
      });
    }

    const btnConfirmCurrentStudent = document.getElementById("btn-add-student-confirm-current");
    if (btnConfirmCurrentStudent) {
      btnConfirmCurrentStudent.addEventListener("click", async () => {
        showNeprasPopupNotice("جارٍ الضغط على زر الحفظ وتأكيد نافذة الحفظ...", "info", "تنفيذ الحفظ والتأكيد");
        const res = await neprasSendMessageToStudentTab({
          action: "NEPRAS_SUBMIT_AND_CONFIRM_STUDENT"
        }, "تعذر إرسال أمر الحفظ", "student/add", ADD_STUDENT_URL);
        if (res) {
          if (res.ok) {
            showNeprasPopupNotice(res.message || "تم حفظ وتأكيد استمارة التلميذ بنجاح.", "success", "تم الحفظ والتأكيد");
          } else {
            showNeprasPopupNotice(res.message || "تعذر إتمام الحفظ والتأكيد.", "warning", "تنبيه");
          }
        }
      });
    }

    if (btnQuickAddNidStart && inputQuickAddNid) {
      btnQuickAddNidStart.addEventListener("click", async () => {
        const nid = String(inputQuickAddNid.value || "").trim();
        if (!nid || nid.length !== 14) {
          showNeprasPopupNotice("يرجى إدخال رقم قومي صحيح مكون من 14 رقمًا.", "warning", "تنبيه");
          return;
        }
        const res = await neprasSendMessageToStudentTab({
          action: "NEPRAS_QUICK_REGISTER_STUDENT_BY_NID",
          nationalId: nid
        }, "تعذر إرسال أمر الإضافة", "student/add", ADD_STUDENT_URL);
        if (res) {
          showNeprasPopupNotice("تم إرسال طلب استدعاء وتسجيل الطالب بالرقم القومي.", "success", "استدعاء الطالب");
        }
      });
    }

    // التحليلات المتقدمة ومراجعة وتدقيق البيانات
    const btnAnalyticsDataGuard = document.getElementById("btn-analytics-dataguard");
    const btnAnalyticsSiblings = document.getElementById("btn-analytics-siblings");
    const btnAnalyticsExportAll = document.getElementById("btn-analytics-export-all");
    const btnAnalyticsRefresh = document.getElementById("btn-analytics-refresh");
    const smartAnalyticsResult = document.getElementById("smart-analytics-result");
    const smartAnalyticsCacheStatus = document.getElementById("smart-analytics-cache-status");

    function updateSmartAnalyticsStatus() {
      if (!smartAnalyticsCacheStatus) return;
      const count = Array.isArray(window.neprasCachedStudentsList) ? window.neprasCachedStudentsList.length : 0;
      smartAnalyticsCacheStatus.textContent = '';
      const dot = document.createElement('span');
      dot.style.fontWeight = '700';
      if (count > 0) {
        dot.style.color = '#16a34a';
        dot.textContent = '● ';
        const b = document.createElement('b');
        b.textContent = String(count);
        smartAnalyticsCacheStatus.append(dot, document.createTextNode('بيانات المدرسة محفوظة ومتاحة: '), b, document.createTextNode(' طالباً جاهزة للتدقيق والتحليل.'));
        smartAnalyticsCacheStatus.style.color = "#15803d";
        smartAnalyticsCacheStatus.style.borderColor = "#bbf7d0";
        smartAnalyticsCacheStatus.style.background = "#f0fdf4";
      } else {
        dot.style.color = '#d97706';
        dot.textContent = '● ';
        smartAnalyticsCacheStatus.append(dot, document.createTextNode('لا توجد بيانات طلاب محفوظة حاليًا. اضغط «تحديث بيانات المدرسة من الموقع» أدناه.'));
        smartAnalyticsCacheStatus.style.color = "#92400e";
        smartAnalyticsCacheStatus.style.borderColor = "#fde68a";
        smartAnalyticsCacheStatus.style.background = "#fffbeb";
      }
    }
    window.updateSmartAnalyticsStatus = updateSmartAnalyticsStatus;
    updateSmartAnalyticsStatus();

    async function enrichStudentsWithExpensesCache(studentsList) {
      if (!Array.isArray(studentsList) || !studentsList.length) return [];
      try {
        const expStore = await chrome.storage.local.get("neprasExpensesAnalysisV1");
        const expRows = Array.isArray(expStore?.neprasExpensesAnalysisV1?.rows) ? expStore.neprasExpensesAnalysisV1.rows : [];
        if (!expRows.length) return studentsList;
        const expByKey = new Map();
        for (const er of expRows) {
          if (!er || typeof er !== "object") continue;
          const ec = String(er.code || er.studentCode || er["كود التلميذ"] || "").replace(/\D/g, "");
          const en = String(er.nationalId || er["الرقم القومي"] || "").replace(/\D/g, "");
          if (ec) expByKey.set("c:" + ec, er);
          if (en) expByKey.set("n:" + en, er);
        }
        return studentsList.map((st) => {
          if (!st || typeof st !== "object") return st;
          const sc = String(st.studentCode || st.code || st["كود التلميذ"] || st["كود الطالب"] || "").replace(/\D/g, "");
          const sn = String(st.nationalId || st.nid || st["الرقم القومي"] || "").replace(/\D/g, "");
          const em = (sc && expByKey.get("c:" + sc)) || (sn && expByKey.get("n:" + sn)) || null;
          if (!em) return st;
          return {
            ...st,
            exemptionType: st.exemptionType || em.exemptionType || em.exemptionLabel || "",
            exemptionClass: st.exemptionClass || em.exemptionClass || "",
            exemptionPercent: st.exemptionPercent ?? em.exemptionPercent,
            paid: st.paid ?? em.paid,
            financeStatus: st.financeStatus || em.financeStatus || ""
          };
        });
      } catch (_) {
        return studentsList;
      }
    }

    async function getOrLoadStudents() {
      try {
        const storedCheck = await chrome.storage.local.get("neprasCachedStudentsList");
        const storedList = Array.isArray(storedCheck?.neprasCachedStudentsList) ? storedCheck.neprasCachedStudentsList : [];
        if (storedList.length && (!Array.isArray(window.neprasCachedStudentsList) || storedList.length >= window.neprasCachedStudentsList.length)) {
          window.neprasCachedStudentsList = storedList;
        }
      } catch (_) {}
      if (Array.isArray(window.neprasCachedStudentsList) && window.neprasCachedStudentsList.length) {
        return await enrichStudentsWithExpensesCache(window.neprasCachedStudentsList);
      }
      try {
        if (globalThis.NeprasSchoolManager?.loadSchoolStats) {
          const activeCode = await globalThis.NeprasSchoolManager.getActiveCode();
          if (activeCode) {
            const loaded = await globalThis.NeprasSchoolManager.loadSchoolStats(activeCode);
            if (Array.isArray(loaded?.students) && loaded.students.length) {
              window.neprasCachedStudentsList = loaded.students;
              updateSmartAnalyticsStatus();
              return window.neprasCachedStudentsList;
            }
          }
        }
        const stored = await chrome.storage.local.get(["neprasCachedStudentsList", "neprasSchoolStatsV1"]);
        const stats = stored?.neprasSchoolStatsV1;
        const activeCode = globalThis.NeprasSchoolManager ? await globalThis.NeprasSchoolManager.getActiveCode() : "";
        const statsSchool = stats ? String(stats.schoolCode || stats.schoolKey || stats.code || "").replace(/\D/g, "") : "";

        const isMatch = !activeCode || !statsSchool || statsSchool === activeCode ||
        (globalThis.NeprasSchoolManager?.isSameSchool ? globalThis.NeprasSchoolManager.isSameSchool(statsSchool, activeCode) : false) ||
        (statsSchool === "21024219" && activeCode === "972133") ||
        (statsSchool === "972133" && activeCode === "21024219");

      if (isMatch) {
          if (Array.isArray(stored?.neprasCachedStudentsList) && stored.neprasCachedStudentsList.length) {
            window.neprasCachedStudentsList = stored.neprasCachedStudentsList;
            updateSmartAnalyticsStatus();
            return window.neprasCachedStudentsList;
          }
          const list = stats?.detailRows || stats?.rows;
          if (Array.isArray(list) && list.length) {
            window.neprasCachedStudentsList = list;
            updateSmartAnalyticsStatus();
            return window.neprasCachedStudentsList;
          }
        }
      } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
      return [];
    }

    if (btnAnalyticsRefresh) {
      btnAnalyticsRefresh.addEventListener("click", () => {
        if (btnSchoolStatsRefresh) {
          btnSchoolStatsRefresh.click();
        } else {
          showNeprasPopupNotice("افتح موقع بيانات الطلاب أولاً لتحديث بيانات المدرسة.", "info", "تنبيه");
        }
      });
    }

    async function ensureStudentsOrPrompt() {
      const students = await getOrLoadStudents();
      if (students.length) return students;
      const ok = window.neprasDialog?.confirm
        ? await window.neprasDialog.confirm(
            "لم يتم تنزيل أو حفظ بيانات طلاب المدرسة الشاملة بعد.\n\nهل ترغب في تنزيل وتحديث بيانات المدرسة الشاملة الآن من منظومة الوزارة للبدء في المراجعة والتقارير الإحصائية؟",
            { title: "تحديث بيانات الطلاب الشاملة مطلوب", okText: "تنزيل وتحديث البيانات الشاملة الآن", cancelText: "إلغاء" }
          )
        : false;
      if (ok) {
        if (typeof triggerSchoolDeepExtraction === "function") {
          triggerSchoolDeepExtraction();
        } else if (btnSchoolStatsRefresh) {
          btnSchoolStatsRefresh.click();
        }
      } else if (!window.neprasDialog?.confirm) {
        showNeprasPopupNotice("قم بتنزيل أو تحديث بيانات الطلاب أولاً بالضغط على «تحديث البيانات الشاملة للمدرسة».", "info", "تنبيه");
      }
      return null;
    }

    if (btnAnalyticsDataGuard) {
      btnAnalyticsDataGuard.addEventListener("click", async () => {
        const students = await ensureStudentsOrPrompt();
        if (!students || !students.length) return;
        if (window.NeprasSmartAnalytics) {
          const report = window.NeprasSmartAnalytics.auditDataGuard(students);
          if (smartAnalyticsResult) {
            smartAnalyticsResult.hidden = false;
            smartAnalyticsResult.innerHTML = `
              <div style="font-weight:bold;color:var(--n-primary,#0284c7);margin-bottom:6px;border-bottom:1px solid var(--n-border,#e2e8f0);padding-bottom:4px;">🛡️ تقرير مراجعة وتدقيق جودة البيانات:</div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:11px;">
                <div>🔹 الطلاب المفحوصون: <b>${/* html-safe */ Number(report.totalStudents || 0)}</b></div>
                <div>🔹 أرقام قومية سليمة: <b>${/* html-safe */ Number(report.validNidCount || 0)} (${/* html-safe */ Number(report.validNidRate || 0)}%)</b></div>
                <div>🔹 نقص اسم الأم: <b>${/* html-safe */ Number(report.missingMotherNameCount || 0)}</b></div>
                <div>🔹 نقص رقم المحمول: <b>${/* html-safe */ Number(report.missingPhoneCount || 0)}</b></div>
              </div>
              <div style="margin-top:6px;font-size:11px;color:${Number(report.issuesCount || 0) > 0 ? '#b91c1c' : '#15803d'};font-weight:bold;">
                ${Number(report.issuesCount || 0) > 0 ? `⚠️ تم رصد ${/* html-safe */ Number(report.issuesCount || 0)} ملاحظة/تناقض تدقيق بحاجة للمراجعة.` : '✅ جميع السجلات سليمة ومتطابقة 100%.'}
              </div>
            `;
          }
          showNeprasPopupNotice(`اكتمل التدقيق: وُجدت ${report.issuesCount} ملاحظة تدقيق.`, "success", "مراجعة وتدقيق البيانات");
        }
      });
    }

    if (btnAnalyticsSiblings) {
      btnAnalyticsSiblings.addEventListener("click", async () => {
        const students = await ensureStudentsOrPrompt();
        if (!students || !students.length) return;
        if (window.NeprasSmartAnalytics) {
          const result = window.NeprasSmartAnalytics.analyzeSiblings(students);
          if (smartAnalyticsResult) {
            smartAnalyticsResult.hidden = false;
            smartAnalyticsResult.innerHTML = `
              <div style="font-weight:bold;color:var(--n-primary,#0284c7);margin-bottom:6px;border-bottom:1px solid var(--n-border,#e2e8f0);padding-bottom:4px;">\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466} إحصائية وحصر الأشقاء والإخوة بالمدرسة:</div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:11px;">
                <div>🔹 إجمالي حالات التقارب: <b>${/* html-safe */ Number(result.groupsCount || 0)}</b></div>
                <div>🔹 أشقاء (أب وأم): <b>${/* html-safe */ Number(result.fullSiblingsCount || 0)}</b></div>
                <div>🔹 أشقاء (ملاحظة إملائية): <b>${/* html-safe */ Number(result.fullSiblingsWithSpellingWarnCount || 0)}</b></div>
                <div>🔹 إخوة من الأب: <b>${/* html-safe */ Number(result.halfSiblingsCount || 0)}</b></div>
              </div>
            `;
          }
          showNeprasPopupNotice(`تم حصر ${result.groupsCount} علاقة أسرية وأخوة بالمدرسة.`, "success", "إحصائية الأشقاء");
        }
      });
    }

    if (btnAnalyticsExportAll) {
      btnAnalyticsExportAll.addEventListener("click", async () => {
        const students = await ensureStudentsOrPrompt();
        if (!students || !students.length) return;
        if (!window.NeprasSmartAnalytics) return;

        try {
          const schoolInfo = await getSchoolHeaderContext();
          const sheetSpecs = window.NeprasSmartAnalytics.buildComprehensiveAnalyticsSheetSpecs(students, schoolInfo);

          if (typeof globalThis.neprasBuildMultiSheetWorkbook === "function") {
            const buffer = globalThis.neprasBuildMultiSheetWorkbook(sheetSpecs);
            const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
            await neprasUnifiedDownload(blob, "التحليلات_الإحصائية_الشاملة_للمدرسة.xlsx", "التحليلات والإحصاء", "تم تصدير كتاب التحليلات الشاملة المعتمد Excel بنجاح.");
            showNeprasPopupNotice("تم إنشاء كتاب التحليلات الشاملة (7 أوراق عمل منسقة) بنجاح.", "success", "تصدير التحليلات الشاملة");
            return;
          }

          if (typeof XLSX !== "undefined") {
            const wb = XLSX.utils.book_new();
            sheetSpecs.forEach((spec) => {
              const ws = XLSX.utils.aoa_to_sheet([spec.headers, ...spec.rows]);
              ws["!views"] = [{ RTL: true }];
              XLSX.utils.book_append_sheet(wb, ws, spec.name);
            });
            await neprasUnifiedDownloadXlsx(wb, "التحليلات_الإحصائية_الشاملة_للمدرسة.xlsx", "التحليلات والإحصاء", "تم تصدير كتاب التحليلات الشاملة Excel بنجاح.");
          }
        } catch (err) {
          showNeprasPopupNotice("تعذر تصدير التحليلات الشاملة: " + (err?.message || String(err)), "error", "خطأ");
        }
      });
    }

    // إنذارات الغياب المطوّرة
    const btnWarningsScrapeTab = document.getElementById("btn-warnings-scrape-tab");
    const btnWarningsClearCache = document.getElementById("btn-warnings-clear-cache");
    const btnWarningsPrint = document.getElementById("btn-warnings-print");
    const btnWarningsDoc = document.getElementById("btn-warnings-doc");
    const btnWarningsPreview = document.getElementById("btn-warnings-preview");
    const warningsExcelFileInput = document.getElementById("warnings-excel-file-input");
    const warningsPdfFileInput = document.getElementById("warnings-pdf-file-input");
    const btnOpenAbsenceReportPage = document.getElementById("btn-open-absence-report-page");
    const btnOpenTrainingDashboard = document.getElementById("btn-open-training-dashboard");
    const warningsTotalCached = document.getElementById("warnings-total-cached");
    const warningsCountFirst = document.getElementById("warnings-count-first");
    const warningsCountSecond = document.getElementById("warnings-count-second");
    const warningsCountFinal = document.getElementById("warnings-count-final");
    const selAbsenceMode = document.getElementById("sel-absence-mode");
    const lblWarningFirst = document.getElementById("lbl-warning-first");
    const lblWarningSecond = document.getElementById("lbl-warning-second");
    const lblWarningThird = document.getElementById("lbl-warning-third");
    const lblWarningFinal = document.getElementById("lbl-warning-final");
    const warningsCountThird = document.getElementById("warnings-count-third");
    const btnWarningsExpulsionDecision = document.getElementById("btn-warnings-expulsion-decision");
    const warningsStatusNote = document.getElementById("warnings-status-note");

    const absenceDetailModal = document.getElementById("absence-detail-modal");
    const absenceDetailClose = document.getElementById("absence-detail-close");
    const absenceDetailCount = document.getElementById("absence-detail-count");
    const absenceDetailSearch = document.getElementById("absence-detail-search");
    const absenceDetailExport = document.getElementById("absence-detail-export");
    const absenceDetailBody = document.getElementById("absence-detail-body");

    let currentAbsenceFullList = [];

    async function getAllStudentsForAbsence() {
      // 1. فحص الكاش المباشر
      let baseList = [];
      if (Array.isArray(window.neprasCachedStudentsList) && window.neprasCachedStudentsList.length) {
        baseList = window.neprasCachedStudentsList;
      } else {
        try {
          const stored = await chrome.storage.local.get(["neprasCachedStudentsList", "neprasSchoolStatsV1"]);
          baseList = Array.isArray(stored?.neprasCachedStudentsList) && stored.neprasCachedStudentsList.length
            ? stored.neprasCachedStudentsList
            : (stored?.neprasSchoolStatsV1?.detailRows || []);
          if (baseList.length) window.neprasCachedStudentsList = baseList;
        } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
      }

      // 2. فحص كاش الغياب المخصص neprasCachedAbsenceList
      let absenceList = [];
      if (Array.isArray(window.neprasCachedAbsenceList) && window.neprasCachedAbsenceList.length) {
        absenceList = window.neprasCachedAbsenceList;
      } else {
        try {
          const stored = await chrome.storage.local.get("neprasCachedAbsenceList");
          if (Array.isArray(stored?.neprasCachedAbsenceList) && stored.neprasCachedAbsenceList.length) {
            absenceList = stored.neprasCachedAbsenceList;
            window.neprasCachedAbsenceList = absenceList;
          }
        } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
      }

      // دمج أيام الغياب بناءً على كود الطالب
      const absenceMap = new Map();
      for (const a of absenceList) {
        const c = String(a.code || a['كود الطالب'] || a['كود التلميذ'] || '').trim();
        const d = parseInt(a.absenceDays || a.days || a['أيام الغياب'] || a['الغياب'] || 0, 10);
        if (c) absenceMap.set(c, isNaN(d) ? 0 : d);
      }

      const merged = [];
      const seenCodes = new Set();

      for (const s of baseList) {
        const code = String(s.code || s['كود الطالب'] || s['كود التلميذ'] || '').trim();
        let days = parseInt(s.absenceDays || s.days || s['أيام الغياب'] || s['الغياب'] || 0, 10);
        if (absenceMap.has(code)) {
          days = absenceMap.get(code);
        }
        if (isNaN(days)) days = 0;
        seenCodes.add(code);
        merged.push({
          code,
          name: String(s.name || s['اسم الطالب'] || s['اسم التلميذ'] || '').trim(),
          grade: String(s.grade || s['الصف'] || '').trim(),
          className: String(s.className || s['الفصل'] || '').trim(),
          absenceDays: days
        });
      }

      // إضافة أي طلاب موجودين في كشف الغياب وغير مسجلين في كاش المدرسة الأساسي
      for (const a of absenceList) {
        const code = String(a.code || a['كود الطالب'] || a['كود التلميذ'] || '').trim();
        if (code && !seenCodes.has(code)) {
          const days = parseInt(a.absenceDays || a.days || a['أيام الغياب'] || a['الغياب'] || 0, 10);
          merged.push({
            code,
            name: String(a.name || a['اسم الطالب'] || a['اسم التلميذ'] || '').trim(),
            grade: String(a.grade || a['الصف'] || '').trim(),
            className: String(a.className || a['الفصل'] || '').trim(),
            absenceDays: isNaN(days) ? 0 : days
          });
        }
      }

      currentAbsenceFullList = merged;
      return merged;
    }

    async function updateAbsenceWarningsUI() {
      const list = await getAllStudentsForAbsence();
      if (!warningsTotalCached) return;

      const currentMode = selAbsenceMode ? selAbsenceMode.value : "CONTINUOUS";
      const isDiscontinuous = currentMode === "DISCONTINUOUS";

      if (lblWarningFirst) lblWarningFirst.textContent = isDiscontinuous ? "إنذار 1 (7 أيام)" : "إنذار 1 (5 أيام)";
      if (lblWarningSecond) lblWarningSecond.textContent = isDiscontinuous ? "إنذار 2 (14 يوم)" : "إنذار 2 (10 أيام)";
      if (lblWarningThird) lblWarningThird.textContent = isDiscontinuous ? "إنذار 3 (21 يوم)" : "إنذار 3 (12 يوم)";
      if (lblWarningFinal) lblWarningFinal.textContent = isDiscontinuous ? "فصل (30+ يوم)" : "فصل (15+ يوم)";

      const summary = window.NeprasAbsenceWarnings?.summarizeAbsence
        ? window.NeprasAbsenceWarnings.summarizeAbsence(list, { mode: currentMode })
        : { total: list.length, withAbsence: 0, first: 0, second: 0, third: 0, final: 0, eligibleCount: 0, maxDays: 0, eligibleList: [] };

      warningsTotalCached.textContent = `الطلاب: ${summary.total}`;
      if (warningsCountFirst) warningsCountFirst.textContent = summary.first;
      if (warningsCountSecond) warningsCountSecond.textContent = summary.second;
      if (warningsCountThird) warningsCountThird.textContent = summary.third || 0;
      if (warningsCountFinal) warningsCountFinal.textContent = summary.final;

      const schoolNameInput = document.getElementById("sc-meta-school");
      const warningsSchoolNameBadge = document.getElementById("warnings-school-name-badge");
      if (warningsSchoolNameBadge) {
        warningsSchoolNameBadge.textContent = schoolNameInput?.value?.trim() || "المدرسة الحالية";
      }

      if (warningsStatusNote) {
        const minDays = isDiscontinuous ? 7 : 5;
        if (summary.total === 0) {
          warningsStatusNote.innerHTML = '<span style="color:#d97706;font-weight:700;">●</span> لا توجد بيانات طلاب محفوظة حاليًا للمدرسة. حدّث بيانات المدرسة أولاً.';
        } else if (summary.withAbsence === 0) {
          warningsStatusNote.innerHTML = `<span style="color:#2563eb;font-weight:700;">ℹ️</span> تم تحميل <b>${summary.total}</b> طالب، ولكن كشف الوزارة الأساسي لا يتضمن أيام الغياب. اضغط «⚡ سحب وتحليل تقرير غياب الوزارة تلقائيًا (PDF)» أدناه لجلب الغياب وتفعيل الإنذارات فوراً.`;
        } else if (summary.eligibleCount === 0) {
          warningsStatusNote.innerHTML = `<span style="color:#16a34a;font-weight:700;">✅</span> تم فحص غياب <b>${summary.withAbsence}</b> طالب، وأعلى غياب مسجل هو <b>${summary.maxDays}</b> أيام. لا يوجد أي طالب تجاوز حد الإنذار (${minDays} أيام فأكثر).`;
        } else {
          warningsStatusNote.innerHTML = `<span style="color:#dc2626;font-weight:700;">⚠️</span> يوجد <b>${summary.eligibleCount}</b> طالب مستحق للإنذارات الرسمية (أول: ${summary.first} • ثانٍ: ${summary.second} • ثالث: ${summary.third || 0} • فصل: ${summary.final}) من إجمالي ${summary.total} طالب.`;
        }
      }
    }
    if (selAbsenceMode) {
      selAbsenceMode.addEventListener("change", () => {
        updateAbsenceWarningsUI();
      });
    }
    window.updateAbsenceWarningsUI = updateAbsenceWarningsUI;

    function renderAbsenceDetailRows(students, query = "") {
      if (!absenceDetailBody) return;
      const q = String(query || "").trim().toLowerCase();
      const filtered = students.filter(s => {
        if (!q) return true;
        return (s.name && s.name.toLowerCase().includes(q)) ||
               (s.code && s.code.includes(q)) ||
               (s.grade && s.grade.includes(q)) ||
               (s.className && s.className.includes(q));
      });

      if (absenceDetailCount) {
        absenceDetailCount.textContent = `${filtered.length} من أصل ${students.length} طالب`;
      }

      if (!filtered.length) {
        absenceDetailBody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:16px;color:#64748b;">لا توجد نتائج مطابقة لبحثك.</td></tr>';
        return;
      }

      let html = "";
      filtered.forEach((s, idx) => {
        const days = Number(s.absenceDays) || 0;
        let badgeHtml = "";
        let rowBg = "";
        if (days >= 15) {
          badgeHtml = '<span style="background:#fee2e2;color:#991b1b;padding:3px 8px;border-radius:12px;font-weight:700;font-size:11px;">🔴 إنذار بالفصل (15+)</span>';
          rowBg = 'background:rgba(254,226,226,0.15);';
        } else if (days >= 10) {
          badgeHtml = '<span style="background:#ffedd5;color:#9a3412;padding:3px 8px;border-radius:12px;font-weight:700;font-size:11px;">🟠 إنذار ثانٍ (10-14)</span>';
          rowBg = 'background:rgba(255,237,213,0.15);';
        } else if (days >= 5) {
          badgeHtml = '<span style="background:#fef3c7;color:#92400e;padding:3px 8px;border-radius:12px;font-weight:700;font-size:11px;">🟡 إنذار أول (5-9)</span>';
          rowBg = 'background:rgba(254,243,199,0.15);';
        } else if (days > 0) {
          badgeHtml = `<span style="background:#f1f5f9;color:#475569;padding:3px 8px;border-radius:12px;font-size:11px;">دون حد الإنذار (${days} أيام)</span>`;
        } else {
          badgeHtml = '<span style="background:#f0fdf4;color:#166534;padding:3px 8px;border-radius:12px;font-size:11px;">منتظم (0 غياب)</span>';
        }

        html += `<tr style="${rowBg}">
          <td style="text-align:center;">${idx + 1}</td>
          <td style="font-family:monospace;direction:ltr;text-align:center;">${escapeHtml(s.code)}</td>
          <td style="font-weight:600;">${escapeHtml(s.name || "—")}</td>
          <td style="text-align:center;">${escapeHtml(s.grade || "—")}</td>
          <td style="text-align:center;">${escapeHtml(s.className || "—")}</td>
          <td style="text-align:center;font-weight:700;font-size:12px;">${days}</td>
          <td style="text-align:center;">${badgeHtml}</td>
        </tr>`;
      });

      absenceDetailBody.innerHTML = html;
    }

    // زر معاينة كشف الغياب
    
    const btnWarningsDownloadTemplate = document.getElementById("btn-warnings-download-template");
    if (btnWarningsDownloadTemplate) {
      btnWarningsDownloadTemplate.addEventListener("click", async () => {
        try {
          const list = await getAllStudentsForAbsence();
          if (!list || !list.length) {
            showNeprasPopupNotice("لا توجد بيانات طلاب مسجلة حالياً لتحميل النموذج. قم بتحديث بيانات المدرسة أولاً.", "warning", "تنبيه");
            return;
          }
          if (typeof XLSX === "undefined") {
            showNeprasPopupNotice("مكتبة Excel غير محملة.", "error", "خطأ");
            return;
          }
          const schoolInfo = await getSchoolHeaderContext();
          const wb = window.NeprasAbsenceWarnings?.buildAbsenceTemplateWorkbook
            ? window.NeprasAbsenceWarnings.buildAbsenceTemplateWorkbook(list, schoolInfo, XLSX)
            : null;
          if (!wb) {
            showNeprasPopupNotice("تعذر إنشاء نموذج رصد الغياب.", "error", "خطأ");
            return;
          }
          const fileName = `نموذج_رصد_غياب_${schoolInfo.schoolName || 'المدرسة'}.xlsx`;
          await neprasUnifiedDownloadXlsx(wb, fileName, "كشف الغياب", "تم تحميل نموذج رصد الغياب بنجاح. املأ عمود الغياب ثم ارفعه عبر زر «استيراد كشف غياب Excel».");
        } catch (err) {
          showNeprasPopupNotice("حدث خطأ أثناء إعداد نموذج الغياب: " + (err?.message || String(err)), "error", "خطأ");
        }
      });
    }

    if (btnWarningsPreview) {
      btnWarningsPreview.addEventListener("click", async () => {
        const students = await getAllStudentsForAbsence();
        if (!students.length) {
          showNeprasPopupNotice("لا توجد بيانات طلاب مسجلة حاليًا بالمدرسة لمعاينتها.", "info", "كشف الغياب");
          return;
        }
        if (absenceDetailSearch) absenceDetailSearch.value = "";
        renderAbsenceDetailRows(students);
        if (absenceDetailModal) {
          absenceDetailModal.hidden = false;
          window.neprasTrapFocus?.(absenceDetailModal);
        }
      });
    }

    // إغلاق نافذة المعاينة
    function closeAbsenceDetailModal() {
      if (absenceDetailModal) {
        absenceDetailModal.hidden = true;
        window.neprasReleaseFocusTrap?.(absenceDetailModal);
      }
    }
    absenceDetailClose?.addEventListener("click", closeAbsenceDetailModal);
    absenceDetailModal?.addEventListener("click", e => {
      if (e.target === absenceDetailModal) closeAbsenceDetailModal();
    });

    absenceDetailSearch?.addEventListener("input", e => {
      renderAbsenceDetailRows(currentAbsenceFullList, e.target.value);
    });

    // تصدير كشف الغياب إلى Excel
    absenceDetailExport?.addEventListener("click", async () => {
      if (!currentAbsenceFullList || !currentAbsenceFullList.length) {
        showNeprasPopupNotice("لا توجد بيانات غياب لتصديرها.", "warning", "تنبيه");
        return;
      }
      try {
        const schoolInfo = await getSchoolHeaderContext();
        const rows = [
          ["م", "كود الطالب", "اسم الطالب", "الصف", "الفصل", "أيام الغياب", "الموقف من الإنذار"]
        ];
        currentAbsenceFullList.forEach((s, idx) => {
          const days = Number(s.absenceDays) || 0;
          let level = "منتظم";
          if (days >= 15) level = "إنذار بالفصل (15+)";
          else if (days >= 10) level = "إنذار ثانٍ (10-14)";
          else if (days >= 5) level = "إنذار أول (5-9)";
          else if (days > 0) level = `غياب دون حد الإنذار (${days} أيام)`;
          rows.push([idx + 1, s.code, s.name, s.grade, s.className, days, level]);
        });

        if (typeof XLSX !== "undefined") {
          const ws = XLSX.utils.aoa_to_sheet(rows);
          ws["!cols"] = [{ wch: 6 }, { wch: 15 }, { wch: 30 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 22 }];
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, "كشف الغياب والإنذارات");
          const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
          const blob = new Blob([wbout], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
          const fname = `كشف_الغياب_والإنذارات_${schoolInfo.schoolName || 'المدرسة'}_${(globalThis.NeprasEgypt?.todayStamp?.() || '2026')}.xlsx`;
          await neprasUnifiedDownload(blob, fname, "كشف الغياب", "تم تصدير كشف الغياب والإنذارات بنجاح.");
        }
      } catch (err) {
        showNeprasPopupNotice("حدث خطأ أثناء تصدير Excel: " + (err?.message || String(err)), "error", "خطأ");
      }
    });

    // استيراد كشف غياب Excel خارجي
    if (warningsExcelFileInput) {
      warningsExcelFileInput.addEventListener("change", async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
          const buffer = await file.arrayBuffer();
          if (typeof XLSX === "undefined") {
            showNeprasPopupNotice("مكتبة قراءة ملفات Excel غير محملة.", "error", "خطأ");
            return;
          }
          const wb = XLSX.read(buffer, { type: "array" });
          const firstSheet = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
          const parsed = window.NeprasAbsenceWarnings?.parseAbsenceExcel(rows) || [];

          if (!parsed.length) {
            showNeprasPopupNotice("لم يتم العثور على أعمدة كود الطالب وأيام الغياب داخل الملف. يرجى التأكد من محتويات الشيت.", "warning", "ملف غير مطابق");
            return;
          }

          // حفظ كشف الغياب المخصص في storage
          await chrome.storage.local.set({ neprasCachedAbsenceList: parsed });
          window.neprasCachedAbsenceList = parsed;

          await updateAbsenceWarningsUI();
          showNeprasPopupNotice(`تم استيراد أيام الغياب لـ (${parsed.length}) طالب بنجاح! تم تحديث كروت وموقف الإنذارات فورًا.`, "success", "تم الاستيراد بنجاح");
        } catch (err) {
          showNeprasPopupNotice("فشل قراءة ملف Excel: " + (err?.message || String(err)), "error", "خطأ في الملف");
        } finally {
          warningsExcelFileInput.value = "";
        }
      });
    }

    // فتح صفحة تقارير غياب الطلاب بالوزارة داخل نفس جلسة التبويب (Angular SPA) دون طلب تسجيل دخول جديد
    if (btnOpenAbsenceReportPage) {
      btnOpenAbsenceReportPage.addEventListener("click", async () => {
        await neprasNavigateStudentSpa({
          targetUrl: "https://student.emis.gov.eg/absence/report",
          routeMatch: "/absence/report"
        });
      });
    }

    // فتح لوحة الوزارة لمنصة التدريب داخل نفس جلسة التبويب (Angular SPA) دون طلب تسجيل دخول جديد
    if (btnOpenTrainingDashboard) {
      btnOpenTrainingDashboard.addEventListener("click", async () => {
        await neprasNavigateStudentSpa({
          targetUrl: "https://student.emis.gov.eg/dashboard",
          routeMatch: "/dashboard"
        });
      });
    }

    // السحب والتحليل التلقائي لتقرير غياب الوزارة الرسمي (PDF) بضغطة واحدة
    const btnWarningsAutoFetchPdf = document.getElementById("btn-warnings-auto-fetch-pdf");
    async function processAbsencePdfBuffers(buffers) {
      if (!window.pdfjsLib) {
        showNeprasPopupNotice("مكتبة معالجة ملفات PDF غير متوفرة في بيئة التشغيل.", "error", "خطأ");
        return false;
      }
      if (!window.pdfjsLib.GlobalWorkerOptions?.workerSrc) {
        try {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("pdf.worker.js");
        } catch (_) {}
      }

      const parsedReports = [];
      for (const buffer of buffers) {
        const rep = await window.NeprasAbsencePdfParser.parseAbsencePdf(window.pdfjsLib, buffer);
        if (rep && rep.students && rep.students.length) {
          parsedReports.push(rep);
        }
      }

      if (!parsedReports.length) {
        showNeprasPopupNotice("لم يتم العثور على جداول غياب رسمية صالحة داخل ملف الـ PDF. يرجى التأكد من أن التقرير هو «رصد الغياب بأسماء الطلاب حسب الفصل».", "warning", "ملف غير مطابق");
        return false;
      }

      const merged = window.NeprasAbsencePdfParser.mergeAbsenceReports(parsedReports);
      const studentList = merged.students;

      await chrome.storage.local.set({ neprasCachedAbsenceList: studentList });
      window.neprasCachedAbsenceList = studentList;

      if (merged.meta && (merged.meta.school || merged.meta.administration)) {
        try {
          const currentStats = (await chrome.storage.local.get("neprasSchoolStatsV1"))?.neprasSchoolStatsV1 || {};
          currentStats.meta = Object.assign({}, currentStats.meta || {}, {
            school: merged.meta.school || currentStats.meta?.school,
            edara: merged.meta.administration || currentStats.meta?.edara,
            administration: merged.meta.administration || currentStats.meta?.administration,
            governorate: merged.meta.governorate || currentStats.meta?.governorate,
            academicYear: merged.meta.academicYear || currentStats.meta?.academicYear
          });
          await chrome.storage.local.set({ neprasSchoolStatsV1: currentStats });
        } catch (_) {}
      }

      await updateAbsenceWarningsUI();
      showNeprasPopupNotice(`تم سحب وتحليل تقرير غياب الوزارة بنجاح لـ (${studentList.length}) طالباً! تم مطابقة أيام الغياب وتحديث الإنذارات فوراً.`, "success", "اكتمل تحليل الغياب");
      return true;
    }

    if (btnWarningsAutoFetchPdf) {
      btnWarningsAutoFetchPdf.addEventListener("click", () => {
        const run = async () => {
          showNeprasPopupNotice("جاري فتح صفحة تقارير الغياب بالوزارة والضغط على «رصد الغياب بأسماء الطلاب حسب الفصل» تلقائياً...", "info", "سحب تقرير الغياب");
          const dlRes = await neprasAutoDownloadMinistryPdf({
            targetUrl: "https://student.emis.gov.eg/absence/report",
            routeMatch: "/absence/report",
            selector: ".buttonBlock button, button.btn-success, .btn-success, a.btn-success, button",
            textMatch: "رصد الغياب"
          });
          if (!dlRes || !dlRes.ok || !dlRes.base64) {
            showNeprasPopupNotice(
              dlRes?.message || "تعذر سحب ملف تقرير الغياب تلقائياً. يمكنك اختياره عبر زر «اختيار ملف PDF من الجهاز يدوياً».",
              "warning",
              "تنبيه سحب الغياب"
            );
            return;
          }
          try {
            const bytes = neprasBase64ToUint8Array(dlRes.base64);
            await processAbsencePdfBuffers([bytes.buffer]);
          } catch (err) {
            showNeprasPopupNotice("حدث خطأ أثناء تحليل ملف الـ PDF المسحوب: " + (err?.message || String(err)), "error", "خطأ في التحليل");
          }
        };
        window.withButtonBusy ? window.withButtonBusy(btnWarningsAutoFetchPdf, run) : run();
      });
    }

    // استيراد تقرير غياب الوزارة الرسمي (PDF) وتوليد الإنذارات فورًا
    if (warningsPdfFileInput) {
      warningsPdfFileInput.addEventListener("change", async (e) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        try {
          if (!window.pdfjsLib) {
            showNeprasPopupNotice("مكتبة معالجة ملفات PDF غير متوفرة في بيئة التشغيل.", "error", "خطأ");
            return;
          }
          if (!window.pdfjsLib.GlobalWorkerOptions?.workerSrc) {
            try {
              window.pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("pdf.worker.js");
            } catch (_) {}
          }

          const parsedReports = [];
          for (let i = 0; i < files.length; i++) {
            const f = files[i];
            const buffer = await f.arrayBuffer();
            const rep = await window.NeprasAbsencePdfParser.parseAbsencePdf(window.pdfjsLib, buffer);
            if (rep && rep.students && rep.students.length) {
              parsedReports.push(rep);
            }
          }

          if (!parsedReports.length) {
            showNeprasPopupNotice("لم يتم العثور على جداول غياب رسمية صالحة داخل ملف الـ PDF. يرجى التأكد من اختيار تقرير «رصد الغياب بأسماء الطلاب حسب الفصل» الصادر من الوزارة.", "warning", "ملف غير مطابق");
            return;
          }

          const merged = window.NeprasAbsencePdfParser.mergeAbsenceReports(parsedReports);
          const studentList = merged.students;

          // حفظ كشف الغياب المستخرج في storage
          await chrome.storage.local.set({ neprasCachedAbsenceList: studentList });
          window.neprasCachedAbsenceList = studentList;

          // تحديث بيانات الترويسة المدرسية إن وجدت في التقرير
          if (merged.meta && (merged.meta.school || merged.meta.administration)) {
            try {
              const currentStats = (await chrome.storage.local.get("neprasSchoolStatsV1"))?.neprasSchoolStatsV1 || {};
              currentStats.meta = Object.assign({}, currentStats.meta || {}, {
                school: merged.meta.school || currentStats.meta?.school,
                edara: merged.meta.administration || currentStats.meta?.edara,
                administration: merged.meta.administration || currentStats.meta?.administration,
                governorate: merged.meta.governorate || currentStats.meta?.governorate,
                academicYear: merged.meta.academicYear || currentStats.meta?.academicYear
              });
              await chrome.storage.local.set({ neprasSchoolStatsV1: currentStats });
            } catch (_) {}
          }

          await updateAbsenceWarningsUI();
          showNeprasPopupNotice(`تم استيراد تقرير غياب الوزارة بنجاح لـ (${studentList.length}) طالباً! تم مطابقة أيام الغياب مع الموقع بدقة 100% وتحديث الإنذارات فوراً.`, "success", "تم الاستيراد بنجاح");
        } catch (err) {
          showNeprasPopupNotice("فشل قراءة تقرير الغياب (PDF): " + (err?.message || String(err)), "error", "خطأ في قراءة الـ PDF");
        } finally {
          warningsPdfFileInput.value = "";
        }
      });
    }

    async function getSchoolHeaderContext() {
      try {
        let meta = null;
        if (globalThis.NeprasSchoolManager?.loadSchoolMeta) {
          meta = await globalThis.NeprasSchoolManager.loadSchoolMeta();
        }
        if (!meta || (!meta.schoolName && !meta.school)) {
          const stored = await chrome.storage.local.get(["nepras_report_header_meta", "neprasSchoolStatsV1"]);
          meta = stored?.nepras_report_header_meta || stored?.neprasSchoolStatsV1?.meta || {};
        }
        if (!meta?.schoolName && !meta?.school) {
          const storedStats = (await chrome.storage.local.get("neprasSchoolStatsV1"))?.neprasSchoolStatsV1;
          if (storedStats?.schoolName) {
            meta = Object.assign({}, meta || {}, {
              schoolName: storedStats.schoolName,
              governorate: storedStats.directorate || storedStats.governorate,
              administration: storedStats.administration
            });
          }
        }
        return {
          schoolName: meta?.schoolName || meta?.school || "....................",
          school: meta?.schoolName || meta?.school || "....................",
          governorate: meta?.governorate || meta?.directorate || "....................",
          directorate: meta?.directorate || meta?.governorate || "....................",
          administration: meta?.administration || meta?.edara || "....................",
          edara: meta?.administration || meta?.edara || "....................",
          academicYear: meta?.academicYear || ((globalThis.NeprasEgypt?.academicYearLabel?.() || "2026 / 2027") + " م"),
          logo: currentSchoolLogo || meta?.logo || meta?.schoolLogo || null
        };
      } catch (_) {
        return { schoolName: "....................", governorate: "....................", administration: "....................", logo: currentSchoolLogo || null };
      }
    }

    if (btnWarningsScrapeTab) {
      btnWarningsScrapeTab.addEventListener("click", async () => {
        let activeTab = null;
        try {
          const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tabs[0]?.url && /absence|attendance/i.test(tabs[0].url)) {
            activeTab = tabs[0];
          } else {
            const allTabs = await chrome.tabs.query({});
            activeTab = allTabs.find(t => /absence|attendance/i.test(t.url || "") && !/excuse|generouslineage/i.test(t.url || "")) || tabs[0];
          }
        } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }

        if (!activeTab?.id) {
          showNeprasPopupNotice("لا يوجد تبويب نشط حالياً. يرجى فتح صفحة تسجيل غياب الطلاب بالوزارة أولاً.", "warning", "تنبيه");
          return;
        }

        // لو وجدنا تبويب الغياب مفتوحاً ولكنه ليس النشط، نفعّله ليرى المستخدم الصفحة
        if (activeTab.url && /absence|attendance/i.test(activeTab.url) && !activeTab.active) {
          try {
            await chrome.tabs.update(activeTab.id, { active: true });
          } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
        }

        try {
          // التأكد من جاهزية أدوات نبراس في التبويب
          try {
            await chrome.runtime.sendMessage({ action: "NEPRAS_REQUEST_SITE_INJECTION" });
          } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }

          const res = await chrome.tabs.sendMessage(activeTab.id, { action: "NEPRAS_SCRAPE_ATTENDANCE_TABLE" });
          if (!res || !res.ok) {
            showNeprasPopupNotice(
              res?.message || "تعذر العثور على جدول الغياب في التبويب الحالي. يرجى التأكد من اختيار الصف والفصل وعرض الطلاب بالصفحة.",
              "warning",
              "تنبيه استيراد الغياب"
            );
            return;
          }

          const scrapedStudents = res.students || [];
          if (!scrapedStudents.length) {
            showNeprasPopupNotice("الجدول المعروض بالصفحة لا يحتوي على صفوف بيانات للطلاب.", "warning", "جدول فارغ");
            return;
          }

          // قراءة كاش الغياب الحالي
          let stored = await chrome.storage.local.get("neprasCachedAbsenceList");
          let currentList = Array.isArray(stored?.neprasCachedAbsenceList) ? stored.neprasCachedAbsenceList : [];

          const currentMap = new Map();
          currentList.forEach(s => {
            const c = String(s.code || s['كود الطالب'] || s['كود التلميذ'] || '').trim();
            if (c) currentMap.set(c, s);
          });

          const hasOverlaps = scrapedStudents.some(s => currentMap.has(s.code));
          let shouldAccumulate = false;

          if (hasOverlaps && currentList.length > 0) {
            shouldAccumulate = window.confirm(
              `تم استيراد غياب (${scrapedStudents.length}) طالب من (${res.grade || ''} ${res.className || ''}).\n` +
              `يوجد غياب مسجل مسبقاً لبعض هؤلاء الطلاب في كاش الإنذارات.\n\n` +
              `اضغط [موافق OK] لإضافة الغياب تراكمياً (جمع أيام هذا الكشف إلى الرصيد السابق).\n` +
              `اضغط [إلغاء Cancel] لاعتماد وتحديث الأرقام المعروضة حالياً فقط كإجمالي جديد.`
            );
          }

          scrapedStudents.forEach(st => {
            if (currentMap.has(st.code)) {
              const prev = currentMap.get(st.code);
              const prevDays = parseInt(prev.absenceDays || prev.days || prev['أيام الغياب'] || 0, 10) || 0;
              const newDays = parseInt(st.absenceDays, 10) || 0;
              currentMap.set(st.code, {
                ...prev,
                ...st,
                absenceDays: shouldAccumulate ? (prevDays + newDays) : newDays
              });
            } else {
              currentMap.set(st.code, st);
            }
          });

          const updatedList = Array.from(currentMap.values());
          await chrome.storage.local.set({ neprasCachedAbsenceList: updatedList });
          window.neprasCachedAbsenceList = updatedList;

          await updateAbsenceWarningsUI();

          const withDays = updatedList.filter(s => (parseInt(s.absenceDays || 0, 10)) > 0).length;
          showNeprasPopupNotice(
            `تم استيراد وتحديث غياب (${scrapedStudents.length}) طالب من ${res.grade || ''} ${res.className || ''} بنجاح!\n` +
            `إجمالي المسجلين بكاش الغياب: ${updatedList.length} طالب (${withDays} لديهم أيام غياب مسجلة).`,
            "success",
            "تم تحديث الغياب والإنذارات"
          );
        } catch (err) {
          showNeprasPopupNotice("فشل الاتصال بتبويب الوزارة المفتوح: " + (err?.message || String(err)), "error", "خطأ");
        }
      });
    }

    if (btnWarningsClearCache) {
      btnWarningsClearCache.addEventListener("click", async () => {
        if (!confirm("هل أنت متأكد من رغبتك في تفريغ كاش الغياب المسجل للبدء من جديد؟")) return;
        await chrome.storage.local.remove("neprasCachedAbsenceList");
        window.neprasCachedAbsenceList = [];
        await updateAbsenceWarningsUI();
        showNeprasPopupNotice("تم تفريغ كاش الغياب بنجاح. يمكنك الآن استيراد أو تحديث كشوف جديدة.", "info", "تمت إعادة الضبط");
      });
    }

    if (btnWarningsExpulsionDecision) {
      btnWarningsExpulsionDecision.addEventListener("click", async () => {
        const list = await getAllStudentsForAbsence();
        if (!list.length) {
          showNeprasPopupNotice("لا توجد بيانات طلاب مسجلة حاليًا بالمدرسة.", "info", "تنبيه");
          return;
        }

        const currentMode = selAbsenceMode ? selAbsenceMode.value : "CONTINUOUS";
        const summary = window.NeprasAbsenceWarnings?.summarizeAbsence
          ? window.NeprasAbsenceWarnings.summarizeAbsence(list, { mode: currentMode })
          : { eligibleList: [] };

        const expelledList = summary.eligibleList.filter(s => s.level === 'إنذار بالفصل' || s.level === 'إخطار بالفصل');
        if (!expelledList.length) {
          const limitDays = currentMode === "DISCONTINUOUS" ? 30 : 15;
          showNeprasPopupNotice(`لا يوجد أي طالب استنفد المدة القانونية المقررة للفصل (${limitDays} يوماً فأكثر بدون عذر).`, "info", "القرار الإداري بالفصل");
          return;
        }

        const schoolInfo = await getSchoolHeaderContext();
        const html = window.NeprasAbsenceWarnings.buildExpulsionDecisionHtml(expelledList, schoolInfo, { mode: currentMode });
        const toolbarAndScript = `
<style>
  @media print { .nepras-print-toolbar { display: none !important; } }
  .nepras-print-toolbar {
    position: sticky; top: 0; z-index: 99999;
    background: #7f1d1d; color: #fff; padding: 10px 18px;
    display: flex; align-items: center; justify-content: space-between;
    font-family: 'Segoe UI', Tahoma, Arial, sans-serif; direction: rtl;
    box-shadow: 0 2px 10px rgba(0,0,0,0.2); margin-bottom: 12px;
  }
  .nepras-print-toolbar button {
    background: #b91c1c; color: #fff; border: 0; border-radius: 6px;
    padding: 7px 16px; font-weight: 700; font-size: 13px; cursor: pointer;
  }
  .nepras-print-toolbar button:hover { background: #991b1b; }
</style>
<div class="nepras-print-toolbar">
  <div style="font-weight:700;font-size:14px;">⚖️ القرار الإداري بفصل الطلاب لتجاوز مدة الغياب القانونية (${expelledList.length} طالب)</div>
  <button type="button" onclick="window.print()">🖨️ طباعة القرار الإداري الآن</button>
</div>
<script>
  window.addEventListener("DOMContentLoaded", function() {
    setTimeout(function() { window.print(); }, 350);
  });
</script>`;
        const enhancedHtml = html.includes("<body")
          ? html.replace(/<body[^>]*>/i, (m) => m + toolbarAndScript)
          : (toolbarAndScript + html);

        try {
          const blob = new Blob([enhancedHtml], { type: "text/html;charset=utf-8" });
          const blobUrl = URL.createObjectURL(blob);
          if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.create) {
            chrome.tabs.create({ url: blobUrl });
          } else {
            const printFrame = document.createElement("iframe");
            printFrame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
            document.body.appendChild(printFrame);
            printFrame.srcdoc = html;
            printFrame.onload = () => {
              try { printFrame.contentWindow.focus(); printFrame.contentWindow.print(); } catch (_) {}
              setTimeout(() => printFrame.remove(), 60000);
            };
          }
        } catch (err) {
          showNeprasPopupNotice("تعذر فتح نافذة الطباعة: " + (err?.message || String(err)), "error", "خطأ");
        }
      });
    }

    if (btnWarningsPrint) {
      btnWarningsPrint.addEventListener("click", async () => {
        const list = await getAllStudentsForAbsence();
        if (!list.length) {
          showNeprasPopupNotice("لا توجد بيانات طلاب مسجلة حاليًا بالمدرسة. راجع تبويب بيانات الطلاب وقم بتحديث بيانات المدرسة.", "info", "تنبيه");
          return;
        }

        const summary = window.NeprasAbsenceWarnings?.summarizeAbsence
          ? window.NeprasAbsenceWarnings.summarizeAbsence(list)
          : { eligibleList: [], maxDays: 0, withAbsence: 0 };

        if (!summary.eligibleList.length) {
          if (summary.withAbsence === 0) {
            showNeprasPopupNotice("لم تُسجل أي أيام غياب لطلاب المدرسة حتى الآن (كشف الوزارة الأساسي لا يشتمل على عمود الغياب تلقائياً). اضغط «⚡ سحب وتحليل تقرير غياب الوزارة تلقائيًا (PDF)» لجلب كشف الغياب الرسمي من موقع الوزارة.", "warning", "لا توجد أيام غياب");
          } else {
            showNeprasPopupNotice(`تم فحص جميع طلاب المدرسة (${list.length} طالب)، وتبين أن أعلى نسبة غياب مسجلة هي (${summary.maxDays}) أيام. لا يوجد أي طالب تجاوز الحد القانوني المقرر للإنذار (5 أيام فأكثر).`, "info", "إنذارات الغياب");
          }
          return;
        }

        const schoolInfo = await getSchoolHeaderContext();
        const currentMode = selAbsenceMode ? selAbsenceMode.value : "CONTINUOUS";
        const html = window.NeprasAbsenceWarnings.buildWarningsHtml(summary.eligibleList, schoolInfo, { mode: currentMode });
        const toolbarAndScript = `
<style>
  @media print { .nepras-print-toolbar { display: none !important; } }
  .nepras-print-toolbar {
    position: sticky; top: 0; z-index: 99999;
    background: #0f172a; color: #fff; padding: 10px 18px;
    display: flex; align-items: center; justify-content: space-between;
    font-family: 'Segoe UI', Tahoma, Arial, sans-serif; direction: rtl;
    box-shadow: 0 2px 10px rgba(0,0,0,0.2); margin-bottom: 12px;
  }
  .nepras-print-toolbar button {
    background: #2563eb; color: #fff; border: 0; border-radius: 6px;
    padding: 7px 16px; font-weight: 700; font-size: 13px; cursor: pointer;
  }
  .nepras-print-toolbar button:hover { background: #1d4ed8; }
</style>
<div class="nepras-print-toolbar">
  <div style="font-weight:700;font-size:14px;">🖨️ معاينة وطباعة إنذارات الغياب الرسمية (${summary.eligibleList.length} إنذار)</div>
  <button type="button" onclick="window.print()">🖨️ طباعة الإنذارات الآن</button>
</div>
<script>
  window.addEventListener("DOMContentLoaded", function() {
    setTimeout(function() { window.print(); }, 350);
  });
</script>`;
        const enhancedHtml = html.includes("<body")
          ? html.replace(/<body[^>]*>/i, (m) => m + toolbarAndScript)
          : (toolbarAndScript + html);

        try {
          const blob = new Blob([enhancedHtml], { type: "text/html;charset=utf-8" });
          const blobUrl = URL.createObjectURL(blob);
          if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.create) {
            chrome.tabs.create({ url: blobUrl });
          } else {
            const printFrame = document.createElement("iframe");
            printFrame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
            document.body.appendChild(printFrame);
            printFrame.srcdoc = html;
            printFrame.onload = () => {
              try { printFrame.contentWindow.focus(); printFrame.contentWindow.print(); } catch (_) {}
              setTimeout(() => printFrame.remove(), 60000);
            };
          }
        } catch (err) {
          showNeprasPopupNotice("تعذر فتح نافذة الطباعة: " + (err?.message || String(err)), "error", "خطأ");
        }
      });
    }

    if (btnWarningsDoc) {
      btnWarningsDoc.addEventListener("click", async () => {
        const list = await getAllStudentsForAbsence();
        if (!list.length) {
          showNeprasPopupNotice("لا توجد بيانات طلاب مسجلة حالياً لتجهيز الإنذارات.", "info", "تنبيه");
          return;
        }

        const summary = window.NeprasAbsenceWarnings?.summarizeAbsence
          ? window.NeprasAbsenceWarnings.summarizeAbsence(list)
          : { eligibleList: [], maxDays: 0, withAbsence: 0 };

        if (!summary.eligibleList.length) {
          if (summary.withAbsence === 0) {
            showNeprasPopupNotice("لم تُسجل أي أيام غياب لطلاب المدرسة حتى الآن. اضغط «⚡ سحب وتحليل تقرير غياب الوزارة تلقائيًا (PDF)» لجلب كشف الغياب الرسمي من موقع الوزارة.", "warning", "لا توجد أيام غياب");
          } else {
            showNeprasPopupNotice(`تم فحص جميع طلاب المدرسة (${list.length} طالب)، وتبين أن أعلى غياب مسجل هو (${summary.maxDays}) أيام. لا يوجد أي طالب تجاوز حد الإنذار (5 أيام فأكثر).`, "info", "إنذارات الغياب");
          }
          return;
        }

        const schoolInfo = await getSchoolHeaderContext();
        const html = window.NeprasAbsenceWarnings.buildWarningsHtml(summary.eligibleList, schoolInfo);
        const blob = new Blob(["\ufeff" + html], { type: "application/msword;charset=utf-8" });
        await neprasUnifiedDownload(blob, `إنذارات_الغياب_المعتمدة_${schoolInfo.schoolName || 'المدرسة'}.doc`, "إنذارات الغياب", "تم إنشاء ملف Word لإنذارات الغياب وتنزيله بنجاح.");
      });
    }

    // أدوات PDF المحلية
    const pdfMergeInput = document.getElementById("pdf-merge-input");
    const btnPdfExtractOpen = document.getElementById("btn-pdf-extract-open");
    const pdfExtractBox = document.getElementById("pdf-extract-box");
    const pdfExtractFileInput = document.getElementById("pdf-extract-file-input");
    const pdfExtractRange = document.getElementById("pdf-extract-range");
    const btnPdfExtractStart = document.getElementById("btn-pdf-extract-start");

    if (pdfMergeInput) {
      pdfMergeInput.addEventListener("change", async (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length < 2) {
          showNeprasPopupNotice("يرجى اختيار ملفين PDF أو أكثر لدمجهما.", "warning", "دمج PDF");
          return;
        }
        try {
          const buffers = [];
          for (const f of files) {
            buffers.push(await f.arrayBuffer());
          }
          if (window.NeprasPdfStudio) {
            const mergedBytes = await window.NeprasPdfStudio.mergePdfs(buffers);
            const blob = new Blob([mergedBytes], { type: "application/pdf" });
            await neprasUnifiedDownload(blob, "مستند_مدمج.pdf", "أستوديو المستندات", `تم دمج ${files.length} ملفات PDF بنجاح في ملف واحد.`);
          }
        } catch (err) {
          showNeprasPopupNotice("تعذر دمج ملفات PDF: " + (err.message || String(err)), "error", "خطأ");
        } finally {
          pdfMergeInput.value = "";
        }
      });
    }

    if (btnPdfExtractOpen && pdfExtractBox) {
      btnPdfExtractOpen.addEventListener("click", () => {
        pdfExtractBox.hidden = !pdfExtractBox.hidden;
      });
    }

    if (btnPdfExtractStart) {
      btnPdfExtractStart.addEventListener("click", async () => {
        const file = pdfExtractFileInput?.files?.[0];
        const range = String(pdfExtractRange?.value || "").trim();
        if (!file) {
          showNeprasPopupNotice("يرجى اختيار ملف PDF أولاً.", "warning", "تنبيه");
          return;
        }
        if (!range) {
          showNeprasPopupNotice("يرجى كتابة أرقام الصفحات المطلوبة (مثال: 1, 3, 5-8).", "warning", "تنبيه");
          return;
        }
        try {
          const buf = await file.arrayBuffer();
          if (window.NeprasPdfStudio) {
            const extractedBytes = await window.NeprasPdfStudio.extractPages(buf, range);
            const blob = new Blob([extractedBytes], { type: "application/pdf" });
            await neprasUnifiedDownload(blob, "صفحات_مستخرجة.pdf", "أستوديو المستندات", "تم حفظ الصفحات المحددة في ملف جديد بنجاح.");
          }
        } catch (err) {
          showNeprasPopupNotice("تعذر حفظ الصفحات: " + (err.message || String(err)), "error", "خطأ");
        }
      });
    }

    // ==========================================
    // أداة حذف إعفاءات الطلاب المتقدمة
    // ==========================================
    const exemptionFileInput = document.getElementById("exemption-file-input");
    const exemptionFileName = document.getElementById("exemption-file-name");
    const exemptionSummary = document.getElementById("exemption-summary");
    const exemptionTypeSelect = document.getElementById("exemption-type-select");
    const exemptionCustomWrap = document.getElementById("exemption-custom-wrap");
    const exemptionCustomInput = document.getElementById("exemption-custom-input");
    const btnExemptionStart = document.getElementById("btn-exemption-start");
    const btnExemptionStop = document.getElementById("btn-exemption-stop");
    const exemptionStopRow = document.getElementById("exemption-stop-row");
    const btnExemptionTemplate = document.getElementById("btn-exemption-template");
    const btnExemptionDownloadResults = document.getElementById("btn-exemption-download-results");
    const exemptionStatus = document.getElementById("exemption-status");

    let parsedExemptionRows = [];
    let parsedExemptionHeaders = [];
    let exemptionLastResults = [];

    if (exemptionTypeSelect && exemptionCustomWrap) {
      exemptionTypeSelect.addEventListener("change", () => {
        exemptionCustomWrap.style.display = exemptionTypeSelect.value === "custom" ? "block" : "none";
      });
    }

    if (btnExemptionTemplate) {
      btnExemptionTemplate.addEventListener("click", async () => {
        if (!window.NeprasExemptionRemoval?.buildExemptionRemovalTemplateWorkbook) {
          showNeprasPopupNotice("وحدة حذف الإعفاءات غير متوفرة.", "error", "خطأ");
          return;
        }
        const wb = window.NeprasExemptionRemoval.buildExemptionRemovalTemplateWorkbook(typeof XLSX !== "undefined" ? XLSX : null);
        await neprasUnifiedDownloadXlsx(wb, "نموذج_حذف_الإعفاءات_المدرسي.xlsx", "المصروفات_والإعفاءات", "تم تنزيل نموذج حذف الإعفاءات بنجاح.");
      });
    }

    if (exemptionFileInput) {
      exemptionFileInput.addEventListener("change", async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (exemptionFileName) exemptionFileName.textContent = file.name;
        try {
          const buf = await file.arrayBuffer();
          const wb = XLSX.read(buf, { type: "array" });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });
          if (!json || !json.length) {
            showNeprasPopupNotice("الملف المختار فارغ أو لا يحتوي على صفوف بيانات.", "warning", "ملف فارغ");
            return;
          }
          parsedExemptionRows = json;
          parsedExemptionHeaders = Object.keys(json[0] || {});
          if (exemptionSummary) {
            exemptionSummary.hidden = false;
            exemptionSummary.textContent = `تم فحص الملف: ${json.length} طالب جاهز لمعالجة الإعفاء.`;
          }
          if (btnExemptionStart) {
            btnExemptionStart.removeAttribute("aria-disabled");
            btnExemptionStart.removeAttribute("data-reason");
          }
        } catch (err) {
          showNeprasPopupNotice("تعذر قراءة ملف الإكسيل: " + (err.message || String(err)), "error", "خطأ في الملف");
        }
      });
    }

    if (btnExemptionStart) {
      btnExemptionStart.addEventListener("click", async () => {
        if (!parsedExemptionRows || !parsedExemptionRows.length) {
          showNeprasPopupNotice("يرجى اختيار ملف Excel يحتوي على أكواد الطلاب أولاً.", "warning", "تنبيه");
          return;
        }

        const selType = exemptionTypeSelect ? exemptionTypeSelect.value : "all";
        let targetType = "all";
        let specificCode = "";
        let specificText = "";

        if (selType === "all") {
          targetType = "all";
        } else if (selType === "custom") {
          targetType = "specific";
          const custVal = String(exemptionCustomInput?.value || "").trim();
          if (!custVal) {
            showNeprasPopupNotice("يرجى إدخال الكود أو النص المخصص لنوع الإعفاء المطلوب حذفه.", "warning", "تنبيه");
            return;
          }
          if (/^\d+$/.test(custVal)) specificCode = custVal;
          else specificText = custVal;
        } else {
          targetType = "specific";
          specificCode = selType;
          const opt = exemptionTypeSelect?.options[exemptionTypeSelect.selectedIndex];
          if (opt) specificText = opt.text;
        }

        const confirmMsg = targetType === "all"
          ? `هل أنت متأكد من بدء حذف جميع أنواع الإعفاءات المسجلة لـ ${parsedExemptionRows.length} طالب؟`
          : `هل أنت متأكد من بدء حذف إعفاء [${specificText || specificCode}] لـ ${parsedExemptionRows.length} طالب واستثناء باقي الإعفاءات؟`;

        const ok = window.neprasDialog?.confirm
          ? await window.neprasDialog.confirm(confirmMsg, { title: "تأكيد بدء حذف الإعفاءات", okText: "بدء الحذف", cancelText: "إلغاء" })
          : true;

        if (!ok) return;

        if (exemptionStopRow) exemptionStopRow.hidden = false;
        if (btnExemptionStart) btnExemptionStart.setAttribute("aria-disabled", "true");
        if (exemptionStatus) {
          exemptionStatus.hidden = false;
          exemptionStatus.textContent = "جاري الاتصال بصفحة الوزارة وبدء فحص وحذف الإعفاءات...";
        }

        const res = await neprasSendMessageToStudentTab({
          action: "NEPRAS_START_EXEMPTION_REMOVAL",
          rows: parsedExemptionRows,
          options: { targetType, specificCode, specificText }
        }, "تعذر إرسال أمر حذف الإعفاءات");

        if (exemptionStopRow) exemptionStopRow.hidden = true;
        if (btnExemptionStart) btnExemptionStart.removeAttribute("aria-disabled");

        if (res) {
          if (res.ok === false) {
            showNeprasPopupNotice("تنبيه من موقع الوزارة: " + (res.message || "تعذر بدء العملية"), "warning", "تنبيه");
          } else {
            exemptionLastResults = res.results || [];
            const delCount = res.deletedCount || 0;
            const skipCount = res.skippedCount || 0;
            const errCount = res.errorCount || 0;
            const summaryText = `اكتملت معالجة حذف الإعفاءات:\n• تم الحذف بنجاح: ${delCount} طالب\n• تم التخطي (عدم مطابقة/لا يوجد إعفاء): ${skipCount} طالب\n• أخطاء: ${errCount} طالب.`;
            showNeprasPopupNotice(summaryText, delCount > 0 ? "success" : "info", "اكتملت عملية الحذف");

            if (exemptionStatus) {
              exemptionStatus.hidden = false;
              exemptionStatus.textContent = summaryText.replace(/\n/g, " — ");
            }
            if (btnExemptionDownloadResults) {
              btnExemptionDownloadResults.hidden = false;
            }
          }
        }
      });
    }

    if (btnExemptionStop) {
      btnExemptionStop.addEventListener("click", async () => {
        await neprasSendMessageToStudentTab({ action: "NEPRAS_STOP_EXEMPTION_REMOVAL" });
        showNeprasPopupNotice("تم إرسال أمر إيقاف العملية.", "info", "إيقاف");
      });
    }

    if (btnExemptionDownloadResults) {
      btnExemptionDownloadResults.addEventListener("click", async () => {
        if (!exemptionLastResults.length || !window.NeprasExemptionRemoval?.buildExemptionRemovalResultsWorkbook) {
          showNeprasPopupNotice("لا توجد نتائج محفوظة للتنزيل.", "warning", "تنبيه");
          return;
        }
        const wb = window.NeprasExemptionRemoval.buildExemptionRemovalResultsWorkbook(
          parsedExemptionRows,
          exemptionLastResults,
          parsedExemptionHeaders,
          typeof XLSX !== "undefined" ? XLSX : null
        );
        const stamp = globalThis.NeprasEgypt ? globalThis.NeprasEgypt.todayStamp() : "";
        await neprasUnifiedDownloadXlsx(wb, `كشف_نتائج_حذف_الإعفاءات_${stamp}.xlsx`, "المصروفات_والإعفاءات", "تم تنزيل كشف نتائج حذف الإعفاءات بنجاح.");
      });
    }

    // ==========================================
    // أداة تعديل التخصص واللغات
    // ==========================================
    const quickEditsModeDirect = document.getElementById("quick-edits-mode-direct");
    const quickEditsModeExcel = document.getElementById("quick-edits-mode-excel");
    const quickEditsDirectWrap = document.getElementById("quick-edits-direct-wrap");
    const quickEditsExcelWrap = document.getElementById("quick-edits-excel-wrap");
    const quickEditsTypeSelect = document.getElementById("quick-edits-type-select");
    const quickEditsValueSelect = document.getElementById("quick-edits-value-select");
    const quickEditsValueWrap = document.getElementById("quick-edits-value-wrap");
    const quickEditsValueLabel = document.getElementById("quick-edits-value-label");
    const quickEditsSpecWrap = document.getElementById("quick-edits-spec-wrap");
    const quickEditsSectionSelect = document.getElementById("quick-edits-section-select");
    const quickEditsMajorSelect = document.getElementById("quick-edits-major-select");
    const quickEditsFileInput = document.getElementById("quick-edits-file-input");
    const quickEditsFileName = document.getElementById("quick-edits-file-name");
    const quickEditsSummary = document.getElementById("quick-edits-summary");
    const quickEditsScopeGrade = document.getElementById("quick-edits-scope-grade");
    const quickEditsScopeClass = document.getElementById("quick-edits-scope-class");
    const quickEditsClassWrap = document.getElementById("quick-edits-class-wrap");
    const quickEditsGradeSelect = document.getElementById("quick-edits-grade-select");
    const quickEditsClassSelect = document.getElementById("quick-edits-class-select");
    const btnQuickEditsStart = document.getElementById("btn-quick-edits-start");
    const btnQuickEditsStop = document.getElementById("btn-quick-edits-stop");
    const quickEditsStopRow = document.getElementById("quick-edits-stop-row");
    const btnQuickEditsTemplate = document.getElementById("btn-quick-edits-template");
    const btnQuickEditsDownloadResults = document.getElementById("btn-quick-edits-download-results");
    const quickEditsStatus = document.getElementById("quick-edits-status");

    let parsedQuickEditsRecords = [];
    let quickEditsLastResults = [];

    try {
      chrome.storage?.local?.get("nepras_quick_edits_active_results", (stored) => {
        const data = stored?.nepras_quick_edits_active_results;
        if (data && Array.isArray(data.results) && data.results.length > 0) {
          quickEditsLastResults = data.results;
          if (Array.isArray(data.records) && data.records.length > 0) {
            parsedQuickEditsRecords = data.records;
          }
          if (btnQuickEditsDownloadResults) btnQuickEditsDownloadResults.hidden = false;
          if (quickEditsStatus) {
            quickEditsStatus.hidden = false;
            const succ = data.successCount ?? data.results.filter(r => r.success).length;
            const fail = data.failCount ?? 0;
            quickEditsStatus.textContent = `اكتمل تطبيق التعديلات: تم التعديل والحفظ بنجاح: ${succ} طالب — لم يتم تعديل: ${fail} طالب.`;
          }
        }
      });
    } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }

    function updateQuickEditsMode() {
      const isDirect = quickEditsModeDirect?.checked;
      const editTypeVal = quickEditsTypeSelect?.value || "1";

      if (isDirect) {
        if (editTypeVal === "2") {
          if (quickEditsValueWrap) quickEditsValueWrap.style.display = "none";
          if (quickEditsSpecWrap) quickEditsSpecWrap.style.display = "grid";
        } else {
          if (quickEditsValueWrap) quickEditsValueWrap.style.display = "block";
          if (quickEditsSpecWrap) quickEditsSpecWrap.style.display = "none";
          if (quickEditsValueLabel) {
            quickEditsValueLabel.textContent = editTypeVal === "0" ? "اللغة الأولى المراد تطبيقها" : "اللغة الثانية المراد تطبيقها";
          }
        }
      } else {
        if (quickEditsValueWrap) quickEditsValueWrap.style.display = "none";
        if (quickEditsSpecWrap) quickEditsSpecWrap.style.display = "none";
      }

      if (quickEditsExcelWrap) quickEditsExcelWrap.style.display = isDirect ? "none" : "block";
      if (btnQuickEditsTemplate) btnQuickEditsTemplate.hidden = isDirect;

      if (btnQuickEditsStart) {
        if (isDirect) {
          btnQuickEditsStart.removeAttribute("aria-disabled");
          btnQuickEditsStart.removeAttribute("data-reason");
        } else {
          if (!parsedQuickEditsRecords.length) {
            btnQuickEditsStart.setAttribute("aria-disabled", "true");
            btnQuickEditsStart.setAttribute("data-reason", "ارفع ملف Excel يحتوي على أكواد الطلاب واللغات أولًا.");
          } else {
            btnQuickEditsStart.removeAttribute("aria-disabled");
            btnQuickEditsStart.removeAttribute("data-reason");
          }
        }
      }
    }

    quickEditsModeDirect?.addEventListener("change", updateQuickEditsMode);
    quickEditsModeExcel?.addEventListener("change", updateQuickEditsMode);
    quickEditsTypeSelect?.addEventListener("change", updateQuickEditsMode);

    quickEditsSectionSelect?.addEventListener("change", () => {
      if (!quickEditsMajorSelect) return;
      const sec = quickEditsSectionSelect.value;
      if (sec === "203") {
        quickEditsMajorSelect.innerHTML = `
          <option value="auto">تلقائي (حسب الشعبة بموقع الوزارة)</option>
          <option value="676" selected>مسار الطب وعلوم الحياة (676)</option>
        `;
      } else {
        quickEditsMajorSelect.innerHTML = `
          <option value="auto" selected>تلقائي (حسب الشعبة بموقع الوزارة)</option>
        `;
      }
    });

    updateQuickEditsMode();

    if (quickEditsScopeGrade && quickEditsScopeClass && quickEditsClassWrap) {
      const updateScope = () => {
        quickEditsClassWrap.style.display = quickEditsScopeClass.checked ? "block" : "none";
      };
      quickEditsScopeGrade.addEventListener("change", updateScope);
      quickEditsScopeClass.addEventListener("change", updateScope);
    }

    if (btnQuickEditsTemplate) {
      btnQuickEditsTemplate.addEventListener("click", async () => {
        if (!window.NeprasQuickEdits?.buildQuickEditsTemplateWorkbook) {
          showNeprasPopupNotice("وحدة تعديل التخصص واللغات غير متوفرة.", "error", "خطأ");
          return;
        }
        const wb = window.NeprasQuickEdits.buildQuickEditsTemplateWorkbook(typeof XLSX !== "undefined" ? XLSX : null);
        await neprasUnifiedDownloadXlsx(wb, "نموذج_تعديل_التخصص_واللغات.xlsx", "تعديل_البيانات", "تم تنزيل نموذج تعديل التخصص واللغات بنجاح.");
      });
    }

    if (quickEditsFileInput) {
      quickEditsFileInput.addEventListener("change", async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (quickEditsFileName) quickEditsFileName.textContent = file.name;
        try {
          const buf = await file.arrayBuffer();
          const wb = XLSX.read(buf, { type: "array" });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });
          if (!json || !json.length) {
            showNeprasPopupNotice("الملف المختار فارغ أو لا يحتوي على صفوف بيانات.", "warning", "ملف فارغ");
            return;
          }
          if (window.NeprasQuickEdits) {
            parsedQuickEditsRecords = window.NeprasQuickEdits.parseQuickEditsExcel(json);
            if (quickEditsSummary) {
              quickEditsSummary.hidden = false;
              quickEditsSummary.textContent = `تم فحص الملف: ${parsedQuickEditsRecords.length} طالب جاهز لتطبيق التعديلات.`;
            }
            if (btnQuickEditsStart) {
              btnQuickEditsStart.removeAttribute("aria-disabled");
              btnQuickEditsStart.removeAttribute("data-reason");
            }
          }
        } catch (err) {
          showNeprasPopupNotice("تعذر قراءة ملف التعديلات: " + (err.message || String(err)), "error", "خطأ في الملف");
        }
      });
    }

    if (btnQuickEditsStart) {
      btnQuickEditsStart.addEventListener("click", async () => {
        const isDirect = quickEditsModeDirect?.checked;
        if (!isDirect && !parsedQuickEditsRecords.length) {
          showNeprasPopupNotice("يرجى اختيار ملف Excel يحتوي على بيانات الطلاب أولاً.", "warning", "تنبيه");
          return;
        }

        const isClassScope = quickEditsScopeClass?.checked;
        const gradeVal = quickEditsGradeSelect?.value || "1";
        const classVal = isClassScope ? (quickEditsClassSelect?.value || "1") : "";
        const editTypeVal = quickEditsTypeSelect?.value || "1";
        const editValueVal = quickEditsValueSelect?.value || "2";
        const sectionVal = quickEditsSectionSelect?.value || "2";
        const majorVal = quickEditsMajorSelect?.value || "auto";

        let typeLabel = "اللغة الثانية";
        let valText = "";
        if (editTypeVal === "0") {
          typeLabel = "اللغة الأولى";
          valText = quickEditsValueSelect?.options[quickEditsValueSelect.selectedIndex]?.text || editValueVal;
        } else if (editTypeVal === "2") {
          typeLabel = "الشعبة والتخصص";
          const secText = quickEditsSectionSelect?.options[quickEditsSectionSelect.selectedIndex]?.text || sectionVal;
          const majText = majorVal !== "auto" ? ` — ${quickEditsMajorSelect?.options[quickEditsMajorSelect.selectedIndex]?.text || majorVal}` : "";
          valText = secText + majText;
        } else {
          typeLabel = "اللغة الثانية";
          valText = quickEditsValueSelect?.options[quickEditsValueSelect.selectedIndex]?.text || editValueVal;
        }

        const confirmMsg = isDirect
          ? `هل ترغب في تطبيق (${typeLabel}: ${valText}) لطلاب ${isClassScope ? `فصل ${classVal}` : "الصف بالكامل"} آلياً وحفظ التعديلات بموقع الوزارة؟`
          : `هل ترغب في بدء تطبيق تعديلات اللغات والتخصص لـ ${parsedQuickEditsRecords.length} طالب من ملف Excel (${isClassScope ? `فصل ${classVal}` : "الصف بالكامل"})؟`;

        const ok = window.neprasDialog?.confirm
          ? await window.neprasDialog.confirm(confirmMsg, {
              title: "تأكيد تطبيق التعديلات",
              okText: "بدء التطبيق",
              cancelText: "إلغاء"
            })
          : true;

        if (!ok) return;

        if (quickEditsStopRow) quickEditsStopRow.hidden = false;
        if (btnQuickEditsStart) btnQuickEditsStart.setAttribute("aria-disabled", "true");
        if (quickEditsStatus) {
          quickEditsStatus.hidden = false;
          quickEditsStatus.textContent = "جاري الاتصال بصفحة الوزارة وتطبيق التعديلات وحفظها...";
        }

        const res = await neprasSendMessageToStudentTab({
          action: "NEPRAS_START_QUICK_EDITS",
          mode: isDirect ? "direct" : "excel",
          records: isDirect ? [] : parsedQuickEditsRecords,
          options: {
            scope: isClassScope ? "class" : "grade",
            grade: gradeVal,
            classNo: classVal,
            directEditType: editTypeVal,
            directValue: editTypeVal === "2" ? sectionVal : editValueVal,
            directSection: sectionVal,
            directMajor: majorVal
          }
        }, "تعذر إرسال أمر التعديلات");

        if (quickEditsStopRow) quickEditsStopRow.hidden = true;
        if (btnQuickEditsStart) btnQuickEditsStart.removeAttribute("aria-disabled");

        let activeResults = res?.results;
        let succ = res?.successCount;
        let fail = res?.failCount;

        if (!activeResults || !activeResults.length) {
          try {
            const stored = await chrome.storage?.local?.get("nepras_quick_edits_active_results");
            const data = stored?.nepras_quick_edits_active_results;
            if (data && Array.isArray(data.results) && data.results.length > 0) {
              activeResults = data.results;
              succ = data.successCount ?? data.results.filter(r => r.success).length;
              fail = data.failCount ?? 0;
            }
          } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
        }

        if (res && res.ok === false && (!activeResults || !activeResults.length)) {
          showNeprasPopupNotice("تنبيه من موقع الوزارة: " + (res.message || "تعذر بدء العملية"), "warning", "تنبيه");
        } else if (activeResults && activeResults.length > 0) {
          quickEditsLastResults = activeResults;
          const succCount = Number(succ || 0);
          const failCount = Number(fail || 0);
          const summaryText = `اكتمل تطبيق التعديلات:\n• تم التعديل والحفظ بنجاح: ${succCount} طالب\n• لم يتم تعديل: ${failCount} طالب.`;
          showNeprasPopupNotice(summaryText, succCount > 0 ? "success" : "info", "اكتملت التعديلات");

          if (quickEditsStatus) {
            quickEditsStatus.hidden = false;
            quickEditsStatus.textContent = summaryText.replace(/\n/g, " — ");
          }
          if (btnQuickEditsDownloadResults) {
            btnQuickEditsDownloadResults.hidden = false;
          }
        }
      });
    }

    if (btnQuickEditsStop) {
      btnQuickEditsStop.addEventListener("click", async () => {
        await neprasSendMessageToStudentTab({ action: "NEPRAS_STOP_QUICK_EDITS" });
        showNeprasPopupNotice("تم إرسال أمر إيقاف التعديلات.", "info", "إيقاف");
      });
    }

    if (btnQuickEditsDownloadResults) {
      btnQuickEditsDownloadResults.addEventListener("click", async () => {
        if (!quickEditsLastResults.length) {
          try {
            const stored = await chrome.storage?.local?.get("nepras_quick_edits_active_results");
            const data = stored?.nepras_quick_edits_active_results;
            if (data && Array.isArray(data.results) && data.results.length > 0) {
              quickEditsLastResults = data.results;
              if (Array.isArray(data.records) && data.records.length > 0 && !parsedQuickEditsRecords.length) {
                parsedQuickEditsRecords = data.records;
              }
            }
          } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
        }

        if (!quickEditsLastResults.length || !window.NeprasQuickEdits?.buildQuickEditsResultsWorkbook) {
          showNeprasPopupNotice("لا توجد نتائج محفوظة للتنزيل.", "warning", "تنبيه");
          return;
        }
        const wb = window.NeprasQuickEdits.buildQuickEditsResultsWorkbook(
          parsedQuickEditsRecords,
          quickEditsLastResults,
          typeof XLSX !== "undefined" ? XLSX : null
        );
        const stamp = globalThis.NeprasEgypt ? globalThis.NeprasEgypt.todayStamp() : "";
        await neprasUnifiedDownloadXlsx(wb, `كشف_نتائج_تعديل_التخصص_واللغات_${stamp}.xlsx`, "تعديل_البيانات", "تم تنزيل كشف نتائج التعديل بنجاح.");
      });
    }

    // ========================================================
    // 🎓 نافذة «الملف الرقمي والبحث الشامل للطالب»
    // ========================================================
    function neprasInitStudentDossierUI() {
      const inputSearch = document.getElementById("input-dossier-search");
      const btnSearch = document.getElementById("btn-dossier-search");
      const summaryEl = document.getElementById("dossier-search-summary");
      const resultsEl = document.getElementById("dossier-search-results");

      const modal = document.getElementById("student-dossier-modal");
      const modalClose = document.getElementById("dossier-modal-close");
      const modalCloseBtm = document.getElementById("btn-dossier-close-btm");
      const btnPrint = document.getElementById("btn-dossier-print");
      const btnCopy = document.getElementById("btn-dossier-copy");

      let currentDossier = null;
      let searchDebounce = null;

      async function executeSearch() {
        const q = inputSearch?.value?.trim() || "";
        if (!q) {
          if (summaryEl) summaryEl.style.display = "none";
          if (resultsEl) {
            resultsEl.style.display = "none";
            resultsEl.innerHTML = "";
          }
          return;
        }

        const allStudents = await getOrLoadStudents();
        if (!allStudents || !allStudents.length) {
          if (summaryEl) {
            summaryEl.style.display = "block";
            summaryEl.style.color = "#d97706";
            summaryEl.textContent = "⚠️ لا توجد بيانات طلاب محفوظة بالذاكرة حالياً. قم بتنزيل البيانات الشاملة أو تحديث إحصاء المدرسة أولاً.";
          }
          if (resultsEl) resultsEl.style.display = "none";
          return;
        }

        if (!window.NeprasStudentDossier?.searchStudents) return;

        const matches = window.NeprasStudentDossier.searchStudents(allStudents, q, 25);

        if (!matches.length) {
          if (summaryEl) {
            summaryEl.style.display = "block";
            summaryEl.style.color = "#64748b";
            summaryEl.textContent = `لم يتم العثور على أي طالب يطابق "${q}". جرّب جزءاً من الاسم أو الرقم القومي أو الهاتف.`;
          }
          if (resultsEl) {
            resultsEl.style.display = "none";
            resultsEl.innerHTML = "";
          }
          return;
        }

        if (summaryEl) {
          summaryEl.style.display = "block";
          summaryEl.style.color = "#0f766e";
          summaryEl.innerHTML = `تم العثور على <b>${matches.length}</b> طالب يطابق البحث:`;
        }

        if (resultsEl) {
          resultsEl.innerHTML = "";
          resultsEl.style.display = "flex";

          matches.forEach(({ student, matchReason }) => {
            const item = document.createElement("div");
            item.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 12px;background:#fff;border:1px solid #cbd5e1;border-radius:8px;cursor:pointer;transition:all 0.15s ease;";
            item.onmouseover = () => { item.style.borderColor = "#0f766e"; item.style.background = "#f0fdfa"; };
            item.onmouseout = () => { item.style.borderColor = "#cbd5e1"; item.style.background = "#fff"; };

            const nameCol = document.createElement("div");
            nameCol.style.cssText = "display:flex;flex-direction:column;gap:2px;";

            const titleRow = document.createElement("div");
            titleRow.style.cssText = "font-size:13px;font-weight:700;color:#0f172a;";
            titleRow.textContent = student.name || "طالب بدون اسم";

            const metaRow = document.createElement("div");
            metaRow.style.cssText = "font-size:11px;color:#64748b;";
            metaRow.textContent = `${student.grade || "غير محدد"} | فصل: ${student.cls || "بدون فصل"} | كود: ${student.code || "-"}`;

            nameCol.appendChild(titleRow);
            nameCol.appendChild(metaRow);

            const badgeCol = document.createElement("div");
            badgeCol.style.cssText = "display:flex;align-items:center;gap:6px;";

            const matchBadge = document.createElement("span");
            matchBadge.style.cssText = "font-size:10px;background:#e0f2fe;color:#0369a1;padding:2px 6px;border-radius:4px;font-weight:600;";
            matchBadge.textContent = matchReason;

            const openBtn = document.createElement("button");
            openBtn.className = "n-btn n-btn--primary n-btn--sm";
            openBtn.type = "button";
            openBtn.style.cssText = "padding:2px 8px;font-size:11px;background:#0f766e;border-color:#0f766e;";
            openBtn.textContent = "عرض الملف";

            badgeCol.appendChild(matchBadge);
            badgeCol.appendChild(openBtn);

            item.appendChild(nameCol);
            item.appendChild(badgeCol);

            item.addEventListener("click", () => openStudentDossier(student, allStudents));

            resultsEl.appendChild(item);
          });
        }
      }

      async function openStudentDossier(student, allStudents) {
        if (!window.NeprasStudentDossier?.buildStudentDossier) return;
        showNeprasPopupNotice("جاري تحميل وتجميع الملف الرقمي للطالب...", "info", "الملف الرقمي");

        const dossier = await window.NeprasStudentDossier.buildStudentDossier(student, allStudents);
        currentDossier = dossier;

        const p = dossier.personal;
        const a = dossier.academic;
        const exp = dossier.expenses;
        const tab = dossier.tablet;
        const abs = dossier.absence;
        const sibs = dossier.siblings;

        // ملء بيانات الرأس
        const nameEl = document.getElementById("dossier-modal-name");
        const subEl = document.getElementById("dossier-modal-sub");
        if (nameEl) nameEl.textContent = p.name;
        if (subEl) subEl.textContent = `${a.grade} | الفصل: ${a.cls} | كود التلميذ: ${p.code} | الرقم القومي: ${p.nid}`;

        // 1. البيانات الشخصية
        const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || "-"; };
        setTxt("dossier-nid", p.nid);
        setTxt("dossier-gender", p.gender);
        setTxt("dossier-religion", p.religion);
        setTxt("dossier-dob", p.dob);
        setTxt("dossier-age", p.ageStr);
        setTxt("dossier-gov", p.birthGov);
        setTxt("dossier-father", p.fatherName);
        setTxt("dossier-mother", p.motherName);
        setTxt("dossier-phone", p.phone);
        setTxt("dossier-address", p.address);

        // 2. الموقف الدراسي
        setTxt("dossier-grade", a.grade);
        setTxt("dossier-class", a.cls);
        setTxt("dossier-mode", a.mode);
        setTxt("dossier-status", a.status);
        setTxt("dossier-lang1", a.lang1);
        const cleanL2 = String(a.lang2 || '').trim();
        const displayL2 = (!cleanL2 || /^(not\s*allowed|not_allowed|notallowed|none|n\/?a|معف[ىي]|غير\s*مسموح|لا\s*يوجد)$/i.test(cleanL2)) ? 'معفى' : cleanL2;
        setTxt("dossier-lang2", displayL2);
        setTxt("dossier-section", a.section);
        setTxt("dossier-damg", a.integration);

        // 3. المصروفات
        const expBadge = document.getElementById("dossier-exp-badge");
        const expDetail = document.getElementById("dossier-exp-detail");
        if (expBadge) {
          expBadge.textContent = exp.statusLabel;
          if (exp.isPaid) {
            expBadge.style.background = "#dcfce7"; expBadge.style.color = "#15803d";
          } else if (exp.exemptionType) {
            expBadge.style.background = "#eff6ff"; expBadge.style.color = "#1d4ed8";
          } else {
            expBadge.style.background = "#fee2e2"; expBadge.style.color = "#b91c1c";
          }
        }
        if (expDetail) {
          let detailsHtml = "";
          if (exp.isPaid) {
            detailsHtml = `<div>✅ تم سداد المصروفات المدرسية بالكامل.</div>`;
            if (exp.receiptNumber) detailsHtml += `<div>رقم الإيصال: ${escapeHtml(exp.receiptNumber)}</div>`;
            if (exp.paymentDate) detailsHtml += `<div>تاريخ السداد: ${escapeHtml(exp.paymentDate)}</div>`;
          } else if (exp.exemptionType) {
            detailsHtml = `<div>ℹ️ معفى وفق القرار الوزاري: <b>${escapeHtml(exp.exemptionType)}</b></div>`;
          } else if (exp.discountRatio) {
            detailsHtml = `<div>تخفيض بنسبة <b>${escapeHtml(exp.discountRatio)}</b> مطلوب سداد القيمة المخفضة.</div>`;
          } else {
            detailsHtml = `<div>❌ مطلوب سداد المصروفات المدرسية (لم يتم تسجيل السداد بالمنظومة).</div>`;
          }
          expDetail.innerHTML = detailsHtml;
        }

        // 4. التابلت
        const tabBadge = document.getElementById("dossier-tab-badge");
        const tabDetail = document.getElementById("dossier-tab-detail");
        if (tabBadge) {
          tabBadge.textContent = tab.delivered ? "مستلم ومسجل" : (tab.applicable ? "لم يستلم" : "لا ينطبق");
          tabBadge.style.background = tab.delivered ? "#f3e8ff" : "#f1f5f9";
          tabBadge.style.color = tab.delivered ? "#7e22ce" : "#64748b";
        }
        if (tabDetail) {
          if (tab.delivered) {
            tabDetail.innerHTML = `<div>سيريال الجهاز: <b style="font-family:monospace;">${escapeHtml(tab.serialNumber || "غير مسجل")}</b></div>` +
                                  `<div>رقم IMEI: <b style="font-family:monospace;">${escapeHtml(tab.imei || "غير مسجل")}</b></div>`;
          } else if (tab.applicable) {
            tabDetail.innerHTML = `<div>⚠️ الطالب في مرحلة استلام التابلت ولم يُسجل تسليمه بعد.</div>`;
          } else {
            tabDetail.innerHTML = `<div>هذه المرحلة التعليمية لا تشمل توزيع أجهزة التابلت.</div>`;
          }
        }

        // 5. الغياب والإنذارات
        const absBadge = document.getElementById("dossier-abs-badge");
        const absDetail = document.getElementById("dossier-abs-detail");
        if (absBadge) {
          absBadge.textContent = abs.totalDays > 0 ? `${abs.totalDays} يوماً مسجلاً` : "منتظم (0 غياب)";
          absBadge.style.background = abs.totalDays >= 10 ? "#fee2e2" : (abs.totalDays >= 5 ? "#fef3c7" : "#dcfce7");
          absBadge.style.color = abs.totalDays >= 10 ? "#b91c1c" : (abs.totalDays >= 5 ? "#b45309" : "#15803d");
        }
        if (absDetail) {
          absDetail.innerHTML = `<div>الموقف الإداري: <b>${escapeHtml(abs.warningStatus)}</b></div>` +
            `<div>إجمالي الغياب: <b>${abs.totalDays}</b> يوم (منها متصل: <b>${abs.continuousDays}</b> يوم، ومنفصل: <b>${abs.separatedDays}</b> يوم)</div>`;
        }

        // 6. الأشقاء بالمدرسة
        const sibsCount = document.getElementById("dossier-siblings-count");
        const sibsList = document.getElementById("dossier-siblings-list");
        if (sibsCount) sibsCount.textContent = `(${sibs.length})`;
        if (sibsList) {
          sibsList.innerHTML = "";
          if (!sibs.length) {
            sibsList.innerHTML = `<div style="color:#64748b;font-style:italic;">لا يوجد أشقاء مقيدون بنفس المدرسة وفق البيانات المسجلة.</div>`;
          } else {
            sibs.forEach(({ student: sib, relationNote }) => {
              const sibRow = document.createElement("div");
              sibRow.style.cssText = "display:flex;align-items:center;justify-content:space-between;background:#f8fafc;border:1px solid #e2e8f0;padding:6px 10px;border-radius:6px;";
              sibRow.innerHTML = `<div><b>${escapeHtml(sib.name)}</b> <span style="color:#64748b;font-size:11px;">(${escapeHtml(sib.grade)} - فصل: ${escapeHtml(sib.cls || "1")})</span></div>` +
                                 `<div style="font-size:11px;color:#4338ca;font-weight:600;background:#e0e7ff;padding:2px 6px;border-radius:4px;">${escapeHtml(relationNote)}</div>`;
              sibsList.appendChild(sibRow);
            });
          }
        }

        if (modal) modal.hidden = false;
      }

      inputSearch?.addEventListener("input", () => {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(executeSearch, 300);
      });

      inputSearch?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          clearTimeout(searchDebounce);
          executeSearch();
        }
      });

      btnSearch?.addEventListener("click", () => {
        clearTimeout(searchDebounce);
        executeSearch();
      });

      modalClose?.addEventListener("click", () => { if (modal) modal.hidden = true; });
      modalCloseBtm?.addEventListener("click", () => { if (modal) modal.hidden = true; });

      btnCopy?.addEventListener("click", () => {
        if (!currentDossier) return;
        const p = currentDossier.personal;
        const a = currentDossier.academic;
        const exp = currentDossier.expenses;
        const abs = currentDossier.absence;
        const text = `=== بطاقة الملف الرقمي للطالب ===\n` +
          `الاسم: ${p.name}\n` +
          `كود التلميذ: ${p.code} | الرقم القومي: ${p.nid}\n` +
          `الصف: ${a.grade} | الفصل: ${a.cls}\n` +
          `النوع: ${p.gender} | الديانة: ${p.religion} | السن: ${p.ageStr}\n` +
          `اسم الأب: ${p.fatherName} | اسم الأم: ${p.motherName}\n` +
          `هاتف ولي الأمر: ${p.phone} | العنوان: ${p.address}\n` +
          `اللغة الأولى: ${a.lang1} | اللغة الثانية: ${a.lang2}\n` +
          `المصروفات: ${exp.statusLabel}\n` +
          `الغياب: ${abs.totalDays} يوم (${abs.warningStatus})\n` +
          `الأشقاء بالمدرسة: ${currentDossier.siblings.length} شقيق\n` +
          `==============================`;
        navigator.clipboard.writeText(text).then(() => {
          showNeprasPopupNotice("تم نسخ بطاقة الطالب بالكامل إلى الحافظة بنجاح.", "success", "تم النسخ");
        }).catch(() => {
          showNeprasPopupNotice("تعذر النسخ التلقائي.", "error", "خطأ");
        });
      });

      btnPrint?.addEventListener("click", () => {
        if (!currentDossier) return;
        const meta = typeof getStatsCenterMeta === "function" ? getStatsCenterMeta() : {};
        const p = currentDossier.personal;
        const a = currentDossier.academic;
        const exp = currentDossier.expenses;
        const tab = currentDossier.tablet;
        const abs = currentDossier.absence;
        const sibs = currentDossier.siblings;

        const printHtml = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8">
  <title>بطاقة الملف الرقمي — ${escapeHtml(p.name)}</title>
  <style>
    @page { size: A4 portrait; margin: 15mm; }
    body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; direction: rtl; margin: 0; padding: 10px; color: #1e293b; line-height: 1.6; }
    .header { text-align: center; border-bottom: 2px solid #0f766e; padding-bottom: 8px; margin-bottom: 14px; }
    .header h1 { margin: 0; font-size: 18px; color: #0f766e; }
    .header p { margin: 2px 0; font-size: 12px; color: #64748b; }
    .section { border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px 14px; margin-bottom: 10px; }
    .section-title { font-size: 13px; font-weight: bold; color: #0f766e; border-bottom: 1px dashed #cbd5e1; padding-bottom: 4px; margin-bottom: 8px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 12px; }
    .grid span { color: #64748b; }
    .footer { margin-top: 25px; display: flex; justify-content: space-between; font-size: 12px; font-weight: bold; }
  </style>
</head>
<body>
  <div class="header">
    <h1>جمهورية مصر العربية — وزارة التربية والتعليم</h1>
    <p>${escapeHtml(meta.dir || "مديرية التربية والتعليم")} — ${escapeHtml(meta.admin || "الإدارة التعليمية")} — ${escapeHtml(meta.school || "المدرسة")}</p>
    <h2 style="margin:6px 0 0;font-size:15px;color:#0f172a;">بطاقة الملف الرقمي الشامل للطالب (العام الدراسي ${escapeHtml(meta.year || "2026-2027")})</h2>
  </div>

  <div class="section">
    <div class="section-title">1. البيانات الشخصية والأساسية</div>
    <div class="grid">
      <div><span>اسم الطالب بالكامل: </span><b>${escapeHtml(p.name)}</b></div>
      <div><span>كود التلميذ: </span><b>${escapeHtml(p.code)}</b></div>
      <div><span>الرقم القومي (14 رقم): </span><b>${escapeHtml(p.nid)}</b></div>
      <div><span>النوع: </span><b>${escapeHtml(p.gender)}</b> | <span>الديانة: </span><b>${escapeHtml(p.religion)}</b></div>
      <div><span>تاريخ الميلاد: </span><b>${escapeHtml(p.dob)}</b></div>
      <div><span>السن في 1 أكتوبر: </span><b>${escapeHtml(p.ageStr)}</b></div>
      <div><span>محافظة الميلاد: </span><b>${escapeHtml(p.birthGov)}</b></div>
      <div><span>اسم الأب: </span><b>${escapeHtml(p.fatherName)}</b></div>
      <div><span>اسم الأم: </span><b>${escapeHtml(p.motherName)}</b></div>
      <div><span>هاتف ولي الأمر: </span><b>${escapeHtml(p.phone)}</b></div>
      <div style="grid-column:1/-1;"><span>العنوان ومحل الإقامة: </span><b>${escapeHtml(p.address)}</b></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">2. الموقف الدراسي والتعليمي</div>
    <div class="grid">
      <div><span>الصف الدراسي: </span><b>${escapeHtml(a.grade)}</b></div>
      <div><span>الفصل: </span><b>${escapeHtml(a.cls)}</b></div>
      <div><span>نظام القيد: </span><b>${escapeHtml(a.mode)}</b></div>
      <div><span>حالة القيد: </span><b>${escapeHtml(a.status)}</b></div>
      <div><span>اللغة الأولى: </span><b>${escapeHtml(a.lang1)}</b></div>
      <div><span>اللغة الثانية: </span><b>${escapeHtml(a.lang2)}</b></div>
      <div><span>الشعبة والتخصص: </span><b>${escapeHtml(a.section)}</b></div>
      <div><span>الموقف من الدمج: </span><b>${escapeHtml(a.integration)}</b></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">3. المصروفات والتابلت والغياب</div>
    <div class="grid">
      <div><span>الموقف المالي والمصروفات: </span><b>${escapeHtml(exp.statusLabel)}</b></div>
      <div><span>موقف التابلت: </span><b>${escapeHtml(tab.statusLabel)}</b></div>
      <div><span>سيريال التابلت: </span><b>${escapeHtml(tab.serialNumber || "لا يوجد")}</b></div>
      <div><span>رقم IMEI: </span><b>${escapeHtml(tab.imei || "لا يوجد")}</b></div>
      <div><span>إجمالي أيام الغياب المسجلة: </span><b>${abs.totalDays} يوم</b></div>
      <div><span>موقف الإنذارات: </span><b>${escapeHtml(abs.warningStatus)}</b></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">4. الأشقاء المقيدون بنفس المدرسة (${sibs.length})</div>
    <div style="font-size:12px;">
      ${sibs.length === 0 ? "<div>لا يوجد أشقاء مقيدون بالمدرسة.</div>" : sibs.map(s => `<div>• <b>${escapeHtml(s.student.name)}</b> — ${escapeHtml(s.student.grade)} (فصل: ${escapeHtml(s.student.cls || "1")}) — ${escapeHtml(s.relationNote)}</div>`).join("")}
    </div>
  </div>

  <div class="footer">
    <div>مسئول شؤون الطلاب: ${escapeHtml(meta.affairs || "..................")}</div>
    <div>وكيل شؤون التعليم: ..................</div>
    <div>مدير المدرسة: ${escapeHtml(meta.principal || "..................")}</div>
  </div>
  <script>
    window.addEventListener("DOMContentLoaded", function() {
      setTimeout(function() { window.print(); }, 400);
    });
  </script>
</body>
</html>`;

        try {
          const blob = new Blob([printHtml], { type: "text/html;charset=utf-8" });
          const blobUrl = URL.createObjectURL(blob);
          if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.create) {
            chrome.tabs.create({ url: blobUrl });
          } else {
            const printWin = window.open(blobUrl, "_blank");
            if (printWin) {
              printWin.focus();
            } else {
              const iframe = document.createElement("iframe");
              iframe.style.position = "fixed";
              iframe.style.right = "0";
              iframe.style.bottom = "0";
              iframe.style.width = "0";
              iframe.style.height = "0";
              iframe.style.border = "none";
              document.body.appendChild(iframe);
              iframe.contentWindow.document.open();
              iframe.contentWindow.document.write(printHtml);
              iframe.contentWindow.document.close();
              iframe.contentWindow.focus();
              setTimeout(() => {
                iframe.contentWindow.print();
                setTimeout(() => document.body.removeChild(iframe), 2000);
              }, 400);
            }
          }
        } catch (printErr) {
          console.warn("[Dossier] Print error, falling back to iframe:", printErr);
          const iframe = document.createElement("iframe");
          iframe.style.position = "fixed";
          iframe.style.right = "0";
          iframe.style.bottom = "0";
          iframe.style.width = "0";
          iframe.style.height = "0";
          iframe.style.border = "none";
          document.body.appendChild(iframe);
          iframe.contentWindow.document.open();
          iframe.contentWindow.document.write(printHtml);
          iframe.contentWindow.document.close();
          iframe.contentWindow.focus();
          setTimeout(() => {
            iframe.contentWindow.print();
            setTimeout(() => document.body.removeChild(iframe), 2000);
          }, 400);
        }
      });
    }

    neprasInitStudentDossierUI();

    // ========================================================
    // 📊 إحصائيات وسجل العاملين وكشوف التخصصات المستقلة
    // ========================================================
    function neprasInitStaffStatsUI() {
      const statusEl = document.getElementById("staff-stats-status");
      const statTotal = document.getElementById("stat-staff-total");
      const statCore = document.getElementById("stat-staff-core");
      const statNadb = document.getElementById("stat-staff-nadb");
      const statParttime = document.getElementById("stat-staff-parttime");
      const statActive = document.getElementById("stat-staff-active");
      const statLeave = document.getElementById("stat-staff-leave");
      const statMale = document.getElementById("stat-staff-male");
      const statFemale = document.getElementById("stat-staff-female");

      const selectSubject = document.getElementById("select-staff-subject");
      const btnExportMaster = document.getElementById("btn-staff-export-master");
      const btnExportPerformanceReports = document.getElementById("btn-staff-export-performance-reports");
      const btnExportSingle = document.getElementById("btn-staff-export-single-subject");
      const fileInput = document.getElementById("staff-file-input");
      const btnStaffFetchAllComprehensive = document.getElementById("btn-staff-fetch-all-comprehensive");
      const btnStaffRefreshUi = document.getElementById("btn-staff-refresh-ui");

      btnStaffFetchAllComprehensive?.addEventListener("click", () => {
        showNeprasPopupNotice("جاري بدء التنزيل والتحديث الشامل لبيانات جميع العاملين بالمدرسة (أساسي + منتدب + حصة)...", "info", "تنزيل بيانات العاملين");
        const run = () => triggerTeacherCommand("FETCH_ALL_STAFF_DATA");
        window.withButtonBusy ? window.withButtonBusy(btnStaffFetchAllComprehensive, run) : run();
      });

      btnStaffRefreshUi?.addEventListener("click", async () => {
        const store = await chrome.storage.local.get("neprasCachedStaffList");
        window.neprasCachedStaffList = Array.isArray(store?.neprasCachedStaffList) ? store.neprasCachedStaffList : [];
        await updateStaffStatsUI();
        showNeprasPopupNotice("تم تحديث إحصائيات وسجلات العاملين من الذاكرة المحفوظة.", "success", "تم التحديث");
      });

      async function getOrLoadStaff() {
        if (Array.isArray(window.neprasCachedStaffList) && window.neprasCachedStaffList.length) {
          return window.neprasCachedStaffList;
        }
        try {
          const store = await chrome.storage.local.get("neprasCachedStaffList");
          if (Array.isArray(store?.neprasCachedStaffList) && store.neprasCachedStaffList.length) {
            window.neprasCachedStaffList = store.neprasCachedStaffList;
            return window.neprasCachedStaffList;
          }
        } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
        return [];
      }

      async function updateStaffStatsUI() {
        const staff = await getOrLoadStaff();
        if (!staff || !staff.length) {
          if (statusEl) {
            statusEl.innerHTML = '<span style="color:#d97706;font-weight:700;">●</span> لا توجد بيانات عاملين محفوظة حالياً. اضغط على زر <b>«⚡ تنزيل وتحديث بيانات العاملين الشاملة من الموقع»</b> أعلاه أو استورد ملف Excel.';
          }
          if (statTotal) statTotal.textContent = "0";
          if (statCore) statCore.textContent = "0";
          if (statNadb) statNadb.textContent = "0";
          if (statParttime) statParttime.textContent = "0";
          if (statActive) statActive.textContent = "0";
          if (statLeave) statLeave.textContent = "0";
          if (statMale) statMale.textContent = "0";
          if (statFemale) statFemale.textContent = "0";
          if (selectSubject) selectSubject.innerHTML = '<option value="">(اختر مادة التدريس / التخصص...)</option>';
          return;
        }

        if (!window.NeprasStaffStats?.calculateStaffStatistics) return;

        const stats = window.NeprasStaffStats.calculateStaffStatistics(staff);

        if (statusEl) {
          const hasNid = staff.some(s => {
            const id = String(s?.['الرقم القومي'] || s?.nid || s?.nationalId || '').trim();
            return id.length === 14;
          });
          if (hasNid) {
            statusEl.innerHTML = `<span style="color:#16a34a;font-weight:700;">●</span> بيانات العاملين مكتملة بالرقم القومي: <b>${stats.total}</b> معلماً وموظفاً متاحاً لإعداد الإحصاء وكشوف التخصصات.`;
          } else {
            statusEl.innerHTML = `<span style="color:#0284c7;font-weight:700;">●</span> تم استخراج قائمة العاملين (<b>${stats.total}</b> معلماً وموظفاً). تم تحديد النوع والتخصصات تلقائياً من واقع الأسماء والوظائف.`;
          }
        }

        if (statTotal) statTotal.textContent = String(stats.total);
        if (statCore) statCore.textContent = String(stats.categories.core);
        if (statNadb) statNadb.textContent = String(stats.categories.nadb);
        if (statParttime) statParttime.textContent = String(stats.categories.partTime);
        if (statActive) statActive.textContent = String(stats.workStatus.active);
        const leaveTotal = (stats.workStatus.leaveChild || 0) + (stats.workStatus.leaveUnpaid || 0) + (stats.workStatus.leaveSick || 0) + (stats.workStatus.other || 0);
        if (statLeave) statLeave.textContent = String(leaveTotal);
        if (statMale) statMale.textContent = String(stats.gender.male);
        if (statFemale) statFemale.textContent = String(stats.gender.female);

        if (selectSubject) {
          const currentVal = selectSubject.value;
          selectSubject.innerHTML = '<option value="">(اختر مادة التدريس / التخصص...)</option>';
          const sortedSubjects = Array.from(stats.subjects.keys()).sort((a, b) => a.localeCompare(b, "ar"));
          sortedSubjects.forEach((sub) => {
            const opt = document.createElement("option");
            opt.value = sub;
            const count = stats.subjects.get(sub)?.total || 0;
            opt.textContent = `${sub} (${count} معلم)`;
            if (sub === currentVal) opt.selected = true;
            selectSubject.appendChild(opt);
          });
        }
      }

      window.updateStaffStatsUI = updateStaffStatsUI;
      updateStaffStatsUI();

      btnExportMaster?.addEventListener("click", async () => {
        const staff = await getOrLoadStaff();
        if (!staff || !staff.length) {
          const ok = window.neprasDialog?.confirm
            ? await window.neprasDialog.confirm(
                "لا توجد بيانات عاملين محفوظة حالياً لإعداد السجل.\n\nهل ترغب في تنزيل وتحديث بيانات جميع العاملين (أساسي + منتدب + حصة) الآن من موقع الوزارة؟",
                { title: "تنزيل بيانات العاملين مطلوب", okText: "تنزيل البيانات الشاملة الآن", cancelText: "إلغاء" }
              )
            : false;
          if (ok) {
            btnStaffFetchAllComprehensive?.click();
          } else if (!window.neprasDialog?.confirm) {
            showNeprasPopupNotice("لا توجد بيانات عاملين محفوظة بعد. اضغط على «⚡ تنزيل وتحديث بيانات العاملين الشاملة من الموقع» أعلاه.", "warning", "تنبيه");
          }
          return;
        }
        if (!window.NeprasStaffStats?.buildStaffWorkbook) {
          showNeprasPopupNotice("وحدة إحصاء العاملين غير متوفرة.", "error", "خطأ");
          return;
        }

        showNeprasPopupNotice("جاري إنشاء مصنف سجل العاملين الشامل مقسماً بالتخصصات...", "info", "تصدير السجل الشامل");
        const meta = typeof getStatsCenterMeta === "function" ? getStatsCenterMeta() : {};
        try {
          let outputWb = null;
          if (typeof window.NeprasStaffStats?.buildStaffWorkbookPackage === "function") {
            outputWb = window.NeprasStaffStats.buildStaffWorkbookPackage(staff, meta);
          }
          if (!outputWb) {
            outputWb = window.NeprasStaffStats.buildStaffWorkbook(staff, meta, typeof XLSX !== "undefined" ? XLSX : null);
          }
          const fileName = `سجل_العاملين_الشامل_بالتخصصات_${meta.safeName || "المدرسة"}.xlsx`;
          await neprasUnifiedDownloadXlsx(outputWb, fileName, "سجل_العاملين", "تم تصدير سجل العاملين الشامل مقسماً بالتخصصات بنجاح.");
        } catch (err) {
          showNeprasPopupNotice("تعذر تصدير السجل: " + (err.message || String(err)), "error", "خطأ");
        }
      });

      btnExportPerformanceReports?.addEventListener("click", async () => {
        const staff = await getOrLoadStaff();
        if (!staff || !staff.length) {
          const ok = window.neprasDialog?.confirm
            ? await window.neprasDialog.confirm(
                "لا توجد بيانات عاملين محفوظة حالياً لإعداد تقارير الكفاية.\n\nهل ترغب في تنزيل وتحديث بيانات جميع العاملين (أساسي + منتدب + حصة) الآن من موقع الوزارة؟",
                { title: "تنزيل بيانات العاملين مطلوب", okText: "تنزيل البيانات الشاملة الآن", cancelText: "إلغاء" }
              )
            : false;
          if (ok) {
            btnStaffFetchAllComprehensive?.click();
          } else if (!window.neprasDialog?.confirm) {
            showNeprasPopupNotice("لا توجد بيانات عاملين محفوظة بعد. اضغط على «⚡ تنزيل وتحديث بيانات العاملين الشاملة من الموقع» أعلاه.", "warning", "تنبيه");
          }
          return;
        }

        if (!window.NeprasStaffAnnualReports?.buildAnnualPerformanceZip) {
          showNeprasPopupNotice("وحدة تقارير الكفاية وتقويم الأداء غير متوفرة.", "error", "خطأ");
          return;
        }

        showNeprasPopupNotice("جاري إعداد تقارير تقويم الأداء السنوية (الكفاية) لكل فئة في ملف ZIP...", "info", "تقارير الكفاية السنوية");
        const meta = typeof getStatsCenterMeta === "function" ? getStatsCenterMeta() : {};
        try {
          const schoolContext = {
            schoolName: meta.schoolName || meta.safeName || "المدرسة",
            administration: meta.administration || meta.edara || "",
            directorate: meta.directorate || meta.modereya || ""
          };

          const zipBytes = await window.NeprasStaffAnnualReports.buildAnnualPerformanceZip(staff, schoolContext, {
            onProgress: (cur, tot, name) => {
              showNeprasPopupNotice(`جاري إعداد تقارير الكفاية: (${cur}/${tot}) - ${name}`, "info", "جاري المعالجة");
            }
          });

          const zipBlob = new Blob([zipBytes], { type: "application/zip" });
          const zipFileName = `تقارير_تقويم_الأداء_السنوية_الكفاية_${meta.safeName || "العاملين"}.zip`;
          await neprasUnifiedDownload(zipBlob, zipFileName, "تقارير_الكفاية", "تم استخراج تقارير تقويم الأداء السنوية لجميع العاملين بنجاح.");
        } catch (err) {
          showNeprasPopupNotice("تعذر استخراج تقارير الكفاية: " + (err.message || String(err)), "error", "خطأ");
        }
      });

      btnExportSingle?.addEventListener("click", async () => {
        const selectedSub = selectSubject?.value;
        if (!selectedSub) {
          showNeprasPopupNotice("يرجى اختيار مادة التدريس أو التخصص أولاً من القائمة.", "warning", "تحديد التخصص مطلوب");
          selectSubject?.focus();
          return;
        }

        const staff = await getOrLoadStaff();
        if (!staff || !staff.length) {
          showNeprasPopupNotice("لا توجد بيانات عاملين متاحة.", "warning", "تنبيه");
          return;
        }

        const groups = window.NeprasStaffStats.groupStaffBySubject(staff);
        const subStaff = groups.get(selectedSub) || [];
        if (!subStaff.length) {
          showNeprasPopupNotice(`لم يتم العثور على أي معلم مسجل بتخصص "${selectedSub}".`, "warning", "تنبيه");
          return;
        }

        const meta = typeof getStatsCenterMeta === "function" ? getStatsCenterMeta() : {};
        const rawSchool = meta.schoolName || meta.school || "";
        const rawYear = meta.year || (globalThis.NeprasEgypt?.academicYearLabel?.() || "2026 / 2027").replace(" / ", "-");
        const rawDir = meta.directorate || meta.dir || "";
        const rawAdmin = meta.administration || meta.admin || "";

        const foundSchool = subStaff.find(s => s.raw?.schoolName || s.raw?.gehaName || s.raw?.["الجهة"] || s.raw?.["اسم الجهة الأصلية"]);
        const school = rawSchool && rawSchool !== "المدرسة" ? rawSchool : (foundSchool?.raw?.schoolName || foundSchool?.raw?.gehaName || foundSchool?.raw?.["الجهة"] || "المدرسة");
        const foundDir = subStaff.find(s => s.raw?.mudriaName || s.raw?.orgMudriaName || s.raw?.["المديرية الأصلية"]);
        const dir = rawDir || foundDir?.raw?.mudriaName || foundDir?.raw?.orgMudriaName || foundDir?.raw?.["المديرية الأصلية"] || "مديرية التربية والتعليم";
        const foundAdmin = subStaff.find(s => s.raw?.edaraName || s.raw?.["الإدارة الأصلية"]);
        const admin = rawAdmin || foundAdmin?.raw?.edaraName || foundAdmin?.raw?.["الإدارة الأصلية"] || "الإدارة التعليمية";

        const officialGov = dir.startsWith("مديرية") ? dir : `مديرية التربية والتعليم بـ${dir}`;
        const officialAdm = admin.includes("إدارة") ? (admin.endsWith("التعليمية") ? admin : `${admin} التعليمية`) : `إدارة ${admin} التعليمية`;
        const officialSch = school.startsWith("مدرسة") ? school : `مدرسة ${school}`;

        const headers = [
          "م", "كود الموظف", "اسم المعلم الكامل", "الرقم القومي", "الوظيفة على الكادر",
          "المؤهل وتاريخه", "تاريخ استلام العمل", "تصنيف العامل", "الموقف من العمل", "رقم المحمول"
        ];

        const rows = subStaff.map((st, idx) => [
          idx + 1,
          st.code,
          st.name,
          st.nid || "غير مسجل",
          st.job,
          `${st.degree} ${st.degreeDate ? "(" + st.degreeDate + ")" : ""}`.trim(),
          st.startDate || st.hireDate || "غير مسجل",
          st.category,
          st.workStatus,
          st.phone || "غير مسجل"
        ]);

        let singleOutput = null;
        if (typeof neprasBuildMultiSheetWorkbook === "function") {
          singleOutput = neprasBuildMultiSheetWorkbook([{
            name: selectedSub.slice(0, 31),
            title: `كشف حصر معلمي مادة: ${selectedSub}`,
            infoLines: [
              officialGov,
              officialAdm,
              officialSch,
              `العام الدراسي: ${rawYear} — إجمالي معلمي التخصص: ${subStaff.length} معلم`
            ],
            headers,
            rows,
            rightAlignCols: [2, 4],
            numericCols: [0, 1],
            countLabel: "معلمي المادة",
            recordCount: subStaff.length,
            footerSigners: ["المدرس الأول المشرف", "وكيل شؤون التعليم", "مدير المدرسة"]
          }]);
        } else {
          const wb = XLSX.utils.book_new();
          const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
          ws["!views"] = [{ rightToLeft: true }];
          ws["!cols"] = [
            { wch: 6 }, { wch: 14 }, { wch: 28 }, { wch: 18 }, { wch: 18 },
            { wch: 22 }, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 16 }
          ];
          XLSX.utils.book_append_sheet(wb, ws, selectedSub.slice(0, 31));
          singleOutput = wb;
        }

        const safeSubFile = selectedSub.replace(/[\\/:*?"<>|]/g, "_");
        const fileName = `كشف_معلمي_${safeSubFile}_${meta.safeName || "المدرسة"}.xlsx`;
        await neprasUnifiedDownloadXlsx(singleOutput, fileName, "كشوف_المعلمين", `تم تصدير كشف معلمي ${selectedSub} بنجاح.`);
      });

      fileInput?.addEventListener("change", async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
          showNeprasPopupNotice("جاري قراءة واستيراد ملف Excel للعاملين...", "info", "استيراد ملف");
          const buffer = await file.arrayBuffer();
          const wb = XLSX.read(buffer, { type: "array" });
          const firstSheet = wb.Sheets[wb.SheetNames[0]];

          // قراءة ذكية لملف الإكسيل تبحث عن صف الترويسة الفعلي (سواء كان في الصف الأول أو بعد ترويسة الوزارة)
          const rawGrid = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: "" });
          if (!Array.isArray(rawGrid) || !rawGrid.length) {
            throw new Error("الملف فارغ أو لا يحتوي على صفوف بيانات صالحة.");
          }

          let headerIdx = 0;
          const headerKeywords = [/كود/i, /اسم/i, /قومي|قومى/i, /وظيفة|وظيفه/i, /مادة|ماده|تخصص/i, /توظيف|تصنيف/i, /الموقف|حالة/i];
          for (let r = 0; r < Math.min(rawGrid.length, 20); r++) {
            const row = rawGrid[r];
            if (!Array.isArray(row)) continue;
            let matchCount = 0;
            for (const cell of row) {
              const s = String(cell || "").trim();
              if (headerKeywords.some(rx => rx.test(s))) matchCount++;
            }
            if (matchCount >= 2) {
              headerIdx = r;
              break;
            }
          }

          const headerRow = (rawGrid[headerIdx] || []).map(h => String(h || "").trim());
          const json = [];
          for (let r = headerIdx + 1; r < rawGrid.length; r++) {
            const row = rawGrid[r];
            if (!Array.isArray(row) || !row.some(c => String(c || "").trim() !== "")) continue;
            const obj = {};
            headerRow.forEach((colName, cIdx) => {
              if (colName) {
                obj[colName] = row[cIdx] !== undefined ? row[cIdx] : "";
              }
            });
            // إذا كان الصف يحتوي على أي بيانات مفيدة كاسم أو كود
            if (Object.values(obj).some(v => String(v || "").trim() !== "")) {
              json.push(obj);
            }
          }

          if (!json.length) {
            throw new Error("لم يتم العثور على سجلات عاملين صالحة داخل الملف.");
          }

          window.neprasCachedStaffList = json;
          await chrome.storage.local.set({ neprasCachedStaffList: json }).catch(() => {});
          await updateStaffStatsUI();
          showNeprasPopupNotice(`تم استيراد بيانات العاملين بنجاح: ${json.length} معلماً وموظفاً.`, "success", "اكتمل الاستيراد");
        } catch (err) {
          showNeprasPopupNotice("تعذر قراءة ملف الإكسيل: " + (err.message || String(err)), "error", "خطأ");
        }
      });
    }

    neprasInitStaffStatsUI();

        // ========================================================
    // 🔐 خزنة الدخول السريع والتعبئة التلقائية لحساب الوزارة
    // ========================================================
    function neprasInitQuickLoginUI() {
      const inputUser = document.getElementById("nepras-login-user");
      const inputPass = document.getElementById("nepras-login-pass");
      const btnTogglePass = document.getElementById("btn-toggle-login-pass-visibility");
      const btnSave = document.getElementById("btn-save-quick-login");
      const btnAutofill = document.getElementById("btn-autofill-quick-login");
      const btnClear = document.getElementById("btn-clear-quick-login");
      const statusMsg = document.getElementById("quick-login-status-msg");

      const loginBanner = document.getElementById("n-login-banner");
      const btnBannerAutofill = document.getElementById("btn-login-autofill-banner");
      const btnBannerSettings = document.getElementById("btn-login-open-settings");

      const QuickLogin = window.NeprasQuickLogin || globalThis.NeprasQuickLogin;

      // 1. استرجاع البيانات المحفوظة وعرضها
      async function refreshForm() {
        if (!QuickLogin) return;
        try {
          const creds = await QuickLogin.getCredentials();
          if (creds && creds.username) {
            if (inputUser) inputUser.value = creds.username;
            if (inputPass) inputPass.value = creds.password;
            if (statusMsg) {
              statusMsg.textContent = "✅ البيانات محفوظة محلياً";
              statusMsg.style.display = "inline";
            }
          } else {
            if (inputUser) inputUser.value = "";
            if (inputPass) inputPass.value = "";
            if (statusMsg) statusMsg.style.display = "none";
          }
        } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
      }

      // 2. فحص التبويب الحالي: هل هو صفحة تسجيل دخول؟
      async function checkCurrentTab() {
        try {
          if (typeof chrome === "undefined" || !chrome.tabs?.query) return;
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (!tab?.url) return;
          const isLogin = QuickLogin?.isLoginPage(tab.url);
          if (isLogin && loginBanner) {
            loginBanner.style.display = "block";
            const creds = await QuickLogin?.getCredentials();
            const desc = document.getElementById("n-login-banner-desc");
            if (desc) {
              if (creds?.username) {
                desc.textContent = `حسابك المحفوظ (${creds.username}) جاهز للتعبئة الفورية بضغطة زر واحدة.`;
              } else {
                desc.textContent = "يمكنك حفظ بيانات دخول المدرسة لتعبئتها هنا بضغطة زر واحدة.";
              }
            }
          }
        } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
      }

      refreshForm();
      checkCurrentTab();

      // تبديل إظهار/إخفاء كلمة المرور
      btnTogglePass?.addEventListener("click", () => {
        if (!inputPass) return;
        if (inputPass.type === "password") {
          inputPass.type = "text";
          btnTogglePass.textContent = "🔒";
        } else {
          inputPass.type = "password";
          btnTogglePass.textContent = "👁️";
        }
      });

      // حفظ بيانات الدخول
      btnSave?.addEventListener("click", async () => {
        const u = inputUser?.value?.trim() || "";
        const p = inputPass?.value || "";
        if (!u || !p) {
          showNeprasPopupNotice("يرجى إدخال اسم المستخدم وكلمة المرور.", "warning", "تنبيه");
          return;
        }
        try {
          await QuickLogin.saveCredentials(u, p);
          if (statusMsg) {
            statusMsg.textContent = "✅ تم حفظ البيانات بنجاح!";
            statusMsg.style.display = "inline";
          }
          showNeprasPopupNotice("تم حفظ بيانات الدخول محلياً بأمان تام.", "success", "تم الحفظ");
          checkCurrentTab();
        } catch (err) {
          showNeprasPopupNotice(err.message || String(err), "error", "خطأ");
        }
      });

      // مسح بيانات الدخول
      btnClear?.addEventListener("click", async () => {
        if (!confirm("هل أنت متأكد من رغبتك في مسح بيانات الدخول المحفوظة من نبراس؟")) return;
        try {
          await QuickLogin.clearCredentials();
          if (inputUser) inputUser.value = "";
          if (inputPass) inputPass.value = "";
          if (statusMsg) statusMsg.style.display = "none";
          showNeprasPopupNotice("تم مسح بيانات الدخول المحفوظة.", "info", "تم المسح");
          checkCurrentTab();
        } catch (err) {
          showNeprasPopupNotice(err.message || String(err), "error", "خطأ");
        }
      });

      // تعبئة البيانات في التبويب المفتوح
      async function triggerAutofill(autoSubmit = false) {
        try {
          const creds = await QuickLogin?.getCredentials();
          const u = inputUser?.value?.trim() || creds?.username;
          const p = inputPass?.value || creds?.password;

          if (!u || !p) {
            showNeprasPopupNotice("يرجى حفظ أو كتابة بيانات الدخول أولاً.", "warning", "تنبيه");
            return;
          }

          if (typeof chrome === "undefined" || !chrome.tabs?.query) {
            showNeprasPopupNotice("تعذر الوصول لتبويبات المتصفح.", "error", "خطأ");
            return;
          }

          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (!tab?.id) {
            showNeprasPopupNotice("تعذر العثور على التبويب النشط.", "error", "خطأ");
            return;
          }

          chrome.tabs.sendMessage(tab.id, {
            action: "NEPRAS_AUTOFILL_LOGIN",
            credentials: { username: u, password: p },
            autoSubmit
          }, (res) => {
            if (chrome.runtime.lastError || !res?.ok) {
              const msg = res?.message || chrome.runtime.lastError?.message || "تأكد من فتح صفحة تسجيل دخول موقع الوزارة في التبويب الحالي.";
              showNeprasPopupNotice(msg, "warning", "تنبيه");
            } else {
              showNeprasPopupNotice("تمت تعبئة بيانات الدخول في صفحة الوزارة بنجاح!", "success", "تعبئة سريعة");
            }
          });
        } catch (err) {
          showNeprasPopupNotice(err.message || String(err), "error", "خطأ");
        }
      }

      btnAutofill?.addEventListener("click", () => triggerAutofill(false));
      btnBannerAutofill?.addEventListener("click", () => triggerAutofill(true));

      btnBannerSettings?.addEventListener("click", () => {
        const tabFiles = document.getElementById("tab-files");
        if (tabFiles) tabFiles.click();
        const secLogin = document.getElementById("sec-quick-login");
        if (secLogin) {
          secLogin.scrollIntoView({ behavior: "smooth" });
        }
      });
    }

    neprasInitQuickLoginUI();
  }

  neprasInitEnhancedTools();

  // 🚀 تفعيل وحدات التحكم المعمارية الحديثة (Modern Modular Controllers)
  try {
    const metaGetter = window.getStatsCenterMeta || (typeof getStatsCenterMeta === "function" ? getStatsCenterMeta : () => ({}));
    globalThis.NeprasCardsController?.init?.({ showNotice: showNeprasPopupNotice, getSchoolMeta: metaGetter });
    globalThis.NeprasAttendanceController?.init?.({ showNotice: showNeprasPopupNotice, getSchoolMeta: metaGetter });
    globalThis.NeprasStatsController?.init?.({
      showNotice: showNeprasPopupNotice,
      getSchoolMeta: metaGetter,
      getCachedStudents: () => window.neprasCachedStudentsList || []
    });
  } catch (err) {
    if (globalThis.NeprasLogger) NeprasLogger.warn("POPUP_INIT", "controllers_init", err);
  }
  awaitSafe(window.updateAbsenceWarningsUI?.());

  function awaitSafe(promise) {
    try { promise?.catch?.(() => {}); } catch (err) { console.warn("[Nepras Handled]", err?.message || err); }
  }
});

  // Tariff change listeners
  ["tariff-full", "tariff-partial", "tariff-exempt"].forEach(id => {
    document.getElementById(id)?.addEventListener("input", () => {
      if (!currentRenderedExpensesResult) return;
      const rows = currentRenderedExpensesResult.rows;
      const total = rows.length;
      const boys = rows.filter(isStudentBoy).length;
      const girls = rows.filter(isStudentGirl).length;
      const paidFull = rows.filter(r => !r.isHome && r.paid && r.exemptionClass !== "partial" && r.exemptionClass !== "full").length;
      const paidPartial = rows.filter(r => !r.isHome && r.paid && r.exemptionClass === "partial").length;
      const paidExempt = rows.filter(r => !r.isHome && r.paid && r.exemptionClass === "full").length;
      const paidTotal = paidFull + paidPartial + paidExempt;
      const unpaidTotal = rows.filter(r => !r.isHome && !r.paid).length;
      const pctStr = total > 0 ? ((paidTotal / total) * 100).toFixed(1) + "%" : "0.0%";
      renderExpensesFinancialTable(total, boys, girls, paidFull, paidPartial, paidExempt, paidTotal, unpaidTotal, pctStr);
    });
  });

  // Delegated click handler for any .expenses-stat button
  document.addEventListener("click", e => {
    const btn = e.target.closest(".expenses-stat[data-exp-cat]");
    if (btn) {
      openExpensesDetails(btn.dataset.expCat || "all");
    }
  });

  // Dedicated Table Export Button
  document.getElementById("btn-expenses-export-report")?.addEventListener("click", () => {
    const tFull = Number(document.getElementById("tariff-full")?.value) || 395;
    const tPartial = Number(document.getElementById("tariff-partial")?.value) || 259.91;
    const tExempt = Number(document.getElementById("tariff-exempt")?.value) || 39.22;
    const run = async () => {
      await navigateAndRun({
        targetUrl: "https://student.emis.gov.eg/student/list",
        siteHost: "student.emis.gov.eg",
        messages: [{
          action: "EXPORT_EXPENSES_REPORT_EXCEL",
          tariffs: { tFull, tPartial, tExempt }
        }]
      });
    };
    const btn = document.getElementById("btn-expenses-export-report");
    window.withButtonBusy ? window.withButtonBusy(btn, run) : run();
  });

  // Dedicated Print Button
  document.getElementById("btn-expenses-print-report")?.addEventListener("click", () => {
    if (!currentRenderedExpensesResult) return;
    const printWrap = document.getElementById("expenses-report-container") || document.getElementById("expenses-content");
    if (!printWrap) return;

    const w = window.open("", "_blank", "width=1000,height=800");
    if (!w) {
      window.print();
      return;
    }
    const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>تقرير تحليل المصروفات المدرسية</title>
  <style>
    body { font-family: Cairo, Tahoma, Arial, sans-serif; direction: rtl; padding: 20px; background: #fff; color: #111; }
    h2 { text-align: center; color: #17436b; margin-bottom: 4px; font-size: 20px; }
    .date { text-align: center; color: #64748b; font-size: 12px; margin-bottom: 12px; }
    .pill { text-align: center; font-weight: bold; background: #f1f5f9; padding: 8px; border-radius: 9999px; border: 1px solid #cbd5e1; font-size: 13px; margin: 10px auto; max-width: 800px; }
    .kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 14px 0; }
    .card { border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px; text-align: center; background: #f8fafc; }
    .card.green { background: #f0fdf4; border-color: #bbf7d0; }
    .card.green b { color: #15803d; }
    .card.red { background: #fef2f2; border-color: #fecaca; }
    .card.red b { color: #dc2626; }
    .card b { font-size: 20px; display: block; margin-bottom: 2px; }
    .card span { font-size: 12px; color: #475569; font-weight: bold; }
    .banner { background: #1e3a5f; color: #fff; padding: 8px; font-weight: bold; text-align: center; border-radius: 8px 8px 0 0; margin-top: 16px; font-size: 14px; }
    table { width: 100%; border-collapse: collapse; text-align: center; font-size: 12px; margin-bottom: 10px; }
    th, td { border: 1px solid #cbd5e1; padding: 6px; }
    th { background: #f1f5f9; }
    .th-green { background: #dcfce7; color: #166534; }
    .th-red { background: #fee2e2; color: #991b1b; }
    .cell-green { color: #15803d; font-weight: bold; }
    .cell-red { color: #dc2626; font-weight: bold; }
    .progress-bar { background: #e2e8f0; border-radius: 9999px; height: 14px; overflow: hidden; margin: 8px 0; }
    .progress-fill { background: #10b981; height: 100%; border-radius: 9999px; }
    .tariffs { display: flex; justify-content: space-around; background: #f8fafc; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; margin: 10px 0; font-weight: bold; }
    @media print { button { display: none; } }
  </style>
</head>
<body>
  ${printWrap.innerHTML}
  <script>
    window.onload = function() {
      // Remove interactive buttons in print
      document.querySelectorAll('button').forEach(b => {
        const span = document.createElement('span');
        span.innerHTML = b.innerHTML;
        b.parentNode.replaceChild(span, b);
      });
      window.print();
    };
  </script>
</body>
</html>`;
    w.document.open();
    w.document.write(html);
    w.document.close();
  });
