'use strict';
const fs = require('fs');
const content = fs.readFileSync('Nepras_apps/extension/student-cards.html', 'utf8');

const p = content.indexOf("async function ingestFile");
console.log('ingestFile at:', p);
if (p !== -1) {
  console.log(content.slice(p, p + 1800));
}
