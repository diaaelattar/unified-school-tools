// ============================================================
// نبراس — منطق «قبول ملفات الطلاب الجدد» الصرف (بلا صفحة)
//
// يقرأ مصفوفة ورقة Excel ويعيد قائمة الأكواد المطلوب استلامها والمتجاهَلة والمتعارضة.
// فُصل عن accept_list.js ليُختبر وحده (tests/test_accept_plan.js). يعتمد فقط على NeprasEgypt.
//
// قرارات مقصودة (1.2.95):
//  • ترويسة فارغة أو من حرف أو حرفين لا تُطابَق أبدًا بالاحتواء (كان العمود الفارغ يُختار عمودًا للكود).
//  • المطابقة التامة لأي اسم بديل تسبق مطابقة الاحتواء لأي اسم بديل.
//  • الكود الواحد بحالتين متعارضتين («تم تقديم» و«لم يتم تقديم») لا يُستلم ولا يُتجاهل: يُذكر في conflicts.
//  • حالة غير معروفة ترمي خطأً كما كانت (لا تخمين).
// ============================================================
(function () {
  'use strict';
  if (globalThis.NeprasAcceptPlan) return;

  const toLatin = (v) => globalThis.NeprasEgypt.toLatinDigits(v);

  function clean(v) {
    return String(v ?? '')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function norm(v) {
    return toLatin(clean(v)) // الأرقام من modules/egypt_ids.js (مصدر واحد)
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي')
      .replace(/ؤ/g, 'و')
      .replace(/ئ/g, 'ي')
      .replace(/ـ/g, '')
      .toLowerCase();
  }

  function statusNorm(v) {
    return norm(v).replace(/[._\-]/g, '').replace(/\s+/g, '');
  }

  function normalizeHeader(h) {
    return statusNorm(h).replace(/[()\[\]{}:،,]/g, '');
  }

  // أقصر ترويسة تُقبل في مطابقة الاحتواء. «م» و«#» و«» ترويسات ترقيم لا أسماء أعمدة.
  const MIN_CONTAINS_LEN = 3;

  // فهرس العمود لأول اسم بديل: مطابقة تامة لأي بديل أولًا، ثم احتواء (ترويسة ≥ 3 أحرف). -1 إن لم يوجد.
  function findHeaderIndex(headers, aliases) {
    const hs = (headers || []).map(normalizeHeader);
    const as = (aliases || []).map(normalizeHeader).filter(Boolean);
    for (const a of as) {
      const exact = hs.indexOf(a);
      if (exact >= 0) return exact;
    }
    for (const a of as) {
      const i = hs.findIndex((h) => h.length >= MIN_CONTAINS_LEN && (h.includes(a) || a.includes(h)));
      if (i >= 0) return i;
    }
    return -1;
  }

  function cellString(v) {
    if (v == null) return '';
    if (typeof v === 'number') return String(Math.trunc(v));
    return clean(v);
  }

  // لا نستعمل includes: «لم يتم تقديم الاوراق» تحتوي نصيًا على «تم تقديم الاوراق» بعد إزالة المسافات.
  function isPresentedStatus(value) {
    return statusNorm(value) === 'تمتقديمالاوراق';
  }

  function isNotPresentedStatus(value) {
    return statusNorm(value) === statusNorm('لم يتم تقديم الأوراق');
  }

  const CODE_ALIASES = ['كود الطالب', 'كود التلميذ', 'الكود'];
  const NAME_ALIASES = ['اسم الطالب', 'اسم التلميذ', 'الاسم'];
  const STATUS_ALIASES = ['الحاله', 'الحالة', 'حالة الطالب', 'حالة طلب الطالب', 'حالة الاوراق', 'حالة الأوراق'];

  // اكتشاف صف العناوين، مع تفضيل صف فيه صراحة كود + الحالة.
  function findHeaderRow(matrix) {
    const limit = Math.min(matrix.length, 15);
    for (let i = 0; i < limit; i++) {
      const joined = (matrix[i] || []).map(cellString).map(normalizeHeader).join('|');
      if (joined.includes('كودالطالب') && (joined.includes('الحاله') || joined.includes('الحالة'))) return i;
    }
    for (let i = 0; i < limit; i++) {
      const rowText = (matrix[i] || []).map(cellString).join(' | ');
      if (/كود|الرقم القومي|اسم الطالب|اسم التلميذ/i.test(rowText)) return i;
    }
    return 0;
  }

  // matrix: مصفوفة صفوف (sheet_to_json بـ header:1). تعيد:
  //  { records, targets, ignoredFromExcel, conflicts, allRecords, headers, statusIdx, duplicateCount }
  //  conflicts: [{ code, name, row, statuses }] أكواد بحالتين متعارضتين، مستبعدة من targets وignoredFromExcel.
  //  row: رقم صف أول ظهور للكود في الورقة (1 = أول صف)، ليجده المستخدم في ملفه.
  // ترمي Error بنص عربي: ملف فارغ، لا عمود كود، لا عمود حالة، أو حالة غير معروفة.
  function parseMatrix(matrix) {
    if (!Array.isArray(matrix) || !matrix.length) throw new Error('ملف Excel فارغ.');

    const headerRowIndex = findHeaderRow(matrix);
    const headers = (matrix[headerRowIndex] || []).map(cellString);
    const codeIdx = findHeaderIndex(headers, CODE_ALIASES);
    const nameIdx = findHeaderIndex(headers, NAME_ALIASES);
    const statusIdx = findHeaderIndex(headers, STATUS_ALIASES);

    if (codeIdx < 0) throw new Error('لم أجد عمود «كود الطالب» في ملف Excel.');
    // لا سلوك افتراضي خطر: القرار كله مبني على «الحالة».
    if (statusIdx < 0) throw new Error('لم أجد عمود «الحاله» في ملف Excel. يجب أن يحتوي الملف على حالة كل طالب.');

    const byCode = new Map(); // code → { code, name, kinds:Set, statuses:Set }
    const unknownStatuses = [];

    for (let r = headerRowIndex + 1; r < matrix.length; r++) {
      const row = matrix[r] || [];
      const code = norm(cellString(row[codeIdx])).replace(/\D/g, '');
      if (!code) continue;
      const name = nameIdx >= 0 ? cellString(row[nameIdx]) : '';
      const excelStatus = cellString(row[statusIdx]);

      const presented = isPresentedStatus(excelStatus);
      const notPresented = isNotPresentedStatus(excelStatus);
      if (!presented && !notPresented) unknownStatuses.push({ code, name, excelStatus });

      let e = byCode.get(code);
      if (!e) { e = { code, name, firstRow: r + 1, kinds: new Set(), statuses: new Set(), rows: 0 }; byCode.set(code, e); }
      e.rows += 1;
      if (!e.name && name) e.name = name;
      if (presented) e.kinds.add('receive');
      if (notPresented) e.kinds.add('ignore');
      e.statuses.add(excelStatus);
    }

    if (unknownStatuses.length) {
      const sample = unknownStatuses.slice(0, 3)
        .map((x) => `${x.code}${x.name ? ` (${x.name})` : ''}: ${x.excelStatus || 'فارغ'}`)
        .join(' — ');
      throw new Error(`وجدت حالات غير معروفة في Excel (${unknownStatuses.length}). راجع: ${sample}`);
    }

    const targets = [];
    const ignoredFromExcel = [];
    const conflicts = [];
    const allRecords = [];
    let duplicateCount = 0;
    for (const e of byCode.values()) {
      const base = { code: e.code, name: e.name, row: e.firstRow };
      if (e.kinds.has('receive') && e.kinds.has('ignore')) {
        conflicts.push({ ...base, statuses: Array.from(e.statuses) });
        continue;
      }
      duplicateCount += e.rows - 1; // المكرر المدموج فقط؛ صفوف الكود المتعارض مستبعدة كلها وتُذكر في conflicts
      const rec = e.kinds.has('receive')
        ? { ...base, excelStatus: Array.from(e.statuses)[0], shouldReceive: true, shouldIgnore: false }
        : { ...base, excelStatus: Array.from(e.statuses)[0], shouldReceive: false, shouldIgnore: true };
      allRecords.push(rec);
      (rec.shouldReceive ? targets : ignoredFromExcel).push(rec);
    }

    return { records: targets, targets, ignoredFromExcel, conflicts, allRecords, headers, statusIdx, duplicateCount };
  }

  // سطر ملخص الاستيراد الذي يراه المستخدم (يذكر المتعارض والمكرر إن وُجدا).
  function describeImport(fileName, parsed) {
    const parts = [
      `${fileName}`,
      `إجمالي Excel: ${parsed.allRecords.length + parsed.conflicts.length}`,
      `مطلوب استلام: ${parsed.targets.length}`,
      `تجاهل «لم يتم تقديم الاوراق»: ${parsed.ignoredFromExcel.length}`
    ];
    if (parsed.duplicateCount) parts.push(`مكرر دُمج: ${parsed.duplicateCount}`);
    let text = `✅ ${parts.join(' — ')}`;
    let tone = 'ok';
    if (parsed.conflicts.length) {
      const sample = parsed.conflicts.slice(0, 5).map((c) => c.code).join('، ');
      text += ` — ⚠️ ${parsed.conflicts.length} كودًا بحالتين متعارضتين لن يُعالَجوا: ${sample}${parsed.conflicts.length > 5 ? '…' : ''}`;
      tone = 'warn';
    }
    return { text, tone };
  }

  // تقرير التشغيل الموحّد لنتيجة قبول الملفات (يعتمد NeprasRunReport وقت الاستدعاء).
  // ctx: { fileName, parsed (ناتج parseMatrix)، done[]، skipped[] (مستلم بالفعل)، errors[] (reason)، notFound[]،
  //        stopped, fatalError, startedAt, finishedAt }
  // كل سجل في الملف يظهر مرة واحدة بترتيب صفوف Excel: استُلم الآن، مستلم بالفعل، فشل، لم يُعالَج، تجاهل (لم يتم تقديم)، مستبعد (تعارض).
  function buildReport(ctx) {
    const RR = globalThis.NeprasRunReport;
    const p = ctx.parsed || {};
    const leftoverReason = ctx.fatalError ? 'INTERRUPTED' : ctx.stopped ? 'STOPPED_BEFORE' : 'NOT_FOUND_IN_PAGES';
    const leftoverLabel = ctx.fatalError ? 'لم يُعالَج (انقطعت العملية)' : ctx.stopped ? 'لم يُعالَج (أُوقفت العملية)' : 'لم يُعثر عليه في الصفحات';

    const result = new Map();
    (ctx.done || []).forEach((r) => result.set(r.code, { kind: 'ok', label: 'استُلم الآن' }));
    (ctx.skipped || []).forEach((r) => result.set(r.code, { kind: 'skipped', label: 'مستلم بالفعل', reasonCode: r.reason || 'ALREADY_RECEIVED' }));
    (ctx.errors || []).forEach((r) => result.set(r.code, { kind: 'failed', label: 'فشل', reasonCode: r.reason || 'UNKNOWN' }));
    (ctx.notFound || []).forEach((r) => result.set(r.code, { kind: 'unprocessed', label: leftoverLabel, reasonCode: leftoverReason }));

    const entries = [];
    for (const r of p.targets || []) {
      const res = result.get(r.code) || { kind: 'unprocessed', label: leftoverLabel, reasonCode: leftoverReason };
      entries.push({ row: r.row, rec: { key: r.code, name: r.name, ...res, extra: [String(r.row || ''), r.excelStatus || ''] } });
    }
    for (const r of p.ignoredFromExcel || []) {
      entries.push({ row: r.row, rec: { key: r.code, name: r.name, kind: 'ignored', label: 'تجاهل: لم يتم تقديم الاوراق', reasonCode: 'NOT_PRESENTED_IN_EXCEL', extra: [String(r.row || ''), r.excelStatus || ''] } });
    }
    for (const c of p.conflicts || []) {
      entries.push({ row: c.row, rec: { key: c.code, name: c.name, kind: 'excluded', label: 'مستبعد: حالتان متعارضتان', reasonCode: 'CONFLICT_STATUS', extra: [String(c.row || ''), (c.statuses || []).join(' / ')] } });
    }
    entries.sort((a, b) => (a.row || 0) - (b.row || 0));

    const notes = [];
    if (p.duplicateCount) notes.push(`${p.duplicateCount} صفًّا مكررًا بالحالة نفسها دُمج مع أول ظهور للكود`);
    if (ctx.stopped && !ctx.fatalError) notes.push('أوقف المستخدم العملية؛ يمكن إعادة التشغيل بالملف نفسه (المستلمون سلفًا يُتخطّون ولا يتكررون)');

    return RR.build({
      tool: 'قبول ملفات الطلاب الجدد', fileName: ctx.fileName, startedAt: ctx.startedAt, finishedAt: ctx.finishedAt,
      stopped: ctx.stopped, fatalError: ctx.fatalError,
      keyHeader: 'كود الطالب', nameHeader: 'اسم الطالب', extraHeaders: ['الصف في Excel', 'الحالة في Excel'],
      words: { ok: 'استُلم الآن', skipped: 'مستلم بالفعل', ignored: 'تجاهل (لم يتم تقديم)', failed: 'فشل', unprocessed: 'لم يُعالَج', excluded: 'مستبعد (تعارض)' },
      records: entries.map((e) => e.rec), notes
    });
  }

  globalThis.NeprasAcceptPlan = Object.freeze({
    clean, norm, statusNorm, normalizeHeader, findHeaderIndex, isPresentedStatus, isNotPresentedStatus, parseMatrix, describeImport, buildReport
  });
})();
