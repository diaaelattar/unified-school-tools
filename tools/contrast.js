#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const tokensPath = path.join(__dirname, "..", "extension", "ui", "tokens.css");
const css = fs.readFileSync(tokensPath, "utf8");

function extractVars(block) {
  const vars = {};
  const re = /(--[a-z0-9-]+)\s*:\s*([^;]+);/gi;
  let m;
  while ((m = re.exec(block)) !== null) {
    vars[m[1].trim()] = m[2].trim();
  }
  return vars;
}

const lightMatch = css.match(/:root\s*,\s*:host\s*\{([\s\S]*?)\n\}/);
const darkMatch = css.match(/\.theme-dark\s*,\s*:host\(\[data-theme="dark"\]\)\s*\{([\s\S]*?)\n\}/);

if (!lightMatch || !darkMatch) {
  console.error("Failed to parse light/dark token blocks in tokens.css");
  process.exit(1);
}

const lightVars = extractVars(lightMatch[1]);
const darkVars = { ...lightVars, ...extractVars(darkMatch[1]) };

function parseHex(hex) {
  const clean = String(hex || "").trim().replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(clean)) return null;
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16)
  ];
}

function relLuminance([r, g, b]) {
  const toLin = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
}

function contrastRatio(fgHex, bgHex) {
  const fg = parseHex(fgHex);
  const bg = parseHex(bgHex);
  if (!fg || !bg) return null;
  const l1 = relLuminance(fg);
  const l2 = relLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

const PAIRS = [
  ["--n-text", "--n-bg"],
  ["--n-text", "--n-surface"],
  ["--n-text", "--n-surface-2"],
  ["--n-text-2", "--n-surface"],
  ["--n-text-muted", "--n-surface"],
  ["--n-text-muted", "--n-bg"],
  ["--n-on-primary", "--n-primary"],
  ["--n-primary", "--n-primary-soft"],
  ["--n-on-error", "--n-error"],
  ["--n-success", "--n-success-soft"],
  ["--n-warning", "--n-warning-soft"],
  ["--n-error", "--n-error-soft"],
  ["--n-info", "--n-info-soft"]
];

let failed = 0;
for (const [themeName, vars] of [["light", lightVars], ["dark", darkVars]]) {
  for (const [fg, bg] of PAIRS) {
    const ratio = contrastRatio(vars[fg], vars[bg]);
    if (ratio === null || ratio < 4.5) {
      console.error(`FAIL [${themeName}] ${fg} (${vars[fg]}) on ${bg} (${vars[bg]}): ${ratio ? ratio.toFixed(2) : "invalid"}`);
      failed++;
    }
  }
}

if (failed > 0) {
  process.exit(1);
}
console.log(`OK: All ${PAIRS.length * 2} light/dark token pairs pass WCAG AA (>= 4.5:1).`);
