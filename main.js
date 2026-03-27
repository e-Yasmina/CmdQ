const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

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
    backgroundColor: '#0f172a', // Matching current theme
  });

  // In development, load the Vite dev server
  // In production, we'd load the build/index.html
  const url = 'http://localhost:5173';
  
  const loadWithRetry = () => {
    mainWindow.loadURL(url).catch(() => {
      console.log("Vite not ready yet, retrying in 1s...");
      setTimeout(loadWithRetry, 1000);
    });
  };

  loadWithRetry();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function startBackend() {
  console.log("Starting Python backend...");
  // Assuming python is in the path and main.py is in python-backend folder
  // We use uvicorn to run the FastAPI app
  backendProcess = spawn('python', ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', '8000'], {
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

app.whenReady().then(() => {
  startBackend();
  startFrontend();
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
