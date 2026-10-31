const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const mzPopup = path.join(root, '_ref_extensions/MZ/popup.js');
const text = fs.readFileSync(mzPopup, 'utf8');

const idx = text.indexOf('excludeReport');
if (idx !== -1) {
  console.log('Context around excludeReport in MZ/popup.js:');
  console.log(text.slice(Math.max(0, idx - 400), Math.min(text.length, idx + 600)));
} else {
  console.log('excludeReport not found');
}
