const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
console.log('Root:', root);

function searchInDir(dir, pattern, extFilter = ['.js', '.html']) {
  const matches = [];
  if (!fs.existsSync(dir)) return matches;
  function walk(current) {
    let list;
    try { list = fs.readdirSync(current, { withFileTypes: true }); } catch (_) { return; }
    for (const item of list) {
      if (['node_modules', '.git', 'dist', 'release'].includes(item.name)) continue;
      const full = path.join(current, item.name);
      if (item.isDirectory()) {
        walk(full);
      } else if (item.isFile() && extFilter.some(ext => item.name.endsWith(ext))) {
        try {
          const content = fs.readFileSync(full, 'utf8');
          if (pattern.test(content)) {
            matches.push({
              file: path.relative(root, full).replace(/\\/g, '/'),
              size: content.length
            });
          }
        } catch (_) {}
      }
    }
  }
  walk(dir);
  return matches;
}

console.log('=== SEARCHING FOR EXPENSES (المصروفات) & STATS (الإحصائيات) IN ORIGINAL SOURCES ===');

const originalDirs = [
  path.join(root, 'Nepras_v1.3.1'),
  path.join(root, 'Nepras_v1.3.1_patched'),
  path.join(root, 'Nepras_v1.3.0'),
  path.join(root, 'Nepras_v1.2.97_source'),
  path.join(root, 'Nepras_v1.2.97'),
  path.join(root, '_ref_extensions')
];

for (const d of originalDirs) {
  const name = path.basename(d);
  if (!fs.existsSync(d)) {
    console.log(`Directory does not exist: ${name}`);
    continue;
  }
  console.log(`\nScanning: ${name}`);
  
  const expensesMatches = searchInDir(d, /مصروف|expenses/i);
  console.log(`  Expenses matches (${expensesMatches.length}):`, expensesMatches.map(m => m.file));
  
  const statsMatches = searchInDir(d, /إحصاء|احصاء|school_stats|stats_dashboard/i);
  console.log(`  Stats matches (${statsMatches.length}):`, statsMatches.map(m => m.file));
}
