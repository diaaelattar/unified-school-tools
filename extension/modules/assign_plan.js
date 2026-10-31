/**
 * نبراس — منطق التسكين الصرف (1.2.94): فحص ملف Excel، مطابقة الصف والفصل بأسماء الموقع، خطة النقل، فحص السعة، ومطابقة النتيجة.
 *
 * لا يلمس الصفحة ولا يعتمد إلا على NeprasEgypt.toLatinDigits (modules/egypt_ids.js)، فيُختبر في Node بلا متصفح (tests/test_assign_plan.js).
 * modules/auto_assign.js يقرأ الجداول من صفحة الوزارة ويسلّم لقطة لهذه الوحدة، ثم ينفّذ الخطة التي تعيدها.
 *
 * شكل اللقطة (snapshot) التي تُبنى منها الخطة:
 *   { levels: [ { value, text, targetOptions: [{value,text}] | null,
 *                 classes: [ { value, text, students: [ { code, name } ] } ] } ] }
 * targetOptions: خيارات قائمة «الفصل المراد تسكينه» كما قُرئت من الصفحة؛ فإن غابت يُطابَق الفصل الهدف مع classes.
 *
 * ما تحسمه هذه الوحدة (وكان بلا حسم قبل 1.2.94): أرقام عربية في الأكواد والأسماء، تكرار الكود (متطابق أو متعارض)،
 * صف أو فصل غير موجود في الموقع، طالب في صف آخر، سعة الفصل (50 في الموقع)، وترتيب النقل بحيث يفرّغ ما يخرج مكانًا لما يدخل.
 */
