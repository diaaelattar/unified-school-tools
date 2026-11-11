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

test('تقارير الدمج والأيتام: دقة تصنيف الحالات وعدم تنزيل كامل فصول المدرسة عند عدم وجود حالات', async () => {
  // 1. فحص كشف طلاب الدمج من حقول الوزارة المختلفة
  const normalStudent = win.NeprasRecords.studentFromApiRow({
    studentName: 'محمد سعيد أحمد',
    studentCode: '101',
    nationalId: '31201012101111',
    classRoom: '1/1',
    gradeName: 'الصف الأول الإعدادي',
    __neprasApiRaw: { obstacleId: 0, obstacleName: 'لا يوجد' }
  }, '', 1);
  assert.strictEqual(normalStudent.is_merged, false);
  assert.strictEqual(normalStudent.is_orphan, false);

  const mergeStudent1 = win.NeprasRecords.studentFromApiRow({
    studentName: 'محمود خالد حسن',
    studentCode: '102',
    nationalId: '31201012102222',
    classRoom: '1/1',
    gradeName: 'الصف الأول الإعدادي',
    __neprasApiRaw: { obstacleId: 5, obstacleName: 'إعاقة بصرية' }
  }, '', 2);
  assert.strictEqual(mergeStudent1.is_merged, true);
  assert.strictEqual(mergeStudent1.merge_type, 'إعاقة بصرية');

  const mergeStudent2 = win.NeprasRecords.studentFromApiRow({
    studentName: 'يوسف إبراهيم',
    studentCode: '103',
    nationalId: '31201012103333',
    classRoom: '1/2',
    gradeName: 'الصف الأول الإعدادي',
    'الموقف من الدمج': 'دمج تعليمي - بطء تعلم'
  }, '', 3);
  assert.strictEqual(mergeStudent2.is_merged, true);
  assert.strictEqual(mergeStudent2.merge_type, 'دمج تعليمي - بطء تعلم');

  // 2. فحص كشف الأيتام والإعفاءات
  const orphanStudent = win.NeprasRecords.studentFromApiRow({
    studentName: 'علي عادل كمال',
    studentCode: '104',
    nationalId: '31201012104444',
    classRoom: '1/1',
    gradeName: 'الصف الأول الإعدادي',
    __neprasApiRaw: { fatherStatusName: 'متوفى' }
  }, '', 4);
  assert.strictEqual(orphanStudent.is_orphan, true);
  assert.strictEqual(orphanStudent.social_status, 'يتيم الأب');
  assert.strictEqual(orphanStudent.is_exempt, true);

  const takafolStudent = win.NeprasRecords.studentFromApiRow({
    studentName: 'فاطمة عمر حسين',
    studentCode: '105',
    nationalId: '31201012105555',
    classRoom: '1/3',
    gradeName: 'الصف الأول الإعدادي',
    'الحالة الاجتماعية': 'تكافل وكرامة',
    'رقم البحث': 'بحث رقم 8892'
  }, '', 5);
  assert.strictEqual(takafolStudent.is_exempt, true);
  assert.strictEqual(takafolStudent.social_status, 'تكافل وكرامة');

  // 3. التحقق من تصدير الحالات الفعلية المخصصة فقط وليس كامل فصول المدرسة
  let capturedWb = null;
  win.neprasStudentBuildMultiSheetXlsx = (sheets) => {
    capturedWb = sheets;
    return new Uint8Array([1, 2, 3]);
  };
  win.neprasDialog = {
    triggerDownload: async () => ({ finalFileName: 'test.xlsx' }),
    open: () => {}
  };

  // أ) مدرسة بها طلاب عاديون فقط ولا يوجد دمج
  const noMergeSchool = [normalStudent, orphanStudent];
  const resNoMerge = await win.NeprasRecords.runSpecialNeedsMergeExport(noMergeSchool);
  assert.strictEqual(resNoMerge.ok, true);
  assert.strictEqual(resNoMerge.count, 0); // لا يتم تنزيل الفصول

  // ب) مدرسة بها طلاب عاديون فقط ولا يوجد أيتام
  const noOrphanSchool = [normalStudent, mergeStudent1];
  const resNoOrphan = await win.NeprasRecords.runOrphansExemptionsExport(noOrphanSchool);
  assert.strictEqual(resNoOrphan.ok, true);
  assert.strictEqual(resNoOrphan.count, 0); // لا يتم تنزيل الفصول

  // ج) مدرسة بها حالات مخصصة: يجب أن يحتوي الملف على كشف شامل + أوراق الفصول التي بها حالات فقط
  const schoolStudents = [normalStudent, mergeStudent1, mergeStudent2, orphanStudent, takafolStudent];
  capturedWb = null;
  const resMergeSuccess = await win.NeprasRecords.runSpecialNeedsMergeExport(schoolStudents);
  assert.strictEqual(resMergeSuccess.ok, true);
  assert.strictEqual(resMergeSuccess.count, 2); // طالبان دمج فقط
  assert(capturedWb && capturedWb.length >= 2, 'يجب أن يحتوي الملف على الكشف الشامل والفصول المخصصة');
  assert.strictEqual(capturedWb[0].name, 'طلاب الدمج - كشف شامل');
  assert.strictEqual(capturedWb[0].rows.length, 2); // الحالتان فقط

  capturedWb = null;
  const resOrphanSuccess = await win.NeprasRecords.runOrphansExemptionsExport(schoolStudents);
  assert.strictEqual(resOrphanSuccess.ok, true);
  assert.strictEqual(resOrphanSuccess.count, 2); // حالتان فقط (يتيم + تكافل)
  assert(capturedWb && capturedWb.length >= 2, 'يجب أن يحتوي الملف على الكشف الشامل والفصول المخصصة');
  assert.strictEqual(capturedWb[0].name, 'الأيتام والإعفاءات - شامل');
  assert.strictEqual(capturedWb[0].rows.length, 2); // الحالتان فقط
});

