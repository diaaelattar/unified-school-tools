console.log("✅ نبراس: النسخة المعدلة لدمج اسم المدرسة في أسماء الملفات.");

// ==========================================
// v1.0 — إيقاف حقيقي + واجهة مبسطة + اختيار نطاق الصفوف للشيت
// ==========================================
let neprasAttendanceStopRequested = false;

function neprasAttendanceIsStopped() {
  try {
    return neprasAttendanceStopRequested === true ||
      window.__NEPRAS_STOP_ALL_REQUESTED__ === true ||
      (typeof window.neprasIsGlobalStopRequested === "function" && window.neprasIsGlobalStopRequested());
  } catch (_) {
    return neprasAttendanceStopRequested === true;
  }
}

function neprasAttendanceThrowIfStopped() {
  if (!neprasAttendanceIsStopped()) return;
  const error = new Error("USER_STOPPED");
  error.code = "USER_STOPPED";
  throw error;
}

function neprasAttendanceResetStop() {
  neprasAttendanceStopRequested = false;
  try { window.neprasResetGlobalStop?.(); } catch (_) {
    try { window.__NEPRAS_STOP_ALL_REQUESTED__ = false; } catch (_) {}
  }
}

function neprasAttendanceRequestStop(reason = "attendance_stop") {
  neprasAttendanceStopRequested = true;
  try { window.neprasRequestGlobalStop?.(reason); } catch (_) {
    try { window.__NEPRAS_STOP_ALL_REQUESTED__ = true; } catch (_) {}
  }
  try { sessionStorage.removeItem("ATTENDANCE_AUTO_STATE"); } catch (_) {}
  try { removeStatusBanner(); } catch (_) {}
}

window.addEventListener("nepras:stop-all", () => {
  neprasAttendanceStopRequested = true;
  try { sessionStorage.removeItem("ATTENDANCE_AUTO_STATE"); } catch (_) {}
});


// ==========================================
// v1.0 — تجهيز/تنظيف آمن قبل أوامر الغياب
// ==========================================

function neprasAttendanceHideFloatingStatus(
  delay = 0
) {
  try {
    if (
      typeof hideFloatingStatus ===
      "function"
    ) {
      hideFloatingStatus(
        delay
      );
      return;
    }
  } catch (_) {}

  setTimeout(
    () => {
      try {
        const box =
          document.getElementById(
            "neprasFloatingStatusBox"
          );

        if (box) {
          box.style.display = "none";
        }
      } catch (_) {}
    },
    Math.max(
      0,
      Number(delay) || 0
    )
  );
}

async function neprasAttendancePrepareCommand(
  reason = "attendance_pre_run"
) {
  neprasAttendanceResetStop();

  try {
    await chrome.runtime.sendMessage({
      action:
        "NEPRAS_PREPARE_COMMAND_STATE",
      reason:
        String(
          reason ||
          "attendance_pre_run"
        )
    });
  } catch (error) {
    // التنظيف التحضيري خدمة مساعدة؛ فشله لا يمنع وظيفة الغياب نفسها.
    console.warn(
      "Nepras attendance pre-run cleanup:",
      error?.message || error
    );
  }
}

// الهروب من ui/escape.js (مصدر واحد). تحويل السطر الجديد إلى <br> لرسائل الحوارات.
function neprasAttendanceEscapeHtml(value) {
  return NeprasEscape.multiline(value);
}

function neprasAttendanceEnsureDialogStyles() {
  if (document.getElementById("neprasAttendanceDialogStyles")) return;

  const style = document.createElement("style");
  style.id = "neprasAttendanceDialogStyles";
  style.textContent = `
    .nepras-att-overlay {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 18px;
      background: rgba(8, 15, 30, .62);
      backdrop-filter: blur(3px);
      direction: rtl;
      font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
    }
    .nepras-att-dialog {
      width: min(640px, 96vw);
      max-height: 92vh;
      overflow: auto;
      background: linear-gradient(180deg, #ffffff, #f8fbff);
      border-radius: 24px;
      box-shadow: 0 24px 70px rgba(0,0,0,.30);
      border: 1px solid rgba(218,229,241,.9);
      color: #11324d;
    }
    .nepras-att-dialog.small { width: min(520px, 95vw); }
    .nepras-att-head {
      padding: 20px 22px;
      background: linear-gradient(135deg, #0b5ed7, #0f766e);
      color: #fff;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .nepras-att-head .icon {
      width: 52px;
      height: 52px;
      border-radius: 16px;
      background: rgba(255,255,255,.18);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 28px;
      box-shadow: inset 0 0 0 1px rgba(255,255,255,.18);
      flex: 0 0 auto;
    }
    .nepras-att-head .title {
      font-size: 22px;
      font-weight: 900;
      line-height: 1.4;
    }
    .nepras-att-head .sub {
      font-size: 13px;
      opacity: .95;
      margin-top: 3px;
      line-height: 1.7;
    }
    .nepras-att-body { padding: 22px; }
    .nepras-att-msg {
      font-size: 16px;
      line-height: 2;
      font-weight: 700;
      color: #21405d;
      white-space: normal;
    }
    .nepras-att-note {
      margin-top: 14px;
      background: #eef7ff;
      border-right: 5px solid #0d6efd;
      color: #174a7a;
      border-radius: 14px;
      padding: 14px 16px;
      line-height: 1.9;
      font-weight: 800;
    }
    .nepras-att-error {
      margin-top: 14px;
      background: #fff2f2;
      border-right: 5px solid #dc3545;
      color: #7a1322;
      border-radius: 14px;
      padding: 12px 14px;
      line-height: 1.8;
      font-weight: 800;
      display: none;
    }
    .nepras-att-actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      justify-content: flex-start;
      margin-top: 20px;
    }
    .nepras-att-btn {
      border: none;
      border-radius: 14px;
      padding: 12px 20px;
      cursor: pointer;
      font-size: 15px;
      font-weight: 900;
      transition: transform .15s ease, box-shadow .15s ease, opacity .15s ease;
    }
    .nepras-att-btn:hover { transform: translateY(-1px); }
    .nepras-att-btn.primary {
      background: linear-gradient(135deg, #0ea5a4, #0b5ed7);
      color: #fff;
      box-shadow: 0 10px 24px rgba(13,110,253,.18);
    }
    .nepras-att-btn.secondary {
      background: #e9eef5;
      color: #324f6b;
    }
    .nepras-att-grid-2 {
      display: grid;
      grid-template-columns: repeat(2, minmax(0,1fr));
      gap: 14px;
    }
    .nepras-att-field label {
      display: block;
      margin-bottom: 8px;
      font-size: 14px;
      font-weight: 900;
      color: #20384f;
    }
    .nepras-att-select {
      width: 100%;
      border: 2px solid #ced9e5;
      border-radius: 14px;
      padding: 12px 14px;
      font-size: 15px;
      font-weight: 800;
      background: #fff;
      color: #19344d;
      outline: none;
    }
    .nepras-att-choice-wrap {
      display: grid;
      grid-template-columns: repeat(2, minmax(0,1fr));
      gap: 14px;
      margin-bottom: 18px;
    }
    .nepras-att-choice {
      position: relative;
      border: 2px solid #d8e3ef;
      border-radius: 18px;
      padding: 16px;
      background: #fff;
      cursor: pointer;
      transition: .18s ease;
      box-shadow: 0 8px 20px rgba(15, 23, 42, .04);
    }
    .nepras-att-choice input {
      position: absolute;
      opacity: 0;
      pointer-events: none;
    }
    .nepras-att-choice.active {
      border-color: #0d6efd;
      box-shadow: 0 12px 24px rgba(13,110,253,.16);
      background: linear-gradient(180deg, #ffffff, #eef7ff);
    }
    .nepras-att-choice .c-title {
      font-size: 17px;
      font-weight: 900;
      color: #17324d;
      margin-bottom: 8px;
    }
    .nepras-att-choice .c-sub {
      color: #4b6681;
      line-height: 1.8;
      font-weight: 700;
      font-size: 13px;
    }
    .nepras-att-summary-badges {
      display:flex; gap:10px; flex-wrap:wrap; margin-top:15px;
    }
    .nepras-att-badge {
      padding: 10px 14px;
      border-radius: 999px;
      background: #edf7ed;
      color: #146534;
      font-weight: 900;
      font-size: 13px;
      border: 1px solid #cfe7d1;
    }
    @media (max-width: 640px) {
      .nepras-att-grid-2, .nepras-att-choice-wrap { grid-template-columns: 1fr; }
      .nepras-att-head .title { font-size: 18px; }
      .nepras-att-body { padding: 16px; }
    }
  `;
  document.documentElement.appendChild(style);
}

function neprasAttendanceDialogConfigByType(type = "info") {
  if (type === "success") {
    return {
      icon: "✅",
      title: "تمت العملية بنجاح",
      subtitle: "نبراس أنهى الخطوة المطلوبة وتأكد من النتيجة قبل الإغلاق."
    };
  }
  if (type === "warning") {
    return {
      icon: "⚠️",
      title: "تنبيه مهم",
      subtitle: "يرجى مراجعة الرسالة قبل المتابعة."
    };
  }
  if (type === "error") {
    return {
      icon: "❌",
      title: "تعذر إكمال العملية",
      subtitle: "حدثت مشكلة وتحتاج القرار المناسب قبل الاستمرار."
    };
  }
  return {
    icon: "ℹ️",
    title: "معلومة",
    subtitle: "رسالة توضيحية من نبراس."
  };
}

function neprasAttendanceShowDialog(options = {}) {
  neprasAttendanceEnsureDialogStyles();

  return new Promise(resolve => {
    const old = document.getElementById("neprasAttendanceUniversalDialog");
    if (old) old.remove();

    const cfg = neprasAttendanceDialogConfigByType(options.type || "info");
    const overlay = document.createElement("div");
    overlay.id = "neprasAttendanceUniversalDialog";
    overlay.className = "nepras-att-overlay";

    const dialog = document.createElement("div");
    dialog.className = `nepras-att-dialog ${options.small ? 'small' : ''}`.trim();

    const title = options.title || cfg.title;
    const subtitle = options.subtitle || cfg.subtitle;
    const icon = options.icon || cfg.icon;

    dialog.innerHTML = `
      <div class="nepras-att-head">
        <div class="icon">${neprasAttendanceEscapeHtml(icon)}</div>
        <div>
          <div class="title">${neprasAttendanceEscapeHtml(title)}</div>
          <div class="sub">${neprasAttendanceEscapeHtml(subtitle)}</div>
        </div>
      </div>
      <div class="nepras-att-body">
        <div class="nepras-att-msg">${options.html != null ? /* html-safe: القناة الوحيدة لـ HTML خام؛ كل مستدعٍ يهرب قيمه المتغيرة بنفسه (انظر neprasAttendanceAlert) */ options.html : neprasAttendanceEscapeHtml(options.message || '')}</div>
        ${options.note ? `<div class="nepras-att-note">${neprasAttendanceEscapeHtml(options.note)}</div>` : ''}
        ${options.errorBox ? `<div class="nepras-att-error" id="neprasAttendanceDialogError"></div>` : ''}
        <div class="nepras-att-actions">
          ${options.showCancel ? `<button type="button" class="nepras-att-btn secondary" id="neprasAttendanceDialogCancel">${neprasAttendanceEscapeHtml(options.cancelText || 'إلغاء')}</button>` : ''}
          <button type="button" class="nepras-att-btn primary" id="neprasAttendanceDialogOk">${neprasAttendanceEscapeHtml(options.okText || 'موافق')}</button>
        </div>
      </div>
    `;

    overlay.appendChild(dialog);
    document.documentElement.appendChild(overlay);

    const finish = value => {
      overlay.remove();
      resolve(value);
    };

    const ok = dialog.querySelector('#neprasAttendanceDialogOk');
    const cancel = dialog.querySelector('#neprasAttendanceDialogCancel');

    ok?.addEventListener('click', () => finish(true));
    cancel?.addEventListener('click', () => finish(false));

    if (options.closeOnOverlay !== false) {
      overlay.addEventListener('click', e => {
        if (e.target === overlay) finish(false);
      });
    }
  });
}

function neprasAttendanceAlert(message, opts = {}) {
  if (window.neprasDialog) {
    return window.neprasDialog.alert(message, {
      ...opts,
      type: opts.type || "info"
    });
  }
  return neprasAttendanceShowDialog({
    type: opts.type || "info",
    title: opts.title,
    subtitle: opts.subtitle,
    icon: opts.icon,
    html: opts.html,
    message,
    note: opts.note,
    okText: opts.okText || "موافق",
    small: opts.small !== false
  });
}

function neprasAttendanceConfirm(message, opts = {}) {
  if (window.neprasDialog) {
    return window.neprasDialog.confirm(message, {
      ...opts,
      type: opts.type || "question"
    });
  }
  return neprasAttendanceShowDialog({
    type: opts.type || "warning",
    title: opts.title,
    subtitle: opts.subtitle,
    icon: opts.icon,
    html: opts.html,
    message,
    note: opts.note,
    okText: opts.okText || "متابعة",
    cancelText: opts.cancelText || "إلغاء",
    showCancel: true,
    small: opts.small !== false
  });
}


function neprasAttendanceAskSmartUploadWeeks(totalStudentsInFile, weekOptions) {
  neprasAttendanceEnsureDialogStyles();

  return new Promise(resolve => {
    const old = document.getElementById('neprasAttendanceSmartUploadModal');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.id = 'neprasAttendanceSmartUploadModal';
    overlay.className = 'nepras-att-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'nepras-att-dialog';

    dialog.innerHTML = `
      <div class="nepras-att-head">
        <div class="icon">📤</div>
        <div>
          <div class="title">رفع شيت الغياب الذكي</div>
          <div class="sub">اختر طريقة التطبيق ثم حدد الأسبوع أو نطاق الأسابيع حتى الأسبوع 28 من القوائم بالأسفل.</div>
        </div>
      </div>
      <div class="nepras-att-body">
        <div class="nepras-att-msg">تمت قراءة <b>${Number(totalStudentsInFile) || 0}</b> طالب من الملف بنجاح. اختر الآن طريقة التطبيق المناسبة.</div>
        <div class="nepras-att-summary-badges">
          <div class="nepras-att-badge">📚 عدد الأسابيع المتاحة: ${weekOptions.length}</div>
          <div class="nepras-att-badge">🧮 عدد الطلاب بالملف: ${Number(totalStudentsInFile) || 0}</div>
        </div>
        <div class="nepras-att-note">⚠️ أثناء الحفظ النهائي: لا تضغط أي زر، لا تغيّر الأسبوع أو الصف، ولا تغلق الصفحة حتى تظهر رسالة النجاح.</div>

        <div class="nepras-att-choice-wrap" style="margin-top:18px;">
          <label class="nepras-att-choice active" data-mode="single">
            <input type="radio" name="neprasUploadMode" value="single" checked>
            <div class="c-title">1) أسبوع واحد</div>
            <div class="c-sub">تطبيق الشيت على أسبوع واحد محدد فقط.</div>
          </label>
          <label class="nepras-att-choice" data-mode="range">
            <input type="radio" name="neprasUploadMode" value="range">
            <div class="c-title">2) نطاق أسابيع</div>
            <div class="c-sub">تطبيق الشيت على عدة أسابيع متتالية من البداية للنهاية.</div>
          </label>
        </div>

        <div class="nepras-att-grid-2">
          <div class="nepras-att-field">
            <label>أسبوع البداية / الأسبوع المفرد</label>
            <select class="nepras-att-select" id="neprasUploadWeekStart"></select>
          </div>
          <div class="nepras-att-field" id="neprasUploadEndWrap" style="display:none;">
            <label>أسبوع النهاية</label>
            <select class="nepras-att-select" id="neprasUploadWeekEnd"></select>
          </div>
        </div>

        <div class="nepras-att-error" id="neprasAttendanceUploadError"></div>
        <div class="nepras-att-actions">
          <button type="button" class="nepras-att-btn secondary" id="neprasUploadCancel">إلغاء</button>
          <button type="button" class="nepras-att-btn primary" id="neprasUploadOk">🚀 بدء التطبيق</button>
        </div>
      </div>
    `;

    overlay.appendChild(dialog);
    document.documentElement.appendChild(overlay);

    const startSel = dialog.querySelector('#neprasUploadWeekStart');
    const endSel = dialog.querySelector('#neprasUploadWeekEnd');
    const endWrap = dialog.querySelector('#neprasUploadEndWrap');
    const errorBox = dialog.querySelector('#neprasAttendanceUploadError');
    const cards = Array.from(dialog.querySelectorAll('.nepras-att-choice'));

    const startPlaceholder = document.createElement('option');
    startPlaceholder.value = "";
    startPlaceholder.textContent = "اختر الأسبوع...";
    startPlaceholder.selected = true;
    startSel.appendChild(startPlaceholder);

    const endPlaceholder = document.createElement('option');
    endPlaceholder.value = "";
    endPlaceholder.textContent = "اختر الأسبوع...";
    endPlaceholder.selected = true;
    endSel.appendChild(endPlaceholder);

    weekOptions.forEach((w, idx) => {
      const opt1 = document.createElement('option');
      opt1.value = String(idx);
      opt1.textContent = `${idx + 1}- ${w.text}`;
      startSel.appendChild(opt1);

      const opt2 = document.createElement('option');
      opt2.value = String(idx);
      opt2.textContent = `${idx + 1}- ${w.text}`;
      endSel.appendChild(opt2);
    });

    let mode = 'single';

    function setMode(next) {
      mode = next;
      cards.forEach(card => card.classList.toggle('active', card.dataset.mode === next));
      endWrap.style.display = next === 'range' ? '' : 'none';
      errorBox.style.display = 'none';
      errorBox.textContent = '';
    }

    cards.forEach(card => card.addEventListener('click', () => setMode(card.dataset.mode)));

    const finish = value => {
      overlay.remove();
      resolve(value);
    };

    dialog.querySelector('#neprasUploadCancel')?.addEventListener('click', () => finish(null));
    overlay.addEventListener('click', e => { if (e.target === overlay) finish(null); });

    dialog.querySelector('#neprasUploadOk')?.addEventListener('click', () => {
      const startRaw = String(startSel.value || "").trim();
      const endRaw = String(endSel.value || "").trim();
      const startIdx = startRaw === "" ? NaN : Number(startRaw);
      const endIdx = endRaw === "" ? NaN : Number(endRaw);

      if (!Number.isFinite(startIdx) || !weekOptions[startIdx]) {
        errorBox.textContent = '❌ اختر أسبوعًا صحيحًا للبداية.';
        errorBox.style.display = 'block';
        return;
      }

      if (mode === 'single') {
        finish([weekOptions[startIdx]]);
        return;
      }

      if (!Number.isFinite(endIdx) || !weekOptions[endIdx] || startIdx > endIdx) {
        errorBox.textContent = '❌ نطاق الأسابيع غير صحيح. اجعل النهاية مساوية أو أكبر من البداية.';
        errorBox.style.display = 'block';
        return;
      }

      finish(weekOptions.slice(startIdx, endIdx + 1));
    });
  });
}


