import { useState, useCallback, useEffect } from 'react';
import { shortcutService } from '../services/shortcutService';

export function useUI() {
  const [viewMode, setViewMode] = useState('ai');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(256);
  const [topPanelHeight, setTopPanelHeight] = useState(300);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [isResizingTopPanel, setIsResizingTopPanel] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [shortcuts, setShortcuts] = useState(shortcutService.getShortcuts());
  const [backendStatus, setBackendStatus] = useState('checking');
  const [showSavedItems, setShowSavedItems] = useState(false);

  // Modals
  const [showExportDbModal, setShowExportDbModal] = useState(false);
  const [showImportDbModal, setShowImportDbModal] = useState(false);
  const [showMigrationModal, setShowMigrationModal] = useState(false);
  const [showCopyDbModal, setShowCopyDbModal] = useState(false);
  const [copyDbSource, setCopyDbSource] = useState(null);
  const [showCreateDbModal, setShowCreateDbModal] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [serverActionModal, setServerActionModal] = useState(null);
  const [propertiesModal, setPropertiesModal] = useState(null);
  const [diagnosisTarget, setDiagnosisTarget] = useState(null);

  // Entity Graph
  const [showEntityGraph, setShowEntityGraph] = useState(false);
  const [entityGraphTarget, setEntityGraphTarget] = useState(null); // { database, schema, config }

  const startResizingSidebar = useCallback((e) => {
    e.preventDefault();
    setIsResizingSidebar(true);
  }, []);

  const startResizingTopPanel = useCallback((e) => {
    e.preventDefault();
    setIsResizingTopPanel(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizingSidebar(false);
    setIsResizingTopPanel(false);
  }, []);

  const resize = useCallback((e) => {
    if (isResizingSidebar) {
      const newWidth = e.clientX;
      if (newWidth > 48 && newWidth < 600) setSidebarWidth(newWidth);
    }
    if (isResizingTopPanel) {
      const newHeight = e.clientY - 84;
      if (newHeight > 100 && newHeight < window.innerHeight - 200) setTopPanelHeight(newHeight);
    }
  }, [isResizingSidebar, isResizingTopPanel]);

  useEffect(() => {
    if (isResizingSidebar || isResizingTopPanel) {
      window.addEventListener('mousemove', resize);
      window.addEventListener('mouseup', stopResizing);
    } else {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    }
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [isResizingSidebar, isResizingTopPanel, resize, stopResizing]);

  const handleSaveShortcut = useCallback((id, combo, reset = false) => {
    if (reset) {
      const defaults = shortcutService.resetShortcuts();
      setShortcuts(defaults);
    } else {
      const updated = shortcutService.saveShortcut(id, combo);
      setShortcuts({ ...updated });
    }
  }, []);

  const handleExplorerContextMenu = useCallback((e, entity) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, entity });
  }, []);

  return {
    viewMode, setViewMode,
    sidebarCollapsed, setSidebarCollapsed,
    sidebarWidth, setSidebarWidth,
    topPanelHeight, setTopPanelHeight,
    isResizingSidebar, isResizingTopPanel,
    showCommandPalette, setShowCommandPalette,
    showShortcutsModal, setShowShortcutsModal,
    shortcuts, setShortcuts,
    backendStatus, setBackendStatus,
    showSavedItems, setShowSavedItems,
    showExportDbModal, setShowExportDbModal,
    showImportDbModal, setShowImportDbModal,
    showMigrationModal, setShowMigrationModal,
    showCopyDbModal, setShowCopyDbModal,
    copyDbSource, setCopyDbSource,
    showCreateDbModal, setShowCreateDbModal,
    contextMenu, setContextMenu,
    serverActionModal, setServerActionModal,
    propertiesModal, setPropertiesModal,
    diagnosisTarget, setDiagnosisTarget,
    showEntityGraph, setShowEntityGraph,
    entityGraphTarget, setEntityGraphTarget,
    startResizingSidebar, startResizingTopPanel,
    stopResizing, resize,
    handleSaveShortcut, handleExplorerContextMenu,
  };
}
