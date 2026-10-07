import React, { useState } from 'react';
import ScrollArea from './ScrollArea';
import ReactMarkdown from 'react-markdown';
import { PALETTE } from '../theme/palette';
import { CopyIcon } from './icons/CopyIcon';

interface MetricCardProps {
    title: string;
    value?: any;
    icon: string;
    description?: string;
    status?: string;
    children?: React.ReactNode;
}

function MetricCard({ title, value, icon, description, status, children }: MetricCardProps) {
    const statusColor = status === 'danger' ? 'text-rose-500'
        : status === 'warning' ? 'text-amber-500'
            : status === 'success' ? 'text-emerald-500'
                : 'text-gray-400';

    return (
        <div className="bg-background border border-border rounded p-4 flex flex-col gap-2 md:col-span-1 lg:col-span-1 border-t-2">
            <div className="flex justify-between items-start mb-1 mt-1">
                <div className="flex items-center gap-2">
                    <span className="text-xl">{icon}</span>
                    <h3 className="font-bold text-textPrimary text-sm">{title}</h3>
                </div>
            </div>
            {value !== undefined && <div className={`text-2xl font-black ${statusColor || 'text-primary'}`}>{value}</div>}
            {description && <div className="text-xs text-secondary mt-1">{description}</div>}
            {children && <div className="mt-3 pt-3 border-t border-border">{children}</div>}
        </div>
    );
}