// ==========================================
// 1. استقبال الأوامر وتثبيت المراقبة
// ==========================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!request || typeof request !== "object") return false;
  if (request.action === "STOP_ATTENDANCE_TASK" || request.action === "STOP_STUDENT_EXTRACTION") {
    neprasAttendanceRequestStop("message_stop");
    sendResponse?.({ status: "stopped", attendance: true });
    return true;
  }
  if (request.action === "NEPRAS_ATTENDANCE_RUN") {
    neprasAttendanceRunOp(request)
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, code: "run_failed", message: error?.message || String(error) }));
    return true;
  }
  if (request.action === "EXPORT_DATA") {
    exportAllStudentsData();
    sendResponse({ status: "success" });
    return true;
  }
  return false;
});

// ==========================================
// تنفيذ أوامر الغياب القادمة من لوحة الإضافة (النافذة المنبثقة)
//   op: fill-zero | fill-days | download-template | auto-class | auto-full | auto-range | random-students | smart-upload
//   spec: { mode:"fixed", days } | { mode:"range", min, max }  — يُتحقَّق منه هنا ولا يُوثَق به
// العمليات الطويلة تبدأ ثم يرجع الرد فورًا ({ok:true, started:true}) وتتابع البطاقة داخل الصفحة.
// ==========================================
async function neprasAttendanceRunOp(req) {
  const op = String(req?.op || "");
  if (!isAttendancePage()) return { ok: false, code: "not_attendance_page" };
  const needsSpec = ["fill-days", "auto-class", "auto-full", "auto-range"];
  const spec = neprasAttendanceNormalizeSpec(req.spec);
  if (req.spec && !spec && needsSpec.includes(op)) return { ok: false, code: "bad_spec" };

  switch (op) {
    case "fill-zero": {
      const n = setAllDays(0);
      if (!n) { window.neprasDialog?.warning("لا يوجد جدول طلاب معروض. اختر الأسبوع والصف والفصل ثم اضغط عرض الطلاب.", { title: "لا توجد بيانات" }); return { ok: false, code: "no_table" }; }
      window.neprasNotice?.("تم تعبئة 0 يوم غياب لعدد " + n + " طالب.", "success", "تمت التعبئة");
      return { ok: true, count: n };
    }
    case "fill-days":
      promptAndSetDays(spec || undefined);
      return { ok: true, started: true };
    case "download-template": {
      (async () => {
        try {
          await neprasAttendancePrepareCommand("attendance_template_pre_run");
          await downloadSchoolAttendanceTemplate();
        } catch (error) {
          console.error("Nepras attendance template:", error);
          window.NeprasUI?.reportError(error, "attendance-template");
        } finally {
          try { await chrome.runtime.sendMessage({ action: "NEPRAS_CLEANUP_COMMAND_STATE", scope: "student", reason: "attendance_template_finished" }); } catch (_) {}
          neprasAttendanceHideFloatingStatus(250);
        }
      })();
      return { ok: true, started: true };
    }
    case "auto-class":
    case "auto-full":
    case "random-students": {
      if (!neprasAttendanceRequireSelectedWeek(true)) return { ok: false, code: "week_required" };
      await neprasAttendancePrepareCommand("attendance_" + (op === "auto-class" ? "single" : op === "auto-full" ? "full" : "random") + "_pre_run");
      if (op === "auto-class") startSingleGradeAuto(spec || undefined);
      else if (op === "auto-full") startSchoolAuto(false, spec || undefined);
      else startRandomAttendanceAuto();
      return { ok: true, started: true };
    }
    case "auto-range":
      await neprasAttendancePrepareCommand("attendance_range_pre_run");
      startSchoolAuto(true, spec || undefined);
      return { ok: true, started: true };
    case "smart-upload": {
      const f = req.file;
      if (!f || typeof f.b64 !== "string" || !f.b64) return { ok: false, code: "no_file" };
      const bytes = Uint8Array.from(atob(f.b64), (c) => c.charCodeAt(0));
      const file = new File([bytes], String(f.name || "attendance.xlsx"), { type: String(f.type || "") });
      handleExcelSmartUpload({ target: { files: [file], value: "" } });
      return { ok: true, started: true };
    }
    default:
      return { ok: false, code: "unknown_op" };
  }
}

// إزالة أي شريط قديم بقي في الصفحة من إصدار سابق.
document.getElementById("attendance-helper-toolbar")?.remove();

setInterval(processNextStep, 800);

function isAttendancePage() {
  const url = window.location.href;
  const isCorrectUrl = url.includes("absence") || url.includes("Attendance");
  const isWrongPage = url.includes("generouslineage") || url.includes("excuse");
  return isCorrectUrl && !isWrongPage;
}

// ==========================================
// 2. الدالة المسؤولة عن جلب اسم المدرسة من المسار المحدد
// ==========================================
// getSchoolNameFromPage() معرَّفة في modules/export.js (يُحقن قبل هذا الملف في الموقعين) — كانت هنا نسخة مطابقة تحجبها بصمت.

// ==========================================
// 3. بناء شريط الأدوات العلوي
// ==========================================
// أدوات الغياب انتقلت إلى لوحة الإضافة (قسم «الحضور والقبول»): كانت هنا شريطًا داخل صفحة الوزارة يكرر
// نفس العمليات. الأوامر تصل الآن برسالة NEPRAS_ATTENDANCE_RUN (انظر neprasAttendanceRunOp).

// ==========================================
// 4. أدوات مساعدة واختيار القوائم (آمنة ضد CSP)
// ==========================================

// ==========================================
// 4.5 اختيار نطاق الأسابيع (نافذة منسقة)
// ==========================================
function getExpandedWeekOptions() {
  const weekSelect = getWeekSelect();
  if (!weekSelect) return [];

  const raw = Array.from(weekSelect.options || [])
    .filter(opt => opt.value && opt.value !== "0" && !opt.text.includes("اختر"))
    .map((opt, idx) => ({
      val: opt.value,
      text: (opt.text || `الأسبوع ${idx + 1}`).trim(),
      weekNo: idx + 1
    }));

  // موقع الوزارة قد يعرض جزءًا من الأسابيع فقط داخل القائمة.
  // نكمل حتى الأسبوع 28، ونستخدم رقم الأسبوع كقيمة احتياطية للأسابيع غير الظاهرة.
  const byNo = new Map(raw.map(w => [w.weekNo, w]));
  for (let n = 1; n <= 28; n++) {
    if (!byNo.has(n)) {
      byNo.set(n, {
        val: String(n),
        text: `الأسبوع ${n}`,
        weekNo: n
      });
    }
  }

  return Array.from(byNo.values())
    .sort((a, b) => a.weekNo - b.weekNo)
    .slice(0, 28);
}

function showWeekRangeDialog(defaultStart = 1, defaultEnd = 28) {
  return new Promise(resolve => {
    const old = document.getElementById('neprasWeekRangeModal');
    if (old) old.remove();

    const weeks = getExpandedWeekOptions();
    if (!weeks.length) {
      window.neprasDialog?.alert('❌ لم يتم العثور على قائمة الأسابيع بالصفحة!', { type: "warning" });
      resolve(null);
      return;
    }

    const overlay = document.createElement('div');
    overlay.id = 'neprasWeekRangeModal';
    overlay.style.cssText = `
      position:fixed; inset:0; z-index:2147483647;
      background:rgba(0,0,0,.55); display:flex; align-items:center;
      justify-content:center; padding:20px; direction:rtl;
      font-family:Tahoma,Arial,sans-serif;
    `;

    const modal = document.createElement('div');
    modal.style.cssText = `
      width:min(520px,96vw); background:#fff; border-radius:18px;
      box-shadow:0 18px 55px rgba(0,0,0,.35); overflow:hidden;
      border:1px solid #d8e3ee;
    `;

    const header = document.createElement('div');
    header.style.cssText = `
      background:linear-gradient(135deg,#0d6efd,#0a58ca);
      color:#fff; padding:18px 22px; font-weight:800; font-size:19px;
    `;
    header.innerHTML = '🗓️ اختيار نطاق الأسابيع';

    const body = document.createElement('div');
    body.style.cssText = 'padding:22px;';

    const note = document.createElement('div');
    note.style.cssText = `
      background:#eef7ff; color:#164a75; border-right:5px solid #0d6efd;
      padding:12px 14px; border-radius:10px; font-weight:700;
      margin-bottom:18px; line-height:1.8;
    `;
    note.innerHTML = 'اختر <b>أسبوع البداية</b> و<b>أسبوع النهاية</b> لتسجيل الغياب على جميع الأسابيع المتتالية.';

    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:14px;';

    function makeField(label) {
      const wrap = document.createElement('div');
      const lab = document.createElement('div');
      lab.textContent = label;
      lab.style.cssText = 'font-weight:800;color:#243447;margin-bottom:7px;font-size:14px;';
      const sel = document.createElement('select');
      sel.style.cssText = `
        width:100%; padding:11px 12px; border:2px solid #cdd9e5;
        border-radius:10px; font-size:15px; font-weight:700;
        background:#fff; color:#17324d; outline:none;
      `;
      const placeholder = document.createElement('option');
      placeholder.value = "";
      placeholder.textContent = "اختر الأسبوع...";
      placeholder.selected = true;
      sel.appendChild(placeholder);
      weeks.forEach(w => {
        const opt = document.createElement('option');
        opt.value = String(w.weekNo);
        opt.textContent = `${w.weekNo} - ${w.text}`;
        sel.appendChild(opt);
      });
      wrap.append(lab, sel);
      return {wrap, sel};
    }

    const startField = makeField('أسبوع البداية');
    const endField = makeField('أسبوع النهاية');
    grid.append(startField.wrap, endField.wrap);

    const error = document.createElement('div');
    error.style.cssText = 'display:none;color:#b42318;background:#fff1f0;border-right:4px solid #dc3545;padding:9px 11px;border-radius:8px;margin-top:14px;font-weight:800;';

    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;justify-content:flex-start;gap:10px;margin-top:20px;';

    const cancel = document.createElement('button');
    cancel.textContent = 'إلغاء';
    cancel.style.cssText = 'border:none;background:#e9eef3;color:#334e68;padding:11px 20px;border-radius:10px;font-weight:800;cursor:pointer;';

    const ok = document.createElement('button');
    ok.textContent = '✅ تطبيق النطاق';
    ok.style.cssText = 'border:none;background:#16a085;color:#fff;padding:11px 22px;border-radius:10px;font-weight:800;cursor:pointer;box-shadow:0 5px 14px rgba(22,160,133,.25);';

    const finish = value => { overlay.remove(); resolve(value); };
    cancel.onclick = () => finish(null);
    overlay.addEventListener('click', e => { if (e.target === overlay) finish(null); });
    ok.onclick = () => {
      const startRaw = String(startField.sel.value || "").trim();
      const endRaw = String(endField.sel.value || "").trim();
      if (!startRaw || !endRaw) {
        error.textContent = '❌ اختر أسبوع البداية وأسبوع النهاية.';
        error.style.display = 'block';
        return;
      }
      const start = Number(startRaw);
      const end = Number(endRaw);
      if (start > end) {
        error.textContent = '❌ أسبوع النهاية يجب أن يكون مساويًا أو أكبر من أسبوع البداية.';
        error.style.display = 'block';
        return;
      }
      const selected = weeks.filter(w => w.weekNo >= start && w.weekNo <= end);
      finish(selected.map(w => ({val:w.val, text:w.text, weekNo:w.weekNo})));
    };

    actions.append(cancel, ok);
    body.append(note, grid, error, actions);
    modal.append(header, body);
    overlay.appendChild(modal);
    document.documentElement.appendChild(overlay);
  });
}

function getSelectByLabel(labelText) {
  const selects = Array.from(document.querySelectorAll("select"));
  return selects.find(s => {
    const parentText = s.parentElement?.innerText || "";
    const name = (s.name || s.id || "").toLowerCase();
    return parentText.includes(labelText) || name.includes(labelText);
  });
}

function getWeekSelect() { return getSelectByLabel("الأسبوع") || getSelectByLabel("أسبوع"); }


// v1.0 RC3 — لا يبدأ أي حفظ يعتمد على الأسبوع قبل اختيار أسبوع فعلي.
function neprasAttendanceWeekRefIsValid(week) {
  const value = String(week?.val ?? week?.value ?? "").trim();
  const text = String(week?.text ?? "").trim();
  if (!value || value === "0" || value === "-1") return false;
  if (!text || /اختر|اختيار/i.test(text)) return false;
  return true;
}

function neprasAttendanceRequireSelectedWeek(showWarning = true) {
  const weekSelect = getWeekSelect();
  const value = String(weekSelect?.value || "").trim();
  const selected = weekSelect && weekSelect.selectedIndex >= 0
    ? weekSelect.options[weekSelect.selectedIndex]
    : null;
  const text = String(selected?.text || "").trim();
  const week = { val: value, text };

  if (weekSelect && neprasAttendanceWeekRefIsValid(week)) return week;

  if (showWarning) {
    window.neprasDialog?.alert(
      "⚠️ اختر الأسبوع أولًا قبل بدء تسجيل الغياب.\nلن يبدأ نبراس أي حفظ قبل تحديد الأسبوع.",
      { type: "warning", title: "اختيار الأسبوع مطلوب" }
    );
    try {
      weekSelect?.scrollIntoView?.({ behavior: "smooth", block: "center" });
      weekSelect?.focus?.();
    } catch (_) {}
  }
  return null;
}
function getGradeSelect() { return getSelectByLabel("الصف"); }
function getClassSelect() { return getSelectByLabel("الفصل"); }

