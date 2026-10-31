const fs = require('fs');

function tokenizeAndObfuscate(code) {
  let i = 0;
  const len = code.length;
  let out = "";
  const stringTable = [];
  const stringIndexMap = new Map();
  const XOR_KEY = 0x5a;

  function xorEncode(str) {
    const buf = Buffer.from(str, "utf8");
    const encoded = Buffer.alloc(buf.length);
    for (let j = 0; j < buf.length; j++) {
      encoded[j] = buf[j] ^ XOR_KEY;
    }
    return encoded.toString("base64");
  }

  function registerString(s) {
    if (stringIndexMap.has(s)) return stringIndexMap.get(s);
    const idx = stringTable.length;
    stringIndexMap.set(s, idx);
    stringTable.push(xorEncode(s));
    return idx;
  }

  // Tokens that can precede a RegExp literal (vs division operator)
  const regexPrecedingTokens = new Set([
    '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '=>', 'return', 'typeof', 'throw', 'case', 'delete', 'in', 'instanceof'
  ]);

  let lastSignificantToken = "";

  while (i < len) {
    const c = code[i];

    // Single-line comment
    if (c === '/' && code[i + 1] === '/') {
      const start = i;
      i += 2;
      while (i < len && code[i] !== '\n') i++;
      // Strip comment
      out += " ";
      continue;
    }

    // Multi-line comment
    if (c === '/' && code[i + 1] === '*') {
      i += 2;
      while (i < len && !(code[i] === '*' && code[i + 1] === '/')) i++;
      i += 2;
      // Strip comment
      out += " ";
      continue;
    }

    // RegExp literal vs division
    if (c === '/') {
      const isRegex = regexPrecedingTokens.has(lastSignificantToken) || lastSignificantToken === "";
      if (isRegex) {
        // Parse regex literal
        const start = i;
        i++; // skip /
        let inClass = false;
        while (i < len) {
          if (code[i] === '\\') {
            i += 2;
            continue;
          }
          if (code[i] === '[') inClass = true;
          else if (code[i] === ']') inClass = false;
          else if (code[i] === '/' && !inClass) {
            i++; // skip closing /
            break;
          }
          i++;
        }
        // flags
        while (i < len && /[a-z]/i.test(code[i])) i++;
        const regexStr = code.slice(start, i);
        out += regexStr;
        lastSignificantToken = "/";
        continue;
      }
    }

    // String literals: "..." or '...'
    if (c === '"' || c === "'") {
      const quote = c;
      const start = i;
      i++;
      let strVal = "";
      let valid = true;
      while (i < len && code[i] !== quote) {
        if (code[i] === '\\') {
          strVal += code[i] + (code[i + 1] || '');
          i += 2;
        } else if (code[i] === '\n' || code[i] === '\r') {
          valid = false;
          break;
        } else {
          strVal += code[i];
          i++;
        }
      }
      i++; // skip quote

      const rawContent = strVal;
      // Don't encode 'use strict'
      if (!valid || rawContent === "use strict" || rawContent.length < 3 || rawContent.includes("\\x") || rawContent.includes("\\u")) {
        out += code.slice(start, i);
      } else {
        try {
          const unescaped = rawContent
            .replace(/\\n/g, "\n")
            .replace(/\\r/g, "\r")
            .replace(/\\t/g, "\t")
            .replace(/\\"/g, '"')
            .replace(/\\'/g, "'")
            .replace(/\\\\/g, "\\");
          const idx = registerString(unescaped);
          out += `_0xnp(${idx})`;
        } catch (_) {
          out += code.slice(start, i);
        }
      }
      lastSignificantToken = "string";
      continue;
    }

    // Other chars
    out += c;
    if (!/\s/.test(c)) {
      if (/[a-zA-Z0-9_$]/.test(c)) {
        let word = c;
        while (i + 1 < len && /[a-zA-Z0-9_$]/.test(code[i + 1])) {
          word += code[++i];
          out += code[i];
        }
        lastSignificantToken = word;
      } else {
        lastSignificantToken = c;
      }
    }
    i++;
  }

  // Replace timestamps
  out = out.replace(/\b1818795599000\b/g, "(0x1a778aa6498)");
  out = out.replace(/\b1817931599000\b/g, "(0x1a7452acc98)");

  const runtimeHeader = `
var __NEPRAS_PROTECTED_BUNDLE__ = true;
var _0xst = ${JSON.stringify(stringTable)};
var _0xsc = {};
function _0xnp(idx) {
  if (_0xsc[idx] !== undefined) return _0xsc[idx];
  var raw = _0xst[idx];
  if (!raw) return "";
  var bin = typeof atob === "function" ? atob(raw) : Buffer.from(raw, "base64").toString("binary");
  var bytes = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i) ^ 0x5a;
  }
  var dec = typeof TextDecoder !== "undefined"
    ? new TextDecoder("utf-8").decode(bytes)
    : decodeURIComponent(escape(String.fromCharCode.apply(null, bytes)));
  _0xsc[idx] = dec;
  return dec;
}
`;

  return runtimeHeader + "\n" + out;
}

// Test with the escapeHtml regex that previously broke:
const codeWithRegex = `
  function escapeHtml(str) {
    return String(str || "").replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
  }
  console.log(escapeHtml("<hello 'world'> & \\"test\\""));
`;

const result = tokenizeAndObfuscate(codeWithRegex);
console.log('Obfuscated Code:\n', result);
eval(result);
console.log('REGEX TEST PASSED WITHOUT SYNTAX ERROR!');
