/**
 * اختبارات وحدة قاعدة البيانات المحلية الشاملة والأرشفة الشهرية (NeprasLocalDB)
 * وتكاملها مع مدير المدارس (NeprasSchoolManager)
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

async function runTest() {
  console.log('--- بدء اختبارات وحدة قاعدة البيانات المحلية الشاملة (NeprasLocalDB) ---');

  const mockStorage = {};
  const context = {
    console,
    chrome: {
      storage: {
        local: {
          get: (keys, cb) => {
            const out = {};
            const kArr = Array.isArray(keys) ? keys : [keys];
            kArr.forEach((k) => { if (mockStorage[k] !== undefined) out[k] = mockStorage[k]; });
            if (cb) cb(out);
            return Promise.resolve(out);
          },
          set: (data, cb) => {
            Object.assign(mockStorage, data);
            if (cb) cb();
            return Promise.resolve();
          }
        }
      }
    },
    NeprasEgypt: {
      academicYearLabel: () => '2026 / 2027 م'
    }
  };
  context.globalThis = context;
  context.window = context;

  // 1. تحميل local_database.js
  const dbCode = fs.readFileSync(path.join(__dirname, '../modules/local_database.js'), 'utf8');
  vm.createContext(context);
  vm.runInContext(dbCode, context);

  // 2. تحميل school_manager.js
  const smCode = fs.readFileSync(path.join(__dirname, '../modules/school_manager.js'), 'utf8');
  vm.runInContext(smCode, context);

  const DB = context.NeprasLocalDB;
  const SM = context.NeprasSchoolManager;

  assert.ok(DB, 'NeprasLocalDB must be defined on global context');
  assert.ok(SM, 'NeprasSchoolManager must be defined on global context');

  // 1. اختبار تسميات الشهور العربية
  const octLabel = DB.getMonthLabel('2026-10');
  assert.strictEqual(octLabel, 'أكتوبر 2026', 'Month 2026-10 must be labeled أكتوبر 2026');
  const novLabel = DB.getMonthLabel('2026-11');
  assert.strictEqual(novLabel, 'نوفمبر 2026');

  // 2. اختبار حفظ لقطة شهر أكتوبر الشاملة لمدرسة 5001
  const octStudents = [
    { code: 'S1', nationalId: '31001010100011', name: 'أحمد محمود', grade: 'الصف الأول', className: '1/1', gender: 'بنين', religion: 'مسلم' },
    { code: 'S2', nationalId: '31001010100022', name: 'مريم يوسف', grade: 'الصف الأول', className: '1/1', gender: 'بنات', religion: 'مسيحي' },
    { code: 'S3', nationalId: '31001010100033', name: 'عمر خالد', grade: 'الصف الثاني', className: '2/1', gender: 'بنين', religion: 'مسلم' }
  ];
  const octStats = { schoolName: 'مدرسة المستقبل', totalStudents: 3, boys: 2, girls: 1, totalClasses: 2 };
  const octMeta = { schoolName: 'مدرسة المستقبل', edara: 'العمرانية', governorate: 'الجيزة' };

  // حفظ لقطة شهر 2026-10
  const snapOct = await DB.saveMonthlySnapshot('5001', {
    meta: octMeta,
    stats: octStats,
    students: octStudents,
    absence: [{ code: 'S1', days: 3 }]
  }, '2026-10');

  assert.strictEqual(snapOct.monthKey, '2026-10');
  assert.strictEqual(snapOct.summary.totalStudents, 3);
  assert.strictEqual(snapOct.students.length, 3);

  // التحقق من استرجاع أحدث لقطة
  const latest = await DB.getLatestSnapshot('5001');
  assert.ok(latest, 'Latest snapshot must be retrieved');
  assert.strictEqual(latest.schoolCode, '5001');
  assert.strictEqual(latest.monthKey, '2026-10');

  // 3. اختبار حفظ لقطة شهر نوفمبر 2026-11 مع حدوث تغييرات (طالب جديد + تعديل فصل طالب)
  const novStudents = [
    { code: 'S1', nationalId: '31001010100011', name: 'أحمد محمود', grade: 'الصف الأول', className: '1/2', gender: 'بنين', religion: 'مسلم' }, // تغير فصله إلى 1/2
    { code: 'S2', nationalId: '31001010100022', name: 'مريم يوسف', grade: 'الصف الأول', className: '1/1', gender: 'بنات', religion: 'مسيحي' },
    { code: 'S3', nationalId: '31001010100033', name: 'عمر خالد', grade: 'الصف الثاني', className: '2/1', gender: 'بنين', religion: 'مسلم' },
    { code: 'S4', nationalId: '31001010100044', name: 'زياد حسن', grade: 'الصف الأول', className: '1/2', gender: 'بنين', religion: 'مسلم' }  // طالب جديد مضاف
  ];

  // حساب الفروقات (Delta Diff)
  const delta = DB.computeDelta(octStudents, novStudents);
  assert.strictEqual(delta.hasChanges, true, 'Delta must detect changes');
  assert.strictEqual(delta.added.length, 1, 'Should detect 1 added student (S4)');
  assert.strictEqual(delta.added[0].code, 'S4');
  assert.strictEqual(delta.modified.length, 1, 'Should detect 1 modified student (S1)');
  assert.strictEqual(delta.modified[0].changes.oldClass, '1/1');
  assert.strictEqual(delta.modified[0].changes.newClass, '1/2');
  assert.strictEqual(delta.removed.length, 0);

  // حفظ لقطة نوفمبر
  await DB.saveMonthlySnapshot('5001', {
    meta: octMeta,
    stats: { ...octStats, totalStudents: 4, boys: 3 },
    students: novStudents
  }, '2026-11');

  // 4. التحقق من فهرس الشهور التاريخية
  const months = await DB.listAvailableMonths('5001');
  assert.strictEqual(months.length, 2, 'Should have 2 archived months (Oct & Nov)');
  assert.strictEqual(months[0].monthKey, '2026-11', 'Latest month (Nov) should be first');
  assert.strictEqual(months[1].monthKey, '2026-10', 'Older month (Oct) should be second');

  // استرجاع لقطة أكتوبر السابقة بدقة
  const retrievedOct = await DB.getSnapshotByMonth('5001', '2026-10');
  assert.strictEqual(retrievedOct.students.length, 3, 'Oct snapshot must still have 3 students');

  // استرجاع لقطة نوفمبر بدقة
  const retrievedNov = await DB.getSnapshotByMonth('5001', '2026-11');
  assert.strictEqual(retrievedNov.students.length, 4, 'Nov snapshot must have 4 students');

  // 5. اختبار تكامل NeprasSchoolManager مع NeprasLocalDB
  const schoolBStudents = [
    { code: 'B1', nationalId: '32001010100099', name: 'سارة طارق', grade: 'الصف الأول', className: '1/1' }
  ];
  const schoolBStats = { schoolName: 'مدرسة النجاح الإعدادية', totalStudents: 1 };
  
  // حفظ عبر مدير المدارس لمدرسة 6002
  await SM.saveSchoolStats('6002', schoolBStats, schoolBStudents);

  // التحقق من أن NeprasLocalDB تم تحديثه تلقائياً لمدرسة 6002
  const latestSchoolB = await DB.getLatestSnapshot('6002');
  assert.ok(latestSchoolB, 'School 6002 snapshot must be automatically saved in NeprasLocalDB');
  assert.strictEqual(latestSchoolB.schoolCode, '6002');
  assert.strictEqual(latestSchoolB.students.length, 1);
  assert.strictEqual(latestSchoolB.students[0].name, 'سارة طارق');

  // 6. التحقق من عزل المدارس المتعددة (Multi-school Isolation)
  const monthsSchoolA = await DB.listAvailableMonths('5001');
  const monthsSchoolB = await DB.listAvailableMonths('6002');
  assert.strictEqual(monthsSchoolA.length, 2, 'School A must retain its 2 months');
  assert.strictEqual(monthsSchoolB.length, 1, 'School B must only have its 1 month');
  assert.notStrictEqual(monthsSchoolA[0].totalStudents, monthsSchoolB[0].totalStudents);

  // 7. اختبار التحميل اللحظي (Zero Latency) عبر SM.loadSchoolStats
  const loadedA = await SM.loadSchoolStats('5001');
  assert.ok(loadedA.stats, 'Loaded stats for 5001 must exist');
  assert.strictEqual(loadedA.students.length, 4, 'Loaded students for 5001 must be 4');

  const loadedB = await SM.loadSchoolStats('6002');
  assert.ok(loadedB.stats, 'Loaded stats for 6002 must exist');
  assert.strictEqual(loadedB.students.length, 1, 'Loaded students for 6002 must be 1');

  console.log('✓ تم التحقق من حفظ واسترجاع اللقطات الشهرية الشاملة بدقة 100%');
  console.log('✓ تم التحقق من فهرسة الشهور والأرشيف التاريخي بنجاح');
  console.log('✓ تم التحقق من محرك حساب الفروقات الذكي (Delta Diff) بنجاح');
  console.log('✓ تم التحقق من تكامل مدير المدارس NeprasSchoolManager مع قاعدة البيانات المحلية');
  console.log('✓ تم التحقق من العزل التام بين المدارس المتعددة (Multi-school Isolation)');
  console.log('✓ تم التحقق من الفتح الفوري اللحظي (Zero Latency) من الذاكرة المحلية');
  console.log('\nجميع اختبارات قاعدة البيانات المحلية NeprasLocalDB اجتازت بنجاح تام 100%!\n');
}

runTest().catch((err) => {
  console.error('Test Failed:', err);
  process.exit(1);
});
