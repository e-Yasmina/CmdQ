import { useState, useEffect } from 'react';
import ScrollArea from './components/ScrollArea';
import SchemaAccordion from './components/SchemaAccordion';
import ConnectionForm from './components/forms/ConnectionForm';
import ApiRegistrationForm from './components/forms/ApiRegistrationForm';
import ExportForm from './components/forms/ExportForm';
import ImportForm from './components/forms/ImportForm';
import QueryEditor from './components/QueryEditor';
import DataTable from './components/DataTable';
import SecurityAnalysisViewer from './components/SecurityAnalysisViewer';
import PerformanceAnalysisViewer from './components/PerformanceAnalysisViewer';
import DataAnalysisViewer from './components/DataAnalysisViewer';
import SummaryAnalysisViewer from './components/SummaryAnalysisViewer';
import { apiService } from './services/apiService';

function App() {
  const [prompt, setPrompt] = useState("");
  const [sqlResult, setSqlResult] = useState(null);

  // New Connection State
  const [connections, setConnections] = useState([]); // Array of { id, config, databases, schemas: {} }
  const [activeConnectionId, setActiveConnectionId] = useState(null);
  const [activeDatabase, setActiveDatabase] = useState(null);
  const [activeSchemaName, setActiveSchemaName] = useState(null);
  const [activeTableName, setActiveTableName] = useState(null);
  const [showConnectionForm, setShowConnectionForm] = useState(false);

  // Derived state
  const activeConn = connections.find(c => c.id === activeConnectionId);
  const activeConfig = activeConn ? { ...activeConn.config, database: activeDatabase } : null;
  const activeSchema = activeConn && activeDatabase && activeConn.schemas ? activeConn.schemas[activeDatabase] : null;

  // AI CLI State
  const [availableClis, setAvailableClis] = useState([]);
  const [selectedCli, setSelectedCli] = useState("");
  const [customCliCommand, setCustomCliCommand] = useState("");
  const [chatHistory, setChatHistory] = useState([]);

  // API Model Registration State
  const [showApiModal, setShowApiModal] = useState(false);

  // View Mode: 'ai' | 'query'
  const [viewMode, setViewMode] = useState('ai');
  const [isQueryExecuting, setIsQueryExecuting] = useState(false);

  // DB Export/Import Modal State
  const [showExportDbModal, setShowExportDbModal] = useState(false);
  const [showImportDbModal, setShowImportDbModal] = useState(false);

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
    fetchClis();
  }, []);

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
    const newConnId = `${config.user}@${config.host}:${config.port}`;

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
    }

    setActiveConnectionId(newConnId);
    setActiveDatabase(initialDb);
    setActiveSchemaName(null);
    setActiveTableName(null);
    setShowConnectionForm(false);
    setChatHistory([]);
    setSqlResult(null);
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

      setSqlResult({ loading: true });

      const payload = {
        command: command,
        prompt: prompt,
        db_config: activeConfig,
        schema_json: activeSchema || {},
        chat_history: chatHistory
      };

      const data = await apiService.launchAiPrompt(payload);

      setSqlResult(data);
      setChatHistory(prev => [
        ...prev,
        { role: "user", content: prompt },
        { role: "assistant", content: data.message || "Action completed." }
      ]);
      setPrompt("");
      console.log("Executed seamlessly:", data);
    } catch (err) {
      console.error("CLI Execution Error:", err.message);
      setSqlResult({ error: "Execution failed. Please check the console for more details." });
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

    if (type === 'security') {
      try {
        const payload = {
          command: command || "",
          db_config: activeConfig,
          schema_name: activeSchemaName || "",
          table_name: activeTableName || ""
        };
        const data = await apiService.fetchSecurityAnalysis(payload);
        setSqlResult({
          type: 'security_analysis',
          ...data
        });
      } catch (err) {
        console.error("Security Analysis Error:", err);
        setSqlResult({ error: "Analysis failed: " + err.message });
      } finally {
        setIsQueryExecuting(false);
      }
      return;
    }

    if (type === 'performance') {
      try {
        const payload = {
          command: command || "",
          db_config: activeConfig,
          schema_name: activeSchemaName || "",
          table_name: activeTableName || ""
        };
        const data = await apiService.fetchPerformanceAnalysis(payload);
        setSqlResult({
          type: 'performance_analysis',
          ...data
        });
      } catch (err) {
        console.error("Performance Analysis Error:", err);
        setSqlResult({ error: "Analysis failed: " + err.message });
      } finally {
        setIsQueryExecuting(false);
      }
      return;
    }

    if (type === 'data') {
      try {
        const payload = {
          command: command || "",
          db_config: activeConfig,
          schema_name: activeSchemaName || "",
          table_name: activeTableName || ""
        };
        const data = await apiService.fetchDataAnalysis(payload);
        setSqlResult({
          type: 'data_analysis',
          ...data
        });
      } catch (err) {
        console.error("Data Analysis Error:", err);
        setSqlResult({ error: "Analysis failed: " + err.message });
      } finally {
        setIsQueryExecuting(false);
      }
      return;
    }

    if (type === 'summary') {
      try {
        const payload = {
          command: command || "",
          db_config: activeConfig,
          schema_name: activeSchemaName || "",
          table_name: activeTableName || ""
        };
        const data = await apiService.fetchSummaryAnalysis(payload);
        setSqlResult({
          type: 'summary_analysis',
          ...data
        });
      } catch (err) {
        console.error("Summary Analysis Error:", err);
        setSqlResult({ error: "Analysis failed: " + err.message });
      } finally {
        setIsQueryExecuting(false);
      }
      return;
    }

    setIsQueryExecuting(false);
    setSqlResult({ error: "Unknown analysis type" });
    return;
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
                <div className="text-secondary font-bold text-xs mb-1 uppercase px-2 flex items-center justify-between">
                  <span>🖥️ {conn.id}</span>
                </div>
                <div className="space-y-0.5 mt-2">
                  {conn.databases.map(db => {
                    const isActive = activeConnectionId === conn.id && activeDatabase === db;
                    return (
                      <div key={db} className="ml-2">
                        <div
                          className={`cursor-pointer px-2 py-1 flex items-center gap-2 rounded text-sm transition-colors ${isActive ? 'bg-primary/20 text-primary font-bold shadow-[inset_2px_0_0_0_var(--color-primary)]' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                          onClick={() => handleDbChange(conn.id, db)}
                        >
                          💾 <span className="truncate">{db}</span>
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

              <button
                onClick={launchCli}
                disabled={!activeConfig}
                title={activeConfig ? "Launch CLI locally" : "Connect to database first"}
                className="bg-primary hover:brightness-110 disabled:opacity-50 text-background flex items-center justify-center p-1 px-3 rounded text-xs font-bold transition-all cursor-pointer"
              >
                ▶
              </button>
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
                <div key={i} className={`mb-1 ${msg.role === 'user' ? 'text-primary' : 'text-gray-400'}`}>
                  <span className="opacity-50">{msg.role === 'user' ? '>' : '#'}</span> {msg.role === 'user' ? msg.content : (msg.content.substring(0, 100).replace(/\n/g, " ") + (msg.content.length > 100 ? "..." : ""))}
                </div>
              ))}
            </ScrollArea>

            <div className="flex items-center border-t border-border pt-2 flex-shrink-0">
              <span className="text-primary font-bold mr-2">&gt;</span>
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
            <QueryEditor onExecuteQuery={executeManualQuery} isLoading={isQueryExecuting} />
          </div>
        )}

        <div className="flex-1 bg-background p-4 flex flex-col min-h-0">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-xs uppercase text-gray-500 font-bold tracking-wider">Execution Results</h2>
            {activeDatabase && (
              <div className="flex gap-2">
                <span className="text-xs text-gray-500 self-center mr-2 uppercase font-bold tracking-wider">
                  Analyze {activeTableName ? 'Table' : 'Database'}:
                </span>
                <button onClick={() => launchAiAnalysis('security')} className="bg-panel border border-border hover:bg-white/5 text-textPrimary px-2 py-1 rounded text-xs transition-colors cursor-pointer flex items-center gap-1">🔒 Security</button>
                <button onClick={() => launchAiAnalysis('performance')} className="bg-panel border border-border hover:bg-white/5 text-textPrimary px-2 py-1 rounded text-xs transition-colors cursor-pointer flex items-center gap-1">⚡ Performance</button>
                <button onClick={() => launchAiAnalysis('data')} className="bg-panel border border-border hover:bg-white/5 text-textPrimary px-2 py-1 rounded text-xs transition-colors cursor-pointer flex items-center gap-1">📊 Data Analysis</button>
                <button onClick={() => launchAiAnalysis('summary')} className="bg-panel border border-border hover:bg-white/5 text-textPrimary px-2 py-1 rounded text-xs transition-colors cursor-pointer flex items-center gap-1">📝 Summary</button>
                <div className="h-4 w-px bg-border mx-1 self-center"></div>
                <button onClick={() => setShowImportDbModal(true)} className="bg-panel border border-border hover:bg-white/5 text-textPrimary px-2 py-1 rounded text-xs transition-colors cursor-pointer flex items-center gap-1">📥 Import DB</button>
                <button onClick={() => setShowExportDbModal(true)} className="bg-panel border border-border hover:bg-white/5 text-textPrimary px-2 py-1 rounded text-xs transition-colors cursor-pointer flex items-center gap-1">📤 Export DB</button>
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
    </div>
  );
}

export default App;
