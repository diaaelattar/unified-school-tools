'use strict';
// حرّاس انحدار على المصدر: تفشل إن عاد أي نمط أُصلح سابقًا.
const assert = require('assert');
const { read, test, summary } = require('./_helpers');
const bg = read('background.js');
const bridge = read('teacher_api_bridge.js');
const manifest = JSON.parse(read('manifest.json'));

console.log('regressions');
test('manifest: minimum_chrome_version وCSP صارمة ونطاقات الوزارة فقط', () => {
  assert(Number(manifest.minimum_chrome_version) >= 102);
  assert(/script-src 'self'/.test(manifest.content_security_policy.extension_pages));
  for (const h of manifest.host_permissions) assert(/^https:\/\/[a-z-]+\.emis\.gov\.eg\/\*$/.test(h), h);
  assert(!manifest.externally_connectable);
});
test('الجسر: فحص source وorigin وقائمة سماح الأصل والمسار', () => {
  assert(/event\.source !== window \|\| event\.origin !== window\.location\.origin/.test(bridge));
  assert(bridge.includes("ALLOWED_ORIGIN = 'https://professopi.emis.gov.eg'"));
  assert(bridge.includes('URL_NOT_ALLOWED'));
});
test('الخلفية: فحص المسار بعد new URL ورفض %2e/%2f/%5c', () => {
  assert(bg.includes('parsedApiUrl.pathname'));
  assert(bg.includes('%(?:2e|2f|5c)'));
});
test('الخلفية: رؤوس التوثيق تُكتب بعد الرؤوس الإضافية', () => {
  const i = bg.indexOf('...sanitizedExtraHeaders,');
  assert(i > 0 && bg.indexOf('"Authorization": authorization', i) > i);
});
test('الخلفية: معالجات حساسة تفحص المرسِل وتنزيل الملفات بامتدادات مسموحة', () => {
  for (const a of ['NEPRAS_DOWNLOAD_FILE', 'NEPRAS_LOOKUP_STUDENT_NATIONWIDE', 'NEPRAS_NAVIGATE_WORK']) {
    const i = bg.indexOf(`request.action === "${a}"`);
    assert(i > 0 && /FORBIDDEN/.test(bg.slice(i, i + 400)), a);
  }
  assert(bg.includes('NEPRAS_DOWNLOAD_ALLOWED_EXTS'));
  assert(bg.includes('parsed?.protocol !== "https:"'));
});
test('لا eval ولا new Function في كود الإضافة (عدا المكتبات المضمّنة)', () => {
  const fs = require('fs'), path = require('path');
  const skip = new Set(['xlsx.full.min.js', 'pdf-lib.min.js', 'pdf.min.js', 'pdf.worker.js']);
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory()
    ? (['node_modules', 'tests', 'templates'].includes(e.name) ? [] : walk(path.join(d, e.name)))
    : (e.name.endsWith('.js') && !skip.has(e.name) ? [path.join(d, e.name)] : []));
  for (const f of walk(path.join(__dirname, '..'))) {
    const s = fs.readFileSync(f, 'utf8');
    assert(!/[^.\w]eval\(|new Function\(/.test(s), f);
  }
});
test('SheetJS 0.20.3 أو أحدث', () => {
  const m = read('xlsx.full.min.js').match(/\.version="(0\.\d+\.\d+)"/g) || [];
  assert(m.some((v) => /0\.(2\d|[3-9]\d)\./.test(v) || /0\.20\.[3-9]/.test(v)), m.join());
});
test('منقّي الأسماء: لا confirm() أصلي خارج nfConfirm', () => {
  const s = read('modules/name_fixer.js').replace(/return window\.confirm\(message\);/, '').replace(/^\s*\/\/.*$/gm, '');
  assert(!/[^.\w]confirm\(/.test(s));
});
test('لا سنوات دراسية صلبة في القيم الافتراضية للوحة الإحصاء ودفاتر الفصول', () => {
  assert(!/\|\| '2026-2027'/.test(read('modules/stats_dashboard.js')));
  assert(!/yearText: '2026 \/ 2027'/.test(read('modules/class_books.js')));
});
test('كشف 401/403 بتعبير يطابق الرقم كاملًا لا includes("401")', () => {
  assert(!/includes\("401"\)/.test(read('modules/attendance.js')));
  assert(!/includes\("401"\)/.test(read('modules/export.js')));
});
test('سجلات المدرسة: لا نوع «ذكر» ولا ديانة «مسلم» افتراضيين مُختلَقين', () => {
  const s = read('modules/school_records.js').split('\n').filter((l) => !/sampleRow/.test(l)).join('\n');
  assert(!/\|\| 'مسلم'/.test(s), 'ديانة افتراضية');
  assert(!/: 'ذكر'\)/.test(s) && !/parsedNid \? parsedNid\.gender : 'ذكر'/.test(s), 'نوع افتراضي');
});
test('التصدير: تحذير صريح عند اقتطاع القائمة (بطء الصفحات)', () => {
  const s = read('modules/export.js');
  assert(s.includes('function neprasWarnListTruncated'));
  assert((s.match(/neprasWarnListTruncated\(/g) || []).length >= 3);
});
test('سلامة البناء النحوي (Syntax) لجميع ملفات JS في الإضافة وسطح المكتب', () => {
  const fs = require('fs'), path = require('path'), vm = require('vm');
  const skip = new Set(['xlsx.full.min.js', 'pdf-lib.min.js', 'pdf.min.js', 'pdf.worker.js']);
  const walk = (d) => fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory()
    ? (['node_modules', 'dist', 'release', 'release_win7_32bit', 'templates'].includes(e.name) ? [] : walk(path.join(d, e.name)))
    : (e.name.endsWith('.js') && !skip.has(e.name) ? [path.join(d, e.name)] : [])) : [];
  const files = [
    ...walk(path.join(__dirname, '..')),
    ...walk(path.join(__dirname, '..', '..', 'desktop', 'src'))
  ];
  assert(files.length >= 25, 'يجب فحص 25 ملف JS على الأقل');
  for (const f of files) {
    const code = fs.readFileSync(f, 'utf8');
    new vm.Script(code, { filename: f });
  }
});
summary('regressions');
