/**
 * نبراس - Utils Module
 */
const StudentUtils = {
  // استخراج وتنظيف النص بدون مسافات زائدة
  cleanText: function(element) {
    if (!element) return '';
    let val = '';
    
    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
      val = element.value || element.getAttribute('value') || '';
    } else if (element.tagName === 'SELECT') {
      if (element.selectedIndex >= 0) {
        const opt = element.options[element.selectedIndex];
        val = opt ? (opt.text || opt.value) : element.value;
      }
    } else {
      val = element.innerText || element.textContent || '';
    }
    
    return val.replace(/\s+/g, ' ').trim();
  },

  // السحب المتعدد مع البدائل لضمان عدم خروج أي حقل فارغاً
  getFieldValue: function(container, selectors) {
    if (!container) container = document;
    if (typeof selectors === 'string') selectors = [selectors];
    
    for (let selector of selectors) {
      try {
        const el = container.querySelector(selector);
        if (el) {
          const txt = this.cleanText(el);
          if (txt !== '') return txt;
        }
      } catch (e) {
        // تجنب الأخطاء عند محددات CSS غير المألوفة
      }
    }
    return 'غير مدخل'; // القيمة الافتراضية بدلاً من ترك الحقل فارغاً
  }
};

window.StudentUtils = StudentUtils;