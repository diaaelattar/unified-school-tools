/**
 * Nepras — shared ZIP/XLSX writer primitives.
 *
 * Phase 2: extracted from three near-identical hand-rolled copies that had
 * accumulated independently in content.js (staff export), modules/export.js
 * (student / class-report / school-stats / expenses export), and
 * modules/attendance.js. All three built a minimal, uncompressed ("Stored")
 * ZIP container for the handful of small XML parts inside an .xlsx, without
 * pulling in the full xlsx.full.min.js write path — this file is that logic,
 * written once.
 *
 * 1.2.90: the file also holds the shared XLSX layer (cells, table styles, a full table
 * sheet, package assembly) — see the section after neprasZipXmlEscape below. The staff,
 * student (single/multi sheet) and attendance builders now only describe their own data.
 *
 * 1.2.92: a raw ZIP layer (neprasZipReadEntries / neprasZipEntryData / neprasZipWriteEntries ...)
 * that reads an existing archive and rewrites it while copying untouched entries verbatim
 * (still compressed). Shared by modules/template_fill.js and modules/class_books.js.
 *
 * Load order: this file must load before modules/export.js,
 * modules/attendance.js, and content.js (see background.js's injection
 * lists). It has no dependency on xlsx.full.min.js or any other module.
 *
 * Phase 2 found two small behavioral differences between the three original
 * copies (attendance's ZIP entries didn't set the UTF-8 general-purpose
 * flag the other two set, and attendance's XML escaping didn't strip
 * XML-1.0-illegal control characters the way the other two did). Phase 2
 * itself preserved both differences exactly, one file per original
 * behavior. A same-day follow-up harmonized attendance to match staff/
 * student on both points — see PHASE_NOTES.md, "Phase 2 follow-up (control
 * characters + ZIP flag), harmonized" for the reasoning. The
 * `generalPurposeFlag` and `stripControlChars` options below are kept as
 * general-purpose escape hatches (e.g. for a future writer with a genuine
 * reason to differ), not because any current caller still needs them.
 */

const NEPRAS_ZIP_CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

function neprasZipCrc32(bytes) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) crc = NEPRAS_ZIP_CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function neprasZipU16(value) {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setUint16(0, value & 0xFFFF, true);
  return b;
}

function neprasZipU32(value) {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, value >>> 0, true);
  return b;
}

function neprasZipConcat(parts) {
  const len = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

function neprasZipDosDateTime(date = new Date()) {
  const y = Math.max(1980, date.getFullYear());
  return {
    time: ((date.getHours() & 31) << 11) | ((date.getMinutes() & 63) << 5) | (Math.floor(date.getSeconds() / 2) & 31),
    date: (((y - 1980) & 127) << 9) | (((date.getMonth() + 1) & 15) << 5) | (date.getDate() & 31)
  };
}

/**
 * Build a minimal "Stored" (uncompressed) ZIP from {name, data} entries.
 * @param {{name: string, data: string|Uint8Array}[]} entries
 * @param {{generalPurposeFlag?: number}} [options] generalPurposeFlag defaults
 *   to 0x0800 (UTF-8 flag). No current caller overrides this — kept as an
 *   escape hatch, see this file's header comment.
 */
function neprasBuildZip(entries, options = {}) {
  const generalPurposeFlag = options.generalPurposeFlag ?? 0x0800;
  const enc = new TextEncoder();
  const locals = [], centrals = [];
  let offset = 0;
  const dos = neprasZipDosDateTime();
  for (const e of entries) {
    const name = enc.encode(e.name);
    const data = typeof e.data === "string" ? enc.encode(e.data) : e.data;
    const crc = neprasZipCrc32(data);
    const local = neprasZipConcat([
      neprasZipU32(0x04034B50), neprasZipU16(20), neprasZipU16(generalPurposeFlag), neprasZipU16(0),
      neprasZipU16(dos.time), neprasZipU16(dos.date), neprasZipU32(crc),
      neprasZipU32(data.length), neprasZipU32(data.length), neprasZipU16(name.length), neprasZipU16(0), name
    ]);
    locals.push(local, data);
    centrals.push(neprasZipConcat([
      neprasZipU32(0x02014B50), neprasZipU16(20), neprasZipU16(20), neprasZipU16(generalPurposeFlag), neprasZipU16(0),
      neprasZipU16(dos.time), neprasZipU16(dos.date), neprasZipU32(crc),
      neprasZipU32(data.length), neprasZipU32(data.length), neprasZipU16(name.length),
      neprasZipU16(0), neprasZipU16(0), neprasZipU16(0), neprasZipU16(0), neprasZipU32(0), neprasZipU32(offset), name
    ]));
    offset += local.length + data.length;
  }
  const ld = neprasZipConcat(locals), cd = neprasZipConcat(centrals);
  const end = neprasZipConcat([
    neprasZipU32(0x06054B50), neprasZipU16(0), neprasZipU16(0), neprasZipU16(entries.length), neprasZipU16(entries.length),
    neprasZipU32(cd.length), neprasZipU32(ld.length), neprasZipU16(0)
  ]);
  return neprasZipConcat([ld, cd, end]);
}

// ----------------------------------------------------------------------------
// ZIP خام (1.2.92): قراءة أجزاء الأرشيف دون فك ضغطها، وكتابة أرشيف بنسخ الأجزاء المضغوطة كما هي.
// لماذا: دفاتر الفصول (modules/class_books.js) تُنتَج من قوالب xltm فيها صورة غلاف بحجم 5 ميغابايت وماكرو؛ نعدّل نحو أربعة أجزاء XML
// فقط من كل ملف، فننسخ الباقي بايتًا ببايت (بلا فك ولا إعادة ضغط ولا تغيّر في الماكرو) بدل تخزين كل شيء من جديد.
// القراءة تعتمد الدليل المركزي (أحجام الدليل لا الرؤوس المحلية) فتصلح لملفات Excel التي تكتب «واصف البيانات» بعد المحتوى.
// ----------------------------------------------------------------------------
const NEPRAS_ZIP_MAX_UNZIPPED_BYTES = 64 * 1024 * 1024;   // سقف مجموع الأحجام بعد الفك: حماية من أرشيف مضغوط ضخم

function neprasZipError(message) {
  const e = new Error(message);
  e.code = "ZIP_INVALID";
  return e;
}

/**
 * يقرأ الدليل المركزي فقط. يعيد [{name, method, crc, csize, usize, raw}] بترتيب الأرشيف (raw: البايتات كما هي في الملف).
 * يرمي خطأ برمز ZIP_INVALID لملف ليس zip أو تالف أو zip64 أو أكبر من السقف.
 */
function neprasZipReadEntries(bytes, options = {}) {
  const maxUnzipped = options.maxUnzipped ?? NEPRAS_ZIP_MAX_UNZIPPED_BYTES;
  if (!(bytes instanceof Uint8Array)) throw neprasZipError("المدخل ليس بايتات");
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (dv.getUint32(i, true) === 0x06054B50) { eocd = i; break; }
  }
  if (eocd < 0) throw neprasZipError("الملف ليس بصيغة zip");
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder("utf-8");
  const entries = [];
  let unzipped = 0;
  for (let i = 0; i < count; i++) {
    if (p + 46 > bytes.length || dv.getUint32(p, true) !== 0x02014B50) throw neprasZipError("دليل zip تالف");
    const method = dv.getUint16(p + 10, true);
    const crc = dv.getUint32(p + 16, true);
    const csize = dv.getUint32(p + 20, true);
    const usize = dv.getUint32(p + 24, true);
    const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const lho = dv.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + elen + clen;
    if (name.endsWith("/")) continue;
    if (csize === 0xFFFFFFFF || usize === 0xFFFFFFFF) throw neprasZipError("zip64 غير مدعوم");
    unzipped += usize;
    if (unzipped > maxUnzipped) throw neprasZipError("محتوى الأرشيف بعد فك الضغط كبير جدًا");
    if (lho + 30 > bytes.length || dv.getUint32(lho, true) !== 0x04034B50) throw neprasZipError("ترويسة zip محلية تالفة");
    const start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
    if (start + csize > bytes.length) throw neprasZipError("جزء zip مقطوع: " + name);
    entries.push({ name, method, crc, csize, usize, raw: bytes.subarray(start, start + csize) });
  }
  return entries;
}

