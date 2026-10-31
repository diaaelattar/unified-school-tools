/**
 * Nepras — دفاتر الفصول: توليد دفتر لكل فصل من قوالب Excel المضمّنة (غياب ودرجات، التربية الفنية بالقرار 137، دفتر 5 سلوك).
 *
 * أصل هذا الملف أداة سطح المكتب «مولّد دفاتر الفصول 2.2» (Python/PySide6) لنفس المطوّر؛ نُقل منها المنطق كله (بلا واجهتها ولا
 * الطباعة وحفظ PDF عبر Excel COM، فهذان لا يعملان داخل المتصفح): أدوات النص العربي، تعديل حزمة xlsx/xlsm/xltm مباشرةً على XML،
 * البانيات الثلاثة، المهام وخطة التوليد وأسماء الملفات. الفرق الوحيد في المصدر: الطلاب يأتون من الموقع نفسه بدل ملف Excel.
 *
 * لماذا على XML لا بمكتبة xlsx: القوالب فيها ماكرو (vbaProject.bin) وصور وحماية وتنسيق شرطي؛ أي مكتبة تقرأ وتكتب تُسقط بعضها
 * (انظر 1.2.91: SheetJS الحرة لا تكتب التنسيق أصلًا). هنا لا يُلمس إلا ما يُكتب فيه الاسم والترويسة، وبقية الأجزاء تُنسخ بايتًا ببايت
 * من القالب (حتى الصورة التي تبلغ 5 ميغابايت لا تُفكّ ولا تُعاد ضغطها).
 *
 * لا يلمس هذا الملف الصفحة ولا chrome.*: يستقبل بايتات القوالب (loadTemplate) ويسلّم بايتات الملفات (deliver). المشغّل الذي يجلب الطلاب
 * ويسلّم الملفات في modules/school_records.js. يعتمد على modules/xlsx_writer.js (طبقة ZIP الخام) وDOMParser/XMLSerializer من المتصفح.
 */
