import React, { useState } from 'react';
import ScrollArea from './ScrollArea';
import ReactMarkdown from 'react-markdown';
import { PALETTE } from '../theme/palette';
import { CopyIcon } from './icons/CopyIcon';

function MetricCard({ title, value, icon, description, status, children }) {
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

export default function SummaryAnalysisViewer({ result }) {
    const [copied, setCopied] = useState(false);

    if (!result || !result.metrics) {
        return <div className="p-4 text-secondary italic">No summary metrics available.</div>;
    }

    const { metrics, ai_summary } = result;
    const isTable = metrics.level === 'table';

    return (
        <ScrollArea className="flex-1 p-6 space-y-6 overflow-y-auto">
            <div className="flex justify-between items-end border-b border-border pb-4">
                <div>
                    <h2 className="text-2xl font-black tracking-tight text-primary flex items-center gap-2">
                        <span>📝</span> Summary Overview
                    </h2>
                    <p className="text-secondary text-sm mt-1">
                        Analyzing {isTable ? 'Table' : 'Database'}: <span className="text-textPrimary font-bold">{metrics.target}</span>
                    </p>
                </div>
                <div className="text-xs text-gray-400 uppercase tracking-widest bg-white/5 px-2 py-1 rounded">
                    Engine: <span className="text-emerald-400 font-bold">{metrics.db_engine}</span>
                </div>
            </div>

            {ai_summary && (
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
                    className="bg-primary/5 border border-primary/20 rounded p-4 text-sm font-ui text-textPrimary select-text outline-none focus:ring-1 focus:ring-primary/40"
                    style={{ boxShadow: `inset 0 0 15px ${PALETTE.shadowInset}` }}
                >
                    <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-primary font-bold">✨ AI Insights & Context:</span>
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
                    <div className="text-gray-300 leading-relaxed overflow-x-auto select-text ai-summary-content">
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
                                em: ({ node, ...props }) => <em className="italic text-gray-400" {...props} />,
                                code: ({ node, inline, ...props }) => inline ? <code className="bg-black/30 text-emerald-400 px-1.5 py-0.5 rounded text-xs font-mono" {...props} /> : <pre className="bg-black/30 p-3 rounded my-2 overflow-x-auto text-xs font-mono text-emerald-400"><code {...props} /></pre>,
                            }}
                        >
                            {ai_summary}
                        </ReactMarkdown>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
                {isTable ? (
                    <>
                        <MetricCard
                            title="Table Schema Snapshot"
                            icon="📋"
                            description={`${metrics.columns?.length || 0} columns detected`}
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
                                description="Estimated Physical Size on Disk"
                            />
                            <MetricCard
                                title="Data Volume"
                                icon="📈"
                                value={metrics.approx_rows?.toLocaleString() || 0}
                                description="Live Record Count Approximation"
                            />
                        </div>
                    </>
                ) : (
                    <>
                        <MetricCard
                            title="Infrastructure Footprint"
                            icon="🏢"
                            value={metrics.total_tables?.toLocaleString() || 0}
                            description="Total Tables Detected in Schema"
                        />
                        <MetricCard
                            title="Total Database Size"
                            icon="🗄️"
                            value={formatBytes(metrics.database_size_bytes)}
                            description="Estimated Global Size"
                        />
                    </>
                )}
            </div>
        </ScrollArea>
    );
}
