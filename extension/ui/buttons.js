/* buttons.js — واجهة برمجية موحّدة لحالات الأزرار (المرحلة 3).
   الزر = [أيقونة SVG] + [نص]. لا يجوز الكتابة على textContent للزر مباشرة لأن ذلك يمسح الأيقونة؛
   استخدم setLabel/setIcon. الأيقونة تُكتب في HTML كـ <i data-icon="refresh"></i> وتُحوَّل تلقائيًا.

     NeprasButtons.hydrate(root)          يحوّل عناصر data-icon إلى SVG
     NeprasButtons.setLabel(btn, text)    يغيّر النص فقط
     NeprasButtons.setIcon(btn, name)     يغيّر الأيقونة فقط
     NeprasButtons.busy(btn, on, label?)  حالة loading: أيقونة تدور + نص «جارٍ …» + aria-busy، ثم يرجع كما كان
     NeprasButtons.disable(btn, reason)   تعطيل مع سبب (aria-disabled + تلميح + رسالة عند الضغط)؛ reason=null يُفعّل
     NeprasButtons.isInert(btn)           هل الزر معطّل أو مشغول؟ */
(() => {
  'use strict';
  if (globalThis.NeprasButtons) return;
  const Icons = () => globalThis.NeprasIcons;

  function iconEl(btn) { return btn.querySelector(':scope > .n-icon'); }
  function labelEl(btn) {
    let l = btn.querySelector(':scope > .n-btn__label');
    if (!l) { l = btn.querySelector(':scope > .n-btn__text > b'); }
    return l;
  }

  function hydrate(root) {
    const scope = root || document;
    for (const i of scope.querySelectorAll('i[data-icon]')) {
      const size = Number(i.getAttribute('data-size')) || (i.closest('.n-btn--lg') ? 22 : 20);
      i.replaceWith(Icons().el(i.getAttribute('data-icon'), { size }));
    }
  }

  function setLabel(btn, text) {
    if (!btn) return;
    const l = labelEl(btn);
    if (l) l.textContent = text; else btn.appendChild(Object.assign(document.createElement('span'), { className: 'n-btn__label', textContent: text }));
  }

  function setIcon(btn, name) {
    if (!btn) return;
    const old = iconEl(btn);
    const size = old ? Number(old.getAttribute('width')) || 20 : 20;
    const fresh = Icons().el(name, { size });
    if (old) old.replaceWith(fresh); else btn.prepend(fresh);
  }

  function busy(btn, on, loadingLabel) {
    if (!btn) return;
    if (on) {
      if (btn.classList.contains('is-loading')) return;
      const l = labelEl(btn), ic = iconEl(btn);
      btn.__nSaved = { label: l ? l.textContent : null, icon: ic ? ic.getAttribute('data-name') : null };
      btn.classList.add('is-loading'); btn.setAttribute('aria-busy', 'true'); btn.disabled = true;
      if (loadingLabel && l) l.textContent = loadingLabel;
      if (ic) setIcon(btn, 'loader');
    } else {
      if (!btn.classList.contains('is-loading')) { btn.disabled = false; return; }
      const s = btn.__nSaved; btn.__nSaved = null;
      btn.classList.remove('is-loading'); btn.removeAttribute('aria-busy'); btn.disabled = false;
      if (s && s.label != null) setLabel(btn, s.label);
      if (s && s.icon) setIcon(btn, s.icon);
    }
  }

  function disable(btn, reason) {
    if (!btn) return;
    if (reason) {
      btn.setAttribute('aria-disabled', 'true'); btn.setAttribute('data-reason', reason); btn.title = reason;
    } else {
      btn.removeAttribute('aria-disabled'); btn.removeAttribute('data-reason'); btn.removeAttribute('title');
    }
  }

  const isInert = (btn) => !!btn && (btn.disabled || btn.getAttribute('aria-disabled') === 'true' || btn.classList.contains('is-loading'));

  // زر معطّل بسبب: الضغط عليه يشرح السبب بدل أن يبدو ميتًا (يعمل في طور الالتقاط قبل أي مستمع آخر)
  document.addEventListener('click', (e) => {
    const b = e.target && e.target.closest && e.target.closest('[aria-disabled="true"][data-reason]');
    if (!b) return;
    e.preventDefault(); e.stopImmediatePropagation();
    try { globalThis.NeprasUI.toast({ kind: 'info', title: b.getAttribute('data-reason'), id: 'disabled-reason', duration: 5000 }); } catch (_) {}
  }, true);

  function init() { hydrate(document); }

  globalThis.NeprasButtons = Object.freeze({ hydrate, setLabel, setIcon, busy, disable, isInert, init });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
