import { useState, useEffect, useRef } from 'react';
import { apiService } from '../services/apiService';
import SummaryAnalysisViewer from './SummaryAnalysisViewer';
import ScrollArea from './ScrollArea';

// Per-database cache so switching between database tabs and coming back
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

export default function DatabaseSummary({ activeConfig, databaseName, command }) {
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

    // Fast metric query without AI (0 tokens, sub-second execution)
    const loadMetrics = async (keepAiSummary = false) => {
        if (!activeConfig || !databaseName) return;
        metricsAbortRef.current?.abort();
        const controller = new AbortController();
        metricsAbortRef.current = controller;
        setStatus('loading');
        setErrorMsg('');
        try {
            const data = await apiService.fetchSummaryAnalysis({
                command: "", // No AI prompt on initial load
                db_config: activeConfig,
                schema_name: "",
                table_name: "",
            }, controller.signal);
            if (controller.signal.aborted) return;

            setSummaryData(prev => {
                const updated = {
                    ...data,
                    ai_summary: keepAiSummary && prev?.ai_summary ? prev.ai_summary : (data.ai_summary || "")
                };
                cacheSet(dbKey, { status: 'done', data: updated, isAiLoading: false, aiError: '' });
                return updated;
            });
            setStatus('done');
        } catch (err) {
            if (err.name === 'AbortError' || controller.signal.aborted) return;
            console.error("Database Summary Metrics Error:", err);
            setErrorMsg(err.message || "Failed to load summary metrics");
            setStatus('error');
            cacheSet(dbKey, { status: 'error', errorMsg: err.message || "Failed to load summary metrics" });
        }
    };

    // On-demand AI consult triggered explicitly by the user
    const handleConsultAi = async () => {
        if (!activeConfig || !databaseName) return;
        aiAbortRef.current?.abort();
        const controller = new AbortController();
        aiAbortRef.current = controller;
        setIsAiLoading(true);
        setAiError('');

        try {
            const data = await apiService.fetchSummaryAnalysis({
                command: command || "",
                db_config: activeConfig,
                schema_name: "",
                table_name: "",
            }, controller.signal);
            if (controller.signal.aborted) return;

            setSummaryData(prev => {
                const updated = {
                    ...(prev || {}),
                    metrics: data.metrics || prev?.metrics,
                    ai_summary: data.ai_summary || "",
                    structured_analysis: data.structured_analysis || null
                };
                cacheSet(dbKey, { status: 'done', data: updated, isAiLoading: false, aiError: '' });
                return updated;
            });
            setIsAiLoading(false);
        } catch (err) {
            if (err.name === 'AbortError' || controller.signal.aborted) return;
            console.error("Database AI Consult Error:", err);
            const msg = err.message || "Failed to generate AI summary";
            setAiError(msg);
            setIsAiLoading(false);
        }
    };

    // Hydrate from cache (or reset) whenever the target database/connection changes.
    useEffect(() => {
        metricsAbortRef.current?.abort();
        aiAbortRef.current?.abort();
        const hit = summaryCache.get(dbKey);
        if (hit) {
            fetchedKeyRef.current = dbKey;
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
    }, [dbKey]);

    // Abort in-flight requests when unmounting.
    useEffect(() => () => {
        metricsAbortRef.current?.abort();
        aiAbortRef.current?.abort();
    }, []);

    // Load fast metrics as soon as the database tab is opened.
    useEffect(() => {
        if (fetchedKeyRef.current === dbKey) return;
        if (!activeConfig || !databaseName) return;
        fetchedKeyRef.current = dbKey;
        loadMetrics();
    }, [dbKey]);

    return (
        <div className="h-full flex flex-col text-sm min-h-0">
            <div className="flex justify-between items-center border-b border-border p-4 shrink-0">
                <div>
                    <h2 className="text-lg font-black tracking-tight text-primary flex items-center gap-2">
                        <span>📝</span> Database Overview
                        {status === 'loading' && (
                            <span className="text-[10px] font-normal normal-case text-gray-400 animate-pulse">⏳ loading schema stats…</span>
                        )}
                    </h2>
                    <p className="text-secondary text-xs mt-0.5">
                        Overview of: <span className="text-textPrimary font-bold">{databaseName}</span>
                    </p>
                </div>
            </div>

            <ScrollArea className="flex-1 min-h-0 overflow-y-auto">
                {status === 'loading' && !summaryData && (
                    <div className="h-full flex flex-col items-center justify-center text-primary font-code text-sm animate-pulse p-8 text-center max-w-lg mx-auto">
                        <span className="text-3xl mb-4">⚙️</span>
                        Loading schema metrics for {databaseName}…
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
                        isMetricsLoading={status === 'loading'}
                    />
                )}
            </ScrollArea>
        </div>
    );
}
