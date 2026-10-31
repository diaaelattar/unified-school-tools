// ============================================================
// نبراس — تقرير التشغيل الموحّد (منطق صرف بلا صفحة ولا شبكة)
//
// كل أداة تنفّذ عملًا على سجلات (طلاب، أرقام قومية، …) تنتهي بنتيجة واحدة الشكل:
//   الحالة (اكتمل / تحذير / متوقف / فشل) + العدّادات + ملف Excel: ملخص، نتيجة كل سجل، مشكلات.
// فُصل هذا عن الأدوات ليُختبر وحده (tests/test_run_report.js) ولتتفق الأدوات على معنى كلمة «اكتمل».
//
// قرارات مقصودة (1.2.97):
//  • «اكتمل» لا تُقال إلا إن لم يفشل سجل ولم يبقَ سجل بلا معالجة ولم يُستبعد سجل لعيب فيه.
//  • «فشل» إن لم ينجح أي سجل ولم يُتخطَّ أي سجل لأنه على الحال المطلوبة (جلسة منتهية، صفحة تغيّرت…)، أو انقطع التنفيذ بخطأ.
//  • السجل «المتجاهَل عمدًا» (خارج نطاق العمل، مثل «لم يتم تقديم الاوراق») محايد: يظهر في الملف ولا يغيّر الحالة، ولا يُعدّ نجاحًا.
//  • «متوقف» فقط إن أوقفه المستخدم وبقي سجل بلا معالجة؛ الإيقاف عند آخر سجل يُحسب بنتيجته الفعلية.
//  • سبب كل سجل بالعربية من جدول واحد (REASONS)؛ الرمز التقني يبقى في عمود «للدعم الفني» فقط لمن يراسل المطوّر.
//  • لا تُقرأ الساعة هنا: الأداة تمرّر وقتي البدء والانتهاء.
// ============================================================
(function () {
  'use strict';
  if (globalThis.NeprasRunReport) return;

  // نوع نتيجة السجل: ok نجح، skipped تُخطّي لأنه على الحال المطلوبة أصلًا، ignored خارج نطاق العمل عمدًا (محايد: لا يُعدّ نجاحًا ولا مشكلة)،
  // failed فشل، unprocessed لم تصله العملية، excluded استُبعد قبل التشغيل لعيب فيه.
  const KINDS = Object.freeze(['ok', 'skipped', 'ignored', 'failed', 'unprocessed', 'excluded']);
  const STATUS = Object.freeze({ done: 'اكتمل', warn: 'تحذير', stopped: 'متوقف', failed: 'فشل' });
  const DEFAULT_WORDS = Object.freeze({ ok: 'نجح', skipped: 'تُخطّي', ignored: 'تُجوهل عمدًا', failed: 'فشل', unprocessed: 'لم يُعالَج', excluded: 'مستبعد' });

  // سجل الأسباب بالعربية (I2): رمز تقني ← جملة يفهمها المستخدم وتقول ما يفعل.
  const REASONS = Object.freeze({
    // قبول ملفات الطلاب الجدد
    ALREADY_RECEIVED: 'مستلم بالفعل قبل التشغيل، فلم يُعدَّل',
    NOT_PRESENTED_IN_EXCEL: 'حالته في Excel «لم يتم تقديم الاوراق»: تُجوهل عمدًا',
    CONFLICT_STATUS: 'كود مكرر في Excel بحالتين متعارضتين: لم يُعالَج، راجع الملف',
    NOT_FOUND_IN_PAGES: 'لم يظهر كوده في أي صفحة من الجدول',
    STOPPED_BEFORE: 'أُوقفت العملية قبل الوصول إليه',
    INTERRUPTED: 'انقطعت العملية بخطأ قبل الوصول إليه',
    INTERRUPTED_IN_FLIGHT: 'انقطعت العملية أثناء معالجته: قد يكون استُلم فعلًا، راجع حالته في الصفحة',
    RECEIVE_BUTTON_NOT_FOUND: 'زر «استلام الاوراق» غير ظاهر لهذا الطالب',
    RECEIVE_CLICK_FAILED: 'تعذّر الضغط على زر الاستلام',
    CONFIRM_MODAL_NOT_APPEARED: 'لم تظهر نافذة التأكيد بعد الضغط على الاستلام',
    CONFIRM_BUTTON_NOT_FOUND: 'ظهرت نافذة التأكيد ولم يوجد فيها زر «تاكيد»',
    CONFIRM_CLICK_FAILED: 'تعذّر الضغط على زر التأكيد',
    SUCCESS_MODAL_NOT_APPEARED: 'لم تظهر رسالة «تم تحديث البيانات بنجاح» بعد التأكيد',
    SUCCESS_OK_BUTTON_NOT_FOUND: 'ظهرت رسالة النجاح ولم يوجد فيها زر «حسنا»',
    OK_CLICK_FAILED: 'تعذّر الضغط على «حسنا»',
    SAVE_STATE_NOT_CONFIRMED: 'لم تتغير حالة الطالب في الصفحة بعد الحفظ: راجعه يدويًا قبل أن تعيد',
    RETRY_ROW_NOT_FOUND: 'اختفى صف الطالب من الصفحة أثناء إعادة المحاولة',
    UNKNOWN: 'سبب غير معروف',
    // البحث الجماعي بالرقم القومي
    NID_INCOMPLETE: 'الرقم القومي غير مكتمل (ليس 14 رقمًا): لم يُبحث عنه',
    SESSION_FAILED: 'تعذّر الاتصال بجلسة بوابة بيانات الطالب',
    LOOKUP_FAILED: 'تعذّر تنفيذ البحث لهذا الرقم'
  });

  const UNCLASSIFIED = 'سبب غير مصنّف';

  function reasonText(code) {
    if (!code) return '';
    return Object.prototype.hasOwnProperty.call(REASONS, code) ? REASONS[code] : UNCLASSIFIED;
  }

  function emptyCounts() {
    return { total: 0, ok: 0, skipped: 0, ignored: 0, failed: 0, unprocessed: 0, excluded: 0 };
  }

  // flags: { stopped, fatalError, severeIssues }
  function decideStatus(counts, flags) {
    const f = flags || {};
    const c = counts || emptyCounts();
    if (f.fatalError) return 'failed';
    if (f.stopped && c.unprocessed > 0) return 'stopped';
    if (c.total - c.ignored === 0) return 'warn'; // لا سجلات، أو كلها خارج النطاق عمدًا: لا شيء يُعالَج
    if (c.ok === 0 && c.skipped === 0) return 'failed';
    if (c.failed > 0 || c.unprocessed > 0 || c.excluded > 0 || f.severeIssues > 0) return 'warn';
    return 'done';
  }

  function pad2(n) { return String(n).padStart(2, '0'); }

  function toDate(v) {
    if (v == null || v === '') return null;
    const d = v instanceof Date ? v : new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function formatClock(v) {
    const d = toDate(v);
    if (!d) return '';
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  function formatDuration(ms) {
    if (!Number.isFinite(ms) || ms < 0) return '';
    const totalSec = Math.round(ms / 1000);
    if (totalSec < 1) return 'أقل من ثانية';
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const parts = [];
    if (h) parts.push(`${h} ساعة`);
    if (m) parts.push(`${m} دقيقة`);
    if (s && !h) parts.push(`${s} ثانية`);
    return parts.join(' و');
  }

  function countsLine(counts, words) {
    if (!counts.total) return 'لا توجد سجلات';
    const parts = [];
    for (const k of KINDS) if (counts[k]) parts.push(`${words[k]} ${counts[k]}`);
    return parts.join(' — ');
  }

  function cleanCell(v) {
    return v == null ? '' : String(v);
  }

  // input: { tool, fileName, startedAt, finishedAt, stopped, fatalError, keyHeader, nameHeader, extraHeaders, words, records, issues, notes }
  //   records: [{ key, name, kind, label, reasonCode, extra: [] }]  (الترتيب كما في ملف المستخدم)
  //   issues:  [{ where, problem, effect, severe }]
  // ترمي Error بنص عربي إن كان الإدخال ناقصًا (خطأ برمجي لا يراه المستخدم عادةً).
  function build(input) {
    const inp = input || {};
    if (!inp.tool) throw new Error('تقرير التشغيل يحتاج اسم الأداة.');
    const words = { ...DEFAULT_WORDS, ...(inp.words || {}) };
    const nameHeader = inp.nameHeader === undefined ? 'الاسم' : inp.nameHeader;
    const extraHeaders = Array.isArray(inp.extraHeaders) ? inp.extraHeaders.slice() : [];

    const counts = emptyCounts();
    const labelOrder = [];
    const labelCounts = new Map();
    const records = (Array.isArray(inp.records) ? inp.records : []).map((r, i) => {
      if (!KINDS.includes(r && r.kind)) throw new Error(`نوع نتيجة غير معروف في السجل ${i + 1}: ${r && r.kind}`);
      counts.total += 1;
      counts[r.kind] += 1;
      const label = cleanCell(r.label);
      if (label) {
        if (!labelCounts.has(label)) { labelCounts.set(label, 0); labelOrder.push(label); }
        labelCounts.set(label, labelCounts.get(label) + 1);
      }
      const extra = Array.isArray(r.extra) ? r.extra.map(cleanCell) : [];
      while (extra.length < extraHeaders.length) extra.push('');
      return {
        key: cleanCell(r.key), name: cleanCell(r.name), kind: r.kind, label,
        reasonCode: cleanCell(r.reasonCode), reason: reasonText(r.reasonCode), extra
      };
    });

    const issues = (Array.isArray(inp.issues) ? inp.issues : []).map((x) => ({
      where: cleanCell(x.where), problem: cleanCell(x.problem), effect: cleanCell(x.effect), severe: !!x.severe
    }));

    const stopped = !!inp.stopped;
    const fatalError = inp.fatalError ? cleanCell(inp.fatalError) : '';
    const status = decideStatus(counts, { stopped, fatalError, severeIssues: issues.filter((x) => x.severe).length });

    const started = toDate(inp.startedAt);
    const finished = toDate(inp.finishedAt);
    const durationMs = started && finished ? Math.max(0, finished.getTime() - started.getTime()) : null;

    const line = countsLine(counts, words);
    const headline = fatalError && !counts.total
      ? `${STATUS[status]} — ${fatalError}`
      : `${STATUS[status]} — ${line}${fatalError ? ` — توقف بخطأ: ${fatalError}` : ''}`;

    return {
      tool: cleanCell(inp.tool), fileName: cleanCell(inp.fileName),
      status, statusLabel: STATUS[status], counts, countsLine: line, headline, words,
      labelCounts: labelOrder.map((l) => [l, labelCounts.get(l)]),
      records, issues, notes: (Array.isArray(inp.notes) ? inp.notes : []).map(cleanCell).filter(Boolean),
      stopped, fatalError, startedAt: started, finishedAt: finished, durationMs,
      keyHeader: inp.keyHeader || 'المعرّف', nameHeader, extraHeaders
    };
  }

  function summaryRows(report) {
    const rows = [['الأداة', report.tool], ['الحالة', report.statusLabel]];
    if (report.fileName) rows.push(['الملف', report.fileName]);
    if (report.startedAt) rows.push(['بدأ', formatClock(report.startedAt)]);
    if (report.finishedAt) rows.push(['انتهى', formatClock(report.finishedAt)]);
    if (report.durationMs != null) rows.push(['المدة', formatDuration(report.durationMs)]);
    if (report.fatalError) rows.push(['سبب التوقف', report.fatalError]);
    rows.push(['إجمالي السجلات', report.counts.total]);
    for (const k of KINDS) rows.push([report.words[k], report.counts[k]]);
    if (report.labelCounts.length) {
      rows.push(['تفصيل النتائج', '']);
      for (const [label, n] of report.labelCounts) rows.push([`   ${label}`, n]);
    }
    for (const n of report.notes) rows.push(['ملاحظة', n]);
    return rows;
  }

  function recordsSheet(report) {
    const headers = [report.keyHeader];
    if (report.nameHeader) headers.push(report.nameHeader);
    headers.push('النتيجة', 'السبب', ...report.extraHeaders, 'للدعم الفني');
    const rows = report.records.map((r) => {
      const row = [r.key];
      if (report.nameHeader) row.push(r.name);
      row.push(r.label, r.reason, ...r.extra, r.reasonCode);
      return row;
    });
    return { name: 'نتيجة كل سجل', title: 'نتيجة كل سجل', headers, rows, recordCount: rows.length, countLabel: 'عدد السجلات', rightAlignCols: [0], printFit: true };
  }

  // أوراق التقرير بالترتيب: ملخص، نتيجة كل سجل (أو ورقة الأداة نفسها عبر opts.recordsSheet)، ثم المشكلات إن وُجدت.
  function sheets(report, opts) {
    const o = opts || {};
    const sum = summaryRows(report);
    const out = [{ name: 'ملخص', title: `ملخص: ${report.tool}`, headers: ['البند', 'القيمة'], rows: sum, recordCount: sum.length, countLabel: 'عدد البنود', rightAlignCols: [0], printFit: true }];
    out.push(o.recordsSheet || recordsSheet(report));
    if (report.issues.length) {
      const rows = report.issues.map((x) => [x.where, x.problem, x.effect]);
      out.push({ name: 'مشكلات', title: 'مشكلات في الملف أو التنفيذ', headers: ['الموضع', 'المشكلة', 'الأثر'], rows, recordCount: rows.length, countLabel: 'عدد المشكلات', rightAlignCols: [1], printFit: true });
    }
    return out;
  }

  function safeSheetName(name, used) {
    let base = String(name || '').replace(/[\[\]:*?\/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'بيانات';
    let candidate = base;
    for (let i = 2; used.has(candidate); i++) {
      const suffix = ` ${i}`;
      candidate = base.slice(0, 31 - suffix.length) + suffix;
    }
    used.add(candidate);
    return candidate;
  }

  // مصنّف بسيط من مكتبة SheetJS تمرّرها الأداة بعد أن تحمّلها بنفسها (neprasEnsureLib في الصفحة، وXLSX الجاهزة في النافذة)؛ هذه الوحدة لا تحمّل شيئًا. RTL وعرض أعمدة.
  function buildWorkbook(lib, sheetSpecs) {
    const wb = lib.utils.book_new();
    wb.Workbook = wb.Workbook || {};
    wb.Workbook.Views = [{ RTL: true }];
    const used = new Set();
    for (const s of sheetSpecs) {
      const aoa = [s.headers, ...s.rows];
      const ws = lib.utils.aoa_to_sheet(aoa);
      ws['!cols'] = s.headers.map((h, c) => {
        let w = String(h).length;
        for (const row of s.rows) w = Math.max(w, String(row[c] == null ? '' : row[c]).length);
        return { wch: Math.min(60, Math.max(10, w + 2)) };
      });
      lib.utils.book_append_sheet(wb, ws, safeSheetName(s.name, used));
    }
    return wb;
  }

  globalThis.NeprasRunReport = Object.freeze({
    KINDS, STATUS, REASONS, reasonText, decideStatus, build, sheets, buildWorkbook, formatClock, formatDuration
  });
})();
