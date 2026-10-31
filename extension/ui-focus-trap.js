/**
 * ui-focus-trap.js — Phase 3: فخّ تركيز موحّد لكل النوافذ المنبثقة الستّ.
 *
 * يوفّر دالتين فقط:
 *   window.neprasTrapFocus(modalElement, { onEscape, initialFocus })
 *     — يُستدعى عند فتح أي نافذة منبثقة. يحفظ العنصر الذي كان يحمل التركيز
 *       قبل الفتح (لإعادته لاحقًا)، ينقل التركيز لأول عنصر قابل للتركيز
 *       داخل النافذة (أو للعنصر المحدَّد في initialFocus إن وُجد)، ويمنع
 *       زر Tab من "تسريب" التركيز لعناصر خلف النافذة، ويستدعي onEscape
 *       عند الضغط على Esc.
 *   window.neprasReleaseFocusTrap(modalElement)
 *     — يُستدعى عند إغلاق النافذة. يزيل المستمع ويعيد التركيز للعنصر
 *       الذي فتح النافذة أصلًا.
 *
 * لا علاقة لهذا الملف بأي شكل/حجم مرئي — سلوك لوحة مفاتيح فقط، إضافة
 * خالصة (Additive) لا تُغيّر أي منطق فتح/إغلاق قائم؛ فقط تُستدعى بجانبه.
 */
(function (win, doc) {
  "use strict";

  const FOCUSABLE_SELECTOR = [
    "a[href]",
    "area[href]",
    'input:not([disabled]):not([type="hidden"])',
    "select:not([disabled])",
    "textarea:not([disabled])",
    "button:not([disabled])",
    "iframe",
    '[tabindex]:not([tabindex="-1"])',
    "[contenteditable]"
  ].join(",");

  const activeTraps = new Map();

  function isVisible(el) {
    return !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
  }

  function getFocusableElements(container) {
    return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter(isVisible);
  }

  function neprasTrapFocus(modalElement, options) {
    if (!modalElement || activeTraps.has(modalElement)) return;
    const opts = options || {};
    const lastFocused = doc.activeElement;

    setTimeout(() => {
      const preferred = opts.initialFocus ? modalElement.querySelector(opts.initialFocus) : null;
      const focusable = getFocusableElements(modalElement);
      const target = (preferred && isVisible(preferred) ? preferred : null) || focusable[0] || modalElement;
      try { target.focus(); } catch (_) {}
    }, 0);

    function onKeydown(e) {
      if (e.key === "Escape") {
        if (typeof opts.onEscape === "function") opts.onEscape();
        return;
      }
      if (e.key !== "Tab") return;

      const focusable = getFocusableElements(modalElement);
      if (!focusable.length) { e.preventDefault(); return; }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (!modalElement.contains(doc.activeElement)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && doc.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && doc.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    doc.addEventListener("keydown", onKeydown, true);
    activeTraps.set(modalElement, { onKeydown, lastFocused });
  }

  function neprasReleaseFocusTrap(modalElement) {
    const entry = activeTraps.get(modalElement);
    if (!entry) return;
    doc.removeEventListener("keydown", entry.onKeydown, true);
    activeTraps.delete(modalElement);
    try {
      if (entry.lastFocused && typeof entry.lastFocused.focus === "function" && doc.contains(entry.lastFocused)) {
        entry.lastFocused.focus();
      }
    } catch (_) {}
  }

  win.neprasTrapFocus = neprasTrapFocus;
  win.neprasReleaseFocusTrap = neprasReleaseFocusTrap;
})(typeof window !== "undefined" ? window : this, document);
