/* nepras-ui.js — نظام الرسائل الموحّد (المرحلة 2).
   أربعة أنواع بقواعد ثابتة:
     toast     تأكيد عملية صغيرة (4ث نجاح/معلومة، 8ث تحذير، الخطأ يبقى حتى الإغلاق، حتى 3، aria-live)
     progress  بطاقة تقدّم للعمليات الطويلة (عنوان، «12 من 240»، شريط، زمن متبقٍ تقريبي، زر إيقاف)
     dialog    تأكيد مدمّر / طلب مدخل / ملخص نهائي — focus trap وEsc وإعادة التركيز
     field     رسالة تحقق داخل الحقل (في مستند النافذة المنبثقة)
   يُعرض كله داخل Shadow DOM بأنماط تُطبَّق عبر adoptedStyleSheets (لا تتعارض مع CSP صفحات الوزارة
   ولا مع أنماطها). كل النصوص تُدرج بـ textContent — لا innerHTML بمدخلات خام. */
(() => {
  'use strict';
  if (globalThis.NeprasUI) return;

  const HOST_ID = 'ui-nepras-host'; // لا يبدأ بـ nepras كي لا تلتقطه قواعد [id^="nepras"] العامة في modules/ui.js
  const MSG = () => globalThis.NeprasMessages;
  const ICON = (name, size) => globalThis.NeprasIcons.el(name, { size });
  const DEFAULT_MS = { success: 4000, info: 4000, question: 4000, warning: 8000, stopped: 6000, error: 0 };
  const MAX_TOASTS = 3;

  let host = null, shadow = null, refs = null, theme = 'light', bodyObserver = null;
  const toasts = [];           // {id, node, timer, remaining, started, ctl}
  const cards = new Map();     // id -> progress controller
  let openDialog = null;       // {close}
  let fontsRequested = false;

  // ------------------------------------------------------------------ DOM helpers
  function h(tag, cls, attrs, kids) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (attrs) for (const [k, v] of Object.entries(attrs)) { if (v === false || v == null) continue; if (k === 'text') n.textContent = v; else n.setAttribute(k, v === true ? '' : v); }
    if (kids) for (const c of [].concat(kids)) if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    return n;
  }
  const kindOf = (k) => (['success', 'warning', 'error', 'info', 'question', 'stopped'].includes(k) ? k : 'info');
  const iconFor = (k) => ({ success: 'success', warning: 'warning', error: 'error', info: 'info', question: 'question', stopped: 'stopped' }[kindOf(k)]);

  // نص بسيط مع <b> و<br> فقط (كل ما عداه نص عادي) — بديل آمن لـ innerHTML في الرسائل القديمة
  function renderMarkup(container, text) {
    container.textContent = '';
    const parts = String(text == null ? '' : text).split(/(<\/?(?:b|strong)>|<br\s*\/?>)/gi);
    let bold = null;
    for (const p of parts) {
      if (!p) continue;
      if (/^<br/i.test(p)) { container.appendChild(document.createTextNode('\n')); continue; }
      if (/^<(?:b|strong)>$/i.test(p)) { bold = h('b'); container.appendChild(bold); continue; }
      if (/^<\/(?:b|strong)>$/i.test(p)) { bold = null; continue; }
      (bold || container).appendChild(document.createTextNode(p));
    }
    return container;
  }

  // HTML خارجي (خيار html القديم في الحوارات): قائمة سماح صارمة، بلا style ولا on*
  const ALLOWED = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'BR', 'P', 'DIV', 'SPAN', 'SMALL', 'UL', 'OL', 'LI', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'HR', 'CODE']);
  function sanitizeHtmlInto(container, html) {
    container.textContent = '';
    const doc = new DOMParser().parseFromString(`<body>${String(html == null ? '' : html)}</body>`, 'text/html');
    const walk = (src, dst) => {
      for (const n of Array.from(src.childNodes)) {
        if (n.nodeType === 3) dst.appendChild(document.createTextNode(n.nodeValue));
        else if (n.nodeType === 1) {
          if (!ALLOWED.has(n.tagName)) { if (!/^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|LINK|META)$/.test(n.tagName)) walk(n, dst); continue; }
          const c = document.createElement(n.tagName.toLowerCase());
          if (n.tagName === 'TD' || n.tagName === 'TH') for (const a of ['colspan', 'rowspan']) if (/^\d{1,2}$/.test(n.getAttribute(a) || '')) c.setAttribute(a, n.getAttribute(a));
          dst.appendChild(c); walk(n, c);
        }
      }
    };
    walk(doc.body, container);
    return container;
  }

  // إظهار متدرّج بدون requestAnimationFrame (يتجمّد في التبويبات الخلفية): نفرض إعادة حساب ثم نضيف الصنف
  function enter(node) { void node.offsetWidth; node.classList.add('in'); }

  // ------------------------------------------------------------------ host + styles + fonts
  function requestFonts() {
    if (fontsRequested) return; fontsRequested = true;
    try {
      // داخل صفحة الإضافة الخط معرّف في fonts.css. داخل صفحات الوزارة نسجّله برمجيًا (FontFace) —
      // لا يمرّ عبر <style> فلا تمنعه CSP، وإن فشل نرجع لخط النظام بصمت.
      if (typeof chrome === 'undefined' || !chrome.runtime?.getURL || location.protocol === 'chrome-extension:' || !document.fonts || typeof FontFace === 'undefined') return;
      const face = (file, range) => new FontFace('Cairo', `url(${chrome.runtime.getURL('fonts/' + file)}) format('woff2')`, { weight: '200 1000', display: 'swap', unicodeRange: range });
      const ar = face('cairo-arabic.woff2', 'U+0600-06FF,U+0750-077F,U+08A0-08FF,U+FB50-FDFF,U+FE70-FEFC,U+200C-200E');
      const la = face('cairo-latin.woff2', 'U+0000-00FF,U+0131,U+2000-206F,U+20AC,U+2122');
      for (const f of [ar, la]) f.load().then(() => document.fonts.add(f)).catch(() => {});
    } catch (_) {}
  }

  function applyStyles(root) {
    const css = globalThis.NEPRAS_UI_STYLES || '';
    try {
      const sheet = new CSSStyleSheet(); sheet.replaceSync(css);
      root.adoptedStyleSheets = [sheet];
      return 'adopted';
    } catch (_) {
      const st = document.createElement('style'); st.textContent = css; root.appendChild(st);
      return 'style-tag';
    }
  }

  function ensureHost() {
    if (host && host.isConnected && refs) return refs;
    const existing = document.getElementById(HOST_ID);
    if (existing) {
      try { existing.remove(); } catch (_) {}
    }
    // إن حذفت الصفحة المضيف نبدأ نظيفين
    for (const t of toasts.splice(0)) clearTimeout(t.timer);
    cards.clear(); openDialog = null;
    host = document.createElement('div'); host.id = HOST_ID;
    host.setAttribute('data-theme', currentTheme());
    shadow = host.attachShadow({ mode: 'open' });
    applyStyles(shadow);
    const stack = h('div', 'stack');
    const toastArea = h('div', 'toast-area');
    const progressArea = h('div', 'progress-area');
    stack.append(toastArea, progressArea);
    const layerDialog = h('div', 'layer-dialog');
    const live = h('div', 'sr', { 'aria-live': 'polite', 'aria-atomic': 'true', role: 'status' });
    shadow.append(stack, layerDialog, live);
    (document.documentElement || document.body).appendChild(host);
    refs = { stack, toastArea, progressArea, layerDialog, live };
    requestFonts();
    watchBodyTheme();
    return refs;
  }

  function currentTheme() {
    try { if (document.body && document.body.classList.contains('theme-dark')) return 'dark'; } catch (_) {}
    return theme;
  }
  function setTheme(t) { theme = t === 'dark' ? 'dark' : 'light'; if (host) host.setAttribute('data-theme', theme); }
  function watchBodyTheme() {
    if (bodyObserver || !document.body || location.protocol !== 'chrome-extension:') return; // في صفحات الوزارة الوضع فاتح دائمًا
    bodyObserver = new MutationObserver(() => { if (host) host.setAttribute('data-theme', currentTheme()); });
    bodyObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }

  function announce(text) { try { if (refs) { refs.live.textContent = ''; setTimeout(() => { if (refs) refs.live.textContent = text; }, 30); } } catch (_) {} }

  const ACTION_HANDLERS = {
    reload_page: () => { try { location.reload(); } catch (_) {} },
  };
  function runAction(a) {
    if (!a) return;
    try { if (typeof a.onClick === 'function') a.onClick(); else if (ACTION_HANDLERS[a.id]) ACTION_HANDLERS[a.id](); } catch (e) { console.warn('[NeprasUI] action failed', e); }
  }
  function actionButton(a, cls, after) {
    const b = h('button', `btn btn-sm ${cls || 'btn-secondary'}`, { type: 'button' });
    if (a.icon) b.appendChild(ICON(a.icon, 16));
    b.appendChild(document.createTextNode(a.label || ''));
    b.addEventListener('click', () => { runAction(a); if (after && a.keepOpen !== true) after(); });
    return b;
  }

  // ------------------------------------------------------------------ toast
  function toast(opts) {
    const o = typeof opts === 'string' ? { message: opts } : (opts || {});
    const r = ensureHost();
    const kind = kindOf(o.kind);
    const id = o.id || null;
    if (id) { const ex = toasts.find(t => t.id === id); if (ex) { removeToast(ex, true); } }

    const node = h('div', `card k-${kind}`, { role: kind === 'error' ? 'alert' : 'status' });
    const row = h('div', 'row');
    const ico = h('span', 'ico'); ico.appendChild(ICON(iconFor(kind), 20));
    const body = h('div', 'body');
    if (o.title) body.appendChild(h('div', 'title', { text: o.title }));
    if (o.message || o.markup) {
      const m = h('div', 'msg');
      if (o.markup) renderMarkup(m, o.markup); else m.textContent = o.message;
      body.appendChild(m);
    }
    const close = h('button', 'x', { type: 'button', 'aria-label': 'إغلاق الرسالة', title: 'إغلاق' });
    close.appendChild(ICON('close', 18));
    row.append(ico, body, close);
    node.appendChild(row);

    const rec = { id, node, timer: 0, remaining: 0, started: 0, onClose: o.onClose };
    const dismiss = () => removeToast(rec);
    close.addEventListener('click', dismiss);
    if (o.actions && o.actions.length) {
      const bar = h('div', 'actions');
      for (const a of o.actions) bar.appendChild(actionButton(a, 'btn-secondary', dismiss));
      body.appendChild(bar);
    }

    const ms = o.duration != null ? o.duration : DEFAULT_MS[kind];
    if (ms > 0) {
      rec.remaining = ms;
      const start = () => { rec.started = Date.now(); rec.timer = setTimeout(dismiss, rec.remaining); };
      const pause = () => { if (rec.timer) { clearTimeout(rec.timer); rec.timer = 0; rec.remaining -= Date.now() - rec.started; } };
      const resume = () => { if (!rec.timer && rec.remaining > 0) start(); };
      node.addEventListener('mouseenter', pause); node.addEventListener('mouseleave', resume);
      node.addEventListener('focusin', pause); node.addEventListener('focusout', resume);
      start();
    }

    r.toastArea.appendChild(node); toasts.push(rec);
    enter(node);
    while (toasts.length > MAX_TOASTS) {
      const victim = toasts.find(t => !t.node.classList.contains('k-error')) || toasts[0];
      removeToast(victim, true);
    }
    return { close: dismiss, id };
  }
  function removeToast(rec, instant) {
    const i = toasts.indexOf(rec); if (i < 0) return;
    toasts.splice(i, 1); clearTimeout(rec.timer);
    const done = () => { rec.node.remove(); try { rec.onClose && rec.onClose(); } catch (_) {} };
    if (instant) done(); else { rec.node.classList.add('out'); setTimeout(done, 180); }
  }

  // ------------------------------------------------------------------ progress
  const nf = (n) => new Intl.NumberFormat('ar-EG-u-nu-latn').format(n);
  function etaText(st) {
    if (!(st.total > 0) || !(st.current > 0) || st.current >= st.total) return '';
    const elapsed = (Date.now() - st.startedAt) / 1000;
    if (elapsed < 4 || st.current < 2) return '';
    const left = (st.total - st.current) * (elapsed / st.current);
    if (left < 45) return 'متبقٍ أقل من دقيقة';
    const mins = Math.round(left / 60);
    if (mins < 60) return `متبقٍ نحو ${nf(mins)} دقيقة`;
    return `متبقٍ نحو ${nf(Math.round(mins / 6) / 10)} ساعة`;
  }

  function progress(opts) {
    const o = opts || {};
    const id = o.id || 'main';
    let ctl = cards.get(id);
    if (ctl && ctl.alive()) { ctl.update(o); return ctl; }
    const r = ensureHost();
    const st = { title: '', subtitle: '', current: 0, total: 0, indeterminate: true, mode: 'running', kind: 'running', onStop: null, onStopDown: null, note: true, startedAt: Date.now(), stopping: false, hideTimer: 0, lastAnnounce: 0 };

    const node = h('div', 'card k-running', { role: 'group', 'aria-label': 'تقدّم العملية' });
    const row = h('div', 'row');
    const ico = h('span', 'ico');
    const body = h('div', 'body');
    const head = h('div', 'p-head');
    const title = h('div', 'title'); const pct = h('div', 'pct');
    head.append(title, pct);
    const sub = h('div', 'msg'); sub.hidden = true;
    const bar = h('div', 'bar', { role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-label': 'نسبة الإنجاز' }); const fill = h('i'); bar.appendChild(fill);
    const meta = h('div', 'p-meta'); const count = h('span'); const eta = h('span'); meta.append(count, eta);
    const note = h('div', 'note', { text: 'لا تغلق الصفحة ولا تستخدمها حتى تنتهي العملية.' });
    const result = h('div', 'msg'); result.hidden = true;
    const actions = h('div', 'actions');
    const closeBtn = h('button', 'x', { type: 'button', 'aria-label': 'إغلاق', title: 'إغلاق' }); closeBtn.appendChild(ICON('close', 18)); closeBtn.hidden = true;
    body.append(head, sub, result, bar, meta, note, actions);
    row.append(ico, body, closeBtn); node.appendChild(row);

    const stopBtn = h('button', 'btn btn-sm btn-secondary', { type: 'button' });
    stopBtn.append(ICON('stop', 16), document.createTextNode('إيقاف'));
    stopBtn.addEventListener('pointerdown', () => { try { st.onStopDown && st.onStopDown(); } catch (_) {} });
    stopBtn.addEventListener('click', () => {
      if (st.stopping) return;
      st.stopping = true; stopBtn.disabled = true; stopBtn.lastChild.textContent = 'جارٍ الإيقاف…';
      try { st.onStop && st.onStop(); } catch (e) { console.warn('[NeprasUI] stop handler failed', e); }
    });

    function setIcon(name, spin) { ico.textContent = ''; const i = ICON(name, 22); if (spin) i.classList.add('spin'); ico.appendChild(i); }
    function setKind(k) { node.className = `card k-${k}` + (node.classList.contains('in') ? ' in' : ''); }

    function paint() {
      title.textContent = st.title || '';
      sub.hidden = !st.subtitle; if (st.subtitle) renderMarkup(sub, st.subtitle);
      const running = st.mode === 'running';
      bar.hidden = meta.hidden = !running; note.hidden = !(running && st.note);
      result.hidden = running || !st.resultText;
      closeBtn.hidden = running; pct.hidden = !running || st.indeterminate;
      if (running) {
        setKind('running'); setIcon('loader', true);
        const known = st.total > 0 && !st.indeterminate;
        const p = known ? Math.max(0, Math.min(100, Math.round((st.current / st.total) * 100))) : 0;
        bar.classList.toggle('indet', !known); fill.style.width = known ? p + '%' : '';
        if (known) bar.setAttribute('aria-valuenow', String(p)); else bar.removeAttribute('aria-valuenow');
        pct.textContent = known ? p + '%' : '';
        count.textContent = known ? `${nf(st.current)} من ${nf(st.total)}` : (st.countText || '');
        eta.textContent = known ? etaText(st) : '';
        if (known && Date.now() - st.lastAnnounce > 8000) { st.lastAnnounce = Date.now(); announce(`${st.title}: ${nf(st.current)} من ${nf(st.total)}`); }
        actions.textContent = ''; if (st.onStop) { actions.appendChild(stopBtn); }
      }
    }

    function clearHide() { if (st.hideTimer) { clearTimeout(st.hideTimer); st.hideTimer = 0; } }

    ctl = {
      id,
      alive: () => cards.get(id) === ctl && node.isConnected,
      update(u) {
        if (!u) return ctl;
        clearHide();
        if (st.mode !== 'running') { st.mode = 'running'; st.kind = 'running'; st.stopping = false; stopBtn.disabled = false; stopBtn.lastChild.textContent = 'إيقاف'; st.startedAt = Date.now(); }
        if (u.title != null) st.title = u.title;
        if (u.subtitle != null) st.subtitle = u.subtitle;
        if (u.current != null) st.current = Number(u.current) || 0;
        if (u.total != null) st.total = Number(u.total) || 0;
        if (u.indeterminate != null) st.indeterminate = !!u.indeterminate; else if (u.total != null) st.indeterminate = !(st.total > 0);
        if (u.countText != null) st.countText = u.countText;
        if ('onStop' in u) st.onStop = typeof u.onStop === 'function' ? u.onStop : null;
        if ('onStopPointerDown' in u) st.onStopDown = typeof u.onStopPointerDown === 'function' ? u.onStopPointerDown : null;
        if (u.note != null) st.note = !!u.note;

        // Auto-finish when progress reaches 100% with completion title: never stay running with spinner & stop button!
        if (st.total > 0 && st.current >= st.total && /تم|اكتمل|نجاح|حفظ|انتهاء/i.test(st.title)) {
          return ctl.finish({
            kind: 'success',
            title: st.title,
            markup: st.subtitle,
            autoHide: 8000
          });
        }

        paint(); return ctl;
      },
      // ينهي العملية: نجاح / تحذير / خطأ / إيقاف — تتحول البطاقة إلى ملخص قابل للإغلاق
      finish(f) {
        const k = kindOf((f && f.kind) || 'success'); clearHide();
        st.mode = 'done'; st.kind = k; st.title = (f && f.title) || st.title; st.subtitle = '';
        st.resultText = (f && (f.message || f.markup)) || ''; 
        if (f && f.markup) renderMarkup(result, f.markup); else result.textContent = (f && f.message) || '';
        setKind(k); setIcon(iconFor(k), false); node.setAttribute('role', k === 'error' ? 'alert' : 'status');
        title.textContent = st.title; sub.hidden = true; bar.hidden = meta.hidden = note.hidden = true; pct.hidden = true;
        result.hidden = !st.resultText; closeBtn.hidden = false;
        actions.textContent = '';
        for (const a of (f && f.actions) || []) actions.appendChild(actionButton(a, 'btn-secondary', () => ctl.close()));
        const ms = f && f.autoHide != null ? f.autoHide : (k === 'error' ? 0 : k === 'warning' ? 20000 : 12000);
        if (ms > 0) st.hideTimer = setTimeout(() => ctl.close(), ms);
        announce(`${st.title}${st.resultText ? '. ' + st.resultText.replace(/<[^>]+>/g, ' ') : ''}`);
        return ctl;
      },
      close(delay) {
        clearHide();
        const go = () => { if (cards.get(id) === ctl) cards.delete(id); node.classList.add('out'); setTimeout(() => node.remove(), 180); };
        if (delay > 0) st.hideTimer = setTimeout(go, delay); else go();
      },
      get mode() { return st.mode; },
      get kind() { return st.kind; },
      get running() { return st.mode === 'running'; },
    };
    closeBtn.addEventListener('click', () => ctl.close());
    cards.set(id, ctl);
    r.progressArea.appendChild(node); enter(node);
    setIcon('loader', true);
    ctl.update(o);
    return ctl;
  }
  const getProgress = (id) => { const c = cards.get(id || 'main'); return c && c.alive() ? c : null; };

  // ------------------------------------------------------------------ dialog
  function copyText(text) {
    const done = () => true;
    try { if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text)); } catch (_) {}
    return Promise.resolve(fallbackCopy(text));
  }
  function fallbackCopy(text) {
    try { const t = document.createElement('textarea'); t.value = text; t.style.cssText = 'position:fixed;top:-9999px'; document.body.appendChild(t); t.select(); const ok = document.execCommand('copy'); t.remove(); return ok; } catch (_) { return false; }
  }

  /* dialog.open({kind,title,subtitle,message|markup|html,note,input,primary,secondary,extra,danger,dismissible,technical})
     يرجع Promise بقيمة الزر المضغوط (primary.value افتراضيها true، secondary.value افتراضيها false)،
     أو النص المُدخل عند وجود input وضغط الزر الرئيسي. */
  function dialog(opts) {
    const o = opts || {};
    const r = ensureHost();
    if (openDialog) {
      try { openDialog.close(undefined, true); } catch (_) {}
    }
    if (r && r.layerDialog) {
      Array.from(r.layerDialog.querySelectorAll('.scrim')).forEach(s => {
        s.style.pointerEvents = 'none';
        try { s.remove(); } catch (_) {}
      });
    }
    return new Promise((resolve) => {
      const kind = kindOf(o.kind);
      const prevFocus = document.activeElement;
      const uid = 'nd' + Math.random().toString(36).slice(2, 8);
      const scrim = h('div', 'scrim');
      const dlg = h('div', 'dialog', { role: (o.secondary || kind === 'error' || kind === 'question') ? 'alertdialog' : 'dialog', 'aria-modal': 'true', 'aria-labelledby': uid + 't', 'aria-describedby': uid + 'm', tabindex: '-1' });
      dlg.classList.add(`k-${kind}`);
      const head = h('div', 'd-head');
      const badge = h('div', 'd-badge'); badge.appendChild(ICON(iconFor(kind), 24));
      const tbox = h('div', 'd-head-text');
      tbox.appendChild(h('div', 'd-title', { id: uid + 't', text: o.title || '' }));
      if (o.subtitle) tbox.appendChild(h('div', 'd-sub', { text: o.subtitle }));
      head.append(badge, tbox);
      if (o.dismissible !== false) {
        const closeX = h('button', 'x', { type: 'button', 'aria-label': 'إغلاق', title: 'إغلاق' });
        closeX.appendChild(ICON('close', 18));
        closeX.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          finish(cancelValue);
        });
        head.appendChild(closeX);
      }
      const body = h('div', 'd-body');
      const msg = h('div', 'd-msg', { id: uid + 'm' });
      if (o.html != null) sanitizeHtmlInto(msg, o.html); else if (o.markup != null) renderMarkup(msg, o.markup); else msg.textContent = o.message || '';
      body.appendChild(msg);
      if (o.note) body.appendChild(h('div', 'd-note', { text: o.note }));

      let inputEl = null, errEl = null;
      if (o.input) {
        const f = h('div', 'field');
        if (o.input.label) f.appendChild(h('label', null, { for: uid + 'i', text: o.input.label }));
        inputEl = h('input', 'input', { id: uid + 'i', type: o.input.type || 'text', placeholder: o.input.placeholder || '', autocomplete: 'off' });
        inputEl.value = o.input.value == null ? '' : String(o.input.value);
        errEl = h('div', 'f-err', { role: 'alert' }); errEl.hidden = true;
        f.append(inputEl, errEl); body.appendChild(f);
        inputEl.addEventListener('input', () => { errEl.hidden = true; inputEl.removeAttribute('aria-invalid'); });
      }
      if (o.technical) {
        const det = h('details', 'tech'); det.appendChild(h('summary', null, { text: 'تفاصيل فنية' }));
        det.appendChild(h('pre', null, { text: typeof o.technical === 'string' ? o.technical : JSON.stringify(o.technical, null, 2) }));
        body.appendChild(det);
      }

      const foot = h('div', 'd-foot');
      let settled = false;
      const finish = (val, silent) => {
        if (settled) return; settled = true; openDialog = null;
        scrim.style.pointerEvents = 'none';
        scrim.style.display = 'none';
        document.removeEventListener('keydown', onKey, true);
        try { scrim.remove(); } catch (_) {}
        if (r && r.layerDialog) {
          try { r.layerDialog.innerHTML = ''; } catch (_) {}
        }
        try { if (prevFocus && prevFocus.focus && !silent) prevFocus.focus(); } catch (_) {}
        resolve(val);
      };
      const cancelValue = o.input ? null : (o.secondary ? (o.secondary.value !== undefined ? o.secondary.value : false) : (o.primary && o.primary.value !== undefined ? o.primary.value : true));
      const mk = (spec, cls, isPrimary) => {
        const b = h('button', `btn ${cls}`, { type: 'button' });
        if (spec.icon) b.appendChild(ICON(spec.icon, 18));
        b.appendChild(document.createTextNode(spec.label));
        b.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (isPrimary && inputEl) {
            const v = inputEl.value;
            const bad = typeof o.input.validate === 'function' ? o.input.validate(v) : (o.input.required && !String(v).trim() ? 'هذا الحقل مطلوب.' : '');
            if (bad) { errEl.textContent = ''; errEl.append(ICON('error', 16), document.createTextNode(bad)); errEl.hidden = false; inputEl.setAttribute('aria-invalid', 'true'); inputEl.focus(); return; }
            finish(v); return;
          }
          try {
            if (spec.onClick) {
              await Promise.resolve(spec.onClick()).catch((err) => console.warn('[NeprasUI] dialog button onClick error:', err));
            }
          } finally {
            finish(spec.value !== undefined ? spec.value : (isPrimary ? true : false));
          }
        });
        return b;
      };
      const prim = o.primary || { label: 'موافق' };
      const primBtn = mk(prim, o.danger ? 'btn-danger' : 'btn-primary', true);
      foot.appendChild(primBtn);
      for (const ex of o.extra || []) foot.appendChild(mk(ex, 'btn-secondary', false));
      if (o.secondary) foot.appendChild(mk(o.secondary, 'btn-secondary', false));
      dlg.append(head, body, foot); scrim.appendChild(dlg); r.layerDialog.appendChild(scrim);

      const focusables = () => Array.from(dlg.querySelectorAll('button:not([disabled]),input,summary,[tabindex]:not([tabindex="-1"])')).filter(e => !e.closest('[hidden]'));
      function onKey(e) {
        if (!scrim.isConnected) return;
        if (e.key === 'Escape') { if (o.dismissible === false) return; e.stopPropagation(); e.preventDefault(); finish(cancelValue); return; }
        if (e.key === 'Enter' && inputEl && (shadow.activeElement === inputEl || (e.composedPath && e.composedPath().includes(inputEl)))) { e.preventDefault(); primBtn.click(); return; }
        if (e.key === 'Tab') {
          const f = focusables(); if (!f.length) return;
          const first = f[0], last = f[f.length - 1], active = shadow.activeElement;
          if (e.shiftKey && (active === first || !dlg.contains(active))) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && (active === last || !dlg.contains(active))) { e.preventDefault(); first.focus(); }
        }
      }
      document.addEventListener('keydown', onKey, true);
      const onBackdrop = (e) => {
        if (o.dismissible === false) return;
        const target = (e.composedPath && e.composedPath()[0]) || e.target;
        if (target === scrim) {
          e.preventDefault();
          e.stopPropagation();
          finish(cancelValue);
        }
      };
      scrim.addEventListener('click', onBackdrop);
      scrim.addEventListener('mousedown', onBackdrop);
      openDialog = { close: (val, silent) => finish(val === undefined ? cancelValue : val, silent) };
      enter(scrim); try { (inputEl || primBtn).focus(); } catch (_) {}
    });
  }
  const closeDialog = () => {
    if (openDialog) {
      try { openDialog.close(); } catch (_) {}
    }
    const r = root();
    if (r && r.layerDialog) {
      try { r.layerDialog.innerHTML = ''; } catch (_) {}
    }
  };

  // ------------------------------------------------------------------ field (داخل مستند النافذة المنبثقة)
  const field = {
    error(el, message, opts) {
      const hidden = !el || (!el.offsetParent && !(el.getClientRects && el.getClientRects().length));
      if (hidden) return toast({ kind: 'warning', title: message, id: 'field-fallback' });
      field.clear(el);
      const id = 'nfm' + Math.random().toString(36).slice(2, 7);
      const msg = h('div', 'n-field-msg', { id, role: 'alert' });
      msg.append(ICON('warning', 16), document.createTextNode(message));
      (el.closest('.field, .form-group, label') || el).insertAdjacentElement(el.closest('.field, .form-group, label') ? 'afterend' : 'afterend', msg);
      el.setAttribute('aria-invalid', 'true'); el.setAttribute('aria-describedby', id); el.__nMsg = msg;
      const clear = () => field.clear(el);
      el.addEventListener('input', clear, { once: true }); el.addEventListener('change', clear, { once: true });
      if (!opts || opts.focus !== false) { try { el.focus({ preventScroll: false }); el.scrollIntoView({ block: 'nearest' }); } catch (_) {} }
      return msg;
    },
    clear(el) {
      if (!el) return;
      if (el.__nMsg) { el.__nMsg.remove(); el.__nMsg = null; }
      el.removeAttribute('aria-invalid'); el.removeAttribute('aria-describedby');
    },
  };

  // ------------------------------------------------------------------ catalog helpers
  function diagnostics(info) {
    let ver = ''; try { ver = chrome.runtime.getManifest().version; } catch (_) {}
    let page = ''; try { page = location.host + location.pathname; } catch (_) {}
    return JSON.stringify({ app: (globalThis.NeprasBrand?.full || 'نبراس — أدوات المدرسة الموحّدة'), version: ver, page, ...info }, null, 2);
  }

  // say('session_missing') → توست أو حوار حسب الطلب
  function say(code, vars, opts) {
    const m = MSG().get(code, vars); const o = opts || {};
    const actions = m.action ? [m.action] : undefined;
    if (o.as === 'dialog') return dialog({ kind: m.kind, title: m.title, message: m.message, primary: { label: m.action ? m.action.label : 'موافق', value: true, onClick: m.action ? () => runAction(m.action) : undefined } });
    return toast({ kind: m.kind, title: m.title, message: m.message, actions, id: o.id });
  }

  // reportError(err) → حوار خطأ مفهوم + تفاصيل فنية مطوية + «نسخ بيانات المشكلة»
  function reportError(err, ctx) {
    const m = MSG().errorToMessage(err, ctx);
    const payload = diagnostics(m.technical);
    let copyBtnLabel = 'نسخ بيانات المشكلة';
    return dialog({
      kind: m.kind === 'info' ? 'info' : 'error', title: m.title, message: m.message, technical: payload,
      primary: m.action ? { label: m.action.label, value: 'action', onClick: () => runAction(m.action) } : { label: 'إغلاق', value: true },
      extra: [{ label: copyBtnLabel, icon: 'copy', value: 'copied', onClick: () => copyText(payload) }],
      secondary: m.action ? { label: 'إغلاق', value: false } : undefined,
    });
  }

  function dismissAll() {
    for (const t of toasts.slice()) removeToast(t, true);
    for (const c of Array.from(cards.values())) c.close();
    closeDialog();
  }

  globalThis.NeprasUI = Object.freeze({
    version: '1.0.0',
    toast, progress, getProgress, dialog: Object.freeze({ open: dialog, close: closeDialog }), field,
    say, reportError, errorToMessage: (e, c) => MSG().errorToMessage(e, c), msg: (c, v) => MSG().get(c, v),
    setTheme, dismissAll, renderMarkup, sanitizeHtmlInto, copyText, diagnostics,
    _host: () => host,
  });
})();
