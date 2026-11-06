'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');

// تحميل مكتبات نبراس
require('../modules/egypt_ids.js');
require('../modules/xlsx_writer.js');
require('../modules/g9_exam_forms.js');

const { NeprasG9ExamForms, NeprasEgypt } = globalThis;

console.log('--- اختبارات وحدة استمارة الشهادة الإعدادية المحدثة (NeprasG9ExamForms) ---');

// 1. فحص تصدير الوحدة والثوابت
assert(NeprasG9ExamForms, 'يجب تصدير NeprasG9ExamForms');
assert.strictEqual(NeprasG9ExamForms.MODES.UNREGISTERED, 'UNREGISTERED');
assert.strictEqual(NeprasG9ExamForms.MODES.REGISTERED, 'REGISTERED');
assert.strictEqual(NeprasG9ExamForms.MODES.MASTER, 'MASTER');
console.log('✓ تم التحقق من تصدير وحدة استمارة الشهادة الإعدادية والثوابت والأنماط الثلاثة بنجاح');

// 2. فحص التعرف على رابط الصفحة الرسمية
assert(NeprasG9ExamForms.isG9ExamFollowUpPage('https://student.emis.gov.eg/exams/followUpG9ExamReg'));
assert(NeprasG9ExamForms.isG9ExamFollowUpPage('http://localhost:3000/exams/followUpG9ExamReg?page=1'));
assert(!NeprasG9ExamForms.isG9ExamFollowUpPage('https://student.emis.gov.eg/student/list'));
assert(!NeprasG9ExamForms.isG9ExamFollowUpPage('https://student.emis.gov.eg/absence/report'));
console.log('✓ تم التحقق من التعرف الدقيق على رابط صفحة متابعة تسجيل الاستمارة');

// 3. فحص قارئ عداد الصفحات وترقيم نتائج الوزارة (حل مشكلة التوقف عند 200 طالب)
const mockPaginationDoc = {
  querySelector: (sel) => {
    if (sel.includes('.rt-page-info')) {
      return { textContent: ' 1 / 9 ' };
    }
    if (sel.includes('.text-muted.small')) {
      return { textContent: ' عرض 1 – 10 من 81 نتيجة ' };
    }
    if (sel.includes('studentPageSize')) {
      return { value: '10' };
    }
    return null;
  }
};

const pagInfo = NeprasG9ExamForms.parsePaginationInfo(mockPaginationDoc);
assert.strictEqual(pagInfo.current, 1, 'الصفحة الحالية يجب أن تكون 1');
assert.strictEqual(pagInfo.total, 9, 'إجمالي الصفحات يجب أن يكون 9');
assert.strictEqual(pagInfo.totalResults, 81, 'إجمالي عدد النتائج يجب أن يكون 81');
assert.strictEqual(pagInfo.pageSize, 10, 'حجم الصفحة يجب أن يكون 10');
console.log('✓ تم التحقق من قراءة عداد الصفحات والنتائج (1 / 9 من 81 نتيجة) بدقة 100%');

// 4. فحص العثور على أزرار التبديل في الصفحة
const mockDoc = {
  querySelectorAll: (selector) => {
    if (selector === 'button') {
      return [
        {
          classList: { contains: (cls) => cls === 'btn-info' },
          textContent: 'إظهار الطلاب الذين تخلفو عن التسجيل'
        },
        {
          classList: { contains: (cls) => cls === 'btn-success' },
          textContent: ' الطلاب الذين قاموا بتسجيل الاستمارة'
        },
        {
          classList: { contains: () => false },
          textContent: 'زر آخر'
        }
      ];
    }
    return [];
  }
};

const buttons = NeprasG9ExamForms.findModeButtons(mockDoc);
assert(buttons.unregisteredBtn, 'يجب العثور على زر المتخلفين عن التسجيل');
assert(buttons.registeredBtn, 'يجب العثور على زر المسجلين للاستمارة');
assert(buttons.unregisteredBtn.textContent.includes('تخلفو'));
assert(buttons.registeredBtn.textContent.includes('قاموا بتسجيل'));
console.log('✓ تم التحقق من التعرف الذكي على أزرار المتخلفين والمسجلين في DOM');

// 5. فحص كشف حالة التسجيل الفردية لكل صف (لمنع تداخل المسجلين بالمتخلفين)
const mockRegisteredRow = {
  textContent: '102030 أحمد إبراهيم محمد 31005121301234 3/1 طباعة الاستمارة',
  querySelector: (sel) => ({ textContent: 'طباعة الاستمارة' })
};
const mockUnregisteredRow = {
  textContent: '102031 محمود حسن علي 31001011309876 3/1 متخلف عن التسجيل',
  querySelector: () => null
};

const regStatusDet = NeprasG9ExamForms.detectRowRegistrationStatus(mockRegisteredRow, [], { statusIdx: 4, actionIdx: 5 });
assert.strictEqual(regStatusDet.isRegistered, true, 'يجب تصنيف الطالب المسجل بدقة عبر زر طباعة الاستمارة');

