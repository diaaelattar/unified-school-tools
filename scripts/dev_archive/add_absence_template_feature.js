'use strict';
const fs = require('fs');
const path = require('path');

const popupHtmlPath = path.join(__dirname, '..', 'extension', 'popup.html');
let html = fs.readFileSync(popupHtmlPath, 'utf8');

const targetHtml = `  <!-- أزرار الإجراءات السريعة: معاينة واستيراد -->
  <div class="action-grid two-actions" style="margin-bottom:8px;">
    <button class="n-btn n-btn--secondary n-btn--block" id="btn-warnings-preview" type="button" title="معاينة كشف أيام الغياب لجميع الطلاب">
      <i data-icon="search"></i><span class="n-btn__label">معاينة كشف الغياب</span>
    </button>
    <label class="n-btn n-btn--secondary n-btn--block" title="استيراد كشف غياب Excel به أعمدة كود الطالب والغياب" style="cursor:pointer;margin:0;display:flex;align-items:center;justify-content:center;">
      <i data-icon="upload"></i><span class="n-btn__label">استيراد كشف غياب Excel</span>
      <input type="file" id="warnings-excel-file-input" accept=".xlsx, .xls, .csv" style="display:none;">
    </label>
  </div>`;

const newButton = `

  <!-- زر تنزيل نموذج رصد الغياب الجاهز بأسماء طلاب المدرسة -->
  <div style="margin-bottom:8px;">
    <button class="n-btn n-btn--secondary n-btn--block" id="btn-warnings-download-template" type="button" style="border:1px dashed #0284c7;color:#0369a1;font-weight:700;" title="تحميل كشف إكسيل جاهز بأسماء وصفوف طلاب المدرسة لرصد الغياب بسهولة">
      <i data-icon="download"></i><span class="n-btn__label">📥 تحميل نموذج كشف غياب Excel لطلاب المدرسة</span>
    </button>
  </div>`;

if (html.includes('id="warnings-excel-file-input"') && !html.includes('id="btn-warnings-download-template"')) {
  // Normalize both to LF for insertion then preserve original line ending
  const hasCRLF = html.includes('\r\n');
  const normalizedHtml = html.replace(/\r\n/g, '\n');
  const normalizedTarget = targetHtml.replace(/\r\n/g, '\n');
  const normalizedReplacement = (targetHtml + newButton).replace(/\r\n/g, '\n');
  
  let updated = normalizedHtml.replace(normalizedTarget, normalizedReplacement);
  if (hasCRLF) updated = updated.replace(/\n/g, '\r\n');
  fs.writeFileSync(popupHtmlPath, updated, 'utf8');
  console.log('✓ Added btn-warnings-download-template to popup.html');
} else {
  console.log('Button already present or target not found');
}

// Now popup.js
const popupJsPath = path.join(__dirname, '..', 'extension', 'popup.js');
let js = fs.readFileSync(popupJsPath, 'utf8');

const handlerCode = `
    const btnWarningsDownloadTemplate = document.getElementById("btn-warnings-download-template");
    if (btnWarningsDownloadTemplate) {
      btnWarningsDownloadTemplate.addEventListener("click", async () => {
        try {
          const list = await getAllStudentsForAbsence();
          if (!list || !list.length) {
            showNeprasPopupNotice("لا توجد بيانات طلاب مسجلة حالياً لتحميل النموذج. قم بتحديث بيانات المدرسة أولاً.", "warning", "تنبيه");
            return;
          }
          if (typeof XLSX === "undefined") {
            showNeprasPopupNotice("مكتبة Excel غير محملة.", "error", "خطأ");
            return;
          }
          const schoolInfo = await getSchoolHeaderContext();
          const wb = window.NeprasAbsenceWarnings?.buildAbsenceTemplateWorkbook
            ? window.NeprasAbsenceWarnings.buildAbsenceTemplateWorkbook(list, schoolInfo, XLSX)
            : null;
          if (!wb) {
            showNeprasPopupNotice("تعذر إنشاء نموذج رصد الغياب.", "error", "خطأ");
            return;
          }
          const fileName = \`نموذج_رصد_غياب_\${schoolInfo.schoolName || 'المدرسة'}.xlsx\`;
          await neprasUnifiedDownloadXlsx(wb, fileName, "كشف الغياب", "تم تحميل نموذج رصد الغياب بنجاح. املأ عمود الغياب ثم ارفعه عبر زر «استيراد كشف غياب Excel».");
        } catch (err) {
          showNeprasPopupNotice("حدث خطأ أثناء إعداد نموذج الغياب: " + (err?.message || String(err)), "error", "خطأ");
        }
      });
    }
`;

if (!js.includes('btn-warnings-download-template')) {
  const insertMarker = 'if (btnWarningsPreview) {';
  js = js.replace(insertMarker, handlerCode + '\n    ' + insertMarker);
  fs.writeFileSync(popupJsPath, js, 'utf8');
  console.log('✓ Added click handler for btnWarningsDownloadTemplate in popup.js');
}
