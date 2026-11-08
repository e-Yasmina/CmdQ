const { contextBridge, ipcRenderer } = require('electron');

const api = {
  platform: process.platform,
  openNewWindow: () => ipcRenderer.send('open-new-window'),

  // Generic request handler via Electron IPC
  request: (req) => ipcRenderer.invoke('backend-request', req),

  // Concrete methods exposed to the React UI:
  checkPort: (host, port) =>
    ipcRenderer.invoke('backend-request', { method: 'POST', path: '/check_port', body: { host, port } }),

  connectDb: (payload) =>
    ipcRenderer.invoke('backend-request', { method: 'POST', path: '/databases', body: payload }),

  createDatabase: (payload) =>
    ipcRenderer.invoke('backend-request', { method: 'POST', path: '/create_database', body: payload }),

  dropDatabase: (payload) =>
    ipcRenderer.invoke('backend-request', { method: 'POST', path: '/drop_database', body: payload }),

  fetchSchema: (payload) =>
    ipcRenderer.invoke('backend-request', { method: 'POST', path: '/schema', body: payload }),

  fetchClis: () =>
    ipcRenderer.invoke('backend-request', { method: 'GET', path: '/ai/detect_cli' }),

  registerApiCli: (payload) =>
    ipcRenderer.invoke('backend-request', { method: 'POST', path: '/ai/register_api_model', body: payload }),

  fetchRegisteredModels: () =>
    ipcRenderer.invoke('backend-request', { method: 'GET', path: '/ai/registered_models' }),

  deleteApiModel: (modelId) =>
    ipcRenderer.invoke('backend-request', { method: 'DELETE', path: `/ai/register_api_model/${encodeURIComponent(modelId)}` }),

  launchAiPrompt: (payload) =>
    ipcRenderer.invoke('backend-request', { method: 'POST', path: '/ai/prompt', body: payload }),

  executeQuery: (payload) =>
    ipcRenderer.invoke('backend-request', { method: 'POST', path: '/query', body: payload }),

  fetchTableData: (payload) =>
    ipcRenderer.invoke('backend-request', { method: 'POST', path: '/table_data', body: payload }),

  fetchSecurityAnalysis: (payload) =>
    ipcRenderer.invoke('backend-request', { method: 'POST', path: '/analyze/security', body: payload }),

  fetchPerformanceAnalysis: (payload) =>
    ipcRenderer.invoke('backend-request', { method: 'POST', path: '/analyze/performance', body: payload }),

  fetchDataAnalysis: (payload) =>
    ipcRenderer.invoke('backend-request', { method: 'POST', path: '/analyze/data', body: payload }),

  fetchSummaryAnalysis: (payload) =>
    ipcRenderer.invoke('backend-request', { method: 'POST', path: '/analyze/summary', body: payload }),

  exportTable: (payload) =>
    ipcRenderer.invoke('backend-request', { method: 'POST', path: '/export/table', body: payload }),

  exportDatabase: (payload) =>
    ipcRenderer.invoke('backend-request', { method: 'POST', path: '/export/database', body: payload }),

  importTable: (uploadPayload) =>
    ipcRenderer.invoke('backend-request', { method: 'POST', path: '/import/table', ...uploadPayload }),

  importDatabase: (uploadPayload) =>
    ipcRenderer.invoke('backend-request', { method: 'POST', path: '/import/database', ...uploadPayload }),

  scanImport: (uploadPayload) =>
    ipcRenderer.invoke('backend-request', { method: 'POST', path: '/import/scan', ...uploadPayload }),

  copyDatabase: (payload) =>
    ipcRenderer.invoke('backend-request', { method: 'POST', path: '/database/copy', body: payload }),

  migrateData: (payload) =>
    ipcRenderer.invoke('backend-request', { method: 'POST', path: '/etl/migrate', body: payload }),

  launchDebugCli: (payload) =>
    ipcRenderer.invoke('backend-request', { method: 'POST', path: '/ai/launch_debug', body: payload }),

  translateTable: (payload) =>
    ipcRenderer.invoke('backend-request', { method: 'POST', path: '/ai/translate_table', body: payload }),

  fetchProtectionAnalysis: (payload) =>
    ipcRenderer.invoke('backend-request', { method: 'POST', path: '/analyze/protection', body: payload }),

  saveFile: (payload) =>
    ipcRenderer.invoke('backend-request', { method: 'POST', path: '/ai/save_file', body: payload }),

  fetchProtectionRules: (connectionId) => {
    const query = connectionId ? `?connection_id=${encodeURIComponent(connectionId)}` : '';
    return ipcRenderer.invoke('backend-request', { method: 'GET', path: `/protection${query}` });
  },

  saveProtectionRule: (payload) =>
    ipcRenderer.invoke('backend-request', { method: 'POST', path: '/protection', body: payload }),

  saveProtectionBulk: (payload) =>
    ipcRenderer.invoke('backend-request', { method: 'POST', path: '/protection/bulk', body: payload }),

  deleteProtectionRule: (ruleId) =>
    ipcRenderer.invoke('backend-request', { method: 'DELETE', path: `/protection/${encodeURIComponent(ruleId)}` }),

  fetchEntityGraph: (payload) =>
    ipcRenderer.invoke('backend-request', { method: 'POST', path: '/entity_graph', body: payload }),

  getStorage: (key) =>
    ipcRenderer.invoke('backend-request', { method: 'GET', path: `/storage/${encodeURIComponent(key)}` }),

  saveStorage: (key, item) =>
    ipcRenderer.invoke('backend-request', { method: 'POST', path: `/storage/${encodeURIComponent(key)}`, body: item }),

  deleteStorage: (key, itemId) =>
    ipcRenderer.invoke('backend-request', { method: 'DELETE', path: `/storage/${encodeURIComponent(key)}/${encodeURIComponent(itemId)}` }),
};

contextBridge.exposeInMainWorld('electronAPI', api);
