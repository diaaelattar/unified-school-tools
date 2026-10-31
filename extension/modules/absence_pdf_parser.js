/**
 * نبراس — أدوات المدرسة الموحّدة
 * وحدة استخراج وتحليل تقارير غياب الوزارة المعتمدة من ملفات الـ PDF
 * NeprasAbsencePdfParser
 */
'use strict';

(function(global) {
  if (global.NeprasAbsencePdfParser) return;

  // جداول فك تشفير خطوط وزارة التربية والتعليم المشفرة في ملفات الـ PDF (مطابقة لاستوديو البطاقات مع استكمال رموز الترقيم والأقواس)
  const SEGOE_TABLE = {
    2:"\r",3:" ",4:"!",5:"\"",19:"0",20:"1",21:"2",22:"3",23:"4",24:"5",25:"6",26:"7",27:"8",28:"9",29:":",34:"?",
    36:"A",37:"B",38:"C",39:"D",40:"E",41:"F",42:"G",43:"H",45:"J",46:"K",47:"L",48:"M",49:"N",51:"P",52:"Q",53:"R",
    54:"S",55:"T",56:"U",57:"V",58:"W",59:"X",60:"Y",61:"Z",66:"_",68:"a",69:"b",70:"c",71:"d",72:"e",73:"f",74:"g",
    75:"h",76:"i",77:"j",78:"k",80:"m",81:"n",83:"p",84:"q",85:"r",86:"s",87:"t",88:"u",89:"v",90:"w",91:"x",92:"y",
    93:"z",214:"\u0131",219:"\u02d9",311:"\u207f",1708:"\u0237",2197:"\u2071",2198:"\u00b2",2199:"\u00b3",2200:"\u00b9",
    2201:"\u2070",2202:"\u2074",2203:"\u2075",2204:"\u2076",2205:"\u2077",2206:"\u2078",2207:"\u2079",2213:"\u2080",
    2214:"\u2081",2215:"\u2082",2216:"\u2083",2217:"\u2084",2218:"\u2085",2219:"\u2086",2220:"\u2087",2221:"\u2088",
    2222:"\u2089",2243:"\u200c",2244:"\u200d",2245:"\u200e",2246:"\u200f",2247:"\u0627",2248:"\u0623",2249:"\u0622",
    2250:"\u0625",2251:"\u0628",2252:"\u062a",2253:"\u062b",2254:"\u062c",2255:"\u062c",2256:"\u062d",2257:"\u062d",
    2258:"\u062e",2259:"\u062e",2260:"\u0633",2261:"\u0634",2262:"\u0635",2273:"\u0636",2274:"\u0639",2275:"\u0639",
    2276:"\u0639",2277:"\u063a",2278:"\u063a",2279:"\u063a",2280:"\u0641",2281:"\u0641",2283:"\u0642",2284:"\u0642",
    2285:"\u0643",2286:"\u0644",2287:"\u0645",2288:"\u0646",2291:"\u0647",2292:"\u064a",2293:"\u064a",2294:"\u0629",
    2295:"\u0649",2297:"\u0626",2306:"\u0626",2311:"\u0621",2312:"\u0622",2313:"\u0623",2314:"\u0624",2315:"\u0625",
    2316:"\u0626",2317:"\u0627",2318:"\u0628",2319:"\u0629",2320:"\u062a",2321:"\u062b",2322:"\u062c",2323:"\u062d",
    2324:"\u062e",2325:"\u062f",2326:"\u0630",2327:"\u0631",2328:"\u0632",2329:"\u0633",2330:"\u0634",2331:"\u0635",
    2332:"\u0636",2333:"\u0637",2334:"\u0638",2335:"\u0639",2336:"\u063a",2337:"\u0640",2338:"\u0641",2339:"\u0642",
    2340:"\u0643",2341:"\u0644",2342:"\u0645",2343:"\u0646",2344:"\u0647",2345:"\u0648",2346:"\u0649",2347:"\u064a",
    2359:"\u0653",2363:"\u066e",2364:"\u06a1",2365:"\u06a1",2366:"\u066e",2367:"\u0644",2393:"\u0644",2399:"\u06ba",
    2417:"\u0644\u0644\u0647",2428:"\u066f",2430:"\u0654",2504:"\u06a1",2627:"\u25cc",2659:"\u0627\u0644\u0644\u0647",
    2828:"\u0631",2829:"\u0632",3515:"\ufb00",3516:"\ufb03",3620:"\u0624",3621:"\u0626",3622:"\u0628",3623:"\u0628",
    3624:"\u062a",3625:"\u062a",3626:"\u062b",3627:"\u062b",3628:"\u062c",3629:"\u062d",3630:"\u062e",3631:"\u062f",
    3632:"\u0630",3633:"\u0633",3634:"\u0633",3635:"\u0634",3636:"\u0634",3637:"\u0635",3638:"\u0635",3639:"\u0636",
    3640:"\u0636",3641:"\u0637",3642:"\u0637",3643:"\u0637",3644:"\u0638",3645:"\u0638",3646:"\u0638",3667:"\u0641",
    3668:"\u0642",3669:"\u0643",3670:"\u0643",3671:"\u0645",3672:"\u0645",3673:"\u0646",3674:"\u0646",3675:"\u0647",
    3676:"\u0647",3677:"\u0647",3678:"\u0648",3679:"\u0649",3680:"\u0649",3681:"\u064a",3694:"\u066e",3695:"\u066e",
    3696:"\u066f",3697:"\u066f",3698:"\u066f",3749:"\u06a1",3791:"\u06ba",3938:"\u0622",3939:"\u0623",3940:"\u0625",
    3941:"\u0627",3948:"\u0633",3949:"\u0633",3950:"\u0634",3951:"\u0634",3970:"\u0635",3971:"\u0635",3972:"\u0636",
    3973:"\u0636",3980:"\u0644",3981:"\u0644",3992:"\u0631",3993:"\u0632",4007:"\u0626",4011:"\u0649",4012:"\u064a",
    4486:"\u2009",5103:"\u0645\u062d\u0645\u062f",5104:"\u0635\u0644\u0649 \u0627\u0644\u0644\u0647 \u0639\u0644\u064a\u0647 \u0648\u0633\u0644\u0645",
    5105:"\u062c\u0644 \u062c\u0644\u0627\u0644\u0647",5106:"\ufdfd",5271:"\u0641\u0644\u0644\u0647"
  };

  const ARIAL_TABLE = {
    3:" ",5:"\"",11:"(",12:")",16:"-",18:"/",19:"0",20:"1",21:"2",22:"3",23:"4",24:"5",25:"6",26:"7",27:"8",28:"9",29:":",
    39:"D",48:"M",53:"R",71:"d",85:"r",748:"\u060c",751:"\u0621",752:"\u0640",776:"\u06d5",
    815:"\u06a9",821:"\u06cc",822:"\u06cc",896:"\u0621",897:"\u0622",898:"\u0622",899:"\u0623",900:"\u0623",
    901:"\u0624",902:"\u0624",903:"\u0625",904:"\u0625",905:"\u0626",906:"\u0626",907:"\u0626",908:"\u0626",
    909:"\u0627",910:"\u0627",911:"\u0628",912:"\u0628",913:"\u0628",914:"\u0628",915:"\u0629",916:"\u0629",
    917:"\u062a",918:"\u062a",919:"\u062a",920:"\u062a",921:"\u062b",922:"\u062b",923:"\u062b",924:"\u062b",
    925:"\u062c",926:"\u062c",927:"\u062c",928:"\u062c",929:"\u062d",930:"\u062d",931:"\u062d",932:"\u062d",
    933:"\u062e",934:"\u062e",935:"\u062e",936:"\u062e",937:"\u062f",938:"\u062f",939:"\u0630",940:"\u0630",
    941:"\u0631",942:"\u0631",943:"\u0632",944:"\u0632",945:"\u0633",946:"\u0633",947:"\u0633",948:"\u0633",
    949:"\u0634",950:"\u0634",951:"\u0634",952:"\u0634",953:"\u0635",954:"\u0635",955:"\u0635",956:"\u0635",
    957:"\u0636",958:"\u0636",959:"\u0636",960:"\u0636",961:"\u0637",962:"\u0637",963:"\u0637",964:"\u0637",
    965:"\u0638",966:"\u0638",967:"\u0638",968:"\u0638",969:"\u0639",970:"\u0639",971:"\u0639",972:"\u0639",
    973:"\u063a",974:"\u063a",975:"\u063a",976:"\u063a",977:"\u0641",978:"\u0641",979:"\u0641",980:"\u0641",
    981:"\u0642",982:"\u0642",983:"\u0642",984:"\u0642",985:"\u0643",986:"\u0643",987:"\u0643",988:"\u0643",
    989:"\u0644",990:"\u0644",991:"\u0644",992:"\u0644",993:"\u0645",994:"\u0645",995:"\u0645",996:"\u0645",
    997:"\u0646",998:"\u0646",999:"\u0646",1000:"\u0646",1001:"\u0647",1002:"\u0647",1003:"\u0647",1004:"\u0647",
    1005:"\u0648",1006:"\u0648",1007:"\u0649",1008:"\u0649",1009:"\u064a",1010:"\u064a",1011:"\u064a",1012:"\u064a",
    1013:"\u0644\u0622",1014:"\u0644\u0622",1015:"\u0644\u0623",1016:"\u0644\u0623",1017:"\u0644\u0625",1018:"\u0644\u0625",
    1019:"\u0644\u0627",1020:"\u0644\u0627",1320:"\u066e",1321:"\u0649",1325:"\ufbb3",1326:"\ufbb5",1327:"\ufbb7",
    1336:"\u0653",1338:"\u0655",1466:"\u06a1",1567:"\u06c1",1643:"\u06c1",1644:"\u06c1",3021:"\u0631\u06cc\u0627\u0644",
    3869:"\u0645\u062d\u0645\u062f"
  };

  // استكمال رموز ASCII القياسية (gid = charCode - 29) في الجدولين
  for (let c = 32; c <= 126; c++) {
    const gid = c - 29;
    if (!(gid in SEGOE_TABLE)) SEGOE_TABLE[gid] = String.fromCharCode(c);
    if (!(gid in ARIAL_TABLE)) ARIAL_TABLE[gid] = String.fromCharCode(c);
  }

  const AR_RE = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;

  function normAr(s) {
    return String(s == null ? '' : s)
      .replace(/[ً-ٰٟـ]/g, '')
      .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
      .replace(/[‎‏‪-‮]/g, '')
      .replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function cleanText(s) {
    return String(s == null ? '' : s).replace(/[‎‏‪-‮\u0000-\u001F]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function isSaneChar(ch) {
    const c = ch.codePointAt(0);
    return (c >= 0x20 && c <= 0x7E) || c === 0xA0 || (c >= 0x600 && c <= 0x6FF) || (c >= 0x750 && c <= 0x77F) ||
      (c >= 0xFB50 && c <= 0xFDFF) || (c >= 0xFE70 && c <= 0xFEFF) || (c >= 0x2000 && c <= 0x206F) || (c >= 0xC0 && c <= 0x24F);
  }

  function visualToLogical(parts) {
    const rev = parts.slice().reverse();
    const out = [];
    let i = 0;
    const isLtrPart = (p) => !AR_RE.test(p) && /[0-9A-Za-z]/.test(p);
    while (i < rev.length) {
      if (isLtrPart(rev[i])) {
        let j = i;
        while (j < rev.length && (isLtrPart(rev[j]) || /^[!-\/:-@\[-`{-~]$/.test(rev[j]))) j++;
        out.push(...rev.slice(i, j).reverse());
        i = j;
      } else { out.push(rev[i]); i++; }
    }
    return out.join('');
  }

  function fontKindOf(font) {
    const n = (font && font.name) || '';
    if (!font || !font.composite) return null;
    if (/segoe/i.test(n)) return 'segoe';
    if (/arial/i.test(n)) return 'arial';
    return null;
  }

  function decodeRun(glyphs, kind) {
    const real = glyphs.filter((g) => g && typeof g === 'object');
    if (!real.length) return { text: '', bad: 0 };
    const insane = real.some((g) => {
      const u = g.unicode;
      return typeof u !== 'string' || !u.length || [...u].some((ch) => !isSaneChar(ch));
    });
    let parts = [], bad = 0;
    if (insane) {
      const table = kind === 'segoe' ? SEGOE_TABLE : kind === 'arial' ? ARIAL_TABLE : null;
      for (const g of real) {
        let s = table ? table[g.originalCharCode] : undefined;
        if (s === undefined) {
          const u = g.unicode;
          if (typeof u === 'string' && u.length && [...u].every(isSaneChar)) s = u; else { s = '\uFFFD'; bad++; }
        }
        parts.push(s);
      }
    } else {
      parts = real.map((g) => g.unicode);
    }
    const joined = parts.join('');
    const text = AR_RE.test(joined) ? visualToLogical(parts) : joined;
    return { text, bad };
  }

  const mul = (a, b) => [
    a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
    a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5],
  ];
  const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

  // مطابقة تامة لدالة extractRuns المعتمدة في student-cards.html
  async function extractRuns(page, OPS) {
    const ol = await page.getOperatorList();
    const fnA = ol.fnArray, argA = ol.argsArray;
    const I = [1, 0, 0, 1, 0, 0];
    let ctm = I, clip = null, pendingRect = null;
    const stack = [];
    let tm = I, tlm = I, leading = 0, fontId = null, fontSize = 1, kind = null;
    const kindCache = {};
    const runs = [];
    const kindFor = (id) => {
      if (id in kindCache) return kindCache[id];
      let k = null;
      try { k = fontKindOf(page.commonObjs.get(id)); } catch (e) { k = null; }
      return (kindCache[id] = k);
    };
    const show = (glyphs) => {
      const trm = mul(tm, ctm);
      const [x, y] = apply(trm, 0, 0);
      const scale = Math.hypot(trm[0], trm[1]) || 1;
      let w = 0;
      for (const g of glyphs) if (g && typeof g === 'object') w += (g.width || 0);
      const wUser = (w / 1000) * fontSize * scale;
      const dec = decodeRun(glyphs, kind);
      runs.push({ text: dec.text, bad: dec.bad, x0: x, x1: x + wUser, y, size: fontSize * scale, clip });
      tm = mul([1, 0, 0, 1, (w / 1000) * fontSize, 0], tm);
    };
    for (let i = 0; i < fnA.length; i++) {
      const fn = fnA[i], a = argA[i];
      switch (fn) {
        case OPS.save: stack.push({ ctm, clip }); break;
        case OPS.restore: { const s = stack.pop(); if (s) { ctm = s.ctm; clip = s.clip; } break; }
        case OPS.transform: ctm = mul(a, ctm); break;
        case OPS.constructPath: {
          const ops = a[0], args = a[1];
          pendingRect = null;
          if (ops.length === 1 && ops[0] === OPS.rectangle) {
            const [rx, ry, rw, rh] = args;
            const p1 = apply(ctm, rx, ry), p2 = apply(ctm, rx + rw, ry + rh);
            pendingRect = { x0: Math.min(p1[0], p2[0]), x1: Math.max(p1[0], p2[0]), y0: Math.min(p1[1], p2[1]), y1: Math.max(p1[1], p2[1]) };
          }
          break;
        }
        case OPS.clip: case OPS.eoClip: if (pendingRect) clip = pendingRect; break;
        case OPS.endPath: pendingRect = null; break;
        case OPS.beginText: tm = I; tlm = I; break;
        case OPS.setFont: fontId = a[0]; fontSize = a[1]; kind = kindFor(fontId); break;
        case OPS.setLeading: leading = a[0]; break;
        case OPS.moveText: tlm = mul([1, 0, 0, 1, a[0], a[1]], tlm); tm = tlm; break;
        case OPS.setLeadingMoveText: leading = -a[1]; tlm = mul([1, 0, 0, 1, a[0], a[1]], tlm); tm = tlm; break;
        case OPS.setTextMatrix: tlm = a.slice(0, 6); tm = tlm; break;
        case OPS.nextLine: tlm = mul([1, 0, 0, 1, 0, -leading], tlm); tm = tlm; break;
        case OPS.showText: show(a[0]); break;
        case OPS.showSpacedText: show(a[0]); break;
        case OPS.nextLineShowText: tlm = mul([1, 0, 0, 1, 0, -leading], tlm); tm = tlm; show(a[0]); break;
        case OPS.nextLineSetSpacingShowText: tlm = mul([1, 0, 0, 1, 0, -leading], tlm); tm = tlm; show(a[2]); break;
        default: break;
      }
    }
    return runs;
  }

  function runsToCells(runs) {
    const map = new Map(), cells = [];
    for (const r of runs) {
      if (!cleanText(r.text)) continue;
      if (r.clip) {
        const k = [r.clip.x0, r.clip.x1, r.clip.y0, r.clip.y1].map((v) => Math.round(v * 10)).join('|');
        let c = map.get(k);
        if (!c) { c = { x0: r.clip.x0, x1: r.clip.x1, y0: r.clip.y0, y1: r.clip.y1, boxed: true, parts: [], bad: 0 }; map.set(k, c); cells.push(c); }
        c.parts.push(r); c.bad += r.bad;
      } else {
        cells.push({ x0: r.x0, x1: Math.max(r.x1, r.x0 + 1), y0: r.y - r.size * 0.25, y1: r.y + r.size * 0.85, boxed: false, parts: [r], bad: r.bad });
      }
    }
    for (const c of cells) {
      const ps = c.parts.slice().sort((p, q) => (Math.abs(q.y - p.y) > 2 ? q.y - p.y : q.x0 - p.x0));
      c.text = cleanText(ps.map((p) => p.text).join(' '));
      c.cy = (c.y0 + c.y1) / 2;
    }
    return cells.filter((c) => c.text);
  }

  function clusterRows(cells) {
    const hs = cells.filter((c) => c.boxed).map((c) => c.y1 - c.y0).sort((a, b) => a - b);
    const medH = hs.length ? hs[Math.floor(hs.length / 2)] : 10;
    const tol = Math.max(2, medH * 0.35);
    const sorted = cells.slice().sort((a, b) => b.cy - a.cy);
    const rows = [];
    for (const c of sorted) {
      const last = rows[rows.length - 1];
      if (last && Math.abs(last.cy - c.cy) <= tol) {
        last.cells.push(c);
        last.cy = (last.cy * (last.cells.length - 1) + c.cy) / last.cells.length;
      } else {
        rows.push({ cy: c.cy, cells: [c] });
      }
    }
    rows.forEach((r) => r.cells.sort((a, b) => b.x0 - a.x0));
    return rows;
  }

  const HEADER_WORDS = ['اسم', 'الاسم', 'كود', 'المستخدم', 'الصف', 'الفصل', 'رقم', 'الطالب', 'التلميذ', 'الاجمالي', 'الإجمالي', 'غياب', 'اسبوع'];

  function headerScore(cells) {
    let n = 0;
    for (const c of cells) {
      const s = normAr(c.text);
      if (!s) continue;
      if (s === 'م' || HEADER_WORDS.some((w) => s === w || s.includes(w))) n++;
    }
    return n;
  }

  function buildColumns(headerCells) {
    const hs = headerCells.slice().sort((a, b) => b.x0 - a.x0); // من اليمين لليسار
    const cols = hs.map((c) => ({ x0: c.x0, x1: c.x1, boxed: c.boxed, cx: (c.x0 + c.x1) / 2, label: c.text }));
    for (let i = 0; i < cols.length; i++) {
      if (cols[i].boxed) continue;
      const right = i > 0 ? (cols[i - 1].cx + cols[i].cx) / 2 : cols[i].x1 + 40;
      const left = i < cols.length - 1 ? (cols[i + 1].cx + cols[i].cx) / 2 : cols[i].x0 - 40;
      cols[i].x0 = left; cols[i].x1 = right;
    }
    return cols;
  }

  function colIndex(cols, cell) {
    const cx = (cell.x0 + cell.x1) / 2;
    let best = -1, bd = Infinity;
    cols.forEach((c, i) => {
      const inside = cx >= c.x0 - 0.5 && cx <= c.x1 + 0.5;
      const d = inside ? 0 : Math.min(Math.abs(cx - c.x0), Math.abs(cx - c.x1));
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }

  /**
   * استخراج بيانات الترويسة من الخلايا المتجاورة أعلى الجدول في كل صفحة
   */
  function parsePageMetadata(rowsAbove) {
    const meta = {
      governorate: '',
      administration: '',
      affiliation: '',
      school: '',
      stage: '',
      grade: '',
      className: '',
      academicYear: ''
    };

    for (const r of rowsAbove) {
      const cs = r.cells.slice().sort((a, b) => b.x0 - a.x0); // من اليمين لليسار
      for (let i = 0; i < cs.length; i++) {
        const t = cleanText(cs[i].text);
        if (!t) continue;

        // استخراج السنة الدراسية من عنوان التقرير (مثلاً 2025 - 2026)
        const yearM = t.match(/(20\d{2})\s*[-–/]\s*(20\d{2})/);
        if (yearM && !meta.academicYear) {
          meta.academicYear = `${yearM[1]}-${yearM[2]}`;
        }

        // استخراج رقم الفصل من خلية "فصل 1 / 11" (التي لا تحتوي على نقطتين رأسيتين)
        if (/^(?:فصل|الفصل)(?:\s|$)/.test(t) && !/[:：]$/.test(t)) {
          const clsVal = cleanText(t.replace(/^(?:فصل|الفصل)\s*[:：]?\s*/, ''));
          if (clsVal && !meta.className) meta.className = clsVal;
          continue;
        }

        // استخراج الحقول المنتهية بنقطتين رأسيتين (المديرية: | الجيزة)
        if (/[:：]$/.test(t)) {
          const label = normAr(t.replace(/[:：]$/, ''));
          let val = '';
          if (i + 1 < cs.length && !/[:：]$/.test(cs[i + 1].text)) {
            val = cleanText(cs[i + 1].text);
          }
          if (!val) continue;
          if (label.includes('مديريه') && !meta.governorate) meta.governorate = val;
          else if (label.includes('اداره') && !meta.administration) meta.administration = val;
          else if (label.includes('تبعيه') && !meta.affiliation) meta.affiliation = val;
          else if (label.includes('مرحله') && !meta.stage) meta.stage = val;
          else if (label.includes('مدرسه') && !meta.school) meta.school = val;
          else if (label === 'الصف' || label.includes('صف')) {
            if (!meta.grade) meta.grade = val;
          } else if (label.includes('فصل') && !meta.className) {
            meta.className = val;
          }
        }
      }
    }

    return meta;
  }

  /**
   * قراءة ملف PDF لتقرير الغياب الرسمي الصادر من موقع الوزارة
   * (رصد الغياب بأسماء الطلاب حسب الفصل)
   * @param {Object} pdfjs - مرجع لمكتبة pdfjsLib
   * @param {ArrayBuffer|Uint8Array} data - مصفوفة بايتات ملف الـ PDF
   * @param {Function} [onProgress] - دالة تحديث شريط التقدم
   * @returns {Promise<Object>}
   */
  async function parseAbsencePdf(pdfjs, data, onProgress) {
    if (!pdfjs) throw new Error('مكتبة pdfjsLib غير متوفرة');
    const uint8 = data instanceof Uint8Array ? data : new Uint8Array(data);
    const doc = await pdfjs.getDocument({ data: uint8, verbosity: 0, isEvalSupported: false }).promise;
    const OPS = pdfjs.OPS;
    const numPages = doc.numPages;

    const meta = {
      governorate: '',
      administration: '',
      affiliation: '',
      school: '',
      stage: '',
      grade: '',
      className: '',
      academicYear: ''
    };
    const students = [];
    const rejectedRows = [];
    let prevCols = null;
    let prevKeys = null;
    let currentPageMeta = Object.assign({}, meta);

    for (let p = 1; p <= numPages; p++) {
      if (onProgress) onProgress(p, numPages);
      const page = await doc.getPage(p);
      const runs = await extractRuns(page, OPS);
      const cells = runsToCells(runs);
      const rows = clusterRows(cells);

      // البحث عن صف الترويسة الرئيسي للجدول (الذي يضم م، كود الطالب، اسم الطالب، الإجمالي)
      let hi = -1, bestScore = 1;
      rows.forEach((r, idx) => {
        const sc = headerScore(r.cells);
        if (sc > bestScore || (sc === bestScore && r.cells.length > (rows[hi]?.cells.length || 0))) {
          bestScore = sc;
          hi = idx;
        }
      });

      let cols, keys, bodyRows;
      if (hi >= 0) {
        const pageMeta = parsePageMetadata(rows.slice(0, hi));
        currentPageMeta = {
          governorate: pageMeta.governorate || currentPageMeta.governorate,
          administration: pageMeta.administration || currentPageMeta.administration,
          affiliation: pageMeta.affiliation || currentPageMeta.affiliation,
          school: pageMeta.school || currentPageMeta.school,
          stage: pageMeta.stage || currentPageMeta.stage,
          grade: pageMeta.grade || currentPageMeta.grade,
          className: pageMeta.className || currentPageMeta.className,
          academicYear: pageMeta.academicYear || currentPageMeta.academicYear
        };
        if (!meta.school && currentPageMeta.school) Object.assign(meta, currentPageMeta);

        const hdrRow = rows[hi];
        cols = buildColumns(hdrRow.cells);
        keys = cols.map((c) => c.label);
        prevCols = cols;
        prevKeys = keys;
        bodyRows = rows.slice(hi + 1);
      } else if (prevCols) {
        cols = prevCols;
        keys = prevKeys;
        bodyRows = rows;
      } else {
        continue;
      }

      // تحديد فهارس الأعمدة الحيوية: كود الطالب، اسم الطالب، الإجمالي
      let codeIdx = -1, nameIdx = -1, totalIdx = -1, noIdx = -1;
      keys.forEach((k, idx) => {
        const nk = normAr(k);
        if (/كود/.test(nk)) codeIdx = idx;
        else if (/اسم/.test(nk)) nameIdx = idx;
        else if (/اجمالي|مجموع/.test(nk)) totalIdx = idx;
        else if (nk === 'م' || /مسلسل/.test(nk)) noIdx = idx;
      });

      if (codeIdx < 0 || nameIdx < 0 || totalIdx < 0) {
        continue;
      }

      for (const r of bodyRows) {
        if (!r.cells.length) continue;

        // تجاهل تذييل الصفحة الرسمي مثل: "صفحة: | 10 من 193 | 10/29/2026"
        const rowJoined = r.cells.map((c) => c.text).join(' ');
        if (/صفح[ةه]\s*[:：]|\d+\s+من\s+\d+/.test(rowJoined) && r.cells.length <= 4) {
          continue;
        }

        const rec = {};
        keys.forEach((k) => (rec[k] = ''));

        r.cells.forEach((c) => {
          const ix = colIndex(cols, c);
          if (ix >= 0) {
            rec[keys[ix]] = rec[keys[ix]] ? rec[keys[ix]] + ' ' + c.text : c.text;
          }
        });

        const codeVal = cleanText(rec[keys[codeIdx]]);
        const nameVal = cleanText(rec[keys[nameIdx]]);
        const totalValStr = cleanText(rec[keys[totalIdx]]);

        const digits = codeVal.replace(/\D/g, '');
        if (digits.length >= 6 && nameVal.length >= 3) {
          const parsedTotal = parseInt(totalValStr, 10);
          const absenceDays = isNaN(parsedTotal) ? 0 : parsedTotal;
          students.push({
            no: noIdx >= 0 ? cleanText(rec[keys[noIdx]]) : String(students.length + 1),
            code: digits,
            name: nameVal,
            grade: currentPageMeta.grade || meta.grade || 'غير محدد',
            className: currentPageMeta.className || meta.className || 'غير محدد',
            school: currentPageMeta.school || meta.school || '',
            administration: currentPageMeta.administration || meta.administration || '',
            governorate: currentPageMeta.governorate || meta.governorate || '',
            academicYear: currentPageMeta.academicYear || meta.academicYear || '',
            absenceDays,
            totalStatus: isNaN(parsedTotal) ? totalValStr : String(parsedTotal),
            page: p,
            level: global.NeprasAbsenceWarnings?.getWarningLevel
              ? global.NeprasAbsenceWarnings.getWarningLevel(absenceDays)
              : (absenceDays >= 15 ? 'إنذار بالفصل' : (absenceDays >= 10 ? 'إنذار ثان' : (absenceDays >= 5 ? 'إنذار أول' : '')))
          });
        } else if (codeVal || nameVal) {
          rejectedRows.push({ page: p, code: codeVal, name: nameVal, total: totalValStr });
        }
      }
    }

    return {
      meta,
      pagesCount: numPages,
      totalStudents: students.length,
      rejectedRows,
      students
    };
  }

  /**
   * دمج كشوف غياب متعددة لعدة فصول في كشف مدرسي موحد بدون تكرار
   * @param {Array<Object>} parsedReports
   * @returns {Object}
   */
  function mergeAbsenceReports(parsedReports) {
    const list = Array.isArray(parsedReports) ? parsedReports : [parsedReports];
    const map = new Map();
    let meta = {};
    const rejectedRows = [];
    let pagesCount = 0;

    for (const rep of list) {
      if (!rep) continue;
      if (rep.meta) meta = Object.assign({}, meta, rep.meta);
      if (rep.pagesCount) pagesCount += rep.pagesCount;
      if (Array.isArray(rep.rejectedRows)) rejectedRows.push(...rep.rejectedRows);
      const stus = rep.students || [];
      for (const s of stus) {
        if (!s.code) continue;
        const key = String(s.code).trim();
        if (!map.has(key)) {
          map.set(key, s);
        } else {
          const existing = map.get(key);
          if (s.absenceDays >= existing.absenceDays) {
            map.set(key, Object.assign({}, existing, s));
          }
        }
      }
    }

    const mergedStudents = Array.from(map.values());
    return {
      meta,
      pagesCount,
      totalStudents: mergedStudents.length,
      rejectedRows,
      students: mergedStudents
    };
  }

  const exported = Object.freeze({
    parseAbsencePdf,
    mergeAbsenceReports,
    extractRuns,
    runsToCells,
    clusterRows,
    normAr,
    cleanText
  });

  global.NeprasAbsencePdfParser = exported;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }

})(typeof window !== 'undefined' ? window : globalThis);