function getSaveButton() {
  const btns = Array.from(document.querySelectorAll("button, input[type='submit'], input[type='button'], a.btn"));
  return btns.find(b => (b.innerText || b.value || "").trim() === "حفظ");
}

function getShowStudentsButton() {
  const btns = Array.from(document.querySelectorAll("button, input[type='submit'], input[type='button'], a.btn, input.btn"));
  return btns.find(b => {
    const txt = (b.innerText || b.value || "").trim();
    return /عرض\s*كل\s*الطلبة|عرض\s*الطلبة|عرض\s*الطلاب|عرض\s*الفصل|عرض\s*التقرير|عرض|بحث/i.test(txt);
  });
}

function clickButtonSafely(element) {
  if (!element) return;
  try {
    element.focus();

    // بعض أزرار الوزارة عبارة عن <a href="javascript:...">.
    // تنفيذ .click() عليها من الإضافة كان يولّد خطأ CSP رغم أن معالج Angular نفسه صحيح.
    // نمنع فقط الـ javascript: navigation الافتراضي، مع ترك click يصل لكل مستمعي الصفحة.
    const href = String(element.getAttribute?.("href") || "").trim();
    if (/^javascript:/i.test(href)) {
      element.addEventListener("click", event => {
        event.preventDefault();
      }, { capture: true, once: true });
    }

    element.click();
  } catch (err) {
    console.error("تعذر النقر على العنصر:", err);
  }
}

function triggerSelectChange(selectElem, val) {
  if (!selectElem) return;
  selectElem.value = val;
  selectElem.dispatchEvent(new Event("change", { bubbles: true }));
  selectElem.dispatchEvent(new Event("input", { bubbles: true }));
  if (window.jQuery) {
    try { window.jQuery(selectElem).trigger("change"); } catch(e){}
  }
}

// ---- عدد أيام الغياب: ثابت للجميع، أو مدى عشوائي لكل طالب ----
// spec = { mode: "fixed", days: N } | { mode: "range", min: A, max: B }
const NEPRAS_ATTENDANCE_MAX_DAYS = 5; // أقصى عدد أيام في الأسبوع الدراسي (5 أيام)

function neprasAttendanceParseSpec(mode, raw) {
  const t = NeprasEgypt.toLatinDigits(String(raw == null ? "" : raw)).trim();
  const bad = (m) => ({ error: m });
  const num = (x) => (/^\d{1,2}$/.test(x) ? Number(x) : NaN);
  if (mode === "fixed") {
    const n = num(t);
    if (!Number.isInteger(n)) return bad("أدخل رقمًا صحيحًا من 0 إلى " + NEPRAS_ATTENDANCE_MAX_DAYS + ".");
    if (n > NEPRAS_ATTENDANCE_MAX_DAYS) return bad("أقصى عدد أيام في الأسبوع " + NEPRAS_ATTENDANCE_MAX_DAYS + ".");
    return { spec: { mode: "fixed", days: n } };
  }
  const m = t.match(/^(\d{1,2})\s*(?:-|–|—|إلى|الى|:)\s*(\d{1,2})$/);
  if (!m) return bad("اكتب المدى بصيغة «من-إلى» مثل 0-3.");
  const min = Number(m[1]), max = Number(m[2]);
  if (min > max) return bad("الحد الأدنى يجب ألا يزيد عن الحد الأعلى.");
  if (max > NEPRAS_ATTENDANCE_MAX_DAYS) return bad("أقصى عدد أيام في الأسبوع " + NEPRAS_ATTENDANCE_MAX_DAYS + ".");
  return { spec: { mode: "range", min, max } };
}

// يتحقق من كائن spec قادم من رسالة (لا نثق بما يصل من خارج الصفحة)
function neprasAttendanceNormalizeSpec(spec) {
  if (!spec || typeof spec !== "object") return null;
  if (spec.mode === "fixed") return neprasAttendanceParseSpec("fixed", spec.days).spec || null;
  if (spec.mode === "range") return neprasAttendanceParseSpec("range", spec.min + "-" + spec.max).spec || null;
  return null;
}

function neprasAttendanceDaysFor(spec) {
  if (spec.mode === "range") return spec.min + Math.floor(Math.random() * (spec.max - spec.min + 1));
  return spec.days;
}

function neprasAttendanceDescribeSpec(spec) {
  if (spec.mode === "range") return "مدى عشوائي من " + spec.min + " إلى " + spec.max + " يوم لكل طالب";
  return spec.days + " يوم للجميع";
}

async function neprasAttendanceAskSpec({ title, message, note, okText } = {}) {
  const UI = window.NeprasUI;
  const mode = await UI.dialog.open({
    kind: "question", title: title || "أيام الغياب", note,
    message: (message ? message + "\n\n" : "") + "كيف تريد تحديد أيام الغياب؟",
    primary: { label: "أيام ثابتة للجميع", value: "fixed" },
    extra: [{ label: "مدى عشوائي لكل طالب", value: "range" }],
    secondary: { label: "إلغاء", value: null }
  });
  if (!mode) return null;
  const raw = await UI.dialog.open({
    kind: "question", title: title || "أيام الغياب", note,
    message: mode === "fixed"
      ? "أدخل عدد أيام الغياب للجميع (من 0 إلى " + NEPRAS_ATTENDANCE_MAX_DAYS + "):"
      : "أدخل المدى بصيغة «من-إلى» مثل 0-3.\nسيحصل كل طالب على عدد عشوائي من الأيام بين الحدّين.",
    input: { value: mode === "fixed" ? "" : "0-3", validate: (v) => neprasAttendanceParseSpec(mode, v).error || "" },
    primary: { label: okText || "بدء التنفيذ" },
    secondary: { label: "إلغاء", value: null }
  });
  if (raw === null || raw === undefined) return null;
  return neprasAttendanceParseSpec(mode, raw).spec || null;
}

function setAllDays(val) {
  const inputs = document.querySelectorAll("table tbody input[type='number'], table tbody input[type='text']");
  if (inputs.length === 0) return 0;
  const spec = val && typeof val === "object" ? neprasAttendanceNormalizeSpec(val) : null;
  let count = 0, sum = 0, min = Infinity, max = -Infinity;
  inputs.forEach(input => {
    const d = spec ? neprasAttendanceDaysFor(spec) : val;
    input.value = d;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    count++;
    if (spec) { sum += d; if (d < min) min = d; if (d > max) max = d; }
  });
  window.__neprasLastFill = spec ? { count, spec, min, max, avg: Math.round((sum / count) * 10) / 10 } : { count };
  return count;
}

async function promptAndSetDays(specArg) {
  const spec = specArg || await neprasAttendanceAskSpec({ title: "تعبئة أيام الغياب", message: "ستُعبّأ أيام الغياب لكل طلاب الجدول المعروض الآن.", okText: "تطبيق" });
  if (!spec) return;
  const count = setAllDays(spec);
  if (count > 0) {
    const f = window.__neprasLastFill || {};
    const extra = spec.mode === "range" ? "\nأقل قيمة: " + f.min + " — أكبر قيمة: " + f.max + " — المتوسط: " + f.avg : "";
    await window.neprasDialog.success("تم تعبئة (" + neprasAttendanceDescribeSpec(spec) + ") لعدد " + count + " طالب." + extra, { title: "تمت التعبئة" });
  } else {
    await window.neprasDialog.warning("لا يوجد جدول طلاب معروض. اختر الأسبوع والصف والفصل ثم اضغط عرض الطلاب.", { title: "لا توجد بيانات" });
  }
}

// ==========================================
// 5. تحميل شيت الغياب كملف Excel XLSX حقيقي ومنسق
//    + متوافق مباشرة مع زر «رفع شيت الغياب الذكي»
// ==========================================

function neprasAttendanceSafeFileName(value) {
  return String(value || "المدرسة")
    .trim()
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ") || "المدرسة";
}

// ZIP/XLSX writing (zip container, XML escaping, column letters, text/number cells, package assembly with docProps)
// lives in modules/xlsx_writer.js, shared with content.js and modules/export.js. This builder keeps only its own look
// (styles and sheet layout) and data. Phase 2 follow-up: control characters are stripped like in the staff/student
// files and ZIP entries carry the UTF-8 flag (see xlsx_writer.js).
function neprasAttendanceBuildStyledXlsx(studentRows, schoolName) {
  const headers = ["كود التلميذ", "اسم التلميذ", "الصف", "الفصل", "أيام الغياب"];
  let sheetRows = `<row r="1" ht="32" customHeight="1">${neprasXlsxTextCell("A1", neprasXlsxBrandName(), 5)}</row>`;
  sheetRows += `<row r="2" ht="30" customHeight="1">${neprasXlsxTextCell("A2", `شيت الغياب — ${schoolName}`, 1)}</row>`;
  sheetRows += `<row r="3" ht="28" customHeight="1">`;
  headers.forEach((h, i) => {
    sheetRows += neprasXlsxTextCell(`${neprasZipColumnName(i)}3`, h, 1);
  });
  sheetRows += `</row>`;

  studentRows.forEach((row, idx) => {
    const r = idx + 4;
    sheetRows += `<row r="${r}" ht="24" customHeight="1">`;
    sheetRows += neprasXlsxTextCell(`A${r}`, row[0], 2); // كود كنص حتى لا يختصره Excel
    sheetRows += neprasXlsxTextCell(`B${r}`, row[1], 3);
    sheetRows += neprasXlsxTextCell(`C${r}`, row[2], 2);
    sheetRows += neprasXlsxTextCell(`D${r}`, row[3], 2);
    sheetRows += neprasXlsxNumberCell(`E${r}`, row[4], 4);
    sheetRows += `</row>`;
  });

  const lastRow = Math.max(3, studentRows.length + 3);

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="4">
    <font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="14"/><color rgb="FFFFFFFF"/><name val="Tahoma"/><family val="2"/></font>
    <font><b/><sz val="12"/><color rgb="FF1F1F1F"/><name val="Tahoma"/><family val="2"/></font>
    <font><b/><sz val="18"/><color rgb="FF00843D"/><name val="Tahoma"/><family val="2"/></font>
  </fonts>
  <fills count="4">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1F4E78"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFF2CC"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFD9E2F3"/></left>
      <right style="thin"><color rgb="FFD9E2F3"/></right>
      <top style="thin"><color rgb="FFD9E2F3"/></top>
      <bottom style="thin"><color rgb="FFD9E2F3"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="6">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" readingOrder="2"/></xf>
    <xf numFmtId="49" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1" applyNumberFormat="1"><alignment horizontal="center" vertical="center" readingOrder="2"/></xf>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center" readingOrder="2" wrapText="0" shrinkToFit="1"/></xf>
    <xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" readingOrder="2"/></xf>
    <xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center" readingOrder="2"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
  <dxfs count="0"/>
  <tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>
</styleSheet>`;

  const worksheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetPr><outlinePr summaryBelow="1" summaryRight="1"/></sheetPr>
  <dimension ref="A1:E${lastRow}"/>
  <sheetViews>
    <sheetView rightToLeft="1" tabSelected="1" workbookViewId="0">
      <pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/>
      <selection pane="bottomLeft" activeCell="E4" sqref="E4"/>
    </sheetView>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="24"/>
  <cols>
    <col min="1" max="1" width="20" customWidth="1" bestFit="1"/>
    <col min="2" max="2" width="50" customWidth="1" bestFit="1"/>
    <col min="3" max="3" width="24" customWidth="1" bestFit="1"/>
    <col min="4" max="4" width="18" customWidth="1" bestFit="1"/>
    <col min="5" max="5" width="16" customWidth="1" bestFit="1"/>
  </cols>
  <sheetData>${sheetRows}</sheetData>
  <autoFilter ref="A3:E${lastRow}"/><mergeCells count="2"><mergeCell ref="A1:E1"/><mergeCell ref="A2:E2"/></mergeCells>
  <pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>
</worksheet>`;

  return neprasXlsxBuildPackage({
    sheets: [{ name: "شيت الغياب", xml: worksheetXml }],
    stylesXml,
    docProps: { title: `شيت غياب ${schoolName}` }
  });
}


function neprasAttendanceIsHomeRow(row) {
  const value =
    String(
      row?.["نوعية التعليم"] ||
      ""
    )
      .replace(/[أإآ]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/ة/g, "ه")
      .trim();

  return (
    value.includes("منازل") ||
    value.includes("منزل")
  );
}

function neprasAttendanceValidClass(value) {
  const text =
    String(value || "")
      .trim();

  if (!text) {
    return "";
  }

  const normalized =
    NeprasEgypt.toLatinDigits(
      text
    )
      .trim()
      .replace(/\s+/g, " ");

  if (
    normalized === "0" ||
    normalized === "-1" ||
    normalized === "-" ||
    normalized.includes("اختر") ||
    normalized.includes("بدون فصل")
  ) {
    return "";
  }

  return text;
}

function neprasAttendanceRowsSame(
  a,
  b
) {
  if (
    !Array.isArray(a) ||
    !Array.isArray(b) ||
    a.length !== b.length
  ) {
    return false;
  }

  const keys = rows =>
    rows
      .map(
        row =>
          String(
            row?.["كود التلميذ"] ||
            ""
          ).trim()
      )
      .filter(Boolean)
      .sort();

  const x = keys(a);
  const y = keys(b);

  return (
    x.length === y.length &&
    x.every(
      (value, index) =>
        value === y[index]
    )
  );
}

async function neprasAttendanceFastGradeRows(
  gradeOption
) {
  if (
    typeof window.neprasApiTryRowsForGrade !==
    "function"
  ) {
    return {
      ok: false,
      reason:
        "FAST_API_NOT_AVAILABLE",
      rows: []
    };
  }

  const gradeName =
    String(
      gradeOption?.text ||
      ""
    ).trim();

  const explicitCode =
    /^\d+$/.test(
      String(
        gradeOption?.value ||
        ""
      ).trim()
    )
      ? String(
          gradeOption.value
        ).trim()
      : "";

  let last = null;

  for (
    let attempt = 1;
    attempt <= 3;
    attempt++
  ) {
    if (attempt > 1) {
      await new Promise(
        resolve =>
          setTimeout(
            resolve,
            500 * attempt
          )
      );
    }

    const result =
      await window.neprasApiTryRowsForGrade(
        gradeName,
        explicitCode
      );

    last = result;

    if (!result?.ok) {
      continue;
    }

    const rows =
      Array.isArray(result.rows)
        ? result.rows
        : [];

    // لو رجع عدد صغير جدًا، نؤكده بطلب ثانٍ
    // حتى لا نبني شيت مدرسة من Response جزئي.
    if (
      rows.length > 0 &&
      rows.length <= 3
    ) {
      await new Promise(
        resolve =>
          setTimeout(
            resolve,
            450
          )
      );

      const confirm =
        await window.neprasApiTryRowsForGrade(
          gradeName,
          explicitCode
        );

      if (
        confirm?.ok &&
        neprasAttendanceRowsSame(
          rows,
          confirm.rows
        )
      ) {
        return result;
      }

      last =
        confirm || result;

      continue;
    }

    return result;
  }

  return (
    last || {
      ok: false,
      rows: [],
      reason:
        "ATTENDANCE_FAST_GRADE_FAILED"
    }
  );
}

