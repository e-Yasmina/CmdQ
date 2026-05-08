import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import ScrollArea from './components/ScrollArea';
import SchemaAccordion from './components/SchemaAccordion';
import ConnectionForm from './components/forms/ConnectionForm';
import ApiRegistrationForm from './components/forms/ApiRegistrationForm';
import ExportForm from './components/forms/ExportForm';
import ImportForm from './components/forms/ImportForm';
import CreateDatabaseForm from './components/forms/CreateDatabaseForm';
import QueryEditor from './components/QueryEditor';
import DataTable from './components/DataTable';
import SecurityAnalysisViewer from './components/SecurityAnalysisViewer';
import PerformanceAnalysisViewer from './components/PerformanceAnalysisViewer';
import DataAnalysisViewer from './components/DataAnalysisViewer';
import SummaryAnalysisViewer from './components/SummaryAnalysisViewer';
import DataMigrationForm from './components/forms/DataMigrationForm';
import { apiService } from './services/apiService';
import { storageService } from './services/storageService';
import { shortcutService } from './services/shortcutService';
import ExplorerContextMenu from './components/ExplorerContextMenu';
import ServerActionModal from './components/ServerActionModal';
import ProtectionDiagnosisModal from './components/ProtectionDiagnosisModal';
import PropertiesModal from './components/PropertiesModal';
import CommandPalette from './components/CommandPalette';
import ShortcutsModal from './components/ShortcutsModal';

// Better Chevron SVGs
const ChevronRight = ({ className }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
);

const ChevronLeft = ({ className }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
);

const ChevronDown = ({ className }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
);

const CopyIcon = ({ className }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg>
);