(function () {
  'use strict';
  if (globalThis.NeprasAssignPlan) return;

  const SITE_CLASS_CAPACITY = 50;

  // ---------- نصوص ----------
  // الأرقام العربية والفارسية ← لاتينية: مصدر واحد هو modules/egypt_ids.js (يُحقن قبل هذا الملف).
  function latinDigits(v) {
    return globalThis.NeprasEgypt.toLatinDigits(v);
  }

  function clean(v) {
    return String(v ?? '').replace(/[\u200e\u200f\u202a-\u202e ]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // توحيد الهمزات والياء والتاء المربوطة وحذف التشكيل والتطويل وتحويل الأرقام العربية: للمقارنة فقط.
  function normText(v) {
    return latinDigits(clean(v))
      .replace(/[ً-ٰٟـ]/g, '')
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .toLowerCase();
  }

  // كود الطالب كما يظهر في الموقع: أرقام لاتينية بلا مسافات ولا «.0» ولا علامة النص التي يضيفها Excel.
  function normalizeCode(v) {
    if (v == null) return '';
    let s = typeof v === 'number' ? (Number.isFinite(v) ? String(v) : '') : latinDigits(v);
    s = s.replace(/[\u200e\u200f\u202a-\u202e \s]+/g, '').replace(/^'+/, '').replace(/\.0+$/, '');
    return s;
  }

  function isValidCode(code) {
    return /^\d{4,15}$/.test(code);
  }

  // ---------- مفاتيح مطابقة مرنة للصف والفصل ----------
  const STAGE_WORDS = new Set(['الابتدائي', 'ابتدائي', 'الابتدائيه', 'ابتدائيه', 'الاعدادي', 'اعدادي', 'الاعداديه', 'اعداديه',
    'الثانوي', 'ثانوي', 'الثانويه', 'ثانويه', 'الفني', 'فني', 'الاساسي', 'اساسي', 'العام', 'الدراسي']);
  const ORDINALS = { اول: 1, الاول: 1, اولي: 1, الاولي: 1, ثاني: 2, الثاني: 2, ثانيه: 2, الثانيه: 2, ثالث: 3, الثالث: 3, ثالثه: 3, الثالثه: 3,
    رابع: 4, الرابع: 4, رابعه: 4, الرابعه: 4, خامس: 5, الخامس: 5, خامسه: 5, الخامسه: 5, سادس: 6, السادس: 6, سادسه: 6, السادسه: 6 };

  function tokensOf(text) {
    return normText(text).replace(/[()[\]\-–—_.,:؛،]/g, ' ').split(/\s+/).filter(Boolean);
  }

  // «الصف الأول الإعدادي» و«الأول» و«1» و«١» ← «1».
  function levelKey(text) {
    const toks = tokensOf(text).filter((t) => t !== 'الصف' && t !== 'صف' && !STAGE_WORDS.has(t));
    if (toks.length === 1) {
      if (Object.prototype.hasOwnProperty.call(ORDINALS, toks[0])) return String(ORDINALS[toks[0]]);
      if (/^\d+$/.test(toks[0])) return String(Number(toks[0]));
    }
    return toks.join(' ');
  }

  // «فصل 1» و«الفصل (1)» و«01» و«١» ← «1».
  function classKey(text) {
    const toks = tokensOf(text).filter((t) => t !== 'الفصل' && t !== 'فصل' && t !== 'رقم');
    if (toks.length === 1 && /^\d+$/.test(toks[0])) return String(Number(toks[0]));
    return toks.join(' ');
  }

  function isPlaceholderOption(o) {
    const value = String(o?.value ?? '').trim();
    return value === '' || value === '-1' || /^(اختر|--)/.test(clean(o?.text));
  }

  /**
   * يطابق نصًّا من Excel مع خيارات قائمة في الموقع بأربع درجات من الأشد إلى الأخف:
   * (1) النص كما هو بعد التوحيد (2) القيمة (3) المفتاح المرن (levelKey/classKey).
   * تعدد الخيارات عند أول درجة تصيب = غموض (لا اختيار بالتخمين). يعيد { option, tier } أو { option: null, reason }.
   */
  function resolveOption(options, wanted, keyFn) {
    const list = (options || []).filter((o) => o && !isPlaceholderOption(o));
    const w = normText(wanted);
    if (!w) return { option: null, reason: 'empty' };
    const wantedKey = keyFn(wanted);
    const tiers = [
      (o) => normText(o.text) === w,
      (o) => normText(o.value) === w,
      (o) => !!wantedKey && keyFn(o.text) === wantedKey
    ];
    for (let t = 0; t < tiers.length; t++) {
      const hits = list.filter(tiers[t]);
      if (!hits.length) continue;
      if (new Set(hits.map((h) => String(h.value))).size === 1) return { option: hits[0], tier: t + 1 };
      return { option: null, reason: 'ambiguous', candidates: hits };
    }
    return { option: null, reason: 'none' };
  }

  // ---------- أعمدة الملف ----------
  const ROLE_SCORES = {
    code(h) {
      if (/قومي|هويه|موبايل|هاتف|تليفون/.test(h)) return 0;
      if (/^كود( ال?(طالب|تلميذ))?$/.test(h)) return 10;
      if (/كود/.test(h)) return 8;
      if (/رقم (القيد|الطالب|التلميذ)/.test(h)) return 6;
      if (/^(student ?)?code$/.test(h)) return 9;
      return 0;
    },
    targetClass(h) {
      if (!/فصل/.test(h) && !/class/.test(h)) return 0;
      let s = 5;
      if (/جديد|مستهدف|هدف|المراد|المطلوب|التسكين|النقل|الي /.test(h)) s += 5;
      if (/حالي|قديم|اصلي|سابق|مصدر|الحاليه/.test(h)) s -= 6;
      if (/^(ال)?فصل$/.test(h)) s += 1;
      return s;
    },
    level(h) {
      if (/فصل/.test(h)) return 0;
      if (!/صف|مستوي|الفرقه|grade|level/.test(h)) return 0;
      let s = 5;
      if (/^(ال)?صف( الدراسي)?$/.test(h)) s += 3;
      if (/حالي|قديم|اصلي|سابق/.test(h)) s -= 1;
      return s;
    }
  };

  /**
   * يختار عمود الكود والفصل الهدف والصف من عناوين الملف بدرجات، ولا يعطي عمودًا واحدًا لدورين.
   * ambiguous: أدوار تقارب فيها أفضل عمودين (مثل «الفصل الحالي» و«الفصل الجديد» معًا) فينبّه المستخدم ليتأكد.
   */
  function detectColumns(headers) {
    const list = (headers || []).map((h) => ({ header: h, n: normText(h) }));
    const cols = { code: '', targetClass: '', level: '' };
    const ambiguous = [];
    const used = new Set();
    for (const role of ['code', 'targetClass', 'level']) {
      const scored = list
        .filter((x) => !used.has(x.header))
        .map((x) => ({ header: x.header, score: ROLE_SCORES[role](x.n) }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score);
      if (!scored.length) continue;
      cols[role] = scored[0].header;
      used.add(scored[0].header);
      if (scored[1] && scored[1].score >= scored[0].score - 1) ambiguous.push({ role, candidates: scored.slice(0, 3).map((x) => x.header) });
    }
    return { ...cols, ambiguous };
  }

  // ---------- قراءة صفوف الملف ----------
  const ISSUE_TEXT = {
    missing_code: 'كود الطالب فارغ',
    invalid_code: 'كود الطالب غير صالح (يجب أن يكون أرقامًا فقط)',
    missing_level: 'الصف فارغ',
    missing_class: 'الفصل المطلوب فارغ',
    duplicate: 'مكرر بنفس الفصل (حُسب مرة واحدة)',
    conflict: 'مكرر بفصل أو صف مختلف: تُرك الطالب دون نقل لأن المطلوب غير محسوم'
  };

  /**
   * rows: صفوف sheet_to_json (كائنات مفتاحها عنوان العمود). cols: { code, targetClass, level }.
   * entries: سجلات صالحة فريدة { code, level, targetClass, rowNo }. issues: ما استُبعد أو نُبّه عليه { rowNo, code, kind, message, severity }.
   */
  function parseEntries(rows, cols) {
    const entries = [];
    const issues = [];
    const byCode = new Map();
    const conflicted = new Set();
    let blankRows = 0;
    const issue = (rowNo, code, kind, severity) => issues.push({ rowNo, code, kind, severity, message: ISSUE_TEXT[kind] });

    (rows || []).forEach((r, i) => {
      const rowNo = i + 2;   // الصف الأول في Excel عناوين
      const code = normalizeCode(r?.[cols.code]);
      const level = clean(r?.[cols.level]);
      const targetClass = clean(r?.[cols.targetClass]);
      if (!code && !level && !targetClass) { blankRows++; return; }
      if (!code) { issue(rowNo, '', 'missing_code', 'error'); return; }
      if (!isValidCode(code)) { issue(rowNo, code, 'invalid_code', 'error'); return; }
      if (!level) { issue(rowNo, code, 'missing_level', 'error'); return; }
      if (!targetClass) { issue(rowNo, code, 'missing_class', 'error'); return; }

      const entry = { code, level, targetClass, rowNo };
      if (conflicted.has(code)) { issue(rowNo, code, 'conflict', 'error'); return; }
      const prev = byCode.get(code);
      if (!prev) { byCode.set(code, entry); entries.push(entry); return; }
      if (normText(prev.level) === normText(level) && normText(prev.targetClass) === normText(targetClass)) {
        issue(rowNo, code, 'duplicate', 'info');
        return;
      }
      // تعارض: لا نختار أحد الصفين بالتخمين، فيُستبعد الطالب كله وتُسجَّل الصفوف المتعارضة.
      conflicted.add(code);
      byCode.delete(code);
      entries.splice(entries.indexOf(prev), 1);
      issue(prev.rowNo, code, 'conflict', 'error');
      issue(rowNo, code, 'conflict', 'error');
    });

    return { entries, issues, blankRows, totalRows: (rows || []).length };
  }

  // ---------- الخطة ----------
  function levelIndex(level) {
    const codeMap = new Map();
    const sizes = new Map();
    (level.classes || []).forEach((c) => {
      sizes.set(String(c.value), (c.students || []).length);
      (c.students || []).forEach((s) => { if (!codeMap.has(s.code)) codeMap.set(s.code, { cls: c, student: s }); });
    });
    return { level, codeMap, sizes };
  }

  // الفصل الهدف في خيارات قائمة «المراد تسكينه»؛ وfind الفصل المقابل في فصول الصف لمعرفة حجمه الحالي.
  function resolveTarget(level, wanted) {
    const options = level.targetOptions && level.targetOptions.length ? level.targetOptions : level.classes;
    const res = resolveOption(options, wanted, classKey);
    if (!res.option) return res;
    const opt = res.option;
    const cls = (level.classes || []).find((c) => String(c.value) === String(opt.value)) ||
      (level.classes || []).find((c) => normText(c.text) === normText(opt.text)) || null;
    return { option: opt, tier: res.tier, cls };
  }

  /**
   * يبني خطة النقل من الإدخالات ولقطة الموقع. لا يغيّر شيئًا في الموقع.
   * يعيد: moves (كل طالب سيُنقل)، alreadyInPlace، notFound (غير موجود في الصف)، wrongLevel (موجود في صف آخر)،
   * unresolvedLevel / unresolvedTarget (الصف أو الفصل غير موجود في الموقع أو غامض)، groups (وحدات التنفيذ مرتبة)،
   * capacity (حجم كل فصل متأثر قبل/بعد)، summary.
   */
  function buildPlan({ entries, snapshot, capacity }) {
    const cap = Number(capacity) > 0 ? Number(capacity) : SITE_CLASS_CAPACITY;
    const infos = ((snapshot && snapshot.levels) || []).map(levelIndex);
    const plan = { moves: [], alreadyInPlace: [], notFound: [], wrongLevel: [], unresolvedLevel: [], unresolvedTarget: [], groups: [], capacity: [], capacityLimit: cap, unreadClasses: [] };
    // فصول تعذّرت قراءتها: كود غير موجود في صف فيه فصل غير مقروء قد يكون موجودًا فيه فعلًا.
    for (const x of infos) for (const f of x.level.failedClasses || []) plan.unreadClasses.push({ levelText: x.level.text, classText: f });
    const levelOptions = infos.map((x) => ({ value: x.level.value, text: x.level.text, info: x }));
    const levelCache = new Map();
    const targetCache = new Map();
    const groups = new Map();

    for (const e of entries || []) {
      let lr = levelCache.get(normText(e.level));
      if (!lr) { lr = resolveOption(levelOptions, e.level, levelKey); levelCache.set(normText(e.level), lr); }
      if (!lr.option) { plan.unresolvedLevel.push({ ...e, reason: lr.reason }); continue; }
      const info = lr.option.info;
      const L = info.level;

      const tKey = `${L.value}\u0001${normText(e.targetClass)}`;
      let tr = targetCache.get(tKey);
      if (!tr) { tr = resolveTarget(L, e.targetClass); targetCache.set(tKey, tr); }
      if (!tr.option) { plan.unresolvedTarget.push({ ...e, levelValue: L.value, levelText: L.text, reason: tr.reason }); continue; }

      const loc = info.codeMap.get(e.code);
      if (!loc) {
        const other = infos.find((x) => x !== info && x.codeMap.has(e.code));
        if (other) {
          plan.wrongLevel.push({ ...e, levelValue: L.value, levelText: L.text, foundLevelText: other.level.text, foundClassText: other.codeMap.get(e.code).cls.text });
        } else {
          plan.notFound.push({ ...e, levelValue: L.value, levelText: L.text });
        }
        continue;
      }

      const item = {
        code: e.code, name: loc.student.name || '', rowNo: e.rowNo,
        excelLevel: e.level, excelTarget: e.targetClass,
        levelValue: L.value, levelText: L.text,
        fromValue: loc.cls.value, fromText: loc.cls.text,
        toValue: tr.option.value, toText: tr.option.text,
        toClassValue: tr.cls ? tr.cls.value : null
      };
      const same = tr.cls ? String(tr.cls.value) === String(loc.cls.value) : normText(loc.cls.text) === normText(tr.option.text);
      if (same) { plan.alreadyInPlace.push(item); continue; }

      plan.moves.push(item);
      const key = `${item.levelValue}\u0001${item.fromValue}\u0001${item.toValue}`;
      if (!groups.has(key)) {
        groups.set(key, { levelValue: item.levelValue, levelText: item.levelText, fromValue: item.fromValue, fromText: item.fromText,
          toValue: item.toValue, toText: item.toText, toClassValue: item.toClassValue, moves: [] });
      }
      groups.get(key).moves.push(item);
    }

    const sizesByLevel = new Map(infos.map((x) => [String(x.level.value), new Map(x.sizes)]));
    plan.groups = orderGroups([...groups.values()], sizesByLevel, cap);
    plan.capacity = projectCapacity(infos, plan.moves, cap);
    plan.summary = {
      entries: (entries || []).length,
      toMove: plan.moves.length,
      alreadyInPlace: plan.alreadyInPlace.length,
      notFound: plan.notFound.length,
      wrongLevel: plan.wrongLevel.length,
      unresolvedLevel: plan.unresolvedLevel.length,
      unresolvedTarget: plan.unresolvedTarget.length,
      groups: plan.groups.length,
      overCapacity: plan.capacity.filter((c) => c.over).length
    };
    return plan;
  }

  // حجم كل فصل متأثر بعد تنفيذ كل النقل: قبل − خارج + داخل، ويُعلَّم ما يتجاوز السعة.
  function projectCapacity(infos, moves, cap) {
    const rows = [];
    for (const info of infos) {
      const here = moves.filter((m) => String(m.levelValue) === String(info.level.value));
      const delta = new Map();
      const bump = (value, field) => {
        if (value == null) return;
        const k = String(value);
        if (!delta.has(k)) delta.set(k, { incoming: 0, outgoing: 0 });
        delta.get(k)[field]++;
      };
      here.forEach((m) => { bump(m.fromValue, 'outgoing'); bump(m.toClassValue, 'incoming'); });
      for (const c of info.level.classes || []) {
        const d = delta.get(String(c.value));
        if (!d) continue;
        const before = (c.students || []).length;
        const after = before - d.outgoing + d.incoming;
        rows.push({ levelText: info.level.text, levelValue: info.level.value, classText: c.text, classValue: c.value, before, incoming: d.incoming, outgoing: d.outgoing, after, over: after > cap });
      }
    }
    return rows;
  }

  /**
   * ترتيب المجموعات بمحاكاة الأحجام: نبدأ بأول مجموعة تتسع لها وجهتها الآن، ونطبّق أثرها (يفرغ مكان المصدر)، ونكرر.
   * ما لا يتسع في أي حال (تبادل بين فصلين ممتلئين، أو تجاوز 50) يُلحق آخرًا بعلامة capacityRisk فيحاول المنفِّذ وقرار الموقع نهائي.
   */
  function orderGroups(groups, sizesByLevel, cap) {
    const size = (g, classValue) => (sizesByLevel.get(String(g.levelValue)) || new Map()).get(String(classValue)) || 0;
    const bump = (g, classValue, by) => {
      const m = sizesByLevel.get(String(g.levelValue));
      if (m && classValue != null) m.set(String(classValue), (m.get(String(classValue)) || 0) + by);
    };
    const pending = groups.slice();
    const ordered = [];
    while (pending.length) {
      const i = pending.findIndex((g) => g.toClassValue == null || size(g, g.toClassValue) + g.moves.length <= cap);
      if (i < 0) {
        pending.forEach((g) => { g.capacityRisk = true; ordered.push(g); });
        break;
      }
      const g = pending.splice(i, 1)[0];
      bump(g, g.fromValue, -g.moves.length);
      bump(g, g.toClassValue, g.moves.length);
      ordered.push(g);
    }
    return ordered;
  }

  // ---------- المطابقة بعد التنفيذ ----------
  /**
   * after: لقطة بنفس الشكل (قد تحوي الفصول المعنيّة فقط). تعيد لكل كود في الخطة حالته الفعلية:
   * moved (صار في الفصل المطلوب) / not_moved (ما زال في فصله القديم) / elsewhere (في فصل ثالث) / unknown (غير ظاهر في ما قُرئ)
   * وللمقيدين أصلًا في فصلهم: kept / changed / unknown.
   */
  function reconcile(plan, after) {
    const where = new Map();
    for (const L of (after && after.levels) || []) {
      for (const c of L.classes || []) {
        for (const s of c.students || []) if (!where.has(s.code)) where.set(s.code, { levelValue: L.value, classValue: c.value, classText: c.text });
      }
    }
    const byCode = new Map();
    const counts = { moved: 0, not_moved: 0, elsewhere: 0, unknown: 0, kept: 0, changed: 0 };
    const classOf = (item) => item.toClassValue != null ? String(item.toClassValue) : null;
    const isTarget = (item, now) => classOf(item) != null ? String(now.classValue) === classOf(item) : normText(now.classText) === normText(item.toText);

    for (const m of plan.moves) {
      const now = where.get(m.code);
      let state = 'unknown';
      if (now) state = isTarget(m, now) ? 'moved' : String(now.classValue) === String(m.fromValue) ? 'not_moved' : 'elsewhere';
      byCode.set(m.code, { state, nowClassText: now ? now.classText : '' });
      counts[state]++;
    }
    for (const a of plan.alreadyInPlace) {
      const now = where.get(a.code);
      const state = !now ? 'unknown' : isTarget(a, now) ? 'kept' : 'changed';
      byCode.set(a.code, { state, nowClassText: now ? now.classText : '' });
      counts[state]++;
    }
    return { byCode, counts };
  }

  // ---------- وصف الخطة للمستخدم ----------
  function describePlan(plan, issues) {
    const s = plan.summary;
    const lines = [];
    const add = (kind, text) => lines.push({ kind, text });
    add('ok', `سيُنقل ${s.toMove} طالب في ${s.groups} مجموعة (كل مجموعة: فصل حالي ← فصل جديد).`);
    if (s.alreadyInPlace) add('ok', `${s.alreadyInPlace} طالب موجودون أصلًا في الفصل المطلوب ولن يُلمسوا.`);
    if (s.notFound) add('warn', `${s.notFound} كود غير موجود في الصف المذكور بالموقع ولن يُنقل.`);
    if (s.wrongLevel) add('warn', `${s.wrongLevel} طالب موجود في صف آخر غير المذكور في الملف (هذه الأداة تنقل داخل الصف الواحد فقط) ولن يُنقل.`);
    if (s.unresolvedLevel) add('error', `${s.unresolvedLevel} سجل صفّه غير موجود في الموقع أو غامض: ${[...new Set(plan.unresolvedLevel.map((e) => e.level))].slice(0, 5).join('، ')}`);
    if (s.unresolvedTarget) add('error', `${s.unresolvedTarget} سجل فصله المطلوب غير موجود في الموقع أو غامض: ${[...new Set(plan.unresolvedTarget.map((e) => `${e.levelText}/${e.targetClass}`))].slice(0, 5).join('، ')}`);
    const over = plan.capacity.filter((c) => c.over);
    over.forEach((c) => add('warn', `فصل ${c.levelText}/${c.classText} سيصير ${c.after} طالبًا والحد ${plan.capacityLimit}: قد يرفض الموقع بعض النقل.`));
    if (plan.unreadClasses.length) add('warn', `تعذّرت قراءة: ${plan.unreadClasses.map((u) => `${u.levelText}/${u.classText}`).join('، ')} — قد تكون أكواد «غير موجودة» فيها.`);
    const risky = plan.groups.filter((g) => g.capacityRisk);
    if (risky.length) add('warn', `${risky.length} مجموعة لا تتسع وجهتها حتى بعد ترتيب النقل، وستُجرَّب في آخر العملية.`);
    const fileErrors = (issues || []).filter((i) => i.severity === 'error').length;
    if (fileErrors) add('warn', `${fileErrors} صف في الملف استُبعد لعيب فيه (كود فارغ أو غير صالح أو صف/فصل فارغ أو تكرار متعارض).`);
    return lines;
  }

  // ---------- تقرير النتيجة ----------
  const RESULT_LABEL = {
    moved: 'نُقل وتأكّد من الفصل الجديد',
    saved_unverified: 'حُفظ ولم يُقرأ الفصل الجديد للتأكد',
    saved_not_seen: 'أعلن الموقع الحفظ لكن الطالب ما زال في فصله القديم',
    not_moved: 'لم يُنقل',
    elsewhere: 'موجود في فصل آخر غير المطلوب',
    unknown: 'لم يُعثر عليه بعد التنفيذ',
    kept: 'كان في الفصل المطلوب أصلًا',
    changed: 'كان في الفصل المطلوب ثم لم يعد فيه',
    not_run: 'لم يُنفَّذ (أُوقفت العملية أو لم يصل إليه الدور)',
    will_move: 'سيُنقل عند التنفيذ (معاينة)',
    not_found: 'كود غير موجود في الصف بالموقع',
    wrong_level: 'موجود في صف آخر',
    bad_level: 'الصف غير موجود في الموقع أو غامض',
    bad_target: 'الفصل المطلوب غير موجود في الموقع أو غامض'
  };

  const RESULT_HEADERS = ['م', 'كود التلميذ', 'اسم التلميذ', 'الصف', 'الفصل الحالي', 'الفصل المطلوب', 'الفصل بعد التنفيذ', 'النتيجة', 'ملاحظات'];

  /**
   * صف لكل طالب في الملف الصالح. exec: Map(كود ← { status: 'saved' | 'failed', reason }) مما سجّله المنفِّذ.
   * verify: ناتج reconcile (اختياري: غيابه يعني أن القراءة بعد التنفيذ لم تتم).
   * preview: معاينة قبل التنفيذ، فيُوصف كل منقول بأنه «سيُنقل» لا «لم يُنفَّذ».
   */
  function buildResultRows({ plan, exec, verify, preview }) {
    const rows = [];
    const counts = {};
    const push = (item, labelKey, now, note) => {
      counts[labelKey] = (counts[labelKey] || 0) + 1;
      rows.push([String(rows.length + 1), item.code, item.name || '', item.levelText || item.excelLevel || '', item.fromText || '', item.toText || item.excelTarget || '', now || '', RESULT_LABEL[labelKey], note || '']);
    };
    const execOf = (code) => (exec && exec.get ? exec.get(code) : null);

    for (const m of plan.moves) {
      const v = verify && verify.byCode.get(m.code);
      const ex = execOf(m.code);
      if (preview) push(m, 'will_move', m.fromText, '');
      else if (v) {
        if (v.state === 'moved') push(m, 'moved', v.nowClassText);
        else if (v.state === 'not_moved') push(m, ex && ex.status === 'saved' ? 'saved_not_seen' : 'not_moved', v.nowClassText, ex && ex.reason);
        else if (v.state === 'elsewhere') push(m, 'elsewhere', v.nowClassText, ex && ex.reason);
        else push(m, 'unknown', '', ex && ex.reason);
      } else if (ex && ex.status === 'saved') push(m, 'saved_unverified', '', '');
      else if (ex && ex.status === 'failed') push(m, 'not_moved', m.fromText, ex.reason);
      else push(m, 'not_run', m.fromText, '');
    }
    for (const a of plan.alreadyInPlace) {
      const v = verify && verify.byCode.get(a.code);
      if (v && v.state === 'changed') push(a, 'changed', v.nowClassText);
      else push(a, 'kept', v ? v.nowClassText : a.fromText);
    }
    for (const e of plan.notFound) push({ ...e, name: '' }, 'not_found', '', '');
    for (const e of plan.wrongLevel) push({ ...e, name: '' }, 'wrong_level', '', `موجود في ${e.foundLevelText} / ${e.foundClassText}`);
    for (const e of plan.unresolvedLevel) push({ ...e, name: '' }, 'bad_level', '', e.reason === 'ambiguous' ? 'أكثر من صف يطابق هذا الاسم' : '');
    for (const e of plan.unresolvedTarget) push({ ...e, name: '' }, 'bad_target', '', e.reason === 'ambiguous' ? 'أكثر من فصل يطابق هذا الاسم' : '');

    return { headers: RESULT_HEADERS, rows, counts };
  }

  globalThis.NeprasAssignPlan = Object.freeze({
    SITE_CLASS_CAPACITY, ISSUE_TEXT, RESULT_LABEL,
    latinDigits, normText, normalizeCode, isValidCode, levelKey, classKey,
    resolveOption, detectColumns, parseEntries, buildPlan, reconcile, describePlan, buildResultRows
  });
})();
