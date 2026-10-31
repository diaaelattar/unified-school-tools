'use strict';
const assert = require('assert');
const { loadGlobals, test, summary } = require('./_helpers');
loadGlobals('modules/egypt_ids.js');
const E = globalThis.NeprasEgypt;

console.log('egypt_ids');
test('رقم قومي صحيح يُقبل ويُستخرج منه التاريخ والمحافظة والنوع', () => {
  const p = E.parseNationalId('31501010100012');
  assert(p && p.isValid && p.year === 2015 && p.governorate === 'القاهرة' && p.gender === 'ذكر');
});
test('رمز محافظة 00 أو 99 يُرفض', () => {
  assert.equal(E.isValidNationalId('30001010000015'), false);
  assert.equal(E.isValidNationalId('31501019900015'), false);
});
test('رمز 88 (خارج الجمهورية) يُقبل', () => assert.equal(E.isValidNationalId('31501018800015'), true));
test('تاريخ ميلاد مستقبلي أو شهر/يوم غير صالح يُرفض', () => {
  assert.equal(E.isValidNationalId('39901019900010'), false);
  assert.equal(E.isValidNationalId('31513010100012'), false);
  assert.equal(E.isValidNationalId('31502300100012'), false);
});
test('ageOnOct1 تقرأ الصيغتين yyyy-mm-dd وdd/mm/yyyy بنفس النتيجة', () => {
  assert.equal(E.ageOnOct1('2015-09-30').years, E.ageOnOct1('30/09/2015').years);
});
test('السنة الدراسية تبدأ في أغسطس', () => {
  assert.equal(E.academicYearLabel(new Date(2026, 9, 22)), '2026 / 2027');
  assert.equal(E.academicYearLabel(new Date(2027, 6, 31)), '2026 / 2027');
  assert.equal(E.academicYearLabel(new Date(2027, 7, 1)), '2027 / 2028');
});
test('الديانة لا تُستنتج من الاسم أبدًا', () => {
  for (const n of ['محمد عماد الدين', 'أحمد مجدي حسن', 'مريم نيفين خالد'])
    assert.equal(E.resolveReligion({ name: n }), 'غير مسجّل');
  assert.equal(E.resolveReligionFromName('أي اسم'), 'غير مسجّل');
});
test('الديانة تُقرأ من الحقل الرسمي وreligionId (1 مسلم، 2 مسيحي، غيره أخرى)', () => {
  assert.equal(E.resolveReligion({ religionId: 1 }), 'مسلم');
  assert.equal(E.resolveReligion({ religionId: 2 }), 'مسيحي');
  assert.equal(E.resolveReligion({ religionId: 3 }), 'أخرى');
  assert.equal(E.resolveReligion({ religion: 'مسيحي' }), 'مسيحي');
});
summary('egypt_ids');
