import ScrollArea from '../ScrollArea';

export default function AiPanel({
  topPanelHeight, startResizingTopPanel, activeConfig, chatHistory,
  attachedFile, showTableMention, filteredTableMentions, selectedTable,
  selectedAction, prompt, fileInputRef,
  setAttachedFile, handleTableMentionSelect, handleActionSelect,
  handleFileAttach, handlePromptChange, launchCli,
  setSelectedTable, setSelectedAction, renderMessageContent,
}) {
  return (
    <div
      style={{ height: `${topPanelHeight}px` }}
      className="border-b border-border flex flex-col bg-panel p-4 flex-shrink-0 min-h-[150px] relative"
    >
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

      <div className="flex flex-col border-t border-border pt-2 flex-shrink-0 relative">
        {attachedFile && (
          <div className="flex items-center gap-2 px-1 pb-1.5 text-[11px]">
            <span className="text-primary">📎 {attachedFile.name}</span>
            <span className="text-gray-500">({attachedFile.type})</span>
            <button onClick={() => setAttachedFile(null)} className="text-red-400 hover:text-red-300 ml-auto cursor-pointer" title="Remove file">✕</button>
          </div>
        )}

        {showTableMention && filteredTableMentions.length > 0 && (
          <div className="absolute bottom-full left-0 right-0 mb-1 mx-1 max-h-40 overflow-y-auto bg-panel border border-border rounded shadow-lg z-50">
            {filteredTableMentions.map(t => (
              <div
                key={t}
                onClick={() => handleTableMentionSelect(t)}
                className="px-3 py-1.5 text-xs text-textPrimary hover:bg-primary/20 cursor-pointer font-code truncate"
              >{t}</div>
            ))}
          </div>
        )}

        {selectedTable.length > 0 && (
          <div className="flex items-center gap-1.5 px-1 pb-1.5 flex-wrap">
            {selectedTable.map(t => (
              <span key={t} className="text-[11px] text-primary font-bold">@{t}</span>
            ))}
            {["seed", "edit", "delete", "insert", "select", "describe"].map(a => (
              <button
                key={a}
                onClick={() => handleActionSelect(a)}
                className={`text-[10px] px-2 py-0.5 rounded font-bold transition-all cursor-pointer ${
                  selectedAction === a ? "bg-primary text-background" : "bg-white/5 text-gray-400 hover:text-textPrimary hover:bg-white/10"
                }`}
              >{a}</button>
            ))}
            <button
              onClick={() => { setSelectedTable([]); setSelectedAction(""); }}
              className="text-[10px] text-red-400 hover:text-red-300 ml-auto cursor-pointer px-1"
              title="Clear table selection"
            >✕</button>
          </div>
        )}

        <div className="flex items-center gap-2">
          <input ref={fileInputRef} type="file" accept=".csv,.json,.txt,.xlsx,.xls" onChange={handleFileAttach} className="hidden" />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={!activeConfig}
            className="text-gray-400 hover:text-primary transition-colors cursor-pointer disabled:opacity-50 shrink-0 p-1"
            title="Attach file (CSV, JSON, Excel)"
          >📎</button>
          <div className="flex-1 relative">
            <input
              type="text"
              value={prompt}
              onChange={handlePromptChange}
              onKeyDown={(e) => { if (e.key === 'Enter') launchCli(); }}
              disabled={!activeConfig}
              placeholder={activeConfig ? "type your command here... (e.g. 'Seed @public.users with 50 rows') and press Enter" : "Connect to a database first..."}
              className="w-full bg-transparent border-none focus:outline-none font-code text-sm text-textPrimary disabled:opacity-50"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
