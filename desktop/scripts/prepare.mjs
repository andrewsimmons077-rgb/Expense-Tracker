// Builds the Angular app and publishes the API (self-contained, with the Angular app in wwwroot)
// into desktop/api, ready for Electron to run or package.
import { execSync } from 'node:child_process';
import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const root = join(desktopDir, '..');
const clientDir = join(root, 'client');
const apiProject = join(root, 'server', 'ExpenseTracker.Api');
const out = join(desktopDir, 'api');

const run = (cmd, cwd) => {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { cwd, stdio: 'inherit' });
};

if (!existsSync(join(clientDir, 'node_modules'))) run('npm install', clientDir);
run('npm run build', clientDir);

rmSync(out, { recursive: true, force: true });
run(
  `dotnet publish -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true ` +
    `-p:IncludeNativeLibrariesForSelfExtract=true -p:DebugType=none -o "${out}"`,
  apiProject,
);

cpSync(join(clientDir, 'dist', 'client', 'browser'), join(out, 'wwwroot'), { recursive: true });
console.log(`\nApp prepared in ${out}`);
