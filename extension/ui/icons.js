/* icons.js — مجموعة أيقونات SVG واحدة (24×24، خط 2px، أطراف مستديرة) بدل الإيموجي.
   الأيقونة تأخذ لون النص الحالي (currentColor) فتعمل في الفاتح والداكن.
   الاستخدام: NeprasIcons.el('success', {size: 20})  أو  NeprasIcons.svg('download')  */
(() => {
  'use strict';
  if (globalThis.NeprasIcons) return;

  const P = {
    // حالات
    success: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.5"/>',
    error: '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
    warning: '<path d="M12 3.6l9.4 16.2H2.6z"/><path d="M12 10v4.4"/><path d="M12 17.2h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.2"/><path d="M12 7.9h.01"/>',
    question: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.6a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1.1 1-1.1 1.8"/><path d="M12 16.8h.01"/>',
    stopped: '<circle cx="12" cy="12" r="9"/><rect x="9" y="9" width="6" height="6" rx="1"/>',
    // أفعال
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    download: '<path d="M12 4v11"/><path d="M7.5 11l4.5 4.5 4.5-4.5"/><path d="M5 19.5h14"/>',
    upload: '<path d="M12 15.5V4.5"/><path d="M7.5 9L12 4.5 16.5 9"/><path d="M5 19.5h14"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6.5A1.5 1.5 0 0 1 6.5 5H15"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.4-3.6"/><path d="M4.5 4v4h4"/><path d="M4 13a8 8 0 0 0 14.4 3.6"/><path d="M19.5 20v-4h-4"/>',
    stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2"/>',
    bolt: '<path d="M13 3L5 13.5h5.2L11 21l8-11.5h-5.5z"/>',
    play: '<path d="M8 5.5v13l10.5-6.5z"/>',
    trash: '<path d="M4.5 7h15"/><path d="M9.5 7V4.5h5V7"/><path d="M6.5 7l.8 12.5h9.4L17.5 7"/>',
    edit: '<path d="M4 20l1-4L16.5 4.5a2 2 0 0 1 3 3L8 19z"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
    external: '<path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    loader: '<path d="M12 3a9 9 0 1 0 9 9"/>',
    // اتجاهات
    'chevron-down': '<path d="M6 9.5l6 6 6-6"/>',
    'chevron-left': '<path d="M14.5 6l-6 6 6 6"/>',
    'chevron-right': '<path d="M9.5 6l6 6-6 6"/>',
    more: '<circle cx="5.5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18.5" cy="12" r="1.3"/>',
    // ملفات
    file: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/>',
    'file-text': '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/><path d="M10 12.5h5M10 16h5"/>',
    sheet: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/><path d="M9.5 12h6M9.5 15.5h6M12.5 10.5V18"/>',
    folder: '<path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5V17A1.5 1.5 0 0 1 19 18.5H5A1.5 1.5 0 0 1 3.5 17z"/>',
    // مجالات
    users: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><circle cx="17" cy="9.5" r="2.4"/><path d="M16.5 14.2a4.6 4.6 0 0 1 4.5 4.3"/>',
    user: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>',
    school: '<path d="M3 10l9-5.5L21 10"/><path d="M5 10v9.5h14V10"/><path d="M10 19.5V14h4v5.5"/>',
    calendar: '<rect x="4" y="5.5" width="16" height="14.5" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
    chart: '<path d="M5 20V11M11 20V5M17 20v-6"/><path d="M3 20.5h18"/>',
    list: '<path d="M9 7h11M9 12h11M9 17h11"/><path d="M4.5 7h.01M4.5 12h.01M4.5 17h.01"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    home: '<path d="M4 11l8-6.5 8 6.5"/><path d="M6 10v9.5h12V10"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.5 2.6 3.7 5.6 3.7 9s-1.2 6.4-3.7 9c-2.5-2.6-3.7-5.6-3.7-9S9.5 5.6 12 3z"/>',
    whatsapp: '<path d="M4 20l1.4-4.3A8.5 8.5 0 1 1 8.3 18.7z"/><path d="M9.3 8.7c-.4.4-.4 1.2.1 2.1.8 1.5 2.1 2.7 3.7 3.4.9.4 1.6.2 2-.3l.3-.6-1.6-.9-.7.6c-.9-.4-1.7-1.2-2.2-2.1l.6-.7-.8-1.6z"/>',
    facebook: '<path d="M14.2 20.5v-7h2.4l.4-2.9h-2.8V8.9c0-.8.3-1.4 1.5-1.4H17V5c-.3 0-1.2-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.8v1.9H8.7v2.9h2.4v7z"/>',
    chat: '<path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 3.5V17H6.5A2.5 2.5 0 0 1 4 14.5z"/>',
    // إعدادات وواجهة
    settings: '<path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="17" r="2"/>',
    moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.6a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1.1 1-1.1 1.8"/><path d="M12 16.8h.01"/>',
    expand: '<path d="M7 9l5-5 5 5"/><path d="M7 15l5 5 5-5"/>',
    window: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M3.5 9.5h17"/>',
    lock: '<rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>'
  };

  const NS = 'http://www.w3.org/2000/svg';

  function markup(name, opts = {}) {
    const size = Number(opts.size) || 20;
    const inner = P[name] || P.info;
    const cls = ('n-icon' + (opts.cls ? ' ' + opts.cls : '')).trim();
    return `<svg class="${cls}" data-name="${name}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${inner}</svg>`;
  }

  // عنصر DOM جاهز (بدون innerHTML، آمن مع أي سياسة CSP)
  function el(name, opts = {}) {
    const size = Number(opts.size) || 20;
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', ('n-icon' + (opts.cls ? ' ' + opts.cls : '')).trim());
    svg.setAttribute('data-name', name);
    svg.setAttribute('width', size); svg.setAttribute('height', size);
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
    // المحتوى ثابت ومكتوب هنا فقط (ليس من مدخلات المستخدم)
    const tpl = new DOMParser().parseFromString(`<svg xmlns="${NS}">${P[name] || P.info}</svg>`, 'image/svg+xml');
    for (const n of Array.from(tpl.documentElement.childNodes)) svg.appendChild(document.importNode(n, true));
    return svg;
  }

  globalThis.NeprasIcons = Object.freeze({ svg: markup, el, names: Object.freeze(Object.keys(P)) });
})();
