const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const dir = path.join(root, '_ref_extensions/Al-Mosamem');

['core.js', 'students.js'].forEach(file => {
  const p = path.join(dir, file);
  if (!fs.existsSync(p)) return;
  const text = fs.readFileSync(p, 'utf8');
  const lines = text.split('\n');
  console.log(`\n=================== SEARCHING IN ${file} ===================`);
  lines.forEach((l, i) => {
    if (l.includes('excludeReport') || l.includes('execluded') || l.includes('/student/report') || l.includes('مصروف') || l.includes('إحصاء') || l.includes('احصاء')) {
      console.log(`Line ${i + 1}: ${l.slice(0, 150)}`);
      console.log(lines.slice(Math.max(0, i - 2), Math.min(lines.length, i + 15)).join('\n'));
      console.log('---');
    }
  });
});
