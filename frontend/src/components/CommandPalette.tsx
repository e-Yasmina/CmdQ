import React, { useState, useEffect, useRef } from 'react';
import ScrollArea from './ScrollArea';

const CommandPalette = ({ isOpen, onClose, commands }) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);

  const filteredCommands = commands.filter(cmd =>
    cmd.name.toLowerCase().includes(query.toLowerCase()) ||
    cmd.category?.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % filteredCommands.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + filteredCommands.length) % filteredCommands.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          filteredCommands[selectedIndex].action();
          onClose();
        }
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredCommands, selectedIndex, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4 bg-background/80 backdrop-blur-sm" onClick={onClose}>
      <div 
        className="w-full max-w-xl bg-panel border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 border-b border-border flex items-center gap-3">
          <span className="text-primary">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          </span>
          <input
            ref={inputRef}
            type="text"
            placeholder="Type a command or search..."
            className="flex-1 bg-transparent border-none outline-none text-textPrimary text-lg font-ui"
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
          />
          <button 
            onClick={onClose}
            className="text-gray-500 hover:text-white transition-colors cursor-pointer text-xl p-1"
            title="Close (Esc)"
          >
            ✕
          </button>
        </div>

        <ScrollArea className="max-h-[400px] overflow-y-auto p-2">
          {filteredCommands.length > 0 ? (
            <div className="space-y-1">
              {filteredCommands.map((cmd, idx) => (
                <div
                  key={cmd.id}
                  className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all ${idx === selectedIndex ? 'bg-primary text-background' : 'hover:bg-white/5 text-textPrimary'}`}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  onClick={() => {
                    cmd.action();
                    onClose();
                  }}
                >
                  <div className="flex items-center gap-3">
                    <span className={`text-lg ${idx === selectedIndex ? 'text-background' : 'text-primary'}`}>
                      {cmd.icon}
                    </span>
                    <div className="flex flex-col">
                      <span className="font-bold text-sm">{cmd.name}</span>
                      {cmd.category && (
                        <span className={`text-[10px] uppercase tracking-wider ${idx === selectedIndex ? 'text-background/70' : 'text-gray-500'}`}>
                          {cmd.category}
                        </span>
                      )}
                    </div>
                  </div>
                  {cmd.shortcut && (
                    <div className="flex gap-1">
                      {cmd.shortcut.split('+').map(key => (
                        <kbd key={key} className={`px-1.5 py-0.5 rounded text-[10px] font-sans border ${idx === selectedIndex ? 'bg-background/20 border-background/30 text-background' : 'bg-background border-border text-gray-500'}`}>
                          {key}
                        </kbd>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-gray-500 italic text-sm">
              No commands found for "{query}"
            </div>
          )}
        </ScrollArea>
        
        <div className="p-3 bg-background/50 border-t border-border flex justify-between items-center text-[10px] text-gray-500 uppercase font-bold tracking-widest px-4">
          <div className="flex gap-4">
            <span className="flex items-center gap-1"><kbd className="bg-panel border border-border rounded px-1">↑↓</kbd> Navigate</span>
            <span className="flex items-center gap-1"><kbd className="bg-panel border border-border rounded px-1">Enter</kbd> Select</span>
          </div>
          <span>CmdQ Engine v0.0.0</span>
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
