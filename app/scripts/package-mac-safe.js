const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const website = path.join(root, '..', 'website');
const appPath = path.join(root, 'dist', 'mac-arm64', 'HemulkyReminder.app');
const installSrc = path.join(__dirname, 'Install Hemulky.command');
const stage = path.join(root, 'dist', 'mac-safe-stage');
const zipOut = path.join(root, 'dist', 'HemulkyReminder-Mac.zip');

if (!fs.existsSync(appPath)) {
  console.error('Missing app. Run npm run build:mac first.');
  process.exit(1);
}

fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });

execSync(`cp -R ${JSON.stringify(appPath)} ${JSON.stringify(path.join(stage, 'HemulkyReminder.app'))}`, { stdio: 'inherit' });
fs.copyFileSync(installSrc, path.join(stage, 'Install Hemulky.command'));
fs.chmodSync(path.join(stage, 'Install Hemulky.command'), 0o755);

const stagedApp = path.join(stage, 'HemulkyReminder.app');
try {
  execSync(`xattr -cr ${JSON.stringify(stagedApp)}`, { stdio: 'inherit' });
  execSync(`codesign --force --deep --sign - ${JSON.stringify(stagedApp)}`, { stdio: 'inherit' });
} catch (e) {
  console.warn(e.message);
}

fs.rmSync(zipOut, { force: true });
execSync(`cd ${JSON.stringify(stage)} && zip -ry ${JSON.stringify(zipOut)} HemulkyReminder.app "Install Hemulky.command"`, { stdio: 'inherit' });

fs.mkdirSync(website, { recursive: true });
fs.copyFileSync(zipOut, path.join(website, 'HemulkyReminder-Mac.zip'));
fs.copyFileSync(installSrc, path.join(website, 'Install Hemulky.command'));
fs.chmodSync(path.join(website, 'Install Hemulky.command'), 0o755);

const dmg = path.join(root, 'dist', 'HemulkyReminder-1.0.0-arm64.dmg');
if (fs.existsSync(dmg)) {
  fs.copyFileSync(dmg, path.join(website, 'HemulkyReminder.dmg'));
}

console.log('Ready:');
console.log(' -', path.join(website, 'HemulkyReminder-Mac.zip'));
console.log(' -', path.join(website, 'Install Hemulky.command'));
if (fs.existsSync(dmg)) console.log(' -', path.join(website, 'HemulkyReminder.dmg'));
