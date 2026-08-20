import React, { useRef, useState, useEffect } from 'react';
import ScrollArea from '../ScrollArea';
import { CopyIcon } from '../icons/CopyIcon';

export default function AiPanel({
  topPanelHeight, startResizingTopPanel, activeConfig, chatHistory,
  attachedFile, showTableMention, filteredTableMentions, selectedTable,
  selectedAction, prompt, fileInputRef, historyIndex,
  setAttachedFile, handleTableMentionSelect, handleActionSelect,
  handleFileAttach, handlePromptChange, handlePromptKeyDown, launchCli,
  setSelectedTable, setSelectedAction, renderMessageContent,
}) {
  const conversationRef = useRef(null);
  const inputRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);

  useEffect(() => {
    if (showTableMention) {
      setActiveMentionIndex(0);
    }
  }, [showTableMention]);

  useEffect(() => {
    if (inputRef.current && historyIndex !== undefined && historyIndex !== -1) {
      const len = inputRef.current.value.length;
      inputRef.current.setSelectionRange(len, len);
    }
  }, [prompt, historyIndex]);

  const handleSelectAll = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      e.stopPropagation();
      if (conversationRef.current) {
        const sel = window.getSelection();
        sel.removeAllRanges();
        const range = document.createRange();
        range.selectNodeContents(conversationRef.current);
        sel.addRange(range);
      }
    }
  };

  const handleCopyAll = (e) => {
    e.stopPropagation();
    if (!chatHistory || chatHistory.length === 0) return;
    const text = chatHistory.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}:\n${m.content}`).join('\n\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div
      style={{ height: `${topPanelHeight}px` }}
      className="border-b border-border flex flex-col bg-panel p-4 flex-shrink-0 min-h-[150px] relative"
    >
      <div
        className="h-1 cursor-row-resize hover:bg-primary/50 transition-colors z-[60] absolute left-0 right-0 bottom-0"
        onMouseDown={startResizingTopPanel}
      />
      <div className="flex justify-between items-center mb-1 shrink-0">
        <span className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Conversation History</span>
        {chatHistory.length > 0 && (
          <button
            onClick={handleCopyAll}
            className="text-[10px] text-gray-400 hover:text-primary transition-colors flex items-center gap-1 cursor-pointer bg-transparent hover:bg-white/5 px-1.5 py-0.5 rounded"
            title="Copy entire conversation"
          >
            {copied ? (
              <>
                <svg className="w-3 h-3 text-emerald-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                <span className="text-emerald-400">Copied</span>
              </>
            ) : (
              <>
                <CopyIcon className="w-3 h-3" />
                <span>Copy All</span>
              </>
            )}
          </button>
        )}
      </div>
      <ScrollArea
        tabIndex={0}
        onKeyDown={handleSelectAll}
        className="font-code text-sm overflow-y-auto flex-1 mb-2 select-text outline-none focus:ring-1 focus:ring-primary/40 rounded p-1"
      >
        <div ref={conversationRef} className="select-text">
          <div className="text-gray-500 mb-2">System: CmdQ initialized. {activeConfig ? 'Ready for commands.' : 'Waiting for connection...'}</div>
          {activeConfig && <div className="text-secondary mb-2">&gt; Connected to {activeConfig.database} via {activeConfig.user}@{activeConfig.host}:{activeConfig.port}.</div>}
          {chatHistory.map((msg, i) => (
            <div key={i} className={`mb-2 select-text ${msg.role === 'user' ? 'text-primary font-bold whitespace-pre-wrap' : 'text-gray-300'}`}>
              <span className="opacity-50 inline-block mr-1 align-top">{msg.role === 'user' ? '>' : '#'}</span>
              <div className="inline-block select-text align-top" style={{ width: 'calc(100% - 20px)' }}>
                {msg.role === 'user' ? msg.content : renderMessageContent(msg.content)}
              </div>
            </div>
          ))}
        </div>
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
            {filteredTableMentions.map((t, idx) => (
              <div
                key={t}
                onClick={() => handleTableMentionSelect(t)}
                className={`px-3 py-1.5 text-xs text-textPrimary cursor-pointer font-code truncate ${
                  activeMentionIndex === idx ? 'bg-primary/30 font-bold' : 'hover:bg-primary/20'
                }`}
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
              ref={inputRef}
              type="text"
              value={prompt}
              onChange={handlePromptChange}
              onKeyDown={(e) => {
                if (handlePromptKeyDown) {
                  handlePromptKeyDown(e, {
                    onEnter: launchCli,
                    filteredTableMentions,
                    activeMentionIndex,
                    setActiveMentionIndex
                  });
                } else if (e.key === 'Enter') {
                  launchCli();
                }
              }}
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
