const fs = require('fs');

const js = fs.readFileSync('_ref_extensions/MZ/popup.js', 'utf8');

const reportIdx = js.indexOf('/expenses/report');
if (reportIdx !== -1) {
  const start = reportIdx + 2400;
  const end = Math.min(js.length, start + 2500);
  console.log('=== MZ EXPENSES/REPORT PART 2 ===');
  console.log(js.substring(start, end));
}
