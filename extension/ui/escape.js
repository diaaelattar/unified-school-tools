/* Nepras — دالة الهروب الوحيدة لكل نص يدخل داخل HTML.
   القاعدة (يفرضها dev/test_html_sinks.js): كل قيمة متغيّرة تدخل في innerHTML / insertAdjacentHTML
   تمرّ من هنا (NeprasEscape.html)، أو تكون رقمًا، أو موسومة صراحةً بتعليق html-safe مع سببه.
   - html(v)      : نص عادي أو قيمة سمة بين علامتي اقتباس مفردة أو مزدوجة.
   - attr(v)      : اسم بديل لـ html يوضّح الاستعمال داخل السمات.
   - multiline(v) : مثل html مع تحويل السطر الجديد إلى <br> (رسائل الحوارات).
   ملاحظة: modules/name_fixer.js مستقل عمدًا ولا يعتمد على غيره، فله Utils.escapeHtml بالسلوك نفسه. */
(function () {
  'use strict';
  if (globalThis.NeprasEscape) return;
  const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
  const html = (value) => String(value ?? '').replace(/[&<>"'`]/g, (c) => MAP[c]);
  const multiline = (value) => html(value).replace(/\r?\n/g, '<br>');
  globalThis.NeprasEscape = Object.freeze({ html, attr: html, multiline });
})();
