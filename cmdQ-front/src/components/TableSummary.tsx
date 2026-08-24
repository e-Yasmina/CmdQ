import { useState, useEffect, useRef } from 'react';
import { apiService } from '../services/apiService';
import SummaryAnalysisViewer from './SummaryAnalysisViewer';
import ScrollArea from './ScrollArea';

// Per-table cache so switching between tables/databases and coming back
// restores the summary instantly instead of re-running the slow AI prompt.
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
    const abortRef = useRef(null);
    const fetchedKeyRef = useRef(null);

    const dbKey = activeConfig
        ? `${activeConfig.host || ''}/${activeConfig.port || ''}/${activeConfig.database || ''}/${activeConfig.user || ''}`
        : '';
    const targetKey = `${dbKey}|${schemaName || ''}|${tableName || ''}`;

    const load = async () => {
        if (!activeConfig || !tableName) return;
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        setStatus('loading');
        setErrorMsg('');
        try {
            const data = await apiService.fetchSummaryAnalysis({
                command: command || "",
                db_config: activeConfig,
                schema_name: schemaName || "",
                table_name: tableName,
            }, controller.signal);
            if (controller.signal.aborted) return;
            setSummaryData(data);
            setStatus('done');
            cacheSet(targetKey, { status: 'done', data });
        } catch (err) {
            if (err.name === 'AbortError' || controller.signal.aborted) return;
            console.error("Table Summary Error:", err);
            setErrorMsg(err.message || "Failed to load summary");
            setStatus('error');
            cacheSet(targetKey, { status: 'error', errorMsg: err.message || "Failed to load summary" });
        }
    };

    // Hydrate from cache (or reset) whenever the target table/connection changes.
    useEffect(() => {
        abortRef.current?.abort();
        setIsOpen(false);
        const hit = summaryCache.get(targetKey);
        if (hit) {
            fetchedKeyRef.current = targetKey;
            setStatus(hit.status);
            setSummaryData(hit.data || null);
            setErrorMsg(hit.errorMsg || '');
        } else {
            fetchedKeyRef.current = null;
            setStatus('idle');
            setSummaryData(null);
            setErrorMsg('');
        }
    }, [targetKey]);

    // Abort any in-flight prompt when unmounting.
    useEffect(() => () => abortRef.current?.abort(), []);

    // Kick off the AI prompt in the background as soon as a table is selected,
    // so it loads concurrently with the table/constraints without delaying them.
    useEffect(() => {
        if (fetchedKeyRef.current === targetKey) return;
        if (!activeConfig || !tableName) return;
        fetchedKeyRef.current = targetKey;
        load();
    }, [targetKey]);

    const isLoading = status === 'loading';

    return (
        <div className="mt-2 shrink-0 border border-border rounded bg-panel/20">
            <div className="flex items-center justify-between px-4 py-2">
                <button
                    onClick={() => setIsOpen(prev => !prev)}
                    disabled={isLoading}
                    className="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-wider hover:text-primary/80 transition-colors cursor-pointer flex-1 text-left"
                    title={isOpen ? 'Hide AI Summary' : 'Show AI Summary'}
                >
                    <span className={`inline-block transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}>▶</span>
                    📝 AI Table Summary
                    {isLoading && (
                        <span className="text-[10px] font-normal normal-case text-gray-400 animate-pulse flex items-center gap-1">
                            ⏳ generating… this may take a moment
                        </span>
                    )}
                    {status === 'done' && !isOpen && (
                        <span className="text-[10px] font-normal normal-case text-emerald-400">ready</span>
                    )}
                    {status === 'error' && (
                        <span className="text-[10px] font-normal normal-case text-red-400">failed</span>
                    )}
                </button>
                {(status === 'done' || status === 'error') && (
                    <button
                        onClick={load}
                        className={`text-[10px] transition-colors cursor-pointer bg-transparent hover:bg-white/5 px-1.5 py-0.5 rounded shrink-0 ${status === 'error' ? 'text-red-400 hover:text-red-300' : 'text-gray-400 hover:text-primary'}`}
                        title="Refresh AI Summary"
                    >
                        ↻ Refresh
                    </button>
                )}
            </div>

            {isOpen && (
                <ScrollArea className="border-t border-border max-h-96 overflow-y-auto">
                    {isLoading && (
                        <div className="p-6 text-primary font-code text-sm animate-pulse flex items-center justify-center gap-3">
                            <span className="text-xl">⚙️</span>
                            Generating AI summary for {schemaName}.{tableName}…
                        </div>
                    )}
                    {status === 'error' && (
                        <div className="p-6 text-red-400 font-code text-sm flex flex-col items-center gap-3">
                            <span>Failed to load summary: {errorMsg}</span>
                            <button
                                onClick={load}
                                className="bg-panel border border-border hover:bg-white/5 text-textPrimary px-3 py-1 rounded text-xs font-bold transition-colors cursor-pointer"
                            >↻ Retry</button>
                        </div>
                    )}
                    {status === 'done' && summaryData && (
                        <SummaryAnalysisViewer result={summaryData} />
                    )}
                </ScrollArea>
            )}
        </div>
    );
}
