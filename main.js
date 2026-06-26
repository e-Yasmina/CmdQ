const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const net = require('net');
const { spawn, execSync } = require('child_process');

const BACKEND_PORT = 8000;
const FRONTEND_PORT = 5173;
const FRONTEND_URL = `http://localhost:${FRONTEND_PORT}`;
const isDev = !app.isPackaged;

function isTcpPortOpen(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(500);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => {
      resolve(false);
    });
    socket.connect(port, host);
  });
}

function getPidOnPort(port) {
  try {
    const stdout = execSync(`netstat -ano | findstr :${port}`).toString();
    for (const line of stdout.split('\n')) {
      const parts = line.trim().split(/\s+/);
      if (parts.length > 4 && parts[1].includes(`:${port}`)) {
        return parts[parts.length - 1];
      }
    }
  } catch (e) {}
  return null;
}

let mainWindow;
let backendProcess;
let frontendProcess;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    title: "CmdQ Desktop",
    backgroundColor: '#0f172a',
    autoHideMenuBar: true
  });

  mainWindow.setMenu(null);

  if (isDev) {
    const loadWithRetry = () => {
      if (!mainWindow) return;
      mainWindow.loadURL(FRONTEND_URL).catch(() => {
        console.log("Vite not ready yet, retrying in 1s...");
        setTimeout(loadWithRetry, 1000);
      });
    };
    loadWithRetry();
  } else {
    mainWindow.loadFile(path.join(__dirname, 'cmdQ-front', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function startBackend() {
  console.log("Starting Python backend...");
  backendProcess = spawn('python', ['-u', '-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', String(BACKEND_PORT)], {
    cwd: path.join(__dirname, 'python-backend'),
    shell: true
  });

  backendProcess.stdout.on('data', (data) => {
    console.log(`Backend: ${data}`);
  });

  backendProcess.stderr.on('data', (data) => {
    console.error(`Backend Error: ${data}`);
  });
}

function startFrontend() {
  console.log("Starting Vite dev server...");
  frontendProcess = spawn('npm', ['run', 'dev'], {
    cwd: path.join(__dirname, 'cmdQ-front'),
    shell: true
  });

  frontendProcess.stdout.on('data', (data) => {
    console.log(`Frontend: ${data}`);
  });

  frontendProcess.stderr.on('data', (data) => {
    console.error(`Frontend Error: ${data}`);
  });
}

app.whenReady().then(async () => {
  ipcMain.on('open-new-window', () => {
    createWindow();
  });

  if (await isTcpPortOpen(BACKEND_PORT)) {
    console.log(`Backend port ${BACKEND_PORT} is already in use; reusing existing local service.`);
  } else {
    startBackend();
  }

  if (isDev) {
    if (await isTcpPortOpen(FRONTEND_PORT)) {
      console.log(`Frontend port ${FRONTEND_PORT} is already in use; reusing existing local service.`);
    } else {
      const pid = getPidOnPort(FRONTEND_PORT);
      if (pid) {
        console.log(`Port ${FRONTEND_PORT} is reserved (PID ${pid}), freeing it...`);
        try { execSync(`taskkill /F /PID ${pid} /T`); } catch (e) {}
        await new Promise(r => setTimeout(r, 1000));
      }
      startFrontend();
    }
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  if (backendProcess) {
    backendProcess.kill();
  }
  if (frontendProcess) {
    frontendProcess.kill();
  }
});