async function neprasZipStreamAll(stream, input, maxBytes) {
  const writer = stream.writable.getWriter();
  writer.write(input).catch(() => {});
  writer.close().catch(() => {});
  const reader = stream.readable.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
    if (maxBytes && total > maxBytes) throw neprasZipError("ناتج الفك أكبر من السقف");
  }
  return neprasZipConcat(chunks);
}

/** فك ضغط deflate الخام (طريقة 8). */
async function neprasZipInflate(raw, maxBytes = NEPRAS_ZIP_MAX_UNZIPPED_BYTES) {
  if (typeof DecompressionStream !== "function") throw neprasZipError("المتصفح لا يوفّر DecompressionStream");
  return neprasZipStreamAll(new DecompressionStream("deflate-raw"), raw, maxBytes);
}

/** ضغط deflate الخام. */
async function neprasZipDeflate(bytes) {
  if (typeof CompressionStream !== "function") throw neprasZipError("المتصفح لا يوفّر CompressionStream");
  return neprasZipStreamAll(new CompressionStream("deflate-raw"), bytes, 0);
}

/** محتوى جزء مقروء بـ neprasZipReadEntries بعد فكه (طريقة 0 تُنسخ، 8 تُفكّ، غيرهما خطأ). يتحقق من الحجم المعلَن. */
async function neprasZipEntryData(entry, maxBytes = NEPRAS_ZIP_MAX_UNZIPPED_BYTES) {
  let data;
  if (entry.method === 0) data = entry.raw.slice();
  else if (entry.method === 8) data = await neprasZipInflate(entry.raw, maxBytes);
  else throw neprasZipError("طريقة ضغط غير مدعومة (" + entry.method + ")");
  if (data.length !== entry.usize) throw neprasZipError("حجم جزء لا يطابق الدليل: " + entry.name);
  return data;
}

/**
 * يكتب أرشيفًا من أجزاء مضغوطة جاهزة: [{name, method(0|8), crc, usize, raw}] — لا يضغط ولا يفك شيئًا.
 * (لإضافة جزء جديد: ضغطه بـ neprasZipDeflate وحساب crc بـ neprasZipCrc32 أولًا.)
 */
function neprasZipWriteEntries(entries) {
  const enc = new TextEncoder();
  const flag = 0x0800;
  const dos = neprasZipDosDateTime();
  const locals = [], centrals = [];
  let offset = 0;
  for (const e of entries) {
    const name = enc.encode(e.name);
    const local = neprasZipConcat([
      neprasZipU32(0x04034B50), neprasZipU16(20), neprasZipU16(flag), neprasZipU16(e.method),
      neprasZipU16(dos.time), neprasZipU16(dos.date), neprasZipU32(e.crc),
      neprasZipU32(e.raw.length), neprasZipU32(e.usize), neprasZipU16(name.length), neprasZipU16(0), name
    ]);
    locals.push(local, e.raw);
    centrals.push(neprasZipConcat([
      neprasZipU32(0x02014B50), neprasZipU16(20), neprasZipU16(20), neprasZipU16(flag), neprasZipU16(e.method),
      neprasZipU16(dos.time), neprasZipU16(dos.date), neprasZipU32(e.crc),
      neprasZipU32(e.raw.length), neprasZipU32(e.usize), neprasZipU16(name.length),
      neprasZipU16(0), neprasZipU16(0), neprasZipU16(0), neprasZipU16(0), neprasZipU32(0), neprasZipU32(offset), name
    ]));
    offset += local.length + e.raw.length;
  }
  const ld = neprasZipConcat(locals), cd = neprasZipConcat(centrals);
  const end = neprasZipConcat([
    neprasZipU32(0x06054B50), neprasZipU16(0), neprasZipU16(0), neprasZipU16(entries.length), neprasZipU16(entries.length),
    neprasZipU32(cd.length), neprasZipU32(ld.length), neprasZipU16(0)
  ]);
  return neprasZipConcat([ld, cd, end]);
}

/** Spreadsheet column letter for a 0-based index (0 -> "A", 26 -> "AA"). */
function neprasZipColumnName(index) {
  let n = index + 1, out = "";
  while (n > 0) { const r = (n - 1) % 26; out = String.fromCharCode(65 + r) + out; n = Math.floor((n - 1) / 26); }
  return out;
}

/**
 * Escape a value for use inside an OOXML inline-string cell (or any XML text
 * node built by the writers in this app).
 * @param {*} value
 * @param {{stripControlChars?: boolean}} [options] stripControlChars defaults
 *   to true. No current caller overrides this — kept as an escape hatch, see
 *   this file's header comment.
 */
