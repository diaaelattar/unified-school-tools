const assert = require('assert');
const path = require('path');

const desktopDir = path.resolve(__dirname, '../../النسخ_التنفيذية_المكتملة/Nepras_Desktop_v1.3.1_Portable/resources/dist/ext');
const guardPath = path.join(desktopDir, 'modules/nepras_security_guard.js');
console.log('Loading guard from:', guardPath);
const guard = require(guardPath);

guard.checkLicense().then(res => {
  console.log('Protected Security Check in Desktop Dist:', res);
  assert.strictEqual(res.status, 'ACTIVE');
  assert.strictEqual(res.locked, false);
  assert.strictEqual(res.message, '');
  console.log('✅ DESKTOP PORTABLE DISTRIBUTION FULLY VERIFIED!');
}).catch(err => {
  console.error(err);
  process.exit(1);
});
