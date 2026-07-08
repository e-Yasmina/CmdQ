import { useState, useCallback } from 'react';
import { apiService } from '../services/apiService';

export function useAnalysis() {
  const [sqlResult, setSqlResult] = useState(null);
  const [sqlQuery, setSqlQuery] = useState("");
  const [isQueryExecuting, setIsQueryExecuting] = useState(false);
  const [currentAbortController, setCurrentAbortController] = useState(null);
  const [mutationHistory, setMutationHistory] = useState([]);
  const [copyFeedback, setCopyFeedback] = useState(false);

  const extractTableFromQuery = useCallback((query) => {
    if (!query) return null;
    const cleaned = query.replace(/^--.*$/gm, '').trim();
    const match = cleaned.match(/\bfrom\s+([`"\[]?[a-zA-Z0-9_]+[`"\]]?(?:\.[`"\[]?[a-zA-Z0-9_]+[`"\]]?)?)/i);
    if (match) {
      const full = match[1].replace(/[`"\[\]]/g, '');
      const parts = full.split('.');
      if (parts.length === 2) return { schema: parts[0], table: parts[1] };
      return { schema: null, table: parts[0] };
    }
    return null;
  }, []);

  const extractAllTablesFromQuery = useCallback((query) => {
    if (!query) return [];
    const cleaned = query.replace(/^--.*$/gm, '').trim();
    const tables = [];
    const regex = /\b(?:from|join)\s+([`"\[]?[a-zA-Z0-9_]+[`"\]]?(?:\.[`"\[]?[a-zA-Z0-9_]+[`"\]]?)?)/gi;
    let match;
    while ((match = regex.exec(cleaned)) !== null) {
      const full = match[1].replace(/[`"\[\]]/g, '');
      const parts = full.split('.');
      let schema, table;
      if (parts.length === 2) { schema = parts[0]; table = parts[1]; }
      else { schema = null; table = parts[0]; }
      const tableRef = `${schema}.${table}`;
      if (!tables.includes(tableRef)) tables.push(tableRef);
    }
    return tables;
  }, []);

  const executeManualQuery = useCallback(async (queryText, activeConfig, sessionContext) => {
    if (!activeConfig || !queryText.trim()) return;
    setSqlResult({ loading: true });
    setIsQueryExecuting(true);
    try {
      const data = await apiService.executeQuery({ query: queryText, db_config: activeConfig, session_context: sessionContext });

      const extracted = extractTableFromQuery(queryText);
      const isSelect = queryText.toLowerCase().trim().startsWith('select');

      if (data.status === "error") {
        setSqlResult({ error: data.message || "Query Failed" });
        return;
      }

      setSqlResult({
        data: data.data || [],
        original_data: data.data ? JSON.parse(JSON.stringify(data.data)) : [],
        message: data.message,
        extracted_sql: queryText,
        isTableClick: false,
        targetSchema: (isSelect && extracted) ? extracted.schema : null,
        targetTable: (isSelect && extracted) ? extracted.table : null,
      });
    } catch (err) {
      setSqlResult({ error: err.message });
    } finally {
      setIsQueryExecuting(false);
    }
  }, [extractTableFromQuery]);

  const stopAi = useCallback(() => {
    if (currentAbortController) {
      currentAbortController.abort();
      setCurrentAbortController(null);
      setSqlResult(prev => ({ ...prev, loading: false }));
    }
  }, [currentAbortController]);

  const handleUndoMutation = useCallback(() => {
    setMutationHistory(prev => {
      if (prev.length === 0) return prev;
      const lastState = prev[prev.length - 1];
      setSqlResult(lastState);
      return prev.slice(0, -1);
    });
  }, []);

  const handleCopyResults = useCallback(() => {
    if (!sqlResult) return;
    let textToCopy = "";

    if (sqlResult.data && sqlResult.data.length > 0) {
      textToCopy = JSON.stringify(sqlResult.data, null, 2);
    } else if (['security_analysis', 'performance_analysis', 'data_analysis', 'summary_analysis'].includes(sqlResult.type)) {
      const { type, loading, ...rest } = sqlResult;
      textToCopy = JSON.stringify(rest, null, 2);
    } else if (sqlResult.message) {
      textToCopy = sqlResult.message;
    }

    if (textToCopy) {
      navigator.clipboard.writeText(textToCopy).then(() => {
        setCopyFeedback(true);
        setTimeout(() => setCopyFeedback(false), 2000);
      }).catch(err => {
        console.error("Failed to copy:", err);
        alert("Failed to copy to clipboard");
      });
    }
  }, [sqlResult]);

  const launchAiAnalysis = useCallback(async (type, activeConfig, selectedCli, customCliCommand,
    activeSchemaName, activeTableName, setActiveSchemaName, setActiveTableName, setSelectedTable,
    activeSchema, sessionContext) => {
    if (!activeConfig) return;

    const command = selectedCli === "custom" ? customCliCommand : selectedCli;
    if (!command && (type !== 'security' && type !== 'performance' && type !== 'data' && type !== 'summary')) {
      alert("Please select or enter an AI CLI command first.");
      return;
    }

    setSqlResult({ loading: true });
    setIsQueryExecuting(true);

    const controller = new AbortController();
    setCurrentAbortController(controller);

    try {
      const payload = {
        command: command || "",
        db_config: activeConfig,
        schema_name: activeSchemaName || "",
        table_name: activeTableName || "",
      };

      let data;
      if (type === 'security') data = await apiService.fetchSecurityAnalysis(payload, controller.signal);
      else if (type === 'performance') data = await apiService.fetchPerformanceAnalysis(payload, controller.signal);
      else if (type === 'data') data = await apiService.fetchDataAnalysis(payload, controller.signal);
      else if (type === 'summary') data = await apiService.fetchSummaryAnalysis(payload, controller.signal);

      setSqlResult({ type: `${type}_analysis`, ...data });
    } catch (err) {
      if (err.name === 'AbortError') {
        setSqlResult({ error: "Analysis stopped by user." });
      } else {
        console.error(`${type} Analysis Error:`, err);
        setSqlResult({ error: "Analysis failed: " + err.message });
      }
    } finally {
      setIsQueryExecuting(false);
      setCurrentAbortController(null);
    }
  }, []);

  const handleTranslateView = useCallback(async (sqlResult, selectedCli, customCliCommand) => {
    if (!sqlResult?.data || sqlResult.data.length === 0) {
      alert("No data available to translate. Please run a query first.");
      return;
    }

    const command = selectedCli === "custom" ? customCliCommand : selectedCli;
    if (!command) {
      alert("Please select or register an AI provider in the AI settings first.");
      return;
    }

    setSqlResult(prev => ({ ...prev, loading: true, message: "Translating view via AI... this may take a moment depending on the result size." }));
    try {
      const translatedData = await apiService.translateTable({ command, table_data: sqlResult.data });
      setSqlResult(prev => ({
        ...prev,
        original_data: prev.original_data || prev.data,
        data: translatedData.data,
        message: "Translation applied to view.",
        loading: false,
      }));
    } catch (err) {
      setSqlResult(prev => ({ ...prev, loading: false, error: "Failed to translate: " + err.message }));
    }
  }, []);

  return {
    sqlResult, setSqlResult,
    sqlQuery, setSqlQuery,
    isQueryExecuting, setIsQueryExecuting,
    currentAbortController, setCurrentAbortController,
    mutationHistory, setMutationHistory,
    copyFeedback, setCopyFeedback,
    extractTableFromQuery, extractAllTablesFromQuery,
    executeManualQuery, stopAi,
    handleUndoMutation, handleCopyResults,
    launchAiAnalysis, handleTranslateView,
  };
}
