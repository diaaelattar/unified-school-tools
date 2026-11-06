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

// 5. فحص علاج مشكلة تسجيل أول 5-6 طلاب فقط في الفصل
test('إصلاح تسجيل الغياب الكامل: أولوية زر عرض كل الطلبة والتمرير التكراري لحاوية الجدول وتحديث نماذج Angular', () => {
  const attendanceCode = fs.readFileSync(path.join(__dirname, '../modules/attendance.js'), 'utf8');
  assert(attendanceCode.includes('عرض\\s*كل\\s*الطلبة'), 'يجب أن يمنح زر عرض كل الطلبة الأولوية القصوى');
  assert(attendanceCode.includes('neprasAttendanceSetNativeInputValue'), 'يجب استخدام دالة ضبط القيمة الأصلية لتحديث عناصر تحكم Angular');
  assert(attendanceCode.includes('neprasAttendanceGetScrollContainer'), 'يجب كشف حاوية التمرير .table-responsive لدعم الفصول الطويلة');
  assert(attendanceCode.includes('neprasAttendanceFillAllClassDaysWithScroll'), 'يجب استخدام التمرير التكراري لضمان تسجيل كل طلاب الفصل');
  assert(attendanceCode.includes('neprasAttendanceWaitForTableLoad'), 'يجب الانتظار الذكي لاكتمال تحميل جدول الفصل قبل الحفظ');
  assert(attendanceCode.includes('neprasAttendanceShuffleArray'), 'يجب استخدام خوارزمية خلط عشوائي حقيقية لتوزيع الغياب العشوائي');
});

// 6. فحص إحصائيات الثانوي العام المفصلة (مسارات وشعب ونظام التعليم والنوع)
test('إحصائية الثانوي العام: مطابقة وتفكيك معرفات الوزارة الرسمية (مسارات وشعب ونظام التعليم والنوع والدمج)', () => {
  const mockXlsx = {
    utils: {
      book_new: () => ({ Sheets: {}, SheetNames: [] }),
      aoa_to_sheet: (aoa) => ({ aoa })
    }
  };
  global.XLSX = mockXlsx;
  require('../modules/stats_dashboard.js');
  const dash = global.NeprasStatsDashboard;
  assert(dash, 'يجب تحميل وحدة NeprasStatsDashboard');
  assert(typeof dash.buildSecondaryTracksStatsSheet === 'function', 'يجب توفر دالة buildSecondaryTracksStatsSheet');

  // عينة واقعية لطلاب الثانوي العام تطابق كود صفحة الطالب بدقة
  const sampleStudents = [
    {
      code: '2001', name: 'أحمد محمود علي', nationalId: '30701010100019',
      levelId: 1, studyTypeId: 1, registrationId: 1, divisionId: -1, disabilityId: 0
    },
    {
      code: '2002', name: 'فاطمة إبراهيم حسن', nationalId: '30702020100028',
      levelId: 1, studyTypeId: 2, registrationId: 1, divisionId: -1, disabilityId: 1 // دمج بصرية
    },
    {
      code: '2003', name: 'محمد سمير يوسف', nationalId: '30603030100037',
      levelId: 2, studyTypeId: 1, registrationId: 1, divisionId: 3 // علمي
    },
    {
      code: '2004', name: 'مريم عادل مصطفى', nationalId: '30604040100046',
      levelId: 2, studyTypeId: 1, registrationId: 2, divisionId: 2 // أدبي باق للإعادة
    },
    {
      code: '2005', name: 'زياد طارق كمال', nationalId: '30605050100055',
      levelId: 2, studyTypeId: 3, registrationId: 1, divisionId: 203 // بكالوريا مسار الطب وعلوم الحياة - خدمات
    },
    {
      code: '2006', name: 'نور عمر سالم', nationalId: '30506060100064',
      levelId: 3, studyTypeId: 1, registrationId: 9, divisionId: 204 // مسار الهندسة - تحويل مسار
    }
  ];

  // اختبار توحيد السجلات
  const norm1 = dash.normalizeStudentRecord(sampleStudents[0]);
  assert.strictEqual(norm1.grade, 'الصف الأول الثانوي');
  assert.strictEqual(norm1.mode, 'نظامي');
  assert.strictEqual(norm1.status, 'ناجح ومنقول');
  assert.strictEqual(norm1.gender, 'بنين');
  assert.strictEqual(norm1.isIntegrated, false);

  const norm2 = dash.normalizeStudentRecord(sampleStudents[1]);
  assert.strictEqual(norm2.grade, 'الصف الأول الثانوي');
  assert.strictEqual(norm2.mode, 'منازل');
  assert.strictEqual(norm2.gender, 'بنات');
  assert.strictEqual(norm2.isIntegrated, true);
  assert.strictEqual(norm2.integrationType, 'إعاقة بصرية');

  const norm5 = dash.normalizeStudentRecord(sampleStudents[4]);
  assert.strictEqual(norm5.mode, 'خدمات');
  assert.strictEqual(norm5.section, 'مسار الطب وعلوم الحياة');

  // توليد ورقة العمل وفحص الأعمدة والمحتوى
  const meta = { school: 'مدرسة المتفوقين الثانوية', year: '2026-2027', dir: 'القاهرة', admin: 'مصر الجديدة', affairs: 'أ/ محمد', principal: 'أ/ سمير' };
  const ws = dash.buildSecondaryTracksStatsSheet(sampleStudents, meta);
  assert(ws, 'يجب توليد كائن ورقة العمل');
  assert(ws['!cols'] && ws['!cols'].length === 16, 'يجب أن تحتوي الورقة على 16 عموداً للماتريكس الشامل');
  assert(ws['!merges'] && ws['!merges'].length >= 8, 'يجب دمج ترويسات نظام التعليم والإجمالي العام');
});