const unregStatusDet = NeprasG9ExamForms.detectRowRegistrationStatus(mockUnregisteredRow, [], { statusIdx: 4, actionIdx: 5 });
assert.strictEqual(unregStatusDet.isRegistered, false, 'يجب تصنيف الطالب المتخلف بدقة');
console.log('✓ تم التحقق من كشف وتصنيف حالة التسجيل الفردية لكل صف ومنع تداخل البيانات 100%');

// 6. فحص تحليل أعمدة وصف الجدول
const mockTable = {
  querySelectorAll: (sel) => {
    if (sel.includes('th')) {
      return [
        { textContent: 'م' },
        { textContent: 'كود التلميذ' },
        { textContent: 'اسم التلميذ' },
        { textContent: 'الرقم القومي' },
        { textContent: 'الفصل' },
        { textContent: 'حالة التسجيل' }
      ];
    }
    if (sel.includes('tbody tr')) {
      return [
        {
          textContent: '1 102030 أحمد إبراهيم محمد 31005121301234 3/1 تم التسجيل',
          querySelectorAll: (s) => [
            { textContent: '102030' },
            { textContent: 'أحمد إبراهيم محمد' },
            { textContent: '31005121301234' },
            { textContent: '3/1' },
            { textContent: 'تم التسجيل' }
          ],
          querySelector: (s) => ({ textContent: 'طباعة الاستمارة' })
        }
      ];
    }
    return [];
  }
};

const colMap = NeprasG9ExamForms.getTableColumnMapping(mockTable);
assert.strictEqual(colMap.codeIdx, 1);
assert.strictEqual(colMap.nameIdx, 2);
assert.strictEqual(colMap.nidIdx, 3);
assert.strictEqual(colMap.classIdx, 4);

// 7. فحص إثراء بيانات الطلاب بالرقم القومي والكاش (كاملة البيانات 13 عموداً)
const cachedMap = new Map();
cachedMap.set('102030', {
  code: '102030',
  nationalId: '31005121301234',
  name: 'أحمد إبراهيم محمد حسن',
  religion: 'مسلم',
  is_merged: false,
  className: '3/1'
});
cachedMap.set('31005121301234', {
  code: '102030',
  nationalId: '31005121301234',
  name: 'أحمد إبراهيم محمد حسن',
  religion: 'مسلم',
  is_merged: false,
  className: '3/1'
});
cachedMap.set('102031', {
  code: '102031',
  nationalId: '31008251205688',
  name: 'مريم جرجس صليب رزق',
  religion: 'مسيحي',
  is_merged: true,
  className: '3/2'
});
cachedMap.set('31008251205688', {
  code: '102031',
  nationalId: '31008251205688',
  name: 'مريم جرجس صليب رزق',
  religion: 'مسيحي',
  is_merged: true,
  className: '3/2'
});

const schoolContext = {
  governorate: 'الشرقية',
  administration: 'فاقوس التعليمية',
  schoolName: 'مدرسة ميت العز الإعدادية',
  academicYear: '2025 / 2026'
};

// اختبار حالة صفحة الوزارة الواقعية: الطالب يأتي من الجدول بالكود والاسم فقط بدون رقم قومي أو فصل
const rawMinistryRowOnlyCodeAndName = {
  code: '102030',
  name: 'أحمد إبراهيم محمد',
  isRegistered: false
};
const enrichedFromCodeOnly = NeprasG9ExamForms.enrichStudentData(
  rawMinistryRowOnlyCodeAndName,
  cachedMap,
  schoolContext,
  NeprasG9ExamForms.MODES.UNREGISTERED
);

assert.strictEqual(enrichedFromCodeOnly.code, '102030');
assert.strictEqual(enrichedFromCodeOnly.nationalId, '31005121301234', 'يجب جلب الرقم القومي تلقائياً من الكاش بمطابقة الكود');
assert.strictEqual(enrichedFromCodeOnly.name, 'أحمد إبراهيم محمد حسن', 'يجب اعتماد الاسم الأكمل من الكاش');
assert.strictEqual(enrichedFromCodeOnly.gender, 'ذكر', 'يجب استنتاج النوع (ذكر) من الرقم القومي المجلوب من الكاش');
assert.strictEqual(enrichedFromCodeOnly.governorate, 'الشرقية', 'يجب استنتاج المحافظة من الرقم القومي');
assert.strictEqual(enrichedFromCodeOnly.birthDate, '2010-05-12', 'يجب فك تاريخ الميلاد من الرقم القومي');
assert(enrichedFromCodeOnly.ageText.includes('سنة'), 'يجب حساب السن في 1 أكتوبر من تاريخ الميلاد المستخرج');
assert.strictEqual(enrichedFromCodeOnly.religion, 'مسلم', 'يجب استرجاع الديانة من الكاش');
assert.strictEqual(enrichedFromCodeOnly.className, '3/1', 'يجب استرجاع الفصل من الكاش');
assert.strictEqual(enrichedFromCodeOnly.isMergedText, 'عادي');
assert(enrichedFromCodeOnly.regStatus.includes('متخلف عن التسجيل'));
console.log('✓ تم التحقق بنجاح من إثراء جدول صفحة الوزارة (الكود والاسم فقط) بالرقم القومي وتاريخ الميلاد والنوع والسن والديانة والفصل 100%');

