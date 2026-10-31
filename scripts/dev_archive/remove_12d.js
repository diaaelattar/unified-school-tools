'use strict';
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

// 1. Clean popup.html
const popupHtmlPath = path.join(root, 'extension', 'popup.html');
let popupHtml = fs.readFileSync(popupHtmlPath, 'utf8');

// Remove prep-12d section
popupHtml = popupHtml.replace(/<section class="n-section prep-12d-card"[\s\S]*?<\/section>\s*<div style="display:none !important;" hidden>\s*<button id="btn-toggle-prep-12d"[\s\S]*?<\/div>/g, '');
popupHtml = popupHtml.replace(/\s*<script src="modules\/prep_12d\.js"><\/script>/g, '');
fs.writeFileSync(popupHtmlPath, popupHtml, 'utf8');
console.log('✓ Cleaned popup.html');

// 2. Clean popup.js
const popupJsPath = path.join(root, 'extension', 'popup.js');
let popupJs = fs.readFileSync(popupJsPath, 'utf8');
popupJs = popupJs.replace(/\/\/\s*={10,}\s*\n\s*\/\/\s*🎓\s*استمارة الشهادة الإعدادية وكشف 12 د[\s\S]*?neprasInitPrep12DUI\(\);\s*\n/g, '');
fs.writeFileSync(popupJsPath, popupJs, 'utf8');
console.log('✓ Cleaned popup.js');

// 3. Clean background.js
const bgPath = path.join(root, 'extension', 'background.js');
let bg = fs.readFileSync(bgPath, 'utf8');
bg = bg.replace(/\s*'modules\/prep_12d\.js',?\s*\/\/[^\n]*/g, '');
fs.writeFileSync(bgPath, bg, 'utf8');
console.log('✓ Cleaned background.js');

// 4. Clean content.js
const contentPath = path.join(root, 'extension', 'content.js');
let content = fs.readFileSync(contentPath, 'utf8');
// remove handlers
content = content.replace(/if\s*\(request\.action === "NEPRAS_PREP_12D_SCRAPE"\)\s*\{[\s\S]*?return true;\s*\}/g, '');
content = content.replace(/if\s*\(request\.action === "NEPRAS_PREP_12D_REVEAL"\)\s*\{[\s\S]*?return true;\s*\}/g, '');
content = content.replace(/function neprasEnsurePrep12DWidget\(\)\s*\{[\s\S]*?function neprasSchedulePrep12DWidget\(\)\s*\{[\s\S]*?neprasSchedulePrep12DWidget\(\);\s*\}\);/g, '');
fs.writeFileSync(contentPath, content, 'utf8');
console.log('✓ Cleaned content.js');

// 5. Move module and test to dev_archive
const archiveDir = path.join(root, 'scripts', 'dev_archive');
if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true });

const mod12d = path.join(root, 'extension', 'modules', 'prep_12d.js');
if (fs.existsSync(mod12d)) {
  fs.renameSync(mod12d, path.join(archiveDir, 'prep_12d.js'));
  console.log('✓ Archived prep_12d.js');
}

const test12d = path.join(root, 'extension', 'tests', 'test_prep_12d.js');
if (fs.existsSync(test12d)) {
  fs.renameSync(test12d, path.join(archiveDir, 'test_prep_12d.js'));
  console.log('✓ Archived test_prep_12d.js');
}

console.log('=== Removal of 12-D Complete! ===');
