const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const dir = path.join(root, '_ref_extensions/Al-Mosamem');

if (fs.existsSync(dir)) {
  const files = fs.readdirSync(dir);
  console.log('Al-Mosamem files:', files);
  files.forEach(f => {
    if (f.endsWith('.js')) {
      const text = fs.readFileSync(path.join(dir, f), 'utf8');
      const urls = text.match(/https?:\/\/[^\s"'`)]+|\/[a-zA-Z0-9_\-\/]+/g) || [];
      const emisUrls = urls.filter(u => u.includes('emis') || u.startsWith('/'));
      console.log(`EMIS URLs in ${f}:`, [...new Set(emisUrls)]);
    }
  });
}
