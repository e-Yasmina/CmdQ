import { useState, useRef, useCallback } from 'react';

export function useTabs() {
  const [openTabs, setOpenTabs] = useState([]);
  const [activeTabId, setActiveTabId] = useState(null);
  const tabStateCache = useRef({});

  const closeTab = useCallback((tabId) => {
    setOpenTabs(prev => prev.filter(id => id !== tabId));
    delete tabStateCache.current[tabId];
  }, []);

  return {
    openTabs, setOpenTabs,
    activeTabId, setActiveTabId,
    tabStateCache,
    closeTab,
  };
}
