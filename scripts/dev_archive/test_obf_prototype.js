const fs = require('fs');
const path = require('path');

// Test string encoding and decoding logic
function testEncoder() {
  const sampleCode = `
    const message = "نبراس لإدارة الحكومة الإلكترونية";
    const expiry = 1818795599000;
    function greet(name) {
      return message + " - " + name + " - " + expiry;
    }
    console.log(greet("مصر"));
  `;

  // Custom String Array Obfuscation
  const strings = [];
  const stringMap = new Map();

  function encodeString(str) {
    if (!stringMap.has(str)) {
      stringMap.set(str, strings.length);
      strings.push(Buffer.from(str, 'utf8').toString('base64'));
    }
    return stringMap.get(str);
  }

  // Replace string literals with decode calls
  const transformed = sampleCode.replace(/"([^"\\]*(\\.[^"\\]*)*)"|'([^'\\]*(\\.[^'\\]*)*)'/g, (match, s1, _, s2) => {
    const val = s1 !== undefined ? s1 : s2;
    const idx = encodeString(val);
    return `_0xdec(${idx})`;
  });

  const decoderRuntime = `
    const _0xtbl = ${JSON.stringify(strings)};
    function _0xdec(idx) {
      const raw = _0xtbl[idx];
      return typeof Buffer !== 'undefined' 
        ? Buffer.from(raw, 'base64').toString('utf8')
        : decodeURIComponent(escape(atob(raw)));
    }
  `;

  const finalCode = decoderRuntime + '\n' + transformed;
  console.log('--- Obfuscated Output Sample ---');
  console.log(finalCode);

  eval(finalCode);
}

testEncoder();
