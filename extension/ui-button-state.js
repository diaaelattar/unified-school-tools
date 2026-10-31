/**
 * ui-button-state.js — Phase 2: نظام موحّد لحالة "جاري التنفيذ" + الحماية
 * من الضغط المزدوج على أزرار العمليات. يعتمد على كلاس .btn.is-loading
 * المُعرَّف في popup.css (Phase 1).
 *
 * لا يغيّر هذا الملف أي منطق عمل قائم في popup.js/auth.js — فقط يضيف طبقة
 * عرض (تعطيل الزر + إظهار مؤشر دوران بدل النص) حول أي دالة async موجودة
 * بالفعل، ثم يعيد الزر لحالته الطبيعية ويُعيد رمي الخطأ كما هو بعد عرضه
 * على المستخدم عبر نفس قناة الإشعارات المستخدمة حاليًا (window.neprasDialog
 * أو window.neprasNotice، أيهما متاح).
 *
 * الاستخدام المعتاد (يدير كل شيء تلقائيًا):
 *   btn.addEventListener("click", () => withButtonBusy(btn, async () => {
 *     await navigateAndRun({...});
 *   }));
 *
 * للحالات ذات القفل اليدوي القائم أصلًا بمهلة زمنية مقصودة (مثل تحديث
 * الإحصاء/تحليل المصروفات، حيث القفل الحقيقي في الخلفية والمهلة في الواجهة
 * مقصودة لمنع الضغط السريع) — استخدم setButtonBusy(btn, true/false) يدويًا
 * حول نفس منطق القفل القائم دون تعديل توقيته.
 */
(function (win) {
  "use strict";

  function setButtonBusy(button, isBusy, loadingLabel) {
    if (!button) return;
    if (win.NeprasButtons) win.NeprasButtons.busy(button, isBusy, loadingLabel);
    else {
      button.classList.toggle("is-loading", !!isBusy);
      button.disabled = !!isBusy;
      if (isBusy) button.setAttribute("aria-busy", "true"); else button.removeAttribute("aria-busy");
    }
    try { document.dispatchEvent(new CustomEvent("nepras:busy", { detail: { busy: !!isBusy } })); } catch (_) {}
  }

  // الأخطاء تمرّ عبر errorToMessage: رسالة مفهومة + «تفاصيل فنية» + نسخ بيانات المشكلة،
  // بدل عرض error.message الخام (الذي قد يحوي كلمات تقنية).
  function reportTaskError(error) {
    try {
      if (win.NeprasUI) { win.NeprasUI.reportError(error, "button-task"); return; }
      if (typeof win.neprasNotice === "function") win.neprasNotice((error && error.message) || "تعذر إتمام العملية", "error");
    } catch (_) {
      /* لا نكسر تدفق الخطأ الأصلي بسبب فشل عرض الإشعار نفسه. */
    }
  }

  async function withButtonBusy(button, taskFn, options) {
    const opts = options || {};
    if (typeof taskFn !== "function") return undefined;

    // حماية ضد الضغط المزدوج: زر مشغول بالفعل يتجاهل الضغطة الجديدة.
    if (button && (win.NeprasButtons ? win.NeprasButtons.isInert(button) : (button.classList.contains("is-loading") || button.disabled))) {
      return undefined;
    }

    setButtonBusy(button, true, opts.loadingLabel);
    try {
      return await taskFn();
    } catch (error) {
      console.error("Nepras: button task failed:", error);
      if (opts.reportError !== false) {
        reportTaskError(error);
      }
      if (opts.rethrow === false) return undefined;
      throw error;
    } finally {
      // بعض العمليات تُغلق نافذة الـ popup نفسها أثناء التنفيذ (نمط
      // navigateAndRun المعتاد في هذا المشروع) — عندها يكون العنصر قد
      // تهيّأ للإزالة بالفعل، وهذا الاستدعاء غير ضار (no-op فعليًا).
      setButtonBusy(button, false);
    }
  }

  win.withButtonBusy = withButtonBusy;
  win.setButtonBusy = setButtonBusy;
})(typeof window !== "undefined" ? window : this);
