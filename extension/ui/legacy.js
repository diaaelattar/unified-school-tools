/* legacy.js — محوّلات الدوال القديمة إلى نظام NeprasUI الجديد.
   تبقى showFloatingStatus وneprasShowBulkStatus وneprasShowBulkProgressV1766 وshowToast وneprasNotice
   وneprasDialog.* تعمل كما هي (نحو 250 موضع استدعاء) لكن كلها ترسم عبر NeprasUI.
   الحالة (نجاح/خطأ/تحذير/تقدّم) كانت تُستنتج من نص الرسالة نفسه؛ هنا يحدث الاستنتاج مرة واحدة
   في classify()، ثم تُزال الإيموجي من النص (الأيقونة تأتي من النوع) وتُنظَّف الكلمات التقنية.
   عند نقل كل موضع استدعاء إلى الأكواد (NeprasUI.say / progress) تُحذف هذه الطبقة. */
(() => {
  'use strict';
  if (globalThis.NeprasLegacy) return;
  const UI = () => globalThis.NeprasUI;
  const M = () => globalThis.NeprasMessages;

  // ---- إزالة الإيموجي ----
  const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2B55}\u{2300}-\u{23FF}\u{FE0F}\u{200D}\u{20E3}\u{25A0}-\u{25FF}\u{2190}-\u{21FF}\u{1F000}-\u{1F2FF}]/gu;
  const stripEmoji = (s) => String(s == null ? '' : s).replace(EMOJI, '').replace(/[ \t]{2,}/g, ' ').replace(/^\s+|\s+$/g, '');
  const stripTags = (s) => String(s).replace(/<[^>]+>/g, '');

  // ---- استنتاج الحالة (مرة واحدة) ----
  const RUNNING_LEAD = /^[\s]*(?:⏳|📥|📊|🚀|🟢|🟠|🔄|🔁|⌛|📤|🔎|🔍|📄|📦)/u;
  const STOP_LEAD = /^[\s]*(?:🛑|⏹)/u;
  const WARN_LEAD = /^[\s]*(?:⚠)/u;
  const ERR_LEAD = /^[\s]*(?:❌|⛔|🔴|✖)/u;
  const OK_LEAD = /^[\s]*(?:✅|🎉|✔)/u;
  const WARN_WORDS = /لا توجد|اختر|يرجى|تنبيه|تحذير|غير متاح|لم يتم العثور/;

  function classify(raw, flag) {
    const t = String(raw == null ? '' : raw);
    if (STOP_LEAD.test(t) || /^\s*تم إيقاف/.test(stripEmoji(t))) return 'stopped';
    if (OK_LEAD.test(t)) return 'success';
    if (ERR_LEAD.test(t)) return 'error';
    if (WARN_LEAD.test(t)) return 'warning';
    if (RUNNING_LEAD.test(t)) return 'running';
    if (flag === true) return 'success';
    if (flag === false) return WARN_WORDS.test(t) ? 'warning' : 'error';
    return 'running';
  }

  // ---- تقسيم النص إلى عنوان + تفاصيل ----
  function split(raw) {
    const cleaned = stripEmoji(String(raw == null ? '' : raw).replace(/\r/g, ''));
    const lines = cleaned.split(/<br\s*\/?>|\n/i).map(l => l.trim()).filter(Boolean);
    if (!lines.length) return { title: '', body: '' };
    let title = stripTags(lines[0]).trim(), body = lines.slice(1).join('\n');
    if (!body && title.length > 60) {
      const m = title.match(/^(.{6,90}?[.!؟?])\s+(.+)$/s);
      if (m) { title = m[1].replace(/[.]$/, '').trim(); body = m[2].trim(); }
    }
    return { title: M().friendlyText(title), body: M().friendlyText(body) };
  }

  // ---- حالة عائمة (المسار الرئيسي لكل العمليات الطويلة) ----
  function status(raw, flag, hooks) {
    const h = hooks || {};
    const kind = classify(raw, flag);
    const plain = stripEmoji(stripTags(String(raw)));
    if (kind === 'running') {
      let { title, body } = split(raw);
      let current = null, total = null;
      // «تم: <b>30</b> / <b>200</b>» → شريط تقدّم حقيقي بدل النص
      const re = /^.*<b>\s*(\d+)\s*<\/b>\s*(?:\/|من)\s*<b>\s*(\d+)\s*<\/b>.*$/m;
      const m = body.match(re) || null;
      if (m) { current = +m[1]; total = +m[2]; body = body.split('\n').filter(l => !re.test(l)).join('\n'); }
      UI().progress({
        id: 'main', title, subtitle: body, current: current || 0, total: total || 0, indeterminate: !(total > 0),
        onStop: h.onStop || null, onStopPointerDown: h.onStopPointerDown || null, note: h.note !== false && !!h.onStop,
      });
      return kind;
    }
    let { title, body } = split(raw);
    let k = kind === 'stopped' ? 'info' : kind, actions;
    const cat = (k === 'error' || k === 'warning') ? M().matchLegacy(plain) : null;
    if (cat) { title = cat.title; body = cat.message; k = cat.kind; actions = cat.action ? [cat.action] : undefined; }
    if (kind === 'stopped') k = /حفظ|احتفاظ|الاحتفاظ/.test(body) ? 'success' : 'info';
    const card = UI().getProgress('main');
    if (card && card.running !== undefined) {
      card.finish({ kind: k, title, markup: body, actions, autoHide: h.autoHide });
    } else {
      UI().toast({ kind: k, title, markup: body || undefined, actions, id: 'legacy:' + k });
    }
    return kind;
  }

  // ---- بطاقة تقدّم بأرقام (neprasShowBulkProgressV1766 / showDeepProgressStatus / class reports) ----
  function progress(title, current, total, subtitle, tone, hooks) {
    const h = hooks || {};
    if (tone === 'red') {
      const t = M().friendlyText(stripEmoji(title));
      const card = UI().getProgress('main');
      const f = { kind: 'error', title: t, markup: M().friendlyText(stripEmoji(subtitle || '')), autoHide: 0 };
      if (card) card.finish(f); else UI().toast({ kind: 'error', title: f.title, markup: f.markup || undefined, id: 'legacy:error' });
      return;
    }
    const cNum = Number(current) || 0;
    const tNum = Number(total) || 0;
    const rawTitle = String(title || '');
    const isFinished = tNum > 0 && cNum >= tNum && /تم|اكتمل|نجاح|حفظ|انتهاء/i.test(rawTitle);

    if (isFinished) {
      const card = UI().getProgress('main');
      const f = {
        kind: 'success',
        title: M().friendlyText(stripEmoji(title)),
        markup: M().friendlyText(stripEmoji(subtitle || '')),
        autoHide: h.autoHide || 8000
      };
      if (card && card.finish) {
        card.finish(f);
      } else {
        UI().toast({ kind: 'success', title: f.title, markup: f.markup || undefined, id: 'legacy:success' });
      }
      return;
    }

    UI().progress({
      id: 'main', title: M().friendlyText(stripEmoji(title)), subtitle: M().friendlyText(stripEmoji(subtitle || '')),
      current: cNum, total: tNum, indeterminate: !(tNum > 0),
      onStop: h.onStop || null, onStopPointerDown: h.onStopPointerDown || null, note: h.onStop ? true : false,
    });
  }

  // إخفاء: لا يخفي بطاقة خطأ منتهية (تبقى حتى يغلقها المستخدم أو تُستبدل بعملية جديدة)
  function hide(delay) {
    const c = UI().getProgress('main'); if (!c) return;
    if (c.mode === 'done' && c.kind === 'error') return;
    c.close(Number(delay) || 0);
  }

  // ---- إشعار سريع (neprasNotice / showToast) ----
  function notice(message, type, title, options) {
    const o = options || {};
    const flag = type === 'success' ? true : (type === 'error' ? false : (type === 'warning' ? false : undefined));
    let kind = classify(message, flag);
    if (kind === 'running') kind = type === 'success' ? 'success' : type === 'error' ? 'error' : type === 'warning' ? 'warning' : 'info';
    if (kind === 'stopped') kind = 'info';
    const plain = stripEmoji(stripTags(String(message)));
    let { title: t, body } = split(message);
    const explicit = title && !/^(?:تنبيه|نبراس|إشعار|رسالة)$/.test(String(title).trim()) ? M().friendlyText(stripEmoji(title)) : '';
    if (explicit) { body = [t, body].filter(Boolean).join('\n'); t = explicit; }
    let actions;
    const cat = (kind === 'error' || kind === 'warning') ? M().matchLegacy(plain) : null;
    if (cat) { t = cat.title; body = cat.message; kind = cat.kind; actions = cat.action ? [cat.action] : undefined; }
    if (o.fileInfo && o.fileInfo.fileName && globalThis.neprasDialog) {
      actions = [{ label: 'فتح الملف', icon: 'folder', onClick: () => globalThis.neprasDialog.openGeneratedFile(o.fileInfo) }];
    }
    return UI().toast({ kind, title: t, markup: body || undefined, actions, id: 'n:' + plain.slice(0, 80), duration: o.persistent ? 0 : (o.fileInfo && o.fileInfo.fileName ? 12000 : undefined) });
  }

  globalThis.NeprasLegacy = Object.freeze({ stripEmoji, classify, split, status, progress, hide, notice });
})();
