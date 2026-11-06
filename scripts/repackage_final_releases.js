const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '../..');
const outDir = path.join(root, 'النسخ_التنفيذية_المكتملة');
const desktopDir = path.join(root, 'Nepras_apps/desktop');
const releaseDir = path.join(root, 'Nepras_apps/release/desktop');

console.log('=== 1. Rebuilding Desktop Dist ===');
execSync('node scripts/build.js desktop', { cwd: path.join(root, 'Nepras_apps'), stdio: 'inherit' });

console.log('\n=== 2. Syncing Release Artifacts ===');
execSync('node scripts/sync_release_artifacts.js', { cwd: path.join(root, 'Nepras_apps'), stdio: 'inherit' });

console.log('\n=== 3. Packaging Executables with electron-builder ===');
const builderBin = path.join(desktopDir, 'node_modules/.bin/electron-builder.cmd');
execSync(`"${builderBin}" --win`, { cwd: desktopDir, stdio: 'inherit' });

console.log('\n=== 4. Copying fresh .exe files to النسخ_التنفيذية_المكتملة ===');
const exeFiles = [
  { src: 'Nepras_Portable_1.3.2.exe', dests: ['Nepras_Portable_1.3.2.exe', 'Nepras_Portable_v1.3.2.exe'] },
  { src: 'Nepras_Setup_1.3.2.exe', dests: ['Nepras_Setup_1.3.2.exe', 'Nepras_Setup_v1.3.2.exe'] }
];

for (const item of exeFiles) {
  const srcPath = path.join(releaseDir, item.src);
  if (fs.existsSync(srcPath)) {
    for (const d of item.dests) {
      const destPath = path.join(outDir, d);
      fs.copyFileSync(srcPath, destPath);
      console.log(`Copied ${item.src} -> ${d}`);
    }
  } else {
    console.warn(`Source not found: ${srcPath}`);
  }
}

console.log('\n=== 5. Creating fresh .zip archives ===');
const extDir = path.join(outDir, 'Nepras_v1.3.2_Extension');
const extZip = path.join(outDir, 'Nepras_v1.3.2_Extension.zip');
execSync(`tar -a -cf "${extZip}" -C "${extDir}" .`, { stdio: 'inherit' });
console.log('✅ Created fresh Nepras_v1.3.2_Extension.zip');

const portableDir = path.join(outDir, 'Nepras_Desktop_v1.3.2_Portable');
const portableZip = path.join(outDir, 'Nepras_Desktop_v1.3.2_Portable.zip');
execSync(`tar -a -cf "${portableZip}" -C "${portableDir}" .`, { stdio: 'inherit' });
console.log('✅ Created fresh Nepras_Desktop_v1.3.2_Portable.zip');

console.log('\n=== 6. Final Status of النسخ_التنفيذية_المكتملة ===');
const outFiles = fs.readdirSync(outDir);
outFiles.forEach(f => {
  const p = path.join(outDir, f);
  const s = fs.statSync(p);
  if (!s.isDirectory() && (f.endsWith('.exe') || f.endsWith('.zip'))) {
    console.log(`${f} | ${(s.size / 1024 / 1024).toFixed(2)} MB | ${s.mtime.toLocaleTimeString('ar-EG')}`);
  }
});

console.log('\n🎉 ALL FINAL PACKAGES REBUILT AND READY FOR GITHUB RELEASE!');