function formatBytes(bytes, decimals = 2) {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

interface SummaryAnalysisViewerProps {
    result: any;
    onConsultAi?: any;
    isAiLoading?: boolean;
    aiError?: string;
    onRefreshMetrics?: any;
    isMetricsLoading?: boolean;
}

export default function SummaryAnalysisViewer({
    result,
    onConsultAi,
    isAiLoading = false,
    aiError = "",
    onRefreshMetrics,
    isMetricsLoading = false,
}: SummaryAnalysisViewerProps) {
    const [copied, setCopied] = useState(false);

    if (!result || !result.metrics) {
        return <div className="p-4 text-secondary italic">No summary metrics available.</div>;
    }

    const { metrics, ai_summary } = result;
    const isTable = metrics.level === 'table';

    return (
        <div className="p-6 space-y-6 pb-12">
            <div className="flex justify-between items-end border-b border-border pb-4">
                <div>
                    <h2 className="text-1xl font-black tracking-tight text-primary flex items-center gap-2">
                        <span>📝</span> Summary Overview
                        {isMetricsLoading && (
                            <span className="text-[10px] font-normal normal-case text-gray-400 animate-pulse">⏳ refreshing metrics…</span>
                        )}
                    </h2>
                    <p className="text-secondary text-sm mt-1">
                        Analyzing {isTable ? 'Table' : 'Database'}: <span className="text-textPrimary font-bold">{metrics.target}</span>
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="text-xs text-gray-400 uppercase tracking-widest bg-white/5 px-2 py-1 rounded">
                        Engine: <span className="text-emerald-400 font-bold">{metrics.db_engine}</span>
                    </div>
                    {onRefreshMetrics && (
                        <button
                            onClick={onRefreshMetrics}
                            disabled={isMetricsLoading}
                            className="text-xs transition-colors cursor-pointer bg-white/5 hover:bg-white/10 text-gray-300 hover:text-primary px-2 py-1 rounded disabled:opacity-50"
                            title="Refresh Database/Table Metrics"
                        >
                            ↻ Metrics
                        </button>
                    )}
                </div>
            </div>

            {/* AI Insights / AI Consult Section */}
            {ai_summary ? (
                <div
                    tabIndex={0}
                    onKeyDown={(e) => {
                        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
                            e.preventDefault();
                            e.stopPropagation();
                            const range = document.createRange();
                            range.selectNodeContents(e.currentTarget.querySelector('.ai-summary-content') || e.currentTarget);
                            const sel = window.getSelection();
                            sel.removeAllRanges();
                            sel.addRange(range);
                        }
                    }}
                    className="bg-primary/5 border border-primary/20 rounded p-4 text-sm font-ui text-textPrimary select-text outline-none focus:ring-1 focus:ring-primary/40 transition-all"
                    style={{ boxShadow: 'inset 0 0 15px var(--color-shadow-inset, rgba(0,0,0,0.1))' }}
                >
                    <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-primary font-bold flex items-center gap-1.5">
                            <span>✨</span> AI Insights & Context:
                        </span>
                        <div className="flex items-center gap-2">
                            {onConsultAi && (
                                <button
                                    onClick={onConsultAi}
                                    disabled={isAiLoading}
                                    className="text-[10px] text-gray-400 hover:text-primary transition-colors flex items-center gap-1 cursor-pointer bg-transparent hover:bg-white/5 px-1.5 py-0.5 rounded disabled:opacity-50"
                                    title="Re-run AI Analysis"
                                >
                                    ↻ Re-analyze
                                </button>
                            )}
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(ai_summary);
                                    setCopied(true);
                                    setTimeout(() => setCopied(false), 2000);
                                }}
                                className="text-[10px] text-gray-400 hover:text-primary transition-colors flex items-center gap-1 cursor-pointer bg-transparent hover:bg-white/5 px-1.5 py-0.5 rounded"
                                title="Copy AI Insights"
                            >
                                {copied ? (
                                    <>
                                        <svg className="w-3 h-3 text-emerald-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                                        <span className="text-emerald-400">Copied</span>
                                    </>
                                ) : (
                                    <>
                                        <CopyIcon className="w-3 h-3" />
                                        <span>Copy Text</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                    <div className="text-textPrimary leading-relaxed overflow-x-auto select-text ai-summary-content">
                        <ReactMarkdown
                            components={{
                                h1: ({ node, ...props }) => <h1 className="text-xl font-bold mt-4 mb-2 text-primary" {...props} />,
                                h2: ({ node, ...props }) => <h2 className="text-lg font-bold mt-4 mb-2 text-primary" {...props} />,
                                h3: ({ node, ...props }) => <h3 className="text-md font-bold mt-3 mb-2 text-primary" {...props} />,
                                p: ({ node, ...props }) => <p className="mb-2" {...props} />,
                                ul: ({ node, ...props }) => <ul className="list-disc pl-5 mb-2 space-y-1" {...props} />,
                                ol: ({ node, ...props }) => <ol className="list-decimal pl-5 mb-2 space-y-1" {...props} />,
                                li: ({ node, ...props }) => <li className="" {...props} />,
                                strong: ({ node, ...props }) => <strong className="font-bold text-textPrimary" {...props} />,
                                em: ({ node, ...props }) => <em className="italic opacity-70" {...props} />,
                                code: ({ node, className, children, ...props }) => (!className && !String(children).includes('\n')) ? <code className="bg-black/10 dark:bg-black/30 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded text-xs font-mono inline" {...props}>{children}</code> : <pre className="bg-black/10 dark:bg-black/30 p-3 rounded my-2 overflow-x-auto text-xs font-mono text-emerald-600 dark:text-emerald-400"><code {...props}>{children}</code></pre>,
                            }}
                        >
                            {ai_summary}
                        </ReactMarkdown>
                    </div>
                </div>
            ) : isAiLoading ? (
                <div className="bg-primary/5 border border-primary/30 rounded p-6 flex flex-col items-center justify-center gap-3 text-center animate-pulse">
                    <div className="text-2xl animate-spin">⚙️</div>
                    <div className="text-sm font-bold text-primary">Consulting AI for Deep Summary & Insights…</div>
                    <p className="text-xs text-secondary max-w-md">
                        Analyzing schema architecture, entity relationships, and operational characteristics for {metrics.target}…
                    </p>
                </div>
            ) : aiError ? (
                <div className="bg-rose-500/10 border border-rose-500/30 rounded p-4 flex items-center justify-between gap-4">
                    <div className="text-xs text-rose-400 font-mono">
                        <span className="font-bold">AI Consult Failed:</span> {aiError}
                    </div>
                    {onConsultAi && (
                        <button
                            onClick={onConsultAi}
                            className="bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/50 text-rose-300 px-3 py-1 rounded text-xs font-bold transition-colors cursor-pointer shrink-0"
                        >
                            ↻ Retry AI Consult
                        </button>
                    )}
                </div>
            ) : onConsultAi ? (
                <div className="bg-gradient-to-r from-primary/10 via-background to-primary/5 border border-primary/20 rounded p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                        <span className="text-2xl">✨</span>
                        <div>
                            <h3 className="font-bold text-sm text-textPrimary flex items-center gap-2">
                                AI Architectural Consult
                                <span className="bg-emerald-500/10 text-emerald-400 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border border-emerald-500/20">On-Demand</span>
                            </h3>
                            <p className="text-xs text-secondary mt-0.5">
                                Generate an AI summary detailing purpose, relational architecture, and schema recommendations.
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onConsultAi}
                        className="bg-primary hover:bg-primary/90 text-background font-bold px-4 py-2 rounded text-xs transition-all shadow-md hover:shadow-primary/20 cursor-pointer flex items-center gap-1.5 shrink-0"
                    >
                        <span>✨</span> Consult AI
                    </button>
                </div>
            ) : null}

            {/* Instant Fast KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
                {isTable ? (
                    <>
                        <MetricCard
                            title="Table Schema Snapshot"
                            icon="📋"
                            description={`${metrics.columns?.length || 0} columns detected`}
                            value={undefined} status={undefined}
                        >
                            <div className="mt-2 text-sm overflow-x-auto">
                                <table className="w-full text-left font-mono text-xs">
                                    <thead>
                                        <tr className="text-gray-500 border-b border-border/50">
                                            <th className="font-bold uppercase pb-1 pr-2">Column Name</th>
                                            <th className="font-bold uppercase pb-1 pr-2">Data Type</th>
                                            <th className="font-bold uppercase pb-1">Key / Opts</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {metrics.columns?.map((col, idx) => {
                                            const isPk = metrics.primary_keys?.includes(col.name);
                                            return (
                                                <tr key={idx} className="border-b border-border/20 last:border-0 hover:bg-white/5">
                                                    <td className={`py-1.5 pr-2 ${isPk ? 'text-amber-400 font-bold' : 'text-gray-300'}`}>{col.name}</td>
                                                    <td className="py-1.5 pr-2 text-emerald-500">{col.type}</td>
                                                    <td className="py-1.5 text-gray-500">
                                                        {isPk && <span className="bg-amber-400/10 text-amber-500 px-1 py-0.5 rounded mr-1" title="Primary Key">PK</span>}
                                                        {!col.nullable && <span className="bg-rose-500/10 text-rose-400 px-1 py-0.5 rounded mr-1" title="Not Null">NN</span>}
                                                        {col.default && <span className="bg-blue-500/10 text-blue-400 px-1 py-0.5 rounded break-all" title={`Default: ${col.default}`}>DEF</span>}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </MetricCard>

                        <div className="space-y-4 flex flex-col">
                            <MetricCard
                                title="Storage Footprint"
                                icon="💾"
                                value={formatBytes(metrics.total_size_bytes)}
                                description="Estimated Physical Size on Disk" status={undefined} children={undefined} />
                            <MetricCard
                                title="Data Volume"
                                icon="📈"
                                value={metrics.approx_rows?.toLocaleString() || 0}
                                description="Live Record Count Approximation" status={undefined} children={undefined} />
                        </div>
                    </>
                ) : (
                    <>
                        <MetricCard
                            title="Infrastructure Footprint"
                            icon="🏢"
                            value={metrics.total_tables?.toLocaleString() || 0}
                            description="Total Tables Detected in Schema" status={undefined} children={undefined} />
                        <MetricCard
                            title="Total Database Size"
                            icon="🗄️"
                            value={formatBytes(metrics.database_size_bytes)}
                            description="Estimated Global Size" status={undefined} children={undefined} />
                    </>
                )}
            </div>
        </div>
    );
}
