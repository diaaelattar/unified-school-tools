const fs = require('fs');

function analyzeStatsFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, 'utf8');
  console.log('\n======================================');
  console.log('FILE:', filePath);
  console.log('Size:', content.length);
  
  // Find main collection entry point
  const lines = content.split('\n');
  lines.forEach((l, i) => {
    if (l.includes('START_SCHOOL_STATS') || l.includes('neprasCollectSchoolStats') || l.includes('freidCollectSchoolStats') || l.includes('AggregateFromRows')) {
      console.log(`  L${i+1}: ${l.trim().substring(0, 100)}`);
    }
  });
}

analyzeStatsFile('Nepras_v1.2.97/modules/school_stats.js');
analyzeStatsFile('Nepras_v1.3.1/modules/school_stats.js');
analyzeStatsFile('_ref_extensions/Freid/modules/school_stats.js');
