// Builds the installer and publishes it as a GitHub release, which installed copies pick up as an update.
// Usage (PowerShell):  $env:GH_TOKEN = "<token>"; npm run release
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(desktopDir, 'package.json'), 'utf8'));
const target = pkg.build.publish[0];

const fail = (msg) => {
  console.error(`\n${msg}\n`);
  process.exit(1);
};
if (target.owner === 'YOUR_GITHUB_USERNAME')
  fail('Set build.publish owner (and repo) in desktop/package.json to your GitHub repository first.');
if (!process.env.GH_TOKEN)
  fail('Set GH_TOKEN to a GitHub token that can create releases in ' + `${target.owner}/${target.repo}` + ' first.');

console.log(`Releasing Expense Tracker ${pkg.version} to github.com/${target.owner}/${target.repo}`);
console.log('(Installed copies only update to a higher version: bump "version" in desktop/package.json for each release.)');
const run = (cmd) => execSync(cmd, { cwd: desktopDir, stdio: 'inherit' });
run('npm run prepare-app');
run('npx electron-builder --win --publish always');
console.log(`\nPublished ${pkg.version}. Installed copies will download it the next time they start.`);
