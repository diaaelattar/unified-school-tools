const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');

function scanUrls(dir, name) {
  console.log(`\n================ SCANNING: ${name} ================`);
  if (!fs.existsSync(dir)) { console.log('Directory does not exist'); return; }

  function walk(current) {
    for (const item of fs.readdirSync(current, { withFileTypes: true })) {
      const p = path.join(current, item.name);
      if (item.isDirectory()) {
        if (!['node_modules', '.git'].includes(item.name)) walk(p);
      } else if (item.name.endsWith('.js') || item.name.endsWith('.html') || item.name.endsWith('.json')) {
        const text = fs.readFileSync(p, 'utf8');
        const lines = text.split('\n');
        lines.forEach((line, idx) => {
          if (line.match(/https?:\/\/[a-z0-9\-.]*emis\.gov\.eg[^\s"'`)]*/i)) {
            const matches = line.match(/https?:\/\/[a-z0-9\-.]*emis\.gov\.eg[^\s"'`)]*/gi);
            matches.forEach(m => {
              if (line.includes('مصروف') || line.includes('احصاء') || line.includes('إحصاء') || line.includes('تقرير') || line.includes('stats') || line.includes('expenses') || line.includes('navigate') || line.includes('targetUrl')) {
                console.log(`[${path.relative(root, p)}:${idx + 1}] -> ${m}`);
                console.log('   Line context:', line.trim().slice(0, 150));
              }
            });
          }
        });
      }
    }
  }
  walk(dir);
}

scanUrls(path.join(root, '_ref_extensions/MZ'), 'MZ');
scanUrls(path.join(root, '_ref_extensions/Al-Mosamem'), 'Al-Mosamem');
scanUrls(path.join(root, '_ref_extensions/Freid'), 'Freid');
scanUrls(path.join(root, 'my-extension-improved-v4'), 'my-extension-improved-v4');
scanUrls(path.join(root, 'Nepras_v1.2.97'), 'Nepras_v1.2.97');
scanUrls(path.join(root, 'Nepras_v1.3.1'), 'Nepras_v1.3.1');
