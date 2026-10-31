const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const mzPopup = path.join(root, '_ref_extensions/MZ/popup.js');
const text = fs.readFileSync(mzPopup, 'utf8');

const idx = text.indexOf('excludeReport');
console.log('--- Context of excludeReport ---');
console.log(text.slice(idx - 200, idx + 3500));