function neprasZipXmlEscape(value, options = {}) {
  const stripControlChars = options.stripControlChars ?? true;
  let text = String(value ?? "");
  if (stripControlChars) text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, " ");
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ============================================================================
// طبقة XLSX المشتركة (1.2.90): كانت أربعة بنّائين تكرّر هذا كله حرفيًا —
//   content.js (العاملون) و modules/export.js (الطلاب: ورقة واحدة ومتعدد الأوراق) و modules/attendance.js (الغياب).
// الآن يوفّر هذا الملف: خلية نصية/رقمية، فحص عنوان الرقم القومي، أنماط جداول الإضافة، ورقة جدول كاملة،
// وتجميع حزمة XLSX (Content_Types / rels / workbook / styles / docProps). كل بنّاء يبقى مسؤولًا عن بياناته فقط.
// لقطات tests/fixtures/xlsx_builders.golden.json تثبّت أن مخرجات كل بنّاء لم تتغير جزءًا بجزء.
// ============================================================================

/** اسم العلامة التجارية للترويسات (يُقرأ عند الاستدعاء لأن ui/brand.js يُحقن قبل الوحدات). */
function neprasXlsxBrandName() {
  return "نبراس برو 2026";
}

/** حماية خلايا Excel النصية من حقن الصيغ (CSV/Formula Injection) دون المساس بشرطة "-" أو الأرقام السالبة. */
function neprasSanitizeFormulaCell(value) {
  const s = String(value ?? "");
  if (/^[\t\r ]*(?:[=@]|[\+\-](?![\d.\s]*$))/.test(s)) {
    return "'" + s;
  }
  return s;
}

/** خلية نص مضمّنة (inlineStr): لا تمرّ بجدول السلاسل المشتركة فلا يختصر Excel الأكواد الطويلة. */
function neprasXlsxTextCell(ref, value, styleId) {
  return `<c r="${ref}" s="${styleId}" t="inlineStr"><is><t xml:space="preserve">${neprasZipXmlEscape(neprasSanitizeFormulaCell(value))}</t></is></c>`;
}

/** خلية رقمية؛ إذا كانت القيمة فارغة أو غير عددية لا يُكتب 0 زائف تجنباً لتشويه البيانات الناقصة. */
function neprasXlsxNumberCell(ref, value, styleId) {
  if (value == null || String(value).trim() === '') {
    return `<c r="${ref}" s="${styleId}"/>`;
  }
  const n = Number(value);
  if (Number.isFinite(n)) {
    return `<c r="${ref}" s="${styleId}" t="n"><v>${n}</v></c>`;
  }
  return neprasXlsxTextCell(ref, value, styleId);
}

/** هل هذا عنوان عمود «الرقم القومي»؟ (يوحّد الهمزات والياء/الألف المقصورة والتاء المربوطة). */
function neprasXlsxIsNationalIdHeader(header) {
  const h = String(header ?? "")
    .trim()
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ");
  return h.includes("الرقم القومي") || h.includes("رقم قومي");
}

/**
 * أنماط جداول الإضافة (8 أنماط): 0 افتراضي، 1 عنوان الكشف، 2 سطر معلومات، 3 رأس الجدول، 4 خلية وسط،
 * 5 خلية يمين، 6 رقم قومي (نص LTR)، 7 اسم العلامة. يستعملها العاملون والطلاب (ورقة واحدة ومتعدد الأوراق).
 */
