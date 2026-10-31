const fs = require('fs');

const html = fs.readFileSync('_ref_extensions/MZ/popup.html', 'utf8');
const titles = html.match(/class="accordion-title"[^>]*>([^<]+)</g) || [];
console.log('MZ Accordion Titles:');
titles.forEach(t => {
  const clean = t.replace(/class="accordion-title"[^>]*>/, '').replace(/<.*$/, '').trim();
  console.log(' - ' + clean);
});
