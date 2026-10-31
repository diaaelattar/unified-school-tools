const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'Nepras_apps/extension/popup.html'), 'utf8');

const lines = html.split('\n');
console.log('=== POPUP.HTML BUTTONS AND SECTIONS FOR EXPENSES & STATS ===');
lines.forEach((l, i) => {
  if (l.includes('مصروف') || l.includes('إحصاء') || l.includes('احصاء') || l.includes('stats') || l.includes('expenses')) {
    console.log(`Line ${i + 1}: ${l.trim()}`);
  }
});
