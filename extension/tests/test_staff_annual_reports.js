'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { test, summary, loadGlobals, ROOT } = require('./_helpers.js');

loadGlobals('modules/staff_annual_reports.js');

const Reports = globalThis.NeprasStaffAnnualReports;

test('تصدير الوحدة والقوالب الأربعة الرسمية', () => {
  assert.ok(Reports, 'يجب تصدير NeprasStaffAnnualReports');
  assert.ok(Reports.REPORTS_CONFIG.TEACHER, 'يجب وجود إعدادات المعلم');
  assert.ok(Reports.REPORTS_CONFIG.PRINCIPAL, 'يجب وجود إعدادات الإدارة المدرسية');
  assert.ok(Reports.REPORTS_CONFIG.CLERICAL, 'يجب وجود إعدادات الإداريين');
  assert.ok(Reports.REPORTS_CONFIG.SUPPORT, 'يجب وجود إعدادات الخدمات المعاونة');
});

test('دقة التصنيف الوظيفي التلقائي', () => {
  assert.strictEqual(Reports.detectReportType('معلم أول أ', 'لغة عربية'), 'TEACHER');
  assert.strictEqual(Reports.detectReportType('أخصائي اجتماعي خبير', 'خدمات'), 'TEACHER');
  assert.strictEqual(Reports.detectReportType('مدير مدرسة', 'إدارة مدرسية'), 'PRINCIPAL');
  assert.strictEqual(Reports.detectReportType('وكيل شؤون طلاب', ''), 'PRINCIPAL');
  assert.strictEqual(Reports.detectReportType('ناظر مدرسة', ''), 'PRINCIPAL');
  assert.strictEqual(Reports.detectReportType('كاتب رابع', 'شؤون مالية'), 'CLERICAL');
  assert.strictEqual(Reports.detectReportType('سكرتير مدرسة', ''), 'CLERICAL');
  assert.strictEqual(Reports.detectReportType('معاون إدارة', ''), 'CLERICAL');
  assert.strictEqual(Reports.detectReportType('عامل خدمات معاونة', ''), 'SUPPORT');
  assert.strictEqual(Reports.detectReportType('سائق', 'خدمات'), 'SUPPORT');
  assert.strictEqual(Reports.detectReportType('حارس أمن', ''), 'SUPPORT');
});

test('التحقق من وجود ملفات القوالب المعتمدة على القرص وبأحجام سليمة', () => {
  const templates = [
    Reports.REPORTS_CONFIG.TEACHER.templateFile,
    Reports.REPORTS_CONFIG.PRINCIPAL.templateFile,
    Reports.REPORTS_CONFIG.CLERICAL.templateFile,
    Reports.REPORTS_CONFIG.SUPPORT.templateFile
  ];

  for (const tpl of templates) {
    const fullPath = path.join(ROOT, tpl);
    assert.ok(fs.existsSync(fullPath), `ملف القالب يجب أن يكون موجوداً: ${tpl}`);
    assert.ok(fs.statSync(fullPath).size > 10000, `حجم ملف القالب سليم: ${tpl}`);
  }
});

summary('staff_annual_reports');
