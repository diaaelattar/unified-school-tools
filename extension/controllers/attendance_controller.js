"use strict";

/**
 * ==============================================================================
 * 📑 وحدة التحكم في الغياب والإنذارات الرسمية (Nepras Attendance Controller)
 * ------------------------------------------------------------------------------
 * • إدارة استخراج وتحليل ملفات PDF الغياب الرسمية الصادرة من موقع الوزارة.
 * • تصنيف الطلاب إلى فئات الإنذارات الثلاثة (الأول، الثاني، التسجيل بالفصل).
 * • توليد وطباعة خطابات علم الوصول المعتمدة مع تضمين لوجو المدرسة.
 * ==============================================================================
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.NeprasAttendanceController = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {

  function processAbsencePdf(file, options = {}) {
    return new Promise((resolve, reject) => {
      if (!file) return reject(new Error("لم يتم تحديد ملف PDF صالح."));
      if (!globalThis.NeprasAbsencePdfParser) {
        return reject(new Error("وحدة معالجة PDF الغياب (NeprasAbsencePdfParser) غير محملة."));
      }

      const reader = new FileReader();
      reader.onload = async function (e) {
        try {
          const buffer = e.target.result;
          const parsed = await globalThis.NeprasAbsencePdfParser.parseAbsencePdf(buffer, options);
          resolve(parsed);
        } catch (err) {
          if (globalThis.NeprasLogger) NeprasLogger.error("ATTENDANCE_CONTROLLER", "parseAbsencePdf", err);
          reject(err);
        }
      };
      reader.onerror = (e) => reject(new Error("فشلت قراءة ملف PDF: " + (e?.target?.error?.message || "خطأ غير معروف")));
      reader.readAsArrayBuffer(file);
    });
  }

  return {
    init(ctx = {}) {
      // مستمعات عناصر الواجهة لتبويب الغياب
      const fileInput = document.getElementById("absence-pdf-file-input");
      if (fileInput) {
        fileInput.addEventListener("change", async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;

          try {
            if (ctx.showNotice) ctx.showNotice("جاري تحليل ملف PDF الغياب واستخراج بيانات الفصول...", "info", "تحليل الغياب");
            const result = await processAbsencePdf(file, { getSchoolMeta: ctx.getSchoolMeta });
            if (ctx.showNotice) {
              ctx.showNotice(`تم بنجاح تحليل غياب (${result.students?.length || 0}) طالباً.`, "success", "تحليل الغياب");
            }
          } catch (err) {
            if (ctx.showNotice) {
              ctx.showNotice("تعذر استخراج بيانات الغياب: " + (err?.message || err), "error", "خطأ في الملف");
            }
          } finally {
            fileInput.value = "";
          }
        });
      }
    },
    processAbsencePdf
  };
});
