const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');

function compareFiles(file1, file2, label) {
  console.log(`\n======================================================`);
  console.log(`COMPARING: ${label}`);
  console.log(`File 1: ${file1}`);
  console.log(`File 2: ${file2}`);
  console.log(`======================================================`);

  if (!fs.existsSync(file1)) { console.log('File 1 does not exist!'); return; }
  if (!fs.existsSync(file2)) { console.log('File 2 does not exist!'); return; }

  const text1 = fs.readFileSync(file1, 'utf8');
  const text2 = fs.readFileSync(file2, 'utf8');

  console.log(`File 1 length: ${text1.length} chars, lines: ${text1.split('\n').length}`);
  console.log(`File 2 length: ${text2.length} chars, lines: ${text2.split('\n').length}`);

  if (text1 === text2) {
    console.log('Files are IDENTICAL!');
    return;
  }

  // Find navigation / URLs / page mentions in file 1
  const urls1 = text1.match(/https?:\/\/[^\s"'`]+|location\.[^\s;]+|\/student\/[^\s"'`]+/g) || [];
  const urls2 = text2.match(/https?:\/\/[^\s"'`]+|location\.[^\s;]+|\/student\/[^\s"'`]+/g) || [];

  console.log('URLs/Routes in File 1:', [...new Set(urls1)]);
  console.log('URLs/Routes in File 2:', [...new Set(urls2)]);
}

// 1. expenses.js
compareFiles(
  path.join(root, 'Nepras_v1.3.1/modules/expenses.js'),
  path.join(root, 'Nepras_apps/extension/modules/expenses.js'),
  'expenses.js (v1.3.1 vs Nepras_apps)'
);

// 2. school_stats.js
compareFiles(
  path.join(root, 'Nepras_v1.3.1/modules/school_stats.js'),
  path.join(root, 'Nepras_apps/extension/modules/school_stats.js'),
  'school_stats.js (v1.3.1 vs Nepras_apps)'
);

// 3. stats_dashboard.js
compareFiles(
  path.join(root, 'Nepras_v1.3.1/modules/stats_dashboard.js'),
  path.join(root, 'Nepras_apps/extension/modules/stats_dashboard.js'),
  'stats_dashboard.js (v1.3.1 vs Nepras_apps)'
);

// Also check Nepras_v1.2.97
compareFiles(
  path.join(root, 'Nepras_v1.2.97/modules/expenses.js'),
  path.join(root, 'Nepras_apps/extension/modules/expenses.js'),
  'expenses.js (v1.2.97 vs Nepras_apps)'
);
compareFiles(
  path.join(root, 'Nepras_v1.2.97/modules/school_stats.js'),
  path.join(root, 'Nepras_apps/extension/modules/school_stats.js'),
  'school_stats.js (v1.2.97 vs Nepras_apps)'
);