const NEPRAS_XLSX_TABLE_STYLES =
  `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<fonts count="5"><font><sz val="11"/><name val="Arial"/><family val="2"/><charset val="178"/></font><font><b/><sz val="15"/><color rgb="FF1F4E78"/><name val="Arial"/><family val="2"/><charset val="178"/></font><font><b/><sz val="12"/><color rgb="FF595959"/><name val="Arial"/><family val="2"/><charset val="178"/></font><font><b/><sz val="13"/><color rgb="FF000000"/><name val="Arial"/><family val="2"/><charset val="178"/></font><font><b/><sz val="18"/><color rgb="FF00843D"/><name val="Arial"/><family val="2"/><charset val="178"/></font></fonts>` +
  `<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF92D050"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFFFFF"/><bgColor indexed="64"/></patternFill></fill></fills>` +
  `<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FF000000"/></left><right style="thin"><color rgb="FF000000"/></right><top style="thin"><color rgb="FF000000"/></top><bottom style="thin"><color rgb="FF000000"/></bottom><diagonal/></border></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="9"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" readingOrder="2"/></xf><xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" readingOrder="2"/></xf><xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" readingOrder="2" wrapText="0" shrinkToFit="1"/></xf><xf numFmtId="49" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1" applyNumberFormat="1"><alignment horizontal="center" vertical="center" readingOrder="2" wrapText="0" shrinkToFit="1"/></xf><xf numFmtId="49" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1" applyNumberFormat="1"><alignment horizontal="right" vertical="center" readingOrder="2" wrapText="0" shrinkToFit="1"/></xf><xf numFmtId="49" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1" applyNumberFormat="1"><alignment horizontal="center" vertical="center" readingOrder="1" wrapText="0" shrinkToFit="1"/></xf><xf numFmtId="0" fontId="4" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" readingOrder="2"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="0" readingOrder="1"/></xf></cellXfs>` +
  `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
  `<dxfs count="0"/><tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>` +
  `</styleSheet>`;
/**
 * ورقة جدول كاملة بالتخطيط المعتمد: صف 1 العلامة، صف 2 العنوان، ثم أسطر المعلومات، ثم سطر العدد والتاريخ، ثم رأس الجدول
 * (مجمّد مع فلتر) ثم الصفوف. RTL بلا خطوط شبكة.
 * @param {object} o
 * @param {string[]} o.headers  عناوين الأعمدة
 * @param {Array<Array>} o.rows  الصفوف (قيمة مفقودة تُكتب فارغة)
 * @param {string} o.title  العنوان بعد التنظيف
 * @param {string} o.countLine  سطر العدد والتاريخ الجاهز
 * @param {number[]} o.widths  عرض كل عمود
 * @param {string[]} [o.infoLines]  أسطر معلومات تُدرج قبل سطر العدد (الفارغ منها يُتجاهل مسبقًا من المستدعي)
 * @param {number[]} [o.rightAlignCols]  أعمدة تُحاذى لليمين (نمط 5)
 * @param {boolean} [o.selected]  الورقة المحددة عند الفتح
 * @param {boolean} [o.printFit]  طباعة A4 طولي بعرض صفحة واحدة
 */
function neprasXlsxBuildTableSheetXml(o) {
  const headers = o.headers, rows = o.rows;
  const infoLines = o.infoLines || [];
  const rightCols = o.rightAlignCols || [];
  const numericCols = o.numericCols || []; // أعمدة تُكتب أرقامًا حقيقية (للجداول المحورية والمجاميع)

  const numCols = Math.max(1, headers.length);
  const lastCol = neprasZipColumnName(numCols - 1);
  const hasSchoolInfo = Array.isArray(infoLines) && infoLines.some(l => /المحافظة|المديرية|الإدارة|المدرسة/.test(String(l)));
  const isOfficialHeader = hasSchoolInfo && numCols >= 4;

  let rowsXml = "";
  let mergesList = [];
  let headerRow = 4;

  if (isOfficialHeader) {
    const govLine = infoLines.find(l => /المحافظة|المديرية/.test(String(l))) || "مديرية التربية والتعليم";
    const admLine = infoLines.find(l => /الإدارة/.test(String(l))) || "الإدارة التعليمية";
    const schLine = infoLines.find(l => /المدرسة/.test(String(l))) || "المدرسة";
    const yearLine = infoLines.find(l => /العام الدراسي|202\d/.test(String(l))) || "العام الدراسي: 2026 - 2027 م";

    const midStartIdx = numCols >= 6 ? 2 : 1;
    const midEndIdx = numCols >= 6 ? numCols - 3 : numCols - 2;
    const leftStartIdx = midEndIdx + 1;

    const midStartCol = neprasZipColumnName(midStartIdx);
    const midEndCol = neprasZipColumnName(midEndIdx);
    const leftStartCol = neprasZipColumnName(leftStartIdx);

    // Row 1: Right (Gov), Center (Main Title Banner), Left (Academic Year)
    rowsXml += `<row r="1" ht="30" customHeight="1">`;
    rowsXml += neprasXlsxTextCell("A1", govLine, 5);
    rowsXml += neprasXlsxTextCell(`${midStartCol}1`, o.title, 1);
    rowsXml += neprasXlsxTextCell(`${leftStartCol}1`, yearLine.split("—")[0].trim(), 2);
    rowsXml += `</row>`;

    // Row 2: Right (Administration), Center (Subtitle / Class info), Left (Date)
    rowsXml += `<row r="2" ht="26" customHeight="1">`;
    rowsXml += neprasXlsxTextCell("A2", admLine, 5);
    const subTitle = yearLine.includes("—") ? yearLine.split("—").slice(1).join("—").trim() : "";
    rowsXml += neprasXlsxTextCell(`${midStartCol}2`, subTitle, 2);
    const todayStr = (typeof getCurrentFormattedDate === "function") ? getCurrentFormattedDate() : "2026/10/23";
    rowsXml += neprasXlsxTextCell(`${leftStartCol}2`, `تاريخ التصدير: ${todayStr}`, 2);
    rowsXml += `</row>`;

    // Row 3: Right (School), Center (Count summary), Left (Brand / App badge)
    rowsXml += `<row r="3" ht="26" customHeight="1">`;
    rowsXml += neprasXlsxTextCell("A3", schLine, 5);
    rowsXml += neprasXlsxTextCell(`${midStartCol}3`, o.countLine || "", 2);
    rowsXml += neprasXlsxTextCell(`${leftStartCol}3`, neprasXlsxBrandName(), 2);
    rowsXml += `</row>`;

    // Header Merges
    if (midStartIdx > 1) {
      mergesList.push(`<mergeCell ref="A1:B1"/>`, `<mergeCell ref="A2:B2"/>`, `<mergeCell ref="A3:B3"/>`);
    }
    if (midStartCol !== midEndCol) {
      mergesList.push(`<mergeCell ref="${midStartCol}1:${midEndCol}1"/>`, `<mergeCell ref="${midStartCol}2:${midEndCol}2"/>`, `<mergeCell ref="${midStartCol}3:${midEndCol}3"/>`);
    }
    if (leftStartCol !== lastCol) {
      mergesList.push(`<mergeCell ref="${leftStartCol}1:${lastCol}1"/>`, `<mergeCell ref="${leftStartCol}2:${lastCol}2"/>`, `<mergeCell ref="${leftStartCol}3:${lastCol}3"/>`);
    }

    headerRow = 4;
  } else {
    const countRow = 3 + infoLines.length;
    headerRow = countRow + 1;

    rowsXml += `<row r="1" ht="32" customHeight="1">${neprasXlsxTextCell("A1", neprasXlsxBrandName(), 7)}</row>`;
    rowsXml += `<row r="2" ht="30" customHeight="1">${neprasXlsxTextCell("A2", o.title, 1)}</row>`;
    infoLines.forEach((line, li) => {
      const rr = 3 + li;
      rowsXml += `<row r="${rr}" ht="24" customHeight="1">${neprasXlsxTextCell(`A${rr}`, line, 2)}</row>`;
    });
    rowsXml += `<row r="${countRow}" ht="24" customHeight="1">${neprasXlsxTextCell(`A${countRow}`, o.countLine, 2)}</row>`;

    for (let i = 0; i < countRow; i++) {
      mergesList.push(`<mergeCell ref="A${i + 1}:${lastCol}${i + 1}"/>`);
    }
  }

  let lastRow = rows.length + headerRow;

  // Table Headers Row
  rowsXml += `<row r="${headerRow}" ht="30" customHeight="1">`;
  headers.forEach((header, c) => { rowsXml += neprasXlsxTextCell(`${neprasZipColumnName(c)}${headerRow}`, header, 3); });
  rowsXml += `</row>`;

  // Data Rows
  rows.forEach((row, ri) => {
    const rr = ri + headerRow + 1;
    rowsXml += `<row r="${rr}" ht="24" customHeight="1">`;
    headers.forEach((header, c) => {
      let styleId = rightCols.includes(c) ? 5 : 4;
      if (neprasXlsxIsNationalIdHeader(header)) styleId = 6;
      const cellRef = `${neprasZipColumnName(c)}${rr}`;
      if (numericCols.includes(c) && !neprasXlsxIsNationalIdHeader(header)) {
        rowsXml += neprasXlsxNumberCell(cellRef, row?.[c], 8);
      } else {
        rowsXml += neprasXlsxTextCell(cellRef, row?.[c] ?? "", styleId);
      }
    });
    rowsXml += `</row>`;
  });

  // Optional Official Signature Footer Row
  if (Array.isArray(o.footerSigners) && o.footerSigners.length > 0 && numCols >= o.footerSigners.length) {
    const signers = o.footerSigners;
    const signRow = lastRow + 2;
    lastRow = signRow;
    rowsXml += `<row r="${signRow}" ht="28" customHeight="1">`;
    const span = Math.floor(numCols / signers.length);
    signers.forEach((sig, si) => {
      const startC = si * span;
      const endC = (si === signers.length - 1) ? (numCols - 1) : ((si + 1) * span - 1);
      const startCol = neprasZipColumnName(startC);
      const endCol = neprasZipColumnName(endC);
      rowsXml += neprasXlsxTextCell(`${startCol}${signRow}`, sig, 2);
      for (let c = startC + 1; c <= endC; c++) {
        rowsXml += neprasXlsxTextCell(`${neprasZipColumnName(c)}${signRow}`, "", 2);
      }
      if (startCol !== endCol) {
        mergesList.push(`<mergeCell ref="${startCol}${signRow}:${endCol}${signRow}"/>`);
      }
    });
    rowsXml += `</row>`;
  }

  let colsXml = "";
  headers.forEach((_, c) => { colsXml += `<col min="${c + 1}" max="${c + 1}" width="${o.widths[c]}" customWidth="1" bestFit="1"/>`; });
  const mergeXml = mergesList.join("");
  const pageOrientation = (o.orientation === "landscape" || o.orientation === "portrait")
    ? o.orientation
    : (numCols >= 10 ? "landscape" : "portrait");

  return (
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    (o.printFit ? `<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>` : "") +
    `<dimension ref="A1:${lastCol}${lastRow}"/>` +
    `<sheetViews><sheetView rightToLeft="1" showGridLines="0"${o.selected ? ' tabSelected="1"' : ""} workbookViewId="0">` +
    `<pane ySplit="${headerRow}" topLeftCell="A${headerRow + 1}" activePane="bottomLeft" state="frozen"/>` +
    `<selection pane="bottomLeft" activeCell="A${headerRow + 1}" sqref="A${headerRow + 1}"/>` +
    `</sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="24"/>` +
    `<cols>${colsXml}</cols>` +
    `<sheetData>${rowsXml}</sheetData>` +
    `<autoFilter ref="A${headerRow}:${lastCol}${rows.length + headerRow}"/>` +
    (mergesList.length ? `<mergeCells count="${mergesList.length}">${mergeXml}</mergeCells>` : "") +
    (o.printFit ? `<printOptions horizontalCentered="1"/>` : "") +
    `<pageMargins left="0.3" right="0.3" top="0.4" bottom="0.4" header="0.2" footer="0.2"/>` +
    (o.printFit ? `<pageSetup paperSize="9" orientation="${pageOrientation}" fitToWidth="1" fitToHeight="0"/>` : "") +
    (o.printFit ? `<headerFooter><oddFooter>&amp;Cصفحة &amp;P من &amp;N</oddFooter></headerFooter>` : "") +
    `</worksheet>`
  );
}

/**
 * اسم ورقة صالح في Excel: يستبدل الرموز الممنوعة (\ / : * ? [ ]) بمسافة، حتى 31 حرفًا، وبلا تكرار داخل usedNames
 * (يُضاف إليها الاسم النهائي) بلاحقة « (2)» ثم « (3)»…؛ Excel لا يفرّق بين الأحرف الكبيرة والصغيرة في الاسم فنقارن بلا اعتبار لها.
 */
function neprasXlsxSafeSheetName(value, usedNames) {
  let base =
    String(value || "بيانات")
      .replace(/[\\\/:*?\[\]]/g, " ")
      .replace(/\s+/g, " ")
      .trim() ||
    "بيانات";

  if (base.length > 31) {
    base = base.slice(0, 31);
  }

  let name = base;
  let n = 2;

  const taken = (candidate) => { const l = candidate.toLowerCase(); for (const u of usedNames) if (u.toLowerCase() === l) return true; return false; };
  while (taken(name)) {
    const suffix =
      ` (${n++})`;

    name =
      base.slice(
        0,
        Math.max(
          1,
          31 - suffix.length
        )
      ) + suffix;
  }

  usedNames.add(name);
  return name;
}

const NEPRAS_XLSX_REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const NEPRAS_XLSX_CT_PREFIX = "application/vnd.openxmlformats-officedocument.spreadsheetml.";

/**
 * يجمّع حزمة XLSX كاملة (Stored ZIP) من أوراق جاهزة.
 * @param {object} spec
 * @param {{name: string, xml: string}[]} spec.sheets  اسم الورقة (≤31 حرفًا، يُهرَّب هنا) ونص XML الجاهز
 * @param {string} spec.stylesXml  نص xl/styles.xml
 * @param {boolean} [spec.activeTab]  يكتب activeTab="0" في workbookView
 * @param {{title: string}} [spec.docProps]  إن وُجد: تُضاف docProps/core.xml وapp.xml وworkbookPr وcalcPr
 *   (حزمة تشبه ما يكتبه Excel نفسه) بعنوان المستند المعطى والعلامة التجارية مؤلفًا.
 * @returns {Uint8Array}
 */
function neprasXlsxBuildPackage(spec) {
  const sheets = spec.sheets;
  if (!Array.isArray(sheets) || !sheets.length) throw new Error("neprasXlsxBuildPackage: لا توجد أوراق");
  const docProps = spec.docProps || null;
  const esc = neprasZipXmlEscape;
  const PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships";

  const contentTypes =
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="${NEPRAS_XLSX_CT_PREFIX}sheet.main+xml"/>` +
    sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="${NEPRAS_XLSX_CT_PREFIX}worksheet+xml"/>`).join("") +
    `<Override PartName="/xl/styles.xml" ContentType="${NEPRAS_XLSX_CT_PREFIX}styles+xml"/>` +
    (docProps
      ? `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
        `<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>`
      : "") +
    `</Types>`;

  const rootRels =
    `<Relationships xmlns="${PKG_REL}">` +
    `<Relationship Id="rId1" Type="${NEPRAS_XLSX_REL_NS}/officeDocument" Target="xl/workbook.xml"/>` +
    (docProps
      ? `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
        `<Relationship Id="rId3" Type="${NEPRAS_XLSX_REL_NS}/extended-properties" Target="docProps/app.xml"/>`
      : "") +
    `</Relationships>`;

  const printTitleDefs = sheets
    .map((s, i) => {
      if (!s.repeatRows) return "";
      const m = String(s.repeatRows).match(/^(\d+):(\d+)$/);
      if (!m) return "";
      const quotedSheet = `'${String(s.name || "").replace(/'/g, "''")}'!$${m[1]}:$${m[2]}`;
      return `<definedName name="_xlnm.Print_Titles" localSheetId="${i}">${esc(quotedSheet)}</definedName>`;
    })
    .filter(Boolean)
    .join("");

  const workbook =
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${NEPRAS_XLSX_REL_NS}">` +
    (docProps ? `<workbookPr/>` : "") +
    `<bookViews><workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="12000"${spec.activeTab ? ' activeTab="0"' : ""}/></bookViews>` +
    `<sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>` +
    (printTitleDefs ? `<definedNames>${printTitleDefs}</definedNames>` : "") +
    (docProps ? `<calcPr calcId="191029"/>` : "") +
    `</workbook>`;

  const workbookRels =
    `<Relationships xmlns="${PKG_REL}">` +
    sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${NEPRAS_XLSX_REL_NS}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
    `<Relationship Id="rId${sheets.length + 1}" Type="${NEPRAS_XLSX_REL_NS}/styles" Target="styles.xml"/>` +
    `</Relationships>`;

  const entries = [
    { name: "[Content_Types].xml", data: contentTypes },
    { name: "_rels/.rels", data: rootRels }
  ];

  if (docProps) {
    const brand = esc(neprasXlsxBrandName());
    const stamp = new Date().toISOString();
    const appXml =
      `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">` +
      `<Application>Microsoft Excel</Application><DocSecurity>0</DocSecurity><ScaleCrop>false</ScaleCrop>` +
      `<HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>${sheets.length}</vt:i4></vt:variant></vt:vector></HeadingPairs>` +
      `<TitlesOfParts><vt:vector size="${sheets.length}" baseType="lpstr">${sheets.map((s) => `<vt:lpstr>${esc(s.name)}</vt:lpstr>`).join("")}</vt:vector></TitlesOfParts>` +
      `<Company>${brand}</Company><LinksUpToDate>false</LinksUpToDate><SharedDoc>false</SharedDoc><HyperlinksChanged>false</HyperlinksChanged><AppVersion>16.0300</AppVersion>` +
      `</Properties>`;
    const coreXml =
      `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
      `<dc:creator>${brand}</dc:creator><cp:lastModifiedBy>${brand}</cp:lastModifiedBy><dc:title>${esc(docProps.title)}</dc:title>` +
      `<dcterms:created xsi:type="dcterms:W3CDTF">${stamp}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${stamp}</dcterms:modified>` +
      `</cp:coreProperties>`;
    entries.push({ name: "docProps/app.xml", data: appXml }, { name: "docProps/core.xml", data: coreXml });
  }

  entries.push(
    { name: "xl/workbook.xml", data: workbook },
    { name: "xl/_rels/workbook.xml.rels", data: workbookRels },
    { name: "xl/styles.xml", data: spec.stylesXml }
  );
  sheets.forEach((s, i) => entries.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: s.xml }));
  return neprasBuildZip(entries);
}

/**
 * بناء مصنف Excel متعدد الأوراق متكامل التنسيق بالأنماط الرسمية المعتمدة لنبراس
 * @param {Array<Object>} sheetSpecs مصفوفة مواصفات الأوراق
 * @returns {Uint8Array}
 */
function neprasBuildMultiSheetWorkbook(sheetSpecs) {
  const usedNames = new Set();
  const sheets = (Array.isArray(sheetSpecs) ? sheetSpecs : [])
    .filter(spec => Array.isArray(spec?.headers) && spec.headers.length)
    .map((spec, index) => {
      let safeName = String(spec.name || `ورقة_${index + 1}`).replace(/[\\/*?:[\]]/g, "_").slice(0, 31);
      let uniqueName = safeName;
      let counter = 1;
      while (usedNames.has(uniqueName)) {
        uniqueName = safeName.slice(0, 28) + `_${counter++}`;
      }
      usedNames.add(uniqueName);

      const headers = spec.headers;
      const rows = Array.isArray(spec.rows) ? spec.rows : [];
      const title = spec.title || spec.name || `بيانات ${index + 1}`;
      const infoLines = Array.isArray(spec.infoLines) ? spec.infoLines : [];
      const recordCount = Number.isFinite(Number(spec.recordCount)) ? Number(spec.recordCount) : rows.length;
      const countLabel = spec.countLabel || "العدد";

      const widths = headers.map((h, c) => {
        let max = Math.max(String(h || "").length, 10);
        for (let r = 0; r < Math.min(rows.length, 60); r++) {
          const valStr = String(rows[r]?.[c] ?? "");
          if (valStr.length > max) max = valStr.length;
        }
        return Math.min(Math.max(max + 4, 12), 50);
      });

      return {
        name: uniqueName,
        repeatRows: spec.repeatRows || (spec.printFit !== false ? "1:4" : null),
        xml: neprasXlsxBuildTableSheetXml({
          headers,
          rows,
          title,
          infoLines,
          countLine: `${countLabel}: ${recordCount} — توثيق رسمي: نبراس برو 2026`,
          widths,
          rightAlignCols: spec.rightAlignCols || [1, 2],
          numericCols: Array.isArray(spec.numericCols) ? spec.numericCols : [],
          selected: index === 0,
          printFit: spec.printFit !== false,
          orientation: spec.orientation || "",
          footerSigners: Array.isArray(spec.footerSigners) ? spec.footerSigners : null
        })
      };
    });

  if (!sheets.length) throw new Error("لا توجد أوراق عمل لإنشائها.");

  return neprasXlsxBuildPackage({
    sheets,
    stylesXml: NEPRAS_XLSX_TABLE_STYLES,
    docProps: { title: "نبراس — التحليلات الإحصائية الشاملة" }
  });
}

/**
 * أنماط التقارير والإحصائيات المعتمدة الكاملة (ألوان ملكية، حدود دقيقة، رؤوس وأرقام وخلايا مجمعة)
 */
const NEPRAS_XLSX_STYLED_REPORT_STYLES =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<fonts count="6">` +
  `<font><sz val="10"/><name val="Arial"/><family val="2"/><charset val="178"/><color rgb="FF0F172A"/></font>` +
  `<font><b/><sz val="15"/><name val="Arial"/><family val="2"/><charset val="178"/><color rgb="FF1E3A8A"/></font>` +
  `<font><b/><sz val="11"/><name val="Arial"/><family val="2"/><charset val="178"/><color rgb="FFFFFFFF"/></font>` +
  `<font><b/><sz val="12"/><name val="Arial"/><family val="2"/><charset val="178"/><color rgb="FF991B1B"/></font>` +
  `<font><b/><sz val="11"/><name val="Arial"/><family val="2"/><charset val="178"/><color rgb="FF334155"/></font>` +
  `<font><b/><sz val="9"/><name val="Arial"/><family val="2"/><charset val="178"/><color rgb="FF64748B"/></font>` +
  `</fonts>` +
  `<fills count="7">` +
  `<fill><patternFill patternType="none"/></fill>` +
  `<fill><patternFill patternType="gray125"/></fill>` +
  `<fill><patternFill patternType="solid"><fgColor rgb="FF1E40AF"/><bgColor indexed="64"/></patternFill></fill>` +
  `<fill><patternFill patternType="solid"><fgColor rgb="FFE2E8F0"/><bgColor indexed="64"/></patternFill></fill>` +
  `<fill><patternFill patternType="solid"><fgColor rgb="FFFEF3C7"/><bgColor indexed="64"/></patternFill></fill>` +
  `<fill><patternFill patternType="solid"><fgColor rgb="FFF8FAFC"/><bgColor indexed="64"/></patternFill></fill>` +
  `<fill><patternFill patternType="solid"><fgColor rgb="FFFFFFFF"/><bgColor indexed="64"/></patternFill></fill>` +
  `</fills>` +
  `<borders count="4">` +
  `<border><left/><right/><top/><bottom/><diagonal/></border>` +
  `<border><left style="thin"><color rgb="FFCBD5E1"/></left><right style="thin"><color rgb="FFCBD5E1"/></right><top style="thin"><color rgb="FFCBD5E1"/></top><bottom style="thin"><color rgb="FFCBD5E1"/></bottom></border>` +
  `<border><left style="thin"><color rgb="FF1E3A8A"/></left><right style="thin"><color rgb="FF1E3A8A"/></right><top style="medium"><color rgb="FF1E3A8A"/></top><bottom style="medium"><color rgb="FF1E3A8A"/></bottom></border>` +
  `<border><left style="thin"><color rgb="FFCBD5E1"/></left><right style="thin"><color rgb="FFCBD5E1"/></right><top style="thin"><color rgb="FF991B1B"/></top><bottom style="double"><color rgb="FF991B1B"/></bottom></border>` +
  `</borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="8">` +
  `<xf numFmtId="49" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1" readingOrder="2"/></xf>` +
  `<xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1" readingOrder="2"/></xf>` +
  `<xf numFmtId="0" fontId="4" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1" readingOrder="2"/></xf>` +
  `<xf numFmtId="0" fontId="2" fillId="2" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1" readingOrder="2"/></xf>` +
  `<xf numFmtId="49" fontId="3" fillId="4" borderId="3" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1" readingOrder="2"/></xf>` +
  `<xf numFmtId="49" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center" wrapText="1" readingOrder="2"/></xf>` +
  `<xf numFmtId="49" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1" applyNumberFormat="1"><alignment horizontal="center" vertical="center" wrapText="0" readingOrder="1"/></xf>` +
  `<xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center" readingOrder="2"/></xf>` +
  `</cellXfs>` +
  `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
  `<dxfs count="0"/><tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>` +
  `</styleSheet>`;

/**
 * مطابقة وتحديد معرّف النمط الخلوي بناء على خصائص الخلية ومحتواها
 */
function neprasMapStyleToXfId(s, text) {
  if (!s) {
    if (/^\d{14}$/.test(text)) return 6;
    return 0;
  }

  const fg = String(s.fill?.fgColor?.rgb || '').toUpperCase();
  const fontColor = String(s.font?.color?.rgb || '').toUpperCase();
  const sz = Number(s.font?.sz || 10);

  if (fontColor === 'FFFFFF' || fg === '1E40AF' || fg === '1E3A8A' || fg === '0D9488' || fg === '92D050') {
    return 3; // رأس الجدول (أزرق ملكي بنص أبيض عريض)
  }
  if (fg === 'FEF3C7' || fontColor === '991B1B' || /الجملة العامة|الإجمالي|المجموع/.test(text)) {
    return 4; // صف الإجماليات (أصفر دافئ مع خط قرمزي عريض)
  }
  if (sz >= 14 || fg === 'E2E8F0' || (/إحصائية|احصائية|كشف|تقرير|اللوحة|المركز/i.test(text) && sz >= 12)) {
    return 1; // شريط العنوان الرئيسي
  }
  if (fg === 'F8FAFC' || /المديرية|الإدارة|العام الدراسي|المدرسة/.test(text)) {
    return 2; // صناديق معلومات المدرسة
  }
  if (/مسئول|مدير المدرسة|نبراس/.test(text) || sz <= 9) {
    return 7; // التوقيعات والعلامة الرسمية
  }
  if (s.alignment?.horizontal === 'right') {
    return 5; // محاذاة لليمين
  }
  if (/^\d{14}$/.test(text)) {
    return 6; // أرقام قومية
  }

  return 0; // خلية بيانات وسط مؤطرة
}

function neprasDecodeCellRange(rangeStr) {
  const parts = String(rangeStr || 'A1:A1').split(':');
  const decodeCell = (cell) => {
    const m = String(cell).match(/^([A-Z]+)(\d+)$/i);
    if (!m) return { c: 0, r: 0 };
    let c = 0;
    const colStr = m[1].toUpperCase();
    for (let i = 0; i < colStr.length; i++) c = c * 26 + (colStr.charCodeAt(i) - 64);
    return { c: c - 1, r: parseInt(m[2], 10) - 1 };
  };
  return { s: decodeCell(parts[0]), e: decodeCell(parts[1] || parts[0]) };
}

/**
 * تحويل ورقة عمل من كائن SheetJS إلى نص XML كامل فائق التنسيق والتلوين
 */
function neprasXlsxConvertSheetToXml(ws, isSelected = false) {
  const ref = ws['!ref'] || 'A1:A1';
  const range = (typeof XLSX !== 'undefined' && XLSX.utils?.decode_range)
    ? XLSX.utils.decode_range(ref)
    : neprasDecodeCellRange(ref);

  const merges = ws['!merges'] || [];
  const colProps = ws['!cols'] || [];
  const rowProps = ws['!rows'] || [];

  let rowsXml = '';
  for (let r = range.s.r; r <= range.e.r; r++) {
    const rowNum = r + 1;
    let cellsXml = '';
    let rowHasCells = false;
    const customHt = rowProps[r]?.hpt ? ` ht="${rowProps[r].hpt}" customHeight="1"` : '';

    for (let c = range.s.c; c <= range.e.c; c++) {
      const colLetter = neprasZipColumnName(c);
      const cellRef = `${colLetter}${rowNum}`;
      const cell = ws[cellRef];
      if (!cell && cell !== 0) continue;

      rowHasCells = true;
      const rawVal = cell && cell.v !== undefined ? cell.v : (cell && typeof cell !== 'object' ? cell : '');
      const strVal = rawVal == null ? '' : String(rawVal);
      const styleId = neprasMapStyleToXfId(cell?.s, strVal);

      if (cell && cell.t === 'n' && Number.isFinite(Number(rawVal)) && !/^\d{14}$/.test(strVal)) {
        cellsXml += `<c r="${cellRef}" s="${styleId}" t="n"><v>${Number(rawVal)}</v></c>`;
      } else {
        cellsXml += `<c r="${cellRef}" s="${styleId}" t="inlineStr"><is><t xml:space="preserve">${neprasZipXmlEscape(neprasSanitizeFormulaCell(strVal))}</t></is></c>`;
      }
    }

    if (rowHasCells || customHt) {
      rowsXml += `<row r="${rowNum}"${customHt}>${cellsXml}</row>`;
    }
  }

  let colsXml = '';
  const numCols = Math.max(range.e.c - range.s.c + 1, colProps.length);
  for (let c = 0; c < numCols; c++) {
    const w = colProps[c]?.wch || 14;
    colsXml += `<col min="${c + 1}" max="${c + 1}" width="${w}" customWidth="1" bestFit="1"/>`;
  }

  let mergeXml = '';
  if (merges.length > 0) {
    const mergeItems = merges.map(m => {
      const sRef = `${neprasZipColumnName(m.s.c)}${m.s.r + 1}`;
      const eRef = `${neprasZipColumnName(m.e.c)}${m.e.r + 1}`;
      return `<mergeCell ref="${sRef}:${eRef}"/>`;
    }).join('');
    mergeXml = `<mergeCells count="${merges.length}">${mergeItems}</mergeCells>`;
  }

  const pageOrientation = (ws['!pageSetup']?.orientation === 'portrait' || ws['!pageSetup']?.orientation === 'landscape')
    ? ws['!pageSetup'].orientation
    : (numCols >= 10 ? 'landscape' : 'portrait');
  const freezeSplit = Number.isInteger(ws['!freezeRow']) ? ws['!freezeRow'] : 5;

  return (
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>` +
    `<dimension ref="${ref}"/>` +
    `<sheetViews><sheetView rightToLeft="1" showGridLines="1"${isSelected ? ' tabSelected="1"' : ''} workbookViewId="0">` +
    `<pane ySplit="${freezeSplit}" topLeftCell="A${freezeSplit + 1}" activePane="bottomLeft" state="frozen"/>` +
    `</sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="22"/>` +
    `<cols>${colsXml}</cols>` +
    `<sheetData>${rowsXml}</sheetData>` +
    mergeXml +
    `<printOptions horizontalCentered="1"/>` +
    `<pageMargins left="0.25" right="0.25" top="0.4" bottom="0.4" header="0.2" footer="0.2"/>` +
    `<pageSetup paperSize="9" orientation="${pageOrientation}" fitToWidth="1" fitToHeight="0"/>` +
    `<headerFooter><oddFooter>&amp;Cصفحة &amp;P من &amp;N</oddFooter></headerFooter>` +
    `</worksheet>`
  );
}

