const DEFAULT_SHORTCUTS = {
  'toggle-sidebar': 'Ctrl+B',
  'switch-ai': 'Ctrl+Shift+P',
  'switch-sql': 'Ctrl+Shift+E',
  'add-server': 'Ctrl+Alt+N',
  'sec-analysis': 'Ctrl+Shift+S',
  'perf-analysis': 'Ctrl+Shift+L',
  'undo-mutation': 'Ctrl+Z',
  'command-palette': 'Ctrl+K'
};

const STORAGE_KEY = 'cmdq_shortcuts';

export const shortcutService = {
  getShortcuts: () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? { ...DEFAULT_SHORTCUTS, ...JSON.parse(saved) } : DEFAULT_SHORTCUTS;
    } catch (e) {
      return DEFAULT_SHORTCUTS;
    }
  },

  saveShortcut: (id, keyCombo) => {
    const shortcuts = shortcutService.getShortcuts();
    shortcuts[id] = keyCombo;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(shortcuts));
    return shortcuts;
  },

  resetShortcuts: () => {
    localStorage.removeItem(STORAGE_KEY);
    return DEFAULT_SHORTCUTS;
  },

  formatForDisplay: (combo) => {
    if (!combo) return '';
    return combo.replace('Control', 'Ctrl').replace('Alt', 'Alt').replace('Shift', 'Shift');
  },

  matches: (e, combo) => {
    if (!combo) return false;
    const parts = combo.split('+');
    const key = parts[parts.length - 1].toLowerCase();
    const ctrl = parts.includes('Ctrl') || parts.includes('Control');
    const shift = parts.includes('Shift');
    const alt = parts.includes('Alt');
    const meta = parts.includes('Meta') || parts.includes('Cmd');

    return (
      e.key.toLowerCase() === key &&
      (e.ctrlKey || e.metaKey) === ctrl &&
      e.shiftKey === shift &&
      e.altKey === alt
    );
  }
};
