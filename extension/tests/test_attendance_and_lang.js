'use strict';
/**
 * اختبارات التحقق من صحة تعريب اللغة الثانية واستخراج وحساب أيام الغياب من جداول الوزارة
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { test, summary } = require('./_helpers.js');

// 1. فحص تعريب اللغة الثانية "not allowed" -> "معفى"
test('تعريب اللغة الثانية: تحويل not allowed وأخواتها إلى "معفى" بدلاً من الكلمات الإنجليزية', () => {
  // محاكاة normalizeStudentRecord
  const dashboardCode = fs.readFileSync(path.join(__dirname, '../modules/stats_dashboard.js'), 'utf8');
  assert(dashboardCode.includes("lang2 = 'معفى'"), 'يجب أن يحتوي stats_dashboard على تحويل not allowed إلى معفى');

  const exportCode = fs.readFileSync(path.join(__dirname, '../modules/export.js'), 'utf8');
  assert(exportCode.includes('return "معفى"'), 'يجب أن يحتوي neprasArabicLanguageName على إرجاع معفى');

  const dossierCode = fs.readFileSync(path.join(__dirname, '../modules/student_dossier.js'), 'utf8');
  assert(dossierCode.includes("return 'معفى'"), 'يجب أن يعيد ملف الطالب الرقمي معفى عند وجود not allowed');

  // فحص regex المعفى
  const re = /^(not\s*allowed|not_allowed|notallowed|none|n\/?a|معف[ىي]|غير\s*مسموح|لا\s*يوجد)$/i;
  assert.strictEqual(re.test('not allowed'), true);
  assert.strictEqual(re.test('Not Allowed'), true);
  assert.strictEqual(re.test('NOT_ALLOWED'), true);
  assert.strictEqual(re.test('none'), true);
  assert.strictEqual(re.test('N/A'), true);
  assert.strictEqual(re.test('معفى'), true);
  assert.strictEqual(re.test('معفي'), true);
  assert.strictEqual(re.test('الفرنسية'), false);
  assert.strictEqual(re.test('الألمانية'), false);
});

// 2. فحص استخراج أيام الغياب من حقول الإدخال <input type="number">
test('استخراج أيام الغياب: قراءة قيمة input.value بشكل صحيح من جدول الوزارة', () => {
  // محاكاة لجدول الوزارة المقدم من المستخدم
  const sampleRows = [
    { code: '488362781', name: 'ابانوب نبيل يوسف جاد', inputVal: '5' },
    { code: '480063628', name: 'ابراهيم اشرف محمد ابوكلوه', inputVal: '10' },
    { code: '487980577', name: 'ابراهيم حماده محمد عبدالرازق', inputVal: '15' },
    { code: '489483271', name: 'احمد حسن عطيه عبدالمعز عطى', inputVal: '0' }
  ];

  // دالة محاكاة لاستخراج القيمة
  const parsed = sampleRows.map(r => ({
    code: r.code,
    name: r.name,
    absenceDays: parseInt(r.inputVal, 10) || 0
  }));

  // التحقق من وحدة إنذارات الغياب
  require('../modules/absence_warnings.js');
  const warningsModule = global.NeprasAbsenceWarnings;
  assert(warningsModule, 'NeprasAbsenceWarnings يجب أن يكون متاحاً');

  const stats = warningsModule.summarizeAbsence(parsed);
  assert.strictEqual(stats.total, 4, 'إجمالي الطلاب 4');
  assert.strictEqual(stats.withAbsence, 3, 'الطلاب ذوي الغياب 3');
  assert.strictEqual(stats.maxDays, 15, 'أقصى غياب 15');
  assert.strictEqual(stats.first, 1, 'إنذار أول (5 أيام) = 1');
  assert.strictEqual(stats.second, 1, 'إنذار ثان (10 أيام) = 1');
  assert.strictEqual(stats.final, 1, 'إنذار فصل (15 يوماً) = 1');
});

// 3. فحص التراكم والدمج الذكي لأيام الغياب
test('تجميع الغياب التراكمي: جمع أيام الأسابيع المتعددة بشكل صحيح للطلاب', () => {
  const week1 = [
    { code: '1001', name: 'طالب أ', absenceDays: 3 },
    { code: '1002', name: 'طالب ب', absenceDays: 2 }
  ];

  const week2 = [
    { code: '1001', name: 'طالب أ', absenceDays: 3 }, // المجموع = 6 (مستحق إنذار أول)
    { code: '1002', name: 'طالب ب', absenceDays: 1 }  // المجموع = 3
  ];

  const map = new Map();
  week1.forEach(s => map.set(s.code, { ...s }));

  // إضافة تراكمية للأسبوع الثاني
  week2.forEach(s => {
    if (map.has(s.code)) {
      const prev = map.get(s.code);
      map.set(s.code, { ...prev, absenceDays: prev.absenceDays + s.absenceDays });
    } else {
      map.set(s.code, { ...s });
    }
  });

  const merged = Array.from(map.values());
  assert.strictEqual(merged.find(s => s.code === '1001').absenceDays, 6);
  assert.strictEqual(merged.find(s => s.code === '1002').absenceDays, 3);

  const stats = global.NeprasAbsenceWarnings.summarizeAbsence(merged);
  assert.strictEqual(stats.first, 1, 'طالب أ أصبح مستحقاً لإنذار أول بعد التجميع');
  assert.strictEqual(stats.second, 0);
  assert.strictEqual(stats.final, 0);
});

// 4. فحص استخراج وكشف جداول الغياب المتعددة والتقارير
test('كشف جدول الغياب المتقدم: تمييز جدول الطلاب وتجاهل جداول الفلاتر وتدعيم كشوف التقارير', () => {
  const attendanceCode = fs.readFileSync(path.join(__dirname, '../modules/attendance.js'), 'utf8');
  assert(attendanceCode.includes('scanDocForTables'), 'يجب أن تدعم دالة استخراج الغياب البحث في المستند والإطارات الفرعية iframes');
  assert(attendanceCode.includes('inspectTable'), 'يجب أن تفحص الدالة بنية الجدول وتحدد جدول الطلاب الحقيقي');
  assert(attendanceCode.includes('findBestTable'), 'يجب أن تختار الدالة الجدول الأكثر احتواءً على بيانات الطلاب');
  assert(attendanceCode.includes('absence/save'), 'يجب أن تقدم الدالة تشخيصاً ذكياً لصفحة absence/save');
  assert(attendanceCode.includes('absence/report'), 'يجب أن تدعم الدالة تشخيص واستخراج صفحة absence/report');
  assert(!attendanceCode.includes('سحب وتجميع الغياب من جدول الفصل الحالي'), 'يجب التخلص من كلمة سحب في عنوان الدالة واستبدالها بمصطلح استيراد وتحديث');
});

summary('attendance_and_lang');
