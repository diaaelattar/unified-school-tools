const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const mzPopup = path.join(root, '_ref_extensions/MZ/popup.js');
const text = fs.readFileSync(mzPopup, 'utf8');

// Find all paths starting with /
const m = text.match(/['"]\/[a-zA-Z0-9_\-\/]+['"]/g) || [];
console.log('Paths starting with / in MZ:');
[...new Set(m)].forEach(p => console.log('  ', p));
