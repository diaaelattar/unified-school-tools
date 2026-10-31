'use strict';

const assert = require('assert');
const path = require('path');

// تحميل وحدة absence_warnings ووحدة absence_pdf_parser
require('../modules/absence_warnings.js');
require('../modules/absence_pdf_parser.js');

console.log('--- اختبارات وحدة استخراج تقارير الغياب الرسمية للوزارة (NeprasAbsencePdfParser) ---');

// 1. التحقق من توفر الوحدة وتصدير دوالها
assert(global.NeprasAbsencePdfParser, 'يجب أن تكون وحدة NeprasAbsencePdfParser معرفة');
assert.strictEqual(typeof global.NeprasAbsencePdfParser.parseAbsencePdf, 'function');
assert.strictEqual(typeof global.NeprasAbsencePdfParser.mergeAbsenceReports, 'function');
assert.strictEqual(typeof global.NeprasAbsencePdfParser.normAr, 'function');
assert.strictEqual(typeof global.NeprasAbsencePdfParser.cleanText, 'function');
console.log('✓ تم التحقق من تصدير دوال وحدة معالجة PDF الغياب');

// 2. اختبار تنظيف وتوحيد النصوص العربية والأرقام
const norm = global.NeprasAbsencePdfParser.normAr;
assert.strictEqual(norm('الإجمالي'), 'الاجمالي');
assert.strictEqual(norm('كود الطالب'), 'كود الطالب');
assert.strictEqual(norm('فصل 11 / 1'), 'فصل 11 / 1');
console.log('✓ تم التحقق من دوال تنظيف وتوحيد النصوص العربية');

// 3. اختبار دمج كشوف الفصول المتعددة mergeAbsenceReports
const classReport1 = {
  meta: {
    school: 'الشهيد محمد سليمان سلامة ع بنين',
    governorate: 'الجيزة',
    administration: 'العمرانية',
    grade: 'الصف الأول',
    className: '11 / 1'
  },
  students: [
    { code: '483610851', name: 'محمد وائل محمد عبد العليم', grade: 'الصف الأول', className: '11 / 1', absenceDays: 6, level: 'إنذار أول' },
    { code: '483887405', name: 'يوسف اسلام رزق خلف', grade: 'الصف الأول', className: '11 / 1', absenceDays: 11, level: 'إنذار ثان' }
  ]
};

const classReport2 = {
  meta: {
    school: 'الشهيد محمد سليمان سلامة ع بنين',
    governorate: 'الجيزة',
    administration: 'العمرانية',
    grade: 'الصف الأول',
    className: '11 / 2'
  },
  students: [
    { code: '484139332', name: 'محمد ابراهيم رمضان سيد', grade: 'الصف الأول', className: '11 / 2', absenceDays: 16, level: 'إنذار بالفصل' },
    // تكرار كود لتحديث الغياب
    { code: '483610851', name: 'محمد وائل محمد عبد العليم', grade: 'الصف الأول', className: '11 / 1', absenceDays: 8, level: 'إنذار أول' }
  ]
};

const merged = global.NeprasAbsencePdfParser.mergeAbsenceReports([classReport1, classReport2]);
assert.strictEqual(merged.totalStudents, 3, 'يجب دمج الطلاب وإزالة التكرار مع الاحتفاظ بـ 3 طلاب مميزين');
const updatedStudent = merged.students.find(s => s.code === '483610851');
assert.strictEqual(updatedStudent.absenceDays, 8, 'يجب تحديث أيام الغياب للرقم الأحدث/الأكبر عند تكرار الكود');
console.log('✓ تم التحقق من دمج تقارير الفصول المتعددة بدون تكرار بنجاح');

// 4. اختبار تكامل كشف الغياب مع نظام الإنذارات NeprasAbsenceWarnings
const summary = global.NeprasAbsenceWarnings.summarizeAbsence(merged.students);
assert.strictEqual(summary.total, 3, 'إجمالي الطلاب المستخرجين 3');
assert.strictEqual(summary.first, 1, 'طالب واحد مستحق إنذار أول (8 أيام)');
assert.strictEqual(summary.second, 1, 'طالب واحد مستحق إنذار ثانٍ (11 يوماً)');
assert.strictEqual(summary.final, 1, 'طالب واحد مستحق إنذار بالفصل (16 يوماً)');
assert.strictEqual(summary.eligibleCount, 3, 'جميع الطلاب الثلاثة تجاوزوا حد 5 أيام');
console.log('✓ تم التحقق من دقة إحصاءات وفئات الإنذارات الرسمية بنسبة 100%');

// 5. اختبار بناء وثيقة الطباعة الرسمية بنموذج التعهد والاستلام
const html = global.NeprasAbsenceWarnings.buildWarningsHtml(summary.eligibleList, classReport1.meta);
assert(html.includes('إخطار غياب رسمي'), 'يجب أن يتضمن العنوان الرسمي');
assert(html.includes('محمد وائل محمد عبد العليم'), 'يجب أن يظهر اسم الطالب');
assert(html.includes('483610851'), 'يجب أن يظهر كود الطالب');
assert(html.includes('إشعار استلام رسمي يُقطع ويُعاد لإدارة المدرسة'), 'يجب أن يتضمن كعب التعهد والاستلام');
assert(html.includes('إقرار استلام ولي الأمر'), 'يجب أن يتضمن إقرار وتعهد ولي الأمر');
console.log('✓ تم التحقق من توليد كروت ونماذج الإنذارات مع بطاقة التعهد والاستلام');

