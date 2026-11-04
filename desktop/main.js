// Electron shell: starts the bundled API (which also serves the Angular app) and shows it in a window.
const { app, BrowserWindow, dialog, shell } = require('electron');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { autoUpdater } = require('electron-updater');

// A fixed port keeps the app's origin stable, so the saved login and theme survive restarts.
const PREFERRED_PORT = 47821;
const STARTUP_TIMEOUT_MS = 30_000;
const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

let api = null;
let quitting = false;

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

function apiDir() {
  return app.isPackaged ? path.join(process.resourcesPath, 'api') : path.join(__dirname, 'api');
}

/** Per-install secret for signing login tokens; created on first run and kept in the user's app data. */
function signingKey() {
  const file = path.join(app.getPath('userData'), 'signing.key');
  try {
    return fs.readFileSync(file, 'utf8').trim();
  } catch {
    const key = crypto.randomBytes(48).toString('base64');
    fs.writeFileSync(file, key, { mode: 0o600 });
    return key;
  }
}

function portIsFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
  });
}

async function choosePort() {
  if (await portIsFree(PREFERRED_PORT)) return PREFERRED_PORT;
  // Fall back to any free port (the user will need to sign in again, as the origin changes).
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function waitForApi(port) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get({ host: '127.0.0.1', port, path: '/api/health', timeout: 2000 }, (res) => {
        res.resume();
        if (res.statusCode === 200) return resolve();
        retry();
      });
      req.on('error', retry);
      req.on('timeout', () => req.destroy());
    };
    const retry = () => {
      if (Date.now() > deadline) return reject(new Error('The app did not start in time.'));
      setTimeout(attempt, 250);
    };
    attempt();
  });
}

function startApi(port) {
  const dataDir = app.getPath('userData');
  fs.mkdirSync(dataDir, { recursive: true });
  const log = fs.createWriteStream(path.join(dataDir, 'api.log'), { flags: 'w' });

  api = spawn(path.join(apiDir(), 'ExpenseTracker.Api.exe'), ['--urls', `http://127.0.0.1:${port}`], {
    cwd: apiDir(),
    windowsHide: true,
    env: {
      ...process.env,
      ASPNETCORE_ENVIRONMENT: 'Production',
      Database__Provider: 'Sqlite',
      ConnectionStrings__Sqlite: `Data Source=${path.join(dataDir, 'expenses.db')}`,
      Jwt__Key: signingKey(),
      // The API watches this process and exits with it, even if the app is force-closed.
      Desktop__ParentPid: String(process.pid),
    },
  });
  api.stdout.pipe(log);
  api.stderr.pipe(log);
  api.on('exit', (code) => {
    api = null;
    if (quitting) return;
    dialog.showErrorBox(
      'Expense Tracker stopped',
      `The background service exited unexpectedly (code ${code}).\nDetails: ${path.join(dataDir, 'api.log')}`,
    );
    app.quit();
  });
}

/** Stops the background API; used before quitting and before an update replaces its files. */
function stopApi() {
  quitting = true;
  api?.kill();
}

/**
 * Checks GitHub Releases for a newer version on start and every few hours, downloads it in the background,
 * then offers to restart. If the user picks "Later", it installs when the app is next closed.
 */
function setupAutoUpdates(win) {
  if (!app.isPackaged) return;

  const logFile = path.join(app.getPath('userData'), 'updater.log');
  const write = (level) => (...args) => {
    try {
      fs.appendFileSync(logFile, `${new Date().toISOString()} [${level}] ${args.join(' ')}
`);
    } catch {}
  };
  autoUpdater.logger = { info: write('info'), warn: write('warn'), error: write('error'), debug() {} };
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.disableWebInstaller = true;

  let timer = null;
  // Being offline or GitHub being unreachable isn't worth bothering the user about; it's logged and retried later.
  autoUpdater.on('error', (err) => write('error')('Update check failed:', err?.message ?? err));
  autoUpdater.on('update-downloaded', async (info) => {
    clearInterval(timer);
    if (win.isDestroyed()) return;
    const { response } = await dialog.showMessageBox(win, {
      type: 'info',
      title: 'Update ready',
      message: `Expense Tracker ${info.version} is ready to install.`,
      detail: 'Restart now to update, or it will be installed the next time you close the app. Your data is kept.',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 0) {
      stopApi();
      // Silent install of the downloaded update, then reopen the app.
      autoUpdater.quitAndInstall(true, true);
    }
  });

  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  check();
  timer = setInterval(check, UPDATE_CHECK_INTERVAL_MS);
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 380,
    minHeight: 500,
    title: 'Expense Tracker',
    backgroundColor: '#0b1020',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'build-resources', 'icon.png'),
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });

  // Links that would open a new window go to the system browser instead.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) shell.openExternal(url);
    return { action: 'deny' };
  });

  await win.loadFile(path.join(__dirname, 'loading.html'));

  try {
    const port = await choosePort();
    startApi(port);
    await waitForApi(port);
    // Keep navigation inside the app's own origin.
    const origin = `http://127.0.0.1:${port}`;
    win.webContents.on('will-navigate', (event, url) => {
      if (!url.startsWith(origin)) {
        event.preventDefault();
        shell.openExternal(url);
      }
    });
    await win.loadURL(`${origin}/`);
    setupAutoUpdates(win);
  } catch (err) {
    dialog.showErrorBox('Expense Tracker could not start', String(err?.message ?? err));
    app.quit();
  }
}

app.on('second-instance', () => {
  const [win] = BrowserWindow.getAllWindows();
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.whenReady().then(createWindow);

app.on('before-quit', stopApi);

app.on('window-all-closed', () => app.quit());