function App() {
  const [prompt, setPrompt] = useState("");
  const [sqlResult, setSqlResult] = useState(null);
  const [sqlQuery, setSqlQuery] = useState("");

  // New Connection State
  const [connections, setConnections] = useState([]); // Array of { id, config, databases, schemas: {} }
  const [activeConnectionId, setActiveConnectionId] = useState(null);
  const [activeDatabase, setActiveDatabase] = useState(null);
  const [activeSchemaName, setActiveSchemaName] = useState(null);
  const [activeTableName, setActiveTableName] = useState(null);
  const [showConnectionForm, setShowConnectionForm] = useState(false);

  const [openTabs, setOpenTabs] = useState([]);
  const [activeTabId, setActiveTabId] = useState(null);
  const tabStateCache = useRef({});

  const closeTab = (tabId) => {
    setOpenTabs(prev => prev.filter(id => id !== tabId));
    delete tabStateCache.current[tabId];
    if (`${activeConnectionId}::${activeDatabase}` === tabId) {
      setActiveConnectionId(null);
      setActiveDatabase(null);
      setSqlResult(null);
      setChatHistory([]);
      setActiveTabId(null);
    }
  };

  // Derived state
  const activeConn = connections.find(c => c.id === activeConnectionId);
  const activeConfig = useMemo(() => activeConn ? { ...activeConn.config, database: activeDatabase || "" } : null, [activeConn, activeDatabase]);
  const activeSchema = useMemo(() => activeConn && activeDatabase && activeConn.schemas ? activeConn.schemas[activeDatabase] : null, [activeConn, activeDatabase]);

  // AI CLI State
  const [availableClis, setAvailableClis] = useState([]);
  const [selectedCli, setSelectedCli] = useState("");
  const [customCliCommand, setCustomCliCommand] = useState("");
  const [chatHistory, setChatHistory] = useState([]);

  // API Model Registration State
  const [showApiModal, setShowApiModal] = useState(false);

  // Persistence State
  const [savedQueries, setSavedQueries] = useState([]);
  const [savedConversations, setSavedConversations] = useState([]);
  const [showSavedItems, setShowSavedItems] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [protectedItems, setProtectedItems] = useState([]);

  // View Mode: 'ai' | 'query'
  const [viewMode, setViewMode] = useState('ai');
  const [isQueryExecuting, setIsQueryExecuting] = useState(false);
  const [currentAbortController, setCurrentAbortController] = useState(null);

  // DB Export/Import Modal State
  const [showExportDbModal, setShowExportDbModal] = useState(false);
  const [showImportDbModal, setShowImportDbModal] = useState(false);

  // Data Migration Modal State
  const [showMigrationModal, setShowMigrationModal] = useState(false);

  // Create DB Modal State
  const [showCreateDbModal, setShowCreateDbModal] = useState(false);
  const [backendStatus, setBackendStatus] = useState('checking'); // 'connected' | 'error' | 'checking'

  // Context Menu State
  const [contextMenu, setContextMenu] = useState(null); // { x, y, server }

  // Server Action Modal State
  const [serverActionModal, setServerActionModal] = useState(null); // { type, server }

  // Properties Modal State
  const [propertiesModal, setPropertiesModal] = useState(null); // { entity }

  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [shortcuts, setShortcuts] = useState(shortcutService.getShortcuts());
  const [mutationHistory, setMutationHistory] = useState([]); // Array of previous sqlResult states

  // Resizable Panels State
  const [sidebarWidth, setSidebarWidth] = useState(256);
  const [topPanelHeight, setTopPanelHeight] = useState(300);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [isResizingTopPanel, setIsResizingTopPanel] = useState(false);

  // Protection Diagnosis
  const [diagnosisTarget, setDiagnosisTarget] = useState(null); // { schema, table }
  const [sessionContext, setSessionContext] = useState([]); // List of SET commands

  const [copyFeedback, setCopyFeedback] = useState(false);

  const startResizingSidebar = useCallback((e) => {
    e.preventDefault();
    setIsResizingSidebar(true);
  }, []);

  const startResizingTopPanel = useCallback((e) => {
    e.preventDefault();
    setIsResizingTopPanel(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizingSidebar(false);
    setIsResizingTopPanel(false);
  }, []);

  const resize = useCallback((e) => {
    if (isResizingSidebar) {
      const newWidth = e.clientX;
      if (newWidth > 48 && newWidth < 600) {
        setSidebarWidth(newWidth);
      }
    }
    if (isResizingTopPanel) {
      const newHeight = e.clientY - 84; // Subtract header height approximately
      if (newHeight > 100 && newHeight < window.innerHeight - 200) {
        setTopPanelHeight(newHeight);
      }
    }
  }, [isResizingSidebar, isResizingTopPanel]);

  useEffect(() => {
    if (isResizingSidebar || isResizingTopPanel) {
      window.addEventListener('mousemove', resize);
      window.addEventListener('mouseup', stopResizing);
    } else {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    }
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [isResizingSidebar, isResizingTopPanel, resize, stopResizing]);

  const handleSaveShortcut = (id, combo, reset = false) => {
    if (reset) {
      const defaults = shortcutService.resetShortcuts();
      setShortcuts(defaults);
    } else {
      const updated = shortcutService.saveShortcut(id, combo);
      setShortcuts({ ...updated });
    }
  };

  const handleUndoMutation = () => {
    if (mutationHistory.length === 0) return;
    const lastState = mutationHistory[mutationHistory.length - 1];
    setSqlResult(lastState);
    setMutationHistory(prev => prev.slice(0, -1));
  };

  const handleCopyResults = () => {
    if (!sqlResult) return;

    let textToCopy = "";

    // 1. Check for table data
    if (sqlResult.data && sqlResult.data.length > 0) {
      textToCopy = JSON.stringify(sqlResult.data, null, 2);
    }
    // 2. Check for specialized analysis
    else if (['security_analysis', 'performance_analysis', 'data_analysis', 'summary_analysis'].includes(sqlResult.type)) {
      // Exclude type and loading from the copy
      const { type, loading, ...rest } = sqlResult;
      textToCopy = JSON.stringify(rest, null, 2);
    }
    // 3. Check for AI message
    else if (sqlResult.message) {
      textToCopy = sqlResult.message;
    }

    if (textToCopy) {
      navigator.clipboard.writeText(textToCopy).then(() => {
        setCopyFeedback(true);
        setTimeout(() => setCopyFeedback(false), 2000);
      }).catch(err => {
        console.error("Failed to copy:", err);
        alert("Failed to copy to clipboard");
      });
    }
  };

  const fetchClis = () => {
    apiService.fetchClis()
      .then(data => {
        if (data.status === "success" && data.clis) {
          setAvailableClis(data.clis);
          if (data.clis.length > 0) {
            setSelectedCli(prev => {
              const stillExists = data.clis.some(c => c.command === prev);
              return stillExists ? prev : data.clis[0].command;
            });
          }
        }
      })
      .catch(err => console.error("Failed to fetch CLIs:", err));
  };

  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      // Priority: Command Palette
      if (shortcutService.matches(e, shortcuts['command-palette'])) {
        e.preventDefault();
        setShowCommandPalette(prev => !prev);
        return;
      }

      // Sidebar Toggle
      if (shortcutService.matches(e, shortcuts['toggle-sidebar'])) {
        e.preventDefault();
        setSidebarCollapsed(prev => !prev);
        return;
      }

      // View Modes
      if (shortcutService.matches(e, shortcuts['switch-ai'])) {
        e.preventDefault();
        setViewMode('ai');
        return;
      }
      if (shortcutService.matches(e, shortcuts['switch-sql'])) {
        e.preventDefault();
        setViewMode('query');
        return;
      }

      // Actions
      if (shortcutService.matches(e, shortcuts['add-server'])) {
        e.preventDefault();
        setShowConnectionForm(true);
        return;
      }

      // Undo Mutation (Ctrl+Z)
      if (shortcutService.matches(e, shortcuts['undo-mutation'])) {
        // Only undo if not typing in an input/textarea
        if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
          e.preventDefault();
          handleUndoMutation();
        }
        return;
      }

      // Analyses
      if (shortcutService.matches(e, shortcuts['sec-analysis'])) { e.preventDefault(); launchAiAnalysis('security'); return; }
      if (shortcutService.matches(e, shortcuts['perf-analysis'])) { e.preventDefault(); launchAiAnalysis('performance'); return; }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);

    const checkBackend = () => {
      fetchClis(); // This also checks connectivity implicitly
      apiService.fetchClis()
        .then(() => setBackendStatus('connected'))
        .catch(() => setBackendStatus('error'));
    };

    checkBackend();
    const interval = setInterval(checkBackend, 10000); // Check every 10s

    loadSavedConnections();
    loadSavedQueries();
    loadSavedConversations();
    loadProtectedItems();

    return () => {
      clearInterval(interval);
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, []);

  const loadProtectedItems = () => {
    try {
      const saved = localStorage.getItem('cmdq_protected_items');
      if (saved) setProtectedItems(JSON.parse(saved) || []);
    } catch (err) {
      console.error("Failed to load protected items:", err);
    }
  };

  const loadSavedQueries = async () => {
    try {
      const saved = await storageService.getItems('queries');
      setSavedQueries(saved || []);
    } catch (err) {
      console.error("Failed to load saved queries:", err);
    }
  };

  const loadSavedConversations = async () => {
    try {
      const saved = await storageService.getItems('conversations');
      setSavedConversations(saved || []);
    } catch (err) {
      console.error("Failed to load saved conversations:", err);
    }
  };

  const loadSavedConnections = async () => {
    try {
      const saved = await storageService.getItems('connections');
      if (saved && saved.length > 0) {
        setConnections(saved);
      }
    } catch (err) {
      console.error("Failed to load saved connections:", err);
    }
  };

  const fetchSchema = async (config) => {
    try {
      const data = await apiService.fetchSchema(config);
      return data.schema;
    } catch (err) {
      console.error("Failed to fetch schema", err);
      return null;
    }
  };

  const handleConnected = async (dbs, initialDb, config) => {
    const newConnId = config.server_name || `${config.user}@${config.host}:${config.port}`;

    // Check if connection already exists
    let connExists = connections.find(c => c.id === newConnId);

    if (!connExists) {
      const initialSchema = await fetchSchema(config); // config already has database: initialDb

      const newConnection = {
        id: newConnId,
        config: config,
        databases: dbs,
        schemas: {
          [initialDb]: initialSchema
        }
      };

      setConnections(prev => [...prev, newConnection]);
      // Persist to disk
      storageService.saveItem('connections', newConnection).catch(err => console.error("Failed to save connection:", err));
    }

    setActiveConnectionId(newConnId);
    setActiveDatabase(initialDb);
    setActiveSchemaName(null);
    setActiveTableName(null);
    setShowConnectionForm(false);
    setChatHistory([]);
    setSqlResult(null);
  };

  const handleRefreshConnection = async (connId) => {
    const connIndex = connections.findIndex(c => c.id === connId);
    if (connIndex === -1) return;

    const conn = connections[connIndex];
    try {
      // Re-fetch databases
      const dbsData = await apiService.connectDb(conn.config);
      if (dbsData.status === "success") {
        setConnections(prev => {
          const newConns = [...prev];
          newConns[connIndex] = { ...conn, databases: dbsData.databases.sort() };
          return newConns;
        });
      }

      // Re-fetch schema for active database if it belongs to this connection
      if (activeConnectionId === connId && activeDatabase) {
        const configForDb = { ...conn.config, database: activeDatabase };
        const schema = await fetchSchema(configForDb);
        setConnections(prev => {
          const newConns = [...prev];
          newConns[connIndex] = {
            ...newConns[connIndex],
            schemas: {
              ...newConns[connIndex].schemas,
              [activeDatabase]: schema
            }
          };
          return newConns;
        });
      }
    } catch (err) {
      console.error("Failed to refresh connection:", err);
      alert("Failed to refresh connection: " + err.message);
    }
  };

  const handleDbChange = async (connId, dbName) => {
    const nextTabId = `${connId}::${dbName}`;
    const prevTabId = activeConnectionId && activeDatabase ? `${activeConnectionId}::${activeDatabase}` : null;

    // Save current active state before switching
    if (prevTabId) {
      tabStateCache.current[prevTabId] = {
        chatHistory, sqlResult, sqlQuery, prompt, viewMode, activeSchemaName, activeTableName
      };
    }

    const cached = tabStateCache.current[nextTabId] || {
      chatHistory: [], sqlResult: null, sqlQuery: "", prompt: "", viewMode: "ai", activeSchemaName: null, activeTableName: null
    };

    setActiveConnectionId(connId);
    setActiveDatabase(dbName);
    setActiveSchemaName(cached.activeSchemaName);
    setActiveTableName(cached.activeTableName);
    setChatHistory(cached.chatHistory);
    setSqlResult(cached.sqlResult);
    setSqlQuery(cached.sqlQuery);
    setPrompt(cached.prompt);
    setViewMode(cached.viewMode);

    setOpenTabs(prev => prev.includes(nextTabId) ? prev : [...prev, nextTabId]);
    setActiveTabId(nextTabId);

    const connIndex = connections.findIndex(c => c.id === connId);
    if (connIndex >= 0) {
      const conn = connections[connIndex];
      if (!conn.schemas[dbName]) {
        // fetch schema for the newly selected DB
        const configForDb = { ...conn.config, database: dbName };
        const schema = await fetchSchema(configForDb);
        setConnections(prev => {
          const newConns = [...prev];
          newConns[connIndex] = {
            ...conn,
            schemas: {
              ...conn.schemas,
              [dbName]: schema
            }
          };
          return newConns;
        });
      }
    }
  };

  const handleCreateDatabaseSuccess = (newDbName) => {
    const connIndex = connections.findIndex(c => c.id === activeConnectionId);
    if (connIndex >= 0) {
      setConnections(prev => {
        const newConns = [...prev];
        if (!newConns[connIndex].databases.includes(newDbName)) {
          newConns[connIndex].databases = [...newConns[connIndex].databases, newDbName].sort();
        }
        return newConns;
      });
      handleDbChange(activeConnectionId, newDbName);
    }
  };

  const handleDropDatabase = async (connId, dbName) => {
    if (!window.confirm(`Are you sure you want to permanently delete the database "${dbName}"?\nThis action cannot be undone.`)) {
      return;
    }

    const connIndex = connections.findIndex(c => c.id === connId);
    if (connIndex === -1) return;
    const conn = connections[connIndex];

    try {
      await apiService.dropDatabase({
        db_config: conn.config,
        db_name: dbName
      });

      // Update local state to remove the dropped DB
      setConnections(prev => {
        const newConns = [...prev];
        const newDbs = conn.databases.filter(d => d !== dbName);
        newConns[connIndex] = { ...conn, databases: newDbs };
        return newConns;
      });

      // If we dropped the currently active DB, clear the view
      if (activeConnectionId === connId && activeDatabase === dbName) {
        setActiveDatabase(null);
        setActiveSchemaName(null);
        setActiveTableName(null);
        setSqlResult(null);
        setChatHistory([]);
      }

      alert(`Database '${dbName}' dropped successfully.`);
    } catch (err) {
      console.error("Failed to drop database:", err);
      alert("Error dropping database: " + err.message);
    }
  };

  const handleTableClick = async (connId, dbName, schemaName, tableName) => {
    // Make sure we are viewing the right connection
    if (activeConnectionId !== connId || activeDatabase !== dbName) {
      await handleDbChange(connId, dbName);
    }

    const conn = connections.find(c => c.id === connId);
    if (!conn) return;

    setActiveSchemaName(schemaName);
    setActiveTableName(tableName);

    const conf = { ...conn.config, database: dbName };

    setViewMode('query');
    setSqlResult({ loading: true });
    setIsQueryExecuting(true);
    try {
      const data = await apiService.fetchTableData({
        schema_name: schemaName,
        table_name: tableName,
        limit: 100,
        offset: 0,
        db_config: conf,
        session_context: sessionContext
      });
      if (data.status === "error") {
        setSqlResult({ error: data.message || "Failed to fetch table data" });
        return;
      }

      const tableInfo = conn.schemas[dbName]?.[schemaName]?.[tableName];
      console.log("DEBUG: tableInfo for", tableName, tableInfo);
      const hasRls = tableInfo?.has_rls || false;
      const columns = Array.isArray(tableInfo) ? tableInfo : (tableInfo?.columns || []);
      const constraints = tableInfo?.constraints || [];

      setSqlResult({
        data: data.data || [],
        original_data: data.data ? JSON.parse(JSON.stringify(data.data)) : [],
        extracted_sql: `SELECT * FROM ${schemaName}.${tableName} LIMIT 100`,
        message: `Fetched 100 rows from ${tableName}`,
        isTableClick: true,
        targetSchema: schemaName,
        targetTable: tableName,
        hasRls: hasRls,
        columns: columns,
        constraints: constraints
      });
    } catch (err) {
      setSqlResult({ error: "Failed to fetch table data: " + err.message });
    } finally {
      setIsQueryExecuting(false);
    }
  };

  const refreshTableData = () => {
    if (activeConnectionId && activeDatabase && activeSchemaName && activeTableName) {
      handleTableClick(activeConnectionId, activeDatabase, activeSchemaName, activeTableName);
    }
  };

  const extractTableFromQuery = (query) => {
    if (!query) return null;
    const match = query.match(/from\s+([`"]?[a-zA-Z0-9_]+[`"]?(?:\.[`"]?[a-zA-Z0-9_]+[`"]?)?)/i);
    if (match) {
      const full = match[1].replace(/[`"]/g, '');
      const parts = full.split('.');
      if (parts.length === 2) {
        return { schema: parts[0], table: parts[1] };
      }
      return { schema: activeConfig?.db_type === 'postgres' ? 'public' : activeDatabase, table: parts[0] };
    }
    return null;
  };

  const executeManualQuery = async (queryText) => {
    if (!activeConfig || !queryText.trim()) return;
    setSqlResult({ loading: true });
    setIsQueryExecuting(true);
    try {
      const data = await apiService.executeQuery({
        query: queryText,
        db_config: activeConfig,
        session_context: sessionContext
      });

      const extracted = extractTableFromQuery(queryText);
      const isSelect = queryText.toLowerCase().trim().startsWith('select');

      if (data.status === "error") {
        setSqlResult({ error: data.message || "Query Failed" });
        return;
      }

      setSqlResult({
        data: data.data || [],
        original_data: data.data ? JSON.parse(JSON.stringify(data.data)) : [],
        message: data.message,
        extracted_sql: queryText,
        isTableClick: false,
        targetSchema: (isSelect && extracted) ? extracted.schema : null,
        targetTable: (isSelect && extracted) ? extracted.table : null
      });
    } catch (err) {
      setSqlResult({ error: err.message });
    } finally {
      setIsQueryExecuting(false);
    }
  };

  const stopAi = () => {
    if (currentAbortController) {
      currentAbortController.abort();
      setCurrentAbortController(null);
      setSqlResult(prev => ({ ...prev, loading: false }));
    }
  };

  const handleSaveQuery = async (queryText, name) => {
    const newQuery = {
      id: Date.now().toString(),
      name: name,
      query: queryText,
      connectionId: activeConnectionId,
      database: activeDatabase
    };
    try {
      await storageService.saveItem('queries', newQuery);
      setSavedQueries(prev => [...prev, newQuery]);
    } catch (err) {
      alert("Failed to save query: " + err.message);
    }
  };

  useEffect(() => {
    if (chatHistory.length > 0) {
      const saveConv = async () => {
        const convId = activeConnectionId + "-" + activeDatabase;
        const newConv = {
          id: convId,
          title: `Chat on ${activeDatabase} (${new Date().toLocaleString()})`,
          history: chatHistory,
          connectionId: activeConnectionId,
          database: activeDatabase
        };
        try {
          await storageService.saveItem('conversations', newConv);
          setSavedConversations(prev => {
            const exists = prev.find(c => c.id === convId);
            if (exists) {
              return prev.map(c => c.id === convId ? newConv : c);
            }
            return [...prev, newConv];
          });
        } catch (err) {
          console.error("Failed to auto-save conversation:", err);
        }
      };
      saveConv();
    }
  }, [chatHistory]);

  const handleTranslateView = async () => {
    if (!sqlResult?.data || sqlResult.data.length === 0) {
      alert("No data available to translate. Please run a query first.");
      return;
    }

    const command = selectedCli === "custom" ? customCliCommand : selectedCli;
    if (!command) {
      alert("Please select or register an AI provider in the AI settings first.");
      return;
    }

    setSqlResult(prev => ({ ...prev, loading: true, message: "Translating view via AI... this may take a moment depending on the result size." }));
    try {
      const translatedData = await apiService.translateTable({
        command: command,
        table_data: sqlResult.data
      });
      setSqlResult(prev => ({
        ...prev,
        original_data: prev.original_data || prev.data,
        data: translatedData.data,
        message: "Translation applied to view.",
        loading: false
      }));
    } catch (err) {
      setSqlResult(prev => ({ ...prev, loading: false, error: "Failed to translate: " + err.message }));
    }
  };

  const handleDebugLaunch = async () => {
    console.log("DEBUG: handleDebugLaunch called. selectedCli:", selectedCli, "customCliCommand:", customCliCommand);
    try {
      const command = selectedCli === "custom" ? customCliCommand : selectedCli;
      console.log("DEBUG: Resolved command to launch:", command);
      if (!command) {
        alert("Please enter a CLI command.");
        return;
      }
      const data = await apiService.launchDebugCli({
        command: command,
        db_config: activeConfig
      });
      console.log("DEBUG: launchDebugCli response:", data);
      alert(data.message);
    } catch (err) {
      console.error("DEBUG: launchDebugCli error:", err);
      alert("Failed to launch debug terminal: " + err.message);
    }
  };

  const launchCli = async () => {
    try {
      const command = selectedCli === "custom" ? customCliCommand : selectedCli;
      if (!command) {
        alert("Please enter a CLI command.");
        return;
      }
      if (!prompt) {
        alert("Please enter a prompt instruction at the bottom.");
        return;
      }

      const controller = new AbortController();
      setCurrentAbortController(controller);
      setSqlResult({ loading: true });

      const payload = {
        command: command,
        prompt: prompt,
        db_config: activeConfig,
        schema_data: activeSchema || {},
        chat_history: chatHistory,
        protected_items: protectedItems,
        session_context: sessionContext
      };

      const data = await apiService.launchAiPrompt(payload, controller.signal);

      if (data.extracted_sql) {
        const extracted = extractTableFromQuery(data.extracted_sql);
        const isSelect = data.extracted_sql.toLowerCase().trim().startsWith('select');
        data.isTableClick = false;
        data.targetSchema = (isSelect && extracted) ? extracted.schema : null;
        data.targetTable = (isSelect && extracted) ? extracted.table : null;
      }

      setSqlResult(data);
      setChatHistory(prev => [
        ...prev,
        { role: "user", content: prompt },
        { role: "assistant", content: data.message || "Action completed." }
      ]);
      setPrompt("");
      console.log("Executed seamlessly:", data);
    } catch (err) {
      if (err.name === 'AbortError') {
        setSqlResult({ error: "Operation stopped by user." });
      } else {
        console.error("CLI Execution Error:", err.message);
        setSqlResult({ error: "Execution failed. Please check the console for more details." });
      }
    } finally {
      setCurrentAbortController(null);
    }
  };

  const handleApiRegistered = (newId) => {
    setShowApiModal(false);
    fetchClis();
    setSelectedCli(newId);
  };

  const launchAiAnalysis = async (type) => {
    if (!activeConfig) return;

    let targetType = activeTableName ? "table" : "database";
    let targetName = activeTableName ? `${activeSchemaName}.${activeTableName}` : activeDatabase;

    const command = selectedCli === "custom" ? customCliCommand : selectedCli;

    // We allow specialized analysis even without command (only data/charts), 
    // but the other analyses still need prompt for now.
    if (!command && (type !== 'security' && type !== 'performance' && type !== 'data' && type !== 'summary')) {
      alert("Please select or enter an AI CLI command first.");
      return;
    }

    setViewMode('query'); // Show results in the output area
    setSqlResult({ loading: true });
    setIsQueryExecuting(true);

    const controller = new AbortController();
    setCurrentAbortController(controller);

    try {
      if (type === 'security') {
        const payload = {
          command: command || "",
          db_config: activeConfig,
          schema_name: activeSchemaName || "",
          table_name: activeTableName || ""
        };
        const data = await apiService.fetchSecurityAnalysis(payload, controller.signal);
        setSqlResult({ type: 'security_analysis', ...data });
      } else if (type === 'performance') {
        const payload = {
          command: command || "",
          db_config: activeConfig,
          schema_name: activeSchemaName || "",
          table_name: activeTableName || ""
        };
        const data = await apiService.fetchPerformanceAnalysis(payload, controller.signal);
        setSqlResult({ type: 'performance_analysis', ...data });
      } else if (type === 'data') {
        const payload = {
          command: command || "",
          db_config: activeConfig,
          schema_name: activeSchemaName || "",
          table_name: activeTableName || ""
        };
        const data = await apiService.fetchDataAnalysis(payload, controller.signal);
        setSqlResult({ type: 'data_analysis', ...data });
      } else if (type === 'summary') {
        const payload = {
          command: command || "",
          db_config: activeConfig,
          schema_name: activeSchemaName || "",
          table_name: activeTableName || ""
        };
        const data = await apiService.fetchSummaryAnalysis(payload, controller.signal);
        setSqlResult({ type: 'summary_analysis', ...data });
      } else {
        setSqlResult({ error: "Unknown analysis type" });
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        setSqlResult({ error: "Analysis stopped by user." });
      } else {
        console.error(`${type} Analysis Error:`, err);
        setSqlResult({ error: "Analysis failed: " + err.message });
      }
    } finally {
      setIsQueryExecuting(false);
      setCurrentAbortController(null);
    }
  };

  const handleExplorerContextMenu = (e, entity) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      entity: entity
    });
  };

  const handleExplorerAction = async (action, entity) => {
    if (action === 'toggle_protect') {
      const idMap = {
        'server': entity.server?.id,
        'database': `${entity.server?.id}::${entity.database}`,
        'schema': `${entity.server?.id}::${entity.database}::${entity.schemaName}`,
        'table': `${entity.server?.id}::${entity.database}::${entity.schemaName}::${entity.tableName}`
      };
      const id = idMap[entity.type];
      if (id) {
        const newProtected = protectedItems.includes(id)
          ? protectedItems.filter(p => p !== id)
          : [...protectedItems, id];
        setProtectedItems(newProtected);
        localStorage.setItem('cmdq_protected_items', JSON.stringify(newProtected));
      }
      return;
    }

    if (entity.type === 'server') {
      const server = entity.server;
      switch (action) {
        case 'rename':
        case 'properties':
        case 'backup':
          setServerActionModal({ type: action, server: server });
          break;
        case 'disconnect':
          if (window.confirm(`Disconnect from ${server.config.server_name || server.id}?`)) {
            setConnections(prev => prev.filter(c => c.id !== server.id));
            storageService.deleteItem('connections', server.id);
            if (activeConnectionId === server.id) {
              setActiveConnectionId(null);
              setActiveDatabase(null);
            }
          }
          break;
        case 'refresh':
        case 'reload':
          handleRefreshConnection(server.id);
          break;
        default:
          break;
      }
    } else if (entity.type === 'database') {
      if (action === 'refresh') handleRefreshConnection(entity.server.id);
      if (action === 'delete') handleDropDatabase(entity.server.id, entity.database);
      if (action === 'export') { setShowExportDbModal(true); setActiveDatabase(entity.database); }
      if (action === 'properties') setPropertiesModal({ entity });
    } else if (entity.type === 'schema') {
      if (action === 'refresh') handleRefreshConnection(entity.server.id);
      if (action === 'export') { setShowExportDbModal(true); setActiveDatabase(entity.database); setActiveSchemaName(entity.schemaName); }
      if (action === 'properties') setPropertiesModal({ entity });
    } else if (entity.type === 'table') {
      if (action === 'refresh') handleRefreshConnection(entity.server.id);
      if (action === 'export') { setShowExportDbModal(true); setActiveDatabase(entity.database); setActiveSchemaName(entity.schemaName); setActiveTableName(entity.tableName); }
      if (action === 'properties') setPropertiesModal({ entity });
    }
  };

  const handleServerActionConfirm = async (data) => {
    const { type, server } = serverActionModal;

    if (type === 'rename') {
      const newName = data;
      const updatedConn = { ...server, config: { ...server.config, server_name: newName } };
      setConnections(prev => prev.map(c => c.id === server.id ? updatedConn : c));
      storageService.saveItem('connections', updatedConn);
    } else if (type === 'backup') {
      const dbName = data;
      try {
        const blob = await apiService.exportDatabase({
          db_config: { ...server.config, database: dbName },
          format: 'sql'
        });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `${dbName}_backup_${new Date().toISOString().split('T')[0]}.sql`);
        document.body.appendChild(link);
        link.click();
        link.parentNode.removeChild(link);
      } catch (err) {
        alert("Backup failed: " + err.message);
      }
    }
    setServerActionModal(null);
  };

  const renderMessageContent = (content) => {
    const paragraphs = content.split('\n\n');
    const processParagraphs = [];
    const resultParagraphs = [];

    let isProcess = true;
    for (const p of paragraphs) {
      const pLower = p.toLowerCase();
      if (p.startsWith('```') || pLower.includes('here is') || pLower.includes('to determine') || pLower.includes('the answer') || pLower.includes('you can execute')) {
        isProcess = false;
      }

      if (isProcess && (p.startsWith('#') || pLower.includes('i will ') || pLower.includes('let me ') || pLower.includes('let\'s '))) {
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
                <ChevronRight className="w-2.5 h-2.5" />
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
  };

  // Define CSS variables dynamically if needed, or stick to Tailwind classes
  return (
    <div className="h-screen w-screen flex bg-background text-textPrimary font-ui flex-row relative">

      {(connections.length === 0 || showConnectionForm) && (
        <ConnectionForm
          onConnected={handleConnected}
          onCancel={connections.length > 0 ? () => setShowConnectionForm(false) : undefined}
        />
      )}

      {showApiModal && (
        <ApiRegistrationForm onCancel={() => setShowApiModal(false)} onRegistered={handleApiRegistered} />
      )}


      {/* Left Sidebar (The Explorer) */}
      <aside
        style={{ width: sidebarCollapsed ? '64px' : `${sidebarWidth}px` }}
        className={`bg-panel border-r border-border flex flex-col flex-shrink-0 relative ${isResizingSidebar ? '' : 'transition-all duration-300'}`}
      >
        {/* Horizontal Resizer */}
        {!sidebarCollapsed && (
          <div
            className="w-1 cursor-col-resize hover:bg-primary/50 transition-colors z-[60] absolute right-0 top-0 bottom-0"
            onMouseDown={startResizingSidebar}
          />
        )}

        {/* Sidebar Header with Toggle */}
        <div className={`h-12 border-b border-border flex items-center px-4 ${sidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
          {!sidebarCollapsed && <span className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Explorer</span>}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-white/10 text-gray-400 hover:text-primary transition-all cursor-pointer"
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? <ChevronRight /> : <ChevronLeft />}
          </button>
        </div>

        {sidebarCollapsed ? (
          <div className="flex-1 flex flex-col items-center py-4 gap-4 overflow-y-auto no-scrollbar">
            <button
              onClick={() => setShowConnectionForm(true)}
              className="w-10 h-10 flex items-center justify-center rounded-lg bg-primary/10 text-primary hover:bg-primary hover:text-background transition-all cursor-pointer flex-shrink-0"
              title="Add Server"
            >
              <span className="text-xl">+</span>
            </button>

            <div className="w-full flex flex-col items-center gap-2 border-t border-border pt-4">
              {connections.map(conn => (
                <button
                  key={conn.id}
                  onClick={() => {
                    setSidebarCollapsed(false);
                    setActiveConnectionId(conn.id);
                  }}
                  className={`w-10 h-10 flex items-center justify-center rounded-lg transition-all cursor-pointer ${activeConnectionId === conn.id ? 'bg-primary/20 text-primary' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}
                  title={conn.config.server_name || conn.id}
                >
                  <span className="text-lg">🖥️</span>
                </button>
              ))}
            </div>

            <div className="mt-auto mb-4 border-t border-border pt-4 w-full flex flex-col items-center gap-2">
              <button
                onClick={() => {
                  setSidebarCollapsed(false);
                  setShowSavedItems(true);
                }}
                className="w-10 h-10 flex items-center justify-center rounded-lg text-gray-400 hover:bg-white/5 hover:text-white transition-all cursor-pointer"
                title="Saved Items"
              >
                <span className="text-lg">📁</span>
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="p-4 flex flex-col gap-2">
              <button
                onClick={() => setShowConnectionForm(true)}
                className="w-full bg-primary/10 border border-primary/30 text-primary hover:bg-primary hover:text-background font-bold p-1.5 rounded text-sm transition-all focus:outline-none cursor-pointer"
              >
                + Add Server
              </button>
            </div>
            <ScrollArea className="flex-1 p-2 overflow-y-auto">
              {connections.length === 0 ? (
                <div className="text-gray-500 text-xs italic opacity-80 text-center mt-4">
                  Not Connected
                </div>
              ) : (
                connections.map(conn => (
                  <div key={conn.id} className="mb-4">
                    <div
                      className="text-secondary font-bold text-xs mb-1 uppercase px-2 flex items-center justify-between group cursor-context-menu"
                      onContextMenu={(e) => handleExplorerContextMenu(e, { type: 'server', server: conn, isProtected: protectedItems.includes(conn.id) })}
                    >
                      <span className="truncate pr-4 flex items-center gap-1">
                        {protectedItems.includes(conn.id) && <span className="text-red-500" title="Protected">🛡️</span>}
                        🖥️ {conn.config.server_name || conn.id}
                      </span>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRefreshConnection(conn.id);
                          }}
                          className="text-gray-400 hover:text-primary cursor-pointer px-1 rounded hover:bg-white/10 transition-colors"
                          title="Refresh Databases & Schema"
                        >
                          🔄
                        </button>
                        <button
                          onClick={() => {
                            setActiveConnectionId(conn.id);
                            setShowCreateDbModal(true);
                          }}
                          className="text-primary hover:text-white cursor-pointer px-1 rounded hover:bg-white/10 transition-colors"
                          title="Create Database"
                        >
                          + DB
                        </button>
                      </div>
                    </div>
                    <div className="space-y-0.5 mt-2">
                      {conn.databases.map(db => {
                        const isActive = activeConnectionId === conn.id && activeDatabase === db;
                        return (
                          <div key={db} className="ml-2">
                            <div
                              className={`group cursor-context-menu px-2 py-1 flex items-center justify-between rounded text-sm transition-colors ${isActive ? 'bg-primary/20 text-primary font-bold shadow-[inset_2px_0_0_0_var(--color-primary)]' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                              onClick={() => handleDbChange(conn.id, db)}
                              onContextMenu={(e) => handleExplorerContextMenu(e, { type: 'database', server: conn, database: db, isProtected: protectedItems.includes(`${conn.id}::${db}`) })}
                            >
                              <div className="flex items-center gap-2 truncate pr-2">
                                {protectedItems.includes(`${conn.id}::${db}`) && <span className="text-red-500" title="Protected">🛡️</span>}
                                💾 <span className="truncate">{db}</span>
                              </div>
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDropDatabase(conn.id, db);
                                  }}
                                  className="text-gray-500 hover:text-red-400 transition-all font-bold px-1 rounded focus:outline-none"
                                  title="Delete Database"
                                >
                                  🗑️
                                </button>
                              </div>
                            </div>
                            {isActive && (
                              <div className="ml-4 mt-2 mb-2">
                                {conn.schemas[db] ? (
                                  <ul className="space-y-1 text-sm border-l border-border/50 pl-2">
                                    {Object.entries(conn.schemas[db]).map(([schemaName, tables]) => (
                                      <SchemaAccordion
                                        key={schemaName}
                                        schemaName={schemaName}
                                        tables={tables}
                                        onTableClick={(s, t) => handleTableClick(conn.id, db, s, t)}
                                        isSchemaProtected={protectedItems.includes(`${conn.id}::${db}::${schemaName}`)}
                                        getIsTableProtected={(t) => protectedItems.includes(`${conn.id}::${db}::${schemaName}::${t}`)}
                                        onContextMenu={(e, type, s, t) => handleExplorerContextMenu(e, {
                                          type,
                                          server: conn,
                                          database: db,
                                          schemaName: s,
                                          tableName: t,
                                          isProtected: type === 'schema'
                                            ? protectedItems.includes(`${conn.id}::${db}::${s}`)
                                            : protectedItems.includes(`${conn.id}::${db}::${s}::${t}`)
                                        })}
                                      />
                                    ))}
                                  </ul>
                                ) : (
                                  <div className="text-gray-500 text-xs italic ml-2">Loading schema...</div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </ScrollArea>
            <div className="p-4 border-t border-border bg-panel/50">
              <button
                onClick={() => setShowSavedItems(!showSavedItems)}
                className="w-full text-xs font-bold text-gray-500 uppercase tracking-widest hover:text-primary transition-colors flex items-center justify-between px-2 py-1 cursor-pointer group"
              >
                <span>📁 Saved Items</span>
                <span className={`transition-transform duration-200 ${showSavedItems ? 'rotate-180' : ''} text-gray-500 group-hover:text-primary`}>
                  <ChevronDown />
                </span>
              </button>

              {showSavedItems && (
                <div className="mt-2 space-y-4">
                  {/* Saved Queries */}
                  <div>
                    <div className="text-[10px] text-secondary font-bold uppercase mb-1 px-2">Saved Queries</div>
                    <ScrollArea className="max-h-32 overflow-y-auto space-y-1">
                      {savedQueries.length === 0 ? (
                        <div className="text-[10px] text-gray-600 italic px-4">No saved queries</div>
                      ) : (
                        savedQueries.map(q => (
                          <div key={q.id} className="group flex items-center justify-between px-2 py-1 hover:bg-white/5 rounded cursor-pointer transition-colors">
                            <span
                              className="text-xs text-gray-400 truncate flex-1 hover:text-white"
                              title={q.query}
                              onClick={() => {
                                setSqlQuery(q.query);
                                setActiveConnectionId(q.connectionId);
                                setActiveDatabase(q.database);
                                setViewMode('query');
                              }}
                            >
                              📜 {q.name}
                            </span>
                            <button
                              onClick={() => storageService.deleteItem('queries', q.id).then(() => setSavedQueries(prev => prev.filter(x => x.id !== q.id)))}
                              className="opacity-0 group-hover:opacity-100 text-[10px] text-red-500/50 hover:text-red-500"
                            >
                              ✕
                            </button>
                          </div>
                        ))
                      )}
                    </ScrollArea>
                  </div>

                  {/* Saved Conversations */}
                  <div>
                    <div className="text-[10px] text-secondary font-bold uppercase mb-1 px-2">Conversations</div>
                    <ScrollArea className="max-h-32 overflow-y-auto space-y-1">
                      {savedConversations.length === 0 ? (
                        <div className="text-[10px] text-gray-600 italic px-4">No saved chats</div>
                      ) : (
                        savedConversations.map(c => (
                          <div key={c.id} className="group flex items-center justify-between px-2 py-1 hover:bg-white/5 rounded cursor-pointer transition-colors">
                            <span
                              className="text-xs text-gray-400 truncate flex-1 hover:text-white"
                              title={c.title}
                              onClick={() => {
                                setChatHistory(c.history);
                                setActiveConnectionId(c.connectionId);
                                setActiveDatabase(c.database);
                                setViewMode('ai');
                              }}
                            >
                              💬 {c.title}
                            </span>
                            <button
                              onClick={() => storageService.deleteItem('conversations', c.id).then(() => setSavedConversations(prev => prev.filter(x => x.id !== c.id)))}
                              className="opacity-0 group-hover:opacity-100 text-[10px] text-red-500/50 hover:text-red-500"
                            >
                              ✕
                            </button>
                          </div>
                        ))
                      )}
                    </ScrollArea>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </aside>

      {/* Main Viewport */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">

        {/* Main Header / View Toggle */}
        <div className="border-b border-border bg-panel flex flex-col justify-between items-start">
          {/* Tab Bar */}
          <ScrollArea className="flex w-full bg-background/50 border-b border-border overflow-x-auto min-h-[36px]">
            {openTabs.length === 0 && (
              <div className="px-4 py-2 text-xs font-bold text-gray-500 italic">No workspace open. Select a database from the explorer.</div>
            )}
            {openTabs.map(tabId => {
              const [tConn, tDb] = tabId.split('::');
              return (
                <div
                  key={tabId}
                  onClick={() => handleDbChange(tConn, tDb)}
                  className={`px-4 py-2 text-xs font-bold border-r border-border cursor-pointer flex items-center gap-2 transition-colors flex-shrink-0 ${activeTabId === tabId ? 'bg-panel text-primary border-t-2 border-t-primary' : 'hover:bg-panel text-gray-500 hover:text-gray-300'}`}
                >
                  💾 {tDb} <span className="text-[10px] opacity-40 font-normal truncate max-w-[100px]">{tConn}</span>
                  <div onClick={(e) => { e.stopPropagation(); closeTab(tabId); }} className="hover:text-red-400 ml-2 rounded p-[1px] hover:bg-white/10 text-gray-400 leading-none">✕</div>
                </div>
              )
            })}
          </ScrollArea>

          <div className="flex justify-between items-center w-full p-2 px-4 shadow-[0_4px_10px_rgba(0,0,0,0.1)] z-10">
            <div className="flex items-center gap-4">
              <h1 className="font-bold text-lg text-primary tracking-wide">CmdQ ENGINE</h1>
              <div className="flex bg-background border border-border rounded p-1">
                <button
                  onClick={() => setViewMode('ai')}
                  className={`px-3 py-1 text-xs font-bold rounded transition-colors cursor-pointer ${viewMode === 'ai' ? 'bg-primary text-background' : 'text-gray-400 hover:text-white'}`}
                >
                  AI Prompt
                </button>
                <button
                  onClick={() => setViewMode('query')}
                  className={`px-3 py-1 text-xs font-bold rounded transition-colors cursor-pointer ${viewMode === 'query' ? 'bg-primary text-background' : 'text-gray-400 hover:text-white'}`}
                >
                  SQL Editor
                </button>
              </div>
            </div>

            {viewMode === 'ai' && (
              <div className="flex gap-2">
                <select
                  value={selectedCli}
                  onChange={(e) => { setSelectedCli(e.target.value); setChatHistory([]); }}
                  className="bg-background border border-border rounded p-1 text-xs text-textPrimary focus:outline-none focus:border-primary max-w-48"
                >
                  {availableClis.map(cli => (
                    <option key={cli.command} value={cli.command}>
                      {cli.name}
                      {/* {cli.command !== 'custom' ? `(${cli.command})` : ''} */}
                    </option>
                  ))}
                </select>

                <button
                  onClick={() => setShowApiModal(true)}
                  title="Connect API Model directly"
                  className="bg-panel border border-border hover:bg-white/5 text-textPrimary flex items-center justify-center p-1 px-3 rounded text-xs font-bold transition-all cursor-pointer whitespace-nowrap"
                >
                  + API Model
                </button>

                {selectedCli === "custom" && (
                  <input
                    type="text"
                    value={customCliCommand}
                    onChange={(e) => setCustomCliCommand(e.target.value)}
                    placeholder="e.g. 'gemini'"
                    className="bg-background border border-border rounded p-1 text-xs text-textPrimary focus:outline-none focus:border-primary w-32"
                  />
                )}

                {currentAbortController ? (
                  <button
                    onClick={stopAi}
                    className="bg-red-500 hover:bg-red-600 text-white flex items-center justify-center p-1 px-3 rounded text-xs font-bold transition-all cursor-pointer"
                    title="Stop Generation"
                  >
                    ■
                  </button>
                ) : (
                  <button
                    onClick={launchCli}
                    disabled={!activeConfig}
                    title={activeConfig ? "Launch CLI locally" : "Choose a database first"}
                    className="bg-primary hover:brightness-110 disabled:opacity-50 text-background flex items-center justify-center p-1 px-3 rounded text-xs font-bold transition-all cursor-pointer"
                  >
                    ▶
                  </button>
                )}
                {/* <button
                onClick={handleDebugLaunch}
                disabled={!activeConfig}
                title="Open visible debug terminal for this model"
                className="bg-orange-500/20 text-orange-400 border border-orange-500/50 hover:bg-orange-500/30 flex items-center justify-center p-1 px-3 rounded text-xs font-bold transition-all cursor-pointer"
                >
                  Debug Console
                </button> */}
                {chatHistory.length > 0 && (
                  <button
                    onClick={() => setChatHistory([])}
                    title="Clear Session Memory"
                    className="bg-red-500/20 text-red-400 border border-red-500/50 hover:bg-red-500/30 flex items-center justify-center p-1 px-3 rounded text-xs font-bold transition-all cursor-pointer"
                  >
                    Clear
                  </button>
                )}

                {sessionContext.length > 0 && (
                  <div className="flex items-center gap-1 bg-cyan-500/10 border border-cyan-500/40 rounded px-2 py-0.5 ml-2">
                    <span className="text-cyan-400 text-[10px] whitespace-nowrap">🔐 {sessionContext.length} Context Cmds</span>
                    <button
                      onClick={() => setSessionContext([])}
                      className="text-cyan-400 hover:text-white text-xs font-bold px-1 ml-1"
                      title="Clear session context (RLS/ERLS bypass commands)"
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {viewMode === 'ai' && (
          <div
            style={{ height: `${topPanelHeight}px` }}
            className="border-b border-border flex flex-col bg-panel p-4 flex-shrink-0 min-h-[150px] relative"
          >
            {/* Vertical Resizer */}
            <div
              className="h-1 cursor-row-resize hover:bg-primary/50 transition-colors z-[60] absolute left-0 right-0 bottom-0"
              onMouseDown={startResizingTopPanel}
            />
            <ScrollArea className="font-code text-sm overflow-y-auto flex-1 mb-2">
              <div className="text-gray-500 mb-2">System: CmdQ initialized. {activeConfig ? 'Ready for commands.' : 'Waiting for connection...'}</div>
              {activeConfig && <div className="text-secondary mb-2">&gt; Connected to {activeConfig.database} via {activeConfig.user}@{activeConfig.host}:{activeConfig.port}.</div>}
              {chatHistory.map((msg, i) => (
                <div key={i} className={`mb-1 whitespace-pre-wrap ${msg.role === 'user' ? 'text-primary font-bold' : 'text-gray-400'}`}>
                  <span className="opacity-50 inline-block mr-1 align-top">{msg.role === 'user' ? '>' : '#'}</span>
                  <div className="inline-block" style={{ width: 'calc(100% - 20px)' }}>
                    {msg.role === 'user' ? msg.content : renderMessageContent(msg.content)}
                  </div>
                </div>
              ))}
            </ScrollArea>

            <div className="flex items-center border-t border-border pt-2 flex-shrink-0 relative">
              {/* <div className="absolute -top-6 left-0 flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${backendStatus === 'connected' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]'}`}></div>
                <span className="text-[10px] uppercase font-bold tracking-tighter text-gray-500">
                  Backend: {backendStatus === 'connected' ? 'Online' : 'Disconnected'} 
                  {activeDatabase && ` | DB: ${activeDatabase}`}
                </span>
              </div>
              <span className="text-primary font-bold mr-2">&gt;</span> */}
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') launchCli();
                }}
                disabled={!activeConfig}
                placeholder={activeConfig ? "type your command here... (e.g. 'Seed users table with 50 rows') and press Enter" : "Connect to a database first..."}
                className="flex-1 bg-transparent border-none focus:outline-none font-code text-sm text-textPrimary disabled:opacity-50"
              />
            </div>
          </div>
        )}

        {viewMode === 'query' && (
          <div
            style={{ height: `${topPanelHeight}px` }}
            className="border-b border-border flex flex-col bg-panel flex-shrink-0 min-h-[150px] relative"
          >
            {/* Vertical Resizer */}
            <div
              className="h-1 cursor-row-resize hover:bg-primary/50 transition-colors z-[60] absolute left-0 right-0 bottom-0"
              onMouseDown={startResizingTopPanel}
            />
            <QueryEditor
              value={sqlQuery}
              onChange={setSqlQuery}
              onExecuteQuery={executeManualQuery}
              onSaveQuery={handleSaveQuery}
              isLoading={isQueryExecuting}
            />
          </div>
        )}

        <div className="flex-1 bg-background p-4 flex flex-col min-h-0">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-xs uppercase text-gray-500 font-bold tracking-wider mr-8">Results:</h2>
            {activeDatabase && (
              <div className="flex gap-2">
                {/* <span className="text-xs text-gray-500 self-center mr-2 uppercase font-bold tracking-wider">
                  Analyze {activeTableName ? 'Table' : 'Database'}:
                </span> */}
                <button
                  onClick={() => launchAiAnalysis('security')}
                  disabled={!!currentAbortController}
                  className="bg-panel border border-border hover:bg-white/5 text-textPrimary px-2 py-1 rounded text-xs transition-colors cursor-pointer flex items-center gap-1 disabled:opacity-50"
                >
                  🔒 Security
                </button>
                <button
                  onClick={() => launchAiAnalysis('performance')}
                  disabled={!!currentAbortController}
                  className="bg-panel border border-border hover:bg-white/5 text-textPrimary px-2 py-1 rounded text-xs transition-colors cursor-pointer flex items-center gap-1 disabled:opacity-50"
                >
                  ⚡ Performance
                </button>
                <button
                  onClick={() => launchAiAnalysis('data')}
                  disabled={!!currentAbortController}
                  className="bg-panel border border-border hover:bg-white/5 text-textPrimary px-2 py-1 rounded text-xs transition-colors cursor-pointer flex items-center gap-1 disabled:opacity-50"
                >
                  📊 Data Analysis
                </button>
                <button
                  onClick={() => launchAiAnalysis('summary')}
                  disabled={!!currentAbortController}
                  className="bg-panel border border-border hover:bg-white/5 text-textPrimary px-2 py-1 rounded text-xs transition-colors cursor-pointer flex items-center gap-1 disabled:opacity-50"
                >
                  📝 Summary
                </button>

                {currentAbortController && (
                  <button
                    onClick={stopAi}
                    className="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
                    title="Stop AI Operation"
                  >
                    ■ STOP
                  </button>
                )}

                <div className="h-4 w-px bg-border mx-1 self-center"></div>
                <button
                  onClick={() => setShowImportDbModal(true)}
                  disabled={!!currentAbortController}
                  className="bg-panel border border-border hover:bg-white/5 text-textPrimary px-2 py-1 rounded text-xs transition-colors cursor-pointer flex items-center gap-1 disabled:opacity-50"
                >
                  📥 Import DB
                </button>
                <button
                  onClick={() => setShowExportDbModal(true)}
                  disabled={!!currentAbortController}
                  className="bg-panel border border-border hover:bg-white/5 text-textPrimary px-2 py-1 rounded text-xs transition-colors cursor-pointer flex items-center gap-1 disabled:opacity-50"
                >
                  📤 Export DB
                </button>
                <button
                  onClick={() => setShowMigrationModal(true)}
                  disabled={!!currentAbortController}
                  className="bg-primary/20 border border-primary/50 text-primary hover:bg-primary hover:text-background px-2 py-1 rounded text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 disabled:opacity-50"
                >
                  🔄 ETL/Mapping
                </button>
                <div className="h-4 w-px bg-border mx-1 self-center"></div>
                <button
                  onClick={handleTranslateView}
                  disabled={!!currentAbortController || (!sqlResult?.data?.length)}
                  className="bg-[#2a1b38] border border-[#d288ff]/50 text-[#e0a8ff] hover:bg-[#d288ff] hover:text-black px-2 py-1 rounded text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 disabled:opacity-50"
                  title="Translate the current visible table data"
                >
                  🌐 Translate View
                </button>
                <button
                  onClick={handleCopyResults}
                  disabled={!sqlResult || (sqlResult.loading)}
                  className={`border p-1.5 rounded transition-all cursor-pointer flex items-center justify-center disabled:opacity-50 ${copyFeedback ? 'bg-green-500/20 border-green-500 text-green-400' : 'bg-panel border-border hover:bg-white/5 text-textPrimary'}`}
                  title="Copy results (JSON or Text)"
                >
                  {copyFeedback ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                  ) : (
                    <CopyIcon />
                  )}
                </button>
              </div>
            )}
          </div>

          <div className="flex-1 rounded border border-border bg-panel overflow-hidden flex flex-col">
            <ScrollArea className="font-code text-sm overflow-y-auto flex-1 mb-2">
              {sqlResult?.type === 'security_analysis' ? (
                <SecurityAnalysisViewer result={sqlResult} />
              ) : sqlResult?.type === 'performance_analysis' ? (
                <PerformanceAnalysisViewer result={sqlResult} />
              ) : sqlResult?.type === 'data_analysis' ? (
                <DataAnalysisViewer result={sqlResult} />
              ) : sqlResult?.type === 'summary_analysis' ? (
                <SummaryAnalysisViewer result={sqlResult} />
              ) : (
                <DataTable
                  result={sqlResult}
                  activeConfig={activeConfig}
                  activeSchemaName={sqlResult?.targetSchema || activeSchemaName}
                  activeTableName={sqlResult?.targetTable || activeTableName}
                  onDiagnose={(s, t) => setDiagnosisTarget({ schema: s, table: t })}
                  onRefresh={() => {
                    if (sqlResult?.extracted_sql && !sqlResult?.isTableClick) {
                      executeManualQuery(sqlResult.extracted_sql);
                    } else {
                      refreshTableData();
                    }
                  }}
                  onLocalMutation={(type, payload) => {
                    setMutationHistory(prev => [...prev, JSON.parse(JSON.stringify(sqlResult))]);
                    setSqlResult(prev => {
                      if (!prev || !prev.data) return prev;
                      const data = [...prev.data];
                      let original_data = prev.original_data ? [...prev.original_data] : null;

                      if (type === 'update') {
                        data[payload.rowIndex] = { ...data[payload.rowIndex], [payload.updateKey]: payload.updateValue };
                        if (original_data) {
                          const transKeys = Object.keys(data[payload.rowIndex]);
                          const origKeys = Object.keys(original_data[payload.rowIndex]);
                          const keyIdx = transKeys.indexOf(payload.updateKey);
                          const realKey = keyIdx !== -1 && origKeys[keyIdx] ? origKeys[keyIdx] : payload.updateKey;
                          original_data[payload.rowIndex] = { ...original_data[payload.rowIndex], [realKey]: payload.updateValue };
                        }
                      } else if (type === 'delete') {
                        const idx = data.indexOf(payload.row);
                        if (idx > -1) {
                          data.splice(idx, 1);
                          if (original_data) original_data.splice(idx, 1);
                        }
                      } else if (type === 'insert') {
                        data.unshift(payload.row);
                        if (original_data) {
                          const mockData = {};
                          const origKeys = Object.keys(original_data[0] || {});
                          const transKeys = Object.keys(payload.row);
                          for (let i = 0; i < transKeys.length; i++) {
                            let realKey = origKeys[i] ? origKeys[i] : transKeys[i];
                            mockData[realKey] = payload.row[transKeys[i]];
                          }
                          original_data.unshift(mockData);
                        }
                      }
                      return { ...prev, data, original_data };
                    });
                  }}
                />
              )}
            </ScrollArea>
          </div>

        </div>
      </main>

      <div
        onClick={() => setShowCommandPalette(true)}
        className="absolute bottom-2 right-4 text-xs text-gray-500 font-ui cursor-pointer hover:text-primary transition-colors select-none"
      >
        Press <kbd className="bg-panel border border-border rounded px-1 ml-1 mr-1">Ctrl+K</kbd> for Command Palette
      </div>

      {showCreateDbModal && activeConn && (
        <CreateDatabaseForm
          activeConfig={{ ...activeConn.config, database: "" }}
          onCancel={() => setShowCreateDbModal(false)}
          onSuccess={handleCreateDatabaseSuccess}
        />
      )}

      {showExportDbModal && activeConfig && (
        <ExportForm
          isDatabase={true}
          targetName={activeDatabase}
          activeConfig={activeConfig}
          onCancel={() => setShowExportDbModal(false)}
        />
      )}
      {showImportDbModal && activeConfig && (
        <ImportForm
          isDatabase={true}
          targetName={activeDatabase}
          activeConfig={activeConfig}
          onCancel={() => setShowImportDbModal(false)}
          onSuccess={() => handleDbChange(activeConnectionId, activeDatabase)}
        />
      )}

      {showMigrationModal && (
        <DataMigrationForm
          connections={connections}
          onCancel={() => setShowMigrationModal(false)}
          onSuccess={(msg) => { alert(msg); refreshTableData(); }}
        />
      )}

      {contextMenu && (
        <ExplorerContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          entity={contextMenu.entity}
          onClose={() => setContextMenu(null)}
          onAction={handleExplorerAction}
        />
      )}

      {serverActionModal && (
        <ServerActionModal
          type={serverActionModal.type}
          server={serverActionModal.server}
          onClose={() => setServerActionModal(null)}
          onConfirm={handleServerActionConfirm}
        />
      )}

      {diagnosisTarget && (
        <ProtectionDiagnosisModal
          schemaName={diagnosisTarget.schema}
          tableName={diagnosisTarget.table}
          activeConfig={activeConfig}
          onClose={() => setDiagnosisTarget(null)}
          onApplyFix={(step) => {
            if (!sessionContext.includes(step)) {
              setSessionContext(prev => [...prev, step]);
            }
            // Re-run the current table fetch or query if possible
            if (activeTableName === diagnosisTarget.table) {
              refreshTableData();
            }
          }}
        />
      )}

      {propertiesModal && (
        <PropertiesModal
          entity={propertiesModal.entity}
          onClose={() => setPropertiesModal(null)}
        />
      )}

      <CommandPalette
        isOpen={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        commands={[
          { id: 'add-server', name: 'Add Server Connection', category: 'Connections', icon: '🖥️', shortcut: shortcuts['add-server'], action: () => setShowConnectionForm(true) },
          { id: 'add-api', name: 'Register API Model', category: 'AI', icon: '🤖', action: () => setShowApiModal(true) },
          { id: 'switch-ai', name: 'Switch to AI Prompt Mode', category: 'View', icon: '💬', shortcut: shortcuts['switch-ai'], action: () => setViewMode('ai') },
          { id: 'switch-sql', name: 'Switch to SQL Editor Mode', category: 'View', icon: '📜', shortcut: shortcuts['switch-sql'], action: () => setViewMode('query') },
          { id: 'toggle-sidebar', name: 'Toggle Sidebar', category: 'View', icon: '↔️', shortcut: shortcuts['toggle-sidebar'], action: () => setSidebarCollapsed(!sidebarCollapsed) },
          { id: 'sec-analysis', name: 'Run Security Analysis', category: 'Analysis', icon: '🔒', shortcut: shortcuts['sec-analysis'], action: () => launchAiAnalysis('security') },
          { id: 'perf-analysis', name: 'Run Performance Analysis', category: 'Analysis', icon: '⚡', shortcut: shortcuts['perf-analysis'], action: () => launchAiAnalysis('performance') },
          { id: 'data-analysis', name: 'Run Data Analysis', category: 'Analysis', icon: '📊', action: () => launchAiAnalysis('data') },
          { id: 'sum-analysis', name: 'Run Summary Analysis', category: 'Analysis', icon: '📝', action: () => launchAiAnalysis('summary') },
          { id: 'etl-mapping', name: 'Open ETL / Data Mapping', category: 'Data', icon: '🔄', action: () => setShowMigrationModal(true) },
          { id: 'export-db', name: 'Export Active Database', category: 'Data', icon: '📤', action: () => activeDatabase ? setShowExportDbModal(true) : alert("Please select a database first") },
          { id: 'import-db', name: 'Import to Active Database', category: 'Data', icon: '📥', action: () => activeDatabase ? setShowImportDbModal(true) : alert("Please select a database first") },
          { id: 'clear-chat', name: 'Clear Chat History', category: 'AI', icon: '🧹', action: () => setChatHistory([]) },
          { id: 'undo-mutation', name: 'Undo Last Mutation', category: 'Data', icon: '↩️', shortcut: shortcuts['undo-mutation'], action: handleUndoMutation },
          { id: 'config-shortcuts', name: 'Configure Keyboard Shortcuts', category: 'System', icon: '⌨️', action: () => setShowShortcutsModal(true) },
          {
            id: 'save-query', name: 'Save Current Query', category: 'Data', icon: '💾', action: () => {
              if (viewMode === 'query' && sqlQuery.trim()) {
                const name = window.prompt("Enter a name for this query:");
                if (name) handleSaveQuery(sqlQuery, name);
              } else {
                alert("Switch to SQL Editor and write a query first");
              }
            }
          },
        ]}
      />

      <ShortcutsModal
        isOpen={showShortcutsModal}
        onClose={() => setShowShortcutsModal(false)}
        shortcuts={shortcuts}
        onSave={handleSaveShortcut}
      />

    </div>
  );
}

export default App;
