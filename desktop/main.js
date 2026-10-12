const { app, BrowserWindow, shell, session } = require('electron');
const path = require('path');

const APP_URL = process.env.APP_URL || 'https://cheeryhub.space';
const ALLOWED_DOMAINS = ['cheeryhub.space', 'api.cheeryhub.space'];

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 360,
    minHeight: 640,
    title: 'Cheeryhub',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Block navigation to external domains
  win.webContents.setWindowOpenHandler(({ url }) => {
    const parsed = new URL(url);
    if (ALLOWED_DOMAINS.some(d => parsed.hostname === d || parsed.hostname.endsWith('.' + d))) {
      return { action: 'allow' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Also catch navigation events
  win.webContents.on('will-navigate', (event, url) => {
    const parsed = new URL(url);
    if (!ALLOWED_DOMAINS.some(d => parsed.hostname === d || parsed.hostname.endsWith('.' + d))) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // Load the app
  win.loadURL(APP_URL).catch(err => {
    console.error('Failed to load app:', err);
  });

  // Optional: minimal menu
  const menu = require('electron').Menu.buildFromTemplate([
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'toggleDevTools' },
      ],
    },
    {
      label: 'App',
      submenu: [
        { role: 'quit' },
      ],
    },
  ]);
  require('electron').Menu.setApplicationMenu(menu);

  return win;
}

app.whenReady().then(() => {
  // Use default session partition for cookie persistence
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    // Allow all cookies from our domains
    callback({ responseHeaders: details.responseHeaders });
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});