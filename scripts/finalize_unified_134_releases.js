const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '../..');
const outDir = path.join(root, 'النسخ_التنفيذية_المكتملة');
const extSrc = path.join(root, 'Nepras_apps/extension');
const winUnpacked = path.join(root, 'Nepras_apps/release/desktop/win-unpacked');
const apkSrc = [
  path.join(root, 'Nepras_apps/mobile/android/app/build/outputs/apk/release/app-release.apk'),
  path.join(root, 'Nepras_apps/mobile/android/app/build/outputs/apk/release/app-release-unsigned.apk')
].find(p => fs.existsSync(p));

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const ent of entries) {
    if (ent.name === 'tests' || ent.name.endsWith('.test.js')) continue;
    const s = path.join(src, ent.name);
    const d = path.join(dest, ent.name);
    if (ent.isDirectory()) {
      copyDirRecursive(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

console.log('=== 1. Setting up Nepras_v1.3.4_Extension in release folder ===');
const targetExtDir = path.join(outDir, 'Nepras_v1.3.4_Extension');
if (fs.existsSync(targetExtDir)) fs.rmSync(targetExtDir, { recursive: true, force: true });
copyDirRecursive(extSrc, targetExtDir);
console.log('✅ Extension 1.3.4 copied.');

console.log('=== 2. Setting up Nepras_Desktop_v1.3.4_Portable in release folder ===');
const targetPortableDir = path.join(outDir, 'Nepras_Desktop_v1.3.4_Portable');
if (fs.existsSync(targetPortableDir)) fs.rmSync(targetPortableDir, { recursive: true, force: true });
copyDirRecursive(winUnpacked, targetPortableDir);
console.log('✅ Desktop Portable 1.3.4 copied from win-unpacked.');

console.log('=== 3. Syncing Release Artifacts (Host shell, ext, app.asar) ===');
execSync('node scripts/sync_release_artifacts.js', { cwd: path.join(root, 'Nepras_apps'), stdio: 'inherit' });

console.log('=== 4. Packaging Store Extensions 1.3.4 ===');
execSync('node scripts/package_store_release.js', { cwd: path.join(root, 'Nepras_apps'), stdio: 'inherit' });

console.log('=== 5. Packaging Desktop Portable 1.3.4 ZIP ===');
const portableZip = path.join(outDir, 'Nepras_Desktop_v1.3.4_Portable.zip');
if (fs.existsSync(portableZip)) fs.unlinkSync(portableZip);
execSync(`tar -a -cf "${portableZip}" -C "${targetPortableDir}" .`, { stdio: 'inherit' });
console.log(`✅ Packed Nepras_Desktop_v1.3.4_Portable.zip (${(fs.statSync(portableZip).size / 1024 / 1024).toFixed(2)} MB)`);

console.log('=== 6. Copying Mobile APK 1.3.4 ===');
if (apkSrc && fs.existsSync(apkSrc)) {
  fs.copyFileSync(apkSrc, path.join(outDir, 'Nepras_v1.3.4.apk'));
  console.log(`✅ Copied Nepras_v1.3.4.apk (${(fs.statSync(path.join(outDir, 'Nepras_v1.3.4.apk')).size / 1024 / 1024).toFixed(2)} MB)`);
} else {
  console.warn('⚠️ APK src not found');
}

console.log('\n=== 7. Verified Inventory of Unified v1.3.4 in النسخ_التنفيذية_المكتملة ===');
const items = fs.readdirSync(outDir);
items.filter(f => f.includes('1.3.4')).forEach(f => {
  const p = path.join(outDir, f);
  const s = fs.statSync(p);
  const kind = s.isDirectory() ? '[FOLDER]' : `${(s.size / 1024 / 1024).toFixed(2)} MB`;
  console.log(`• ${f.padEnd(38)} | ${kind.padEnd(10)} | ${s.mtime.toLocaleTimeString('ar-EG')}`);
});