test('runCustomEightColumnsExport: توليد كشف الطلاب المخصص (9 أعمدة تشمل الفصل، وتحديد دقيق للمرحلة الابتدائية/الإعدادية)', async () => {
  let downloadedBuffer = null;
  win.neprasDialog = {
    triggerDownload: async (blob, filename) => {
      downloadedBuffer = Buffer.from(await blob.arrayBuffer());
      return { finalFileName: filename };
    },
    open: () => {}
  };
  globalThis.XLSX = require('../xlsx.full.min.js');

  const sample = [
    {
      name: 'أحمد محمد علي حسن',
      national_id: '31501010100019',
      code: '123456789',
      grade: 'الصف الأول الإعدادي',
      class_name: 'فصل 1/1',
      stage: 'المرحلة الإعدادية',
      school: 'مدرسة النهضة الإعدادية',
      administration: 'إدارة شرق التعليمية'
    },
    {
      name: 'فاطمة محمود إبراهيم',
      national_id: '31502020100028',
      code: '987654321',
      grade: 'الصف الأول الإعدادي',
      class_name: 'فصل 1/2',
      stage: 'الصف الأول', // اسم صف وُضع خطأً في حقل المرحلة
      school: 'مدرسة النهضة الإعدادية',
      administration: 'إدارة شرق التعليمية'
    },
    {
      name: 'علي إبراهيم حسن',
      national_id: '31803030100037',
      code: '555666777',
      grade: 'الصف الأول',
      class_name: 'فصل 1/3',
      school: 'مدرسة عمر بن الخطاب الابتدائية',
      administration: 'إدارة غرب التعليمية'
    }
  ];

  const res = await win.NeprasRecords.runCustomEightColumnsExport(sample);
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.count, 3);
  assert(res.filename.includes('كشف_الطلاب_المخصص'));
  assert(downloadedBuffer && downloadedBuffer.length > 0);

  // التحقق الدقيق من محتوى أوراق العمل
  const wb = globalThis.XLSX.read(downloadedBuffer, { type: 'buffer' });
  assert(wb.SheetNames.includes('كشف_الطلاب_الشامل'));
  const sheet = wb.Sheets['كشف_الطلاب_الشامل'];
  const jsonRows = globalThis.XLSX.utils.sheet_to_json(sheet, { header: 1 });

  // 1. ترويسة الجدول: 9 أعمدة مطابقة (م، الإدارة، المدرسة، المرحلة، إسم الطالب، الكود، الصف، الفصل، الرقم القومى)
  const headerRow = jsonRows[0];
  assert.deepStrictEqual(headerRow, ['م', 'الإدارة', 'المدرسة', 'المرحلة', 'إسم الطالب', 'الكود', 'الصف', 'الفصل', 'الرقم القومى']);

  // 2. التحقق من أعمدة الصف والفصل والمرحلة
  // الطالب 1: إعدادي، فصل 1/1
  assert.strictEqual(jsonRows[1][3], 'الإعدادية');
  assert.strictEqual(jsonRows[1][6], 'الصف الأول الإعدادي');
  assert.strictEqual(jsonRows[1][7], 'فصل 1/1');

  // الطالب 2: المرحلة كانت تحمل 'الصف الأول' خطأً، وتم تصحيحها تلقائياً إلى 'الإعدادية' مع بقاء الفصل 'فصل 1/2'
  assert.strictEqual(jsonRows[2][3], 'الإعدادية');
  assert.strictEqual(jsonRows[2][7], 'فصل 1/2');

  // الطالب 3: مدرسة ابتدائية، وتم التعرف على المرحلة 'الابتدائية'
  assert.strictEqual(jsonRows[3][3], 'الابتدائية');
  assert.strictEqual(jsonRows[3][7], 'فصل 1/3');
});

