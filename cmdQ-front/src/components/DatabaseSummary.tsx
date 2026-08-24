import { useState, useEffect, useRef } from 'react';
import { apiService } from '../services/apiService';
import SummaryAnalysisViewer from './SummaryAnalysisViewer';
import ScrollArea from './ScrollArea';

// Per-database cache so switching between database tabs and coming back
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

export default function DatabaseSummary({ activeConfig, databaseName, command }) {
    const [status, setStatus] = useState('idle'); // idle | loading | done | error
    const [summaryData, setSummaryData] = useState(null);
    const [errorMsg, setErrorMsg] = useState("");
    const abortRef = useRef(null);
    const fetchedKeyRef = useRef(null);

    const dbKey = activeConfig
        ? `${activeConfig.host || ''}/${activeConfig.port || ''}/${activeConfig.database || ''}/${activeConfig.user || ''}`
        : '';

    const load = async () => {
        if (!activeConfig || !databaseName) return;
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        setStatus('loading');
        setErrorMsg('');
        try {
            const data = await apiService.fetchSummaryAnalysis({
                command: command || "",
                db_config: activeConfig,
                schema_name: "",
                table_name: "",
            }, controller.signal);
            if (controller.signal.aborted) return;
            setSummaryData(data);
            setStatus('done');
            cacheSet(dbKey, { status: 'done', data });
        } catch (err) {
            if (err.name === 'AbortError' || controller.signal.aborted) return;
            console.error("Database Summary Error:", err);
            setErrorMsg(err.message || "Failed to load summary");
            setStatus('error');
            cacheSet(dbKey, { status: 'error', errorMsg: err.message || "Failed to load summary" });
        }
    };

    // Hydrate from cache (or reset) whenever the target database/connection changes.
    useEffect(() => {
        abortRef.current?.abort();
        const hit = summaryCache.get(dbKey);
        if (hit) {
            fetchedKeyRef.current = dbKey;
            setStatus(hit.status);
            setSummaryData(hit.data || null);
            setErrorMsg(hit.errorMsg || '');
        } else {
            fetchedKeyRef.current = null;
            setStatus('idle');
            setSummaryData(null);
            setErrorMsg('');
        }
    }, [dbKey]);

    // Abort any in-flight prompt when unmounting.
    useEffect(() => () => abortRef.current?.abort(), []);

    // Kick off the AI prompt in the background as soon as the database tab is opened.
    useEffect(() => {
        if (fetchedKeyRef.current === dbKey) return;
        if (!activeConfig || !databaseName) return;
        fetchedKeyRef.current = dbKey;
        load();
    }, [dbKey]);

    return (
        <div className="h-full flex flex-col text-sm min-h-0">
            <div className="flex justify-between items-center border-b border-border p-4 shrink-0">
                <div>
                    <h2 className="text-lg font-black tracking-tight text-primary flex items-center gap-2">
                        <span>📝</span> Database Summary
                        {status === 'loading' && (
                            <span className="text-[10px] font-normal normal-case text-gray-400 animate-pulse">⏳ generating… this may take a moment</span>
                        )}
                    </h2>
                    <p className="text-secondary text-xs mt-0.5">
                        Overview of: <span className="text-textPrimary font-bold">{databaseName}</span>
                    </p>
                </div>
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

            <ScrollArea className="flex-1 min-h-0 overflow-y-auto">
                {status === 'loading' && (
                    <div className="h-full flex flex-col items-center justify-center text-primary font-code text-sm animate-pulse p-8 text-center max-w-lg mx-auto">
                        <span className="text-3xl mb-4">⚙️</span>
                        Generating AI summary for {databaseName}…
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
        </div>
    );
}
