const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '../..');
const outDir = path.join(root, 'النسخ_التنفيذية_المكتملة');
const extDir = path.join(root, 'Nepras_apps/extension');
const apkSrc = path.join(root, 'Nepras_apps/mobile/android/app/build/outputs/apk/release/app-release-unsigned.apk');

// 1. Copy APK
if (fs.existsSync(apkSrc)) {
  fs.copyFileSync(apkSrc, path.join(outDir, 'Nepras_v1.3.2.apk'));
  fs.copyFileSync(apkSrc, path.join(outDir, 'Nepras_v1.3.3.apk'));
  console.log('✅ Copied fresh APK to release folder');
} else {
  console.warn('APK src not found:', apkSrc);
}

// 2. Package Extension ZIPs
const zips = [
  'Nepras_Edge_Extension_v1.3.3.zip',
  'Nepras_Edge_Extension_v1.3.2.zip',
  'Nepras_v1.3.3_Extension.zip',
  'Nepras_v1.3.2_Extension.zip'
];

for (const z of zips) {
  const zipPath = path.join(outDir, z);
  execSync(`tar -a -cf "${zipPath}" -C "${extDir}" .`, { stdio: 'inherit' });
  console.log(`✅ Packed ${z} (${(fs.statSync(zipPath).size / 1024 / 1024).toFixed(2)} MB)`);
}

// 3. Package Portable Desktop ZIP
const portableDir = path.join(outDir, 'Nepras_Desktop_v1.3.2_Portable');
if (fs.existsSync(portableDir)) {
  const pZip = path.join(outDir, 'Nepras_Desktop_v1.3.2_Portable.zip');
  execSync(`tar -a -cf "${pZip}" -C "${portableDir}" .`, { stdio: 'inherit' });
  console.log(`✅ Packed Nepras_Desktop_v1.3.2_Portable.zip (${(fs.statSync(pZip).size / 1024 / 1024).toFixed(2)} MB)`);
}

// 4. List release files
console.log('\n--- Release files summary ---');
const files = fs.readdirSync(outDir);
files.forEach(f => {
  const p = path.join(outDir, f);
  const s = fs.statSync(p);
  if (!s.isDirectory()) {
    console.log(`${f} | ${(s.size / 1024 / 1024).toFixed(2)} MB | ${s.mtime.toLocaleTimeString('ar-EG')}`);
  }
});
