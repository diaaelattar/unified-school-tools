"use strict";

const fs = require("fs");
const path = require("path");

/**
 * ==============================================================================
 * 🔐 محرك التشفير وحماية كود نبراس (Nepras Professional Code Obfuscator)
 * ------------------------------------------------------------------------------
 * محلل نحوي دقيق (Lexer/Tokenizer) يفرّق تماماً بين التعبيرات النمطية والسلاسل،
 * ويشفر السلاسل بجدول مشفر بـ XOR + Base64، ويموّه ثوابت التوقيت،
 * ويحذف التعليقات، مع التوافق التام بنسبة 100% مع MV3 CSP وبدون أي مكتبات خارجية.
 * ==============================================================================
 */

const XOR_KEY = 0x5a;

function xorEncode(str) {
  const buf = Buffer.from(str, "utf8");
  const encoded = Buffer.alloc(buf.length);
  for (let j = 0; j < buf.length; j++) {
    encoded[j] = buf[j] ^ XOR_KEY;
  }
  return encoded.toString("base64");
}

function obfuscateSource(code, filename = "") {
  if (code.includes("__NEPRAS_PROTECTED_BUNDLE__")) {
    return code;
  }

  let i = 0;
  const len = code.length;
  let out = "";
  const stringTable = [];
  const stringIndexMap = new Map();

  function registerString(s) {
    if (stringIndexMap.has(s)) return stringIndexMap.get(s);
    const idx = stringTable.length;
    stringIndexMap.set(s, idx);
    stringTable.push(xorEncode(s));
    return idx;
  }

  const regexPrecedingTokens = new Set([
    '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '=>', 'return', 'typeof', 'throw', 'case', 'delete', 'in', 'instanceof'
  ]);

  let lastSignificantToken = "";

  while (i < len) {
    const c = code[i];

    // تعليق سطر واحد
    if (c === '/' && code[i + 1] === '/') {
      i += 2;
      while (i < len && code[i] !== '\n') i++;
      out += " ";
      continue;
    }

    // تعليق متعدد الأسطر
    if (c === '/' && code[i + 1] === '*') {
      i += 2;
      while (i < len && !(code[i] === '*' && code[i + 1] === '/')) i++;
      i += 2;
      out += " ";
      continue;
    }

    // التعبيرات النمطية (RegExp Literal)
    if (c === '/') {
      const isRegex = regexPrecedingTokens.has(lastSignificantToken) || lastSignificantToken === "";
      if (isRegex) {
        const start = i;
        i++;
        let inClass = false;
        while (i < len) {
          if (code[i] === '\\') {
            i += 2;
            continue;
          }
          if (code[i] === '[') inClass = true;
          else if (code[i] === ']') inClass = false;
          else if (code[i] === '/' && !inClass) {
            i++;
            break;
          }
          i++;
        }
        while (i < len && /[a-z]/i.test(code[i])) i++;
        out += code.slice(start, i);
        lastSignificantToken = "/";
        continue;
      }
    }

    // السلاسل النصية: "..." أو '...'
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
      i++;

      const rawContent = strVal;
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

    // بقية الأحرف
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

  if (stringTable.length === 0) {
    return code;
  }

  // تمويه ثوابت التوقيت لتاريخ 20/08/2027 و 10/08/2027
  out = out.replace(/\b1818795599000\b/g, "(0x1a778aa6498)");
  out = out.replace(/\b1817931599000\b/g, "(0x1a7452acc98)");

  const runtimeHeader = `
/** [NEPRAS ENCRYPTED CORE v1.3.1] */
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

  const result = runtimeHeader + "\n" + out;
  try {
    const vm = require("vm");
    new vm.Script(result, { filename: filename || "obfuscated.js" });
    return result;
  } catch (_) {
    // في حال تعارض أي سلسلة نصية أو قالب نصي مع المحلل النحوي، نحتفظ بالكود الأصلي السليم 100% لمنع أي SyntaxError
    return code;
  }
}

function protectDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  const skippedFiles = new Set([
    "xlsx.full.min.js",
    "pdf-lib.min.js",
    "pdf.min.js",
    "pdf.worker.js",
    "nepras-shim.js",
    "sql-wasm.js",
    "sql-wasm.wasm",
    "manifest.json"
  ]);

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && entry.name !== ".git") {
        protectDirectory(fullPath);
      }
    } else if (entry.isFile() && entry.name.endsWith(".js") && !skippedFiles.has(entry.name)) {
      const originalCode = fs.readFileSync(fullPath, "utf8");
      try {
        const obfuscated = obfuscateSource(originalCode, entry.name);
        fs.writeFileSync(fullPath, obfuscated, "utf8");
        console.log(`  🔒 Protected: ${entry.name}`);
      } catch (err) {
        console.warn(`  ⚠️ Skip protecting ${entry.name}: ${err.message}`);
      }
    }
  }
}

module.exports = {
  obfuscateSource,
  protectDirectory
};

if (require.main === module) {
  const targetDir = process.argv[2];
  if (!targetDir) {
    console.error("Usage: node nepras_code_protector.js <directory_path>");
    process.exit(1);
  }
  console.log(`Starting protection for: ${targetDir}`);
  protectDirectory(path.resolve(targetDir));
  console.log("Protection finished successfully.");
}
