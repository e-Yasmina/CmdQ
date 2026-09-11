import { useState, useCallback, useMemo } from 'react';
import { apiService } from '../services/apiService';

export function useAiPrompt() {
  const [prompt, setPrompt] = useState("");
  const [attachedFile, setAttachedFile] = useState(null);
  const [selectedCli, setSelectedCli] = useState("");
  const [customCliCommand, setCustomCliCommand] = useState("");
  const [chatHistory, setChatHistory] = useState([]);
  const [promptHistory, setPromptHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [draftPrompt, setDraftPrompt] = useState("");
  const [selectedTable, setSelectedTable] = useState([]);
  const [selectedAction, setSelectedAction] = useState("");
  const [showTableMention, setShowTableMention] = useState(false);
  const [tableMentionFilter, setTableMentionFilter] = useState("");
  const [availableClis, setAvailableClis] = useState([]);
  const [registeredModels, setRegisteredModels] = useState([]);
  const [editingModel, setEditingModel] = useState(null);
  const [showApiModal, setShowApiModal] = useState(false);
  const [fileInputRef] = useState(() => ({ current: null }));

  const userHistory = useMemo(() => {
    const chatPrompts = chatHistory.filter(m => m.role === 'user').map(m => m.content);
    const combined = [...chatPrompts, ...promptHistory];
    const uniqueInSequence = [];
    for (const p of combined) {
      if (p && typeof p === 'string' && (uniqueInSequence.length === 0 || uniqueInSequence[uniqueInSequence.length - 1] !== p)) {
        uniqueInSequence.push(p);
      }
    }
    return uniqueInSequence;
  }, [chatHistory, promptHistory]);

  const extractTableMentions = useCallback((text) => {
    if (!text) return [];
    const matches = text.match(/@([a-zA-Z0-9_.]+)/g);
    if (!matches) return [];
    return [...new Set(matches.map(m => m.slice(1)))];
  }, []);

  const handlePromptChange = useCallback((e, tableList) => {
    const newValue = e.target.value;
    setPrompt(newValue);
    setHistoryIndex(-1);

    const mentions = extractTableMentions(newValue);
    setSelectedTable(mentions);
    if (mentions.length === 0) setSelectedAction("");

    const atIndex = newValue.lastIndexOf('@');
    if (atIndex === -1 || (atIndex > 0 && newValue[atIndex - 1] !== ' ' && newValue[atIndex - 1] !== '\t' && newValue[atIndex - 1] !== '(')) {
      setShowTableMention(false);
      return;
    }
    const afterAt = newValue.slice(atIndex + 1);
    const spaceIndex = afterAt.search(/[\s,;)]/);
    const filterText = spaceIndex === -1 ? afterAt : afterAt.slice(0, spaceIndex);
    setTableMentionFilter(filterText);
    setShowTableMention(true);
  }, [extractTableMentions]);

  const handleTableMentionSelect = useCallback((tableName) => {
    setPrompt(prev => {
      const atIndex = prev.lastIndexOf('@');
      const beforeAt = prev.slice(0, atIndex);
      const afterMention = prev.slice(atIndex + 1);
      const endIndex = afterMention.search(/[\s,;)]/);
      const rest = endIndex === -1 ? '' : afterMention.slice(endIndex);
      return beforeAt + '@' + tableName + rest + ' ';
    });
    const mentions = extractTableMentions(tableName);
    setSelectedTable(mentions);
    setShowTableMention(false);
  }, [extractTableMentions]);

  const handlePromptKeyDown = useCallback((e, { onEnter, filteredTableMentions, activeMentionIndex, setActiveMentionIndex } = {}) => {
    // If table mentions popup is active
    if (showTableMention && filteredTableMentions && filteredTableMentions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (setActiveMentionIndex) setActiveMentionIndex(prev => (prev + 1) % filteredTableMentions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (setActiveMentionIndex) setActiveMentionIndex(prev => (prev - 1 + filteredTableMentions.length) % filteredTableMentions.length);
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && activeMentionIndex >= 0)) {
        e.preventDefault();
        const selected = filteredTableMentions[activeMentionIndex] || filteredTableMentions[0];
        if (selected) {
          handleTableMentionSelect(selected);
          return;
        }
      }
      if (e.key === 'Escape') {
        setShowTableMention(false);
        return;
      }
    }

    // Normal terminal CLI arrow history navigation
    if (e.key === 'ArrowUp') {
      if (userHistory.length === 0) return;
      e.preventDefault();
      let nextIndex;
      if (historyIndex === -1) {
        setDraftPrompt(prompt);
        nextIndex = userHistory.length - 1;
      } else if (historyIndex > 0) {
        nextIndex = historyIndex - 1;
      } else {
        nextIndex = 0;
      }
      setHistoryIndex(nextIndex);
      const targetPrompt = userHistory[nextIndex] || '';
      setPrompt(targetPrompt);
      const mentions = extractTableMentions(targetPrompt);
      setSelectedTable(mentions);
      setShowTableMention(false);
    } else if (e.key === 'ArrowDown') {
      if (historyIndex === -1) return;
      e.preventDefault();
      if (historyIndex < userHistory.length - 1) {
        const nextIndex = historyIndex + 1;
        setHistoryIndex(nextIndex);
        const targetPrompt = userHistory[nextIndex] || '';
        setPrompt(targetPrompt);
        const mentions = extractTableMentions(targetPrompt);
        setSelectedTable(mentions);
        setShowTableMention(false);
      } else {
        setHistoryIndex(-1);
        setPrompt(draftPrompt);
        const mentions = extractTableMentions(draftPrompt);
        setSelectedTable(mentions);
        setShowTableMention(false);
      }
    } else if (e.key === 'Enter') {
      if (prompt && prompt.trim()) {
        setPromptHistory(prev => [...prev, prompt]);
      }
      setHistoryIndex(-1);
      setDraftPrompt("");
      if (onEnter) onEnter();
    }
  }, [showTableMention, userHistory, historyIndex, prompt, draftPrompt, extractTableMentions, handleTableMentionSelect]);

  const handleActionSelect = useCallback((action) => {
    setSelectedAction(prev => prev === action ? "" : action);
  }, []);

  const fetchClis = useCallback(() => {
    apiService.fetchClis()
      .then(data => {
        if (data.status === "success" && data.clis) {
          setAvailableClis(data.clis);
          if (data.clis.length > 0) {
            setSelectedCli(prev => {
              const stillExists = data.clis.some(c => c.command === prev);
              return stillExists ? prev : data.clis[0].command;
            });
          }
        }
      })
      .catch(err => console.error("Failed to fetch CLIs:", err));
  }, []);

  const fetchRegisteredModels = useCallback(() => {
    apiService.fetchRegisteredModels()
      .then(data => {
        if (data.status === "success") setRegisteredModels(data.models);
      })
      .catch(err => console.error("Failed to fetch registered models:", err));
  }, []);

  const handleApiRegistered = useCallback((newId) => {
    setShowApiModal(false);
    setEditingModel(null);
    fetchClis();
    fetchRegisteredModels();
    setSelectedCli(newId);
  }, [fetchClis, fetchRegisteredModels]);

  const handleEditModel = useCallback((model) => {
    setEditingModel(model);
    setShowApiModal(true);
  }, []);

  const handleDeleteModel = useCallback((modelId, modelName) => {
    if (!window.confirm(`Delete API model "${modelName}"? This cannot be undone.`)) return;
    apiService.deleteApiModel(modelId)
      .then(data => {
        if (data.status === "success") {
          fetchClis();
          fetchRegisteredModels();
          setSelectedCli(prev => prev === modelId ? "" : prev);
        }
      })
      .catch(err => alert("Delete Error: " + err.message));
  }, [fetchClis, fetchRegisteredModels]);

  const handleDebugLaunch = useCallback(async (selectedCli, customCliCommand, activeConfig) => {
    try {
      const command = selectedCli === "custom" ? customCliCommand : selectedCli;
      if (!command) { alert("Please enter a CLI command."); return; }
      const data = await apiService.launchDebugCli({ command, db_config: activeConfig });
      alert(data.message);
    } catch (err) {
      console.error("DEBUG: launchDebugCli error:", err);
      alert("Failed to launch debug terminal: " + err.message);
    }
  }, []);

  const launchCli = useCallback(async ({
    selectedCli, customCliCommand, prompt, activeConfig, chatHistory,
    protectedItems, sessionContext, attachedFile, selectedTable, selectedAction,
    setCurrentAbortController, setSqlResult, setChatHistory, setPrompt: setPromptOuter,
    setAttachedFile: setAttachedFileOuter, setActiveSchemaName, setActiveTableName,
    setSelectedTable: setSelectedTableOuter, activeSchema, activeSchemaName, extractTableFromQuery,
    extractAllTablesFromQuery,
  }) => {
    const command = selectedCli === "custom" ? customCliCommand : selectedCli;
    if (!command) { alert("Please enter a CLI command."); return; }
    if (!prompt) { alert("Please enter a prompt instruction at the bottom."); return; }

    const controller = new AbortController();
    setCurrentAbortController(controller);
    setSqlResult({ loading: true });

    try {
      const data = await apiService.launchAiPrompt({
        command, prompt, db_config: activeConfig, chat_history: chatHistory,
        protected_items: protectedItems, session_context: sessionContext,
        attached_file: attachedFile || undefined,
        selected_table: selectedTable.join(', '), action: selectedAction,
      }, controller.signal);

      setAttachedFileOuter(null);

      if (data.extracted_sql) {
        const cleaned = data.extracted_sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^--.*$/gm, '').trim();
        const isSelect = /^\s*(?:with\b[\s\S]*?\bselect\b|select\b)/i.test(cleaned);
        const extracted = extractTableFromQuery(data.extracted_sql);
        data.isTableClick = false;

        if (isSelect && extracted) {
          let resolvedSchema = extracted.schema;
          if (!resolvedSchema) {
            if (activeSchema) {
              if (activeSchemaName && activeSchema[activeSchemaName]?.[extracted.table]) {
                resolvedSchema = activeSchemaName;
              } else {
                const foundSchema = Object.keys(activeSchema).find(s => activeSchema[s]?.[extracted.table]);
                if (foundSchema) {
                  resolvedSchema = foundSchema;
                }
              }
            }
            if (!resolvedSchema) {
              resolvedSchema = activeSchemaName || (activeSchema && Object.keys(activeSchema).length > 0 ? Object.keys(activeSchema)[0] : null) || 'public';
            }
          }

          data.targetSchema = resolvedSchema;
          data.targetTable = extracted.table;

          setActiveSchemaName(resolvedSchema);
          setActiveTableName(extracted.table);
          const allTables = extractAllTablesFromQuery(data.extracted_sql);
          setSelectedTableOuter(allTables.length > 0 ? allTables : [`${resolvedSchema}.${extracted.table}`]);

          const tableInfo = activeSchema?.[resolvedSchema]?.[extracted.table];
          if (tableInfo) {
            if (tableInfo.has_rls) data.hasRls = tableInfo.has_rls;
            if (tableInfo.constraints) data.constraints = tableInfo.constraints;
            const schemaColumns = Array.isArray(tableInfo) ? tableInfo : (tableInfo.columns || []);
            if ((!data.columns || data.columns.length === 0) && schemaColumns.length > 0) {
              data.columns = schemaColumns;
            }
          }
        } else {
          data.targetSchema = null;
          data.targetTable = null;
        }
      }

      if (data.data && !data.original_data) {
        data.original_data = JSON.parse(JSON.stringify(data.data));
      }

      setSqlResult(data);
      setChatHistory(prev => [
        ...prev,
        { role: "user", content: prompt },
        { role: "assistant", content: data.message || "Action completed." }
      ]);
      setPromptHistory(prev => (prompt && prompt.trim() ? [...prev, prompt] : prev));
      setHistoryIndex(-1);
      setDraftPrompt("");
      setPromptOuter("");
    } catch (err) {
      if (err.name === 'AbortError') {
        setSqlResult({ error: "Operation stopped by user." });
      } else {
        console.error("CLI Execution Error:", err.message);
        setSqlResult({ error: err.message || "Execution failed. Please check the console for more details." });
      }
    }
  }, []);

  return {
    prompt, setPrompt,
    attachedFile, setAttachedFile,
    selectedCli, setSelectedCli,
    customCliCommand, setCustomCliCommand,
    chatHistory, setChatHistory,
    promptHistory, setPromptHistory,
    historyIndex, setHistoryIndex,
    selectedTable, setSelectedTable,
    selectedAction, setSelectedAction,
    showTableMention, setShowTableMention,
    tableMentionFilter, setTableMentionFilter,
    availableClis, setAvailableClis,
    registeredModels, setRegisteredModels,
    editingModel, setEditingModel,
    showApiModal, setShowApiModal,
    fileInputRef,
    extractTableMentions,
    handlePromptChange, handleTableMentionSelect,
    handlePromptKeyDown,
    handleActionSelect, fetchClis, fetchRegisteredModels,
    handleApiRegistered, handleEditModel, handleDeleteModel,
    handleDebugLaunch, launchCli,
  };
}
