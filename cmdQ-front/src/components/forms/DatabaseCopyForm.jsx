import { useState, useEffect } from 'react';
import { apiService } from '../../services/apiService';

export default function DatabaseCopyForm({ connections, onCancel, onSuccess, sourcePreset }) {
    const [sourceConnId, setSourceConnId] = useState(sourcePreset?.connId || "");
    const [sourceDb, setSourceDb] = useState(sourcePreset?.database || "");
    const [targetConnId, setTargetConnId] = useState("");
    const [targetDbName, setTargetDbName] = useState("");
    const [copyRows, setCopyRows] = useState(true);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [successMsg, setSuccessMsg] = useState(null);
    const [rlsWarnings, setRlsWarnings] = useState(null);

    const srcConn = connections.find(c => c.id === sourceConnId);
    const srcDbs = srcConn ? srcConn.databases : [];
    const srcSchema = srcConn && sourceDb && srcConn.schemas ? srcConn.schemas[sourceDb] : null;

    // Detect RLS tables whenever source schema changes
    useEffect(() => {
        if (!srcSchema) {
            setRlsWarnings(null);
            return;
        }
        const rlsTables = [];
        for (const [schemaName, tables] of Object.entries(srcSchema)) {
            for (const [tableName, tableInfo] of Object.entries(tables)) {
                const hasRls = typeof tableInfo === 'object' && tableInfo !== null && tableInfo.has_rls;
                if (hasRls) {
                    rlsTables.push(`${schemaName}.${tableName}`);
                }
            }
        }
        if (rlsTables.length > 0) {
            setRlsWarnings({
                count: rlsTables.length,
                tables: rlsTables,
                message: `${rlsTables.length} table(s) in this database have Row-Level Security enabled. Data from these tables may be skipped during copy.`
            });
        } else {
            setRlsWarnings(null);
        }
    }, [srcSchema]);

    const handleCopy = async () => {
        if (!sourceConnId || !sourceDb || !targetConnId || !targetDbName.trim()) {
            setError("Please complete all fields.");
            return;
        }

        setIsLoading(true);
        setError(null);
        setSuccessMsg(null);

        const payload = {
            source_config: srcConn.config,
            source_database: sourceDb,
            target_config: tgtConn.config,
            target_database: targetDbName.trim(),
            copy_rows: copyRows
        };

        try {
            const result = await apiService.copyDatabase(payload);
            if (result.status === "success") {
                let msg = result.message;
                if (result.detail) {
                    msg += "\n" + result.detail;
                }
                if (onSuccess) onSuccess(msg, targetConnId);
                onCancel();
            } else {
                setError(result.message);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const tgtConn = connections.find(c => c.id === targetConnId);
    const targetIsSameServer = srcConn && tgtConn && srcConn.id === tgtConn.id;
    const suggestedTargetName = sourceDb ? `${sourceDb}_copy` : "";

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-panel rounded-lg shadow-2xl border border-border w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden">
                <div className="p-4 border-b border-border bg-panel flex justify-between items-center">
                    <h2 className="text-lg font-bold text-primary flex items-center gap-2">
                        <span>📋</span> Copy Database
                    </h2>
                    <button onClick={onCancel} className="text-gray-400 hover:text-white cursor-pointer transition-colors p-1">
                        ✕
                    </button>
                </div>

                <div className="p-6 space-y-5 overflow-y-auto">
                    <p className="text-sm text-gray-400">
                        Copy a database from one server to another. All tables will be replicated.
                    </p>

                    <div className="grid grid-cols-2 gap-5">
                        {/* Source */}
                        <div className="border border-border rounded p-4 bg-background/50">
                            <h3 className="text-sm font-bold text-secondary mb-3 flex items-center gap-2 uppercase tracking-wider">
                                📤 Source
                            </h3>
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">Connection</label>
                                    <select
                                        className="w-full bg-panel border border-border rounded p-2 text-sm text-textPrimary focus:border-primary focus:outline-none"
                                        value={sourceConnId}
                                        onChange={e => { setSourceConnId(e.target.value); setSourceDb(""); }}
                                    >
                                        <option value="">Select Connection...</option>
                                        {connections.map(c => <option key={c.id} value={c.id}>{c.id}</option>)}
                                    </select>
                                </div>
                                {sourceConnId && (
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1">Database</label>
                                        <select
                                            className="w-full bg-panel border border-border rounded p-2 text-sm text-textPrimary focus:border-primary focus:outline-none"
                                            value={sourceDb}
                                            onChange={e => setSourceDb(e.target.value)}
                                        >
                                            <option value="">Select Database...</option>
                                            {srcDbs.map(db => <option key={db} value={db}>{db}</option>)}
                                        </select>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Target */}
                        <div className="border border-border rounded p-4 bg-background/50">
                            <h3 className="text-sm font-bold text-secondary mb-3 flex items-center gap-2 uppercase tracking-wider">
                                📥 Target
                            </h3>
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">Connection</label>
                                    <select
                                        className="w-full bg-panel border border-border rounded p-2 text-sm text-textPrimary focus:border-primary focus:outline-none"
                                        value={targetConnId}
                                        onChange={e => { setTargetConnId(e.target.value); }}
                                    >
                                        <option value="">Select Connection...</option>
                                        {connections.map(c => <option key={c.id} value={c.id}>{c.id}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">New Database Name</label>
                                    <input
                                        type="text"
                                        value={targetDbName}
                                        onChange={e => setTargetDbName(e.target.value)}
                                        placeholder={suggestedTargetName || "e.g. my_copied_db"}
                                        className="w-full bg-panel border border-border rounded p-2 text-sm text-textPrimary focus:border-primary focus:outline-none"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {targetIsSameServer && sourceDb === targetDbName && (
                        <div className="p-3 bg-yellow-500/10 border border-yellow-500/50 text-yellow-400 text-sm rounded">
                            Source and target database names are identical on the same server. Use a different target name.
                        </div>
                    )}

                    {rlsWarnings && (
                        <div className="p-3 bg-red-500/10 border border-red-500/50 text-red-400 text-sm rounded">
                            <div className="flex items-start gap-2">
                                <span className="mt-0.5">🛡️</span>
                                <div>
                                    <p className="font-bold">{rlsWarnings.message}</p>
                                    <details className="mt-1">
                                        <summary className="text-xs cursor-pointer hover:text-red-300">View affected tables</summary>
                                        <ul className="mt-1 ml-2 list-disc list-inside text-xs space-y-0.5">
                                            {rlsWarnings.tables.map(t => <li key={t}>{t}</li>)}
                                        </ul>
                                    </details>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="flex items-center gap-3 px-1">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={copyRows}
                                onChange={e => setCopyRows(e.target.checked)}
                                className="accent-primary cursor-pointer w-4 h-4"
                            />
                            <span className="text-sm text-textPrimary font-medium">Copy data rows</span>
                        </label>
                        {!copyRows && (
                            <span className="text-xs text-gray-500">(structure only: tables, columns, constraints)</span>
                        )}
                    </div>

                    {error && (
                        <div className="p-3 bg-red-500/10 border border-red-500/50 text-red-400 text-sm rounded">
                            {error}
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-border bg-panel flex justify-end gap-3">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 hover:bg-white/5 text-textPrimary text-sm font-bold rounded cursor-pointer transition-colors"
                        disabled={isLoading}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleCopy}
                        className="px-5 py-2 bg-primary hover:brightness-110 text-background text-sm font-bold rounded cursor-pointer transition-all flex items-center gap-2 disabled:opacity-50"
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <><div className="w-4 h-4 border-2 border-background border-t-transparent rounded-full animate-spin"></div> Copying...</>
                        ) : (
                            <>📋 Start Copy</>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}