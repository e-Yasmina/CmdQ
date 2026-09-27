import React, { useState } from 'react';
import { apiService } from '../services/apiService';

export default function SaveFileDialog({ content, defaultFilename, onClose }) {
  const [filename, setFilename] = useState(defaultFilename || 'output.txt');
  const [directory, setDirectory] = useState('');
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);

  const handleBrowse = async () => {
    try {
      if (typeof window.showDirectoryPicker === 'function') {
        const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        if (dirHandle?.name) {
          setStatus(`Selected: ${dirHandle.name}`);
        }
      } else {
        const input = prompt('Enter the full directory path (e.g., C:\\Users\\YourName\\Desktop):');
        if (input) {
          setDirectory(input);
          setStatus(`Selected: ${input}`);
        }
      }
    } catch {
      setStatus('Browse cancelled or not supported. Type the path manually.');
    }
  };

  const handleSave = async () => {
    if (!filename.trim()) {
      setStatus('Please enter a filename.');
      return;
    }
    setSaving(true);
    setStatus('Saving...');
    try {
      const res = await apiService.saveFile({
        content,
        filename: filename.trim(),
        directory: directory.trim()
      });
      setStatus(`Saved to: ${res.path}`);
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-panel border border-border rounded-lg shadow-xl w-full max-w-md mx-4 p-5">
        <h2 className="text-primary font-bold text-sm uppercase mb-4">Save Generated File</h2>

        <label className="text-xs text-secondary block mb-1">Filename</label>
        <input
          className="w-full bg-background border border-border rounded px-3 py-2 text-sm text-primary mb-3"
          value={filename}
          onChange={e => setFilename(e.target.value)}
          placeholder="e.g. schema_diagram.sql"
        />

        <label className="text-xs text-secondary block mb-1">
          Directory <span className="text-gray-500">(leave empty for Desktop)</span>
        </label>
        <div className="flex gap-2 mb-4">
          <input
            className="flex-1 bg-background border border-border rounded px-3 py-2 text-sm text-primary"
            value={directory}
            onChange={e => setDirectory(e.target.value)}
            placeholder="Desktop"
          />
          <button
            onClick={handleBrowse}
            className="bg-border hover:bg-white/10 text-primary px-3 py-2 rounded text-xs font-bold transition-colors"
          >
            Browse
          </button>
        </div>

        {status && (
          <div className="text-xs text-gray-400 mb-3 break-all bg-black/20 p-2 rounded">
            {status}
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="bg-border hover:bg-white/10 text-primary px-4 py-2 rounded text-xs font-bold transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded text-xs font-bold transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
