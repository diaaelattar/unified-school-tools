const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');

const p1 = path.join(root, 'Nepras_v1.3.1/popup.js');
const p2 = path.join(root, 'Nepras_apps/extension/popup.js');

const text1 = fs.readFileSync(p1, 'utf8');
const text2 = fs.readFileSync(p2, 'utf8');

function findHandlers(text, term) {
  const lines = text.split('\n');
  const results = [];
  lines.forEach((l, i) => {
    if (l.includes(term)) {
      results.push({ line: i + 1, snippet: lines.slice(Math.max(0, i - 2), Math.min(lines.length, i + 8)).join('\n') });
    }
  });
  return results;
}

console.log('=== POPUP.JS: EXPENSES (المصروفات) in v1.3.1 ===');
const exp1 = findHandlers(text1, 'START_EXPENSES');
exp1.forEach(e => console.log(`Line ${e.line}:\n${e.snippet}\n---`));

console.log('\n=== POPUP.JS: EXPENSES (المصروفات) in Nepras_apps ===');
const exp2 = findHandlers(text2, 'START_EXPENSES');
exp2.forEach(e => console.log(`Line ${e.line}:\n${e.snippet}\n---`));

console.log('\n=== POPUP.JS: SCHOOL STATS (الإحصاء) in v1.3.1 ===');
const st1 = findHandlers(text1, 'START_SCHOOL_STATS');
st1.forEach(e => console.log(`Line ${e.line}:\n${e.snippet}\n---`));

console.log('\n=== POPUP.JS: SCHOOL STATS (الإحصاء) in Nepras_apps ===');
const st2 = findHandlers(text2, 'START_SCHOOL_STATS');
st2.forEach(e => console.log(`Line ${e.line}:\n${e.snippet}\n---`));
