const path = require('path');
const { app, BrowserWindow, screen, shell } = require('electron');
const displayHelper = require('./displayHelper.cjs');

const isDev = process.env.ELECTRON_DEV === 'true';

// Pre-launch display arrangement, captured once on startup and restored verbatim on
// quit — frozen on purpose, so later hot-plug extends never change what gets restored.
let savedDisplayState = null;

function extendIfMirrored(statusResult) {
  if (!statusResult.ok) return;
  const hasMirrored = statusResult.displays.some((d) => d.isMirrored);
  if (statusResult.displays.length > 1 && hasMirrored) {
    displayHelper.extend();
  }
}

function positionOnExternalDisplay(win) {
  const displays = screen.getAllDisplays();
  if (displays.length < 2) return; // single display: keep default windowed popup
  const primary = screen.getPrimaryDisplay();
  const external = displays.find((d) => d.id !== primary.id);
  win.setBounds(external.bounds);
  win.setFullScreen(true);
}

function createMainWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Beameransicht opens a second window via window.open(...) with a features
  // string (width/height/menubar=no/etc.) — allow it through so Electron creates
  // a real BrowserWindow that shares this window's session (localStorage,
  // BroadcastChannel) exactly like a second browser tab/window would. Any other
  // window.open (e.g. an external link like the footer's LinkedIn anchor) must
  // NOT become an in-app BrowserWindow — send it to the OS default browser instead.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.includes('?beamer')) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('did-create-window', (newWin) => {
    positionOnExternalDisplay(newWin);
  });

  if (isDev) {
    win.loadURL('http://localhost:3000');
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

// Auto-launch counterpart to the manual "Beameransicht öffnen" button — opens the
// same ?beamer route directly from the main process so it can appear fullscreen on
// the external display immediately at startup, with no user click required.
function createBeamerWindow() {
  const beamerWin = new BrowserWindow({
    width: 1280,
    height: 720,
    show: false, // stay hidden until positioned on the external display — avoids flicker
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  beamerWin.once('ready-to-show', () => {
    positionOnExternalDisplay(beamerWin);
    beamerWin.show();
  });

  if (isDev) {
    beamerWin.loadURL('http://localhost:3000/?beamer');
  } else {
    beamerWin.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), { search: 'beamer' });
  }
}

app.whenReady().then(() => {
  savedDisplayState = displayHelper.getStatus();
  extendIfMirrored(savedDisplayState);
  createMainWindow();

  // Auto-open the Beamer window on launch if an external display is already connected.
  // Hot-plugging a display after launch is intentionally not handled here.
  if (savedDisplayState.ok && savedDisplayState.displays.length > 1) {
    createBeamerWindow();
  }

  screen.on('display-added', () => {
    extendIfMirrored(displayHelper.getStatus());
  });
});

app.on('before-quit', () => {
  if (savedDisplayState && savedDisplayState.ok) {
    displayHelper.restore(savedDisplayState);
  }
});

// Intentionally a no-op on macOS: closing all windows (main + any open Beamer
// popup) must NOT quit the app — it stays in the Dock so the user can reopen
// the main window via the Dock icon (handled by the 'activate' listener below)
// without losing exam state. Do not make this unconditional.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});
