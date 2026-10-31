const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const mzPopup = path.join(root, '_ref_extensions/MZ/popup.js');
const text = fs.readFileSync(mzPopup, 'utf8');

// Find all occurrences of URL navigations or report pages in MZ
const regex = /https:\/\/student\.emis\.gov\.eg\/[a-zA-Z0-9_\-\/]+/g;
const urls = [...new Set(text.match(regex))];
console.log('All student.emis.gov.eg URLs in MZ:');
urls.forEach(u => console.log('  ', u));
