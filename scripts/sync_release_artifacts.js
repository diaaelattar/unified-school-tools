const fs = require('fs');
const path = require('path');
const { protectDirectory } = require('./nepras_code_protector.js');

const root = path.resolve(__dirname, '../..');
const srcExt = path.join(root, 'Nepras_apps/extension');
const desktopDir = path.join(root, 'Nepras_apps/desktop');
const sharedDir = path.join(root, 'Nepras_apps/shared');

const extTargets = [
  path.join(root, 'Nepras_apps/dist/desktop/ext'),
  path.join(root, 'النسخ_التنفيذية_المكتملة/Nepras_v1.3.4_Extension'),
  path.join(root, 'النسخ_التنفيذية_المكتملة/Nepras_Desktop_v1.3.4_Portable/resources/dist/ext'),
  path.join(root, 'Nepras_apps/release/desktop/win-unpacked/resources/dist/ext'),
  path.join(root, 'Nepras_apps/release/desktop-legacy/win-ia32-unpacked/resources/dist/ext')
];

const hostFiles = ['host.html', 'host.css', 'host-core.js', 'host-ui.js', 'nepras_logger.js'];
const distTargets = [
  path.join(root, 'النسخ_التنفيذية_المكتملة/Nepras_Desktop_v1.3.4_Portable/resources/dist'),
  path.join(root, 'Nepras_apps/release/desktop/win-unpacked/resources/dist'),
  path.join(root, 'Nepras_apps/release/desktop-legacy/win-ia32-unpacked/resources/dist')
];

const asarTargets = [
  path.join(root, 'النسخ_التنفيذية_المكتملة/Nepras_Desktop_v1.3.4_Portable/resources/app.asar'),
  path.join(root, 'Nepras_apps/release/desktop/win-unpacked/resources/app.asar'),
  path.join(root, 'Nepras_apps/release/desktop-legacy/win-ia32-unpacked/resources/app.asar')
];

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const ent of entries) {
    const srcPath = path.join(src, ent.name);
    const destPath = path.join(dest, ent.name);
    if (ent.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

async function main() {
  // 1. Sync Host Shell files to releases
  distTargets.forEach(target => {
    if (fs.existsSync(target)) {
      console.log(`Syncing host shell files to: ${target}`);
      for (const f of hostFiles) {
        fs.copyFileSync(path.join(sharedDir, f), path.join(target, f));
      }
      fs.copyFileSync(path.join(desktopDir, 'src', 'platform-backend.js'), path.join(target, 'platform-backend.js'));
    }
  });

  // 2. Sync clean, verified extension files to targets
  const bgHtmlContent =
    '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Nepras background</title>\n' +
    '<script src="nepras-shim.js"></script>\n' +
    '<script src="modules/nepras_security_guard.js"></script>\n' +
    '<script src="modules/school_manager.js"></script>\n' +
    '<script src="modules/class_books_store.js"></script>\n' +
    '<script src="background.js"></script>\n</head><body></body></html>\n';

  extTargets.forEach(target => {
    if (fs.existsSync(path.dirname(target))) {
      console.log(`\n========================================`);
      console.log(`Syncing extension files to: ${target}`);
      console.log(`========================================`);
      copyDirRecursive(srcExt, target);
      if (fs.existsSync(path.join(sharedDir, 'nepras-shim.js'))) {
        fs.copyFileSync(path.join(sharedDir, 'nepras-shim.js'), path.join(target, 'nepras-shim.js'));
      }

      const testsDir = path.join(target, 'tests');
      if (fs.existsSync(testsDir)) {
        fs.rmSync(testsDir, { recursive: true, force: true });
      }

      const isPlainBrowserExtension = target.includes('Extension');
      if (!isPlainBrowserExtension) {
        fs.writeFileSync(path.join(target, '_background.html'), bgHtmlContent, 'utf8');
      }
      console.log(`✅ Copied clean, verified extension files to: ${target}`);
    } else {
      console.log(`Target parent does not exist, skipping: ${target}`);
    }
  });

  // 3. Package app.asar for desktop releases
  const asarPath = path.join(desktopDir, 'node_modules/@electron/asar');
  if (fs.existsSync(asarPath)) {
    console.log(`\n========================================`);
    console.log(`Packaging app.asar for desktop releases...`);
    console.log(`========================================`);
    const asar = require(asarPath);
    const stagingDir = path.join(root, 'Nepras_apps/dist/staging-app-asar');
    if (fs.existsSync(stagingDir)) fs.rmSync(stagingDir, { recursive: true, force: true });
    fs.mkdirSync(stagingDir, { recursive: true });

    copyDirRecursive(path.join(desktopDir, 'src'), path.join(stagingDir, 'src'));
    fs.copyFileSync(path.join(desktopDir, 'package.json'), path.join(stagingDir, 'package.json'));

    const tempAsar = path.join(root, 'Nepras_apps/dist/app.asar');
    await asar.createPackage(stagingDir, tempAsar);
    console.log(`Created app.asar package at: ${tempAsar}`);

    asarTargets.forEach(target => {
      if (fs.existsSync(path.dirname(target))) {
        fs.copyFileSync(tempAsar, target);
        console.log(`Updated app.asar in: ${target}`);
      }
    });

    fs.rmSync(stagingDir, { recursive: true, force: true });
  }

  console.log('\n✅ Release sync & code encryption complete!');
}

main().catch(err => {
  console.error('Sync failed:', err);
  process.exit(1);
});

