/**
 * Nepras — ملء قوالب Excel المخصصة على مستوى ملف xlsx نفسه (OOXML).
 *
 * لماذا: كان القالب يُقرأ بمكتبة SheetJS ثم يُكتب بها، والنسخة المضمّنة (Community 0.18.5) لا تكتب الألوان ولا الخطوط ولا الحدود
 * ولا المحاذاة (الكتابة بالتنسيق في النسخة المدفوعة فقط). فكل قالب يعيد المستخدم تصميمه كان يخرج منه ملف بقيمه وعرض أعمدته
 * ودمج خلاياه فقط، بلا أي تنسيق صمّمه. (جُرّب: ملء قالب بخلفية زرقاء وخط عريض وحدود أعاد خلايا بلا شيء منها.)
 *
 * كيف: نفكّ ملف القالب (zip)، ونعدّل XML الورقة الأولى مباشرة (استبدال المتغيرات {{...}} وكتابة صفوف الطلاب بعد صف العناوين)،
 * ونبقي styles.xml والثيم والصور وعرض الأعمدة وارتفاع الصفوف كما هي، ثم نكرّر الورقة لكل فصل (مع الشعار) ونعيد الحزمة.
 * أنماط الخلايا نفسها (s=...) تُنسخ فتبقى كل تنسيقات المستخدم.
 *
 * ما يُحفظ: كل تنسيق الخلية (لون، خط، حدود، محاذاة، تنسيق رقم)، الدمج، عرض الأعمدة وارتفاع الصفوف، اتجاه الورقة RTL، التجميد،
 * إعداد الطباعة، الشعار والصور، التنسيق الشرطي والتحقق، الفلتر، ومناطق الطباعة وعناوين الصفوف المكرّرة (تُنسخ لكل ورقة).
 * ما لا يُحفظ: الأوراق الأخرى في القالب (تُستعمل الأولى فقط كما كان)، التعليقات والجداول المهيكلة (Excel Tables) وإعدادات الطابعة.
 *
 * ما لا يدعمه فيرمي خطأً برمز TEMPLATE_UNSUPPORTED وسببه، ليعود المستدعي إلى الطريقة القديمة مع رسالة صريحة للمستخدم
 * (لا يصمت): ورقة أولى ليست ورقة عمل، رسومات غير الصور (مخططات)، ملف غير zip، DecompressionStream غير متاح.
 *
 * يعتمد وقت التشغيل على neprasBuildZip وneprasXlsxSafeSheetName من modules/xlsx_writer.js (يُحقن قبله)، وعلى DOMParser
 * وXMLSerializer وDecompressionStream من المتصفح.
 */
