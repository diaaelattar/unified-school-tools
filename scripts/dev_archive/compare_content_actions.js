const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const c1 = path.join(root, 'Nepras_v1.3.1/content.js');
const c2 = path.join(root, 'Nepras_apps/extension/content.js');

const text1 = fs.readFileSync(c1, 'utf8');
const text2 = fs.readFileSync(c2, 'utf8');

function searchContent(text, label) {
  console.log(`\n=== CONTENT.JS: ${label} ===`);
  const lines = text.split('\n');
  lines.forEach((l, i) => {
    if (l.includes('START_EXPENSES_ANALYSIS') || l.includes('START_SCHOOL_STATS')) {
      console.log(`Line ${i + 1}: ${l.trim()}`);
      console.log(lines.slice(i, i + 25).join('\n'));
      console.log('---');
    }
  });
}

searchContent(text1, 'v1.3.1');
searchContent(text2, 'Nepras_apps');
