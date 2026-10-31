/* brand.js — المصدر الوحيد لاسم المنتج وأسماء أدواته كما تظهر للمستخدم.
   يُحمَّل أولًا في النافذة (popup.html) وفي صفحات الوزارة (قائمة الحقن في background.js).
   أي نص يُركَّب في JavaScript ويحوي الاسم يقرأ من هنا مع قيمة احتياطية، حتى لا ينكسر إن غاب الملف.
   النصوص الثابتة في popup.html و_locales تُكتب يدويًا، ويمنع اختبار dev/test_terms.js رجوع الصيغ القديمة.
   لا يغيّر هذا الملف: بادئة المعرّفات (nepras/NEPRAS)، ولا مفاتيح التخزين، ولا مجلد Downloads/Nepras. */
(() => {
  'use strict';
  if (globalThis.NeprasBrand) return;
  globalThis.NeprasBrand = Object.freeze({
    name: 'نبراس',
    nameEn: 'Nepras',
    tagline: 'أدوات المدرسة الموحّدة',
    full: 'نبراس — أدوات المدرسة الموحّدة',
    downloadRoot: 'Nepras',
    tools: Object.freeze({
      nameFixer: 'منقّي أسماء الطلاب',
      records: 'السجلات والكشوف',
      autoAssign: 'التسكين والتوزيع الآلي للفصول',
      staff: 'العاملون'
    })
  });
})();
