const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const dirs = [
  'Nepras_v1.3.1',
  'Nepras_v1.2.97',
  '_ref_extensions/Freid',
  '_ref_extensions/MZ',
  '_ref_extensions/Al-Mosamem',
  'Nepras_apps/extension'
];

dirs.forEach(d => {
  const fullDir = path.join(root, d);
  if (!fs.existsSync(fullDir)) return;
  console.log('\n========================================');
  console.log('DIRECTORY:', d);
  console.log('========================================');

  const files = ['popup.js', 'background.js', 'content.js', 'modules/expenses.js', 'modules/school_stats.js', 'modules/stats_dashboard.js'];
  files.forEach(f => {
    const p = path.join(fullDir, f);
    if (!fs.existsSync(p)) return;
    const txt = fs.readFileSync(p, 'utf8');

    // Look for mentions of expenses, exclude, report, stats, student/list
    const matches = [];
    const lines = txt.split('\n');
    lines.forEach((l, idx) => {
      if (/expenses|excludeReport|bankpaid|GetReport|execluded|student\/list|student\/report|class\/report/i.test(l)) {
        matches.push(`L${idx + 1}: ${l.trim()}`);
      }
    });

    if (matches.length > 0) {
      console.log(`\n--- ${f} (${matches.length} matches) ---`);
      matches.slice(0, 10).forEach(m => console.log('  ', m.substring(0, 120)));
      if (matches.length > 10) {
        console.log(`   ... and ${matches.length - 10} more`);
      }
    }
  });
});
