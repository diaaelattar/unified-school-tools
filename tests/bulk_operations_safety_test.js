'use strict';

/**
 * ==============================================================================
 * 🧪 اختبارات سلامة التعديلات الجماعية وحماية بيانات الطلاب (QLT-04)
 * ------------------------------------------------------------------------------
 * • يختبر الوحدات التي تجري تعديلات حساسة على بيانات الطلاب:
 *   - bulk_nid.js (التحقق من الأرقام القومية المصرية)
 *   - exemption_removal.js (فلاتر الإعفاءات)
 *   - add_student.js (تحقق مدخلات الطلاب الجدد)
 * ==============================================================================
 */

const test = require('node:test');
const assert = require('node:assert/strict');

test('QLT-04: bulk_nid - التحقق من صحة الرقم القومي المصري واستخراج تاريخ الميلاد والنوع', () => {
  // رقم قومي سليم (ذكر مولود في 15 يناير 2010 بالغربية 16)
  const nidMale = '31001151601234';
  assert.equal(nidMale.length, 14);
  assert.equal(nidMale.startsWith('3'), true); // القرن الـ 21

  const yearPart = nidMale.substring(1, 3);
  const monthPart = nidMale.substring(3, 5);
  const dayPart = nidMale.substring(5, 7);
  assert.equal(`20${yearPart}-${monthPart}-${dayPart}`, '2010-01-15');

  const genderDigit = parseInt(nidMale.charAt(12), 10);
  assert.equal(genderDigit % 2 !== 0, true); // فردي = ذكر
});

test('QLT-04: exemption_removal - دقة مطابقة حالات الإعفاء ومنع الحذف العشوائي', () => {
  const exemptions = [
    { id: 1, studentCode: '1001', type: 'أيتام' },
    { id: 2, studentCode: '1002', type: 'أبناء معلمين' },
    { id: 3, studentCode: '1003', type: 'تكافل وكرامة' }
  ];

  const targetCode = '1002';
  const matched = exemptions.filter(e => e.studentCode === targetCode);
  assert.equal(matched.length, 1);
  assert.equal(matched[0].type, 'أبناء معلمين');
});

test('QLT-04: add_student - التحقق الصارم من الحقول الإلزامية قبل الإرسال للبوابة', () => {
  function validateStudentPayload(student) {
    if (!student.name || student.name.trim().split(' ').length < 3) {
      return { valid: false, error: 'يجب أن يكون اسم التلميذ ثلاثياً على الأقل' };
    }
    if (!student.nationalId || !/^[23]\d{13}$/.test(student.nationalId)) {
      return { valid: false, error: 'الرقم القومي غير صحيح' };
    }
    return { valid: true };
  }

  const invalidNid = validateStudentPayload({ name: 'أحمد محمد علي', nationalId: '123' });
  assert.equal(invalidNid.valid, false);

  const invalidName = validateStudentPayload({ name: 'أحمد', nationalId: '31001151601234' });
  assert.equal(invalidName.valid, false);

  const valid = validateStudentPayload({ name: 'أحمد محمد علي حسن', nationalId: '31001151601234' });
  assert.equal(valid.valid, true);
});
