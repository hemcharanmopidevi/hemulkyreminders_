const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);

  try {
    execSync(`xattr -cr ${JSON.stringify(appPath)}`, { stdio: 'inherit' });
  } catch (_) {}

  try {
    execSync(`codesign --force --deep --sign - ${JSON.stringify(appPath)}`, { stdio: 'inherit' });
    console.log('Ad-hoc signed:', appPath);
  } catch (err) {
    console.warn('Ad-hoc codesign failed:', err.message);
  }

  const installSrc = path.join(__dirname, 'Install Hemulky.command');
  const installDest = path.join(context.appOutDir, 'Install Hemulky.command');
  if (fs.existsSync(installSrc)) {
    fs.copyFileSync(installSrc, installDest);
    fs.chmodSync(installDest, 0o755);
  }
};
