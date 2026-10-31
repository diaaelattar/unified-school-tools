'use strict';
const assert = require('assert');
const zlib = require('zlib');
const { loadGlobals, test, summary } = require('./_helpers');

// قراءة ملفات ZIP من حزمة XLSX
function readZipEntries(u8) {
  const buf = Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength);
  const out = {};
  let o = 0;
  while (o + 4 <= buf.length && buf.readUInt32LE(o) === 0x04034b50) {
    const method = buf.readUInt16LE(o + 8);
    const csize = buf.readUInt32LE(o + 18);
    const nlen = buf.readUInt16LE(o + 26);
    const elen = buf.readUInt16LE(o + 28);
    const name = buf.slice(o + 30, o + 30 + nlen).toString('utf8');
    const data = buf.slice(o + 30 + nlen + elen, o + 30 + nlen + elen + csize);
    out[name] = (method === 8 ? zlib.inflateRawSync(data) : data).toString('utf8');
    o += 30 + nlen + elen + csize;
  }
  return out;
}

globalThis.chrome = {
  runtime: { onMessage: { addListener() {} }, sendMessage() {} },
  storage: { local: { get(_, cb) { if (cb) cb({}); return Promise.resolve({}); }, set() {}, remove() {} } }
};

const win = loadGlobals(
  'modules/egypt_ids.js',
  'modules/xlsx_writer.js',
  'modules/class_lists_excel.js',
  'modules/school_records.js'
);

console.log('records_and_print');

test('studentFromApiRow: يقرأ الفصل والصف من كافة صيغ الوزارة بدون اختلاق نوع أو ديانة', () => {
  const s1 = win.NeprasRecords.studentFromApiRow({
    studentName: 'أحمد محمد علي حسن',
    studentCode: '123456',
    nationalId: '31205012101234',
    gradeName: 'الصف الأول الإعدادي',
    classRoom: '1/2'
  }, '', 1);
  assert.strictEqual(s1.grade, 'الصف الأول الإعدادي');
  assert.strictEqual(s1.class_number, '1/2');
  assert.strictEqual(s1.class_name, 'فصل 1/2');
  assert.strictEqual(s1.religion, ''); // لا يختلق مسلم

  const s2 = win.NeprasRecords.studentFromApiRow({
    'اسم التلميذ': 'مريم جرجس بطرس',
    'كود التلميذ': '654321',
    'الفصل': '3',
    __neprasApiRaw: { religionId: 2, className: 'الصف الثاني الإعدادي' }
  }, 'الصف الثاني الإعدادي', 2);
  assert.strictEqual(s2.grade, 'الصف الثاني الإعدادي');
  assert.strictEqual(s2.class_name, 'فصل 3');
  assert.strictEqual(s2.religion, 'مسيحي');
  assert.strictEqual(s2.gender, ''); // لا رقم قومي ولا نوع صريح -> فارغ
});

test('groupStudentsByClass: يقسم الصف إلى فصول مرتبة رقمياً ويرتب البنين ثم البنات أبجدياً', () => {
  const sample = [
    { name: 'زينب علي', gender: 'أنثى', grade: 'الصف الأول الإعدادي', class_name: 'فصل 10' },
    { name: 'إبراهيم حسن', gender: 'ذكر', grade: 'الصف الأول الإعدادي', class_name: 'فصل 2' },
    { name: 'سارة محمود', gender: 'أنثى', grade: 'الصف الأول الإعدادي', class_name: 'فصل 1' },
    { name: 'أحمد كمال', gender: 'ذكر', grade: 'الصف الأول الإعدادي', class_name: 'فصل 1' },
    { name: 'ياسر سعيد', gender: 'ذكر', grade: 'الصف الأول الإعدادي', class_name: 'فصل 1' },
    { name: 'محمد عادل', gender: 'ذكر', grade: 'الصف الثاني الإعدادي', class_name: 'فصل 1' }
  ];

  const groups = win.NeprasRecords.groupStudentsByClass(sample, 'gender_boys');
  assert.strictEqual(groups.length, 4);
  assert.deepStrictEqual(
    groups.map(g => g.shortSheetName(1, 1)),
    ['فصل 1-1', 'فصل 1-2', 'فصل 1-10', 'فصل 2-1']
  );
  // داخل فصل 1-1: البنين أولاً أبجدياً ثم البنات
  assert.deepStrictEqual(
    groups[0].students.map(s => s.name),
    ['أحمد كمال', 'ياسر سعيد', 'سارة محمود']
  );
  // الترقيم عند تعدد الصفحات لا يتجاوز 31 حرفاً ولا يتصادم
  const p1 = groups[0].shortSheetName(1, 2);
  const p2 = groups[0].shortSheetName(2, 2);
  assert.NotStrictEqual ? assert.notStrictEqual(p1, p2) : assert(p1 !== p2);
  assert(p1.length <= 31 && p2.length <= 31);
  assert(p1.endsWith('ص1') && p2.endsWith('ص2'));
});

