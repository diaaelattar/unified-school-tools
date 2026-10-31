/* panel.js — NeprasPanel: نافذة عائمة قابلة للسحب لأدوات صفحات الوزارة (المرحلة 5).
   تبني الهيكل (رأس بعنوان وأيقونة وأزرار إجراءات + جسم قابل للتمرير) بعناصر DOM حقيقية
   (بلا innerHTML لنص خارجي، وبلا style inline) على نظام الألوان والأزرار نفسه.
   الوحدة نفسها التي تستدعيها (auto_assign.js مثلًا) تملأ body بعناصرها الخاصة.

   NeprasPanel.create({
     id, icon, title, subtitle,
     actions: [{ id, icon, label, danger }],   // أزرار أيقونة في الرأس (تصدير/إعادة تعيين...)
     onClose, onMinimize,                      // اختياريان؛ الافتراضي: إخفاء/تبديل is-minimized
   }) → { root, body, header, show, hide, toggle, setMinimized, isMinimized, focusToTop, destroy } */
(() => {
  'use strict';
  if (globalThis.NeprasPanel) return;
  const Icons = () => globalThis.NeprasIcons;

  function h(tag, cls, attrs, kids) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (attrs) for (const [k, v] of Object.entries(attrs)) { if (v === false || v == null) continue; if (k === 'text') n.textContent = v; else n.setAttribute(k, v === true ? '' : v); }
    if (kids) for (const c of [].concat(kids)) if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    return n;
  }

  function makeDraggable(panel, handle) {
    let dragging = false, ox = 0, oy = 0;
    const down = (e) => {
      if (e.target.closest('button, input, select, a')) return; // لا تبدأ السحب من عنصر تفاعلي داخل الرأس
      dragging = true;
      // نموضع اللوحة أول مرة بموضعها الحالي بالإحداثيات الفيزيائية (left/top)، ونضيف صنفًا يُسقط
      // موضع الأنماط المنطقية الأصلية (inset-inline-end) عبر CSS بأولوية أعلى — وليس عبر JS، لأن
      // اللوحة نفسها direction:rtl فتُعكَس دلالة start/end وتتصادم مع أي ضبط JS لاحق لنفس الحافة.
      // نقرأ الموضع الحالي أولًا (قبل أي تعديل) كي لا تُحسَب الإزاحة من موضع قفز إليه العنصر للتو.
      const r = panel.getBoundingClientRect();
      panel.classList.add('is-dragged');
      panel.style.left = r.left + 'px'; panel.style.top = r.top + 'px';
      ox = e.clientX - r.left; oy = e.clientY - r.top;
      document.body.style.userSelect = 'none';
    };
    const move = (e) => {
      if (!dragging) return;
      const w = panel.offsetWidth; // إحداثيات الفأرة فيزيائية دائمًا؛ left/top الفيزيائيتان فقط تُحدَّثان أثناء السحب
      const x = Math.min(Math.max(0, e.clientX - ox), window.innerWidth - Math.min(w, 60));
      const y = Math.min(Math.max(0, e.clientY - oy), window.innerHeight - 40);
      panel.style.left = x + 'px'; panel.style.top = y + 'px';
    };
    const up = () => { dragging = false; document.body.style.userSelect = ''; };
    handle.addEventListener('mousedown', down);
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    return () => { handle.removeEventListener('mousedown', down); document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
  }

  function create(opts) {
    const o = opts || {};
    let panel = o.id ? document.getElementById(o.id) : null;
    if (panel) return panel.__neprasPanel;

    panel = h('div', 'n-panel', { id: o.id || undefined, role: 'dialog', 'aria-label': o.title || 'لوحة' });
    const header = h('div', 'n-panel__header');
    const titles = h('div', 'n-panel__titles');
    if (o.icon) { const ic = h('span', 'n-panel__icon'); ic.appendChild(Icons().el(o.icon, { size: 18 })); titles.appendChild(ic); }
    const titleBox = h('div');
    titleBox.appendChild(h('h2', null, { text: o.title || '' }));
    if (o.subtitle) titleBox.appendChild(h('p', null, { text: o.subtitle }));
    titles.appendChild(titleBox);
    const actions = h('div', 'n-panel__actions');
    const actionButtons = {};
    for (const a of o.actions || []) {
      const b = h('button', `n-btn n-btn--icon n-btn--sm ${a.danger ? 'n-btn--ghost' : 'n-btn--ghost'}`, { id: a.id, type: 'button', 'aria-label': a.label, title: a.label });
      b.appendChild(Icons().el(a.icon, { size: 16 }));
      if (a.onClick) b.addEventListener('click', a.onClick);
      actions.appendChild(b); actionButtons[a.id] = b;
    }
    header.append(titles, actions);

    const body = h('div', 'n-panel__body');
    panel.append(header, body);
    document.documentElement.appendChild(panel);
    globalThis.NeprasButtons && globalThis.NeprasButtons.hydrate(panel);

    const unbindDrag = makeDraggable(panel, header);

    const api = {
      root: panel, header, body, actionButtons,
      show() { panel.hidden = false; panel.style.zIndex = '2147483647'; },
      hide() { panel.hidden = true; },
      toggle() { api[panel.hidden ? 'show' : 'hide'](); },
      isMinimized: () => panel.classList.contains('is-minimized'),
      setMinimized(on) {
        panel.classList.toggle('is-minimized', on);
        if (o.onMinimize) o.onMinimize(on);
      },
      destroy() { unbindDrag(); panel.remove(); },
    };
    panel.__neprasPanel = api;
    return api;
  }

  globalThis.NeprasPanel = Object.freeze({ create });
})();