/**
 * تحويل مصنف SheetJS كامل إلى حزمة Excel (XLSX) بأعلى درجات التنسيق والألوان والحدود الرسمية
 * @param {Object} wb مصنف SheetJS
 * @returns {Uint8Array} بايتات ملف الإكسيل الجاهز للتنزيل
 */
function neprasXlsxConvertWorkbookToStyledPackage(wb) {
  if (!wb || !wb.SheetNames || !wb.SheetNames.length) {
    throw new Error('المصنف فارغ أو لا يحتوي على أوراق عمل صالحة.');
  }

  const usedNames = new Set();
  const sheets = wb.SheetNames.map((name, i) => {
    const ws = wb.Sheets[name];
    const safeName = neprasXlsxSafeSheetName(name, usedNames);
    return {
      name: safeName,
      repeatRows: ws?.['!repeatRows'] || "1:5",
      xml: neprasXlsxConvertSheetToXml(ws, i === 0)
    };
  });

  return neprasXlsxBuildPackage({
    sheets,
    stylesXml: NEPRAS_XLSX_STYLED_REPORT_STYLES,
    activeTab: true,
    docProps: { title: "نبراس — التقارير المدرسية المعتمدة" }
  });
}

globalThis.neprasBuildMultiSheetWorkbook = neprasBuildMultiSheetWorkbook;
globalThis.neprasXlsxConvertWorkbookToStyledPackage = neprasXlsxConvertWorkbookToStyledPackage;

