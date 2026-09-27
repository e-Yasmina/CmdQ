import { useState, useRef, useEffect } from 'react';

export default function SaveQueryModal({ isOpen, onClose, onSave }) {
  const [name, setName] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const handleSave = () => {
    if (name.trim()) {
      onSave(name.trim());
      onClose();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-background/80 backdrop-blur-md p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-panel border border-border rounded-xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 border-b border-border flex justify-between items-center">
          <h2 className="text-sm font-black text-gray-400 uppercase tracking-widest">Save Query</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors cursor-pointer text-xl">✕</button>
        </div>

        <div className="p-4">
          <label className="text-[11px] text-gray-500 font-bold uppercase tracking-wider block mb-2">Query Name</label>
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter a name for this query..."
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-textPrimary placeholder-gray-600 outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
          />
        </div>

        <div className="p-4 border-t border-border flex justify-end gap-2">
          <button
            onClick={onClose}
            className="border border-border hover:bg-white/5 text-textPrimary px-4 py-1.5 rounded text-xs font-bold transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className="bg-primary hover:brightness-110 disabled:opacity-50 text-background px-4 py-1.5 rounded text-xs font-bold transition-all cursor-pointer"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
