'use strict';
// أدوات مشتركة للاختبارات: تحميل ملفات الإضافة (نصوص IIFE عامة) داخل Node بلا متصفح.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

function loadGlobals(...files) {
  globalThis.window = globalThis;
  for (const f of files) (0, eval)(read(f));
  return globalThis;
}

let failures = 0, passes = 0;
let queue = Promise.resolve();

function test(name, fn) {
  queue = queue.then(async () => {
    try {
      await fn();
      passes++;
      console.log('  ✓ ' + name);
    } catch (e) {
      failures++;
      console.log('  ✗ ' + name + '\n      ' + (e && e.message || e));
    }
  });
}

function summary(title) {
  queue = queue.then(() => {
    console.log(`${title}: ${passes} ناجح، ${failures} فاشل`);
    process.exitCode = failures ? 1 : 0;
  });
  return queue;
}

module.exports = { ROOT, read, loadGlobals, test, summary };
