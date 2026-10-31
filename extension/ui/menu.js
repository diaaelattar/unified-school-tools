/* menu.js — قائمة منبثقة بوصولية كاملة (WAI-ARIA menu button):
   Enter/Space/↓ تفتح وتركّز أول عنصر · ↑↓ Home End للتنقل · Esc يغلق ويعيد التركيز للزر · Tab يغلق · النقر خارجها أو على عنصر يغلق. */
(() => {
  'use strict';
  if (globalThis.NeprasMenu) return;
  function init(btn, list) {
    if (!btn || !list) return null;
    const items = () => [...list.querySelectorAll('[role="menuitem"]')].filter(i => !i.hidden && !i.disabled && i.getAttribute('aria-disabled') !== 'true');
    const isOpen = () => !list.hidden;
    function open(focus) {
      list.hidden = false; btn.setAttribute('aria-expanded', 'true');
      const it = items(); if (focus === 'last') it[it.length - 1]?.focus(); else if (focus !== false) it[0]?.focus();
      document.addEventListener('mousedown', onOutside, true); document.addEventListener('focusin', onFocusIn, true);
    }
    function close(returnFocus) {
      if (!isOpen()) return;
      list.hidden = true; btn.setAttribute('aria-expanded', 'false');
      document.removeEventListener('mousedown', onOutside, true); document.removeEventListener('focusin', onFocusIn, true);
      if (returnFocus) btn.focus();
    }
    const onOutside = (e) => { if (!list.contains(e.target) && !btn.contains(e.target)) close(false); };
    const onFocusIn = (e) => { if (!list.contains(e.target) && !btn.contains(e.target)) close(false); };
    btn.addEventListener('click', () => (isOpen() ? close(true) : open()));
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(e.key === 'ArrowUp' ? 'last' : undefined); }
    });
    list.addEventListener('keydown', (e) => {
      const it = items(), i = it.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); it[(i + 1) % it.length]?.focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); it[(i - 1 + it.length) % it.length]?.focus(); }
      else if (e.key === 'Home') { e.preventDefault(); it[0]?.focus(); }
      else if (e.key === 'End') { e.preventDefault(); it[it.length - 1]?.focus(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
      else if (e.key === 'Tab') close(false);
    });
    // اختيار عنصر: نغلق أولًا ثم ينفَّذ إجراؤه (مستمع الزر نفسه)
    list.addEventListener('click', (e) => { if (e.target.closest('[role="menuitem"]')) close(false); });
    return { open, close, isOpen };
  }
  globalThis.NeprasMenu = Object.freeze({ init });
  const start = () => init(document.getElementById('btn-menu'), document.getElementById('n-menu-list'));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