(function () {
  'use strict';
  if (globalThis.NeprasClassBooks) return;

  const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const NS_XML = 'http://www.w3.org/XML/1998/namespace';
  const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n';

  const CT_BOOK_XLSM = 'application/vnd.ms-excel.sheet.macroEnabled.main+xml';
  const CT_BOOK_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml';
  const MIME_XLSM = 'application/vnd.ms-excel.sheet.macroEnabled.12';
  const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  const MAX_PER_CLASS = 50;                   // سعة القوالب: 25 + 25 في ورقة «فصل» (و50 في بقية القوالب)
  const CLASS_SHEET = 'فصل';                  // ورقة إدخال الأسماء في دفاتر الفصول
  const WEEKDAYS = ['الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'];   // كما في قائمة القالب
  const ART_FIRST_ROW = 8, ART_LAST_ROW = 57;

  const KIND_STAGE_BOOK = 'stage_book';       // دفتر الفصل: ورقة «فصل» + غياب/درجات/تجميع
  const KIND_ART = 'art';                     // كشف التربية الفنية (القرار 137)
  const KIND_BEHAVIOR = 'behavior';           // دفتر سلوك/غياب: «الإعدادات» + «بيانات الطلاب» + شهور
  const KIND_UNKNOWN = 'unknown';
  const KIND_LABELS = {
    [KIND_STAGE_BOOK]: 'دفتر فصل (غياب ودرجات)',
    [KIND_ART]: 'كشف التربية الفنية (القرار 137)',
    [KIND_BEHAVIOR]: 'دفتر سلوك / متابعة غياب',
    [KIND_UNKNOWN]: 'غير معروف'
  };

  class TemplateError extends Error {
    constructor(message) { super(message); this.name = 'TemplateError'; }
  }
  class ClassTooBig extends Error {
    constructor(message) { super(message); this.name = 'ClassTooBig'; }
  }

  // =====================================================================================================
  // 1) أدوات النص العربي: التطبيع، والتعرف على المرحلة والصف والفصل بمرونة
  // =====================================================================================================
  const DIGIT_MAP = {};
  '٠١٢٣٤٥٦٧٨٩'.split('').forEach((ch, i) => { DIGIT_MAP[ch] = String(i); });
  '۰۱۲۳۴۵۶۷۸۹'.split('').forEach((ch, i) => { DIGIT_MAP[ch] = String(i); });
  const ALEF_MAP = { 'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا', 'ي': 'ى', 'ة': 'ه' };
  const RE_MARKS = /[ً-ٰٟـ]/g;           // تشكيل + تطويل
  const RE_CLASS_PREFIX = /^(?:الفصل|فصل)\s*[:\-]?\s*/;

  function toAsciiDigits(s) { return String(s).replace(/[٠-٩۰-۹]/g, (ch) => DIGIT_MAP[ch]); }
  function words(s) { return String(s).split(/\s+/).filter(Boolean); }

  /** تطبيع للمقارنة فقط (لا يُستخدم في النص المعروض). */
  function norm(s) {
    s = s == null ? '' : String(s);
    s = toAsciiDigits(s).replace(RE_MARKS, '').replace(/[أإآٱية]/g, (ch) => ALEF_MAP[ch]);
    return words(s).join(' ');
  }

  /** تنظيف نص للعرض: إزالة المسافات الزائدة فقط. */
  function clean(s) { return words(s == null ? '' : s).join(' '); }

  const STAGE_ORDER = ['primary', 'prep', 'sec'];
  const STAGE_INFO = {                         // مفتاح -> [اسم المجلد، صفة المرحلة للعرض، أقصى صف]
    primary: ['ابتدائي', 'الابتدائي', 6],
    prep: ['إعدادي', 'الإعدادي', 3],
    sec: ['ثانوي', 'الثانوي', 3]
  };
  const GRADE_DISPLAY = { 1: 'الأول', 2: 'الثاني', 3: 'الثالث', 4: 'الرابع', 5: 'الخامس', 6: 'السادس' };
  // الحرف الذي يُكتب بعد الفصل في عنوان الدفتر: «4 / 3 ب» = الصف 4 فصل 3 ابتدائي. غيّر الحروف من هنا فقط.
  const STAGE_LETTER = { primary: 'ب', prep: 'ع', sec: 'ث' };

  const STAGE_WORDS = [['primary', 'ابتدا'], ['prep', 'اعداد'], ['sec', 'ثانو']];
  const RE_STAGE_TOKEN = /\S*(?:ابتدا|اعداد|ثانو)\S*/g;
  const GRADE_WORDS = [['اول', 1], ['ثان', 2], ['ثالث', 3], ['رابع', 4], ['خامس', 5], ['سادس', 6]];

  function detectStage(text) {
    const n = norm(text);
    for (const [key, frag] of STAGE_WORDS) if (n.includes(frag)) return key;
    return null;
  }

  function detectGrade(text) {
    const n = norm(text).replace(RE_STAGE_TOKEN, ' ');       // نحذف كلمة المرحلة حتى لا تلتبس «ثانوي» بـ«الثاني»
    const m = /(?<!\d)([1-6])(?!\d)/.exec(n);
    if (m) return parseInt(m[1], 10);
    for (const [frag, g] of GRADE_WORDS) if (n.includes(frag)) return g;
    return null;
  }

  /** يوحّد قيمة الفصل: 3 / ٣ / 3.0 / «فصل 3» -> «3»، والحروف («أ») تبقى كما هي. */
  function cleanClass(v) {
    if (v == null) return '';
    const s = clean(toAsciiDigits(v)).replace(RE_CLASS_PREFIX, '').trim();
    if (/^\d+(?:\.0+)?$/.test(s)) return String(parseInt(s, 10));
    return s;
  }

  /** مقارنة الفصول: الأرقام أولًا بترتيبها العددي ثم الحروف. */
  function compareClass(a, b) {
    a = String(a); b = String(b);
    const ad = /^\d+$/.test(a), bd = /^\d+$/.test(b);
    if (ad && bd) return parseInt(a, 10) - parseInt(b, 10);
    if (ad !== bd) return ad ? -1 : 1;
    const na = norm(a), nb = norm(b);
    return na < nb ? -1 : na > nb ? 1 : 0;
  }

  function stageGradeTitle(stage, grade) { return `${GRADE_DISPLAY[grade] || String(grade)} ${STAGE_INFO[stage][1]}`; }
  /** اسم الفصل المختصر في عناوين الدفاتر: «4 / 3 ب» (رقم الصف / الفصل + حرف المرحلة). */
  function classTitle(stage, grade, cls) { return `${grade} / ${cls} ${STAGE_LETTER[stage]}`; }
  function classLabel(key) { return `${stageGradeTitle(key[0], key[1])} / ${key[2]}`; }

  function safeFilename(name, maxLen = 150) {
    name = String(name).replace(/[<>:"/\\|?*\x00-\x1f]/g, '-');
    name = name.replace(/\s+/g, ' ').replace(/^[ .]+|[ .]+$/g, '');
    return name.slice(0, maxLen) || 'ملف';
  }

  /** «إدارة المعادي التعليمية» -> «المعادي» (لتفادي تكرار الكلمة في القوالب التي تضيفها). */
  function stripAdminWords(s) {
    s = clean(s).replace(/^إدارة\s+/, '').replace(/\s+(?:التعليمية|التعليمي)$/, '');
    return s.trim();
  }

  /** «محافظة الجيزة» أو «مديرية التربية والتعليم بالجيزة» -> «الجيزة». */
  function stripGovWords(s) {
    s = clean(s).replace(/^مديرية التربية والتعليم\s*(?:بـ|ب)?\s*/, '').replace(/^محافظة\s+/, '');
    return s.trim();
  }

  // =====================================================================================================
  // 2) تعديل حزمة Excel على XML (نقل core/ooxml.py)
  // =====================================================================================================
  function parseXml(text, label) {
    if (typeof DOMParser !== 'function') throw new TemplateError('المتصفح لا يوفّر DOMParser');
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    const bad = doc.getElementsByTagName('parsererror')[0];
    if (bad || !doc.documentElement) throw new TemplateError('جزء XML تالف في القالب: ' + label);
    return doc;
  }
  function serializeEl(el) { return new XMLSerializer().serializeToString(el); }

  const kids = (el, local) => Array.from(el.children).filter((c) => c.localName === local && c.namespaceURI === NS);
  const kid = (el, local) => kids(el, local)[0] || null;
  const descendants = (el, local) => Array.from(el.getElementsByTagNameNS(NS, local));
  const mainEl = (doc, local) => doc.createElementNS(NS, local);

  function colNum(col) {
    let n = 0;
    for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n;
  }
  const RE_CELL_REF = /^([A-Z]{1,3})(\d+)$/;

  /** محتويات ملف القالب (zip) تُقرأ مرة واحدة وتُستعمل لكل الفصول. أجزاء XML تُفكّ نصًّا، والبقية تبقى مضغوطة كما هي. */
  class TemplateData {
    constructor(label, entries, texts) {
      this.label = label;
      this.entries = entries;                              // بترتيب الأرشيف
      this.byName = new Map(entries.map((e) => [e.name, e]));
      this.texts = texts;                                  // اسم الجزء -> نص XML
    }

    static async load(bytes, label = 'القالب') {
      let entries;
      try {
        entries = neprasZipReadEntries(bytes);
      } catch (e) {
        throw new TemplateError(`الملف ليس ملف Excel صالحاً: ${label}`);
      }
      const names = new Set(entries.map((e) => e.name));
      for (const need of ['xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/sharedStrings.xml', '[Content_Types].xml']) {
        if (!names.has(need)) throw new TemplateError(`القالب ناقص (${need}): ${label}`);
      }
      const texts = new Map();
      const dec = new TextDecoder('utf-8');
      for (const e of entries) {
        if (!/\.(xml|rels)$/i.test(e.name)) continue;
        try {
          texts.set(e.name, dec.decode(await neprasZipEntryData(e)));
        } catch (err) {
          throw new TemplateError(`تعذّر قراءة ${e.name} من القالب: ${label}`);
        }
      }
      return new TemplateData(label, entries, texts);
    }

    get hasMacros() { return this.byName.has('xl/vbaProject.bin'); }
  }

  class SharedStrings {
    constructor(text) {
      this.doc = parseXml(text, 'xl/sharedStrings.xml');
      this.root = this.doc.documentElement;
      this.items = Array.from(this.root.children);
      this.index = new Map();
      this.items.forEach((si, i) => {
        const ts = kids(si, 't');
        if (ts.length === 1 && si.children.length === 1 && !this.index.has(ts[0].textContent || '')) this.index.set(ts[0].textContent || '', i);
      });
      this.addedRefs = 0;
      this.pristine = serializeEl(this.root);
    }

    text(i) { return descendants(this.items[i], 't').map((t) => t.textContent || '').join(''); }

    add(text) {
      this.addedRefs += 1;
      if (this.index.has(text)) return this.index.get(text);
      const si = mainEl(this.doc, 'si');
      const t = mainEl(this.doc, 't');
      t.textContent = text;
      if (text !== text.trim() || text.includes('  ') || text.includes('\n')) t.setAttributeNS(NS_XML, 'xml:space', 'preserve');
      si.appendChild(t);
      this.root.appendChild(si);
      this.items.push(si);
      this.index.set(text, this.items.length - 1);
      return this.items.length - 1;
    }

    serialize() {
      this.root.setAttribute('uniqueCount', String(this.items.length));
      this.root.setAttribute('count', String((parseInt(this.root.getAttribute('count') || '0', 10) || 0) + this.addedRefs));
      return serializeEl(this.root);
    }
  }

  class Sheet {
    constructor(pkg, name, doc) {
      this.pkg = pkg; this.name = name; this.doc = doc; this.root = doc.documentElement;
      this.sd = kid(this.root, 'sheetData');
      this.rows = new Map();
      this.cells = new Map();
      for (const row of Array.from(this.sd.children)) {
        if (row.getAttribute('r')) this.rows.set(parseInt(row.getAttribute('r'), 10), row);
        for (const c of Array.from(row.children)) if (c.getAttribute('r')) this.cells.set(c.getAttribute('r'), c);
      }
    }

    /** الوصول للخلية (مع إنشاء الناقصة بترتيبها الصحيح في صفها). */
    cell(ref, create = true) {
      let c = this.cells.get(ref);
      if (c || !create) return c || null;
      const m = RE_CELL_REF.exec(ref);
      if (!m) throw new Error('مرجع خلية غير صالح: ' + ref);
      const cn = colNum(m[1]), rn = parseInt(m[2], 10);
      let row = this.rows.get(rn);
      if (!row) {
        row = mainEl(this.doc, 'row');
        row.setAttribute('r', String(rn));
        const before = [...this.rows.keys()].filter((r) => r < rn);
        if (before.length) {
          const prev = this.rows.get(Math.max(...before));
          prev.parentNode.insertBefore(row, prev.nextSibling);
        } else {
          this.sd.insertBefore(row, this.sd.firstChild);
        }
        this.rows.set(rn, row);
      }
      c = mainEl(this.doc, 'c');
      c.setAttribute('r', ref);
      const after = Array.from(row.children).find((other) => colNum(RE_CELL_REF.exec(other.getAttribute('r'))[1]) > cn);
      if (after) row.insertBefore(c, after); else row.appendChild(c);
      this.cells.set(ref, c);
      return c;
    }

    _empty(c) { while (c.firstChild) c.removeChild(c.firstChild); }

    setText(ref, text) {
      const c = this.cell(ref);
      this._empty(c);
      if (text === '' || text == null) { c.removeAttribute('t'); return; }
      c.setAttribute('t', 's');
      const v = mainEl(this.doc, 'v');
      v.textContent = String(this.pkg.sst.add(String(text)));
      c.appendChild(v);
    }

    setNumber(ref, num) {
      const c = this.cell(ref);
      this._empty(c);
      c.removeAttribute('t');
      const v = mainEl(this.doc, 'v');
      v.textContent = String(num);
      c.appendChild(v);
    }

    setFormula(ref, formula) {
      const c = this.cell(ref);
      this._empty(c);
      c.setAttribute('t', 'str');
      const f = mainEl(this.doc, 'f');
      f.textContent = formula;
      c.appendChild(f);
      c.appendChild(mainEl(this.doc, 'v'));
    }

    /** يفرّغ الخلية إن لم تكن صيغة (لا يمس الصيغ أبدًا). */
    clearIfPlain(ref) {
      const c = this.cells.get(ref);
      if (c && !kid(c, 'f') && c.children.length) this.setText(ref, '');
    }

    /** القراءة: [النوع، القيمة] حيث النوع 'n' / 's' / null للفارغ. */
    value(ref) {
      const c = this.cells.get(ref);
      if (!c) return [null, ''];
      const t = c.getAttribute('t');
      if (t === 'inlineStr') return ['s', descendants(c, 't').map((x) => x.textContent || '').join('')];
      const v = kid(c, 'v');
      const vt = v ? v.textContent : '';
      if (!vt) return [null, ''];                           // <v/> فارغ = لا قيمة، أيًّا كان نوع الخلية (كما في الأصل)
      if (t === 's') return ['s', this.pkg.sst.text(parseInt(vt, 10))];
      if (t === 'str' || t === 'e') return ['s', vt];
      return ['n', vt];
    }

    text(ref) { return this.value(ref)[1]; }
  }

  /** حزمة قابلة للتعديل فوق TemplateData (لا تغيّر القالب نفسه). */
  class Package {
    constructor(tpl) {
      this.tpl = tpl;
      this.sst = new SharedStrings(tpl.texts.get('xl/sharedStrings.xml'));
      this.docs = new Map();              // اسم الجزء -> {doc, pristine}
      this.sheetObjs = new Map();
      this._sheetParts = null;
    }

    xml(name) {
      if (!this.docs.has(name)) {
        const text = this.tpl.texts.get(name);
        if (text == null) throw new TemplateError(`جزء ناقص في القالب: ${name}`);
        const doc = parseXml(text, name);
        this.docs.set(name, { doc, pristine: serializeEl(doc.documentElement) });
      }
      return this.docs.get(name).doc.documentElement;
    }

    /** {اسم الورقة: مسار الجزء} بترتيب المصنف. */
    sheetParts() {
      if (!this._sheetParts) {
        const wb = this.xml('xl/workbook.xml');
        const rels = new Map(Array.from(this.xml('xl/_rels/workbook.xml.rels').children).map((r) => [r.getAttribute('Id'), r.getAttribute('Target')]));
        const res = new Map();
        for (const s of kids(kid(wb, 'sheets'), 'sheet')) {
          const t = rels.get(s.getAttributeNS(NS_R, 'id'));
          res.set(s.getAttribute('name'), 'xl/' + String(t).replace(/^\/+/, '').replace('xl/', ''));
        }
        this._sheetParts = res;
      }
      return this._sheetParts;
    }

    sheetNames() { return [...this.sheetParts().keys()]; }

    sheet(name) {
      if (!this.sheetObjs.has(name)) {
        const parts = this.sheetParts();
        if (!parts.has(name)) throw new TemplateError(`الورقة «${name}» غير موجودة في القالب`);
        this.xml(parts.get(name));
        this.sheetObjs.set(name, new Sheet(this, name, this.docs.get(parts.get(name)).doc));
      }
      return this.sheetObjs.get(name);
    }

    /** يحوّل القالب إلى مصنف عادي ويطلب إعادة حساب كاملة عند الفتح. يعيد مجموعة الأجزاء المحذوفة. */
    finish(contentType, dropCalcchain = false) {
      const ct = this.xml('[Content_Types].xml');
      for (const o of Array.from(ct.children)) if (o.getAttribute('PartName') === '/xl/workbook.xml') o.setAttribute('ContentType', contentType);
      const drop = new Set();
      if (dropCalcchain && this.tpl.byName.has('xl/calcChain.xml')) {
        drop.add('xl/calcChain.xml');
        for (const o of Array.from(ct.children)) if (o.getAttribute('PartName') === '/xl/calcChain.xml') ct.removeChild(o);
        const rels = this.xml('xl/_rels/workbook.xml.rels');
        for (const r of Array.from(rels.children)) if ((r.getAttribute('Target') || '').endsWith('calcChain.xml')) rels.removeChild(r);
      }
      const wb = this.xml('xl/workbook.xml');
      let cp = kid(wb, 'calcPr');
      if (!cp) {
        cp = mainEl(wb.ownerDocument, 'calcPr');
        let anchor = null;
        for (const tag of ['definedNames', 'externalReferences', 'functionGroups', 'sheets']) {
          anchor = kid(wb, tag);
          if (anchor) break;
        }
        anchor.parentNode.insertBefore(cp, anchor.nextSibling);
      }
      cp.setAttribute('fullCalcOnLoad', '1');
      return drop;
    }

    /** يكتب الملف: الأجزاء التي تغيّرت فقط تُضغط من جديد، وكل ما عداها يُنسخ من القالب كما هو. يعيد Uint8Array. */
    async save(drop = new Set()) {
      const enc = new TextEncoder();
      const changed = new Map();
      const sstText = this.sst.serialize();
      if (sstText !== this.sst.pristine) changed.set('xl/sharedStrings.xml', sstText);
      for (const [name, { doc, pristine }] of this.docs) {
        const now = serializeEl(doc.documentElement);
        if (now !== pristine) changed.set(name, now);
      }
      const out = [];
      for (const e of this.tpl.entries) {
        if (drop.has(e.name)) continue;
        if (changed.has(e.name)) {
          const data = enc.encode(XML_DECL + changed.get(e.name));
          out.push({ name: e.name, method: 8, crc: neprasZipCrc32(data), usize: data.length, raw: await neprasZipDeflate(data) });
        } else {
          out.push({ name: e.name, method: e.method, crc: e.crc, usize: e.usize, raw: e.raw });
        }
      }
      return neprasZipWriteEntries(out);
    }
  }

  // ---- تحديث القيم المخزّنة للصيغ البسيطة (لتظهر البيانات حتى في برامج لا تعيد الحساب؛ Excel يعيد حساب كل شيء عند الفتح) ----
  const REF_SRC = '(?:(?:\'(?<q>[^\']+)\'|(?<u>[^\'!\\s&()"+]+))!)?\\$?(?<col>[A-Z]{1,3})\\$?(?<row>\\d+)';
  const RE_REF = new RegExp('^' + REF_SRC + '$');
  const RE_LIT = /^"((?:[^"]|"")*)"$/;
  const RE_ADD = new RegExp('^\\(\\s*(?<ref>' + REF_SRC.replace(/\(\?<(q|u|col|row)>/g, '(?<a_$1>') + ')\\s*\\+\\s*(?<n>\\d+)\\s*\\)$');
  const RE_IFBLANK = /^IF\(\s*(.+?)\s*=\s*""\s*,\s*""\s*,\s*(.+?)\s*\)$/;

  function splitConcat(f) {
    const toks = []; let cur = []; let inq = false;
    for (const ch of f) {
      if (ch === '"') inq = !inq;
      if (ch === '&' && !inq) { toks.push(cur.join('').trim()); cur = []; } else cur.push(ch);
    }
    toks.push(cur.join('').trim());
    return inq ? null : toks;
  }

  /**
   * يكتب القيمة المخزّنة للصيغ البسيطة (مرجع مباشر / IF(مرجع="","",مرجع) / ربط نصوص بـ &) التي تعتمد على الأوراق المعدَّلة.
   * يعيد [عدد الصيغ المحدّثة، عدد الصيغ المعقدة المرتبطة بالأوراق المعدلة التي تُركت لـ Excel].
   */
  function refreshCached(pkg, touched) {
    const dirty = new Set(touched);
    const sheets = new Map(pkg.sheetNames().map((n) => [n, pkg.sheet(n)]));
    const NOT_FOUND = Symbol('KeyError');

    function lookup(m, own) {
      const name = m.q || m.u || own;
      if (!sheets.has(name)) throw NOT_FOUND;
      return [name, sheets.get(name).value(m.col + m.row)];
    }

    function evaluate(f, own) {
      const mi = RE_IFBLANK.exec(f);
      if (mi && mi[1] === mi[2]) {
        const m = RE_REF.exec(mi[1]);
        if (m) {
          const [name, [k, v]] = lookup(m.groups, own);
          return [k == null ? [null, ''] : [k, v], new Set([name])];
        }
      }
      const m = RE_REF.exec(f);
      if (m) {
        const [name, [k, v]] = lookup(m.groups, own);
        return [k == null ? ['n', '0'] : [k, v], new Set([name])];   // مرجع لخلية فارغة = 0 كما في Excel
      }
      const toks = splitConcat(f);
      if (!toks || toks.length < 2) return null;
      const out = []; const used = new Set();
      for (const t of toks) {
        const ml = RE_LIT.exec(t);
        if (ml) { out.push(ml[1].replace(/""/g, '"')); continue; }
        const mr = RE_REF.exec(t);
        if (mr) {
          const [name, [, v]] = lookup(mr.groups, own);
          used.add(name); out.push(v); continue;
        }
        const ma = RE_ADD.exec(t);
        if (ma) {
          const inner = RE_REF.exec(ma.groups.ref);
          const [name, [, v]] = lookup(inner.groups, own);
          used.add(name);
          if (String(v).trim() === '' || Number.isNaN(Number(v))) return null;
          const num = Number(v) + parseInt(ma.groups.n, 10);
          out.push(String(num));
          continue;
        }
        return null;
      }
      return [['s', out.join('')], used];
    }

    let matched = 0, unmatched = 0;
    for (let pass = 0; pass < 5; pass++) {                  // تمريرات لسلاسل الاعتماد (إعدادات -> غلاف ...)
      const changedSheets = new Set();
      matched = unmatched = 0;
      for (const [name, sh] of sheets) {
        for (const c of descendants(sh.sd, 'c')) {
          const f = kid(c, 'f');
          if (!f || !f.textContent) continue;
          let res;
          try { res = evaluate(f.textContent.trim(), name); } catch (e) { if (e === NOT_FOUND) continue; throw e; }
          if (res === null) {
            if ([...dirty].some((t) => f.textContent.includes(t + '!'))) unmatched++;
            continue;
          }
          const [[kind, val], used] = res;
          if (![...used].some((u) => dirty.has(u))) continue;
          let v = kid(c, 'v');
          if (!v) { v = mainEl(sh.doc, 'v'); c.appendChild(v); }
          const newT = kind === 'n' ? null : 'str';
          if (c.getAttribute('t') !== newT || (v.textContent || '') !== val) {
            if (newT) c.setAttribute('t', newT); else c.removeAttribute('t');
            v.textContent = val;
            changedSheets.add(name);
          }
          matched++;
        }
      }
      if (!changedSheets.size) break;
      changedSheets.forEach((n) => dirty.add(n));
    }
    return [matched, unmatched];
  }

  // =====================================================================================================
  // 3) اكتشاف نوع القالب من بنيته الداخلية (وليس من اسمه)
  // =====================================================================================================
  function sheetMentions(pkg, partName, word) {
    if (!partName) return false;
    const hits = new Set();
    pkg.sst.items.forEach((si, i) => { if (pkg.sst.text(i).includes(word)) hits.add(i); });
    if (!hits.size) return false;
    const root = pkg.xml(partName);
    for (const c of descendants(root, 'c')) {
      if (c.getAttribute('t') !== 's') continue;
      const v = kid(c, 'v');
      if (v && v.textContent && hits.has(parseInt(v.textContent, 10))) return true;
    }
    return false;
  }

  /** -> {ok, kind, hasProject, hasMacros, sheets, message} */
  function detectTemplate(tpl) {
    const info = { ok: false, kind: KIND_UNKNOWN, hasProject: false, hasMacros: tpl.hasMacros, sheets: [], message: '' };
    let pkg;
    try { pkg = new Package(tpl); } catch (e) { info.message = 'ليس ملف Excel صالحاً'; return info; }
    let parts;
    try { parts = pkg.sheetParts(); } catch (e) { info.message = 'ليس ملف Excel صالحاً'; return info; }
    const names = new Set(parts.keys());
    info.sheets = [...names];
    if (names.has('فصل') && (names.has('تجميع') || [...names].some((n) => n.startsWith('درجات')))) {
      info.kind = KIND_STAGE_BOOK;
      info.hasProject = sheetMentions(pkg, parts.get('تجميع'), 'المشروع');
    } else if (names.has('بيانات الطلاب') && names.has('الإعدادات')) {
      info.kind = KIND_BEHAVIOR;
    } else if (names.size === 1 && [...names].some((n) => n.includes('137') || n.includes('القرار') || n.includes('التربية الفنية'))) {
      info.kind = KIND_ART;
    } else {
      info.message = 'لم أتعرف على بنية هذا القالب';
      return info;
    }
    info.ok = true;
    return info;
  }

  // =====================================================================================================
  // 4) البانيات: كل دالة تأخذ قالبًا محمّلًا وتعيد ملفًا واحدًا لفصل واحد. لا تُلمس إلا خلايا الإدخال.
  // =====================================================================================================
  const DEFAULT_OPTIONS = Object.freeze({
    yearText: (globalThis.NeprasEgypt?.academicYearLabel?.() || '2026 / 2027'), governorate: '', administration: '', schoolName: '',
    deputyName: '', directorName: '', weeklyOff1: '', weeklyOff2: '', alertDays: 0,   // "" و0 = كما في القالب
    artMonths: ['', '', ''], artExamMonths: ['', ''], artTerm: ''
  });

  function normalizeOptions(o) {
    const opt = { ...DEFAULT_OPTIONS };
    for (const [k, v] of Object.entries(o || {})) if (v !== undefined && v !== null) opt[k] = v;   // قيمة غير معرّفة لا تمحو الافتراضي
    if (typeof opt.yearText !== 'string' || !opt.yearText.trim()) opt.yearText = DEFAULT_OPTIONS.yearText;
    else opt.yearText = opt.yearText.trim();
    opt.artMonths = [...(opt.artMonths || [])].concat(['', '', '']).slice(0, 3);
    opt.artExamMonths = [...(opt.artExamMonths || [])].concat(['', '']).slice(0, 2);
    opt.gov = stripGovWords(opt.governorate);
    opt.admin = stripAdminWords(opt.administration);
    const ym = /(20\d\d)/.exec(opt.yearText || '');
    opt.yearStart = ym ? parseInt(ym[1], 10) : null;
    return opt;
  }

  const contentTypeOf = (tpl) => (tpl.hasMacros ? CT_BOOK_XLSM : CT_BOOK_XLSX);

  function checkCapacity(students, limit = MAX_PER_CLASS) {
    if (students.length > limit) throw new ClassTooBig(`الفصل به ${students.length} طالباً والحد الأقصى ${limit}`);
  }

  /** 1) دفتر الفصل (ابتدائي / إعدادي / ثانوي) */
  async function buildStageBook(tpl, stage, grade, cls, students, options) {
    const opt = normalizeOptions(options);
    checkCapacity(students);
    const pkg = new Package(tpl);
    const sh = pkg.sheet(CLASS_SHEET);

    sh.setText('C2', ' فصل : ' + classTitle(stage, grade, cls));
    sh.setText('C3', 'للعام الدراسي  ' + opt.yearText);
    if (opt.gov) sh.setText('A1', 'محافظة : ' + opt.gov);
    if (opt.admin) sh.setText('A2', 'إدارة : ' + opt.admin);
    if (opt.schoolName) sh.setText('A3', 'مدرسة : ' + opt.schoolName);

    for (let r = 5; r < 30; r++) for (const col of 'BCEF') sh.clearIfPlain(col + r);   // تفريغ أي أسماء قديمة
    students.forEach((s, i) => {
      const row = 5 + (i % 25);
      const [nameCol, statusCol] = i < 25 ? ['B', 'C'] : ['E', 'F'];
      sh.setText(nameCol + row, s.name);
      sh.setText(statusCol + row, s.status);
    });

    refreshCached(pkg, new Set([CLASS_SHEET]));
    const drop = pkg.finish(contentTypeOf(tpl));
    return { bytes: await pkg.save(drop), warnings: [] };
  }

  /** 2) كشف التربية الفنية (القرار 137) */
  async function buildArtBook(tpl, stage, grade, cls, students, options) {
    const opt = normalizeOptions(options);
    checkCapacity(students, ART_LAST_ROW - ART_FIRST_ROW + 1);
    const pkg = new Package(tpl);
    const sh = pkg.sheet(pkg.sheetNames()[0]);

    const school = opt.schoolName || '.......................................';
    sh.setText('D3', `المدرسة: ${school}   |   الصف: ${GRADE_DISPLAY[grade] || grade} الإعدادي   |   الفصل: ${cls}   |   العام الدراسي: ${opt.yearText} م`);
    if (opt.gov) sh.setText('A1', 'محافظة ' + opt.gov);
    if (opt.admin) sh.setText('A4', 'إدارة: ' + opt.admin);

    if (opt.artTerm) {                                    // «... الفصل الدراسي ۰۰۰۰۰۰» في عنوان الكشف
      const title = sh.text('D1');
      const next = title.replace(/(الفصل الدراسي)\s*[۰٠0.\s]+$/, (m, g1) => g1 + ' ' + opt.artTerm);
      if (next !== title) sh.setText('D1', next);
    }
    ['C5', 'F5', 'I5'].forEach((ref, i) => { if (opt.artMonths[i]) sh.setText(ref, 'شهر ' + opt.artMonths[i]); });
    ['N5', 'O5'].forEach((ref, i) => { if (opt.artExamMonths[i]) sh.setText(ref, 'اختبار\nشهر ' + opt.artExamMonths[i]); });

    for (let r = ART_FIRST_ROW; r <= ART_LAST_ROW; r++) sh.clearIfPlain('B' + r);
    students.forEach((s, i) => sh.setText('B' + (ART_FIRST_ROW + i), s.name));

    // إصلاح الصيغ: عمود المجموع الكلي كان يحوي #REF! وأعمدة المجموع/المتوسط بلا صيغ
    for (let r = ART_FIRST_ROW; r <= ART_LAST_ROW; r++) {
      sh.setFormula('L' + r, `IF(COUNT(C${r}:K${r})=0,"",SUM(C${r}:K${r}))`);
      sh.setFormula('M' + r, `IF(L${r}="","",ROUND(L${r}/3,1))`);
      sh.setFormula('P' + r, `IF(COUNT(M${r}:O${r})=0,"",ROUND(SUM(M${r}:O${r}),1))`);
    }

    const sv = descendants(sh.root, 'sheetView')[0];
    if (sv) sv.removeAttribute('topLeftCell');            // فتح الورقة من أولها بدل أن تبدأ مزاحة للعمود E

    const drop = pkg.finish(contentTypeOf(tpl), true);
    return { bytes: await pkg.save(drop), warnings: [] };
  }

  /** 3) دفتر السلوك / متابعة الغياب */
  async function buildBehaviorBook(tpl, stage, grade, cls, students, options) {
    const opt = normalizeOptions(options);
    checkCapacity(students);
    for (const day of [opt.weeklyOff1, opt.weeklyOff2]) {
      if (day && !WEEKDAYS.includes(day)) throw new Error('يوم الإجازة غير صالح: ' + day);
    }
    const pkg = new Package(tpl);
    const st = pkg.sheet('الإعدادات');
    const sd = pkg.sheet('بيانات الطلاب');
    const warnings = [];

    if (opt.gov) st.setText('B4', 'مديرية التربية والتعليم بـ ' + opt.gov);
    if (opt.admin) st.setText('B5', `إدارة ${opt.admin} التعليمية`);
    if (opt.schoolName) st.setText('B6', opt.schoolName);
    st.setText('B7', 'فصل : ' + classTitle(stage, grade, cls));
    if (opt.deputyName) st.setText('B8', opt.deputyName);
    if (opt.directorName) st.setText('B9', opt.directorName);
    const ys = opt.yearStart;
    if (ys) {
      if (!(ys >= 2000 && ys <= 2100)) warnings.push('السنة خارج المدى 2000-2100 المسموح به في القالب');
      st.setNumber('B12', ys);
    } else {
      warnings.push(`لم أتمكن من قراءة سنة بداية العام من «${opt.yearText}»، تُرك العام كما في القالب`);
    }
    [['B14', opt.weeklyOff1], ['B15', opt.weeklyOff2]].forEach(([ref, day]) => { if (day) st.setText(ref, day); });
    if (opt.alertDays && opt.alertDays > 0) st.setNumber('B16', Math.trunc(opt.alertDays));

    for (let r = 5; r < 5 + MAX_PER_CLASS; r++) for (const col of 'BCD') sd.clearIfPlain(col + r);
    students.forEach((s, i) => {
      sd.setText('B' + (5 + i), s.name);
      if (s.phone) sd.setText('C' + (5 + i), s.phone);
    });

    refreshCached(pkg, new Set(['الإعدادات', 'بيانات الطلاب']));
    const drop = pkg.finish(contentTypeOf(tpl));
    return { bytes: await pkg.save(drop), warnings };
  }

  const BUILDERS = { [KIND_STAGE_BOOK]: buildStageBook, [KIND_ART]: buildArtBook, [KIND_BEHAVIOR]: buildBehaviorBook };

  // =====================================================================================================
  // 5) الطلاب والتجميع والتحقق
  // =====================================================================================================
  /** مفتاح مرحلة نافذة نبراس (PRIMARY / PREP / GENERAL_SECONDARY ...) ← مرحلة الدفاتر. الروضة بلا قوالب. */
  function stageKeyFromSelection(selected) {
    const s = String(selected || '').toUpperCase();
    if (s === 'PRIMARY') return 'primary';
    if (s === 'PREP') return 'prep';
    if (s === 'GENERAL_SECONDARY' || s === 'TECHNICAL_SECONDARY') return 'sec';
    return null;
  }

  /**
   * سجلات الموقع (كما ترجعها fetchAllSchoolStudents في school_records.js: name, grade, class_number, class_name, status, phone)
   * ← طلاب الدفاتر {stage, grade, cls, name, status, phone}. ما لا يُعرف صفّه أو فصله يُحصى في issues ولا يُهمل بصمت.
   */
  function normalizeStudents(records, stage) {
    const issues = [];
    const students = [];
    let unrec = 0, noCls = 0, noName = 0;
    const examples = [];
    (records || []).forEach((r, idx) => {
      const name = clean(r.name);
      if (!name) { noName++; return; }
      const grade = detectGrade(r.grade);
      const cls = cleanClass(r.class_number != null && String(r.class_number).trim() !== '' ? r.class_number : (r.class_name === 'عام' ? '' : r.class_name));
      if (grade == null) {
        unrec++;
        if (examples.length < 3) examples.push(`«${clean(r.grade)}»`);
        return;
      }
      if (!cls) { noCls++; return; }

      let gender = clean(r.gender || r['النوع'] || '');
      const nationalId = clean(r.national_id || r.nationalId || r['الرقم القومي'] || '');
      if (!gender && nationalId && /^[23]\d{13}$/.test(nationalId)) {
        gender = (parseInt(nationalId.charAt(12), 10) % 2 !== 0) ? 'ذكر' : 'أنثى';
      }
      if (!gender) gender = 'ذكر';

      students.push({
        stage,
        grade,
        cls,
        name,
        gender,
        nationalId,
        code: clean(r.code || r.student_code || r['كود الطالب'] || ''),
        status: clean(r.status),
        phone: clean(r.phone),
        row: idx + 1
      });
    });
    if (noName) issues.push({ level: 'info', text: `تم تخطي ${noName} سجلًّا بلا اسم.` });
    if (unrec) issues.push({ level: 'warn', text: `تعذر التعرف على الصف في ${unrec} طالبًا ولن يُدرجوا (${examples.join(' | ')}).` });
    if (noCls) issues.push({ level: 'warn', text: `${noCls} طالبًا بلا رقم فصل ولن يُدرجوا.` });
    return { students, issues };
  }

  function isStudentMale(student) {
    const g = String(student?.gender || '').trim();
    if (/أنثى|انثى|بنات|بنت|مؤنث|female/i.test(g)) return false;
    if (/ذكر|بنين|ولد|مذكر|male/i.test(g)) return true;
    const nid = String(student?.nationalId || student?.national_id || '').trim();
    if (/^[23]\d{13}$/.test(nid)) {
      return (parseInt(nid.charAt(12), 10) % 2 !== 0);
    }
    return true;
  }

  /** -> [{key:[stage, grade, cls], students}] بترتيب المرحلة ثم الصف ثم الفصل. */
  function groupClasses(students, sortMode = false) {
    const g = new Map();
    for (const s of students) {
      const id = `${s.stage}|${s.grade}|${s.cls}`;
      if (!g.has(id)) g.set(id, { key: [s.stage, s.grade, s.cls], students: [] });
      g.get(id).students.push(s);
    }
    const out = [...g.values()].sort((a, b) => (STAGE_ORDER.indexOf(a.key[0]) - STAGE_ORDER.indexOf(b.key[0])) || (a.key[1] - b.key[1]) || compareClass(a.key[2], b.key[2]));
    
    if (sortMode) {
      const mode = (typeof sortMode === 'string') ? sortMode : (sortMode ? 'alpha' : 'site');
      out.forEach((c) => {
        if (mode === 'alpha') {
          c.students.sort((a, b) => {
            const x = norm(a.name), y = norm(b.name);
            return x.localeCompare(y, 'ar') || ((a.row || 0) - (b.row || 0));
          });
        } else if (mode === 'gender' || mode === 'gender_boys') {
          c.students.sort((a, b) => {
            const maleA = isStudentMale(a);
            const maleB = isStudentMale(b);
            if (maleA && !maleB) return -1;
            if (!maleA && maleB) return 1;
            const x = norm(a.name), y = norm(b.name);
            return x.localeCompare(y, 'ar') || ((a.row || 0) - (b.row || 0));
          });
        } else if (mode === 'gender_girls') {
          c.students.sort((a, b) => {
            const maleA = isStudentMale(a);
            const maleB = isStudentMale(b);
            if (!maleA && maleB) return -1;
            if (maleA && !maleB) return 1;
            const x = norm(a.name), y = norm(b.name);
            return x.localeCompare(y, 'ar') || ((a.row || 0) - (b.row || 0));
          });
        }
      });
    }

    return out;
  }

  function validateStudents(students) {
    const issues = [];
    for (const { key, students: lst } of groupClasses(students)) {
      const [stage, grade] = key;
      if (lst.length > MAX_PER_CLASS) issues.push({ level: 'error', text: `الفصل ${classLabel(key)} به ${lst.length} طالباً والحد الأقصى في القوالب ${MAX_PER_CLASS}؛ سيتعذر توليده.` });
      if (grade > STAGE_INFO[stage][2]) issues.push({ level: 'warn', text: `الفصل ${classLabel(key)}: رقم الصف أكبر من المتوقع للمرحلة، راجع بيانات الموقع.` });
      const seen = new Set(); const dups = [];
      for (const s of lst) {
        const k = norm(s.name);
        if (seen.has(k) && !dups.includes(s.name)) dups.push(s.name);
        seen.add(k);
      }
      if (dups.length) issues.push({ level: 'warn', text: `الفصل ${classLabel(key)}: اسم مكرر (${dups.slice(0, 3).join('، ')})${dups.length > 3 ? ' ...' : ''}.` });
    }
    return issues;
  }

  // =====================================================================================================
  // 6) المهام (قالب + المراحل والصفوف + مجلد الإخراج + نمط اسم الملف) وخطة التوليد
  // =====================================================================================================
  const DEFAULT_FILENAME = '{stage} - الصف {grade} - فصل {cls}';

  /**
   * القوالب المضمّنة مع الإضافة (templates/classbooks). مفتاح القالب هو id المهمة. المسار نسبي لجذر الإضافة.
   * stage/project هنا وصف ما نتوقعه من الملف؛ يتحقق منه preflight من بنية الملف نفسها فيُكشف أي استبدال خاطئ.
   */
  const BUNDLED_TEMPLATES = Object.freeze({
    primary: { file: 'templates/classbooks/primary.xltm', kind: KIND_STAGE_BOOK, project: false, macros: true, label: 'قالب دفاتر الابتدائي' },
    prep: { file: 'templates/classbooks/prep.xltm', kind: KIND_STAGE_BOOK, project: false, macros: true, label: 'قالب دفاتر الإعدادي' },
    sec: { file: 'templates/classbooks/sec.xltm', kind: KIND_STAGE_BOOK, project: false, macros: true, label: 'قالب دفاتر الثانوي (بدون مشروع)' },
    sec_project: { file: 'templates/classbooks/sec_project.xltm', kind: KIND_STAGE_BOOK, project: true, macros: true, label: 'قالب دفاتر الثانوي (بعمود المشروع)' },
    art: { file: 'templates/classbooks/art_137.xltm', kind: KIND_ART, project: false, macros: false, label: 'قالب التربية الفنية (القرار 137)' },
    behavior: { file: 'templates/classbooks/behavior_5.xltm', kind: KIND_BEHAVIOR, project: false, macros: true, label: 'قالب دفتر 5 سلوك' }
  });

  function defaultJobs() {
    const all = (n) => Array.from({ length: n }, (_, i) => i + 1);
    return [
      { id: 'primary', label: 'دفاتر المرحلة الابتدائية', kind: KIND_STAGE_BOOK, template: 'primary', enabled: true, stages: ['primary'], grades: all(6), folder: 'ابتدائي', filename: DEFAULT_FILENAME },
      { id: 'prep', label: 'دفاتر المرحلة الإعدادية', kind: KIND_STAGE_BOOK, template: 'prep', enabled: true, stages: ['prep'], grades: all(3), folder: 'إعدادي', filename: DEFAULT_FILENAME },
      { id: 'sec', label: 'دفاتر الثانوي (قالب بدون مشروع)', kind: KIND_STAGE_BOOK, template: 'sec', enabled: true, stages: ['sec'], grades: all(3), folder: 'ثانوي - قالب بدون مشروع', filename: DEFAULT_FILENAME },
      // معطّلة افتراضيًا: تضاعف ملفات الثانوي (5.7 ميغابايت للملف). فعّلها للصفوف التي يُدرَّس لها مشروع.
      { id: 'sec_project', label: 'دفاتر الثانوي (قالب بعمود المشروع)', kind: KIND_STAGE_BOOK, template: 'sec_project', enabled: false, stages: ['sec'], grades: all(3), folder: 'ثانوي - قالب بعمود المشروع', filename: DEFAULT_FILENAME },
      { id: 'art', label: 'التربية الفنية - القرار 137', kind: KIND_ART, template: 'art', enabled: true, stages: ['prep'], grades: all(3), folder: 'التربية الفنية - إعدادي', filename: 'كشف القرار 137 - الصف {grade} الإعدادي - فصل {cls}' },
      { id: 'behavior', label: 'دفتر 5 سلوك', kind: KIND_BEHAVIOR, template: 'behavior', enabled: true, stages: [...STAGE_ORDER], grades: all(6), folder: 'دفتر 5 سلوك', filename: 'دفتر 5 سلوك - {stage} - الصف {grade} - فصل {cls}' }
    ];
  }

  function jobApplies(job, key) {
    const [stage, grade] = key;
    return !!job.enabled && job.stages.includes(stage) && job.grades.includes(grade);
  }

  function formatFilename(pattern, key, yearText = '') {
    const [stage, grade, cls] = key;
    const vars = {
      stage: STAGE_INFO[stage][0], stage_adj: STAGE_INFO[stage][1], grade: GRADE_DISPLAY[grade] || String(grade),
      grade_no: String(grade), cls: String(cls), year: String(yearText).replace(/\//g, '-').replace(/ /g, '')
    };
    const name = String(pattern || DEFAULT_FILENAME).replace(/\{(\w+)\}/g, (m, k) => (Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : m));
    return safeFilename(name);
  }

  /**
   * خطة التوليد: [{job, key, students, folder, filename}]. تُستبعد المهام التي لا يصلح لها قالب (infos[job.template].ok).
   * maxPerJob: 1 = تجربة (أول فصل من كل مهمة فقط).
   */
  function makePlan(classes, jobs, infos, options = {}) {
    const opt = normalizeOptions(options);
    const tasks = []; const used = new Set(); const perJob = new Map();
    for (const { key, students } of classes) {
      for (const job of jobs) {
        if (!jobApplies(job, key)) continue;
        const info = infos[job.template];
        if (!info || !info.ok) continue;
        if (options.maxPerJob && (perJob.get(job.id) || 0) >= options.maxPerJob) continue;
        perJob.set(job.id, (perJob.get(job.id) || 0) + 1);
        const ext = info.hasMacros ? '.xlsm' : '.xlsx';
        const folder = job.folder ? safeFilename(job.folder) : '';
        const base = formatFilename(job.filename, key, opt.yearText);
        let file = base + ext; let n = 2;
        while (used.has((folder + '/' + file).toLowerCase())) { file = `${base} (${n})${ext}`; n++; }
        used.add((folder + '/' + file).toLowerCase());
        tasks.push({ job, key, students, folder, filename: file, mime: info.hasMacros ? MIME_XLSM : MIME_XLSX, label: `${job.label} — ${classLabel(key)}` });
      }
    }
    return tasks;
  }

  /** مشاكل ما قبل التشغيل: [{level, text}] — قالب غير صالح أو من نوع غير المتوقع. */
  function preflight(jobs, classes, infos) {
    const problems = [];
    for (const j of jobs) {
      if (!j.enabled) continue;
      const n = classes.filter((c) => jobApplies(j, c.key)).length;
      if (!n) continue;
      const info = infos[j.template];
      const spec = BUNDLED_TEMPLATES[j.template];
      if (!info) problems.push({ level: 'error', text: `«${j.label}»: لم يُحدَّد قالب (ينطبق على ${n} فصلًا).` });
      else if (!info.ok) problems.push({ level: 'error', text: `«${j.label}»: ${info.message || 'قالب غير صالح'}.` });
      else if (info.kind !== j.kind) problems.push({ level: 'warn', text: `«${j.label}»: القالب يبدو من نوع «${KIND_LABELS[info.kind]}» بينما المهمة من نوع «${KIND_LABELS[j.kind]}»؛ قد يفشل التوليد.` });
      else if (spec && !info.custom && j.kind === KIND_STAGE_BOOK && info.hasProject !== spec.project) problems.push({ level: 'warn', text: `«${j.label}»: ملف القالب ${info.hasProject ? 'فيه' : 'ليس فيه'} عمود المشروع على غير المتوقع لهذه المهمة.` });
    }
    return problems;
  }

  /**
   * ينفّذ الخطة. loadTemplate(key) -> Promise<Uint8Array>؛ deliver({bytes, folder, filename, mime, task}) -> Promise.
   * خطأ في ملف لا يوقف الباقي. يعيد [{task, status: 'ok'|'error', message, warnings}].
   */
  async function runPlan(tasks, options, io) {
    const { loadTemplate, deliver, onProgress, shouldCancel } = io;
    const cache = new Map();
    const results = [];
    for (let i = 0; i < tasks.length; i++) {
      if (shouldCancel && shouldCancel()) break;
      const t = tasks[i];
      if (onProgress) onProgress(i, tasks.length, t.label);
      try {
        if (!cache.has(t.job.template)) cache.set(t.job.template, await TemplateData.load(await loadTemplate(t.job.template), BUNDLED_TEMPLATES[t.job.template]?.label || t.job.template));
        const tpl = cache.get(t.job.template);
        const { bytes, warnings } = await BUILDERS[t.job.kind](tpl, t.key[0], t.key[1], t.key[2], t.students, options);
        await deliver({ bytes, folder: t.folder, filename: t.filename, mime: t.mime, task: t });
        results.push({ task: t, status: 'ok', message: '', warnings: warnings || [] });
      } catch (e) {
        if (e && (e.code === 'USER_STOPPED' || /إلغاء العملية|إيقاف/.test(String(e.message || '')))) throw e;
        results.push({ task: t, status: 'error', message: e instanceof ClassTooBig || e instanceof TemplateError ? e.message : `خطأ غير متوقع: ${(e && e.message) || e}`, warnings: [] });
      }
    }
    if (onProgress) onProgress(results.length, tasks.length, '');
    return results;
  }

  /** يقرأ القوالب اللازمة لمهام مفعّلة ويكتشف أنواعها: {مفتاح: info}. قالب تعذّر فتحه يُسجَّل بـ ok:false ورسالته. */
  async function inspectTemplates(jobs, loadTemplate) {
    const infos = {};
    for (const j of jobs) {
      if (!j.enabled || j.template in infos) continue;
      try {
        infos[j.template] = detectTemplate(await TemplateData.load(await loadTemplate(j.template), BUNDLED_TEMPLATES[j.template]?.label || j.template));
      } catch (e) {
        infos[j.template] = { ok: false, kind: KIND_UNKNOWN, hasProject: false, hasMacros: false, sheets: [], message: (e && e.message) || 'تعذّر فتح القالب' };
      }
    }
    return infos;
  }

  // =====================================================================================================
  // 7) قوالب يرفعها المستخدم بدل المضمّنة: فحص الملف قبل قبوله، ونسخة قابلة للتعديل من القالب المضمّن
  // =====================================================================================================
  const MAX_TEMPLATE_BYTES = 24 * 1048576;     // يمر بين الخلفية والموقع نصَّ base64 (الثلث أكثر) وحدّ الرسالة 64 ميغابايت

  // الخلايا التي يكتب فيها المحرك، لكل نوع: يجب أن تبقى في القالب المعدَّل بتنسيقها. '*' = أول ورقة (اسمها يتغيّر في كشف الفنية).
  const WRITE_CELLS = Object.freeze({
    [KIND_STAGE_BOOK]: { [CLASS_SHEET]: ['A1', 'A2', 'A3', 'C2', 'C3', 'B5', 'C5', 'E5', 'F5', 'B29', 'C29', 'E29', 'F29'] },
    [KIND_BEHAVIOR]: { 'الإعدادات': ['B4', 'B5', 'B6', 'B7', 'B8', 'B9', 'B12', 'B14', 'B15', 'B16'], 'بيانات الطلاب': ['B5', 'C5', 'B54', 'C54'] },
    [KIND_ART]: { '*': ['D1', 'D3', 'A1', 'A4', 'C5', 'F5', 'I5', 'N5', 'O5', 'B8', 'B57', 'L8', 'M8', 'P8', 'L57', 'M57', 'P57'] }
  });

  const SAMPLE_OPTIONS = Object.freeze({
    yearText: (globalThis.NeprasEgypt?.academicYearLabel?.() || '2026 / 2027'), governorate: 'القاهرة', administration: 'المعادي', schoolName: 'مدرسة تجريبية', deputyName: 'وكيل', directorName: 'مدير',
    weeklyOff1: 'الجمعة', weeklyOff2: 'السبت', alertDays: 7, artTerm: 'الأول', artMonths: ['أكتوبر', 'نوفمبر', 'ديسمبر'], artExamMonths: ['نوفمبر', 'ديسمبر']
  });

  /**
   * يفحص ملفًا رفعه المستخدم ليحلّ محل القالب المضمّن `key` قبل حفظه. لا يلمس الملف ولا يحفظه.
   * -> {ok, kind, hasProject, hasMacros, sheets, errors[], warnings[]}. errors تمنع القبول، وwarnings ينبَّه إليها ويُقبل معها.
   * الفحص الحاسم أن نبني منه دفترًا تجريبيًا فعلًا ونقرأه: ما يمرّ هنا يمرّ عند الإنشاء الحقيقي.
   */
  async function checkTemplateUpload(bytes, key, fileName = '') {
    const res = { ok: false, kind: KIND_UNKNOWN, hasProject: false, hasMacros: false, sheets: [], errors: [], warnings: [] };
    const fail = (m) => { res.errors.push(m); return res; };
    const spec = Object.prototype.hasOwnProperty.call(BUNDLED_TEMPLATES, key) ? BUNDLED_TEMPLATES[key] : null;   // لا __proto__ ولا toString
    if (!spec) return fail('قالب غير معروف.');
    if (!bytes || !bytes.length) return fail('الملف فارغ.');
    if (bytes.length > MAX_TEMPLATE_BYTES) {
      return fail(`حجم الملف ${(Math.ceil(bytes.length / 104857.6) / 10).toFixed(1)} ميغابايت والحد ${MAX_TEMPLATE_BYTES / 1048576} ميغابايت. صغّر الصور داخله (مثل الشعار) ثم أعد الرفع.`);
    }
    const label = String(fileName || spec.label);
    let tpl;
    try {
      tpl = await TemplateData.load(bytes, label);
    } catch (e) {
      return fail(`${e instanceof TemplateError ? e.message : 'تعذّر فتح الملف'}. احفظه من Excel بصيغة xlsx أو xlsm أو xltm (وليس xls القديمة) ثم أعد الرفع.`);
    }
    const info = detectTemplate(tpl);
    Object.assign(res, { kind: info.kind, hasProject: info.hasProject, hasMacros: info.hasMacros, sheets: info.sheets });
    if (!info.ok) {
      return fail(`${info.message || 'قالب غير صالح'} (أوراقه: ${info.sheets.slice(0, 6).join('، ') || 'لا شيء'}). المطلوب: ${KIND_LABELS[spec.kind]}. لا تغيّر أسماء الأوراق في القالب الأصلي.`);
    }
    if (info.kind !== spec.kind) return fail(`هذا الملف من نوع «${KIND_LABELS[info.kind]}» بينما هذا القالب لـ «${KIND_LABELS[spec.kind]}».`);

    // الخلايا التي يكتب فيها المحرك
    let pkg;
    try {
      pkg = new Package(tpl);
      const missing = [];
      for (const [sheetName, cells] of Object.entries(WRITE_CELLS[spec.kind])) {
        const name = sheetName === '*' ? pkg.sheetNames()[0] : sheetName;
        const sh = pkg.sheet(name);
        const lost = cells.filter((c) => !sh.cells.has(c));
        if (lost.length) missing.push(`«${name}»: ${lost.slice(0, 6).join('، ')}${lost.length > 6 ? ' ...' : ''}`);
      }
      if (missing.length) res.warnings.push(`لم أجد في القالب هذه الخلايا التي تُملأ تلقائيًا (${missing.join(' | ')})؛ ستُكتب البيانات فيها بلا تنسيق القالب.`);
    } catch (e) {
      return fail(`${e instanceof TemplateError ? e.message : 'تعذّر قراءة أوراق القالب'}.`);
    }

    // الدفتر التجريبي: بناء فعلي ثم قراءة ما كُتب
    try {
      const n = spec.kind === KIND_STAGE_BOOK ? 26 : 3;
      const students = Array.from({ length: n }, (_, i) => ({ name: `طالب تجريبي ${i + 1}`, status: 'مقيد', phone: `0100000000${i % 10}` }));
      const out = await BUILDERS[spec.kind](tpl, 'prep', 1, '1', students, SAMPLE_OPTIONS);
      const back = new Package(await TemplateData.load(out.bytes, label));
      const probe = spec.kind === KIND_STAGE_BOOK ? [[back.sheet(CLASS_SHEET), 'B5', students[0].name], [back.sheet(CLASS_SHEET), 'E5', students[25].name]]
        : spec.kind === KIND_BEHAVIOR ? [[back.sheet('بيانات الطلاب'), 'B5', students[0].name], [back.sheet('بيانات الطلاب'), 'B7', students[2].name]]
          : [[back.sheet(back.sheetNames()[0]), 'B8', students[0].name], [back.sheet(back.sheetNames()[0]), 'B10', students[2].name]];
      for (const [sh, ref, want] of probe) if (sh.text(ref) !== want) return fail(`جرّبتُ إنشاء دفتر من هذا القالب فلم تظهر الأسماء في الخلية ${ref} من «${sh.name}». لا تنقل خلايا الأسماء ولا تدمجها.`);
    } catch (e) {
      return fail(`جرّبتُ إنشاء دفتر من هذا القالب فتعذّر: ${e instanceof TemplateError || e instanceof ClassTooBig ? e.message : (e && e.message) || e}.`);
    }

    if (spec.macros && !info.hasMacros) res.warnings.push('القالب بلا ماكرو بينما المضمّن فيه ماكرو؛ ستُحفظ الدفاتر بصيغة xlsx وتفقد وظائف الماكرو.');
    if (!spec.macros && info.hasMacros) res.warnings.push('القالب فيه ماكرو بينما المضمّن بلا ماكرو؛ ستُحفظ الدفاتر بصيغة xlsm.');
    if (spec.kind === KIND_STAGE_BOOK && info.hasProject !== spec.project) res.warnings.push(`القالب ${info.hasProject ? 'فيه' : 'ليس فيه'} عمود المشروع، والمضمّن ${spec.project ? 'فيه' : 'ليس فيه'} العمود.`);
    res.ok = true;
    return res;
  }

  /**
   * نسخة من قالب مضمّن للتعديل في Excel. القوالب المضمّنة بصيغة .xltm: يفتحها Excel بنقرتين مصنفًا جديدًا غير محفوظ، فنسلّم نسخة
   * مصنف عادي (.xlsm/.xlsx) بمحتوى القالب نفسه تُفتح وتُعدَّل وتُحفظ فوق نفسها. -> {bytes, ext, mime}
   */
  async function editableCopy(bytes, label = 'القالب') {
    const tpl = await TemplateData.load(bytes, label);
    const pkg = new Package(tpl);
    const drop = pkg.finish(contentTypeOf(tpl));
    return { bytes: await pkg.save(drop), ext: tpl.hasMacros ? 'xlsm' : 'xlsx', mime: tpl.hasMacros ? MIME_XLSM : MIME_XLSX };
  }

  globalThis.NeprasClassBooks = Object.freeze({
    // نصوص
    norm, clean, cleanClass, detectStage, detectGrade, compareClass, classTitle, classLabel, stageGradeTitle, safeFilename, stripAdminWords, stripGovWords,
    toAsciiDigits, STAGE_ORDER, STAGE_INFO, GRADE_DISPLAY, STAGE_LETTER, MAX_PER_CLASS, WEEKDAYS,
    // حزمة OOXML
    TemplateData, Package, Sheet, SharedStrings, refreshCached, detectTemplate, TemplateError, ClassTooBig,
    // بانيات
    buildStageBook, buildArtBook, buildBehaviorBook, BUILDERS, normalizeOptions, DEFAULT_OPTIONS,
    KIND_STAGE_BOOK, KIND_ART, KIND_BEHAVIOR, KIND_LABELS,
    // الطلاب والمهام والخطة
    stageKeyFromSelection, normalizeStudents, groupClasses, validateStudents,
    BUNDLED_TEMPLATES, DEFAULT_FILENAME, defaultJobs, jobApplies, formatFilename, makePlan, preflight, runPlan, inspectTemplates,
    // قوالب المستخدم
    MAX_TEMPLATE_BYTES, checkTemplateUpload, editableCopy
  });
})();
