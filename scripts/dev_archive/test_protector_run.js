const assert = require('assert');
const protector = require('./nepras_code_protector.js');

const sample = `
const title = "نبراس لإدارة الحكومة الإلكترونية";
const targetDate = 1818795599000;
const warnDate = 1817931599000;
function getInfo() {
  return title + " : " + targetDate + " : " + warnDate;
}
`;

const protectedCode = protector.obfuscateSource(sample);
eval(protectedCode);
const result = getInfo();
console.log('Result:', result);
assert.strictEqual(result, "نبراس لإدارة الحكومة الإلكترونية : 1818795599000 : 1817931599000");
console.log('PROTECTOR TEST PASSED 100%!');