// 6. اختبار محرك parseAbsencePdf على هيكل أوامر PDF حقيقي (شاملاً TJ و clipping rectangle و خلايا الترويسة المتجاورة)
(async () => {
  const OPS = {
    save: 10,
    restore: 11,
    transform: 12,
    constructPath: 91,
    rectangle: 19,
    clip: 28,
    endPath: 24,
    beginText: 31,
    endText: 32,
    setFont: 37,
    moveText: 33,
    setLeadingMoveText: 34,
    setTextMatrix: 41,
    showText: 44,
    showSpacedText: 45
  };

  function makeTextOps(x0, y0, w, h, str) {
    return {
      fn: [
        OPS.save,
        OPS.constructPath,
        OPS.clip,
        OPS.endPath,
        OPS.beginText,
        OPS.setFont,
        OPS.setTextMatrix,
        OPS.showSpacedText,
        OPS.endText,
        OPS.restore
      ],
      args: [
        [],
        [[OPS.rectangle], [x0, y0, w, h]],
        [],
        [],
        [],
        ['F1', 10],
        [1, 0, 0, 1, x0 + 2, y0 + 2],
        [[{ unicode: str }]],
        [],
        []
      ]
    };
  }

  function combineOps(items) {
    const fnArray = [];
    const argsArray = [];
    for (const it of items) {
      fnArray.push(...it.fn);
      argsArray.push(...it.args);
    }
    return { fnArray, argsArray };
  }

  const pageOps = combineOps([
    // ترويسة الصفحة: خلايا متجاورة + خلية فصل بدون نقطتين
    makeTextOps(500, 750, 40, 15, 'المديرية:'),
    makeTextOps(440, 750, 50, 15, 'الجيزة'),
    makeTextOps(350, 750, 40, 15, 'الإدارة:'),
    makeTextOps(280, 750, 60, 15, 'العمرانية'),
    makeTextOps(500, 730, 40, 15, 'المدرسة:'),
    makeTextOps(350, 730, 140, 15, 'الشهيد محمد سليمان سلامة ع بنين'),
    makeTextOps(500, 710, 40, 15, 'الصف:'),
    makeTextOps(420, 710, 70, 15, 'الصف الأول'),
    makeTextOps(300, 710, 70, 15, 'فصل 1 / 11'),
    makeTextOps(200, 770, 180, 15, 'رصد الغياب بأسماء الطلاب 2025 - 2026'),
    // صف ترويسة الجدول
    makeTextOps(520, 650, 30, 18, 'م'),
    makeTextOps(430, 650, 80, 18, 'كود الطالب'),
    makeTextOps(250, 650, 170, 18, 'اسم الطالب'),
    makeTextOps(80, 650, 60, 18, 'الإجمالي'),
    // صف الطالب الأول
    makeTextOps(520, 620, 30, 18, '1'),
    makeTextOps(430, 620, 80, 18, '467078496'),
    makeTextOps(250, 620, 170, 18, 'عمر محمود شوقي توفيق عبدالراضي'),
    makeTextOps(80, 620, 60, 18, '12')
  ]);

  const mockPdfjs = {
    OPS,
    getDocument: () => ({
      promise: Promise.resolve({
        numPages: 1,
        getPage: async () => ({
          getOperatorList: async () => pageOps
        })
      })
    })
  };

  const parsed = await global.NeprasAbsencePdfParser.parseAbsencePdf(mockPdfjs, new Uint8Array([37, 80, 68, 70]));
  assert.strictEqual(parsed.totalStudents, 1, 'يجب استخراج طالب واحد من صفحة الـ PDF المحاكاة');
  assert.strictEqual(parsed.rejectedRows.length, 0, 'يجب ألا توجد أي صفوف مرفوضة');
  assert.strictEqual(parsed.meta.governorate, 'الجيزة');
  assert.strictEqual(parsed.meta.administration, 'العمرانية');
  assert.strictEqual(parsed.meta.school, 'الشهيد محمد سليمان سلامة ع بنين');
  assert.strictEqual(parsed.meta.grade, 'الصف الأول');
  assert.strictEqual(parsed.meta.className, '1 / 11');
  assert.strictEqual(parsed.meta.academicYear, '2025-2026');
  assert.strictEqual(parsed.students[0].code, '467078496');
  assert.strictEqual(parsed.students[0].absenceDays, 12);
  assert.strictEqual(parsed.students[0].className, '1 / 11');
  assert.strictEqual(parsed.students[0].level, 'إنذار ثان');
  console.log('✓ تم التحقق من محرك قراءة أوامر PDF واستخراج الترويسة والفصل والغياب بدقة 100%');
  console.log('جميع اختبارات NeprasAbsencePdfParser اجتازت بنجاح تام!\n');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
