import { useState, useEffect } from 'react';
import ScrollArea from './components/ScrollArea';
import SchemaAccordion from './components/SchemaAccordion';

function App() {
  const [prompt, setPrompt] = useState("");
  const [sqlResult, setSqlResult] = useState(null);
  const [dbSchema, setDbSchema] = useState(null);
  const [databasesList, setDatabasesList] = useState([]);

  // Connection State
  const [isConnected, setIsConnected] = useState(false);
  const [connStep, setConnStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // AI CLI State
  const [availableClis, setAvailableClis] = useState([]);
  const [selectedCli, setSelectedCli] = useState("");
  const [customCliCommand, setCustomCliCommand] = useState("");
  const [chatHistory, setChatHistory] = useState([]);

  useEffect(() => {
    fetch("http://127.0.0.1:8000/ai/detect_cli")
      .then(res => res.json())
      .then(data => {
        if (data.status === "success" && data.clis) {
          setAvailableClis(data.clis);
          if (data.clis.length > 0) {
            setSelectedCli(data.clis[0].command);
          }
        }
      })
      .catch(err => console.error("Failed to fetch CLIs:", err));
  }, []);

  const [dbConfig, setDbConfig] = useState({
    db_type: "postgres",
    host: "127.0.0.1",
    port: 5432,
    user: "postgres",
    password: "",
    database: ""
  });

  const databases = [
    { name: "postgres", label: "PostgreSQL", icon: "🐘", defaultPort: 5432 },
    { name: "mysql", label: "MySQL", icon: "🐬", defaultPort: 3306 }
  ];

  const handleDbTypeChange = (e) => {
    const dbType = e.target.value;
    const db = databases.find(d => d.name === dbType);
    setDbConfig({ ...dbConfig, db_type: dbType, port: db ? db.defaultPort : 5432 });
  };

  const handleConfigChange = (e) => {
    setDbConfig({ ...dbConfig, [e.target.name]: e.target.value });
  };

  const checkPort = async () => {
    setIsLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch("http://127.0.0.1:8000/check_port", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host: dbConfig.host, port: parseInt(dbConfig.port) })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Port check failed");
      setConnStep(2); // Proceed to credentials
    } catch (err) {
      console.error("Port check failed:", err.message);
      setErrorMsg("Connection failed. Check console for details.");
    } finally {
      setIsLoading(false);
    }
  };

  const connectDb = async () => {
    setIsLoading(true);
    setErrorMsg("");
    try {
      const payload = { ...dbConfig, port: parseInt(dbConfig.port), database: "" };
      const res = await fetch("http://127.0.0.1:8000/databases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Connection failed");

      const retrievedDbs = data.databases || [];
      setDatabasesList(retrievedDbs);

      let initialDb = "";
      if (retrievedDbs.length > 0) {
        initialDb = retrievedDbs[0];
        setDbConfig({ ...dbConfig, database: initialDb });
        await fetchSchema(initialDb);
      }
      setIsConnected(true);
      setChatHistory([]);
    } catch (err) {
      console.error("Database connection error:", err.message);
      const msg = err.message.toLowerCase();
      if (msg.includes("password authentication failed") || msg.includes("access denied")) {
        setErrorMsg("The password is wrong or credentials are incorrect.");
      } else {
        setErrorMsg("Connection failed. Check console for details.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSchema = async (dbName) => {
    try {
      const payload = { ...dbConfig, port: parseInt(dbConfig.port), database: dbName };
      const schemaRes = await fetch("http://127.0.0.1:8000/schema", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const schemaData = await schemaRes.json();
      if (schemaRes.ok) {
        setDbSchema(schemaData.schema);
      }
    } catch (err) {
      console.error("Failed to fetch schema", err);
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
        db_config: { ...dbConfig, port: parseInt(dbConfig.port) },
        schema_json: dbSchema || {},
        chat_history: chatHistory
      };

      const res = await fetch("http://127.0.0.1:8000/ai/prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Execution failed");

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


  const handleSidebarDbChange = (e) => {
    const newDb = e.target.value;
    setDbConfig({ ...dbConfig, database: newDb });
    fetchSchema(newDb);
    setChatHistory([]);
  };

  return (
    <div className="h-screen w-screen flex bg-background text-textPrimary font-ui flex-row relative">

      {/* CONNECTION WIZARD OVERLAY */}
      {!isConnected && (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-panel border border-border rounded-lg shadow-2xl p-6 w-96 flex flex-col gap-4">
            <h2 className="text-xl font-bold text-primary flex items-center gap-2">
              <span className="text-2xl">🔌</span> Database Connection
            </h2>

            {errorMsg && (
              <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-2 rounded text-sm">
                {errorMsg}
              </div>
            )}

            {connStep === 1 && (
              <>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-gray-400 uppercase">Database Type</label>
                  <select
                    name="db_type"
                    value={dbConfig.db_type}
                    onChange={handleDbTypeChange}
                    className="bg-background border border-border text-textPrimary rounded p-2 focus:border-primary outline-none"
                  >
                    {databases.map(db => (
                      <option key={db.name} value={db.name}>{db.icon} {db.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <div className="flex flex-col gap-1 flex-1">
                    <label className="text-xs text-gray-400 uppercase">Host</label>
                    <input
                      type="text" name="host" value={dbConfig.host} onChange={handleConfigChange}
                      className="bg-background border border-border text-textPrimary rounded p-2 focus:border-primary outline-none"
                    />
                  </div>
                  <div className="flex flex-col gap-1 w-24">
                    <label className="text-xs text-gray-400 uppercase">Port</label>
                    <input
                      type="number" name="port" value={dbConfig.port} onChange={handleConfigChange}
                      className="bg-background border border-border text-textPrimary rounded p-2 focus:border-primary outline-none"
                    />
                  </div>
                </div>
                <button
                  onClick={checkPort}
                  disabled={isLoading}
                  className="mt-2 bg-primary text-background font-bold py-2 rounded hover:brightness-110 disabled:opacity-50 transition-all cursor-pointer"
                >
                  {isLoading ? "Checking..." : "Verify Port"}
                </button>
              </>
            )}

            {connStep === 2 && (
              <>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-gray-400 uppercase">Username</label>
                  <input
                    type="text" name="user" value={dbConfig.user} onChange={handleConfigChange}
                    className="bg-background border border-border text-textPrimary rounded p-2 focus:border-primary outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-gray-400 uppercase">Password</label>
                  <input
                    type="password" name="password" value={dbConfig.password} onChange={handleConfigChange}
                    className="bg-background border border-border text-textPrimary rounded p-2 focus:border-primary outline-none"
                  />
                </div>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => setConnStep(1)}
                    className="bg-background border border-border text-textPrimary font-bold py-2 px-4 rounded hover:bg-white/5 transition-all w-1/3 cursor-pointer"
                  >
                    Back
                  </button>
                  <button
                    onClick={connectDb}
                    disabled={isLoading}
                    className="bg-secondary text-background font-bold py-2 px-4 rounded hover:brightness-110 disabled:opacity-50 transition-all flex-1 cursor-pointer"
                  >
                    {isLoading ? "Connecting..." : "Connect"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Left Sidebar (The Explorer) */}
      <aside className="w-64 bg-panel border-r border-border flex flex-col">
        <div className="p-4 border-b border-border flex flex-col gap-2">
          {isConnected ? (
            <select
              value={dbConfig.database}
              onChange={handleSidebarDbChange}
              className="w-full bg-background border border-border rounded p-2 text-sm focus:outline-none focus:border-primary font-bold text-primary"
            >
              {databasesList.map(db => (
                <option key={db} value={db}>💾 {db}</option>
              ))}
            </select>
          ) : (
            <div className="w-full bg-background border border-border rounded p-2 text-sm text-gray-500 italic opacity-80 text-center">
              Not Connected
            </div>
          )}
        </div>
        <ScrollArea className="flex-1 p-4 overflow-y-auto">
          <p className="text-xs uppercase text-gray-400 font-bold mb-2">Schema Explorer</p>
          <ul className="space-y-1 text-sm">
            {!dbSchema && <li className="text-gray-500 text-xs italic">Connect to view schema</li>}
            {dbSchema && Object.entries(dbSchema).map(([schemaName, tables]) => (
              <SchemaAccordion key={schemaName} schemaName={schemaName} tables={tables} />
            ))}
          </ul>
        </ScrollArea>
      </aside>

      {/* Main Viewport */}
      <main className="flex-1 flex flex-col">
        <div className="h-1/3 border-b border-border flex flex-col relative bg-panel p-4">
          <div className="flex justify-between items-center mb-4">
            <h1 className="font-bold text-lg text-primary tracking-wide">CmdQ ENGINE</h1>
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
                disabled={!isConnected}
                title={isConnected ? "Launch CLI locally" : "Connect to database first"}
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
                  Clear Session
                </button>
              )}
            </div>
          </div>
          <div className="flex flex-col">
            <ScrollArea className="font-code text-sm overflow-y-auto max-h-48 mb-2">
              <div className="text-gray-500 mb-2">System: CmdQ initialized. Waiting for connection...</div>
              {isConnected && <div className="text-secondary mb-2">&gt; Connected to {dbConfig.database} via {dbConfig.user}@{dbConfig.host}:{dbConfig.port}.</div>}
              {chatHistory.map((msg, i) => (
                <div key={i} className={`mb-1 ${msg.role === 'user' ? 'text-primary' : 'text-gray-400'}`}>
                  <span className="opacity-50">{msg.role === 'user' ? '>' : '#'}</span> {msg.role === 'user' ? msg.content : (msg.content.substring(0, 100).replace(/\n/g, " ") + (msg.content.length > 100 ? "..." : ""))}
                </div>
              ))}
            </ScrollArea>

            <ScrollArea className="font-code text-sm overflow-y-auto max-h-48 mb-2">
              <div className="flex items-center mt-2 border-t border-border pt-2">
                <span className="text-primary font-bold mr-2">&gt;</span>
                <input
                  type="text"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') launchCli();
                  }}
                  disabled={!isConnected}
                  placeholder={isConnected ? "type your command here... (e.g. 'Seed users table with 50 rows') and press Enter" : "Connect to a database first..."}
                  className="flex-1 bg-transparent border-none focus:outline-none font-code text-sm text-textPrimary disabled:opacity-50"
                />
              </div>
            </ScrollArea>
          </div>
        </div>

        <ScrollArea className="h-2/3 bg-background p-4 flex flex-col overflow-auto">
          <h2 className="text-xs uppercase text-gray-500 font-bold mb-2 tracking-wider">Execution Results</h2>
          <ScrollArea className="flex-1 rounded border border-border bg-panel overflow-y-auto">
            {sqlResult?.loading ? (
              <div className="h-full flex items-center justify-center text-primary font-code text-sm animate-pulse">
                Thinking and executing...
              </div>
            ) : sqlResult?.error ? (
              <div className="p-4 text-red-400 font-code text-sm">{sqlResult.error}</div>
            ) : sqlResult ? (
              <div className="p-4 flex flex-col gap-4">
                {/* AI Text Output */}
                {sqlResult.message && (
                  <div className="text-secondary whitespace-pre-wrap font-code text-xs bg-background p-2 rounded border border-border">
                    {sqlResult.message}
                  </div>
                )}
                {/* SQL Executed */}
                {sqlResult.extracted_sql && (
                  <div>
                    <strong className="text-primary text-xs uppercase">Executed SQL</strong>
                    <div className="text-gray-300 font-code text-xs bg-black/50 p-2 rounded mt-1 border border-border/50">
                      {sqlResult.extracted_sql}
                    </div>
                  </div>
                )}
                {/* Data Rows */}
                {sqlResult.data && sqlResult.data.length > 0 && (
                  <ScrollArea className="overflow-x-auto border border-border rounded mt-2">
                    <table className="w-full text-left text-xs text-gray-300">
                      <thead className="bg-background text-gray-400 uppercase">
                        <tr>
                          {Object.keys(sqlResult.data[0]).map(k => (
                            <th key={k} className="p-2 border-b border-r border-border">{k}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sqlResult.data.map((row, i) => (
                          <tr key={i} className="border-b border-border/50 hover:bg-white/5">
                            {Object.values(row).map((val, idx) => (
                              <td key={idx} className="p-2 border-r border-border/50 truncate max-w-[200px]">
                                {String(val)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </ScrollArea>
                )}
                {sqlResult.data && sqlResult.data.length === 0 && sqlResult.extracted_sql && (
                  <div className="text-gray-500 italic text-xs">Query executed successfully (0 rows returned).</div>
                )}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-600 font-code text-sm">
                Waiting for execution...
              </div>
            )}
          </ScrollArea>
        </ScrollArea>
      </main>

      <div className="absolute bottom-2 right-4 text-xs text-gray-500 font-ui">
        Press <kbd className="bg-panel border border-border rounded px-1">Ctrl+K</kbd> for Command Palette
      </div>
    </div>
  );
}

export default App;
