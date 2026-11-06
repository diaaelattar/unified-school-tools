"use strict";

/**
 * ==============================================================================
 * 📊 وحدة التحكم في الإحصاء الشامل والتحليلات (Nepras Stats Controller)
 * ------------------------------------------------------------------------------
 * • إدارة استخراج الـ 15 تقريراً إحصائياً الرسمية للوزارة.
 * • تشغيل محرك كشف الشواذ والتعارضات في بيانات المدرسة.
 * • دعم التصدير فائق السرعة عبر Web Worker أو الحزمة المنسقة.
 * ==============================================================================
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.NeprasStatsController = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {

  async function exportMasterWorkbook(students, meta, options = {}) {
    if (!students || !students.length) {
      throw new Error("لا توجد بيانات طلاب متاحة للتصدير الإحصائي. يرجى تحديث البيانات أولاً.");
    }

    if (!globalThis.NeprasStatsDashboard || typeof globalThis.NeprasStatsDashboard.buildMasterWorkbook !== "function") {
      throw new Error("وحدة الإحصاء الشامل (NeprasStatsDashboard) غير محملة.");
    }

    const masterWb = globalThis.NeprasStatsDashboard.buildMasterWorkbook(students, meta);
    if (!masterWb) {
      throw new Error("فشل بناء المصنف الإحصائي الشامل.");
    }

    // إذا كانت الدالة المنسقة متاحة، نستخدمها لتطبيق ألوان وحدود التقارير
    if (globalThis.neprasXlsxConvertWorkbookToStyledPackage) {
      return globalThis.neprasXlsxConvertWorkbookToStyledPackage(masterWb);
    }

    if (typeof XLSX !== "undefined") {
      const out = XLSX.write(masterWb, { bookType: "xlsx", type: "array" });
      return new Uint8Array(out);
    }

    throw new Error("لا يوجد محرك متاح لكتابة ملف Excel.");
  }

  return {
    init(ctx = {}) {
      const btnMasterExport = document.getElementById("btn-sc-export-master");
      if (btnMasterExport) {
        btnMasterExport.addEventListener("click", async () => {
          try {
            const students = ctx.getCachedStudents ? ctx.getCachedStudents() : (window.neprasCachedStudentsList || []);
            const meta = ctx.getSchoolMeta ? ctx.getSchoolMeta() : {};

            if (!students.length) {
              if (ctx.showNotice) {
                ctx.showNotice("لا توجد بيانات طلاب محفوظة حالياً. اضغط «تحديث بيانات المدرسة» أولاً.", "warn", "الإحصاء الشامل");
              }
              return;
            }

            if (ctx.showNotice) {
              ctx.showNotice("جاري تجميع وتنسيق الـ 15 تقريراً إحصائياً في مصنف واحد...", "info", "المصنف الإحصائي");
            }

            const bytes = await exportMasterWorkbook(students, meta);
            const filename = `المصنف_الإحصائي_الشامل_${meta.school || "المدرسة"}_${new Date().toISOString().slice(0, 10)}.xlsx`;

            const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }, 200);

            if (ctx.showNotice) {
              ctx.showNotice("تم تصدير المصنف الإحصائي الشامل بنجاح تام!", "success", "المصنف الإحصائي");
            }
          } catch (err) {
            if (globalThis.NeprasLogger) NeprasLogger.error("STATS_CONTROLLER", "exportMaster", err);
            if (ctx.showNotice) {
              ctx.showNotice("تعذر تصدير المصنف الإحصائي: " + (err?.message || err), "error", "خطأ في الإحصاء");
            }
          }
        });
      }
    },
    exportMasterWorkbook
  };
});
