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
  return new Promise((resolve, reject) => {
    console.log("Starting Python backend...");

    const isWindows = process.platform === 'win32';
    const pythonPath = isWindows
      ? path.join(__dirname, 'python-backend', 'venv', 'Scripts', 'python.exe')
      : path.join(__dirname, 'python-backend', 'venv', 'bin', 'python');

    let settled = false;
    let stderrBuffer = '';

    const settle = (fn) => {
      if (!settled) {
        settled = true;
        fn();
      }
    };

    backendProcess = spawn(pythonPath, ['-u', '-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', String(BACKEND_PORT)], {
      cwd: path.join(__dirname, 'python-backend'),
      env: { ...process.env, PYTHONUNBUFFERED: '1' }
    });

    const onOutput = (isError) => (data) => {
      const text = data.toString();
      if (isError) {
        stderrBuffer += text;
        console.error(`Backend Error: ${text}`);
      } else {
        console.log(`Backend: ${text}`);
      }
      if (!settled && /Application startup complete/i.test(text)) {
        console.log("Backend ready.");
        settle(() => resolve(true));
      }
    };

    backendProcess.stdout.on('data', onOutput(false));
    backendProcess.stderr.on('data', onOutput(true));

    const fail = (message) => {
      if (stderrBuffer) message += `\n${stderrBuffer.trim()}`;
      console.error(message);
      settle(() => reject(new Error(message)));
    };

    backendProcess.on('error', (err) => {
      fail(`Failed to start backend: ${err.message}`);
    });

    backendProcess.on('exit', (code, signal) => {
      console.log(`Backend exited (code=${code}, signal=${signal})`);
      if (!settled) {
        if (/address already in use/i.test(stderrBuffer)) {
          fail(`Backend port ${BACKEND_PORT} is already in use; if it is not the CmdQ service, free the port and restart.`);
        } else {
          fail(`Backend exited before it was ready (code=${code}, signal=${signal}). Check the Python venv and that uvicorn is installed.`);
        }
      }
    });

    backendProcess.on('close', () => {
      if (!settled) {
        fail('Backend process closed before it was ready.');
      }
    });
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
    try {
      await startBackend();
    } catch (err) {
      console.error(err.message);
    }
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
