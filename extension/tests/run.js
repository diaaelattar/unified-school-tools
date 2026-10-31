'use strict';
// تشغيل كل الاختبارات:  node tests/run.js
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
let bad = 0;
for (const f of fs.readdirSync(__dirname).filter((n) => /^test_.*\.js$/.test(n)).sort()) {
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { encoding: 'utf8' });
  process.stdout.write(r.stdout + (r.stderr || ''));
  if (r.status !== 0) bad++;
}
console.log(bad ? `\n✗ فشلت ${bad} مجموعة اختبارات` : '\n✓ كل الاختبارات ناجحة');
process.exit(bad ? 1 : 0);
