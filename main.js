const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { fork } = require('child_process');

const APPDATA = process.env.APPDATA || os.homedir();
const POLARIS_DIR = path.join(APPDATA, '.claude', 'polaris');
const MOCKUP_SRC = app.isPackaged
  ? path.join(process.resourcesPath, 'resources', 'mockup.html')
  : path.join(__dirname, 'resources', 'mockup.html');
const MOCKUP_DEST = path.join(POLARIS_DIR, 'mockup.html');
const SERVER_PORT = 40000;

let mainWindow = null;
let serverProcess = null;

function ensureAppData() {
  const dirs = [
    POLARIS_DIR,
    path.join(POLARIS_DIR, 'sessions'),
    path.join(POLARIS_DIR, 'logs'),
    path.join(POLARIS_DIR, 'polaris_chat'),
  ];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
  fs.copyFileSync(MOCKUP_SRC, MOCKUP_DEST);
}

function startServer() {
  const serverPath = path.join(__dirname, 'server.js');
  serverProcess = fork(serverPath, [], {
    env: {
      ...process.env,
      POLARIS_DIR,
      MOCKUP_DEST,
      SERVER_PORT: String(SERVER_PORT),
    },
    silent: false,
  });

  serverProcess.on('error', (err) => {
    console.error('[main] Server error:', err);
  });

  serverProcess.on('exit', (code) => {
    console.log('[main] Server exited with code', code);
    if (code === 0) setTimeout(startServer, 500);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'Polaris',
    backgroundColor: '#0a0e1a',
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
    },
    autoHideMenuBar: true,
  });

  mainWindow.maximize();

  // Wait briefly for server to start, then load
  setTimeout(() => {
    mainWindow.loadURL(`http://localhost:${SERVER_PORT}`);
  }, 800);

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  ensureAppData();
  startServer();
  createWindow();
});

app.on('window-all-closed', () => {
  if (serverProcess) serverProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});

// IPC: Reload UI — re-copies default mockup if requested, then reloads window
ipcMain.handle('reload-ui', () => {
  if (mainWindow) mainWindow.webContents.reload();
});

// IPC: Restart server
ipcMain.handle('restart-server', () => {
  if (serverProcess) serverProcess.kill();
  setTimeout(startServer, 500);
});

// IPC: Open external link
ipcMain.handle('open-external', (_, url) => {
  shell.openExternal(url);
});
