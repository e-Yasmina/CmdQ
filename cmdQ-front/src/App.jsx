import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import ConnectionForm from './components/forms/ConnectionForm';
import ApiRegistrationForm from './components/forms/ApiRegistrationForm';
import ExportForm from './components/forms/ExportForm';
import ImportForm from './components/forms/ImportForm';
import CreateDatabaseForm from './components/forms/CreateDatabaseForm';
import DatabaseCopyForm from './components/forms/DatabaseCopyForm';
import DataMigrationForm from './components/forms/DataMigrationForm';
import ExplorerContextMenu from './components/ExplorerContextMenu';
import ServerActionModal from './components/ServerActionModal';
import ProtectionDiagnosisModal from './components/ProtectionDiagnosisModal';
import PropertiesModal from './components/PropertiesModal';
import CommandPalette from './components/CommandPalette';
import ShortcutsModal from './components/ShortcutsModal';
import Sidebar from './components/layout/Sidebar';
import MainHeader from './components/layout/MainHeader';
import AiPanel from './components/layout/AiPanel';
import QueryPanel from './components/layout/QueryPanel';
import ResultsPanel from './components/layout/ResultsPanel';
import { apiService } from './services/apiService';
import { storageService } from './services/storageService';
import { shortcutService } from './services/shortcutService';
import { useConnection } from './hooks/useConnection';
import { useTabs } from './hooks/useTabs';
import { useAiPrompt } from './hooks/useAiPrompt';
import { useAnalysis } from './hooks/useAnalysis';
import { useUI } from './hooks/useUI';

