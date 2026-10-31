const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');

function searchPhrase(dir, phrase) {
  console.log(`\n=== SEARCHING FOR "${phrase}" IN ${path.basename(dir)} ===`);
  if (!fs.existsSync(dir)) return;
  
  function walk(current) {
    for (const item of fs.readdirSync(current, { withFileTypes: true })) {
      const p = path.join(current, item.name);
      if (item.isDirectory()) {
        if (!['node_modules', '.git'].includes(item.name)) walk(p);
      } else if (item.name.endsWith('.js') || item.name.endsWith('.html')) {
        const text = fs.readFileSync(p, 'utf8');
        if (text.includes(phrase)) {
          console.log(`Found in: ${path.relative(root, p)}`);
          const lines = text.split('\n');
          lines.forEach((l, i) => {
            if (l.includes(phrase)) {
              console.log(`  Line ${i + 1}: ${l.trim().slice(0, 140)}`);
            }
          });
        }
      }
    }
  }
  walk(dir);
}

searchPhrase(path.join(root, 'Nepras_v1.3.1'), 'تحليل المصروفات');
searchPhrase(path.join(root, 'Nepras_v1.2.97_source'), 'تحليل المصروفات');
searchPhrase(path.join(root, 'Nepras_v1.2.97'), 'تحليل المصروفات');
searchPhrase(path.join(root, '_ref_extensions'), 'تحليل المصروفات');

searchPhrase(path.join(root, 'Nepras_v1.3.1'), 'إحصاء المدرسة');
searchPhrase(path.join(root, 'Nepras_v1.2.97_source'), 'إحصاء المدرسة');
searchPhrase(path.join(root, 'Nepras_v1.2.97'), 'إحصاء المدرسة');
searchPhrase(path.join(root, '_ref_extensions'), 'إحصاء المدرسة');
