import { useState, useEffect, useRef } from 'react';
import { apiService } from '../services/apiService';
import SummaryAnalysisViewer from './SummaryAnalysisViewer';
import ScrollArea from './ScrollArea';

// Per-table cache so switching between tables/databases and coming back
// restores the summary and any generated AI consult instantly.
const summaryCache = new Map();
const CACHE_LIMIT = 50;

function cacheSet(key, entry) {
    summaryCache.delete(key);
    while (summaryCache.size >= CACHE_LIMIT) {
        summaryCache.delete(summaryCache.keys().next().value);
    }
    summaryCache.set(key, entry);
}

export default function TableSummary({ activeConfig, schemaName, tableName, command }) {
    const [isOpen, setIsOpen] = useState(false);
    const [status, setStatus] = useState('idle'); // idle | loading | done | error
    const [summaryData, setSummaryData] = useState(null);
    const [errorMsg, setErrorMsg] = useState("");
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [aiError, setAiError] = useState("");

    const metricsAbortRef = useRef(null);
    const aiAbortRef = useRef(null);
    const fetchedKeyRef = useRef(null);

    const dbKey = activeConfig
        ? `${activeConfig.host || ''}/${activeConfig.port || ''}/${activeConfig.database || ''}/${activeConfig.user || ''}`
        : '';
    const targetKey = `${dbKey}|${schemaName || ''}|${tableName || ''}`;

    // Fast metric query without AI (0 tokens, sub-second execution)
    const loadMetrics = async (keepAiSummary = false) => {
        if (!activeConfig || !tableName) return;
        metricsAbortRef.current?.abort();
        const controller = new AbortController();
        metricsAbortRef.current = controller;
        setStatus('loading');
        setErrorMsg('');
        try {
            const data = await apiService.fetchSummaryAnalysis({
                command: "", // No AI prompt on initial load
                db_config: activeConfig,
                schema_name: schemaName || "",
                table_name: tableName,
            }, controller.signal);
            if (controller.signal.aborted) return;

            setSummaryData(prev => {
                const updated = {
                    ...data,
                    ai_summary: keepAiSummary && prev?.ai_summary ? prev.ai_summary : (data.ai_summary || "")
                };
                cacheSet(targetKey, { status: 'done', data: updated, isAiLoading: false, aiError: '' });
                return updated;
            });
            setStatus('done');
        } catch (err) {
            if (err.name === 'AbortError' || controller.signal.aborted) return;
            console.error("Table Summary Metrics Error:", err);
            setErrorMsg(err.message || "Failed to load table summary");
            setStatus('error');
            cacheSet(targetKey, { status: 'error', errorMsg: err.message || "Failed to load table summary" });
        }
    };

    // On-demand AI consult triggered explicitly by the user
    const handleConsultAi = async () => {
        if (!activeConfig || !tableName) return;
        aiAbortRef.current?.abort();
        const controller = new AbortController();
        aiAbortRef.current = controller;
        setIsAiLoading(true);
        setAiError('');

        try {
            const data = await apiService.fetchSummaryAnalysis({
                command: command || "",
                db_config: activeConfig,
                schema_name: schemaName || "",
                table_name: tableName,
            }, controller.signal);
            if (controller.signal.aborted) return;

            setSummaryData(prev => {
                const updated = {
                    ...(prev || {}),
                    metrics: data.metrics || prev?.metrics,
                    ai_summary: data.ai_summary || "",
                    structured_analysis: data.structured_analysis || null
                };
                cacheSet(targetKey, { status: 'done', data: updated, isAiLoading: false, aiError: '' });
                return updated;
            });
            setIsAiLoading(false);
        } catch (err) {
            if (err.name === 'AbortError' || controller.signal.aborted) return;
            console.error("Table AI Consult Error:", err);
            const msg = err.message || "Failed to generate AI summary";
            setAiError(msg);
            setIsAiLoading(false);
        }
    };

    // Hydrate from cache (or reset) whenever the target table/connection changes.
    useEffect(() => {
        metricsAbortRef.current?.abort();
        aiAbortRef.current?.abort();
        setIsOpen(false);
        const hit = summaryCache.get(targetKey);
        if (hit) {
            fetchedKeyRef.current = targetKey;
            setStatus(hit.status);
            setSummaryData(hit.data || null);
            setErrorMsg(hit.errorMsg || '');
            setIsAiLoading(hit.isAiLoading || false);
            setAiError(hit.aiError || '');
        } else {
            fetchedKeyRef.current = null;
            setStatus('idle');
            setSummaryData(null);
            setErrorMsg('');
            setIsAiLoading(false);
            setAiError('');
        }
    }, [targetKey]);

    // Abort in-flight requests when unmounting.
    useEffect(() => () => {
        metricsAbortRef.current?.abort();
        aiAbortRef.current?.abort();
    }, []);

    // Load fast metrics as soon as a table is selected.
    useEffect(() => {
        if (fetchedKeyRef.current === targetKey) return;
        if (!activeConfig || !tableName) return;
        fetchedKeyRef.current = targetKey;
        loadMetrics();
    }, [targetKey]);

    const isMetricsLoading = status === 'loading';

    return (
        <div className="mt-2 shrink-0 border border-border rounded bg-panel/20 flex flex-col min-h-0 max-h-[45vh]">
            <div className="flex items-center justify-between px-4 py-2 shrink-0">
                <button
                    onClick={() => setIsOpen(prev => !prev)}
                    className="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-wider hover:text-primary/80 transition-colors cursor-pointer flex-1 text-left"
                    title={isOpen ? 'Hide Table Summary' : 'Show Table Summary'}
                >
                    <span className={`inline-block transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}>▶</span>
                    📝 Table Summary & Metrics
                    {isMetricsLoading && (
                        <span className="text-[10px] font-normal normal-case text-gray-400 animate-pulse flex items-center gap-1">
                            ⏳ loading stats…
                        </span>
                    )}
                    {isAiLoading && (
                        <span className="text-[10px] font-normal normal-case text-primary animate-pulse flex items-center gap-1">
                            ✨ AI consulting…
                        </span>
                    )}
                    {status === 'done' && !isOpen && (
                        <span className="text-[10px] font-normal normal-case text-emerald-400">
                            {summaryData?.ai_summary ? '✨ AI ready' : 'ready'}
                        </span>
                    )}
                    {status === 'error' && (
                        <span className="text-[10px] font-normal normal-case text-red-400">failed</span>
                    )}
                </button>
            </div>

            {isOpen && (
                <ScrollArea className="border-t border-border overflow-y-auto flex-1 min-h-0">
                    {isMetricsLoading && !summaryData && (
                        <div className="p-6 text-primary font-code text-sm animate-pulse flex items-center justify-center gap-3">
                            <span className="text-xl">⚙️</span>
                            Loading table metrics for {schemaName ? `${schemaName}.` : ''}{tableName}…
                        </div>
                    )}
                    {status === 'error' && !summaryData && (
                        <div className="p-6 text-red-400 font-code text-sm flex flex-col items-center gap-3">
                            <span>Failed to load summary: {errorMsg}</span>
                            <button
                                onClick={() => loadMetrics()}
                                className="bg-panel border border-border hover:bg-white/5 text-textPrimary px-3 py-1 rounded text-xs font-bold transition-colors cursor-pointer"
                            >↻ Retry</button>
                        </div>
                    )}
                    {summaryData && (
                        <SummaryAnalysisViewer
                            result={summaryData}
                            onConsultAi={handleConsultAi}
                            isAiLoading={isAiLoading}
                            aiError={aiError}
                            onRefreshMetrics={() => loadMetrics(true)}
                            isMetricsLoading={isMetricsLoading}
                        />
                    )}
                </ScrollArea>
            )}
        </div>
    );
}
