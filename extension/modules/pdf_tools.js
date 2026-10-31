/**
 * نبراس — أدوات المدرسة الموحّدة
 * وحدة أدوات المستندات والـ PDF المحلية
 * NeprasPdfStudio — دمج واستخراج صفحات ملفات الـ PDF بأمان تام دون خوادم خارجية
 */
'use strict';

(function(global) {
  if (global.NeprasPdfStudio) return;

  /**
   * دمج ملفات PDF متعددة في ملف واحد
   * @param {Array<ArrayBuffer|Uint8Array>} pdfBuffers
   * @returns {Promise<Uint8Array>}
   */
  async function mergePdfs(pdfBuffers) {
    if (!global.PDFLib || !global.PDFLib.PDFDocument) {
      throw new Error('مكتبة PDFLib غير متوفرة في بيئة التشغيل');
    }
    if (!Array.isArray(pdfBuffers) || pdfBuffers.length === 0) {
      throw new Error('لم يتم تمرير أي ملفات للدمج');
    }

    const mergedPdf = await global.PDFLib.PDFDocument.create();

    for (let i = 0; i < pdfBuffers.length; i++) {
      const buf = pdfBuffers[i];
      const srcDoc = await global.PDFLib.PDFDocument.load(buf);
      const copiedPages = await mergedPdf.copyPages(srcDoc, srcDoc.getPageIndices());
      for (const page of copiedPages) {
        mergedPdf.addPage(page);
      }
    }

    return await mergedPdf.save();
  }

  /**
   * تحليل نص نطاق الصفحات (مثل "1, 3, 5-8") إلى مصفوفة أرقام (0-based)
   * @param {string} rangeStr
   * @param {number} totalPages
   * @returns {Array<number>}
   */
  function parsePageRange(rangeStr, totalPages) {
    if (!rangeStr || typeof rangeStr !== 'string') return [];
    const clean = rangeStr.replace(/\s+/g, '');
    const parts = clean.split(',');
    const pages = new Set();

    for (const p of parts) {
      if (p.includes('-')) {
        const [startStr, endStr] = p.split('-');
        const s = parseInt(startStr, 10);
        const e = parseInt(endStr, 10);
        if (!isNaN(s) && !isNaN(e)) {
          const from = Math.max(1, Math.min(s, e));
          const to = Math.min(totalPages, Math.max(s, e));
          for (let i = from; i <= to; i++) {
            pages.add(i - 1);
          }
        }
      } else {
        const num = parseInt(p, 10);
        if (!isNaN(num) && num >= 1 && num <= totalPages) {
          pages.add(num - 1);
        }
      }
    }

    return Array.from(pages).sort((a, b) => a - b);
  }

  /**
   * استخراج صفحات معينة من ملف PDF
   * @param {ArrayBuffer|Uint8Array} pdfBuffer
   * @param {string|Array<number>} range
   * @returns {Promise<Uint8Array>}
   */
  async function extractPages(pdfBuffer, range) {
    if (!global.PDFLib || !global.PDFLib.PDFDocument) {
      throw new Error('مكتبة PDFLib غير متوفرة في بيئة التشغيل');
    }

    const srcDoc = await global.PDFLib.PDFDocument.load(pdfBuffer);
    const totalPages = srcDoc.getPageCount();
    const pageIndices = Array.isArray(range) ? range : parsePageRange(range, totalPages);

    if (pageIndices.length === 0) {
      throw new Error('لم يتم تحديد أي صفحات صالحة للحفظ');
    }

    const newDoc = await global.PDFLib.PDFDocument.create();
    const copiedPages = await newDoc.copyPages(srcDoc, pageIndices);
    for (const page of copiedPages) {
      newDoc.addPage(page);
    }

    return await newDoc.save();
  }

  global.NeprasPdfStudio = Object.freeze({
    mergePdfs,
    parsePageRange,
    extractPages
  });

})(typeof window !== 'undefined' ? window : globalThis);
