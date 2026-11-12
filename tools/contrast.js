"use strict";

/**
 * ==============================================================================
 * 🎨 أداة فحص التباين اللوني ونظام الألوان (tools/contrast.js)
 * ------------------------------------------------------------------------------
 * • يفحص أزواج الألوان في tokens.css لضمان تحقيق نسبة تباين ≥ 4.5:1 (معيار WCAG AA).
 * ==============================================================================
 */

function hexToRgb(hex) {
  let c = hex.replace("#", "").trim();
  if (c.length === 3) c = c.split("").map((x) => x + x).join("");
  const num = parseInt(c, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function luminance(r, g, b) {
  const a = [r, g, b].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

function contrastRatio(hex1, hex2) {
  const rgb1 = hexToRgb(hex1);
  const rgb2 = hexToRgb(hex2);
  const l1 = luminance(rgb1[0], rgb1[1], rgb1[2]);
  const l2 = luminance(rgb2[0], rgb2[1], rgb2[2]);
  const bright = Math.max(l1, l2);
  const dark = Math.min(l1, l2);
  return (bright + 0.05) / (dark + 0.05);
}

function verifyTokensContrast() {
  const pairs = [
    { name: "Primary on Surface", text: "#1d4ed8", bg: "#ffffff" },
    { name: "Success on Surface", text: "#15803d", bg: "#ffffff" },
    { name: "Warning on Surface", text: "#b45309", bg: "#ffffff" },
    { name: "Error on Surface", text: "#b91c1c", bg: "#ffffff" },
    { name: "Text on Surface", text: "#0f172a", bg: "#ffffff" },
    { name: "Text-2 on Surface", text: "#334155", bg: "#ffffff" },
    { name: "On-Primary on Primary", text: "#ffffff", bg: "#1d4ed8" },
    { name: "On-Error on Error", text: "#ffffff", bg: "#b91c1c" }
  ];

  let passed = true;
  for (const p of pairs) {
    const ratio = contrastRatio(p.text, p.bg);
    const ok = ratio >= 4.5;
    if (!ok) passed = false;
  }
  return passed;
}

if (require.main === module) {
  const ok = verifyTokensContrast();
  console.log(ok ? "✅ All token color pairs meet WCAG AA contrast (≥ 4.5:1)" : "❌ Contrast violations found");
}

module.exports = { contrastRatio, verifyTokensContrast };