async function neprasAttendanceCollectSchoolViaApi(
  gradeOptions
) {
  const allSchoolStudents = [];
  const seen = new Set();

  for (
    let index = 0;
    index < gradeOptions.length;
    index++
  ) {
    const gOpt =
      gradeOptions[index];

    if (
      typeof showFloatingStatus ===
      "function"
    ) {
      showFloatingStatus(
        `⚡ تجهيز شيت الغياب سريعًا: ${gOpt.text} (${index + 1}/${gradeOptions.length})...`
      );
    }

    const result =
      await neprasAttendanceFastGradeRows(
        gOpt
      );

    if (!result?.ok) {
      return {
        ok: false,
        reason:
          result?.reason ||
          "ATTENDANCE_FAST_API_FAILED",
        rows: []
      };
    }

    for (
      const row
      of result.rows || []
    ) {
      const code =
        String(
          row?.["كود التلميذ"] ||
          ""
        )
          .replace(/\t/g, "")
          .trim();

      const name =
        String(
          row?.["اسم التلميذ"] ||
          ""
        )
          .replace(/[;\r\n]+/g, " ")
          .replace(/"/g, "")
          .trim();

      const gradeText =
        String(
          row?.["الصف"] ||
          gOpt.text ||
          ""
        ).trim();

      const classText =
        neprasAttendanceValidClass(
          row?.["الفصل"]
        );

      // نفس منطق صفحة الغياب:
      // المنازل/بدون فصل لا يدخلون شيت الفصول الأسبوعي.
      if (
        !code ||
        !classText ||
        neprasAttendanceIsHomeRow(row)
      ) {
        continue;
      }

      const uniqueKey =
        `${code}||${gradeText}||${classText}`;

      if (seen.has(uniqueKey)) {
        continue;
      }

      seen.add(uniqueKey);

      allSchoolStudents.push([
        code,
        name,
        gradeText,
        classText,
        0
      ]);
    }

    // مهلة خفيفة لحماية API الوزارة بدون إبطاء ملحوظ.
    if (
      index <
      gradeOptions.length - 1
    ) {
      await new Promise(
        resolve =>
          setTimeout(
            resolve,
            350
          )
      );
    }
  }

  return {
    ok:
      allSchoolStudents.length > 0,
    rows:
      allSchoolStudents,
    reason:
      allSchoolStudents.length
        ? ""
        : "NO_ATTENDANCE_STUDENTS"
  };
}

async function neprasAttendanceExportTemplateRows(
  allSchoolStudents
) {
  if (
    !Array.isArray(
      allSchoolStudents
    ) ||
    allSchoolStudents.length === 0
  ) {
    throw new Error(
      "NO_ATTENDANCE_STUDENTS"
    );
  }

  const schoolName =
    neprasAttendanceSafeFileName(
      getSchoolNameFromPage()
    );

  const xlsxBytes =
    neprasAttendanceBuildStyledXlsx(
      allSchoolStudents,
      schoolName
    );

  const fileName =
    `شيت_غياب_${schoolName}.xlsx`;

  const blob =
    new Blob(
      [xlsxBytes],
      {
        type:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      }
    );

  let finalFileName = fileName;
  if (window.neprasDialog?.triggerDownload) {
    const result = await window.neprasDialog.triggerDownload(blob, fileName, {
      title: "تم إنشاء شيت الغياب بنجاح",
      message: `تم حفظ ملف Excel بنجاح.`,
      folder: "شيت الغياب"
    });
    finalFileName = result.finalFileName;
  } else {
    // احتياط لو دالة التنزيل الموحّدة غير متاحة لأي سبب.
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 15000);
  }

  return {
    fileName: finalFileName,
    count:
      allSchoolStudents.length
  };
}

async function neprasAttendanceDownloadTemplateLegacy(
  weekOptions,
  gradeOptions
) {
  const weekSelect =
    getWeekSelect();

  if (
    weekSelect &&
    weekOptions?.[0]
  ) {
    triggerSelectChange(
      weekSelect,
      weekOptions[0].value
    );

    await new Promise(
      resolve =>
        setTimeout(
          resolve,
          1200
        )
    );
  }

  const allSchoolStudents = [];
  const seen = new Set();

  for (
    const gOpt
    of gradeOptions
  ) {
    triggerSelectChange(
      getGradeSelect(),
      gOpt.value
    );

    await new Promise(
      resolve =>
        setTimeout(
          resolve,
          1200
        )
    );

    const classSelect =
      getClassSelect();

    if (!classSelect) {
      continue;
    }

    const classOptions =
      Array.from(
        classSelect.options || []
      ).filter(
        opt =>
          opt.value &&
          opt.value !== "0" &&
          !opt.text.includes(
            "اختر"
          )
      );

    for (
      const cOpt
      of classOptions
    ) {
      triggerSelectChange(
        classSelect,
        cOpt.value
      );

      await new Promise(
        resolve =>
          setTimeout(
            resolve,
            1000
          )
      );

      const showBtn =
        getShowStudentsButton();

      if (showBtn) {
        clickButtonSafely(
          showBtn
        );

        await new Promise(
          resolve =>
            setTimeout(
              resolve,
              1500
            )
        );
      }

      const rows =
        document.querySelectorAll(
          "table tbody tr"
        );

      rows.forEach(tr => {
        const tds =
          tr.querySelectorAll("td");

        if (tds.length < 2) {
          return;
        }

        let code = "";
        let name = "";

        tds.forEach(
          (td, idx) => {
            const text =
              (
                td.innerText ||
                td.textContent ||
                ""
              ).trim();

            if (
              idx === 1 ||
              (
                text.length >= 4 &&
                !isNaN(text)
              )
            ) {
              code = text;
            }

            if (
              idx === 2 ||
              (
                isNaN(text) &&
                text.length > 3
              )
            ) {
              name = text;
            }
          }
        );

        if (!code && tds[0]) {
          code =
            (
              tds[0].innerText ||
              ""
            ).trim();
        }

        if (!name && tds[1]) {
          name =
            (
              tds[1].innerText ||
              ""
            ).trim();
        }

        code =
          String(code || "")
            .replace(/\t/g, "")
            .trim();

        name =
          String(name || "")
            .replace(
              /[;\r\n]+/g,
              " "
            )
            .replace(/"/g, "")
            .trim();

        if (
          code &&
          code.length >= 3
        ) {
          const gradeText =
            (
              gOpt.text ||
              ""
            ).trim();

          const classText =
            (
              cOpt.text ||
              ""
            ).trim();

          const uniqueKey =
            `${code}||${gradeText}||${classText}`;

          let daysVal = 0;
          const daysInput = tr.querySelector("input[type='number'], input.form-control");
          if (daysInput && daysInput.value !== "") {
            daysVal = parseInt(daysInput.value, 10) || 0;
          } else if (tds[3]) {
            daysVal = parseInt((tds[3].innerText || '').replace(/\D/g, ''), 10) || 0;
          }

          if (
            !seen.has(
              uniqueKey
            )
          ) {
            seen.add(
              uniqueKey
            );

            allSchoolStudents.push([
              code,
              name,
              gradeText,
              classText,
              daysVal
            ]);
          }
        }
      });
    }
  }

  return allSchoolStudents;
}

async function downloadSchoolAttendanceTemplate() {
  const weekSelect =
    getWeekSelect();

  if (!weekSelect) {
    return window.neprasDialog.error("لم يتم العثور على قائمة الأسابيع بالصفحة!", { title: "قائمة الأسابيع غير متاحة" });
  }

  const weekOptions =
    Array.from(
      weekSelect.options || []
    ).filter(
      opt =>
        opt.value &&
        opt.value !== "0" &&
        !opt.text.includes(
          "اختر"
        )
    );

  if (!weekOptions.length) {
    return window.neprasDialog.warning("لا توجد أسابيع مجهزة في القائمة!", { title: "لا توجد أسابيع" });
  }

  const gradeSelect =
    getGradeSelect();

  if (!gradeSelect) {
    return window.neprasDialog.error("لم يتم العثور على قائمة الصفوف بالصفحة!", { title: "قائمة الصفوف غير متاحة" });
  }

  const gradeOptions =
    Array.from(
      gradeSelect.options || []
    ).filter(
      opt =>
        opt.value &&
        opt.value !== "0" &&
        !opt.text.includes(
          "اختر"
        )
    );

  if (!gradeOptions.length) {
    return window.neprasDialog.warning("لا توجد صفوف مجهزة بالصفحة!", { title: "لا توجد صفوف" });
  }

  try {
    // ======================================================
    // v1.0 FAST PATH
    // طلب API واحد لكل صف بدل التنقل صف -> فصل -> جدول.
    // ======================================================
    const fast =
      await neprasAttendanceCollectSchoolViaApi(
        gradeOptions
      );

    let rows = [];
    let mode = "API";

    if (
      fast?.ok &&
      Array.isArray(fast.rows) &&
      fast.rows.length
    ) {
      rows = fast.rows;
    } else {
      // لا نخلط بيانات API ناقصة مع DOM.
      // لو فشل أي صف نعيد السحب القديم كاملًا كشبكة أمان.
      mode = "LEGACY";

      console.warn(
        "Nepras Attendance Fast API fallback:",
        fast?.reason || ""
      );

      await neprasAttendanceAlert(
        "تعذر المحرك السريع مؤقتًا، وسيستخدم نبراس المسار التقليدي الآمن لهذه المرة فقط.",
        {
          type: "warning",
          title: "تحويل مؤقت للمسار التقليدي",
          okText: "متابعة"
        }
      );

      rows =
        await neprasAttendanceDownloadTemplateLegacy(
          weekOptions,
          gradeOptions
        );
    }

    if (!rows.length) {
      return window.neprasDialog.error("لم يتم العثور على أي بيانات طلابية لتصديرها.", { title: "لا توجد بيانات" });
    }

    const exported =
      await neprasAttendanceExportTemplateRows(
        rows
      );

    if (
      typeof showFloatingStatus ===
      "function"
    ) {
      showFloatingStatus(
        `✅ تم تجهيز شيت الغياب بنجاح — ${exported.count} طالب`,
        true
      );
    }

    neprasAttendanceHideFloatingStatus(0);

    await neprasAttendanceAlert("", {
      type: "success",
      title: "تم إنشاء شيت الغياب بنجاح",
      subtitle: "تم تجهيز الملف بصيغة Excel حقيقية ومنسقة وجاهزة للتعديل.",
      html:
        `عدد الطلاب: <b>${exported.count}</b><br>` +
        `طريقة التجهيز: <b>${mode === "API" ? "السريع" : "التقليدي"}</b><br>` +
        `الملف: <b>${neprasAttendanceEscapeHtml(exported.fileName)}</b><br><br>` +
        `✏️ عدّل عمود «أيام الغياب» فقط ثم استخدم زر «رفع شيت الغياب الذكي».`,
      note: "إذا ظهر ملف Excel عندك فهذه هي النتيجة الصحيحة ولا تحتاج للضغط مرة أخرى.",
      okText: "تم"
    });
  } catch (err) {
    console.error(
      "Attendance XLSX Export Error:",
      err
    );

    await neprasAttendanceAlert(`❌ حدث خطأ أثناء إنشاء ملف Excel.
${err?.message || ""}`, {
      type: "error",
      title: "فشل إنشاء شيت الغياب"
    });
  }
}

// ==========================================
// 6. رفع ومعالجة شيت الغياب
//    يدعم XLSX / XLS / CSV / TXT
// ==========================================
function neprasAttendanceNormalizeHeader(value) {
  return String(value || "")
    .trim()
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

// يقرأ صفوف شيت الغياب ويعيد { map, rejected, conflicts, blankDays, duplicateCount, headerFallback }.
//  map: كود ← عدد الأيام (نص) للصفوف الصحيحة فقط: عدد صحيح من 0 إلى NEPRAS_ATTENDANCE_MAX_DAYS (كما في الإدخال اليدوي).
//  rejected: [{ code, raw, reason }] قيم مرفوضة (نص، كسر، سالب، أكبر من الحد) — لا تُكتب ولا تُقصّ بصمت.
//  conflicts: [{ code, values }] كود مكرر بقيمتين مختلفتين: لا يُكتب (لا نخمّن أيهما الصحيحة).
//  blankDays: صفوف فيها كود وخانة الأيام فارغة (تُتخطّى كما كانت؛ كثيرون يتركونها فارغة لمن لم يغب).
//  headerFallback: true إن لم تُوجد عناوين الأعمدة فاعتُبر أول عمود كودًا وآخر عمود أيامًا (القالب القديم).
function neprasAttendanceParseAbsenceRows(rows) {
  const out = { map: {}, rejected: [], conflicts: [], blankDays: 0, duplicateCount: 0, headerFallback: false };
  if (!Array.isArray(rows) || rows.length === 0) return out;

  let headerRowIndex = -1;
  let codeCol = -1;
  let daysCol = -1;

  const codeAliases = ["كود التلميذ", "كود الطالب", "كود", "student code", "studentcode", "code"]
    .map(neprasAttendanceNormalizeHeader);
  const daysAliases = ["ايام الغياب", "أيام الغياب", "عدد ايام الغياب", "عدد أيام الغياب", "الغياب", "absence days", "days"]
    .map(neprasAttendanceNormalizeHeader);

  const maxHeaderScan = Math.min(rows.length, 10);
  for (let r = 0; r < maxHeaderScan; r++) {
    const row = Array.isArray(rows[r]) ? rows[r] : [];
    const normalized = row.map(neprasAttendanceNormalizeHeader);
    const cIdx = normalized.findIndex(v => codeAliases.includes(v) || v.includes("كود التلميذ") || v.includes("كود الطالب"));
    const dIdx = normalized.findIndex(v => daysAliases.includes(v) || (v.includes("غياب") && v.includes("يوم")));
    if (cIdx >= 0 && dIdx >= 0) {
      headerRowIndex = r;
      codeCol = cIdx;
      daysCol = dIdx;
      break;
    }
  }

  // توافق احتياطي مع القالب القديم: الكود أول عمود وأيام الغياب آخر عمود (يُنبَّه المستخدم قبل المتابعة).
  if (headerRowIndex < 0) {
    headerRowIndex = 0;
    codeCol = 0;
    daysCol = Math.max(0, (Array.isArray(rows[0]) ? rows[0].length : 5) - 1);
    out.headerFallback = true;
  }

  const seen = new Map();      // code → days (أول قيمة صحيحة)
  const conflicted = new Map(); // code → Set(values)
  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = Array.isArray(rows[r]) ? rows[r] : [];
    if (!row.length) continue;

    const code = NeprasEgypt.toLatinDigits(row[codeCol])
      .trim()
      .replace(/^'/, "")
      .replace(/\t/g, "")
      .replace(/\.0+$/, "");
    if (!code) continue;

    const raw = NeprasEgypt.toLatinDigits(row[daysCol]).trim().replace(/,/g, ".");
    if (!raw) { out.blankDays += 1; continue; }

    const n = Number(raw);
    let reason = "";
    if (!Number.isFinite(n)) reason = "ليست رقمًا";
    else if (n < 0) reason = "سالبة";
    else if (!Number.isInteger(n)) reason = "ليست عددًا صحيحًا";
    else if (n > NEPRAS_ATTENDANCE_MAX_DAYS) reason = "أكبر من " + NEPRAS_ATTENDANCE_MAX_DAYS;
    if (reason) { out.rejected.push({ code, raw, reason }); continue; }

    const days = String(n);
    if (conflicted.has(code)) { conflicted.get(code).add(days); continue; }
    if (seen.has(code)) {
      if (seen.get(code) === days) { out.duplicateCount += 1; continue; }
      conflicted.set(code, new Set([seen.get(code), days]));
      seen.delete(code);
      continue;
    }
    seen.set(code, days);
  }

  for (const [code, days] of seen) out.map[code] = days;
  for (const [code, values] of conflicted) out.conflicts.push({ code, values: Array.from(values) });
  return out;
}

// نص تنبيه المستخدم قبل الكتابة (فارغ إن لم يكن هناك ما يُنبَّه إليه).
function neprasAttendanceDescribeAbsenceIssues(parsed) {
  const lines = [];
  const codes = (list, pick) => list.slice(0, 5).map(pick).join("، ") + (list.length > 5 ? "…" : "");
  if (parsed.headerFallback) {
    lines.push("لم أجد عنواني «كود التلميذ» و«أيام الغياب»؛ سأعتبر أول عمود هو الكود وآخر عمود هو أيام الغياب.");
  }
  if (parsed.rejected.length) {
    lines.push(`${parsed.rejected.length} صفًّا بقيمة غياب غير صحيحة لن تُكتب (المسموح: عدد صحيح من 0 إلى ${NEPRAS_ATTENDANCE_MAX_DAYS}): ` +
      codes(parsed.rejected, (x) => `${x.code} (${x.raw}: ${x.reason})`));
  }
  if (parsed.conflicts.length) {
    lines.push(`${parsed.conflicts.length} كودًا مكررًا بقيمتين مختلفتين لن يُكتب: ` + codes(parsed.conflicts, (x) => `${x.code} (${x.values.join(" و")})`));
  }
  return lines.join("\n");
}

function neprasAttendanceParseDelimitedText(text) {
  const cleanText = String(text || "").replace(/^\uFEFF/, "");
  const rawLines = cleanText.split(/\r?\n/).filter(line => line.trim());
  if (!rawLines.length) return [];

  const first = rawLines[0];
  const delimiter = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ";" : ",";

  function parseLine(line) {
    const result = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === delimiter && !inQuotes) {
        result.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
    result.push(current);
    return result;
  }

  return rawLines.map(parseLine);
}

async function neprasAttendanceReadUploadFile(file) {
  const lowerName = String(file.name || "").toLowerCase();
  const isExcel = lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls");

  if (isExcel) {
    let XLSX;
    try {
      XLSX = await neprasEnsureLib("xlsx");
    } catch (_) {
      throw new Error("تعذر تحميل مكتبة Excel داخل الصفحة.");
    }

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array", raw: false, cellDates: false });
    const firstSheetName = workbook.SheetNames && workbook.SheetNames[0];
    if (!firstSheetName) throw new Error("ملف Excel لا يحتوي على ورقة عمل.");

    const ws = workbook.Sheets[firstSheetName];
    return XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: "",
      raw: false,
      blankrows: false
    });
  }

  const text = await file.text();
  return neprasAttendanceParseDelimitedText(text);
}


