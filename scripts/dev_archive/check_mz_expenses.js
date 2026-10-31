const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const mzDir = path.join(root, '_ref_extensions/MZ');

if (fs.existsSync(mzDir)) {
  const files = fs.readdirSync(mzDir).filter(f => f.endsWith('.js'));
  console.log('MZ files:', files);

  files.forEach(f => {
    const text = fs.readFileSync(path.join(mzDir, f), 'utf8');
    const lines = text.split('\n');
    lines.forEach((l, i) => {
      if (l.includes('excludeReport') || l.includes('expenses') || l.includes('مصروفات') || l.includes('إحصاء') || l.includes('احصاء')) {
        console.log(`\n[MZ/${f}:${i + 1}]`);
        console.log(l.slice(0, 300));
      }
    });
  });
}
