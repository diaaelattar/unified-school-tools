'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const outDir = path.resolve(root, '..', 'النسخ_التنفيذية_المكتملة');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

// 1. Copy desktop binaries
const setupSrc = path.join(root, 'release', 'desktop', 'Nepras_Setup_1.3.2.exe');
const setupDest = path.join(outDir, 'Nepras_Setup_v1.3.2.exe');
if (fs.existsSync(setupSrc)) {
  fs.copyFileSync(setupSrc, setupDest);
  console.log('✓ Copied Nepras_Setup_v1.3.2.exe:', (fs.statSync(setupDest).size / (1024 * 1024)).toFixed(2) + ' MB');
}

const portableSrc = path.join(root, 'release', 'desktop', 'Nepras_Portable_1.3.2.exe');
const portableDest = path.join(outDir, 'Nepras_Portable_v1.3.2.exe');
if (fs.existsSync(portableSrc)) {
  fs.copyFileSync(portableSrc, portableDest);
  console.log('✓ Copied Nepras_Portable_v1.3.2.exe:', (fs.statSync(portableDest).size / (1024 * 1024)).toFixed(2) + ' MB');
}

// 2. Sync Extension folder
const extSrc = path.join(root, 'extension');
const extDest = path.join(outDir, 'Nepras_v1.3.2_Extension');
if (fs.existsSync(extDest)) fs.rmSync(extDest, { recursive: true, force: true });
fs.mkdirSync(extDest, { recursive: true });

function copyExt(src, dst) {
  for (const item of fs.readdirSync(src)) {
    if (['tests', '.git', 'node_modules'].includes(item)) continue;
    const s = path.join(src, item);
    const d = path.join(dst, item);
    const stat = fs.statSync(s);
    if (stat.isDirectory()) {
      fs.mkdirSync(d, { recursive: true });
      copyExt(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}
copyExt(extSrc, extDest);
console.log('✓ Synced Nepras_v1.3.2_Extension folder');

// 3. Zip Extension using powershell Compress-Archive
const extZip = path.join(outDir, 'Nepras_v1.3.2_Extension.zip');
if (fs.existsSync(extZip)) fs.rmSync(extZip);

const psCmd = `Compress-Archive -Path "${extDest}\\*" -DestinationPath "${extZip}" -Force`;
const res = spawnSync('powershell', ['-NoProfile', '-Command', psCmd], { encoding: 'utf8' });
if (res.status === 0 && fs.existsSync(extZip)) {
  console.log('✓ Built Nepras_v1.3.2_Extension.zip:', (fs.statSync(extZip).size / (1024 * 1024)).toFixed(2) + ' MB');
} else {
  console.error('Failed to create extension zip:', res.stderr || res.stdout);
}

console.log('=== All Completed Releases Updated! ===');
