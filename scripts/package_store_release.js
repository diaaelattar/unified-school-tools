const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '../..');
const extDir = path.join(root, 'Nepras_apps/extension');
const stagingDir = path.join(root, 'Nepras_apps/dist/store_extension');
const outDir = path.join(root, 'النسخ_التنفيذية_المكتملة');

console.log('=== 1. Preparing clean store extension staging ===');
if (fs.existsSync(stagingDir)) {
  fs.rmSync(stagingDir, { recursive: true, force: true });
}
fs.mkdirSync(stagingDir, { recursive: true });

// Copy all items except tests and hidden files
const IGNORED = new Set(['tests', '.git', '.github', '.DS_Store', 'node_modules']);

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (IGNORED.has(path.basename(src))) return;
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const item of fs.readdirSync(src)) {
      copyRecursive(path.join(src, item), path.join(dest, item));
    }
  } else {
    if (path.basename(src).startsWith('.')) return;
    fs.copyFileSync(src, dest);
  }
}

for (const item of fs.readdirSync(extDir)) {
  if (IGNORED.has(item)) continue;
  copyRecursive(path.join(extDir, item), path.join(stagingDir, item));
}

console.log('=== 2. Validating staging manifest.json ===');
const manifestPath = path.join(stagingDir, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

// Sanitize permissions
manifest.permissions = manifest.permissions.filter(p => p !== 'downloads.open');
manifest.version = '1.3.4';
manifest.version_name = '1.3.4';
manifest.minimum_chrome_version = '102';

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 4), 'utf8');
console.log('Manifest validated: version', manifest.version, 'permissions:', manifest.permissions.join(', '));

// Also sync back to extension dir
fs.writeFileSync(path.join(extDir, 'manifest.json'), JSON.stringify(manifest, null, 4), 'utf8');

console.log('=== 3. Packaging ZIPs with Compress-Archive (clean root, no ./) ===');
const zipNames = [
  'Nepras_Edge_Extension_v1.3.4.zip',
  'Nepras_v1.3.4_Extension.zip',
  'Nepras_Edge_Extension_v1.3.3.zip',
  'Nepras_v1.3.3_Extension.zip',
  'Nepras_Edge_Extension_v1.3.2.zip',
  'Nepras_v1.3.2_Extension.zip'
];

for (const z of zipNames) {
  const destZip = path.join(outDir, z);
  if (fs.existsSync(destZip)) fs.unlinkSync(destZip);

  // Use PowerShell Compress-Archive targeting stagingDir/*
  const psCmd = `powershell -NoProfile -Command "Compress-Archive -Path '${stagingDir}\\*' -DestinationPath '${destZip}' -Force"`;
  execSync(psCmd, { stdio: 'inherit' });
  const sz = (fs.statSync(destZip).size / 1024 / 1024).toFixed(2);
  console.log(`✅ Packed ${z} (${sz} MB)`);
}

console.log('=== 4. Verifying ZIP contents ===');
const checkZip = path.join(outDir, 'Nepras_Edge_Extension_v1.3.4.zip');
const listing = execSync(`tar -tf "${checkZip}"`, { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);

console.log('Total entries:', listing.length);
console.log('Has manifest.json at root?', listing.includes('manifest.json'));
console.log('Has any ./ prefix?', listing.some(e => e.startsWith('./')));
console.log('Has tests/ folder?', listing.some(e => e.startsWith('tests')));
console.log('Sample top-level entries:', listing.slice(0, 15));

if (!listing.includes('manifest.json') || listing.some(e => e.startsWith('./')) || listing.some(e => e.startsWith('tests'))) {
  throw new Error('ZIP verification failed!');
}

console.log('\n🎉 ALL STORE PACKAGES CREATED AND VERIFIED SUCCESSFULLY!');