/**
 * بناء وتوليد ملف الإكسيل في مسار خلفي Web Worker لمنع تجمد الواجهة
 * @param {Array} sheets مصفوفة أوراق العمل
 * @param {Object} options خيارات إضافية
 * @returns {Promise<Uint8Array>}
 */
function neprasBuildWorkbookAsync(sheets, options = {}) {
  return new Promise((resolve, reject) => {
    let worker = null;
    try {
      if (typeof Worker !== "undefined" && typeof chrome !== "undefined" && chrome.runtime?.getURL) {
        worker = new Worker(chrome.runtime.getURL("workers/xlsx_worker.js"));
      } else if (typeof Worker !== "undefined") {
        worker = new Worker("workers/xlsx_worker.js");
      }
    } catch (_) {
      worker = null;
    }

    if (!worker) {
      // Fallback مباشر تزامني إذا لم يكن الـ Worker متاحاً
      try {
        if (typeof XLSX !== "undefined") {
          const wb = XLSX.utils.book_new();
          for (const s of (sheets || [])) {
            const ws = s.headers ? XLSX.utils.aoa_to_sheet([s.headers, ...(s.rows || [])]) : XLSX.utils.json_to_sheet(s.rows || []);
            if (s.rtl !== false) ws["!views"] = [{ RTL: true }];
            XLSX.utils.book_append_sheet(wb, ws, String(s.name || "Sheet").slice(0, 31));
          }
          const out = XLSX.write(wb, { bookType: options.bookType || "xlsx", type: "array", compression: true });
          return resolve(new Uint8Array(out));
        }
        throw new Error("لا يمكن بناء ملف الإكسيل: لا يوجد Worker ولا SheetJS.");
      } catch (e) {
        return reject(e);
      }
    }

    const reqId = "req_" + Math.random().toString(36).slice(2);
    const timeout = setTimeout(() => {
      try { worker.terminate(); } catch (_) {}
      reject(new Error("استغرق بناء ملف الإكسيل وقتاً أطول من المتوقع (Timeout)."));
    }, 45000);

    worker.onmessage = (e) => {
      clearTimeout(timeout);
      try { worker.terminate(); } catch (_) {}
      if (e.data && e.data.ok) {
        resolve(new Uint8Array(e.data.buffer));
      } else {
        reject(new Error(e.data?.error || "خطأ غير معروف في بناء الإكسيل."));
      }
    };

    worker.onerror = (err) => {
      clearTimeout(timeout);
      try { worker.terminate(); } catch (_) {}
      reject(new Error(err?.message || "فشل تشغيل عامل بناء الإكسيل."));
    };

    worker.postMessage({ id: reqId, action: "BUILD_WORKBOOK", sheets, options });
  });
}

globalThis.neprasBuildWorkbookAsync = neprasBuildWorkbookAsync;