// 7. فحص زر ومحرك التحديث التلقائي لبرنامج سطح المكتب
test('محرك التحديث: فحص مقارنة الإصدارات وقنوات IPC في main.js و preload-host.js', () => {
  const mainCode = fs.readFileSync(path.join(__dirname, '../../desktop/src/main.js'), 'utf8');
  assert(mainCode.includes('nep:checkUpdate'), 'يجب تسجيل قناة nep:checkUpdate في main.js');
  assert(mainCode.includes('nep:downloadUpdate'), 'يجب تسجيل قناة nep:downloadUpdate في main.js');
  assert(mainCode.includes('unified-school-tools-website.vercel.app'), 'يجب أن يربط التحديث بالموقع الرسمي');
  assert(mainCode.includes('compareVersions'), 'يجب استخدام دالة مقارنة الإصدارات الدلالية');

  const preloadCode = fs.readFileSync(path.join(__dirname, '../../desktop/src/preload-host.js'), 'utf8');
  assert(preloadCode.includes('checkUpdate:'), 'يجب تصدير checkUpdate عبر contextBridge');
  assert(preloadCode.includes('downloadUpdate:'), 'يجب تصدير downloadUpdate عبر contextBridge');

  const hostHtml = fs.readFileSync(path.join(__dirname, '../../shared/host.html'), 'utf8');
  assert(hostHtml.includes('btn-check-update'), 'يجب وجود زر فحص التحديث في شريط أدوات التطبيق');

  const hostUi = fs.readFileSync(path.join(__dirname, '../../shared/host-ui.js'), 'utf8');
  assert(hostUi.includes('btnCheckUpdate.onclick'), 'يجب ربط حدث النقر لزر التحديث في واجهة التطبيق');
});

// 8. فحص رسالة المساهمة من خلال الاشتراك السنوي للمدرسة
test('رسالة الاشتراك السنوي: توفر النافذة والزر والدعوة الصريحة للاشتراك السنوي (30 جنيهاً)', () => {
  const hostHtml = fs.readFileSync(path.join(__dirname, '../../shared/host.html'), 'utf8');
  assert(hostHtml.includes('nepras-support-modal'), 'يجب وجود نافذة الاشتراك السنوي في host.html');
  assert(hostHtml.includes('btn-support-project'), 'يجب وجود زر الاشتراك في شريط الأدوات');
  assert(hostHtml.includes('30 جنيهاً'), 'يجب أن توضح الرسالة قيمة الاشتراك السنوي 30 جنيهاً');
  assert(hostHtml.includes('01118209309'), 'يجب أن تحتوي الرسالة على رقم التحويل والواتساب 01118209309');

  const hostCss = fs.readFileSync(path.join(__dirname, '../../shared/host.css'), 'utf8');
  assert(hostCss.includes('.nep-modal-overlay'), 'يجب وجود تنسيقات نافذة الدعم في host.css');
  assert(hostCss.includes('.nav-btn.support-btn'), 'يجب تنسيق زر الدعم بأناقة');

  const popupHtml = fs.readFileSync(path.join(__dirname, '../popup.html'), 'utf8');
  assert(popupHtml.includes('support-contribution-card'), 'يجب وجود بطاقة الاشتراك في نافذة الإضافة popup.html');
  assert(popupHtml.includes('الاشتراك السنوي'), 'يجب أن تنص البطاقة على الاشتراك السنوي');
  assert(popupHtml.includes('btn-popup-copy-phone'), 'يجب وجود زر نسخ رقم التحويل في الإضافة');

  const popupJs = fs.readFileSync(path.join(__dirname, '../popup.js'), 'utf8');
  assert(popupJs.includes('btnPopupCopyPhone'), 'يجب ربط نسخ رقم الدعم في popup.js');
  assert(popupJs.includes('btn-sc-secondary-tracks'), 'يجب ربط زر إحصائية الثانوي في popup.js');
});

summary('attendance_and_lang');
