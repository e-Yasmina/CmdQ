import ScrollArea from '../ScrollArea';
import SchemaAccordion from '../SchemaAccordion';
import { ChevronRight, ChevronLeft, ChevronDown } from '../icons/ChevronIcons';

export default function Sidebar({
  connections, activeConnectionId, activeDatabase, openTabs,
  sidebarCollapsed, sidebarWidth, showSavedItems, isResizingSidebar,
  savedQueries, savedConversations, protectedItems,
  setSidebarCollapsed, setShowConnectionForm, setShowSavedItems,
  setShowCreateDbModal, setActiveConnectionId, setActiveDatabase,
  setSqlQuery, setViewMode, setChatHistory, setSidebarWidth,
  handleDbChange, handleDropDatabase, handleRefreshConnection,
  handleExplorerContextMenu, handleExplorerAction, handleTableClick,
  startResizingSidebar, storageService,
  setSavedQueries, setSavedConversations,
}) {
  const isProtected = (itemId) => {
    return protectedItems.some(p => (typeof p === 'string' ? p : p.id) === itemId);
  };

  const getProtectionLevel = (itemId) => {
    const rule = protectedItems.find(p => (typeof p === 'string' ? p : p.id) === itemId);
    if (!rule) return null;
    if (typeof rule === 'string') return 'full';
    return rule.level || 'full';
  };

  const getWritePermissions = (itemId) => {
    const rule = protectedItems.find(p => (typeof p === 'string' ? p : p.id) === itemId);
    if (!rule || typeof rule === 'string') return [];
    return rule.write_permissions || [];
  };

  const PROTECTION_ICONS = {
    full: '🔒',
    readonly: '👁️',
    custom: '⚙️',
  };
  return (
    <aside
      style={{ width: sidebarCollapsed ? '64px' : `${sidebarWidth}px` }}
      className={`bg-panel border-r border-border flex flex-col flex-shrink-0 relative ${isResizingSidebar ? '' : 'transition-all duration-300'}`}
    >
      {!sidebarCollapsed && (
        <div
          className="w-1 cursor-col-resize hover:bg-primary/50 transition-colors z-[60] absolute right-0 top-0 bottom-0"
          onMouseDown={startResizingSidebar}
        />
      )}

      <div className={`h-9 border-b border-border flex items-center px-4 ${sidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
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
        <div className="flex-1 flex flex-col items-center py-2 gap-2 overflow-y-auto no-scrollbar">
          <button
            onClick={() => setShowConnectionForm(true)}
            className="w-10 h-8.5 flex items-center justify-center rounded-lg bg-primary/10 text-primary hover:bg-primary hover:text-background transition-all cursor-pointer flex-shrink-0"
            title="Add Server"
          >
            <span className="text-xl">+</span>
          </button>
          <div className="w-full flex flex-col items-center gap-2 border-t border-border pt-4">
            {connections.map(conn => (
              <button
                key={conn.id}
                onClick={() => { setSidebarCollapsed(false); setActiveConnectionId(conn.id); }}
                className={`w-10 h-10 flex items-center justify-center rounded-lg transition-all cursor-pointer ${activeConnectionId === conn.id ? 'bg-primary/20 text-primary' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}
                title={conn.config.server_name || conn.id}
              >
                <span className="text-lg">🖥️</span>
              </button>
            ))}
          </div>
          <div className="mt-auto mb-4 border-t border-border pt-4 w-full flex flex-col items-center gap-2">
            <button
              onClick={() => { setSidebarCollapsed(false); setShowSavedItems(true); }}
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
              <div className="text-gray-500 text-xs italic opacity-80 text-center mt-4">Not Connected</div>
            ) : (
              connections.map(conn => (
                <div key={conn.id} className="mb-4">
                  <div
                    className="text-secondary font-bold text-xs mb-1 uppercase px-2 flex items-center justify-between group cursor-context-menu"
                    onContextMenu={(e) => handleExplorerContextMenu(e, { type: 'server', server: conn, isProtected: isProtected(conn.id), protectionLevel: getProtectionLevel(conn.id), writePermissions: getWritePermissions(conn.id) })}
                  >
                    <span className="truncate pr-4 flex items-center gap-1">
                      {isProtected(conn.id) && <span className="text-red-500" title={`Protected (${getProtectionLevel(conn.id)})`}>{PROTECTION_ICONS[getProtectionLevel(conn.id)] || '🛡️'}</span>}
                      🖥️ {conn.config.server_name || conn.id}
                    </span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRefreshConnection(conn.id); }}
                        className="text-gray-400 hover:text-primary cursor-pointer px-1 rounded hover:bg-white/10 transition-colors"
                        title="Refresh Databases & Schema"
                      >🔄</button>
                      <button
                        onClick={() => { setActiveConnectionId(conn.id); setShowCreateDbModal(true); }}
                        className="text-primary hover:text-white cursor-pointer px-1 rounded hover:bg-white/10 transition-colors"
                        title="Create Database"
                      >+ DB</button>
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
                            onContextMenu={(e) => handleExplorerContextMenu(e, { type: 'database', server: conn, database: db, isProtected: isProtected(`${conn.id}::${db}`), protectionLevel: getProtectionLevel(`${conn.id}::${db}`), writePermissions: getWritePermissions(`${conn.id}::${db}`) })}
                          >
                            <div className="flex items-center gap-2 truncate pr-2">
                              {isProtected(`${conn.id}::${db}`) && <span className="text-red-500" title={`Protected (${getProtectionLevel(`${conn.id}::${db}`)})`}>{PROTECTION_ICONS[getProtectionLevel(`${conn.id}::${db}`)] || '🛡️'}</span>}
                              💾 <span className="truncate">{db}</span>
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDropDatabase(conn.id, db); }}
                                className="text-gray-500 hover:text-red-400 transition-all font-bold px-1 rounded focus:outline-none"
                                title="Delete Database"
                              >🗑️</button>
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
                                      isSchemaProtected={isProtected(`${conn.id}::${db}::${schemaName}`)}
                                      getIsTableProtected={(t) => isProtected(`${conn.id}::${db}::${schemaName}::${t}`)}
                                      onContextMenu={(e, type, s, t) => handleExplorerContextMenu(e, {
                                        type, server: conn, database: db, schemaName: s, tableName: t,
                                        isProtected: type === 'schema'
                                          ? isProtected(`${conn.id}::${db}::${s}`)
                                          : isProtected(`${conn.id}::${db}::${s}::${t}`),
                                        protectionLevel: type === 'schema'
                                          ? getProtectionLevel(`${conn.id}::${db}::${s}`)
                                          : getProtectionLevel(`${conn.id}::${db}::${s}::${t}`),
                                        writePermissions: type === 'schema'
                                          ? getWritePermissions(`${conn.id}::${db}::${s}`)
                                          : getWritePermissions(`${conn.id}::${db}::${s}::${t}`),
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
                            onClick={() => { setSqlQuery(q.query); setActiveConnectionId(q.connectionId); setActiveDatabase(q.database); setViewMode('query'); }}
                          >📜 {q.name}</span>
                          <button
                            onClick={() => storageService.deleteItem('queries', q.id).then(() => setSavedQueries(prev => prev.filter(x => x.id !== q.id)))}
                            className="opacity-0 group-hover:opacity-100 text-[10px] text-red-500/50 hover:text-red-500"
                          >✕</button>
                        </div>
                      ))
                    )}
                  </ScrollArea>
                </div>
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
                            onClick={() => { setChatHistory(c.history); setActiveConnectionId(c.connectionId); setActiveDatabase(c.database); setViewMode('ai'); }}
                          >💬 {c.title}</span>
                          <button
                            onClick={() => storageService.deleteItem('conversations', c.id).then(() => setSavedConversations(prev => prev.filter(x => x.id !== c.id)))}
                            className="opacity-0 group-hover:opacity-100 text-[10px] text-red-500/50 hover:text-red-500"
                          >✕</button>
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
  );
}
