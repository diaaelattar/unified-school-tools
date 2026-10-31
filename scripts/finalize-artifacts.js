const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const baseDir = 'd:\\نبراس_لأدارة_الحكومة_الإلكترونية';
const outDir = path.join(baseDir, 'النسخ_التنفيذية_المكتملة');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const files = [
  {
    src: path.join(baseDir, 'Nepras_apps', 'release', 'desktop', 'Nepras_Portable_1.3.1.exe'),
    dest: path.join(outDir, 'Nepras_Portable_v1.3.1.exe')
  },
  {
    src: path.join(baseDir, 'Nepras_apps', 'release', 'desktop', 'Nepras_Setup_1.3.1.exe'),
    dest: path.join(outDir, 'Nepras_Setup_v1.3.1.exe')
  },
  {
    src: path.join(baseDir, 'Nepras_apps', 'mobile', 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk'),
    dest: path.join(outDir, 'Nepras_v1.3.1.apk')
  }
];

const results = [];

for (const f of files) {
  if (fs.existsSync(f.src)) {
    fs.copyFileSync(f.src, f.dest);
    const buf = fs.readFileSync(f.dest);
    const hash = crypto.createHash('sha256').update(buf).digest('hex');
    const stat = fs.statSync(f.dest);
    results.push({
      file: path.basename(f.dest),
      sizeMB: (stat.size / (1024 * 1024)).toFixed(2) + ' MB',
      sha256: hash
    });
  } else {
    results.push({
      file: path.basename(f.dest),
      error: 'Source not found: ' + f.src
    });
  }
}

console.log(JSON.stringify(results, null, 2));
