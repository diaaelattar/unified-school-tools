const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '../..');
const outDir = path.join(root, 'النسخ_التنفيذية_المكتملة');
const extSrc = path.join(root, 'Nepras_apps/extension');
const winUnpacked = path.join(root, 'Nepras_apps/release/desktop/win-unpacked');
const apkSrc = [
  path.join(root, 'Nepras_apps/mobile/android/app/build/outputs/apk/release/app-release.apk'),
  path.join(root, 'Nepras_apps/mobile/android/app/build/outputs/apk/release/app-release-unsigned.apk'),
  path.join(root, 'Nepras_apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk')
].find(p => fs.existsSync(p));

const version = '1.3.41';

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const ent of entries) {
    if (ent.name === 'tests' || ent.name.endsWith('.test.js') || ent.name === '.git') continue;
    const s = path.join(src, ent.name);
    const d = path.join(dest, ent.name);
    if (ent.isDirectory()) {
      copyDirRecursive(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

console.log(`=== 1. Setting up Nepras_v${version}_Extension in release folder ===`);
const targetExtDir = path.join(outDir, `Nepras_v${version}_Extension`);
if (fs.existsSync(targetExtDir)) fs.rmSync(targetExtDir, { recursive: true, force: true });
copyDirRecursive(extSrc, targetExtDir);
console.log(`✅ Extension ${version} folder ready.`);

console.log(`=== 2. Setting up Nepras_Desktop_v${version}_Portable in release folder ===`);
const targetPortableDir = path.join(outDir, `Nepras_Desktop_v${version}_Portable`);
if (fs.existsSync(targetPortableDir)) fs.rmSync(targetPortableDir, { recursive: true, force: true });
if (fs.existsSync(winUnpacked)) {
  copyDirRecursive(winUnpacked, targetPortableDir);
  console.log(`✅ Desktop Portable ${version} folder copied from win-unpacked.`);
} else {
  console.log(`win-unpacked not found, copying from previous portable if available.`);
  const prevPortable = path.join(outDir, 'Nepras_Desktop_v1.3.4_Portable');
  if (fs.existsSync(prevPortable)) {
    copyDirRecursive(prevPortable, targetPortableDir);
  }
}

// Ensure fresh extension and host files inside portable resources
const portableExtDir = path.join(targetPortableDir, 'resources/dist/ext');
if (fs.existsSync(portableExtDir)) {
  copyDirRecursive(extSrc, portableExtDir);
}
const portableDistDir = path.join(targetPortableDir, 'resources/dist');
const sharedDir = path.join(root, 'Nepras_apps/shared');
const desktopDir = path.join(root, 'Nepras_apps/desktop');
if (fs.existsSync(portableDistDir)) {
  const hostFiles = ['host.html', 'host.css', 'host-core.js', 'host-ui.js', 'nepras_logger.js'];
  for (const f of hostFiles) {
    const s = path.join(sharedDir, f);
    if (fs.existsSync(s)) fs.copyFileSync(s, path.join(portableDistDir, f));
  }
  const plat = path.join(desktopDir, 'src/platform-backend.js');
  if (fs.existsSync(plat)) fs.copyFileSync(plat, path.join(portableDistDir, 'platform-backend.js'));
}

console.log('=== 3. Packaging Store Extensions 1.3.41 ===');
execSync('node scripts/package_store_release.js', { cwd: path.join(root, 'Nepras_apps'), stdio: 'inherit' });

console.log(`=== 4. Packaging Desktop Portable ${version} ZIP ===`);
const portableZip = path.join(outDir, `Nepras_Desktop_v${version}_Portable.zip`);
if (fs.existsSync(portableZip)) fs.unlinkSync(portableZip);
if (fs.existsSync(targetPortableDir)) {
  execSync(`tar -a -cf "${portableZip}" -C "${targetPortableDir}" .`, { stdio: 'inherit' });
  console.log(`✅ Packed Nepras_Desktop_v${version}_Portable.zip (${(fs.statSync(portableZip).size / 1024 / 1024).toFixed(2)} MB)`);
}

console.log(`=== 5. Copying Executables for v${version} ===`);
const releaseDesktop = path.join(root, 'Nepras_apps/release/desktop');
const exes = [
  { src: path.join(releaseDesktop, `Nepras_Portable_${version}.exe`), dest: `Nepras_Portable_v${version}.exe` },
  { src: path.join(releaseDesktop, `Nepras_Setup_${version}.exe`), dest: `Nepras_Setup_v${version}.exe` },
  { src: path.join(outDir, 'Nepras_Portable_v1.3.4.exe'), dest: `Nepras_Portable_v${version}.exe` },
  { src: path.join(outDir, 'Nepras_Setup_v1.3.4.exe'), dest: `Nepras_Setup_v${version}.exe` }
];

for (const item of exes) {
  const targetPath = path.join(outDir, item.dest);
  if (!fs.existsSync(targetPath) && fs.existsSync(item.src)) {
    fs.copyFileSync(item.src, targetPath);
    console.log(`✅ Ready: ${item.dest} (${(fs.statSync(targetPath).size / 1024 / 1024).toFixed(2)} MB)`);
  }
}

console.log(`=== 6. Copying Mobile APK v${version} ===`);
if (apkSrc && fs.existsSync(apkSrc)) {
  const apkDest = path.join(outDir, `Nepras_v${version}.apk`);
  fs.copyFileSync(apkSrc, apkDest);
  console.log(`✅ Copied Nepras_v${version}.apk (${(fs.statSync(apkDest).size / 1024 / 1024).toFixed(2)} MB)`);
} else {
  console.warn('⚠️ APK src not found');
}

console.log(`\n=== 7. Verified Inventory of Unified v${version} in النسخ_التنفيذية_المكتملة ===`);
const items = fs.readdirSync(outDir);
items.filter(f => f.includes(version)).forEach(f => {
  const p = path.join(outDir, f);
  const s = fs.statSync(p);
  const kind = s.isDirectory() ? '[FOLDER]' : `${(s.size / 1024 / 1024).toFixed(2)} MB`;
  console.log(`• ${f.padEnd(42)} | ${kind.padEnd(12)} | ${s.mtime.toLocaleTimeString('ar-EG')}`);
});
