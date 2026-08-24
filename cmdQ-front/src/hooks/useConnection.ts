import { useState, useMemo, useCallback } from 'react';
import { apiService } from '../services/apiService';
import { storageService } from '../services/storageService';

export function useConnection() {
  const [connections, setConnections] = useState([]);
  const [activeConnectionId, setActiveConnectionId] = useState(null);
  const [activeDatabase, setActiveDatabase] = useState(null);
  const [activeSchemaName, setActiveSchemaName] = useState(null);
  const [activeTableName, setActiveTableName] = useState(null);
  const [showConnectionForm, setShowConnectionForm] = useState(false);
  const [sessionContext, setSessionContext] = useState([]);
  const [protectedItems, setProtectedItems] = useState([]);

  const activeConn = useMemo(
    () => connections.find(c => c.id === activeConnectionId),
    [connections, activeConnectionId]
  );

  const activeConfig = useMemo(
    () => activeConn ? { ...activeConn.config, database: activeDatabase || "" } : null,
    [activeConn, activeDatabase]
  );

  const activeSchema = useMemo(
    () => activeConn && activeDatabase && activeConn.schemas ? activeConn.schemas[activeDatabase] : null,
    [activeConn, activeDatabase]
  );

  const tableList = useMemo(() => {
    if (!activeSchema) return [];
    const list = [];
    for (const [sName, tables] of Object.entries(activeSchema)) {
      for (const tName of Object.keys(tables)) {
        list.push(`${sName}.${tName}`);
      }
    }
    return list.sort();
  }, [activeSchema]);

  const loadProtectedItems = useCallback(() => {
    try {
      const saved = localStorage.getItem('cmdq_protected_items');
      if (saved) setProtectedItems(JSON.parse(saved) || []);
    } catch (err) {
      console.error("Failed to load protected items:", err);
    }
  }, []);

  const loadSavedConnections = useCallback(async () => {
    try {
      const saved = await storageService.getItems('connections');
      if (saved && saved.length > 0) {
        setConnections(saved);
      }
    } catch (err) {
      console.error("Failed to load saved connections:", err);
    }
  }, []);

  const fetchSchema = useCallback(async (config) => {
    try {
      const data = await apiService.fetchSchema(config);
      return data.schema;
    } catch (err) {
      console.error("Failed to fetch schema", err);
      return null;
    }
  }, []);

  const handleConnected = useCallback(async (dbs, initialDb, config) => {
    const newConnId = config.server_name?.trim() || `${config.user}@${config.host}:${config.port}`;
    const isHostMatch = (h1, h2) => {
      const a = (h1 || '').trim().toLowerCase();
      const b = (h2 || '').trim().toLowerCase();
      return a === b || (['localhost', '127.0.0.1'].includes(a) && ['localhost', '127.0.0.1'].includes(b));
    };

    const existingConn = connections.find(c =>
      c.id === newConnId ||
      (config.server_name?.trim() && c.config?.server_name?.trim().toLowerCase() === config.server_name.trim().toLowerCase()) ||
      (c.config?.db_type === config.db_type && isHostMatch(c.config?.host, config.host) && Number(c.config?.port) === Number(config.port) && (c.config?.user || '').trim().toLowerCase() === (config.user || '').trim().toLowerCase())
    );

    if (existingConn) {
      setActiveConnectionId(existingConn.id);
      setActiveDatabase(initialDb || existingConn.databases?.[0] || "");
      setActiveSchemaName(null);
      setActiveTableName(null);
      setShowConnectionForm(false);
      return;
    }

    const initialSchema = await fetchSchema(config);
    const newConnection = {
      id: newConnId,
      config: config,
      databases: dbs,
      schemas: { [initialDb]: initialSchema }
    };
    setConnections(prev => [...prev, newConnection]);
    storageService.saveItem('connections', newConnection).catch(err => console.error("Failed to save connection:", err));

    setActiveConnectionId(newConnId);
    setActiveDatabase(initialDb);
    setActiveSchemaName(null);
    setActiveTableName(null);
    setShowConnectionForm(false);
  }, [connections, fetchSchema]);

  const handleRefreshConnection = useCallback(async (connId) => {
    const connIndex = connections.findIndex(c => c.id === connId);
    if (connIndex === -1) return;
    const conn = connections[connIndex];

    try {
      const dbsData = await apiService.connectDb(conn.config);
      if (dbsData.status === "success") {
        const updatedConn = { ...conn, databases: dbsData.databases.sort() };
        setConnections(prev => {
          const newConns = [...prev];
          newConns[connIndex] = updatedConn;
          return newConns;
        });
        storageService.saveItem('connections', updatedConn);
      }

      if (activeConnectionId === connId && activeDatabase) {
        const configForDb = { ...conn.config, database: activeDatabase };
        const schema = await fetchSchema(configForDb);
        setConnections(prev => {
          const newConns = [...prev];
          newConns[connIndex] = {
            ...newConns[connIndex],
            schemas: { ...newConns[connIndex].schemas, [activeDatabase]: schema }
          };
          storageService.saveItem('connections', newConns[connIndex]);
          return newConns;
        });
      }
    } catch (err) {
      console.error("Failed to refresh connection:", err);
      alert("Failed to refresh connection: " + err.message);
    }
  }, [connections, activeConnectionId, activeDatabase, fetchSchema]);

  const handleDropDatabase = useCallback(async (connId, dbName) => {
    if (!window.confirm(`Are you sure you want to permanently delete the database "${dbName}"?\nThis action cannot be undone.`)) return;

    const connIndex = connections.findIndex(c => c.id === connId);
    if (connIndex === -1) return;
    const conn = connections[connIndex];

    try {
      await apiService.dropDatabase({ db_config: conn.config, db_name: dbName });
      setConnections(prev => {
        const newConns = [...prev];
        const newDbs = conn.databases.filter(d => d !== dbName);
        newConns[connIndex] = { ...conn, databases: newDbs };
        storageService.saveItem('connections', newConns[connIndex]);
        return newConns;
      });

      if (activeConnectionId === connId && activeDatabase === dbName) {
        setActiveDatabase(null);
        setActiveSchemaName(null);
        setActiveTableName(null);
      }
      alert(`Database '${dbName}' dropped successfully.`);
    } catch (err) {
      console.error("Failed to drop database:", err);
      alert("Error dropping database: " + err.message);
    }
  }, [connections, activeConnectionId, activeDatabase]);

  const handleCreateDatabaseSuccess = useCallback((newDbName) => {
    const connIndex = connections.findIndex(c => c.id === activeConnectionId);
    if (connIndex >= 0) {
      setConnections(prev => {
        const newConns = [...prev];
        if (!newConns[connIndex].databases.includes(newDbName)) {
          newConns[connIndex].databases = [...newConns[connIndex].databases, newDbName].sort();
        }
        storageService.saveItem('connections', newConns[connIndex]);
        return newConns;
      });
    }
  }, [connections, activeConnectionId]);

  const handleExplorerAction = useCallback(async (action, entity) => {
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
        case 'import':
          setActiveConnectionId(server.id);
          setActiveDatabase(server.databases?.[0] || "");
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
      }
    }
  }, [protectedItems, activeConnectionId, handleRefreshConnection]);

  const handleServerActionConfirm = useCallback(async (data) => {}, []);

  return {
    connections, setConnections,
    activeConnectionId, setActiveConnectionId,
    activeDatabase, setActiveDatabase,
    activeSchemaName, setActiveSchemaName,
    activeTableName, setActiveTableName,
    showConnectionForm, setShowConnectionForm,
    sessionContext, setSessionContext,
    protectedItems, setProtectedItems,
    activeConn, activeConfig, activeSchema, tableList,
    loadProtectedItems, loadSavedConnections,
    fetchSchema, handleConnected, handleRefreshConnection,
    handleDropDatabase, handleCreateDatabaseSuccess,
    handleExplorerAction, handleServerActionConfirm,
  };
}
