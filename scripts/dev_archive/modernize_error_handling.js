'use strict';
const fs = require('fs');
const path = require('path');

const files = [
  path.join(__dirname, '..', 'extension', 'popup.js'),
  path.join(__dirname, '..', 'extension', 'content.js'),
  path.join(__dirname, '..', 'extension', 'background.js'),
  path.join(__dirname, '..', 'desktop', 'src', 'main.js')
];

let totalReplaced = 0;

for (const f of files) {
  if (!fs.existsSync(f)) continue;
  let code = fs.readFileSync(f, 'utf8');
  const beforeCount = (code.match(/catch\s*\(\s*_\s*\)\s*\{\s*\}/g) || []).length;
  
  // Replace silent catch with warning log
  code = code.replace(/catch\s*\(\s*_\s*\)\s*\{\s*\}/g, 'catch (err) { console.warn("[Nepras Handled]", err?.message || err); }');
  
  fs.writeFileSync(f, code, 'utf8');
  console.log(`✓ ${path.basename(f)}: Replaced ${beforeCount} silent catch blocks.`);
  totalReplaced += beforeCount;
}

console.log(`=== Total Silent Catches Eliminated: ${totalReplaced} ===`);
