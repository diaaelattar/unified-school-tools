'use strict';

const assert = require('assert');
const { test, summary, loadGlobals } = require('./_helpers.js');

loadGlobals('modules/absence_warnings.js');

const Warnings = globalThis.NeprasAbsenceWarnings;

test('تصدير قواعد الإنذارات وقواعد الغياب المتصل والمنفصل', () => {
  assert.ok(Warnings, 'يجب توفر NeprasAbsenceWarnings');
  assert.ok(Warnings.WARNING_RULES.CONTINUOUS, 'يجب وجود قواعد الغياب المتصل');
  assert.ok(Warnings.WARNING_RULES.DISCONTINUOUS, 'يجب وجود قواعد الغياب المنفصل');
  assert.strictEqual(Warnings.WARNING_RULES.CONTINUOUS.first, 5);
  assert.strictEqual(Warnings.WARNING_RULES.CONTINUOUS.second, 10);
  assert.strictEqual(Warnings.WARNING_RULES.CONTINUOUS.third, 12);
  assert.strictEqual(Warnings.WARNING_RULES.CONTINUOUS.final, 15);
  assert.strictEqual(Warnings.WARNING_RULES.DISCONTINUOUS.first, 7);
  assert.strictEqual(Warnings.WARNING_RULES.DISCONTINUOUS.second, 14);
  assert.strictEqual(Warnings.WARNING_RULES.DISCONTINUOUS.third, 21);
  assert.strictEqual(Warnings.WARNING_RULES.DISCONTINUOUS.final, 30);
});

test('تدرج مستويات الإنذارات للغياب المتصل (5، 10، 12، 15)', () => {
  const mode = Warnings.WARNING_RULES.CONTINUOUS;
  assert.strictEqual(Warnings.getWarningLevel(4, mode), '');
  assert.strictEqual(Warnings.getWarningLevel(5, mode), 'إنذار أول');
  assert.strictEqual(Warnings.getWarningLevel(9, mode), 'إنذار أول');
  assert.strictEqual(Warnings.getWarningLevel(10, mode), 'إنذار ثان');
  assert.strictEqual(Warnings.getWarningLevel(11, mode), 'إنذار ثان');
  assert.strictEqual(Warnings.getWarningLevel(12, mode), 'إنذار ثالث');
  assert.strictEqual(Warnings.getWarningLevel(14, mode), 'إنذار ثالث');
  assert.strictEqual(Warnings.getWarningLevel(15, mode), 'إنذار بالفصل');
  assert.strictEqual(Warnings.getWarningLevel(20, mode), 'إنذار بالفصل');
});

test('تدرج مستويات الإنذارات للغياب المنفصل (7، 14، 21، 30)', () => {
  const mode = Warnings.WARNING_RULES.DISCONTINUOUS;
  assert.strictEqual(Warnings.getWarningLevel(6, mode), '');
  assert.strictEqual(Warnings.getWarningLevel(7, mode), 'إنذار أول');
  assert.strictEqual(Warnings.getWarningLevel(13, mode), 'إنذار أول');
  assert.strictEqual(Warnings.getWarningLevel(14, mode), 'إنذار ثان');
  assert.strictEqual(Warnings.getWarningLevel(20, mode), 'إنذار ثان');
  assert.strictEqual(Warnings.getWarningLevel(21, mode), 'إنذار ثالث');
  assert.strictEqual(Warnings.getWarningLevel(29, mode), 'إنذار ثالث');
  assert.strictEqual(Warnings.getWarningLevel(30, mode), 'إنذار بالفصل');
  assert.strictEqual(Warnings.getWarningLevel(35, mode), 'إنذار بالفصل');
});

test('صياغة وتوليد الإنذارات الرسمية مع التوقيعات الثلاثية', () => {
  const dummyWarning = [{
    code: '123456',
    name: 'محمود أحمد إبراهيم',
    grade: 'الصف الأول الثانوي',
    className: '1 / 1',
    absenceDays: 10,
    level: 'إنذار ثان'
  }];

  const schoolInfo = {
    governorate: 'الشرقية',
    administration: 'فاقوس',
    schoolName: 'ميت العز الثانوية'
  };

  const html = Warnings.buildWarningsHtml(dummyWarning, schoolInfo, { mode: 'CONTINUOUS' });
  assert(html.includes('مديرية التربية والتعليم بـ الشرقية'), 'يجب أن تظهر مديرية التربية والتعليم والمحافظة');
  assert(html.includes('إدارة فاقوس التعليمية'), 'يجب أن تظهر الإدارة التعليمية');
  assert(html.includes('مدرسة ميت العز الثانوية'), 'يجب أن يظهر اسم المدرسة');
  assert(html.includes('alt="شعار المدرسة"'), 'يجب أن يظهر شعار المدرسة في ترويسة الإنذار');
  assert(html.includes('ش . ط'), 'يجب أن يظهر توقيع شؤون الطلبة');
  assert(html.includes('وكيل ش . ط'), 'يجب أن يظهر توقيع وكيل شؤون الطلبة');
  assert(html.includes('مدير المدرسة'), 'يجب أن يظهر توقيع مدير المدرسة');
  assert(html.includes('المادة (25) من قانون التعليم رقم 139 لسنة 1981') || html.includes('لائحة الانضباط المدرسي'), 'يجب ذكر السند القانوني');
});

test('توليد القرار الإداري بفصل طالب لتجاوز مدة الغياب بالمواد القانونية الأربعة', () => {
  const expelledStudent = {
    code: '998877',
    name: 'طارق زياد مصطفى',
    grade: 'الثاني الثانوي',
    className: '2 / 3'
  };

  const schoolInfo = {
    governorate: 'الشرقية',
    administration: 'فاقوس',
    schoolName: 'ميت العز الثانوية'
  };

  const html = Warnings.buildExpulsionDecisionHtml(expelledStudent, schoolInfo, { mode: 'CONTINUOUS' });
  assert(html.includes('قرار إداري بفصل طالب لتجاوز مدة الغياب القانونية'), 'يجب أن يحتوي على عنوان القرار');
  assert(html.includes('مادة (1):'), 'يجب أن يحتوي على مادة 1');
  assert(html.includes('مادة (2):'), 'يجب أن يحتوي على مادة 2');
  assert(html.includes('مادة (3):'), 'يجب أن يحتوي على مادة 3');
  assert(html.includes('مادة (4):'), 'يجب أن يحتوي على مادة 4');
  assert(html.includes('25 جنيهاً'), 'يجب ذكر رسوم إعادة القيد الرسمية');
  assert(html.includes('(15) يومًا') || html.includes('15 يومًا'), 'يجب ذكر مهلة إعادة القيد');
  assert(html.includes('طارق زياد مصطفى'), 'يجب ذكر اسم الطالب المفصول');
});

summary('legal_absence_warnings');
