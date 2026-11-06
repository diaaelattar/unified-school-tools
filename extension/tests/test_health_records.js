'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { test, summary, loadGlobals, ROOT } = require('./_helpers.js');

loadGlobals('xlsx.full.min.js', 'modules/health_records.js');

const Health = globalThis.NeprasHealthRecords;

test('تصدير وحدة الصحة المدرسية NeprasHealthRecords', () => {
  assert.ok(Health, 'يجب تصدير NeprasHealthRecords');
  assert.strictEqual(Health.TEMPLATE_FILE, 'templates/template_health.xlsx');
});

test('التحقق من وجود قالب التأمين الصحي المعتمد template_health.xlsx', () => {
  const fullPath = path.join(ROOT, Health.TEMPLATE_FILE);
  assert.ok(fs.existsSync(fullPath), 'ملف قالب التأمين الصحي يجب أن يكون موجوداً');
  assert.ok(fs.statSync(fullPath).size > 30000, 'حجم ملف القالب سليم (أكبر من 30KB)');
});

test('توليد مصنف كشوف الصحة وقوة الإبصار بنجاح', async () => {
  const dummyStudents = [
    { 'الصف': 'الأول الابتدائي', 'الفصل': '1', 'اسم الطالب': 'أحمد محمد علي', 'الرقم القومي': '31501010101010', 'تليفون ولي الأمر': '01000000001' },
    { 'الصف': 'الأول الابتدائي', 'الفصل': '1', 'اسم الطالب': 'فاطمة محمود حسن', 'الرقم القومي': '31502020202020', 'تليفون ولي الأمر': '01000000002' },
    { 'الصف': 'الثاني الابتدائي', 'الفصل': '2', 'اسم الطالب': 'يوسف إبراهيم خليل', 'الرقم القومي': '31403030303030', 'تليفون ولي الأمر': '01000000003' }
  ];

  const loadTemplate = async (tpl) => fs.readFileSync(path.join(ROOT, tpl));
  const schoolContext = {
    schoolName: 'مدرسة النيل الابتدائية',
    administration: 'إدارة مصر الجديدة',
    academicYear: '2026-2027'
  };

  const wb = await Health.buildHealthRecordsWorkbook(dummyStudents, schoolContext, { mode: 'BOTH' }, { loadTemplate });

  assert.ok(wb.SheetNames.length >= 4, 'يجب إنشاء ورقتين لكل فصل (تغذية + عيون)');
  assert.ok(wb.SheetNames.some(s => s.startsWith('تغذية_')), 'يجب وجود شيت تغذية');
  assert.ok(wb.SheetNames.some(s => s.startsWith('عيون_')), 'يجب وجود شيت عيون');
});

summary('health_records');
