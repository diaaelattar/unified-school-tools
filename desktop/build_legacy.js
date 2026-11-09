const { execSync } = require('child_process');
const path = require('path');

console.log('--- بدء تجهيز وبناء نسخة نبراس لأجهزة ويندوز 7 (32-بت ia32) ---');
console.log('إصدار إلكترون المستهدف: 22.3.27 (آخر إصدار متوافق مع Windows 7 / 8 / 8.1 32-bit)');

const cmd = [
  'npx electron-builder',
  '--win portable',
  '--ia32',
  '-c.electronVersion="22.3.27"',
  '-c.directories.output="../release/desktop-legacy"',
  '-c.portable.artifactName="Nepras_Portable_Win7_32bit_v1.3.41.exe"',
  '-c.nsis.artifactName="Nepras_Setup_Win7_32bit_v1.3.41.exe"'
].join(' ');

try {
  console.log('Running:', cmd);
  execSync(cmd, { cwd: __dirname, stdio: 'inherit' });
  console.log('✓ تم الانتهاء بنجاح!');
} catch (err) {
  console.error('Build error:', err.message);
  process.exit(1);
}
