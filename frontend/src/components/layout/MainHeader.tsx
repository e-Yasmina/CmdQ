import ScrollArea from '../ScrollArea';

export default function MainHeader({
  openTabs, activeTabId, viewMode, selectedCli, availableClis,
  customCliCommand, chatHistory, sessionContext, registeredModels,
  currentAbortController, activeConfig, theme = 'dark', toggleTheme,
  handleDbChange, closeTab, setViewMode, setSelectedCli,
  setChatHistory, setShowApiModal, setCustomCliCommand,
  stopAi, launchCli, handleDebugLaunch, handleEditModel,
  handleDeleteModel, setSessionContext,
}) {
  return (
    <div className="border-b border-border bg-panel flex flex-col justify-between items-start">
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
              className={`px-4 py-2 text-xs font-bold border-r border-border cursor-pointer flex items-center gap-2 transition-colors flex-shrink-0 ${activeTabId === tabId ? 'bg-panel text-primary border-t-2 border-t-primary' : 'hover:bg-panel text-textSecondary hover:text-textPrimary'}`}
            >
              💾 {tDb} <span className="text-[10px] text-textSecondary opacity-80 font-normal truncate max-w-[100px]">{tConn}</span>
              <div onClick={(e) => { e.stopPropagation(); closeTab(tabId); }} className="hover:text-red-400 ml-2 rounded p-[1px] hover:bg-black/5 dark:hover:bg-white/10 text-textSecondary hover:text-red-400 leading-none">✕</div>
            </div>
          );
        })}
      </ScrollArea>

      <div className="flex justify-between items-center w-full p-2 px-4 shadow-[0_4px_10px_rgba(0,0,0,0.1)] z-10 gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <h1 className="font-bold text-lg text-primary tracking-wide">CmdQ ENGINE</h1>
          <div className="flex bg-background border border-border rounded p-1">
            <button
              onClick={() => setViewMode('ai')}
              className={`px-3 py-1 text-xs font-bold rounded transition-colors cursor-pointer ${viewMode === 'ai' ? 'bg-primary text-background' : 'text-gray-400 hover:text-textPrimary'}`}
            >AI Prompt</button>
            <button
              onClick={() => setViewMode('query')}
              className={`px-3 py-1 text-xs font-bold rounded transition-colors cursor-pointer ${viewMode === 'query' ? 'bg-primary text-background' : 'text-gray-400 hover:text-textPrimary'}`}
            >SQL Editor</button>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {viewMode === 'ai' && (
            <>
              <select
                value={selectedCli}
                onChange={(e) => { setSelectedCli(e.target.value); setChatHistory([]); }}
                className="bg-background border border-border rounded p-1 text-xs text-textPrimary focus:outline-none focus:border-primary max-w-48"
              >
                {availableClis.map(cli => (
                  <option key={cli.command} value={cli.command}>{cli.name}</option>
                ))}
              </select>

              <button
                onClick={() => setShowApiModal(true)}
                title="Connect API Model directly"
                className="bg-panel border border-border hover:bg-white/5 text-textPrimary flex items-center justify-center p-1 px-3 rounded text-xs font-bold transition-all cursor-pointer whitespace-nowrap"
              >+ API Model</button>

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
                >■</button>
              ) : (
                <button
                  onClick={launchCli}
                  disabled={!activeConfig}
                  title={activeConfig ? "Launch CLI locally" : "Choose a database first"}
                  className="bg-primary hover:brightness-110 disabled:opacity-50 text-background flex items-center justify-center p-1 px-3 rounded text-xs font-bold transition-all cursor-pointer"
                >▶</button>
              )}

              {chatHistory.length > 0 && (
                <button
                  onClick={() => setChatHistory([])}
                  title="Clear Session Memory"
                  className="bg-red-500/20 text-red-400 border border-red-500/50 hover:bg-red-500/30 flex items-center justify-center p-1 px-3 rounded text-xs font-bold transition-all cursor-pointer"
                >Clear</button>
              )}

              {sessionContext.length > 0 && (
                <div className="flex items-center gap-1 bg-cyan-500/10 border border-cyan-500/40 rounded px-2 py-0.5 ml-2">
                  <span className="text-cyan-400 text-[10px] whitespace-nowrap">🔐 {sessionContext.length} Context Cmds</span>
                  <button
                    onClick={() => setSessionContext([])}
                    className="text-cyan-400 hover:text-white text-xs font-bold px-1 ml-1"
                    title="Clear session context (RLS/ERLS bypass commands)"
                  >×</button>
                </div>
              )}

              {registeredModels.length > 0 && (
                <div className="flex items-center gap-1 ml-2 flex-wrap">
                  {registeredModels.map(model => (
                    <div key={model.id} className="flex items-center gap-1 bg-purple-500/10 border border-purple-500/30 rounded px-2 py-0.5 text-[10px]">
                      <span className="text-purple-300 truncate max-w-[80px]" title={model.name}>{model.name}</span>
                      <button onClick={() => handleEditModel(model)} className="text-purple-400 hover:text-white px-0.5" title="Edit">✎</button>
                      <button onClick={() => handleDeleteModel(model.id, model.name)} className="text-red-400 hover:text-white px-0.5" title="Delete">✕</button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {toggleTheme && (
            <button
              onClick={toggleTheme}
              className="bg-background border border-border hover:bg-white/10 text-textPrimary px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
              title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
            >
              <span>{theme === 'dark' ? '☀️' : '🌙'}</span>
              <span className="capitalize">{theme === 'dark' ? 'Light' : 'Dark'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