test('كشوف الصحة والغياب: 35 طالباً بالصفحة مع صف توقيعات وتكرار عناوين الطباعة', () => {
  const ctx = { governorate: 'الفيوم', directorate: 'الفيوم', administration: 'شرق الفيوم', school: 'مدرسة النور', academicYear: '2025 / 2026' };
  const students = Array.from({ length: 35 }, (_, i) => ({
    name: `طالب رقم ${i + 1}`,
    class_name: 'فصل 1/1',
    national_id: '31201012301234',
    phone: '01000000000'
  }));

  const ws100 = win.NeprasRecords.build100MillionSurveySheet(students, 'الصف الأول - فصل 1', ctx, 1, 2, 35);
  assert.strictEqual(ws100['!repeatRows'], '1:5');
  assert.strictEqual(ws100['!orientation'], 'landscape');
  // التحقق من وجود توقيع مدير المدرسة في نهاية الورقة
  const cells = Object.values(ws100).filter(v => v && typeof v.v === 'string').map(v => v.v);
  assert(cells.some(t => t.includes('مدير المدرسة')), 'يجب أن يحتوي الكشف على توقيع مدير المدرسة');

  const wb = {
    SheetNames: ['فصل 1-1 ص1', 'فصل 1-1 ص2'],
    Sheets: {
      'فصل 1-1 ص1': ws100,
      'فصل 1-1 ص2': win.NeprasRecords.build100MillionSurveySheet(students.slice(0, 10), 'الصف الأول - فصل 1', ctx, 2, 2, 35)
    }
  };
  const bytes = win.neprasXlsxConvertWorkbookToStyledPackage(wb);
  const zip = readZipEntries(bytes);

  // فحص تكرار صفوف العناوين في الطباعة (_xlnm.Print_Titles)
  assert(zip['xl/workbook.xml'].includes('_xlnm.Print_Titles'), 'يجب تضمين _xlnm.Print_Titles لتكرار الترويسة عند الطباعة');
  // فحص عدم تحديد جميع الأوراق معاً (tabSelected="1" في الورقة الأولى فقط)
  assert(zip['xl/worksheets/sheet1.xml'].includes('tabSelected="1"'));
  assert(!zip['xl/worksheets/sheet2.xml'].includes('tabSelected="1"'));
  // فحص التوسيط الأفقي وتذييل ترقيم الصفحات
  assert(zip['xl/worksheets/sheet1.xml'].includes('horizontalCentered="1"'));
  assert(zip['xl/worksheets/sheet1.xml'].includes('صفحة &amp;P من &amp;N'));
});

test('neprasBuildMultiSheetWorkbook: يدعم التوجيه والتوقيعات وتكرار العناوين وعدم تصادم الأسماء الطويلة', () => {
  const pkg = win.neprasBuildMultiSheetWorkbook([
    {
      name: 'الصف الأول الإعدادي - فصل 1 صفحة طويلة جدا',
      title: 'سجل 5 سلوك — فصل 1/1',
      infoLines: ['المدرسة: مدرسة النور'],
      headers: ['م', 'كود الطالب', 'اسم الطالب', 'السلوك'],
      rows: [[1, '111', 'أحمد محمد', 5]],
      printFit: true,
      repeatRows: '1:4',
      orientation: 'landscape',
      footerSigners: ['الأخصائي الاجتماعي', 'يعتمد / مدير المدرسة']
    },
    {
      name: 'الصف الأول الإعدادي - فصل 1 صفحة طويلة جدا ثانية',
      title: 'سجل 5 سلوك — فصل 1/2',
      infoLines: ['المدرسة: مدرسة النور'],
      headers: ['م', 'كود الطالب', 'اسم الطالب', 'السلوك'],
      rows: [[1, '222', 'محمود علي', 5]],
      printFit: true,
      repeatRows: '1:4',
      orientation: 'landscape',
      footerSigners: ['الأخصائي الاجتماعي', 'يعتمد / مدير المدرسة']
    }
  ]);

  const zip = readZipEntries(pkg);
  assert(zip['xl/workbook.xml'].includes('_xlnm.Print_Titles'));
  assert(zip['xl/worksheets/sheet1.xml'].includes('orientation="landscape"'));
  assert(zip['xl/worksheets/sheet1.xml'].includes('الأخصائي الاجتماعي'));
  // التحقق من عدم تطابق اسمي الورقتين بعد الاقتطاع إلى 31 حرفاً
  const sheetMatches = [...zip['xl/workbook.xml'].matchAll(/<sheet name="([^"]+)"/g)].map(m => m[1]);
  assert.strictEqual(sheetMatches.length, 2);
  assert.notStrictEqual(sheetMatches[0], sheetMatches[1]);
  assert(sheetMatches[0].length <= 31 && sheetMatches[1].length <= 31);
});

summary('records_and_print');