const NEPRAS_ATTENDANCE_SAVE_CHUNK_SIZE = 20;

function neprasAttendanceNumber(value) {
  const n =
    Number(
      String(value ?? "")
        .replace(",", ".")
        .trim()
    );

  return Number.isFinite(n)
    ? n
    : 0;
}

async function neprasAttendanceCollectStudentDirectory(
  gradeOptions
) {
  const byCode = new Map();

  for (
    let i = 0;
    i < gradeOptions.length;
    i++
  ) {
    neprasAttendanceThrowIfStopped();

    const grade =
      gradeOptions[i];

    if (
      typeof showFloatingStatus ===
      "function"
    ) {
      showFloatingStatus(
        `⚡ تجهيز بيانات الطلاب للحفظ السريع: ${grade.text} (${i + 1}/${gradeOptions.length})...`
      );
    }

    const result =
      await neprasAttendanceFastGradeRows(
        grade
      );

    neprasAttendanceThrowIfStopped();

    if (!result?.ok) {
      throw new Error(
        `تعذر تنزيل بيانات ${grade.text}: ${
          result?.reason ||
          "FAST_API_FAILED"
        }`
      );
    }

    for (const row of result.rows || []) {
      const code =
        String(
          row?.["كود التلميذ"] ||
          ""
        )
          .replace(/\t/g, "")
          .trim();

      if (!code) continue;

      byCode.set(
        code,
        {
          code,
          nationalId:
            String(
              row?.["الرقم القومي"] ||
              ""
            )
              .replace(/\D/g, "")
              .trim(),
          name:
            String(
              row?.["اسم التلميذ"] ||
              ""
            ).trim(),
          grade:
            String(
              row?.["الصف"] ||
              grade.text ||
              ""
            ).trim(),
          classRoom:
            String(
              row?.["الفصل"] ||
              ""
            ).trim()
        }
      );
    }

    if (
      i <
      gradeOptions.length - 1
    ) {
      await new Promise(
        resolve =>
          setTimeout(
            resolve,
            300
          )
      );
    }
  }

  return byCode;
}

function neprasAttendanceBuildSavePayload(
  studentsAbsenceMap,
  studentDirectory,
  weekId
) {
  const payload = [];
  const missingCodes = [];
  const invalidNationalIds = [];

  for (
    const [codeRaw, daysRaw]
    of Object.entries(
      studentsAbsenceMap || {}
    )
  ) {
    const code =
      String(codeRaw || "")
        .replace(/\t/g, "")
        .trim();

    if (!code) continue;

    const student =
      studentDirectory.get(code);

    if (!student) {
      missingCodes.push(code);
      continue;
    }

    const nationalId =
      String(
        student.nationalId || ""
      )
        .replace(/\D/g, "")
        .trim();

    if (!nationalId) {
      invalidNationalIds.push(code);
      continue;
    }

    const days =
      Math.max(
        0,
        Math.min(
          7,
          Math.trunc(
            neprasAttendanceNumber(
              daysRaw
            )
          )
        )
      );

    payload.push({
      student_Code:
        Number(code),
      nationaL_ID:
        Number(nationalId),
      studentName:
        student.name,
      abscenceCount:
        days,
      abscenceCoronaCount:
        0,
      iSTDAMN:
        false,
      isChecked:
        true,
      isCorona:
        false,
      isMissingData:
        false,
      weekId:
        Number(weekId)
    });
  }

  return {
    payload,
    missingCodes,
    invalidNationalIds
  };
}

async function neprasAttendanceSaveChunkWithRetry(
  chunk,
  maxAttempts = 3
) {
  let lastError = null;

  for (
    let attempt = 1;
    attempt <= maxAttempts;
    attempt++
  ) {
    neprasAttendanceThrowIfStopped();

    try {
      if (
        typeof window.neprasApiSaveStudentAbsence !==
        "function"
      ) {
        throw new Error(
          "ATTENDANCE_SAVE_API_NOT_AVAILABLE"
        );
      }

      await window.neprasApiSaveStudentAbsence(
        chunk
      );

      neprasAttendanceThrowIfStopped();
      return true;
    } catch (error) {
      if (neprasAttendanceIsStopped() || error?.code === "USER_STOPPED" || String(error?.message || "").includes("USER_STOPPED")) {
        neprasAttendanceRequestStop("attendance_fast_stopped");
        throw error;
      }

      lastError = error;

      const msg =
        String(
          error?.message ||
          error ||
          ""
        );

      if (
        (
          /(?<!\d)(?:401|403)(?!\d)/.test(msg) ||
          msg.includes("AUTH_HEADERS")
        ) &&
        typeof window.neprasApiAutoPrimeSession ===
          "function"
      ) {
        try {
          await window.neprasApiAutoPrimeSession(
            ""
          );
        } catch (primeError) {
          console.warn("[نبراس] تعذّر تجديد جلسة API قبل إعادة محاولة حفظ الغياب:", primeError?.message || primeError);
        }
      }

      if (
        attempt <
        maxAttempts
      ) {
        await new Promise(
          resolve =>
            setTimeout(
              resolve,
              700 * attempt
            )
        );
      }
    }
  }

  throw lastError ||
    new Error(
      "ATTENDANCE_SAVE_RETRY_FAILED"
    );
}

async function neprasAttendanceSaveWeekFast(
  studentsAbsenceMap,
  studentDirectory,
  week,
  resume = {}
) {
  const weekId =
    Number(
      String(
        week?.val || ""
      ).trim()
    );

  if (!Number.isFinite(weekId)) {
    throw new Error(
      `WEEK_ID_INVALID:${week?.text || ""}`
    );
  }

  const built =
    neprasAttendanceBuildSavePayload(
      studentsAbsenceMap,
      studentDirectory,
      weekId
    );

  if (!built.payload.length) {
    throw new Error(
      "ATTENDANCE_NO_MATCHING_STUDENTS"
    );
  }

  const chunks = [];

  for (
    let i = 0;
    i < built.payload.length;
    i += NEPRAS_ATTENDANCE_SAVE_CHUNK_SIZE
  ) {
    chunks.push(
      built.payload.slice(
        i,
        i + NEPRAS_ATTENDANCE_SAVE_CHUNK_SIZE
      )
    );
  }

  // v1.2.24: الاستئناف — نبدأ من أول دفعة لم تُحفظ. ولا نثق بنقطة الحفظ إلا لو
  // تطابق عدد الدفعات وإجمالي الطلاب (وإلا تغيّر دليل الطلاب فنعيد الأسبوع كاملًا).
  // إعادة إرسال دفعة سبق حفظها آمنة: هي نفس آلية إعادة المحاولة الحالية (تعيين قيمة، لا إضافة).
  let startAt = Math.max(0, Math.trunc(Number(resume?.startChunk) || 0));
  const countMismatch =
    resume?.expectedChunkCount != null &&
    Number(resume.expectedChunkCount) !== chunks.length;
  const totalMismatch =
    resume?.expectedTotal != null &&
    Number(resume.expectedTotal) !== built.payload.length;
  const resumeMismatch = startAt > 0 && (countMismatch || totalMismatch);
  if (resumeMismatch || startAt > chunks.length) startAt = 0;

  let saved = 0;
  for (let k = 0; k < startAt; k++) saved += chunks[k].length;

  for (
    let i = startAt;
    i < chunks.length;
    i++
  ) {
    neprasAttendanceThrowIfStopped();

    showStatusBanner(
      `⚡ تسجيل الغياب — ${week.text} — تم ${saved}/${built.payload.length}`
    );

    await neprasAttendanceSaveChunkWithRetry(
      chunks[i],
      3
    );

    neprasAttendanceThrowIfStopped();

    saved +=
      chunks[i].length;

    if (typeof resume?.onChunkSaved === "function") {
      try {
        await resume.onChunkSaved({
          chunkIndex: i,
          chunkCount: chunks.length,
          saved,
          total: built.payload.length
        });
      } catch (_) { /* فشل حفظ نقطة التقدم لا يجب أن يوقف الحفظ الفعلي */ }
    }

    await new Promise(
      resolve =>
        setTimeout(
          resolve,
          350
        )
    );
  }

  return {
    saved,
    total:
      built.payload.length,
    chunkCount:
      chunks.length,
    resumedFromChunk:
      startAt,
    resumeMismatch,
    missingCodes:
      built.missingCodes,
    invalidNationalIds:
      built.invalidNationalIds
  };
}

async function neprasAttendanceAskUploadGradeScope(gradeOptions) {
  const options = Array.isArray(gradeOptions) ? gradeOptions : [];
  if (!options.length) return null;

  const choices = [
    "0- كل الصفوف",
    ...options.map((g, index) => `${index + 1}- ${String(g.text || "").trim()}`)
  ].join("\n");

  const raw = await window.neprasDialog.prompt(
    `اختر الصف الذي سيتم تسجيل الغياب له من الشيت:\n${choices}`,
    "",
    {
      title: "اختيار نطاق الشيت",
      note: "اكتب 0 لكل الصفوف، أو رقم صف واحد فقط.",
      okText: "التالي"
    }
  );

  if (raw === null) return null;

  const value = NeprasEgypt.toLatinDigits(raw).trim();
  if (value === "0") {
    return { all: true, options, label: "كل الصفوف" };
  }

  const index = Number(value) - 1;
  if (!Number.isInteger(index) || index < 0 || index >= options.length) {
    await neprasAttendanceAlert("اختيار الصف غير صحيح.", {
      type: "warning",
      title: "اختيار غير صحيح"
    });
    return null;
  }

  return {
    all: false,
    options: [options[index]],
    label: String(options[index].text || "الصف المختار").trim()
  };
}

async function neprasAttendanceRunFastSmartUpload(
  studentsAbsenceMap,
  targetWeeks,
  gradeOptions,
  options = {}
) {
  if (
    typeof window.neprasApiSaveStudentAbsence !==
    "function"
  ) {
    return {
      ok: false,
      unsupported: true,
      reason:
        "ATTENDANCE_SAVE_API_NOT_AVAILABLE"
    };
  }

  neprasAttendanceThrowIfStopped();

  const directory =
    await neprasAttendanceCollectStudentDirectory(
      gradeOptions
    );

  neprasAttendanceThrowIfStopped();

  if (!directory.size) {
    throw new Error(
      "ATTENDANCE_STUDENT_DIRECTORY_EMPTY"
    );
  }

  // عند اختيار صف واحد من شيت مدرسة كامل، لا نعتبر أكواد بقية الصفوف «مفقودة».
  // نسجل فقط الأكواد التي تنتمي إلى دليل الصف المختار.
  const effectiveAbsenceMap = options?.selectedGradeOnly
    ? Object.fromEntries(
        Object.entries(studentsAbsenceMap || {}).filter(([code]) =>
          directory.has(String(code || "").replace(/\t/g, "").trim())
        )
      )
    : studentsAbsenceMap;

  if (!Object.keys(effectiveAbsenceMap || {}).length) {
    throw new Error("ATTENDANCE_NO_MATCHING_STUDENTS_IN_SELECTED_GRADE");
  }

  const summary = {
    weeks: [],
    totalSaved: 0,
    missingCodes: new Set(),
    invalidNationalIds:
      new Set()
  };

  // ------------------------------------------------------------------
  // v1.2.24: نقطة حفظ للاستئناف. لا نخزّن بيانات طلاب: بصمة المدخلات + عدّادات فقط.
  // ------------------------------------------------------------------
  const CP_NAME = "attendance_fast_upload";
  const CP = window.NeprasCheckpoint || null;
  let cpFingerprint = null;
  let cpState = { weeks: {} };

  if (CP) {
    try {
      cpFingerprint = await CP.fingerprint({
        map: Object.entries(effectiveAbsenceMap || {}).map(([code, days]) => [
          String(code || "").replace(/\t/g, "").trim(),
          Number(days)
        ]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)),
        weeks: targetWeeks.map(w => String(w.val)),
        grades: (gradeOptions || []).map(g => String(g.value)),
        gradeOnly: !!options?.selectedGradeOnly
      });

      const prev = await CP.load(CP_NAME, cpFingerprint);
      const prevWeeks = prev?.weeks || {};
      const doneWeeks = targetWeeks.filter(w => prevWeeks[String(w.val)]?.done).length;
      const partialWeek = targetWeeks.find(w => {
        const st = prevWeeks[String(w.val)];
        return st && !st.done && st.chunksDone > 0;
      });

      if (doneWeeks > 0 || partialWeek) {
        const partialText = partialWeek
          ? ` وجزء من «${partialWeek.text}» (${prevWeeks[String(partialWeek.val)].saved} طالب)`
          : "";
        const resumeIt = await neprasAttendanceConfirm(
          `تم العثور على عملية رفع غياب سابقة لنفس الملف لم تكتمل: اكتمل ${doneWeeks} من ${targetWeeks.length} أسبوع${partialText}.`,
          {
            type: "question",
            title: "استئناف عملية سابقة؟",
            subtitle: "لن يُعاد إرسال ما تم حفظه لدى الوزارة.",
            note: "اختر «بدء من جديد» لإعادة إرسال كل شيء من الأول.",
            okText: "استئناف من حيث توقفت",
            cancelText: "بدء من جديد"
          }
        );
        if (resumeIt) {
          cpState = { weeks: { ...prevWeeks }, resumed: true };
        } else {
          await CP.clear(CP_NAME);
        }
      }
    } catch (cpErr) {
      console.warn("[Attendance] checkpoint init failed (نكمل بدون استئناف):", cpErr?.message || cpErr);
      cpFingerprint = null;
    }
  }

  const cpPersist = async () => {
    if (!CP || !cpFingerprint) return;
    try { await CP.save(CP_NAME, cpFingerprint, cpState); } catch (cpError) { console.warn("[نبراس] تعذّر حفظ نقطة الاستكمال (لن يمكن استئناف العملية إن انقطعت):", cpError?.message || cpError); }
  };

  let anyProgressSaved = Object.values(cpState.weeks).some(w => w && w.chunksDone > 0);

  try {
  for (
    let i = 0;
    i < targetWeeks.length;
    i++
  ) {
    neprasAttendanceThrowIfStopped();

    const week =
      targetWeeks[i];

    const weekKey = String(week.val);
    const prevWeek = cpState.resumed ? cpState.weeks[weekKey] : null;

    const result =
      await neprasAttendanceSaveWeekFast(
        effectiveAbsenceMap,
        directory,
        week,
        {
          startChunk: prevWeek ? (prevWeek.done ? prevWeek.chunkCount : prevWeek.chunksDone) : 0,
          expectedChunkCount: prevWeek ? prevWeek.chunkCount : null,
          expectedTotal: prevWeek ? prevWeek.total : null,
          onChunkSaved: async (p) => {
            cpState.weeks[weekKey] = {
              chunkCount: p.chunkCount,
              total: p.total,
              chunksDone: p.chunkIndex + 1,
              saved: p.saved,
              done: p.chunkIndex + 1 >= p.chunkCount
            };
            anyProgressSaved = true;
            await cpPersist();
          }
        }
      );

    // أسبوع سبق إنجازه كاملًا: لا دفعات جديدة فلا يُستدعى onChunkSaved، فنثبّت حالته هنا.
    if (!cpState.weeks[weekKey]?.done && result.chunkCount === result.resumedFromChunk) {
      cpState.weeks[weekKey] = {
        chunkCount: result.chunkCount, total: result.total,
        chunksDone: result.chunkCount, saved: result.saved, done: true
      };
      await cpPersist();
    }

    summary.weeks.push({
      week:
        week.text,
      saved:
        result.saved
    });

    summary.totalSaved +=
      result.saved;

    result.missingCodes.forEach(
      code =>
        summary.missingCodes.add(code)
    );

    result.invalidNationalIds.forEach(
      code =>
        summary.invalidNationalIds.add(code)
    );
  }
  } catch (runError) {
    // التقدم محفوظ في نقطة الحفظ: نعلّم الخطأ ليعرض المستدعي رسالة «أعد رفع نفس الملف للاستئناف».
    if (anyProgressSaved && runError && typeof runError === "object") {
      try { runError.neprasResumable = true; } catch (_) {}
    }
    throw runError;
  }

  // اكتملت كل الأسابيع: لا حاجة لنقطة الحفظ.
  if (CP) { try { await CP.clear(CP_NAME); } catch (cpError) { console.warn("[نبراس] تعذّر مسح نقطة الاستكمال:", cpError?.message || cpError); } }

  return {
    ok: true,
    summary
  };
}

