// ============================================================
// نبراس — منطق «بحث جماعي بالرقم القومي» الصرف (بلا صفحة ولا شبكة)
//
// يقرأ صفوف ورقة Excel (كائنات من sheet_to_json بـ raw:true) ويعيد الأرقام المطلوب البحث عنها.
// فُصل عن popup.js ليُختبر وحده (tests/test_bulk_nid.js). يعتمد على NeprasEgypt وقت الاستدعاء.
//
// قرارات مقصودة (1.2.95):
//  • الأرقام الهندية والفارسية تُحوَّل لا تُحذف (كان «٣١٥…» يصير نصًا فارغًا فيسقط الصف بصمت).
//  • الخلية الرقمية في Excel (30101011234567) تُقرأ عددًا صحيحًا كاملًا؛ كانت تُقرأ نصًّا معروضًا
//    «3.0101E+13» فتُعدّ «غير مكتمل». لذلك يقرأ popup.js الورقة بـ raw:true وتتولى هذه الوحدة التحويل.
//  • الرقم المكرر يُبحث مرة واحدة ويُعدّ في stats.duplicates.
//  • (1.2.97) الصفوف المتجاهَلة (فارغة، مكررة) تُحفظ بأرقام صفوفها في skipped ليراها المستخدم في «مشكلات»،
//    وحلقة البحث (runSearch) صارت هنا بلا صفحة فتُختبر، وتتوقف وحدها بعد 5 أخطاء جلسة متتالية بدل استنفاد بقية الأرقام.
//    ونتيجة الملف تُبنى بتقرير التشغيل الموحّد (modules/run_report.js).
// ============================================================
(function () {
  'use strict';
  if (globalThis.NeprasBulkNid) return;

  function normalizeHeader(h) {
    return String(h ?? '').replace(/\s+/g, '').trim();
  }

  function looksLikeNationalIdHeader(h) {
    const t = normalizeHeader(h).replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه');
    return /قومي|قوميه|nationalid|national_id|nid/i.test(t);
  }

  function looksLikeNameHeader(h) {
    const t = normalizeHeader(h).replace(/[أإآ]/g, 'ا');
    return /اسم|name/i.test(t);
  }

  // قيمة خلية → أرقام لاتينية فقط. العدد الصحيح الكبير يُكتب كاملًا (14 رقمًا تتسع في العدد العشري بلا فقد).
  function extractDigits(v) {
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) return '';
      return String(Math.trunc(Math.abs(v)));
    }
    return globalThis.NeprasEgypt.cleanDigits(v);
  }

  // rawRows: مصفوفة كائنات {عنوان: قيمة} (sheet_to_json بـ defval:"" و raw:true).
  // تعيد { rows, nidHeader, nameHeader, stats:{ total, valid, invalid, blank, duplicates }, skipped }.
  //  rows: [{ rowNo, nationalId, sourceName, valid14 }] — بلا صفوف فارغة ولا مكررة (rowNo = ترتيب الصف في البيانات).
  // ترمي Error بنص عربي إن كانت الورقة فارغة أو لا عمود رقم قومي فيها.
  function parseRows(rawRows) {
    const raw = Array.isArray(rawRows) ? rawRows : [];
    if (!raw.length) throw new Error('الملف فارغ أو لا يحتوي صفوف بيانات.');

    const headers = Object.keys(raw[0] || {});
    let nidHeader = headers.find(looksLikeNationalIdHeader);

    if (!nidHeader) {
      let best = null;
      let bestScore = -1;
      for (const h of headers) {
        let score = 0;
        for (const row of raw.slice(0, Math.min(50, raw.length))) {
          if (/^\d{14}$/.test(extractDigits(row[h]))) score++;
        }
        if (score > bestScore) { bestScore = score; best = h; }
      }
      if (bestScore > 0) nidHeader = best;
    }

    if (!nidHeader) {
      throw new Error('تعذر العثور على عمود يحتوي أرقامًا قومية (14 رقمًا) داخل الملف.');
    }

    const nameHeader = headers.find(looksLikeNameHeader);
    const rows = [];
    const seen = new Set();
    const stats = { total: raw.length, valid: 0, invalid: 0, blank: 0, duplicates: 0 };
    const skipped = []; // [{ rowNo, kind: 'blank'|'duplicate', nationalId, ofRowNo }]
    const firstRow = new Map();

    raw.forEach((row, idx) => {
      const nid = extractDigits(row[nidHeader]);
      if (!nid) { stats.blank += 1; skipped.push({ rowNo: idx + 1, kind: 'blank', nationalId: '', ofRowNo: 0 }); return; }
      if (seen.has(nid)) { stats.duplicates += 1; skipped.push({ rowNo: idx + 1, kind: 'duplicate', nationalId: nid, ofRowNo: firstRow.get(nid) }); return; }
      seen.add(nid);
      firstRow.set(nid, idx + 1);
      const valid14 = /^\d{14}$/.test(nid);
      if (valid14) stats.valid += 1; else stats.invalid += 1;
      rows.push({
        rowNo: idx + 1,
        nationalId: nid,
        sourceName: nameHeader ? String(row[nameHeader] ?? '').trim() : '',
        valid14
      });
    });

    return { rows, nidHeader, nameHeader: nameHeader || '', stats, skipped };
  }

  // سطر ملخص الملف الذي يراه المستخدم بعد اختياره.
  function describeFile(parsed) {
    const s = parsed.stats;
    return `📄 تم العثور على ${parsed.rows.length} رقمًا بالملف` +
      (s.invalid ? ` — ⚠️ ${s.invalid} برقم قومي غير مكتمل (سيُتجاهل)` : '') +
      (s.duplicates ? ` — ${s.duplicates} مكرر دُمج` : '') +
      (s.blank ? ` — ${s.blank} صفًّا بلا رقم` : '') +
      (s.valid ? ` — سيتم البحث عن ${s.valid} طالبًا.` : '');
  }

  const SESSION_FAILURES_LIMIT = 5;
  const SESSION_LOST_MESSAGE = 'انقطعت جلسة بوابة بيانات الطالب: سجّل الدخول إلى البوابة ثم أعد البحث';

  // حلقة البحث بلا صفحة: lookup(nid) تعيد { status: 'found'|'not_found'|'error', data?, reasonCode?, message? } وقد ترمي.
  //  • تتوقف وحدها بعد maxSessionFailures أخطاء جلسة متتالية (reasonCode SESSION_FAILED) بدل أن تُحرق بقية الأرقام خطأً خطأً.
  //  • isStopped() يُسأل قبل كل رقم؛ الرقم الجاري يكتمل.
  // تعيد { results: [{ row, outcome }], stopped, fatalError }.
  async function runSearch(opts) {
    const targets = opts.targets || [];
    const delayMs = opts.delayMs == null ? 350 : opts.delayMs;
    const limit = opts.maxSessionFailures || SESSION_FAILURES_LIMIT;
    const results = [];
    const tally = { found: 0, notFound: 0, error: 0 };
    let fatalError = '';
    let sessionFailures = 0;

    for (let i = 0; i < targets.length; i++) {
      if (opts.isStopped()) break;
      const row = targets[i];
      let outcome;
      try {
        outcome = await opts.lookup(row.nationalId);
      } catch (error) {
        outcome = { status: 'error', reasonCode: 'LOOKUP_FAILED', message: (error && error.message) || String(error) };
      }
      if (outcome.status === 'found') tally.found += 1;
      else if (outcome.status === 'not_found') tally.notFound += 1;
      else tally.error += 1;
      results.push({ row, outcome });
      sessionFailures = outcome.reasonCode === 'SESSION_FAILED' ? sessionFailures + 1 : 0;
      // عطل في عرض التقدّم (واجهة) لا يوقف البحث ولا يُضيّع ما بُحث عنه.
      try { if (opts.onProgress) opts.onProgress(i + 1, targets.length, { ...tally }); } catch (_) { /* العرض لا يملك قرار البحث */ }
      if (sessionFailures >= limit) { fatalError = SESSION_LOST_MESSAGE; break; }
      if (i < targets.length - 1 && !opts.isStopped()) await opts.sleep(delayMs);
    }
    return { results, stopped: !!opts.isStopped(), fatalError };
  }

  const STATUS_LABEL = Object.freeze({ found: 'تم العثور على الطالب', not_found: 'لا يوجد طالب بهذا الرقم', error: 'تعذر البحث' });

  // نتيجة كل سجل بترتيب الملف: من بُحث عنه بنتيجته، والرقم غير المكتمل، ومن لم يصله البحث.
  // تعيد { records, counts } لـNeprasRunReport.build.
  function reportRecords(parsed, results, stopped, fatalError) {
    const RR = globalThis.NeprasRunReport;
    const byNid = new Map();
    (results || []).forEach((r) => byNid.set(r.row.nationalId, r.outcome));
    const leftover = fatalError ? { code: 'INTERRUPTED', label: 'لم يُبحث (انقطع البحث)' } : { code: 'STOPPED_BEFORE', label: 'لم يُبحث (أُوقف البحث)' };
    return parsed.rows.map((row) => {
      const base = { key: row.nationalId, name: row.sourceName, extra: [String(row.rowNo)] };
      if (!row.valid14) return { ...base, kind: 'excluded', label: 'رقم غير مكتمل', reasonCode: 'NID_INCOMPLETE' };
      const o = byNid.get(row.nationalId);
      if (!o) return { ...base, kind: 'unprocessed', label: leftover.label, reasonCode: leftover.code };
      if (o.status === 'found') return { ...base, kind: 'ok', label: STATUS_LABEL.found };
      if (o.status === 'not_found') return { ...base, kind: 'ok', label: STATUS_LABEL.not_found };
      return { ...base, kind: 'failed', label: STATUS_LABEL.error, reasonCode: o.reasonCode || 'LOOKUP_FAILED' };
    });
  }

  // تقرير التشغيل الموحّد للبحث الجماعي (يعتمد NeprasRunReport وقت الاستدعاء).
  function buildReport(ctx) {
    const parsed = ctx.parsed;
    const issues = [];
    for (const s of parsed.skipped || []) {
      issues.push(s.kind === 'blank'
        ? { where: `الصف ${s.rowNo}`, problem: 'خانة الرقم القومي فارغة', effect: 'تُجوهل' }
        : { where: `الصف ${s.rowNo}`, problem: `الرقم ${s.nationalId} مكرر لرقم سبق في الصف ${s.ofRowNo}`, effect: `دُمج مع الصف ${s.ofRowNo}` });
    }
    for (const r of parsed.rows) {
      if (!r.valid14) issues.push({ where: `الصف ${r.rowNo}`, problem: `رقم قومي غير مكتمل: ${r.nationalId}`, effect: 'لم يُبحث عنه' });
    }
    return globalThis.NeprasRunReport.build({
      tool: 'البحث الجماعي بالرقم القومي', fileName: ctx.fileName, startedAt: ctx.startedAt, finishedAt: ctx.finishedAt,
      stopped: ctx.stopped, fatalError: ctx.fatalError,
      keyHeader: 'الرقم القومي', nameHeader: 'الاسم بالملف الأصلي', extraHeaders: ['الصف في Excel'],
      words: { ok: 'تم البحث', failed: 'تعذّر البحث', unprocessed: 'لم يُبحث', excluded: 'رقم غير مكتمل' },
      records: reportRecords(parsed, ctx.results, ctx.stopped, ctx.fatalError), issues
    });
  }

  // ورقة «نتائج البحث»: أعمدتها كما كانت قبل 1.2.97 لمن بُحث عنه (حالة البحث ثم بيانات الطالب أو الملاحظات)،
  // وتُضاف الصفوف التي لم تُبحث (رقم غير مكتمل أو أُوقف البحث قبلها) بحالتها وسببها فلا يغيب سجل من الملف.
  function buildResultsSheet(parsed, results, stopped, fatalError) {
    const RR = globalThis.NeprasRunReport;
    const byNid = new Map();
    (results || []).forEach((r) => byNid.set(r.row.nationalId, r.outcome));
    const rep = reportRecords(parsed, results, stopped, fatalError);
    const hasName = parsed.rows.some((r) => r.sourceName);
    const fields = [['اسم الطالب', 'firstName'], ['كود الطالب', 'stdStudentId'], ['المديرية', 'mudName'], ['الإدارة', 'edaraName'],
      ['المدرسة', 'schoolName'], ['الصف', 'acdYear'], ['الفصل', 'classNumber'], ['حالة القيد', 'resultStatelName']];
    const headers = ['م', 'الرقم القومي', ...(hasName ? ['الاسم بالملف الأصلي'] : []), 'حالة البحث', ...fields.map((f) => f[0]), 'ملاحظات'];
    const rows = parsed.rows.map((row, i) => {
      const rec = rep[i];
      const o = byNid.get(row.nationalId);
      const d = (o && o.status === 'found' && o.data) || {};
      const note = rec.kind === 'ok' ? '' : (RR.reasonText(rec.reasonCode) || (o && o.message) || '');
      return [row.rowNo, row.nationalId, ...(hasName ? [row.sourceName] : []), rec.label, ...fields.map((f) => (d[f[1]] == null ? '' : d[f[1]])), note];
    });
    return { name: 'نتائج البحث', title: 'نتائج البحث الجماعي', headers, rows, recordCount: rows.length, countLabel: 'عدد الأرقام', rightAlignCols: [1], printFit: true };
  }

  globalThis.NeprasBulkNid = Object.freeze({
    extractDigits, looksLikeNationalIdHeader, looksLikeNameHeader, parseRows, describeFile,
    runSearch, buildReport, buildResultsSheet, SESSION_FAILURES_LIMIT
  });
})();
