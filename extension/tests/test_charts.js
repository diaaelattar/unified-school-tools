'use strict';
const assert = require('assert');
const { loadGlobals, test, summary } = require('./_helpers');
loadGlobals('ui/escape.js', 'ui/charts.js');
const C = globalThis.NeprasCharts;

console.log('charts');
test('رسم عادي: SVG وجدول بديل ومفتاح لسلسلتين', () => {
  const h = C.barH({ title: 'ت', series: [{ name: 'بنين' }, { name: 'بنات' }], rows: [{ label: 'أ', values: [3, 4] }] });
  assert(h.includes('<svg') && h.includes('viz-table') && h.includes('viz-legend'));
});
test('سلسلة واحدة بلا مفتاح (legend)', () => {
  const h = C.barH({ title: 'ت', series: [{ name: 'x' }], rows: [{ label: 'أ', values: [3] }] });
  assert(!h.includes('viz-legend'));
});
test('النصوص مهروبة: لا وسوم حية من البيانات', () => {
  const h = C.barH({ title: '<img src=x onerror=1>', series: [{ name: '"><svg onload=1>' }, { name: 'b' }], rows: [{ label: '<script>1</script>', values: [1, 2] }] });
  assert(!/<img |<script|<svg onload/i.test(h.replace(/<svg class="viz-svg"/, '')));
});
test('بيانات فارغة: رسالة بدل رسم، ولا استثناء', () => {
  assert(C.barH({ title: 'ت', series: [{ name: 'x' }], rows: [] }).includes('viz-empty'));
  assert(C.barH({ title: 'ت', series: [{ name: 'a' }, { name: 'b' }], rows: [{ label: 'س', values: [0, 0] }] }).includes('<svg'));
});
summary('charts');