async function handleExcelSmartUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  await neprasAttendancePrepareCommand(
    "attendance_upload_pre_run"
  );

  try {
    const rows = await neprasAttendanceReadUploadFile(file);
    if (!rows || rows.length <= 1) {
      return window.neprasDialog?.alert("❌ الملف المرفوع فارغ أو غير مطابق للشكل المطلوب.", { type: "warning" });
    }

    const parsedAbsence = neprasAttendanceParseAbsenceRows(rows);
    const studentsAbsenceMap = parsedAbsence.map;
    const totalStudentsInFile = Object.keys(studentsAbsenceMap).length;

    if (totalStudentsInFile === 0) {
      return window.neprasDialog.error(
        "لم يتم العثور على بيانات صحيحة داخل الملف.\nتأكد من وجود عمودي «كود التلميذ» و«أيام الغياب».",
        { title: "ملف غير مطابق" }
      );
    }

    // قيم مرفوضة أو أكواد متعارضة أو عناوين غير موجودة: يرى المستخدم ذلك ويقرر قبل أي كتابة.
    const absenceIssues = neprasAttendanceDescribeAbsenceIssues(parsedAbsence);
    if (absenceIssues) {
      const proceed = await neprasAttendanceConfirm(
        `${absenceIssues}\n\nسيُكتب الغياب لـ ${totalStudentsInFile} طالبًا من الصفوف الصحيحة. هل تتابع؟`,
        { type: "warning", title: "تنبيه على ملف الغياب", okText: "متابعة", cancelText: "إلغاء" }
      );
      if (!proceed) return;
    }

    const weekSelect = getWeekSelect();
    if (!weekSelect) {
      await neprasAttendanceAlert("❌ لم يتم العثور على قائمة الأسابيع بالصفحة!", {
        type: "error",
        title: "قائمة الأسابيع غير متاحة"
      });
      return;
    }

    const weekOptions = getExpandedWeekOptions().map(w => ({
      val: String(w.val),
      text: String(w.text || `الأسبوع ${w.weekNo || ''}`).trim(),
      weekNo: Number(w.weekNo) || Number(w.val) || 0
    }));

    if (weekOptions.length === 0) {
      await neprasAttendanceAlert("❌ لا توجد أسابيع مجهزة في القائمة!", {
        type: "error",
        title: "لا توجد أسابيع متاحة"
      });
      return;
    }

    const targetWeeks = await neprasAttendanceAskSmartUploadWeeks(
      totalStudentsInFile,
      weekOptions
    );

    if (!targetWeeks || !targetWeeks.length) {
      return;
    }

    const gradeSelect = getGradeSelect();
    if (!gradeSelect) return window.neprasDialog?.alert("❌ لم يتم العثور على قائمة الصفوف بالصفحة!", { type: "warning" });

    const gradeOptions = Array.from(gradeSelect.options || []).filter(opt => opt.value && opt.value !== "0" && !opt.text.includes("اختر"));

    const gradeScope = await neprasAttendanceAskUploadGradeScope(gradeOptions);
    if (!gradeScope) return;

    const selectedGradeOptions = gradeScope.options;
    const gradesList = selectedGradeOptions.map(g => ({ val: g.value, text: g.text }));

    // ======================================================
    // v1.0 FAST WRITE
    // Endpoint المؤكد من Network:
    // POST /api/Absence/SaveStudentAbsence
    // Response: true
    // ======================================================
    try {
      const fast =
        await neprasAttendanceRunFastSmartUpload(
          studentsAbsenceMap,
          targetWeeks,
          selectedGradeOptions,
          { selectedGradeOnly: !gradeScope.all }
        );

      if (fast?.ok) {
        removeStatusBanner();

        const missingCount =
          fast.summary.missingCodes.size;

        const invalidNidCount =
          fast.summary.invalidNationalIds.size;

        const weeksText =
          fast.summary.weeks
            .map(
              w =>
                `${w.week}: ${w.saved} طالب`
            )
            .join("\n");

        neprasAttendanceHideFloatingStatus(0);

        await neprasAttendanceAlert("", {
          type: "success",
          title: "تم تسجيل الغياب بنجاح",
          subtitle: "تم التأكد من نجاح حفظ جميع البيانات لدى الوزارة.",
          html:
            `<div style="line-height:2;font-weight:800;">` +
            `🎉 تم تسجيل الغياب من الشيت بنجاح — ${neprasAttendanceEscapeHtml(gradeScope.label)}.<br><br>` +
            `إجمالي عمليات الحفظ المؤكدة: <b>${fast.summary.totalSaved}</b><br><br>` +
            `<div style="background:#f8fbff;border:1px solid #dbe8f5;border-radius:14px;padding:12px 14px;">${neprasAttendanceEscapeHtml(weeksText)}</div><br>` +
            (missingCount ? `⚠️ أكواد لم يتم العثور عليها: <b>${missingCount}</b><br>` : "") +
            (invalidNidCount ? `⚠️ طلاب بدون رقم قومي صالح: <b>${invalidNidCount}</b><br>` : "") +
            `✅ تم التأكد من نجاح حفظ كل مجموعة قبل الانتقال إلى المجموعة التالية.` +
            `</div>`,
          note: "يمكنك الآن مراجعة الصفحة أو الانتقال للأسبوع التالي بأمان.",
          okText: "إغلاق"
        });

        await chrome.runtime.sendMessage({
          action:
            "NEPRAS_CLEANUP_COMMAND_STATE",
          scope: "student",
          reason:
            "attendance_fast_upload_finished"
        }).catch(() => {});

        return;
      }
    } catch (fastError) {
      removeStatusBanner();

      if (neprasAttendanceIsStopped() || fastError?.code === "USER_STOPPED" || String(fastError?.message || "").includes("USER_STOPPED")) {
        neprasAttendanceRequestStop("attendance_fast_user_stop");
        neprasAttendanceHideFloatingStatus(0);
        await neprasAttendanceAlert(
          "تم إيقاف تسجيل الغياب بناءً على طلبك. لن يبدأ المسار التقليدي بعد الإيقاف." +
          (fastError?.neprasResumable ? "\n\nتقدّمك محفوظ: أعد رفع نفس الملف بنفس الإعدادات لاستئناف العملية من حيث توقفت." : ""),
          {
            type: "warning",
            title: "تم إيقاف العملية",
            okText: "حسنًا"
          }
        );
        return;
      }

      console.error(
        "Nepras Fast Attendance Save:",
        fastError
      );

      const rawFastMessage =
        String(
          fastError?.message ||
          fastError ||
          ""
        );

      const readableFastMessage =
        rawFastMessage.includes(
          "ATTENDANCE_PAGE_REQUEST_REJECTED"
        )
          ? "رفض خادم الوزارة طلب الحفظ السريع من الصفحة."
          : rawFastMessage.includes(
              "XHR_NETWORK_ERROR"
            )
            ? "تعذر الاتصال بخدمة الحفظ في موقع الوزارة."
            : rawFastMessage;

      const useLegacy =
        await neprasAttendanceConfirm(
          `${readableFastMessage}`,
          {
            type: "warning",
            title: "تعذر الحفظ السريع قبل إكمال العملية",
            subtitle: "تم إيقاف الإرسال ولم يبدأ المسار التقليدي تلقائيًا.",
            note: (fastError?.neprasResumable
              ? "تقدّمك محفوظ: يمكنك اختيار «إلغاء» ثم إعادة رفع نفس الملف بنفس الإعدادات لاستئناف الحفظ السريع من حيث توقف. "
              : "") + "إذا اخترت المتابعة فسيبدأ نبراس المسار التقليدي القديم لهذه المرة فقط.",
            okText: "استخدم المسار التقليدي",
            cancelText: "إلغاء"
          }
        );

      if (!useLegacy) {
        return;
      }
    }

    // ======================================================
    // LEGACY FALLBACK
    // لا يبدأ إلا بموافقة المستخدم لو تعذر المسار السريع.
    // ======================================================
    const state = {
      isActive: true,
      modeName: "رفع شيت ذكي شامل",
      val: "0",
      weeks: targetWeeks,
      currentWeekIdx: 0,
      grades: gradesList,
      currentGradeIdx: 0,
      classes: [],
      currentClassIdx: 0,
      studentsAbsenceMap,
      phase: "اختيار_الأسبوع",
      nextActionTime:
        Date.now()
    };

    sessionStorage.setItem(
      "ATTENDANCE_AUTO_STATE",
      JSON.stringify(state)
    );

    await neprasAttendanceAlert(
      `تمت قراءة ${totalStudentsInFile} طالب من ملف ${file.name}.`,
      {
        type: "info",
        title: "سيبدأ تسجيل الغياب",
        subtitle: `سيتم التسجيل للنطاق المختار: ${gradeScope.label}.`,
        note: "من فضلك لا تلمس أي زر أو قائمة داخل الصفحة حتى تظهر رسالة الانتهاء.",
        okText: "ابدأ"
      }
    );

    processNextStep();
  } catch (err) {
    console.error("Smart Upload Error:", err);
    await neprasAttendanceAlert(`❌ حدث خطأ أثناء معالجة الملف المرفوع.
${err?.message || ""}`, {
      type: "error",
      title: "فشل معالجة ملف الغياب"
    });
  } finally {
    removeStatusBanner();
    neprasAttendanceHideFloatingStatus(0);
    event.target.value = "";
  }
}

// ==========================================
// 7. محرك الأتمتة الشامل
// ==========================================
// شريط تقدّم الغياب يُرسم الآن ببطاقة التقدّم الموحّدة (NeprasLegacy.progress → NeprasUI) نفسها
// التي تستخدمها بقية الأدوات، بدل الشريط الداكن المرسوم يدويًا بأنماط inline وإيموجي.
// الاسم والتوقيع بقيا كما هما فتعمل كل مواضع الاستدعاء دون تعديل.
let _neprasAttendanceBannerKey = "";

function neprasAttendanceStopFromCard() {
  // pointerdown: نرفع علم الإيقاف فقط (لا نغلق البطاقة) كي لا يضيع نقر الزر.
  neprasAttendanceStopRequested = true;
  try { window.neprasRequestGlobalStop?.("attendance_banner_stop_pointer"); } catch (_) {
    try { window.__NEPRAS_STOP_ALL_REQUESTED__ = true; } catch (_) {}
  }
}

function neprasAttendanceFinishStopFromCard() {
  // نُنهي البطاقة أولًا: neprasAttendanceRequestStop تستدعي removeStatusBanner التي تغلق البطاقة الجارية،
  // وبعد إغلاقها لا يبقى ما نعرض عليه رسالة «تم إيقاف العملية».
  try {
    window.NeprasUI?.getProgress?.("main")?.finish({
      kind: "info",
      title: "تم إيقاف العملية",
      message: "تم إيقاف التشغيل الآلي وتنظيف الأمر الحالي بالكامل.",
      autoHide: 6000
    });
  } catch (_) {}
  neprasAttendanceRequestStop("attendance_banner_stop");
  _neprasAttendanceBannerKey = "";
  try {
    chrome.runtime.sendMessage({
      action: "NEPRAS_CLEANUP_COMMAND_STATE",
      scope: "student",
      reason: "attendance_stopped"
    }).catch(() => {});
  } catch (_) {}
}

function showStatusBanner(text) {
  const L = window.NeprasLegacy;
  if (!L) return;

  const raw = String(text == null ? "" : text);
  // «تم 12/300» → عدّاد وشريط تقدّم حقيقي بدل النص
  const m = raw.match(/تم\s+(\d+)\s*\/\s*(\d+)/);
  const current = m ? Number(m[1]) : 0;
  const total = m ? Number(m[2]) : 0;
  // العنوان يقول «جاري تسجيل الغياب» فلا نكرر العبارة في السطر الفرعي.
  const subtitle = raw
    .replace(/\s*[—-]?\s*تم\s+\d+\s*\/\s*\d+/, "")
    .replace(/^[^\u0600-\u06FF]*تسجيل الغياب\s*[—-]\s*/, "");

  // لا نعيد الرسم إذا لم يتغير شيء: إعادة بناء زر الإيقاف بين الضغط والرفع تُضيّع النقرة.
  const key = `${subtitle}|${current}|${total}`;
  const card = window.NeprasUI?.getProgress?.("main");
  if (card && card.running && key === _neprasAttendanceBannerKey) return;
  _neprasAttendanceBannerKey = key;

  L.progress("جاري تسجيل الغياب", current, total, subtitle, "green", {
    onStopPointerDown: neprasAttendanceStopFromCard,
    onStop: neprasAttendanceFinishStopFromCard
  });
}

function removeStatusBanner() {
  _neprasAttendanceBannerKey = "";
  try {
    // نغلق بطاقة التقدّم الجارية فقط؛ بطاقة «تم إيقاف العملية» المنتهية تبقى حتى تختفي وحدها.
    const card = window.NeprasUI?.getProgress?.("main");
    if (card && card.running) card.close(0);
  } catch (_) {}
  document.getElementById("auto-status-banner")?.remove();
}

async function startSingleGradeAuto(specArg) {
  neprasAttendanceResetStop();
  if (!isAttendancePage()) return window.neprasDialog?.alert("❌ يرجى الانتقال لصفحة تسجيل الغياب أولاً!", { type: "warning" });
  const selectedWeek = neprasAttendanceRequireSelectedWeek(true);
  if (!selectedWeek) return;
  const classSelect = getClassSelect();
  if (!classSelect) return window.neprasDialog?.alert("❌ لم يتم العثور على قائمة الفصول.", { type: "warning" });

  const options = Array.from(classSelect.options || []).filter(opt => opt.value && opt.value !== "0" && !opt.text.includes("اختر"));
  if (options.length === 0) return window.neprasDialog?.alert("❌ لا يوجد فصول مدمجة في القائمة.", { type: "warning" });

  const spec = neprasAttendanceNormalizeSpec(specArg) || await neprasAttendanceAskSpec({
    title: "تسجيل فصول الصف", message: "سيتم المرور على كل فصول الصف الحالي وحفظها آليًا.",
    note: "لا تلمس الصفحة بعد بدء التنفيذ حتى تظهر رسالة الانتهاء.", okText: "بدء التنفيذ"
  });
  if (!spec) return;

  const state = {
    isActive: true,
    modeName: "فصول الصف",
    weeks: [selectedWeek],
    currentWeekIdx: 0,
    val: spec,
    classes: options.map(o => ({ val: o.value, text: o.text })),
    currentClassIdx: 0,
    phase: "اختيار_الفصل",
    nextActionTime: Date.now()
  };

  sessionStorage.setItem("ATTENDANCE_AUTO_STATE", JSON.stringify(state));
  processNextStep();
}