(function () {
  'use strict';
  if (globalThis.NeprasTemplateFill) return;

  const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const NS_PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const NS_CT = 'http://schemas.openxmlformats.org/package/2006/content-types';
  const NS_XML = 'http://www.w3.org/XML/1998/namespace';
  const REL_BASE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
  const CT_DRAWING = 'application/vnd.openxmlformats-officedocument.drawing+xml';
  const CT_WORKSHEET = 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml';
  const MAX_UNZIPPED_BYTES = 60 * 1024 * 1024;   // سقف حجم محتوى القالب بعد فكّه (حماية من ملف مضغوط ضخم)
  const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

  function unsupported(reason) {
    const e = new Error('قالب غير مدعوم في الملء المحافظ على التنسيق: ' + reason);
    e.code = 'TEMPLATE_UNSUPPORTED';
    e.reason = reason;
    return e;
  }

  // ---------------------------------------------------------------- ZIP (قراءة)
  // محلل الأرشيف الوحيد في الإضافة هو neprasZipReadEntries في modules/xlsx_writer.js (1.2.92: كان هنا محلل ثانٍ مطابق له)؛ هنا نفكّ الأجزاء
  // ونحوّل أي خطأ إلى TEMPLATE_UNSUPPORTED ليعود المستدعي إلى المحرك الاحتياطي برسالة صريحة.
  async function readZip(bytes) {
    if (typeof neprasZipReadEntries !== 'function') throw unsupported('xlsx_writer.js غير محمّل');
    try {
      const entries = [];
      for (const e of neprasZipReadEntries(bytes, { maxUnzipped: MAX_UNZIPPED_BYTES })) {
        entries.push({ name: e.name, data: await neprasZipEntryData(e, MAX_UNZIPPED_BYTES) });
      }
      return entries;
    } catch (e) {
      if (e && e.code === 'TEMPLATE_UNSUPPORTED') throw e;
      if (e && e.code === 'ZIP_INVALID') throw unsupported(e.message);
      throw unsupported('تعذّر فك ضغط جزء من الملف (' + (e && e.message || e) + ')');
    }
  }

  // ---------------------------------------------------------------- XML
  function parseXml(text) {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw unsupported('جزء XML تالف');
    return doc;
  }
  const serialize = (doc) => XML_DECL + new XMLSerializer().serializeToString(doc.documentElement);
  const utf8 = (u8) => new TextDecoder('utf-8').decode(u8);
  const els = (root, ns, name) => Array.from(root.getElementsByTagNameNS(ns, name));
  const firstEl = (root, ns, name) => root.getElementsByTagNameNS(ns, name)[0] || null;

  function colToIndex(letters) {
    let n = 0;
    for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
  }
  function indexToCol(index) {
    let n = index + 1, out = '';
    while (n > 0) { const r = (n - 1) % 26; out = String.fromCharCode(65 + r) + out; n = Math.floor((n - 1) / 26); }
    return out;
  }
  function parseRef(ref) {
    const m = /^([A-Z]+)(\d+)$/.exec(ref || '');
    return m ? { c: colToIndex(m[1]), r: parseInt(m[2], 10) - 1 } : null;
  }

  // مسار هدف علاقة نسبةً إلى الجزء المصدر ('xl/worksheets/sheet1.xml' + '../drawings/d1.xml' → 'xl/drawings/d1.xml')
  function resolveTarget(fromPart, target) {
    if (target.startsWith('/')) return target.slice(1);
    const parts = fromPart.split('/'); parts.pop();
    for (const seg of target.split('/')) {
      if (seg === '..') parts.pop(); else if (seg !== '.' && seg !== '') parts.push(seg);
    }
    return parts.join('/');
  }
  const relsPathOf = (part) => { const i = part.lastIndexOf('/'); return part.slice(0, i + 1) + '_rels/' + part.slice(i + 1) + '.rels'; };

  function readRels(map, part) {
    const e = map.get(relsPathOf(part));
    if (!e) return [];
    return els(parseXml(utf8(e.data)), NS_PKG_REL, 'Relationship').map((r) => ({
      id: r.getAttribute('Id'), type: r.getAttribute('Type') || '', target: r.getAttribute('Target') || '', mode: r.getAttribute('TargetMode') || ''
    }));
  }
  const attr = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const relXml = (rels) => XML_DECL + `<Relationships xmlns="${NS_PKG_REL}">` + rels.map((r) =>
    `<Relationship Id="${attr(r.id)}" Type="${attr(r.type)}" Target="${attr(r.target)}"${r.mode ? ` TargetMode="${attr(r.mode)}"` : ''}/>`).join('') + '</Relationships>';

  // ---------------------------------------------------------------- نص الخلية
  function sharedStrings(map) {
    const e = map.get('xl/sharedStrings.xml');
    if (!e) return [];
    return els(parseXml(utf8(e.data)), NS_MAIN, 'si').map((si) =>
      els(si, NS_MAIN, 't').filter((t) => t.parentNode.localName !== 'rPh').map((t) => t.textContent).join(''));
  }

  function cellText(c, sst) {
    if (firstEl(c, NS_MAIN, 'f')) return null;        // معادلة: لا نمسّها
    const t = c.getAttribute('t');
    if (t === 's') { const v = firstEl(c, NS_MAIN, 'v'); return v ? (sst[parseInt(v.textContent, 10)] ?? '') : ''; }
    if (t === 'inlineStr') { const is = firstEl(c, NS_MAIN, 'is'); return is ? els(is, NS_MAIN, 't').map((x) => x.textContent).join('') : ''; }
    if (t === 'str') { const v = firstEl(c, NS_MAIN, 'v'); return v ? v.textContent : ''; }
    const v = firstEl(c, NS_MAIN, 'v');
    return v ? v.textContent : '';
  }

  function clearCell(c) {
    while (c.firstChild) c.removeChild(c.firstChild);
    c.removeAttribute('t');
  }
  function setCellValue(doc, c, value) {
    clearCell(c);
    if (value === '' || value === null || value === undefined) return;
    if (typeof value === 'number' && Number.isFinite(value)) {
      const v = doc.createElementNS(NS_MAIN, 'v');
      v.textContent = String(value);
      c.appendChild(v);
      return;
    }
    c.setAttribute('t', 'inlineStr');
    const is = doc.createElementNS(NS_MAIN, 'is');
    const t = doc.createElementNS(NS_MAIN, 't');
    t.setAttributeNS(NS_XML, 'xml:space', 'preserve');
    t.textContent = String(value);
    is.appendChild(t);
    c.appendChild(is);
  }

  // ---------------------------------------------------------------- ورقة واحدة
  /**
   * @param {string} xmlText نص XML الورقة الأولى في القالب
   * @param {object} spec {replace(text)→string, rows:[{field:value}]}
   * @param {object} o {sst, headerFieldOf, defaultColumns, defaultStartRow, maxHeaderScanRow, droppedRelIds:Set, selected:boolean}
   */
  function buildSheetXml(xmlText, spec, o) {
    const doc = parseXml(xmlText);
    const sheetData = firstEl(doc, NS_MAIN, 'sheetData');
    if (!sheetData) throw unsupported('ورقة بلا sheetData');

    // 1) إزالة ما يشير إلى علاقات لن تُنسخ (تعليقات، جداول، طابعة...)
    for (const el of Array.from(doc.getElementsByTagName('*'))) {
      const rid = el.getAttributeNS(NS_REL, 'id');
      if (rid && o.droppedRelIds.has(rid)) {
        if (el.localName === 'pageSetup') el.removeAttributeNS(NS_REL, 'id');
        else if (el.parentNode) el.parentNode.removeChild(el);
      }
    }
    for (const holder of els(doc, NS_MAIN, 'tableParts')) if (!holder.firstChild) holder.parentNode.removeChild(holder);

    // 2) خريطة الصفوف والخلايا
    const rowEls = new Map();    // فهرس الصف (من 0) → عنصر row
    let autoRow = 0;
    for (const row of els(sheetData, NS_MAIN, 'row')) {
      const r = row.hasAttribute('r') ? parseInt(row.getAttribute('r'), 10) - 1 : autoRow;
      autoRow = r + 1;
      row.setAttribute('r', String(r + 1));
      row.removeAttribute('spans');
      rowEls.set(r, row);
      let autoCol = 0;
      for (const c of els(row, NS_MAIN, 'c')) {            // نثبّت r لكل خلية كي لا نعتمد على الترتيب الضمني
        const pr = parseRef(c.getAttribute('r'));
        const ci = pr ? pr.c : autoCol;
        autoCol = ci + 1;
        c.setAttribute('r', indexToCol(ci) + (r + 1));
      }
    }
    const cellsOf = (row) => els(row, NS_MAIN, 'c').map((c) => ({ c, col: parseRef(c.getAttribute('r')).c }));

    // 3) استبدال المتغيرات
    for (const row of rowEls.values()) {
      for (const { c } of cellsOf(row)) {
        const text = cellText(c, o.sst);
        if (text === null || text.indexOf('{{') < 0) continue;
        const replaced = spec.replace(text);
        if (replaced !== text) setCellValue(doc, c, replaced);
      }
    }

    // 4) صف العناوين: أول صف (ضمن أول maxHeaderScanRow) فيه عنوانان معروفان على الأقل
    let headerRow = -1;
    let colMap = {};
    const rowIndexes = Array.from(rowEls.keys()).sort((a, b) => a - b).filter((r) => r <= o.maxHeaderScanRow);
    for (const r of rowIndexes) {
      const temp = {};
      let matches = 0;
      for (const { c, col } of cellsOf(rowEls.get(r))) {
        const text = cellText(c, o.sst);
        if (!text || !String(text).trim()) continue;
        const field = o.headerFieldOf(text);
        if (field) { temp[col] = field; matches++; }
      }
      if (matches >= 2) { headerRow = r; colMap = temp; break; }
    }
    if (headerRow < 0) colMap = Object.fromEntries(o.defaultColumns.map((f, i) => [i, f]));
    const startRow = headerRow >= 0 ? headerRow + 1 : o.defaultStartRow;
    const cols = Object.keys(colMap).map(Number).sort((a, b) => a - b);

    // 5) صف النموذج: أول صف تحت العناوين في القالب؛ تنسيقه يُورَّث لكل الصفوف الجديدة
    const model = rowEls.get(startRow) || null;
    const modelStyle = {};
    if (model) for (const { c, col } of cellsOf(model)) if (c.hasAttribute('s')) modelStyle[col] = c.getAttribute('s');
    const modelRowAttrs = {};
    if (model) for (const a of ['ht', 'customHeight', 's', 'customFormat']) if (model.hasAttribute(a)) modelRowAttrs[a] = model.getAttribute(a);

    function getRow(r) {
      if (rowEls.has(r)) return rowEls.get(r);
      const row = doc.createElementNS(NS_MAIN, 'row');
      row.setAttribute('r', String(r + 1));
      for (const [k, v] of Object.entries(modelRowAttrs)) row.setAttribute(k, v);
      const after = Array.from(rowEls.keys()).filter((k) => k > r).sort((a, b) => a - b)[0];
      if (after !== undefined) sheetData.insertBefore(row, rowEls.get(after)); else sheetData.appendChild(row);
      rowEls.set(r, row);
      return row;
    }
    function getCell(row, r, col) {
      const found = cellsOf(row).find((x) => x.col === col);
      if (found) return found.c;
      const c = doc.createElementNS(NS_MAIN, 'c');
      c.setAttribute('r', indexToCol(col) + (r + 1));
      if (modelStyle[col] !== undefined) c.setAttribute('s', modelStyle[col]);
      const after = cellsOf(row).filter((x) => x.col > col).sort((a, b) => a.col - b.col)[0];
      if (after) row.insertBefore(c, after.c); else row.appendChild(c);
      return c;
    }

    // 6) صفوف الطلاب
    spec.rows.forEach((values, idx) => {
      const r = startRow + idx;
      const row = getRow(r);
      for (const col of cols) setCellValue(doc, getCell(row, r, col), values[colMap[col]]);
    });

    // 7) أبعاد الورقة وتحديدها
    let maxR = 0, maxC = 0;
    for (const [r, row] of rowEls) for (const { col } of cellsOf(row)) { if (r > maxR) maxR = r; if (col > maxC) maxC = col; }
    const dim = firstEl(doc, NS_MAIN, 'dimension');
    if (dim) dim.setAttribute('ref', `A1:${indexToCol(maxC)}${maxR + 1}`);
    for (const sv of els(doc, NS_MAIN, 'sheetView')) {
      if (o.selected) sv.setAttribute('tabSelected', '1'); else sv.removeAttribute('tabSelected');
    }
    return serialize(doc);
  }

  // ---------------------------------------------------------------- الحزمة
  const quoteSheet = (n) => `'${n.replace(/'/g, "''")}'`;

  /**
   * يملأ قالبًا ويعيد ملف xlsx جديدًا فيه ورقة لكل عنصر من sheets، بتنسيق القالب كاملًا.
   * @param {Uint8Array} templateBytes ملف القالب
   * @param {{name:string, replace:(text:string)=>string, rows:Array<Object>}[]} sheets
   *   name اسم الورقة (يُنقّى ويُفرَّد هنا)؛ replace يستبدل المتغيرات في نص خلية؛ rows قيم كل طالب بحسب اسم الحقل
   * @param {{headerFieldOf:(text:string)=>string, defaultColumns?:string[], defaultStartRow?:number, maxHeaderScanRow?:number}} options
   * @returns {Promise<Uint8Array>}
   */
  async function fill(templateBytes, sheets, options) {
    if (typeof DOMParser !== 'function' || typeof XMLSerializer !== 'function') throw unsupported('المتصفح لا يوفّر DOMParser');
    if (typeof neprasBuildZip !== 'function' || typeof neprasXlsxSafeSheetName !== 'function') throw unsupported('xlsx_writer.js غير محمّل');
    if (!sheets || !sheets.length) throw new Error('لا توجد أوراق لإنشائها من القالب.');

    const entries = await readZip(templateBytes);
    const map = new Map(entries.map((e) => [e.name, e]));
    const need = (name) => { const e = map.get(name); if (!e) throw unsupported('جزء ناقص: ' + name); return e; };

    // الورقة الأولى في المصنف
    const wbDoc = parseXml(utf8(need('xl/workbook.xml').data));
    const firstSheet = firstEl(wbDoc, NS_MAIN, 'sheet');
    if (!firstSheet) throw unsupported('القالب بلا أوراق');
    const srcName = firstSheet.getAttribute('name');
    const srcRid = firstSheet.getAttributeNS(NS_REL, 'id');
    const wbRels = readRels(map, 'xl/workbook.xml');
    const srcRel = wbRels.find((r) => r.id === srcRid);
    if (!srcRel || !srcRel.type.endsWith('/worksheet')) throw unsupported('الورقة الأولى ليست ورقة عمل');
    const srcPath = resolveTarget('xl/workbook.xml', srcRel.target);
    const srcXml = utf8(need(srcPath).data);
    const srcIndex = Array.from(wbDoc.getElementsByTagNameNS(NS_MAIN, 'sheet')).indexOf(firstSheet);

    // علاقات الورقة: الرسم (الشعار) يُنسخ لكل ورقة، والروابط الخارجية تبقى، وغيرها يُسقَط
    const sheetRels = readRels(map, srcPath);
    const droppedRelIds = new Set();
    const keptRels = [];
    let drawing = null;
    for (const r of sheetRels) {
      if (r.type.endsWith('/drawing')) {
        const dPath = resolveTarget(srcPath, r.target);
        const dRels = readRels(map, dPath);
        if (dRels.some((x) => !x.type.endsWith('/image'))) throw unsupported('رسومات غير الصور (مخططات أو أشكال مرتبطة)');
        drawing = { relId: r.id, xml: need(dPath).data, rels: dRels };
      } else if (r.type.endsWith('/hyperlink')) keptRels.push(r);
      else droppedRelIds.add(r.id);
    }

    const sst = sharedStrings(map);
    const used = new Set();
    const newNames = sheets.map((s) => neprasXlsxSafeSheetName(s.name || 'ورقة', used));
    const droppedParts = (n) => n.startsWith('xl/worksheets/') || n.startsWith('xl/drawings/') || n === 'xl/calcChain.xml' ||
      n.startsWith('xl/printerSettings/') || n.startsWith('xl/tables/') || n.startsWith('xl/comments/') || /^xl\/comments\d*\.xml$/.test(n) || n.startsWith('xl/threadedComments/');
    const out = entries.filter((e) => !droppedParts(e.name) && e.name !== relsPathOf('xl/workbook.xml') && e.name !== '[Content_Types].xml' && e.name !== 'xl/workbook.xml');

    const added = [];       // {part, contentType}
    const wbSheetRels = [];
    const sheetOptions = {
      sst, headerFieldOf: options.headerFieldOf,
      defaultColumns: options.defaultColumns || ['serial', 'code', 'name', 'national_id'],
      defaultStartRow: options.defaultStartRow ?? 6,
      maxHeaderScanRow: options.maxHeaderScanRow ?? 20,
      droppedRelIds
    };
    sheets.forEach((spec, i) => {
      const n = i + 1;
      const part = `xl/worksheets/sheet${n}.xml`;
      out.push({ name: part, data: buildSheetXml(srcXml, spec, { ...sheetOptions, selected: i === 0 }) });
      added.push({ part, contentType: CT_WORKSHEET });
      const rels = keptRels.slice();
      if (drawing) {
        const dPart = `xl/drawings/drawing${n}.xml`;
        out.push({ name: dPart, data: drawing.xml });
        out.push({ name: relsPathOf(dPart), data: relXml(drawing.rels) });
        added.push({ part: dPart, contentType: CT_DRAWING });
        rels.push({ id: drawing.relId, type: REL_BASE + 'drawing', target: `../drawings/drawing${n}.xml`, mode: '' });
      }
      if (rels.length) out.push({ name: relsPathOf(part), data: relXml(rels) });
      wbSheetRels.push({ id: `rIdNepras${n}`, type: REL_BASE + 'worksheet', target: `worksheets/sheet${n}.xml`, mode: '' });
    });

    // workbook.xml: الأوراق، الأسماء المعرّفة (مناطق الطباعة)، إعادة الحساب
    const sheetsEl = firstEl(wbDoc, NS_MAIN, 'sheets');
    while (sheetsEl.firstChild) sheetsEl.removeChild(sheetsEl.firstChild);
    newNames.forEach((name, i) => {
      const s = wbDoc.createElementNS(NS_MAIN, 'sheet');
      s.setAttribute('name', name);
      s.setAttribute('sheetId', String(i + 1));
      s.setAttributeNS(NS_REL, 'r:id', wbSheetRels[i].id);
      sheetsEl.appendChild(s);
    });
    const definedNames = firstEl(wbDoc, NS_MAIN, 'definedNames');
    if (definedNames) {
      const oldRefs = [quoteSheet(srcName) + '!', srcName + '!'];
      for (const dn of Array.from(definedNames.getElementsByTagNameNS(NS_MAIN, 'definedName'))) {
        const local = dn.getAttribute('localSheetId');
        const text = dn.textContent;
        const refsSrc = oldRefs.some((x) => text.includes(x));
        definedNames.removeChild(dn);
        if (local !== null ? parseInt(local, 10) !== srcIndex : refsSrc) continue;      // اسم لورقة أخرى، أو عام يشير إلى الورقة المنسوخة
        if (local === null) { definedNames.appendChild(dn); continue; }
        newNames.forEach((name, i) => {
          const copy = dn.cloneNode(true);
          copy.setAttribute('localSheetId', String(i));
          let t = text;
          for (const x of oldRefs) t = t.split(x).join(quoteSheet(name) + '!');
          copy.textContent = t;
          definedNames.appendChild(copy);
        });
      }
      if (!definedNames.firstChild) definedNames.parentNode.removeChild(definedNames);
    }
    for (const wv of els(wbDoc, NS_MAIN, 'workbookView')) { wv.removeAttribute('activeTab'); wv.removeAttribute('firstSheet'); }
    let calc = firstEl(wbDoc, NS_MAIN, 'calcPr');
    if (!calc) {
      calc = wbDoc.createElementNS(NS_MAIN, 'calcPr');
      const ext = firstEl(wbDoc, NS_MAIN, 'extLst');
      if (ext) wbDoc.documentElement.insertBefore(calc, ext); else wbDoc.documentElement.appendChild(calc);
    }
    calc.setAttribute('fullCalcOnLoad', '1');
    out.push({ name: 'xl/workbook.xml', data: serialize(wbDoc) });

    const keptWbRels = wbRels.filter((r) => !r.type.endsWith('/worksheet') && !r.type.endsWith('/calcChain'));
    out.push({ name: relsPathOf('xl/workbook.xml'), data: relXml(keptWbRels.concat(wbSheetRels)) });

    // [Content_Types].xml: نحذف تجاوزات الأجزاء المحذوفة ونضيف الجديدة
    const ctDoc = parseXml(utf8(need('[Content_Types].xml').data));
    const present = new Set(out.map((e) => '/' + e.name));
    for (const o of els(ctDoc, NS_CT, 'Override')) if (!present.has(o.getAttribute('PartName'))) o.parentNode.removeChild(o);
    for (const a of added) {
      const o = ctDoc.createElementNS(NS_CT, 'Override');
      o.setAttribute('PartName', '/' + a.part);
      o.setAttribute('ContentType', a.contentType);
      ctDoc.documentElement.appendChild(o);
    }
    out.unshift({ name: '[Content_Types].xml', data: serialize(ctDoc) });
    return neprasBuildZip(out);
  }

  globalThis.NeprasTemplateFill = Object.freeze({ fill, readZip });
})();