test('runMinistryUploadSheetExport: توليد كشف الرفع وتحديث الموقع بالـ 7 أعمدة الرسمية', async () => {
  let downloadedBuffer = null;
  win.neprasDialog = {
    triggerDownload: async (blob, filename) => {
      downloadedBuffer = Buffer.from(await blob.arrayBuffer());
      return { finalFileName: filename };
    },
    open: () => {}
  };
  globalThis.XLSX = require('../xlsx.full.min.js');

  const uploadSample = [
    {
      name: 'محمود السيد عبد الله',
      code: '87654321',
      studentCode: '87654321',
      national_id: '31501010100019',
      grade: 'الصف الأول الثانوي',
      class_name: 'فصل 1/1',
      lang1: 'اللغة الإنجليزية',
      lang2: 'اللغة الفرنسية',
      damg: 'ضعف سمع',
      is_merged: true,
      section: 'علمي',
      specialization: 'عام'
    },
    {
      name: 'زينب أحمد إبراهيم',
      code: '12349876',
      studentCode: '12349876',
      national_id: '31502020100028',
      grade: 'الصف الأول الثانوي',
      class_name: 'فصل 1/2',
      lang1: 'اللغة الإنجليزية',
      lang2: 'اللغة الألمانية',
      damg: '',
      is_merged: false,
      section: 'أدبي',
      specialization: 'أدبي'
    }
  ];

  const res = await win.NeprasRecords.runMinistryUploadSheetExport(uploadSample);
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.count, 2);
  assert(res.filename.includes('كشف_الرفع_وتحديث_الموقع'));
  assert(downloadedBuffer && downloadedBuffer.length > 0);

  const wb = globalThis.XLSX.read(downloadedBuffer, { type: 'buffer' });
  assert(wb.SheetNames.includes('بيانات_الرفع'));
  const sheet = wb.Sheets['بيانات_الرفع'];
  const jsonRows = globalThis.XLSX.utils.sheet_to_json(sheet, { header: 1 });

  // 1. ترويسة الجدول: 7 أعمدة رسمية مطابقة تماماً
  assert.deepStrictEqual(jsonRows[0], [
    'كود التلميذ',
    'اسم التلميذ',
    'اللغة الأولى',
    'اللغة الثانية',
    'الموقف من الدمج',
    'الشعبة',
    'التخصص'
  ]);

  // 2. الطالب الأول (دمج): الكود، الاسم، اللغات، موقف الدمج الفعلي، الشعبة، التخصص
  assert.strictEqual(jsonRows[1][0], '87654321');
  assert.strictEqual(jsonRows[1][1], 'محمود السيد عبد الله');
  assert.strictEqual(jsonRows[1][2], 'اللغة الإنجليزية');
  assert.strictEqual(jsonRows[1][3], 'اللغة الفرنسية');
  assert.strictEqual(jsonRows[1][4], 'ضعف سمع');
  assert.strictEqual(jsonRows[1][5], 'علمي');
  assert.strictEqual(jsonRows[1][6], 'عام');

  // 3. الطالب الثاني (عادي): موقف الدمج الرسمي 'لا يوجد'
  assert.strictEqual(jsonRows[2][0], '12349876');
  assert.strictEqual(jsonRows[2][1], 'زينب أحمد إبراهيم');
  assert.strictEqual(jsonRows[2][2], 'اللغة الإنجليزية');
  assert.strictEqual(jsonRows[2][3], 'اللغة الألمانية');
  assert.strictEqual(jsonRows[2][4], 'لا يوجد');
  assert.strictEqual(jsonRows[2][5], 'أدبي');
  assert.strictEqual(jsonRows[2][6], 'أدبي');
});

summary('records_and_print');
