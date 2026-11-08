const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const net = require('net');
const fs = require('fs');
const readline = require('readline');
const { spawn, execSync } = require('child_process');

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
let backendRl;
const pendingRequests = new Map();

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
    mainWindow.loadFile(path.join(__dirname, 'frontend', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function getPythonExecutable() {
  const isWindows = process.platform === 'win32';
  const venvPython = isWindows
    ? path.join(__dirname, 'backend', 'venv', 'Scripts', 'python.exe')
    : path.join(__dirname, 'backend', 'venv', 'bin', 'python');

  if (fs.existsSync(venvPython)) {
    return venvPython;
  }
  if (process.env.PYTHON_PATH && fs.existsSync(process.env.PYTHON_PATH)) {
    return process.env.PYTHON_PATH;
  }
  return isWindows ? 'python' : 'python3';
}

function startBackend() {
  return new Promise((resolve, reject) => {
    console.log("Starting Python backend with private IPC pipes (no TCP port)...");

    const pythonPath = getPythonExecutable();
    console.log(`Using Python executable: ${pythonPath}`);

    let settled = false;
    let stderrBuffer = '';

    const settle = (fn) => {
      if (!settled) {
        settled = true;
        fn();
      }
    };

    backendProcess = spawn(pythonPath, ['-u', 'pipe_server.py'], {
      cwd: path.join(__dirname, 'backend'),
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    backendRl = readline.createInterface({
      input: backendProcess.stdout,
      crlfDelay: Infinity
    });

    backendRl.on('line', (line) => {
      const lineStr = line.trim();
      if (!lineStr) return;

      try {
        const msg = JSON.parse(lineStr);

        // Check for startup ready signal
        if (msg.type === 'ready') {
          console.log("Python pipe server ready over stdin/stdout pipes.");
          settle(() => resolve(true));
          return;
        }

        // Handle request response
        if (msg.id && pendingRequests.has(msg.id)) {
          const { resolve: resResolve } = pendingRequests.get(msg.id);
          pendingRequests.delete(msg.id);
          resResolve(msg);
        }
      } catch (err) {
        console.error("Failed to parse backend pipe line:", lineStr, err);
      }
    });

    backendProcess.stderr.on('data', (data) => {
      const text = data.toString();
      stderrBuffer += text;
      console.error(`Backend Log: ${text.trim()}`);
    });

    const fail = (message) => {
      if (stderrBuffer) message += `\n${stderrBuffer.trim()}`;
      console.error(message);
      settle(() => reject(new Error(message)));
    };

    backendProcess.on('error', (err) => {
      fail(`Failed to spawn backend process: ${err.message}`);
    });

    backendProcess.on('exit', (code, signal) => {
      console.log(`Backend process exited (code=${code}, signal=${signal})`);
      // Reject any pending requests
      for (const [id, req] of pendingRequests.entries()) {
        req.reject(new Error(`Backend exited while request was in progress (code=${code})`));
      }
      pendingRequests.clear();

      if (!settled) {
        fail(`Backend exited before it was ready (code=${code}, signal=${signal}). Check Python environment.`);
      }
    });

    backendProcess.on('close', () => {
      if (!settled) {
        fail('Backend process closed before it was ready.');
      }
    });
  });
}

// Allowlisted endpoint prefixes for security validation in main process
const ALLOWED_PATH_PREFIXES = [
  '/check_port',
  '/databases',
  '/create_database',
  '/drop_database',
  '/schema',
  '/table_data',
  '/query',
  '/ai/',
  '/analyze/',
  '/export/',
  '/import/',
  '/database/copy',
  '/etl/migrate',
  '/storage/',
  '/protection',
  '/entity_graph'
];

function validateBackendRequest(event, req) {
  // 1. Sender validation: ensure request originates from the trusted main window
  if (!mainWindow || event.sender !== mainWindow.webContents) {
    throw new Error("Access denied: request not from authorized window");
  }

  // 2. Request structure validation
  if (!req || typeof req !== 'object') {
    throw new Error("Invalid request: Expected payload object");
  }

  const { method = 'GET', path = '' } = req;
  const cleanMethod = String(method).toUpperCase();
  if (!['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(cleanMethod)) {
    throw new Error(`Invalid HTTP method: ${cleanMethod}`);
  }

  if (typeof path !== 'string' || !path.startsWith('/')) {
    throw new Error(`Invalid request path: ${path}`);
  }

  // Path traversal check
  const pathWithoutQuery = path.split('?')[0];
  if (pathWithoutQuery.includes('..') || !/^\/[a-zA-Z0-9_\-\/]*$/.test(pathWithoutQuery)) {
    throw new Error(`Path traversal or invalid characters detected: ${path}`);
  }

  // Allowlist verification
  const isAllowed = ALLOWED_PATH_PREFIXES.some(prefix =>
    pathWithoutQuery === prefix || pathWithoutQuery.startsWith(prefix)
  );
  if (!isAllowed) {
    throw new Error(`Endpoint not allowlisted: ${pathWithoutQuery}`);
  }

  return {
    ...req,
    method: cleanMethod,
    path: path
  };
}

function sendToBackend(validatedReq) {
  return new Promise((resolve, reject) => {
    if (!backendProcess || backendProcess.killed || !backendProcess.stdin || !backendProcess.stdin.writable) {
      return reject(new Error("Python backend service is not running."));
    }

    const reqId = 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const payload = { ...validatedReq, id: reqId };

    const timeout = setTimeout(() => {
      if (pendingRequests.has(reqId)) {
        pendingRequests.delete(reqId);
        reject(new Error(`Backend request timed out (${validatedReq.method} ${validatedReq.path})`));
      }
    }, 600000); // 10 minute timeout for LLM & migrations

    pendingRequests.set(reqId, {
      resolve: (msg) => {
        clearTimeout(timeout);
        resolve(msg);
      },
      reject: (err) => {
        clearTimeout(timeout);
        reject(err);
      }
    });

    try {
      backendProcess.stdin.write(JSON.stringify(payload) + '\n');
    } catch (err) {
      pendingRequests.delete(reqId);
      clearTimeout(timeout);
      reject(err);
    }
  });
}

function startFrontend() {
  console.log("Starting Vite dev server...");
  frontendProcess = spawn('npm', ['run', 'dev'], {
    cwd: path.join(__dirname, 'frontend'),
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

  // Handle IPC request from preload, validate in main process, pass over stdin/stdout pipes
  ipcMain.handle('backend-request', async (event, req) => {
    try {
      const validated = validateBackendRequest(event, req);
      const response = await sendToBackend(validated);
      return response;
    } catch (err) {
      console.error(`IPC Request Failed: ${err.message}`);
      return {
        ok: false,
        status_code: 400,
        headers: {},
        data: { detail: err.message, error: err.message },
        is_base64: false
      };
    }
  });

  try {
    await startBackend();
  } catch (err) {
    console.error(err.message);
    dialog.showErrorBox(
      'CmdQ Backend Startup Error',
      `Failed to start Python backend service over private pipes:\n\n${err.message}\n\nPlease check Python installation and dependencies.`
    );
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
    if (backendProcess.stdin && backendProcess.stdin.writable) {
      backendProcess.stdin.end();
    }
    backendProcess.kill();
  }
  if (frontendProcess) {
    frontendProcess.kill();
  }
});