async function startSchoolAuto(isMultiWeek, specArg) {
  neprasAttendanceResetStop();
  if (!isAttendancePage()) return window.neprasDialog?.alert("❌ يرجى الانتقال لصفحة تسجيل الغياب أولاً!", { type: "warning" });
  
  const weekSelect = getWeekSelect();
  const gradeSelect = getGradeSelect();
  if (!gradeSelect) return window.neprasDialog?.alert("❌ لم يتم العثور على قائمة الصفوف بالصفحة!", { type: "warning" });

  const gradeOptions = Array.from(gradeSelect.options || []).filter(opt => opt.value && opt.value !== "0" && !opt.text.includes("اختر"));
  if (gradeOptions.length === 0) return window.neprasDialog?.alert("❌ لا توجد صفوف مجهزة بالصفحة!", { type: "warning" });

  let targetWeeks = [];

  if (isMultiWeek) {
    if (!weekSelect) return window.neprasDialog?.alert("❌ لم يتم العثور على قائمة الأسابيع بالصفحة!", { type: "warning" });
    const chosenRange = await showWeekRangeDialog(1, 28);
    if (!chosenRange) return;
    targetWeeks = chosenRange.map(w => ({ val: w.val, text: w.text }));
  } else {
    const selectedWeek = neprasAttendanceRequireSelectedWeek(true);
    if (!selectedWeek) return;
    targetWeeks = [selectedWeek];
  }

  const spec = neprasAttendanceNormalizeSpec(specArg) || await neprasAttendanceAskSpec({
    title: "تسجيل الغياب الشامل", message: `سيتم تسجيل الغياب لعدد (${targetWeeks.length}) أسبوع لجميع الصفوف والفصول تلقائيًا.`,
    note: "لا تلمس الصفحة بعد بدء التنفيذ حتى تظهر رسالة الانتهاء.", okText: "بدء التنفيذ"
  });
  if (!spec) return;

  const state = {
    isActive: true,
    modeName: "أسبوعي كامل",
    val: spec,
    weeks: targetWeeks,
    currentWeekIdx: 0,
    grades: gradeOptions.map(g => ({ val: g.value, text: g.text })),
    currentGradeIdx: 0,
    classes: [],
    currentClassIdx: 0,
    phase: "اختيار_الأسبوع",
    nextActionTime: Date.now()
  };

  sessionStorage.setItem("ATTENDANCE_AUTO_STATE", JSON.stringify(state));
  processNextStep();
}

async function startRandomAttendanceAuto() {
  neprasAttendanceResetStop();
  if (!isAttendancePage()) return window.neprasDialog?.alert("❌ يرجى الانتقال لصفحة تسجيل الغياب أولاً!", { type: "warning" });
  const selectedWeek = neprasAttendanceRequireSelectedWeek(true);
  if (!selectedWeek) return;
  
  const gradeSelect = getGradeSelect();
  if (!gradeSelect) return window.neprasDialog?.alert("❌ لم يتم العثور على قائمة الصفوف!", { type: "warning" });

  const gradeOptions = Array.from(gradeSelect.options || []).filter(opt => opt.value && opt.value !== "0" && !opt.text.includes("اختر"));
  let gradeListText = gradeOptions.map((g, idx) => `${idx + 1}- ${g.text}`).join("\n");
  
  let gradeInput = await window.neprasDialog.prompt(
    `اختر رقم الصف لتوزيع الغياب العشوائي على جميع فصوله:\n${gradeListText}`,
    "",
    { title: "اختيار الصف", okText: "التالي" }
  );
  if (!gradeInput) return;
  let gradeIdx = parseInt(gradeInput) - 1;
  if (isNaN(gradeIdx) || gradeIdx < 0 || gradeIdx >= gradeOptions.length) return window.neprasDialog?.alert("❌ اختيار غير صحيح.", { type: "warning" });

  let targetGrade = gradeOptions[gradeIdx];

  let totalAbsenceInput = await window.neprasDialog.prompt(`أدخل إجمالي عدد الطلاب الغائبين المطلوب توزيعهم عشوائيًا على فصول (${targetGrade.text}):`, "", { title: "التوزيع العشوائي", okText: "بدء التوزيع" });
  if (!totalAbsenceInput || isNaN(totalAbsenceInput)) return;
  let targetTotalAbsences = parseInt(totalAbsenceInput);

  // v1.2.24: هذا المسار يسجّل غيابًا لم يحدث فعليًا في سجل رسمي لدى الوزارة.
  // نطلب تأكيدًا صريحًا حتى لا يُشغَّل بالخطأ (والإلغاء هو الخيار الافتراضي المعروض أولًا).
  const confirmRandom = await neprasAttendanceConfirm(
    `سيتم تسجيل ${targetTotalAbsences} حالة غياب موزّعة عشوائيًا على طلاب ${targetGrade.text} في نظام الوزارة، وليست غيابًا فعليًا لطلاب بعينهم.`,
    {
      type: "warning",
      title: "تأكيد التوزيع العشوائي للغياب",
      subtitle: "هذه بيانات غير حقيقية في سجل رسمي.",
      note: "استخدمها فقط لغرض تجريبي أو بموافقة الجهة المسؤولة. الأفضل رفع غياب فعلي من ملف الشيت.",
      okText: "أفهم وأريد المتابعة",
      cancelText: "إلغاء"
    }
  );
  if (!confirmRandom) return;

  window.neprasDialog?.alert("⚠️ اضغط موافق ثم انتظر بدون لمس الماوس...\nجاري تنزيل بيانات فصول الصف وجمع الطلاب لتوزيع الغياب عشوائياً.", { type: "warning" });

  triggerSelectChange(gradeSelect, targetGrade.value);
  await new Promise(r => setTimeout(r, 1000));

  const classSelect = getClassSelect();
  if (!classSelect) return window.neprasDialog?.alert("❌ لم يتم العثور على الفصول.", { type: "warning" });
  let classOptions = Array.from(classSelect.options || []).filter(opt => opt.value && opt.value !== "0" && !opt.text.includes("اختر"));

  let classStudentsMap = {};
  let totalSchoolStudentsCount = 0;

  for (let cOpt of classOptions) {
    triggerSelectChange(classSelect, cOpt.value);
    await new Promise(r => setTimeout(r, 1000));

    const showBtn = getShowStudentsButton();
    if (showBtn) {
      clickButtonSafely(showBtn);
      await new Promise(r => setTimeout(r, 1200));
    }

    let classCodes = [];
    const rows = document.querySelectorAll("table tbody tr");
    rows.forEach(tr => {
      const tds = tr.querySelectorAll("td");
      if (tds.length >= 2) {
        let code = "";
        tds.forEach((td) => {
          let txt = td.innerText.trim().replace(/\t/g, '');
          if (txt.length >= 4 && !isNaN(txt)) code = txt;
        });
        if (code) classCodes.push(code);
      }
    });

    classStudentsMap[cOpt.value] = classCodes;
    totalSchoolStudentsCount += classCodes.length;
  }

  if (totalSchoolStudentsCount === 0) {
    return window.neprasDialog?.alert("❌ لم يتم العثور على أي طلاب في هذا الصف!", { type: "warning" });
  }

  if (targetTotalAbsences > totalSchoolStudentsCount) {
    targetTotalAbsences = totalSchoolStudentsCount;
  }

  let selectedAbsentCodesByClass = {};
  classOptions.forEach(cOpt => {
    selectedAbsentCodesByClass[cOpt.value] = [];
  });

  let allClassEntries = Object.entries(classStudentsMap);
  let remainingAbsences = targetTotalAbsences;

  for (let [cVal, codes] of allClassEntries) {
    if (codes.length === 0 || remainingAbsences <= 0) continue;
    let classShare = Math.round((codes.length / totalSchoolStudentsCount) * targetTotalAbsences);
    classShare = Math.min(classShare, codes.length, remainingAbsences);
    
    let shuffledCodes = [...codes].sort(() => 0.5 - Math.random());
    selectedAbsentCodesByClass[cVal] = shuffledCodes.slice(0, classShare);
    remainingAbsences -= classShare;
  }

  while (remainingAbsences > 0) {
    let availableClasses = allClassEntries.filter(([cVal, codes]) => codes.length > selectedAbsentCodesByClass[cVal].length);
    if (availableClasses.length === 0) break;
    let randomClass = availableClasses[Math.floor(Math.random() * availableClasses.length)];
    let [cVal, codes] = randomClass;
    let unselected = codes.filter(c => !selectedAbsentCodesByClass[cVal].includes(c));
    if (unselected.length > 0) {
      selectedAbsentCodesByClass[cVal].push(unselected[0]);
      remainingAbsences--;
    } else {
      break;
    }
  }

  let state = {
    isActive: true,
    modeName: "توزيع عشوائي للفصول",
    val: "1",
    weeks: [selectedWeek],
    currentWeekIdx: 0,
    grades: [{ val: targetGrade.value, text: targetGrade.text }],
    currentGradeIdx: 0,
    classes: classOptions.map(o => ({ val: o.value, text: o.text })),
    currentClassIdx: 0,
    absentCodesByClass: selectedAbsentCodesByClass,
    phase: "اختيار_الفصل",
    nextActionTime: Date.now()
  };

  sessionStorage.setItem("ATTENDANCE_AUTO_STATE", JSON.stringify(state));
  processNextStep();
}

function processNextStep() {
  if (neprasAttendanceIsStopped()) {
    try { sessionStorage.removeItem("ATTENDANCE_AUTO_STATE"); } catch (_) {}
    removeStatusBanner();
    return;
  }

  if (!isAttendancePage()) {
    if (sessionStorage.getItem("ATTENDANCE_AUTO_STATE")) {
      sessionStorage.removeItem("ATTENDANCE_AUTO_STATE");
      removeStatusBanner();
    }
    return;
  }

  const saved = sessionStorage.getItem("ATTENDANCE_AUTO_STATE");
  if (!saved) return;

  let state = JSON.parse(saved);
  if (!state.isActive) return;

  // شبكة أمان: لا نمر إلى تحميل الطلاب أو الحفظ بأسبوع فارغ.
  if (
    Array.isArray(state.weeks) &&
    state.currentWeekIdx < state.weeks.length &&
    !neprasAttendanceWeekRefIsValid(state.weeks[state.currentWeekIdx])
  ) {
    sessionStorage.removeItem("ATTENDANCE_AUTO_STATE");
    removeStatusBanner();
    chrome.runtime.sendMessage({
      action: "NEPRAS_CLEANUP_COMMAND_STATE",
      scope: "student",
      reason: "attendance_week_missing"
    }).catch(() => {});
    window.neprasDialog?.alert(
      "⚠️ تم إيقاف العملية لأن الأسبوع غير محدد. اختر الأسبوع ثم ابدأ التسجيل من جديد.",
      { type: "warning", title: "اختيار الأسبوع مطلوب" }
    );
    return;
  }

  let currentWeekName = state.weeks && state.weeks[state.currentWeekIdx] ? state.weeks[state.currentWeekIdx].text : "";
  let currentGradeName = state.grades && state.grades[state.currentGradeIdx] ? state.grades[state.currentGradeIdx].text : "";
  let currentClassName = state.classes && state.classes[state.currentClassIdx] ? state.classes[state.currentClassIdx].text : "";

  const phaseLabels = {
    "اختيار_الأسبوع": "جاري تجهيز الأسبوع",
    "اختيار_الصف": "جاري تجهيز الصف",
    "تحميل_قائمة_الفصول": "جاري تجهيز الفصول",
    "اختيار_الفصل": "جاري تجهيز الفصل",
    "ضغط_عرض_الطلبة": "جاري تحميل الطلاب",
    "تعبئة_وحفظ": "جاري حفظ الغياب"
  };
  const simplePhase = phaseLabels[state.phase] || "جاري التنفيذ";
  const parts = [currentWeekName, currentGradeName, currentClassName ? `الفصل ${currentClassName}` : "", simplePhase].filter(Boolean);
  showStatusBanner(`⚡ ${parts.join(" — ")}`);

  if (Date.now() < state.nextActionTime) return;

  try {
    if (state.phase === "اختيار_الأسبوع") {
      if (!state.weeks || state.currentWeekIdx >= state.weeks.length) {
        sessionStorage.removeItem(
          "ATTENDANCE_AUTO_STATE"
        );

        removeStatusBanner();

        chrome.runtime.sendMessage({
          action:
            "NEPRAS_CLEANUP_COMMAND_STATE",
          scope: "student",
          reason:
            "attendance_finished"
        }).catch(() => {});

        if (Number(state.saveAttempts || 0) > 0) {
          window.neprasDialog?.success("اكتمل تسجيل الغياب بنجاح تام!", { title: "اكتمل تسجيل الغياب" });
        } else {
          window.neprasDialog?.alert(
            "لم يتم تنفيذ أي حفظ فعلي. راجع اختيار الأسبوع والصف والفصل ثم أعد المحاولة.",
            { type: "warning", title: "لم يتم تسجيل الغياب" }
          );
        }

        return;
      }
      const weekSelect = getWeekSelect();
      const targetWeek = state.weeks[state.currentWeekIdx];
      if (weekSelect && targetWeek && targetWeek.val) {
        triggerSelectChange(weekSelect, targetWeek.val);
      }
      state.phase = state.grades ? "اختيار_الصف" : "اختيار_الفصل";
      state.nextActionTime = Date.now() + 1000;
    }
    else if (state.phase === "اختيار_الصف") {
      if (!state.grades || state.currentGradeIdx >= state.grades.length) {
        state.currentWeekIdx++;
        // إصلاح نطاق الأسابيع: كان currentGradeIdx يبقى عند آخر صف، فيُتخطّى كل أسبوع بعد الأول
        // (يُختار الأسبوع ثم يُعدّ بلا صفوف فيقفز للتالي) ويظهر «اكتمل» بينما لم يُحفظ إلا الأسبوع الأول.
        // كل أسبوع جديد يبدأ من أول صف وأول فصل.
        if (state.grades) {
          state.currentGradeIdx = 0;
          state.currentClassIdx = 0;
          state.classes = [];
        }
        state.phase = "اختيار_الأسبوع";
        state.nextActionTime = Date.now() + 800;
      } else {
        const gradeSelect = getGradeSelect();
        const targetGrade = state.grades[state.currentGradeIdx];
        if (gradeSelect && targetGrade) triggerSelectChange(gradeSelect, targetGrade.val);
        state.phase = "تحميل_قائمة_الفصول";
        state.nextActionTime = Date.now() + 1200;
      }
    }
    else if (state.phase === "تحميل_قائمة_الفصول") {
      const classSelect = getClassSelect();
      if (classSelect && classSelect.options) {
        const opts = Array.from(classSelect.options).filter(o => o.value && o.value !== "0" && !o.text.includes("اختر"));
        state.classes = opts.map(o => ({ val: o.value, text: o.text }));
        state.currentClassIdx = 0;
        state.phase = "اختيار_الفصل";
        state.nextActionTime = Date.now() + 600;
      } else {
        state.nextActionTime = Date.now() + 1000;
      }
    }
    else if (state.phase === "اختيار_الفصل") {
      if (!state.classes || state.currentClassIdx >= state.classes.length) {
        if (state.grades) {
          state.currentGradeIdx++;
          state.phase = "اختيار_الصف";
        } else {
          sessionStorage.removeItem(
            "ATTENDANCE_AUTO_STATE"
          );

          removeStatusBanner();

          chrome.runtime.sendMessage({
            action:
              "NEPRAS_CLEANUP_COMMAND_STATE",
            scope: "student",
            reason:
              "attendance_smart_upload_finished"
          }).catch(() => {});

          if (Number(state.saveAttempts || 0) > 0) {
            window.neprasDialog?.success("تم الانتهاء من تنفيذ الشيت الذكي وتسجيل الغياب بنجاح تام!", { title: "اكتمل الشيت الذكي" });
          } else {
            window.neprasDialog?.alert(
              "لم يتم تنفيذ أي حفظ فعلي. راجع اختيار الأسبوع والصف والفصل ثم أعد المحاولة.",
              { type: "warning", title: "لم يتم تسجيل الغياب" }
            );
          }

          return;
        }
        state.nextActionTime = Date.now() + 800;
      } else {
        const classSelect = getClassSelect();
        const targetClass = state.classes[state.currentClassIdx];
        if (classSelect && targetClass) triggerSelectChange(classSelect, targetClass.val);
        state.phase = "ضغط_عرض_الطلبة";
        state.nextActionTime = Date.now() + 1000;
      }
    }
    else if (state.phase === "ضغط_عرض_الطلبة") {
      const showBtn = getShowStudentsButton();
      if (showBtn) {
        clickButtonSafely(showBtn);
        state.phase = "تعبئة_وحفظ";
        state.nextActionTime = Date.now() + 1500;
      } else {
        state.nextActionTime = Date.now() + 1000;
      }
    }
    else if (state.phase === "تعبئة_وحفظ") {
      let count = 0;
      if (state.modeName === "رفع شيت ذكي شامل" && state.studentsAbsenceMap) {
        const rows = document.querySelectorAll("table tbody tr");
        rows.forEach(tr => {
          const tds = tr.querySelectorAll("td");
          if (tds.length >= 2) {
            let code = "";
            tds.forEach((td) => {
              let txt = td.innerText.trim().replace(/\t/g, '');
              if (txt.length >= 4 && !isNaN(txt)) code = txt;
            });
            if (code && state.studentsAbsenceMap[code] !== undefined) {
              let inputField = tr.querySelector("input[type='number'], input[type='text']");
              if (inputField) {
                inputField.value = state.studentsAbsenceMap[code];
                inputField.dispatchEvent(new Event('input', { bubbles: true }));
                inputField.dispatchEvent(new Event('change', { bubbles: true }));
                count++;
              }
            }
          }
        });
      } else if (state.modeName === "توزيع عشوائي للفصول" && state.absentCodesByClass) {
        setAllDays(0);
        let currentClassObj = state.classes[state.currentClassIdx];
        let targetCodes = state.absentCodesByClass[currentClassObj.val] || [];
        
        const rows = document.querySelectorAll("table tbody tr");
        rows.forEach(tr => {
          const tds = tr.querySelectorAll("td");
          if (tds.length >= 2) {
            let code = "";
            tds.forEach((td) => {
              let txt = td.innerText.trim().replace(/\t/g, '');
              if (txt.length >= 4 && !isNaN(txt)) code = txt;
            });
            if (code && targetCodes.includes(code)) {
              let inputField = tr.querySelector("input[type='number'], input[type='text']");
              if (inputField) {
                inputField.value = "1";
                inputField.dispatchEvent(new Event('input', { bubbles: true }));
                inputField.dispatchEvent(new Event('change', { bubbles: true }));
                count++;
              }
            }
          }
        });
        count = 1; 
      } else {
        count = setAllDays(state.val);
      }

      let saveBtn = getSaveButton();
      if (saveBtn) {
        clickButtonSafely(saveBtn);
        state.saveAttempts = Number(state.saveAttempts || 0) + 1;
        state.currentClassIdx++;
        state.phase = "اختيار_الفصل";
        state.nextActionTime = Date.now() + 2200; 
      } else {
        state.currentClassIdx++;
        state.phase = "اختيار_الفصل";
        state.nextActionTime = Date.now() + 1500;
      }
    }
  } catch (err) {
    console.error("Auto Process Error:", err);
  }

  if (state.isActive) {
    sessionStorage.setItem("ATTENDANCE_AUTO_STATE", JSON.stringify(state));
  } else {
    sessionStorage.removeItem("ATTENDANCE_AUTO_STATE");
  }
}