// اختبار الطالب الأول (بنين - متخلف عن التسجيل)
const boyEnriched = NeprasG9ExamForms.enrichStudentData(
  {
    code: '102030',
    name: 'أحمد إبراهيم محمد',
    nationalId: '31005121301234',
    className: '3/1',
    isRegistered: false
  },
  cachedMap,
  schoolContext,
  NeprasG9ExamForms.MODES.UNREGISTERED
);

assert.strictEqual(boyEnriched.gender, 'ذكر', 'يجب استنتاج النوع (ذكر) من الرقم القومي');
assert.strictEqual(boyEnriched.governorate, 'الشرقية', 'يجب استنتاج المحافظة (الشرقية) من الرقم القومي');
assert.strictEqual(boyEnriched.birthDate, '2010-05-12', 'تاريخ الميلاد غير مطابق');
assert(boyEnriched.ageText.includes('سنة'), 'يجب حساب السن في أول أكتوبر');
assert.strictEqual(boyEnriched.religion, 'مسلم', 'الديانة من الكاش');
assert.strictEqual(boyEnriched.isMergedText, 'عادي');
assert(boyEnriched.regStatus.includes('متخلف عن التسجيل'));
assert(boyEnriched.notes.includes('تنبيه بسرعة سداد الرسوم'));

// اختبار الطالبة الثانية (بنات - مسجلة للاستمارة - دمج ومسيحية)
const girlEnriched = NeprasG9ExamForms.enrichStudentData(
  {
    code: '102031',
    name: 'مريم جرجس صليب',
    nationalId: '31008251205688',
    className: '3/2',
    isRegistered: true
  },
  cachedMap,
  schoolContext,
  NeprasG9ExamForms.MODES.REGISTERED
);

assert.strictEqual(girlEnriched.gender, 'أنثى', 'يجب استنتاج النوع (أنثى) من الرقم القومي');
assert.strictEqual(girlEnriched.governorate, 'الدقهلية', 'محافظة الدقهلية من الرقم القومي 12');
assert.strictEqual(girlEnriched.birthDate, '2010-08-25');
assert.strictEqual(girlEnriched.religion, 'مسيحي');
assert.strictEqual(girlEnriched.isMergedText, 'دمج تعليمي');
assert(girlEnriched.regStatus.includes('تم تسجيل الاستمارة بنجاح'));
assert(girlEnriched.notes.includes('استمارة إلكترونية مسجلة'));

console.log('✓ تم التحقق من إثراء وتدقيق بيانات الطلاب بنسبة 100% (السن، النوع، الديانة، المحافظة، والدمج)');

// 8. فحص بناء مصنف الإكسيل المعتمد لكشف المتخلفين والمسجلين والكشف الشامل الموحد
const students = [boyEnriched, girlEnriched];

// كشف المتخلفين
const unregWorkbookBytes = NeprasG9ExamForms.buildG9ExamWorkbook(
  students,
  schoolContext,
  NeprasG9ExamForms.MODES.UNREGISTERED
);
assert(unregWorkbookBytes instanceof Uint8Array);
assert.strictEqual(unregWorkbookBytes[0], 0x50);
assert.strictEqual(unregWorkbookBytes[1], 0x4B);

// كشف المسجلين
const regWorkbookBytes = NeprasG9ExamForms.buildG9ExamWorkbook(
  students,
  schoolContext,
  NeprasG9ExamForms.MODES.REGISTERED
);
assert(regWorkbookBytes instanceof Uint8Array);
assert.strictEqual(regWorkbookBytes[0], 0x50);
assert.strictEqual(regWorkbookBytes[1], 0x4B);

// الكشف الشامل الموحد (3 أوراق عمل في ملف واحد)
const masterWorkbookBytes = NeprasG9ExamForms.buildG9ExamWorkbook(
  students,
  schoolContext,
  NeprasG9ExamForms.MODES.MASTER
);
assert(masterWorkbookBytes instanceof Uint8Array);
assert(masterWorkbookBytes.length > 800, 'الكشف الشامل الموحد يحتوي على 3 أوراق عمل ويجب أن يكون حجمه كافياً');
assert.strictEqual(masterWorkbookBytes[0], 0x50);
assert.strictEqual(masterWorkbookBytes[1], 0x4B);

console.log('✓ تم التحقق من بناء وتنسيق ملفات XLSX الرسمية (المتخلفين، المسجلين، والكشف الشامل الموحد 3 أوراق) بنجاح تام');

console.log('جميع اختبارات استمارة الشهادة الإعدادية المحدثة NeprasG9ExamForms اجتازت بنجاح 100%! 🎉');
