import { useState, useEffect } from 'react';
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
import ServerContextMenu from './components/ServerContextMenu';
import ServerActionModal from './components/ServerActionModal';

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

  // Derived state
  const activeConn = connections.find(c => c.id === activeConnectionId);
  const activeConfig = activeConn ? { ...activeConn.config, database: activeDatabase || "" } : null;
  const activeSchema = activeConn && activeDatabase && activeConn.schemas ? activeConn.schemas[activeDatabase] : null;

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

    return () => clearInterval(interval);
  }, []);

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
    setActiveConnectionId(connId);
    setActiveDatabase(dbName);
    setActiveSchemaName(null);
    setActiveTableName(null);

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

    setChatHistory([]);
    setSqlResult(null);
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
        db_config: conf
      });
      setSqlResult({
        data: data.data,
        extracted_sql: `SELECT * FROM ${schemaName}.${tableName} LIMIT 100`,
        message: `Fetched 100 rows from ${tableName}`
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

  const executeManualQuery = async (queryText) => {
    if (!activeConfig || !queryText.trim()) return;
    setSqlResult({ loading: true });
    setIsQueryExecuting(true);
    try {
      const data = await apiService.executeQuery({
        query: queryText,
        db_config: activeConfig
      });
      setSqlResult({
        data: data.data,
        message: data.message,
        extracted_sql: queryText
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
        chat_history: chatHistory
      };

      const data = await apiService.launchAiPrompt(payload, controller.signal);

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

  const handleServerContextMenu = (e, server) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      server: server
    });
  };

  const handleServerAction = async (action, server) => {
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
              <span className="group-open:rotate-90 transition-transform text-[8px]">▶</span> View Agent Process
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
      <aside className="w-64 bg-panel border-r border-border flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-border flex flex-col gap-2">
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
                  onContextMenu={(e) => handleServerContextMenu(e, conn)}
                >
                  <span className="truncate pr-4">🖥️ {conn.config.server_name || conn.id}</span>
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
                          className={`group cursor-pointer px-2 py-1 flex items-center justify-between rounded text-sm transition-colors ${isActive ? 'bg-primary/20 text-primary font-bold shadow-[inset_2px_0_0_0_var(--color-primary)]' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                          onClick={() => handleDbChange(conn.id, db)}
                        >
                          <div className="flex items-center gap-2 truncate pr-2">
                            💾 <span className="truncate">{db}</span>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDropDatabase(conn.id, db);
                            }}
                            className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-all font-bold px-1 rounded focus:outline-none"
                            title="Delete Database"
                          >
                            🗑️
                          </button>
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
            className="w-full text-xs font-bold text-gray-500 uppercase tracking-widest hover:text-primary transition-colors flex items-center justify-between px-2 py-1 cursor-pointer"
          >
            <span>📁 Saved Items</span>
            <span>{showSavedItems ? '▼' : '▶'}</span>
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
      </aside>

      {/* Main Viewport */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">

        {/* Main Header / View Toggle */}
        <div className="border-b border-border bg-panel p-4 flex justify-between items-center">
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
                    {cli.name} {cli.command !== 'custom' ? `(${cli.command})` : ''}
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
            </div>
          )}
        </div>

        {viewMode === 'ai' && (
          <div className="h-[30%] border-b border-border flex flex-col bg-panel p-4 flex-shrink-0 min-h-[150px]">
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
          <div className="h-[30%] border-b border-border flex flex-col bg-panel flex-shrink-0 min-h-[150px]">
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
                  activeSchemaName={activeSchemaName}
                  activeTableName={activeTableName}
                  onRefresh={refreshTableData}
                />
              )}
            </ScrollArea>
          </div>

        </div>
      </main>

      <div className="absolute bottom-2 right-4 text-xs text-gray-500 font-ui pointer-events-none">
        Press <kbd className="bg-panel border border-border rounded px-1">Ctrl+K</kbd> for Command Palette
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
        <ServerContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          server={contextMenu.server}
          onClose={() => setContextMenu(null)}
          onAction={handleServerAction}
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
    </div>
  );
}

export default App;
