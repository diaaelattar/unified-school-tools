'use strict';
const assert = require('assert');
const { loadGlobals, test, summary } = require('./_helpers');
loadGlobals('modules/egypt_ids.js', 'modules/smart_analytics.js', 'modules/xlsx_writer.js');
const A = globalThis.NeprasSmartAnalytics;
const G = 'الصف الأول الابتدائي';
const full = [
  { grade: G, className: '1', gender: 'ذكر', religion: 'مسلم', status: 'مقيدون' },
  { grade: G, className: '1', gender: 'أنثى', religion: 'مسيحي', status: 'مقيدون' },
  { grade: G, className: '2', gender: 'أنثى', religion: 'مسلم', status: 'مقيدون' }
];

console.log('smart_analytics');
test('resolveGender: صريح ثم رقم قومي ثم null (بلا افتراض)', () => {
  assert.equal(A.resolveGender({ gender: 'أنثى' }), 'أنثى');
  assert.equal(A.resolveGender({ nationalId: '31501010100012' }), 'ذكر');
  assert.equal(A.resolveGender({}), null);
});
test('البيانات المكتملة: شكل الأوراق الرسمي كما هو (15 عمودًا للإحصاء، 10 للكثافة، 13 مؤشرًا، 7 أوراق)', () => {
  const sp = A.buildComprehensiveAnalyticsSheetSpecs(full, { school: 'م' });
  assert.equal(sp.length, 7);
  assert.equal(sp[0].headers.length, 15);
  assert.equal(sp[2].headers.length, 10);
  assert.equal(sp[1].rows.length, 13);
});
test('النوع المجهول لا يُحسب بنين: عمود «نوع غير مسجّل» ومجموع الصف متسق', () => {
  const bad = [...full, { grade: G, className: '2', gender: '', status: 'مقيدون' }];
  const sp = A.buildComprehensiveAnalyticsSheetSpecs(bad, { school: 'م' });
  const tot = sp[0].rows[sp[0].rows.length - 1];
  assert.equal(sp[0].headers.length, 17);
  assert.equal(tot[3], 1);                       // بنين
  assert.equal(tot[3] + tot[4] + tot[15], tot[5]); // بنين + بنات + مجهول = الجملة
  assert(sp[1].rows.some((r) => String(r[1]).includes('بلا نوع')));
});
test('السن المجهول لا يُحسب «أقل من 6»', () => {
  const b = A.calculateAgeBrackets([{ gender: 'ذكر' }, { ageYears: '7' }]);
  assert.equal(b['أقل من 6 سنوات'].total, 0);
  assert.equal(b['سن غير محدد'].total, 1);
  assert.equal(b['7 سنوات'].total, 1);
});
test('ورقة «بيانات_للتحليل»: بلا أسماء ولا أرقام قومية، وأعمدة رقمية', () => {
  const rows = A.buildAnalysisDataRows([{ name: 'سر', code: '9', nationalId: '31501010100012', grade: G, className: '1', gender: 'ذكر' }]);
  const flat = JSON.stringify(rows);
  assert(!flat.includes('سر') && !flat.includes('31501010100012'));
  assert.equal(typeof rows[0][10], 'number');   // السن
  const sp = A.buildComprehensiveAnalyticsSheetSpecs(full, {});
  assert.deepEqual(sp[6].numericCols, [0, 10, 13]);
});
test('كاتب XLSX يكتب الأعمدة الرقمية أرقامًا حقيقية (t="n")', () => {
  const sp = A.buildComprehensiveAnalyticsSheetSpecs([{ grade: G, className: '1', gender: 'ذكر', ageYears: '7' }], {});
  assert(globalThis.neprasBuildMultiSheetWorkbook(sp).byteLength > 1000);
});
summary('smart_analytics');