function App() {
  const conn = useConnection();
  const tabs = useTabs();
  const ai = useAiPrompt();
  const analysis = useAnalysis();
  const ui = useUI();

  // Persistence state (savedQueries, savedConversations)
  const [savedQueries, setSavedQueries] = useState([]);
  const [savedConversations, setSavedConversations] = useState([]);

  // Per-view-mode result cache so switching between AI Prompt and SQL Editor
  // preserves each mode's last result independently.
  const resultByMode = useRef({ ai: null, query: null });

  const switchViewMode = useCallback((newMode) => {
    const oldMode = ui.viewMode;
    if (oldMode === newMode) return;
    resultByMode.current[oldMode] = analysis.sqlResult;
    ui.setViewMode(newMode);
    const cached = resultByMode.current[newMode];
    if (cached !== undefined && cached !== null) {
      analysis.setSqlResult(cached);
    }
  }, [ui.viewMode, ui.setViewMode, analysis.sqlResult, analysis.setSqlResult]);
  const switchViewModeRef = useRef(switchViewMode);
  switchViewModeRef.current = switchViewMode;

  // --- Load saved items on mount ---
  const loadSavedQueries = useCallback(async () => {
    try {
      const saved = await storageService.getItems('queries');
      setSavedQueries(saved || []);
    } catch (err) { console.error("Failed to load saved queries:", err); }
  }, []);

  const loadSavedConversations = useCallback(async () => {
    try {
      const saved = await storageService.getItems('conversations');
      setSavedConversations(saved || []);
    } catch (err) { console.error("Failed to load saved conversations:", err); }
  }, []);

  // --- Coordinator: handleDbChange (bridges tabs, connection, AI, analysis) ---
  const handleDbChange = useCallback(async (connId, dbName) => {
    const nextTabId = `${connId}::${dbName}`;
    const prevTabId = conn.activeConnectionId && conn.activeDatabase
      ? `${conn.activeConnectionId}::${conn.activeDatabase}` : null;

    if (prevTabId) {
      tabs.tabStateCache.current[prevTabId] = {
        chatHistory: ai.chatHistory,
        sqlResult: analysis.sqlResult,
        sqlQuery: analysis.sqlQuery,
        prompt: ai.prompt,
        viewMode: ui.viewMode,
        activeSchemaName: conn.activeSchemaName,
        activeTableName: conn.activeTableName,
      };
    }

    const cached = tabs.tabStateCache.current[nextTabId] || {
      chatHistory: [], sqlResult: null, sqlQuery: "", prompt: "",
      viewMode: "ai", activeSchemaName: null, activeTableName: null,
    };

    conn.setActiveConnectionId(connId);
    conn.setActiveDatabase(dbName);
    conn.setActiveSchemaName(cached.activeSchemaName);
    conn.setActiveTableName(cached.activeTableName);
    ai.setChatHistory(cached.chatHistory);
    analysis.setSqlResult(cached.sqlResult);
    analysis.setSqlQuery(cached.sqlQuery);
    ai.setPrompt(cached.prompt);
    ui.setViewMode(cached.viewMode);
    resultByMode.current[cached.viewMode] = analysis.sqlResult;

    tabs.setOpenTabs(prev => prev.includes(nextTabId) ? prev : [...prev, nextTabId]);
    tabs.setActiveTabId(nextTabId);

    const connIndex = conn.connections.findIndex(c => c.id === connId);
    if (connIndex >= 0) {
      const c = conn.connections[connIndex];
      if (!c.schemas[dbName]) {
        const configForDb = { ...c.config, database: dbName };
        const schema = await conn.fetchSchema(configForDb);
        if (schema) {
          conn.setConnections(prev => {
            const newConns = [...prev];
            newConns[connIndex] = { ...c, schemas: { ...c.schemas, [dbName]: schema } };
            return newConns;
          });
        }
      }
    }
  }, [conn, tabs, ai, analysis, ui]);

  // --- Coordinator: closeTab ---
  const closeTab = useCallback((tabId) => {
    tabs.setOpenTabs(prev => prev.filter(id => id !== tabId));
    delete tabs.tabStateCache.current[tabId];
    if (`${conn.activeConnectionId}::${conn.activeDatabase}` === tabId) {
      conn.setActiveConnectionId(null);
      conn.setActiveDatabase(null);
      analysis.setSqlResult(null);
      ai.setChatHistory([]);
      tabs.setActiveTabId(null);
    }
  }, [conn, tabs, ai, analysis]);

  // --- Coordinator: handleConnected ---
  const handleConnected = useCallback(async (dbs, initialDb, config) => {
    const newConnId = config.server_name || `${config.user}@${config.host}:${config.port}`;
    let connExists = conn.connections.find(c => c.id === newConnId);

    if (!connExists) {
      const initialSchema = await conn.fetchSchema(config);
      const newConnection = {
        id: newConnId, config, databases: dbs,
        schemas: { [initialDb]: initialSchema },
      };
      conn.setConnections(prev => [...prev, newConnection]);
      storageService.saveItem('connections', newConnection).catch(err => console.error("Failed to save connection:", err));
    }

    conn.setActiveConnectionId(newConnId);
    conn.setActiveDatabase(initialDb);
    conn.setActiveSchemaName(null);
    conn.setActiveTableName(null);
    conn.setShowConnectionForm(false);
    ai.setChatHistory([]);
    analysis.setSqlResult(null);
  }, [conn, ai, analysis]);

  // --- Coordinator: handleTableClick ---
  const handleTableClick = useCallback(async (connId, dbName, schemaName, tableName) => {
    if (conn.activeConnectionId !== connId || conn.activeDatabase !== dbName) {
      await handleDbChange(connId, dbName);
    }

    const c = conn.connections.find(x => x.id === connId);
    if (!c) return;

    conn.setActiveSchemaName(schemaName);
    conn.setActiveTableName(tableName);
    ai.setSelectedTable([`${schemaName}.${tableName}`]);

    const conf = { ...c.config, database: dbName };

    switchViewMode('query');
    analysis.setSqlResult({ loading: true });
    analysis.setIsQueryExecuting(true);
    try {
      const data = await apiService.fetchTableData({
        schema_name: schemaName, table_name: tableName, limit: 100, offset: 0,
        db_config: conf, session_context: conn.sessionContext,
      });
      if (data.status === "error") {
        analysis.setSqlResult({ error: data.message || "Failed to fetch table data" });
        return;
      }

      const tableInfo = c.schemas[dbName]?.[schemaName]?.[tableName];
      const hasRls = tableInfo?.has_rls || false;
      const columns = Array.isArray(tableInfo) ? tableInfo : (tableInfo?.columns || []);
      const constraints = tableInfo?.constraints || [];

      analysis.setSqlResult({
        data: data.data || [],
        original_data: data.data ? JSON.parse(JSON.stringify(data.data)) : [],
        extracted_sql: `SELECT * FROM ${schemaName}.${tableName} LIMIT 100`,
        message: `Fetched 100 rows from ${tableName}`,
        isTableClick: true, targetSchema: schemaName, targetTable: tableName,
        hasRls, columns, constraints,
      });
    } catch (err) {
      analysis.setSqlResult({ error: "Failed to fetch table data: " + err.message });
    } finally {
      analysis.setIsQueryExecuting(false);
    }
  }, [conn, tabs, ai, analysis, ui, handleDbChange]);

  // --- Coordinator: refreshTableData ---
  const refreshTableData = useCallback(() => {
    if (conn.activeConnectionId && conn.activeDatabase && conn.activeSchemaName && conn.activeTableName) {
      handleTableClick(conn.activeConnectionId, conn.activeDatabase, conn.activeSchemaName, conn.activeTableName);
    }
  }, [conn, handleTableClick]);

  // --- Coordinator: handleFileAttach ---
  const handleFileAttach = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const name = file.name;
      const ext = name.split('.').pop().toLowerCase();
      if (ext === 'csv' || ext === 'json' || ext === 'txt') {
        const text = await file.text();
        ai.setAttachedFile({ name, content: text, type: ext });
      } else if (ext === 'xlsx' || ext === 'xls') {
        const XLSX = await import('xlsx');
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const allData = [];
        wb.SheetNames.forEach(sheetName => {
          const ws = wb.Sheets[sheetName];
          const json = XLSX.utils.sheet_to_json(ws, { defval: "" });
          if (json.length > 0) {
            allData.push(`--- Sheet: ${sheetName} ---`);
            allData.push(JSON.stringify(json, null, 2));
          }
        });
        ai.setAttachedFile({ name, content: allData.join('\n'), type: 'excel' });
      } else {
        ai.setAttachedFile({ name, content: `[Unsupported file type: .${ext}]`, type: ext });
      }
    } catch (err) {
      console.error("File attach error:", err);
      alert("Failed to read file: " + err.message);
    }
    e.target.value = "";
  }, [ai]);

  // --- Coordinator: handlePromptChange ---
  const handlePromptChange = useCallback((e) => {
    ai.handlePromptChange(e, conn.tableList);
  }, [ai, conn.tableList]);

  // --- Coordinator: executeManualQuery ---
  const executeManualQuery = useCallback((queryText) => {
    analysis.executeManualQuery(queryText, conn.activeConfig, conn.sessionContext);
  }, [analysis, conn.activeConfig, conn.sessionContext]);

  // --- Coordinator: handleSaveQuery ---
  const handleSaveQuery = useCallback(async (queryText, name) => {
    const newQuery = {
      id: Date.now().toString(), name, query: queryText,
      connectionId: conn.activeConnectionId, database: conn.activeDatabase,
    };
    try {
      await storageService.saveItem('queries', newQuery);
      setSavedQueries(prev => [...prev, newQuery]);
    } catch (err) {
      alert("Failed to save query: " + err.message);
    }
  }, [conn.activeConnectionId, conn.activeDatabase]);

  // --- Coordinator: launchCli ---
  const launchCli = useCallback(async () => {
    await ai.launchCli({
      selectedCli: ai.selectedCli, customCliCommand: ai.customCliCommand,
      prompt: ai.prompt, activeConfig: conn.activeConfig,
      chatHistory: ai.chatHistory, protectedItems: conn.protectedItems,
      sessionContext: conn.sessionContext, attachedFile: ai.attachedFile,
      selectedTable: ai.selectedTable, selectedAction: ai.selectedAction,
      setCurrentAbortController: analysis.setCurrentAbortController,
      setSqlResult: analysis.setSqlResult,
      setChatHistory: ai.setChatHistory,
      setPrompt: ai.setPrompt,
      setAttachedFile: ai.setAttachedFile,
      setActiveSchemaName: conn.setActiveSchemaName,
      setActiveTableName: conn.setActiveTableName,
      setSelectedTable: ai.setSelectedTable,
      activeSchema: conn.activeSchema,
      extractTableFromQuery: analysis.extractTableFromQuery,
      extractAllTablesFromQuery: analysis.extractAllTablesFromQuery,
    });
  }, [ai, conn, analysis]);

  // --- Coordinator: handleExplorerAction ---
  const getEntityId = useCallback((entity) => {
    const idMap = {
      'server': entity.server?.id,
      'database': `${entity.server?.id}::${entity.database}`,
      'schema': `${entity.server?.id}::${entity.database}::${entity.schemaName}`,
      'table': `${entity.server?.id}::${entity.database}::${entity.schemaName}::${entity.tableName}`
    };
    return idMap[entity.type] || null;
  }, []);

  const handleExplorerAction = useCallback(async (action, entity) => {
    if (action === 'toggle_protect') {
      conn.handleExplorerAction(action, entity);
      return;
    }

    // Protection actions from context menu
    if (action === 'protect_full') {
      const id = getEntityId(entity);
      if (id) conn.setProtectionLevel(id, 'full');
      return;
    }
    if (action === 'protect_readonly') {
      const id = getEntityId(entity);
      if (id) conn.setProtectionLevel(id, 'readonly');
      return;
    }
    if (action === 'protect_custom_all') {
      const id = getEntityId(entity);
      if (id) conn.setProtectionLevel(id, 'custom', ['insert', 'update', 'delete']);
      return;
    }
    if (action === 'protect_remove') {
      const id = getEntityId(entity);
      if (id) conn.removeProtectionItem(id);
      return;
    }
    if (action === 'set_write_permissions') {
      const id = getEntityId(entity);
      if (!id) return;
      const rule = conn.getProtectionRule(id);
      const currentPerms = (rule && typeof rule === 'object' && rule.write_permissions) || [];
      const toggleOp = entity.toggleOp;
      let newPerms;
      if (currentPerms.includes(toggleOp)) {
        newPerms = currentPerms.filter(p => p !== toggleOp);
      } else {
        newPerms = [...currentPerms, toggleOp];
      }
      if (newPerms.length === 0) {
        // No permissions left -> readonly
        conn.setProtectionLevel(id, 'readonly');
      } else {
        conn.setProtectionLevel(id, 'custom', newPerms);
      }
      return;
    }

    if (entity.type === 'server') {
      const server = entity.server;
      switch (action) {
        case 'import':
          conn.setActiveConnectionId(server.id);
          conn.setActiveDatabase(server.databases?.[0] || "");
          ui.setShowImportDbModal(true);
          break;
        case 'rename':
        case 'properties':
        case 'backup':
          ui.setServerActionModal({ type: action, server });
          break;
        case 'disconnect':
          if (window.confirm(`Disconnect from ${server.config.server_name || server.id}?`)) {
            conn.setConnections(prev => prev.filter(c => c.id !== server.id));
            storageService.deleteItem('connections', server.id);
            if (conn.activeConnectionId === server.id) {
              conn.setActiveConnectionId(null);
              conn.setActiveDatabase(null);
            }
          }
          break;
        case 'copy':
          ui.setCopyDbSource({ connId: server.id, database: null });
          ui.setShowCopyDbModal(true);
          break;
        case 'refresh':
        case 'reload':
          conn.handleRefreshConnection(server.id);
          break;
        default: break;
      }
    } else if (entity.type === 'database') {
      if (action === 'refresh') conn.handleRefreshConnection(entity.server.id);
      if (action === 'delete') conn.handleDropDatabase(entity.server.id, entity.database);
      if (action === 'export') { conn.setActiveConnectionId(entity.server.id); conn.setActiveDatabase(entity.database); ui.setShowExportDbModal(true); }
      if (action === 'backup') { conn.setActiveConnectionId(entity.server.id); conn.setActiveDatabase(entity.database); ui.setServerActionModal({ type: 'backup', server: entity.server }); }
      if (action === 'restore') { conn.setActiveConnectionId(entity.server.id); conn.setActiveDatabase(entity.database); ui.setShowImportDbModal(true); }
      if (action === 'copy') { ui.setCopyDbSource({ connId: entity.server.id, database: entity.database }); ui.setShowCopyDbModal(true); }
      if (action === 'properties') ui.setPropertiesModal({ entity });
    } else if (entity.type === 'schema') {
      if (action === 'refresh') conn.handleRefreshConnection(entity.server.id);
      if (action === 'export') { conn.setActiveConnectionId(entity.server.id); conn.setActiveDatabase(entity.database); conn.setActiveSchemaName(entity.schemaName); ui.setShowExportDbModal(true); }
      if (action === 'properties') ui.setPropertiesModal({ entity });
    } else if (entity.type === 'table') {
      if (action === 'refresh') conn.handleRefreshConnection(entity.server.id);
      if (action === 'export') { conn.setActiveConnectionId(entity.server.id); conn.setActiveDatabase(entity.database); conn.setActiveSchemaName(entity.schemaName); conn.setActiveTableName(entity.tableName); ui.setShowExportDbModal(true); }
      if (action === 'properties') ui.setPropertiesModal({ entity });
    }
  }, [conn, ui]);

  // --- Coordinator: handleServerActionConfirm ---
  const handleServerActionConfirm = useCallback(async (data) => {
    const { type, server } = ui.serverActionModal;
    if (type === 'rename') {
      const newName = data;
      const updatedConn = { ...server, config: { ...server.config, server_name: newName } };
      conn.setConnections(prev => prev.map(c => c.id === server.id ? updatedConn : c));
      storageService.saveItem('connections', updatedConn);
    } else if (type === 'backup') {
      const dbName = data;
      try {
        const blob = await apiService.exportDatabase({ db_config: { ...server.config, database: dbName }, format: 'sql' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `${dbName}_backup_${new Date().toISOString().split('T')[0]}.sql`);
        document.body.appendChild(link);
        link.click();
        link.parentNode.removeChild(link);
      } catch (err) { alert("Backup failed: " + err.message); }
    }
    ui.setServerActionModal(null);
  }, [ui.serverActionModal, conn]);

  // --- Launch AI analysis coordinator ---
  const handleAiAnalysis = useCallback((type) => {
    analysis.launchAiAnalysis(type, conn.activeConfig, ai.selectedCli, ai.customCliCommand,
      conn.activeSchemaName, conn.activeTableName,
      conn.setActiveSchemaName, conn.setActiveTableName, ai.setSelectedTable,
      conn.activeSchema, conn.sessionContext);
  }, [analysis, conn, ai]);

  // --- Translate view coordinator ---
  const handleTranslateView = useCallback(() => {
    analysis.handleTranslateView(analysis.sqlResult, ai.selectedCli, ai.customCliCommand);
  }, [analysis, ai]);

  // --- filteredTableMentions ---
  const filteredTableMentions = useMemo(() => {
    if (!ai.tableMentionFilter) return conn.tableList;
    const lower = ai.tableMentionFilter.toLowerCase();
    return conn.tableList.filter(t => t.toLowerCase().includes(lower));
  }, [conn.tableList, ai.tableMentionFilter]);

  // --- renderMessageContent ---
  const renderMessageContent = useCallback((content) => {
    const paragraphs = content.split('\n\n');
    const processParagraphs = [];
    const resultParagraphs = [];
    let isProcess = true;
    for (const p of paragraphs) {
      const pLower = p.toLowerCase();
      if (p.startsWith('```') || pLower.includes('here is') || pLower.includes('to determine') || pLower.includes('the answer') || pLower.includes('you can execute')) {
        isProcess = false;
      }
      if (isProcess && (p.startsWith('#') || pLower.includes('i will ') || pLower.includes('let me ') || pLower.includes("let's "))) {
        processParagraphs.push(p);
      } else {
        isProcess = false;
        resultParagraphs.push(p);
      }
    }

    if (processParagraphs.length > 0 && resultParagraphs.length > 0) {
      return (
        <div className="flex flex-col gap-2 w-full mt-1">
          <details className="text-gray-500 text-[11px] group">
            <summary className="cursor-pointer font-bold opacity-70 hover:opacity-100 transition-opacity list-none flex items-center gap-1 w-max">
              <span className="group-open:rotate-90 transition-transform flex items-center justify-center text-gray-500">
                <svg className="w-2.5 h-2.5" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
              </span> View Agent Process
            </summary>
            <div className="mt-2 pl-3 border-l-2 border-border/50 font-sans text-gray-400">
              {processParagraphs.join('\n\n')}
            </div>
          </details>
          <div className="whitespace-pre-wrap">{resultParagraphs.join('\n\n')}</div>
        </div>
      );
    }
    return <span className="whitespace-pre-wrap">{content}</span>;
  }, []);

  // --- Keyboard shortcuts effect ---
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if (shortcutService.matches(e, ui.shortcuts['command-palette'])) {
        e.preventDefault();
        ui.setShowCommandPalette(prev => !prev);
        return;
      }
      if (shortcutService.matches(e, ui.shortcuts['toggle-sidebar'])) {
        e.preventDefault();
        ui.setSidebarCollapsed(prev => !prev);
        return;
      }
      if (shortcutService.matches(e, ui.shortcuts['switch-ai'])) {
        e.preventDefault();
        switchViewModeRef.current('ai');
        return;
      }
      if (shortcutService.matches(e, ui.shortcuts['switch-sql'])) {
        e.preventDefault();
        switchViewModeRef.current('query');
        return;
      }
      if (shortcutService.matches(e, ui.shortcuts['add-server'])) {
        e.preventDefault();
        conn.setShowConnectionForm(true);
        return;
      }
      if (shortcutService.matches(e, ui.shortcuts['undo-mutation'])) {
        if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
          e.preventDefault();
          analysis.handleUndoMutation();
        }
        return;
      }
      if (shortcutService.matches(e, ui.shortcuts['sec-analysis'])) { e.preventDefault(); handleAiAnalysis('security'); return; }
      if (shortcutService.matches(e, ui.shortcuts['perf-analysis'])) { e.preventDefault(); handleAiAnalysis('performance'); return; }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);

    const checkBackend = () => {
      ai.fetchClis();
      ai.fetchRegisteredModels();
      apiService.fetchClis()
        .then(() => ui.setBackendStatus('connected'))
        .catch(() => ui.setBackendStatus('error'));
    };

    checkBackend();
    const interval = setInterval(checkBackend, 10000);

    conn.loadSavedConnections();
    loadSavedQueries();
    loadSavedConversations();
    conn.loadProtectedItems();

    return () => {
      clearInterval(interval);
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, []);

  // --- Auto-save conversations ---
  useEffect(() => {
    if (ai.chatHistory.length > 0) {
      const saveConv = async () => {
        const convId = conn.activeConnectionId + "-" + conn.activeDatabase;
        const newConv = {
          id: convId,
          title: `Chat on ${conn.activeDatabase} (${new Date().toLocaleString()})`,
          history: ai.chatHistory,
          connectionId: conn.activeConnectionId,
          database: conn.activeDatabase,
        };
        try {
          await storageService.saveItem('conversations', newConv);
          setSavedConversations(prev => {
            const exists = prev.find(c => c.id === convId);
            return exists ? prev.map(c => c.id === convId ? newConv : c) : [...prev, newConv];
          });
        } catch (err) { console.error("Failed to auto-save conversation:", err); }
      };
      saveConv();
    }
  }, [ai.chatHistory, conn.activeConnectionId, conn.activeDatabase]);

  return (
    <div className="h-screen w-screen flex bg-background text-textPrimary font-ui flex-row relative">

      {(conn.connections.length === 0 || conn.showConnectionForm) && (
        <ConnectionForm
          onConnected={handleConnected}
          onCancel={conn.connections.length > 0 ? () => conn.setShowConnectionForm(false) : undefined}
        />
      )}

      {ai.showApiModal && (
        <ApiRegistrationForm
          onCancel={() => { ai.setShowApiModal(false); ai.setEditingModel(null); }}
          onRegistered={ai.handleApiRegistered}
          editModel={ai.editingModel}
        />
      )}

      <Sidebar
        connections={conn.connections}
        activeConnectionId={conn.activeConnectionId}
        activeDatabase={conn.activeDatabase}
        openTabs={tabs.openTabs}
        sidebarCollapsed={ui.sidebarCollapsed}
        sidebarWidth={ui.sidebarWidth}
        showSavedItems={ui.showSavedItems}
        isResizingSidebar={ui.isResizingSidebar}
        savedQueries={savedQueries}
        savedConversations={savedConversations}
        protectedItems={conn.protectedItems}
        setSidebarCollapsed={ui.setSidebarCollapsed}
        setShowConnectionForm={conn.setShowConnectionForm}
        setShowSavedItems={ui.setShowSavedItems}
        setShowCreateDbModal={ui.setShowCreateDbModal}
        setActiveConnectionId={conn.setActiveConnectionId}
        setActiveDatabase={conn.setActiveDatabase}
        setSqlQuery={analysis.setSqlQuery}
        setViewMode={switchViewMode}
        setChatHistory={ai.setChatHistory}
        setSidebarWidth={ui.setSidebarWidth}
        handleDbChange={handleDbChange}
        handleDropDatabase={conn.handleDropDatabase}
        handleRefreshConnection={conn.handleRefreshConnection}
        handleExplorerContextMenu={ui.handleExplorerContextMenu}
        handleExplorerAction={handleExplorerAction}
        handleTableClick={handleTableClick}
        startResizingSidebar={ui.startResizingSidebar}
        storageService={storageService}
        setSavedQueries={setSavedQueries}
        setSavedConversations={setSavedConversations}
      />

      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <MainHeader
          openTabs={tabs.openTabs}
          activeTabId={tabs.activeTabId}
          viewMode={ui.viewMode}
          selectedCli={ai.selectedCli}
          availableClis={ai.availableClis}
          customCliCommand={ai.customCliCommand}
          chatHistory={ai.chatHistory}
          sessionContext={conn.sessionContext}
          registeredModels={ai.registeredModels}
          currentAbortController={analysis.currentAbortController}
          activeConfig={conn.activeConfig}
          handleDbChange={handleDbChange}
          closeTab={closeTab}
          setViewMode={switchViewMode}
          setSelectedCli={ai.setSelectedCli}
          setChatHistory={ai.setChatHistory}
          setShowApiModal={ai.setShowApiModal}
          setCustomCliCommand={ai.setCustomCliCommand}
          stopAi={analysis.stopAi}
          launchCli={launchCli}
          handleDebugLaunch={ai.handleDebugLaunch}
          handleEditModel={ai.handleEditModel}
          handleDeleteModel={ai.handleDeleteModel}
          setSessionContext={conn.setSessionContext}
        />

        {ui.viewMode === 'ai' && (
          <AiPanel
            topPanelHeight={ui.topPanelHeight}
            startResizingTopPanel={ui.startResizingTopPanel}
            activeConfig={conn.activeConfig}
            chatHistory={ai.chatHistory}
            attachedFile={ai.attachedFile}
            showTableMention={ai.showTableMention}
            filteredTableMentions={filteredTableMentions}
            selectedTable={ai.selectedTable}
            selectedAction={ai.selectedAction}
            prompt={ai.prompt}
            fileInputRef={ai.fileInputRef}
            setAttachedFile={ai.setAttachedFile}
            handleTableMentionSelect={ai.handleTableMentionSelect}
            handleActionSelect={ai.handleActionSelect}
            handleFileAttach={handleFileAttach}
            handlePromptChange={handlePromptChange}
            launchCli={launchCli}
            setSelectedTable={ai.setSelectedTable}
            setSelectedAction={ai.setSelectedAction}
            renderMessageContent={renderMessageContent}
          />
        )}

        {ui.viewMode === 'query' && (
          <QueryPanel
            topPanelHeight={ui.topPanelHeight}
            startResizingTopPanel={ui.startResizingTopPanel}
            sqlQuery={analysis.sqlQuery}
            isQueryExecuting={analysis.isQueryExecuting}
            setSqlQuery={analysis.setSqlQuery}
            executeManualQuery={executeManualQuery}
            handleSaveQuery={handleSaveQuery}
          />
        )}

        <ResultsPanel
          sqlResult={analysis.sqlResult}
          activeConfig={conn.activeConfig}
          activeSchemaName={conn.activeSchemaName}
          activeTableName={conn.activeTableName}
          currentAbortController={analysis.currentAbortController}
          copyFeedback={analysis.copyFeedback}
          activeDatabase={conn.activeDatabase}
          viewMode={ui.viewMode}
          setShowImportDbModal={ui.setShowImportDbModal}
          setShowExportDbModal={ui.setShowExportDbModal}
          setShowMigrationModal={ui.setShowMigrationModal}
          launchAiAnalysis={handleAiAnalysis}
          stopAi={analysis.stopAi}
          handleTranslateView={handleTranslateView}
          handleCopyResults={analysis.handleCopyResults}
          setDiagnosisTarget={ui.setDiagnosisTarget}
          executeManualQuery={executeManualQuery}
          refreshTableData={refreshTableData}
          setMutationHistory={analysis.setMutationHistory}
          setSqlResult={analysis.setSqlResult}
        />
      </main>

      <div
        onClick={() => ui.setShowCommandPalette(true)}
        className="absolute bottom-2 right-4 text-xs text-gray-500 font-ui cursor-pointer hover:text-primary transition-colors select-none"
      >
        Press <kbd className="bg-panel border border-border rounded px-1 ml-1 mr-1">Ctrl+K</kbd> for Command Palette
      </div>

      {ui.showCreateDbModal && conn.activeConn && (
        <CreateDatabaseForm
          activeConfig={{ ...conn.activeConn.config, database: "" }}
          onCancel={() => ui.setShowCreateDbModal(false)}
          onSuccess={(newDbName) => {
            conn.handleCreateDatabaseSuccess(newDbName);
            handleDbChange(conn.activeConnectionId, newDbName);
          }}
        />
      )}

      {ui.showExportDbModal && conn.activeConfig && (
        <ExportForm
          isDatabase={true}
          targetName={conn.activeDatabase}
          activeConfig={conn.activeConfig}
          onCancel={() => ui.setShowExportDbModal(false)}
        />
      )}

      {ui.showImportDbModal && conn.activeConfig && (
        <ImportForm
          isDatabase={true}
          targetName={conn.activeDatabase}
          activeConfig={conn.activeConfig}
          onCancel={() => ui.setShowImportDbModal(false)}
          onSuccess={() => {
            ui.setShowImportDbModal(false);
            if (conn.activeConnectionId) conn.handleRefreshConnection(conn.activeConnectionId);
          }}
        />
      )}

      {ui.showMigrationModal && (
        <DataMigrationForm
          connections={conn.connections}
          onCancel={() => ui.setShowMigrationModal(false)}
          onSuccess={(msg) => { alert(msg); refreshTableData(); }}
        />
      )}

      {ui.showCopyDbModal && (
        <DatabaseCopyForm
          connections={conn.connections}
          sourcePreset={ui.copyDbSource}
          onCancel={() => { ui.setShowCopyDbModal(false); ui.setCopyDbSource(null); }}
          onSuccess={(msg, targetConnId) => {
            alert(msg);
            ui.setShowCopyDbModal(false);
            ui.setCopyDbSource(null);
            if (targetConnId) conn.handleRefreshConnection(targetConnId);
          }}
        />
      )}

      {ui.contextMenu && (
        <ExplorerContextMenu
          x={ui.contextMenu.x}
          y={ui.contextMenu.y}
          entity={ui.contextMenu.entity}
          onClose={() => ui.setContextMenu(null)}
          onAction={handleExplorerAction}
        />
      )}

      {ui.serverActionModal && (
        <ServerActionModal
          type={ui.serverActionModal.type}
          server={ui.serverActionModal.server}
          onClose={() => ui.setServerActionModal(null)}
          onConfirm={handleServerActionConfirm}
        />
      )}

      {ui.diagnosisTarget && (
        <ProtectionDiagnosisModal
          schemaName={ui.diagnosisTarget.schema}
          tableName={ui.diagnosisTarget.table}
          activeConfig={conn.activeConfig}
          onClose={() => ui.setDiagnosisTarget(null)}
          onApplyFix={(step) => {
            if (!conn.sessionContext.includes(step)) {
              conn.setSessionContext(prev => [...prev, step]);
            }
            if (conn.activeTableName === ui.diagnosisTarget.table) {
              refreshTableData();
            }
          }}
        />
      )}

      {ui.propertiesModal && (
        <PropertiesModal
          entity={ui.propertiesModal.entity}
          onClose={() => ui.setPropertiesModal(null)}
        />
      )}

      <CommandPalette
        isOpen={ui.showCommandPalette}
        onClose={() => ui.setShowCommandPalette(false)}
        commands={[
          { id: 'add-server', name: 'Add Server Connection', category: 'Connections', icon: '🖥️', shortcut: ui.shortcuts['add-server'], action: () => conn.setShowConnectionForm(true) },
          { id: 'add-api', name: 'Register API Model', category: 'AI', icon: '🤖', action: () => ai.setShowApiModal(true) },
          { id: 'switch-ai', name: 'Switch to AI Prompt Mode', category: 'View', icon: '💬', shortcut: ui.shortcuts['switch-ai'], action: () => switchViewMode('ai') },
          { id: 'switch-sql', name: 'Switch to SQL Editor Mode', category: 'View', icon: '📜', shortcut: ui.shortcuts['switch-sql'], action: () => switchViewMode('query') },
          { id: 'toggle-sidebar', name: 'Toggle Sidebar', category: 'View', icon: '↔️', shortcut: ui.shortcuts['toggle-sidebar'], action: () => ui.setSidebarCollapsed(!ui.sidebarCollapsed) },
          { id: 'sec-analysis', name: 'Run Security Analysis', category: 'Analysis', icon: '🔒', shortcut: ui.shortcuts['sec-analysis'], action: () => handleAiAnalysis('security') },
          { id: 'perf-analysis', name: 'Run Performance Analysis', category: 'Analysis', icon: '⚡', shortcut: ui.shortcuts['perf-analysis'], action: () => handleAiAnalysis('performance') },
          { id: 'data-analysis', name: 'Run Data Analysis', category: 'Analysis', icon: '📊', action: () => handleAiAnalysis('data') },
          { id: 'sum-analysis', name: 'Run Summary Analysis', category: 'Analysis', icon: '📝', action: () => handleAiAnalysis('summary') },
          { id: 'copy-db', name: 'Copy Database', category: 'Data', icon: '📋', action: () => ui.setShowCopyDbModal(true) },
          { id: 'etl-mapping', name: 'Open ETL / Data Mapping', category: 'Data', icon: '🔄', action: () => ui.setShowMigrationModal(true) },
          { id: 'export-db', name: 'Export Active Database', category: 'Data', icon: '📤', action: () => conn.activeDatabase ? ui.setShowExportDbModal(true) : alert("Please select a database first") },
          { id: 'import-db', name: 'Import to Active Database', category: 'Data', icon: '📥', action: () => conn.activeDatabase ? ui.setShowImportDbModal(true) : alert("Please select a database first") },
          { id: 'clear-chat', name: 'Clear Chat History', category: 'AI', icon: '🧹', action: () => ai.setChatHistory([]) },
          { id: 'undo-mutation', name: 'Undo Last Mutation', category: 'Data', icon: '↩️', shortcut: ui.shortcuts['undo-mutation'], action: analysis.handleUndoMutation },
          { id: 'config-shortcuts', name: 'Configure Keyboard Shortcuts', category: 'System', icon: '⌨️', action: () => ui.setShowShortcutsModal(true) },
          {
            id: 'save-query', name: 'Save Current Query', category: 'Data', icon: '💾', action: () => {
              if (ui.viewMode === 'query' && analysis.sqlQuery.trim()) {
                const name = window.prompt("Enter a name for this query:");
                if (name) handleSaveQuery(analysis.sqlQuery, name);
              } else { alert("Switch to SQL Editor and write a query first"); }
            }
          },
        ]}
      />

      <ShortcutsModal
        isOpen={ui.showShortcutsModal}
        onClose={() => ui.setShowShortcutsModal(false)}
        shortcuts={ui.shortcuts}
        onSave={ui.handleSaveShortcut}
      />

    </div>
  );
}

export default App;