// ==========================================
// 8. تصدير البيانات العامة (مدمج به اسم المدرسة)
// ==========================================
async function exportAllStudentsData() {
  const table = document.querySelector("table");
  if (!table) return window.neprasDialog?.alert("❌ لم يتم العثور على جدول بيانات في هذه الصفحة!", { type: "warning" });
  window.neprasDialog?.alert("⚠️ اضغط موافق ثم انتظر بدون لمس الماوس...\nجاري تنزيل كافة البيانات والتنقل بين الصفحات.", { type: "warning" });

  let gradeName = "";
  document.querySelectorAll("select").forEach(select => {
    const selectedText = select.options[select.selectedIndex]?.text || "";
    if (selectedText.includes("الصف")) gradeName = selectedText.trim();
  });

  let formattedGrade = gradeName ? gradeName.replace(/[/\\?%*:|"<>]/g, "_") : "بيانات_الطلاب";
  const schoolName = getSchoolNameFromPage();
  const fileName = `بيانات_${formattedGrade}_${schoolName}.csv`;

  const lengthSelect = document.querySelector('select[name*="length"], .dataTables_length select, select');
  if (lengthSelect) {
    const options = Array.from(lengthSelect.options || []);
    if (options.length > 0) {
      const maxOpt = options.reduce((prev, curr) => (parseInt(curr.value) > parseInt(prev.value) ? curr : prev), options[0]);
      if (lengthSelect.value !== maxOpt.value) {
        lengthSelect.value = maxOpt.value;
        lengthSelect.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }

  let headers = [];
  table.querySelectorAll("thead th, tr:first-child th").forEach(th => {
    let text = th.innerText.replace(/\s+/g, " ").trim();
    if (text && !text.includes("تعديل") && !text.includes("إجراءات")) headers.push(`"${text}"`);
  });

  let allRowsData = [];
  let hasNextPage = true;
  let pageCounter = 0;

  while (hasNextPage && pageCounter < 50) {
    pageCounter++;
    table.querySelectorAll("tbody tr").forEach(tr => {
      const tds = tr.querySelectorAll("td");
      if (tds.length > 0) {
        const row = [];
        tds.forEach(td => {
          let text = td.innerText.replace(/\s+/g, " ").trim();
          const inputEl = td.querySelector('input[type="number"], input[type="text"], input.form-control');
          if (inputEl && inputEl.value !== undefined && inputEl.value !== '') {
            text = String(inputEl.value).trim();
          }
          if (text !== "تعديل" && !td.querySelector('button, a.btn, input[type="button"]')) {
            row.push(`"\t${text.replace(/"/g, '""')}"`);
          }
        });
        if (row.length > 0) allRowsData.push(row);
      }
    });

    const nextBtn = document.querySelector('.paginate_button.next:not(.disabled), li.next:not(.disabled) a, .pagination .next:not(.disabled)');
    if (nextBtn && nextBtn.offsetParent !== null && !nextBtn.classList.contains('disabled')) {
      clickButtonSafely(nextBtn);
      await new Promise(r => setTimeout(r, 1000));
    } else {
      hasNextPage = false;
    }
  }

  if (allRowsData.length === 0) return window.neprasDialog?.alert("❌ لم يتم تنزيل أي بيانات!", { type: "warning" });

  let csvContent = "\uFEFF" + headers.join(";") + "\n";
  allRowsData.forEach(row => {
    csvContent += row.join(";") + "\n";
  });

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  if (window.neprasDialog?.triggerDownload) {
    await window.neprasDialog.triggerDownload(blob, fileName, {
      title: "تم تصدير البيانات بنجاح",
      message: `تم حفظ الملف بنجاح.`,
      folder: "بيانات الطلاب"
    });
  } else {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 15000);
  }
  await window.neprasDialog.success(`تم تصدير بيانات ${allRowsData.length} طالب بنجاح!`, { title: "تم التصدير" });
}

// ==========================================
// 9. استيراد وتحديث الغياب المباشر من جدول الفصل أو تقرير الغياب
// ==========================================
async function neprasScrapeCurrentAttendanceTable(options = {}) {
  // فحص المستند الرئيسي وجميع الإطارات الفرعية (iframes)
  function scanDocForTables(doc) {
    if (!doc) return [];
    let list = [];
    try {
      doc.querySelectorAll('table').forEach(t => list.push(t));
      doc.querySelectorAll('iframe').forEach(f => {
        try {
          const idoc = f.contentDocument || f.contentWindow?.document;
          if (idoc) list.push(...scanDocForTables(idoc));
        } catch (_) {}
      });
    } catch (_) {}
    return list;
  }

  function inspectTable(table) {
    let codeIdx = -1, nameIdx = -1, daysIdx = -1, contIdx = -1, sepIdx = -1;
    const ths = table.querySelectorAll('thead th, thead td, tr:first-child th, tr:first-child td');
    ths.forEach((th, idx) => {
      const t = (th.innerText || th.textContent || '').trim();
      if (codeIdx === -1 && /كود|رقم\s*الجلوس|رقم\s*التلميذ|رقم\s*الطالب|code/i.test(t)) codeIdx = idx;
      else if (nameIdx === -1 && /اسم|طالب|تلميذ|name/i.test(t)) nameIdx = idx;
      else if (contIdx === -1 && /متصل/i.test(t)) contIdx = idx;
      else if (sepIdx === -1 && /منفصل/i.test(t)) sepIdx = idx;
      else if (daysIdx === -1 && /(إجمالي|عدد)?\s*(أيام|ايام)?\s*الغياب|الغياب|أيام|ايام|غياب|days|absence/i.test(t)) daysIdx = idx;
    });

    const trs = table.querySelectorAll('tbody tr, tr');
    const students = [];

    trs.forEach(tr => {
      const tds = tr.querySelectorAll('td');
      if (tds.length < 2) return;

      let code = '', name = '', days = 0;

      if (codeIdx !== -1 && tds[codeIdx]) {
        code = (tds[codeIdx].innerText || '').trim().replace(/\D/g, '');
      }
      if (nameIdx !== -1 && tds[nameIdx]) {
        name = (tds[nameIdx].innerText || '').trim();
      }

      // حساب الأيام من الأعمدة الصريحة
      let daysFound = false;
      if (contIdx !== -1 && sepIdx !== -1 && tds[contIdx] && tds[sepIdx]) {
        const cVal = parseInt((tds[contIdx].innerText || '').replace(/\D/g, ''), 10) || 0;
        const sVal = parseInt((tds[sepIdx].innerText || '').replace(/\D/g, ''), 10) || 0;
        days = cVal + sVal;
        daysFound = true;
      } else if (daysIdx !== -1 && tds[daysIdx]) {
        const inp = tds[daysIdx].querySelector('input[type="number"], input.form-control, input');
        if (inp && inp.value !== '') {
          days = parseInt(inp.value, 10) || 0;
          daysFound = true;
        } else {
          const rawNum = (tds[daysIdx].innerText || '').replace(/\D/g, '');
          if (rawNum !== '') {
            days = parseInt(rawNum, 10) || 0;
            daysFound = true;
          }
        }
      }

      // بدائل إذا لم تُكتشف الأعمدة من الترويسة
      if (!code) {
        for (let i = 0; i < tds.length; i++) {
          const val = (tds[i].innerText || '').trim().replace(/\D/g, '');
          if (val.length >= 7 && val.length <= 14) {
            code = val;
            break;
          }
        }
      }
      if (!name) {
        for (let i = 0; i < tds.length; i++) {
          const val = (tds[i].innerText || '').trim();
          if (val.length >= 4 && !/\d{5,}/.test(val) && /[\u0600-\u06FF]/.test(val)) {
            name = val;
            break;
          }
        }
      }
      if (!daysFound) {
        const anyNumInput = tr.querySelector('input[type="number"], input.form-control');
        if (anyNumInput && anyNumInput.value !== '') {
          days = parseInt(anyNumInput.value, 10) || 0;
        }
      }

      if (code && name) {
        students.push({ code, name, days });
      }
    });

    return { table, studentCount: students.length, students };
  }

  function findBestTable() {
    const allTables = scanDocForTables(document);
    let best = null;
    let max = 0;
    for (const t of allTables) {
      const res = inspectTable(t);
      if (res.studentCount > max) {
        max = res.studentCount;
        best = res;
      }
    }
    return best;
  }

  // استخراج الصف والفصل والأسبوع من الصفحة
  let gradeText = '', classText = '', weekText = '';
  const gradeSelect = typeof getGradeSelect === 'function' ? getGradeSelect() : null;
  if (gradeSelect && gradeSelect.selectedIndex >= 0) {
    gradeText = (gradeSelect.options[gradeSelect.selectedIndex]?.text || '').trim();
  }
  const classSelect = typeof getClassSelect === 'function' ? getClassSelect() : null;
  if (classSelect && classSelect.selectedIndex >= 0) {
    classText = (classSelect.options[classSelect.selectedIndex]?.text || '').trim();
  }
  const weekSelect = typeof getWeekSelect === 'function' ? getWeekSelect() : null;
  if (weekSelect && weekSelect.selectedIndex >= 0) {
    weekText = (weekSelect.options[weekSelect.selectedIndex]?.text || '').trim();
  }

  if (!gradeText || !classText) {
    document.querySelectorAll('select').forEach(sel => {
      const txt = (sel.options[sel.selectedIndex]?.text || '').trim();
      if (!gradeText && (txt.includes('الصف') || txt.includes('صف'))) gradeText = txt;
      else if (!classText && (txt.includes('فصل') || /^\d+\/\d+$/.test(txt))) classText = txt;
      else if (!weekText && (txt.includes('الأسبوع') || txt.includes('أسبوع'))) weekText = txt;
    });
  }

  // محاولة أولى للبحث عن جدول يحتوي على صفوف طلاب
  let match = findBestTable();

  // إذا لم نجد جدولاً به طلاب:
  if (!match || match.studentCount === 0) {
    const url = window.location.href || '';
    if (/absence\/save|absence/i.test(url)) {
      const hasGradeVal = gradeSelect?.value && gradeSelect.value !== '0' && !gradeSelect.options[gradeSelect.selectedIndex]?.text.includes('اختر');
      const hasClassVal = classSelect?.value && classSelect.value !== '0' && !classSelect.options[classSelect.selectedIndex]?.text.includes('اختر');

      if (hasGradeVal && hasClassVal) {
        // زر عرض الطلاب موجود، نحاول الضغط عليه لعرض الجدول تلقائياً
        const showBtn = typeof getShowStudentsButton === 'function' ? getShowStudentsButton() : null;
        if (showBtn) {
          try {
            clickButtonSafely(showBtn);
          } catch (_) {}
          // ننتظر ظهور الجدول حتى 3 ثوانٍ
          for (let i = 0; i < 15; i++) {
            await new Promise(r => setTimeout(r, 200));
            match = findBestTable();
            if (match && match.studentCount > 0) break;
          }
        }
      }

      if (!match || match.studentCount === 0) {
        if (!hasGradeVal || !hasClassVal) {
          return {
            ok: false,
            message: 'أنت في صفحة تسجيل الغياب بالوزارة.\n\nيرجى تحديد (الصف الدراسي) و(الفصل) بالصفحة أولاً، ثم الضغط على زر [عرض كل الطلبة] لعرض كشف الفصل، ثم الضغط على زر الاستيراد.'
          };
        } else {
          return {
            ok: false,
            message: 'أنت في صفحة تسجيل الغياب، ولكن لم يظهر جدول الطلاب بعد.\n\nيرجى التأكد من الضغط على زر [عرض كل الطلبة] في صفحة الوزارة أولاً حتى تظهر أسماء الطلاب في الجدول، ثم أعد الضغط على زر الاستيراد.'
          };
        }
      }
    } else if (/absence\/report|report/i.test(url)) {
      return {
        ok: false,
        message: 'أنت في صفحة تقارير الغياب بالوزارة.\n\nيرجى تحديد معايير التقرير (الصف/الفصل) والضغط على زر [عرض التقرير] بالصفحة لعرض الكشف أولاً، ثم أعد الضغط على زر الاستيراد.'
      };
    } else {
      return {
        ok: false,
        message: 'التبويب الحالي ليس صفحة غياب بالوزارة.\n\nيرجى فتح صفحة غياب الطلاب (absence/save أو absence/report) واختيار الفصل أولاً.'
      };
    }
  }

  // تم العثور على الجدول واستخراج البيانات
  const finalStudents = match.students.map(s => ({
    code: s.code,
    name: s.name,
    grade: gradeText,
    className: classText,
    week: weekText,
    absenceDays: s.days
  }));

  return {
    ok: true,
    grade: gradeText,
    className: classText,
    week: weekText,
    count: finalStudents.length,
    students: finalStudents
  };
}

if (typeof window !== 'undefined') {
  window.neprasScrapeCurrentAttendanceTable = neprasScrapeCurrentAttendanceTable;
}
