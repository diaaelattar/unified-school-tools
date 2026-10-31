const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');

// Let's check which folders in root contain expenses or stats
const candidates = [
  'Nepras_v1.3.1',
  'Nepras_v1.3.1_patched',
  'Nepras_v1.3.0',
  'Nepras_v1.2.97',
  'Nepras_v1.2.97_source',
  '_ref_extensions',
  'my-extension-improved-v4'
];

for (const c of candidates) {
  const p = path.join(root, c);
  if (!fs.existsSync(p)) continue;
  console.log(`\n================ Folder: ${c} ================`);
  
  // check modules
  const modDir = path.join(p, 'modules');
  if (fs.existsSync(modDir)) {
    const modFiles = fs.readdirSync(modDir);
    console.log('Modules in', c, ':', modFiles);
  } else {
    // maybe files in root of extension
    const rootFiles = fs.readdirSync(p).filter(f => f.endsWith('.js'));
    console.log('JS files in root of', c, ':', rootFiles);
  }
}
