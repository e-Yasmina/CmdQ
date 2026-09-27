import React, { useState, useEffect, useRef } from 'react';
import { shortcutService } from '../services/shortcutService';

const ShortcutsModal = ({ isOpen, onClose, shortcuts, onSave }) => {
  const [editingId, setEditingId] = useState(null);
  const [tempCombo, setTempCombo] = useState('');
  const modalRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      modalRef.current?.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleRecord = (id) => {
    setEditingId(id);
    setTempCombo('');
  };

  const handleKeyDown = (e) => {
    if (editingId) {
      e.preventDefault();
      if (e.key === 'Escape') {
        setEditingId(null);
        return;
      }
      if (e.key === 'Enter' && tempCombo) {
        onSave(editingId, tempCombo);
        setEditingId(null);
        return;
      }

      const parts = [];
      if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
      if (e.shiftKey) parts.push('Shift');
      if (e.altKey) parts.push('Alt');
      
      const key = e.key.length === 1 ? e.key.toUpperCase() : (e.key === ' ' ? 'Space' : e.key);
      if (!['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
        parts.push(key);
        setTempCombo(parts.join('+'));
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div 
      ref={modalRef}
      className="fixed inset-0 z-[110] flex items-center justify-center bg-background/80 backdrop-blur-md p-4 outline-none" 
      onKeyDown={handleKeyDown} 
      onClick={onClose}
      tabIndex="0"
    >
      <div 
        className="w-full max-w-md bg-panel border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 border-b border-border flex justify-between items-center">
          <h2 className="text-sm font-black text-gray-400 uppercase tracking-widest">Keyboard Shortcuts</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors cursor-pointer text-xl">✕</button>
        </div>
        
        <div className="p-4 space-y-3 overflow-y-auto max-h-[60vh] custom-scrollbar">
          {Object.entries(shortcuts).map(([id, combo]) => (
            <div key={id} className="flex items-center justify-between p-2 hover:bg-white/5 rounded-lg group">
              <span className="text-xs text-gray-400 capitalize">{id.replace(/-/g, ' ')}</span>
              <div className="flex items-center gap-2">
                {editingId === id ? (
                  <div className="bg-primary/20 border border-primary text-primary px-3 py-1 rounded text-xs font-bold animate-pulse min-w-[100px] text-center">
                    {tempCombo || 'Press keys...'}
                  </div>
                ) : (
                  <button 
                    onClick={() => handleRecord(id)}
                    className="bg-background border border-border px-2 py-1 rounded text-[10px] font-sans text-gray-500 hover:border-primary hover:text-primary transition-all cursor-pointer"
                  >
                    {combo}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-border bg-background/30 flex justify-between items-center text-[10px] text-gray-500 uppercase font-bold px-6">
          <span>Click a shortcut to change it</span>
          <button 
            onClick={() => {
              if (window.confirm("Reset all shortcuts to defaults?")) {
                onSave(null, null, true);
              }
            }}
            className="text-red-500/50 hover:text-red-500 transition-colors"
          >
            Reset All
          </button>
        </div>
      </div>
    </div>
  );
};

export default ShortcutsModal;
