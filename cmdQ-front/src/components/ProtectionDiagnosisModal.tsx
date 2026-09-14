import React, { useState, useEffect } from 'react';
import { apiService } from '../services/apiService';
import ScrollArea from './ScrollArea';

export default function ProtectionDiagnosisModal({ schemaName, tableName, activeConfig, onClose, onApplyFix }) {
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const analyze = async () => {
            try {
                setLoading(true);
                const data = await apiService.fetchProtectionAnalysis({
                    db_config: activeConfig,
                    schema_name: schemaName,
                    table_name: tableName
                });
                if (data.status === 'success') {
                    setReport(data.report);
                } else {
                    setError(data.message);
                }
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        analyze();
    }, [schemaName, tableName, activeConfig?.host, activeConfig?.port, activeConfig?.database]);

    if (loading) {
        return (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-panel border border-border rounded-lg shadow-2xl p-8 max-w-md w-full text-center">
                    <div className="text-4xl mb-4 animate-spin inline-block">🔐</div>
                    <h3 className="text-xl font-bold text-primary mb-2">Analyzing Protection Protocol...</h3>
                    <p className="text-gray-400 text-sm italic">Inspecting RLS policies and session requirements for {tableName}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in zoom-in duration-200">
            <div className="bg-panel border border-cyan-500/30 rounded-xl shadow-[0_0_50px_-12px_rgba(6,182,212,0.5)] max-w-2xl w-full flex flex-col max-h-[80vh] overflow-hidden">
                <div className="p-6 border-b border-border flex justify-between items-center bg-cyan-500/5">
                    <div>
                        <h2 className="text-2xl font-bold text-cyan-400 flex items-center gap-3">
                            <span className="text-3xl">🛡️</span> Protection Diagnosis Report
                        </h2>
                        <p className="text-gray-400 text-sm mt-1">Entity: <code className="text-primary">{schemaName}.{tableName}</code></p>
                    </div>
                    <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors text-2xl px-2">×</button>
                </div>

                <ScrollArea className="flex-1 p-6 overflow-y-auto">
                    {error ? (
                        <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-4 rounded-lg">
                            <strong>Analysis Failed:</strong> {error}
                        </div>
                    ) : (
                        <div className="space-y-8">
                            {/* Status Summary */}
                            <div className="flex items-start gap-4 bg-white/5 p-4 rounded-lg border border-white/10">
                                <div className={`text-2xl ${report.is_protected ? 'text-yellow-500' : 'text-green-500'}`}>
                                    {report.is_protected ? '⚠️' : '✅'}
                                </div>
                                <div>
                                    <h4 className="font-bold text-white uppercase tracking-wider text-xs mb-1">Status</h4>
                                    <p className="text-gray-300">
                                        {report.is_protected 
                                            ? `This table is protected by ${report.mechanisms.join(', ')}.`
                                            : "No standard row-level protection detected. The table might be empty, or filtered via search_path."}
                                    </p>
                                </div>
                            </div>

                            {/* Policies / Details */}
                            {report.details?.policies?.length > 0 && (
                                <div>
                                    <h4 className="font-bold text-primary uppercase tracking-widest text-xs mb-3">Active RLS Policies</h4>
                                    <div className="space-y-3">
                                        {report.details.policies.map((p, idx) => (
                                            <div key={idx} className="bg-black/40 border border-border rounded p-3 font-code text-[11px]">
                                                <div className="flex justify-between mb-2">
                                                    <span className="text-cyan-400 font-bold">Policy: {p.name}</span>
                                                    <span className="text-gray-500">CMD: {p.command}</span>
                                                </div>
                                                <div className="text-white/80 line-clamp-2 hover:line-clamp-none transition-all">
                                                    USING ({p.qual})
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Suggested Steps - THE FIX */}
                            <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-5">
                                <h4 className="font-bold text-cyan-400 uppercase tracking-widest text-sm mb-4 flex items-center gap-2">
                                    🚀 Recommended Bypass Protocol
                                </h4>
                                {report.suggested_steps.length > 0 ? (
                                    <div className="space-y-4">
                                        <p className="text-gray-300 text-sm">To access protected data, you need to establish a session context. Run these commands first:</p>
                                        <div className="space-y-2">
                                            {report.suggested_steps.map((step, idx) => (
                                                <div key={idx} className="flex group">
                                                    <code className="bg-black/60 text-cyan-300 p-2 rounded-l border border-border flex-1 border-r-0 font-code text-xs">
                                                        {step}
                                                    </code>
                                                    <button 
                                                        onClick={() => onApplyFix && onApplyFix(step)}
                                                        className="bg-cyan-600 hover:bg-cyan-500 text-black font-bold px-3 py-2 rounded-r transition-colors text-xs"
                                                    >
                                                        Apply
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-gray-400 italic text-sm">No specific context variables detected, but ensure your user has appropriate permissions.</p>
                                )}
                            </div>
                        </div>
                    )}
                </ScrollArea>

                <div className="p-4 border-t border-border bg-black/20 flex justify-end">
                    <button 
                        onClick={onClose}
                        className="bg-white/10 hover:bg-white/20 text-white px-6 py-2 rounded-lg text-sm transition-colors"
                    >
                        Close Report
                    </button>
                </div>
            </div>
        </div>
    );
}
