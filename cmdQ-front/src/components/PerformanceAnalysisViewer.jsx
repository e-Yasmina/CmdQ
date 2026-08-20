import React, { useState } from 'react';
import ScrollArea from './ScrollArea';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line } from 'recharts';
import ReactMarkdown from 'react-markdown';
import { PALETTE } from '../theme/palette';
import { CopyIcon } from './icons/CopyIcon';

function MetricCard({ title, value, icon, description, status, children }) {
    const statusColor = status === 'danger' ? 'text-rose-500'
        : status === 'warning' ? 'text-amber-500'
            : status === 'success' ? 'text-emerald-500'
                : 'text-gray-400';

    return (
        <div className="bg-background border border-border rounded p-4 flex flex-col gap-2">
            <div className="flex justify-between items-start mb-1">
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

export default function PerformanceAnalysisViewer({ result }) {
    const [copied, setCopied] = useState(false);

    if (!result || !result.metrics) {
        return <div className="p-4 text-secondary italic">No performance metrics available.</div>;
    }

    const { metrics, ai_summary } = result;
    const isTable = metrics.level === 'table';

    // -- Table Data --
    const sizeData = [
        { name: 'Table Data', value: metrics.table_size_bytes || 0 },
        { name: 'Indexes', value: metrics.index_size_bytes || 0 }
    ];
    const sizeColors = [PALETTE.chartEmerald, PALETTE.chartBlue];

    const scanData = [
        { name: 'Seq Scans', value: metrics.seq_scans || 0, fill: PALETTE.chartAmber },
        { name: 'Idx Scans', value: metrics.idx_scans || 0, fill: PALETTE.chartIndigo }
    ];

    const bloatData = [
        { name: 'Live', value: metrics.live_rows || 0 },
        { name: 'Dead', value: metrics.dead_rows || 0 }
    ];
    const bloatColors = [PALETTE.chartEmerald, PALETTE.chartRose];

    // -- DB Data --
    const cacheHitRatio = typeof metrics.cache_hit_ratio === 'number' ? (metrics.cache_hit_ratio * 100).toFixed(1) : 0;
    const cacheData = [
        { name: 'Cache Hits', value: metrics.cache_hits || 0 },
        { name: 'Disk Reads', value: metrics.disk_reads || 0 }
    ];
    const cacheColors = [PALETTE.chartEmerald, PALETTE.chartRose];

    const activeConnections = metrics.total_connections || 0;
    const maxConnections = metrics.max_connections || 1;
    const connPercent = Math.round((activeConnections / maxConnections) * 100);

    return (
        <ScrollArea className="flex-1 p-6 space-y-6 overflow-y-auto">
            <div className="flex justify-between items-end border-b border-border pb-4">
                <div>
                    <h2 className="text-2xl font-black tracking-tight text-primary flex items-center gap-2">
                        <span>⚡</span> Performance Analysis
                    </h2>
                    <p className="text-secondary text-sm mt-1">
                        Analyzing {isTable ? 'Table' : 'Database'}: <span className="text-textPrimary font-bold">{metrics.target}</span>
                    </p>
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
                        <span className="text-primary font-bold">✨ AI Insights:</span>
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

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {isTable ? (
                    <>
                        {/* Table Size Breakdown */}
                        <MetricCard
                            title="Storage Footprint"
                            icon="💾"
                            value={formatBytes(metrics.total_size_bytes)}
                            status={metrics.total_size_bytes > 1073741824 ? 'warning' : 'success'}
                        >
                            <div className="h-40 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={sizeData} innerRadius={40} outerRadius={60} paddingAngle={2} dataKey="value" stroke="none">
                                            {sizeData.map((entry, index) => <Cell key={`cell-${index}`} fill={sizeColors[index]} />)}
                                        </Pie>
                                        <Tooltip formatter={(value) => formatBytes(value)} contentStyle={{ backgroundColor: PALETTE.tooltipBg, borderColor: PALETTE.chartBorder }} />
                                        <Legend wrapperStyle={{ fontSize: '12px' }} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </MetricCard>

                        {/* Read/Scan Efficiency */}
                        <MetricCard
                            title="Index Efficiency (Scans)"
                            icon="📈"
                            value={metrics.idx_scan_ratio !== undefined ? `${(metrics.idx_scan_ratio * 100).toFixed(1)}%` : 'N/A'}
                            description="Higher index adoption is better"
                            status={metrics.idx_scan_ratio < 0.5 && metrics.seq_scans > 100 ? 'danger' : 'success'}
                        >
                            <div className="h-32 w-full mt-4">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={scanData} layout="vertical" margin={{ left: -15, right: 15, top: 0, bottom: 0 }}>
                                        <XAxis type="number" hide />
                                        <YAxis dataKey="name" type="category" stroke={PALETTE.chartTextMuted} fontSize={11} axisLine={false} tickLine={false} />
                                        <Tooltip contentStyle={{ backgroundColor: PALETTE.tooltipBg, borderColor: PALETTE.chartBorder }} cursor={{ fill: PALETTE.chartCursorFill }} />
                                        <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={30} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </MetricCard>

                        {/* Row Bloat / Activity */}
                        <MetricCard
                            title="Row Bloat & Activity"
                            icon="🗑️"
                            value={metrics.live_rows?.toLocaleString() || 0}
                            description="Live Rows"
                            status={metrics.bloat_ratio > 0.2 ? 'warning' : 'success'}
                        >
                            {(metrics.dead_rows !== undefined) && (
                                <div className="h-32 w-full flex items-center justify-center">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie data={bloatData} innerRadius={0} outerRadius={50} dataKey="value" stroke={PALETTE.chartBorder} strokeWidth={2}>
                                                {bloatData.map((entry, index) => <Cell key={`cell-${index}`} fill={bloatColors[index]} />)}
                                            </Pie>
                                            <Tooltip contentStyle={{ backgroundColor: PALETTE.tooltipBg, borderColor: PALETTE.chartBorder }} />
                                            <Legend wrapperStyle={{ fontSize: '10px' }} layout="vertical" verticalAlign="middle" align="right" />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                            <div className="grid grid-cols-3 gap-1 text-center mt-2 border-t border-border/50 pt-2">
                                <div>
                                    <div className="text-[10px] text-gray-500 uppercase tracking-wider">Inserts</div>
                                    <div className="text-xs font-bold text-gray-300">{metrics.inserts?.toLocaleString() || '-'}</div>
                                </div>
                                <div>
                                    <div className="text-[10px] text-gray-500 uppercase tracking-wider">Updates</div>
                                    <div className="text-xs font-bold text-gray-300">{metrics.updates?.toLocaleString() || '-'}</div>
                                </div>
                                <div>
                                    <div className="text-[10px] text-gray-500 uppercase tracking-wider">Deletes</div>
                                    <div className="text-xs font-bold text-gray-300">{metrics.deletes?.toLocaleString() || '-'}</div>
                                </div>
                            </div>
                        </MetricCard>

                    </>
                ) : (
                    <>
                        {/* Overall Cache Hit Ratio */}
                        <MetricCard
                            title="Buffer Cache Efficiency"
                            icon="🧠"
                            value={`${cacheHitRatio}%`}
                            description="Percentage of requests served from RAM"
                            status={metrics.cache_hit_ratio < 0.9 ? 'danger' : 'success'}
                        >
                            <div className="h-40 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={cacheData} innerRadius={40} outerRadius={60} paddingAngle={2} dataKey="value" stroke="none">
                                            {cacheData.map((entry, index) => <Cell key={`cell-${index}`} fill={cacheColors[index]} />)}
                                        </Pie>
                                        <Tooltip formatter={(value) => value.toLocaleString()} contentStyle={{ backgroundColor: PALETTE.tooltipBg, borderColor: PALETTE.chartBorder }} />
                                        <Legend wrapperStyle={{ fontSize: '12px' }} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </MetricCard>

                        {/* Connection Saturation */}
                        <MetricCard
                            title="Connection Saturation"
                            icon="🔌"
                            value={metrics.total_connections || 0}
                            description={`Out of ${metrics.max_connections || 'Limit'} allowed`}
                            status={connPercent > 80 ? 'danger' : connPercent > 60 ? 'warning' : 'success'}
                        >
                            <div className="mt-4">
                                <div className="flex justify-between text-xs mb-1">
                                    <span className="text-gray-400">Saturation</span>
                                    <span className={connPercent > 80 ? 'text-rose-500 font-bold' : 'text-emerald-500'}>{connPercent}%</span>
                                </div>
                                <div className="w-full bg-border rounded-full h-2.5 mb-4 overflow-hidden">
                                    <div className={`h-2.5 rounded-full ${connPercent > 80 ? 'bg-rose-500' : connPercent > 60 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(connPercent, 100)}%` }}></div>
                                </div>

                                <div className="flex justify-between text-xs border-t border-border/50 pt-2 text-gray-300">
                                    <span>Actively Executing Queries:</span>
                                    <span className="font-bold text-amber-400">{metrics.active_queries || 0}</span>
                                </div>
                            </div>
                        </MetricCard>

                        {/* Transactions / Transactional Workload */}
                        <MetricCard
                            title="Transactional Health"
                            icon="⚙️"
                            value={metrics.commits?.toLocaleString() || 'N/A'}
                            description="Successful Commits"
                            status={metrics.conflicts > 0 || metrics.deadlocks > 0 ? 'danger' : 'success'}
                        >
                            <div className="space-y-3 mt-4 text-xs">
                                <div className="flex justify-between bg-white/5 p-2 rounded">
                                    <span className="text-gray-400">Rollbacks</span>
                                    <span className="font-bold text-gray-200">{metrics.rollbacks?.toLocaleString() || 0}</span>
                                </div>
                                <div className="flex justify-between bg-white/5 p-2 rounded">
                                    <span className="text-gray-400">Lock Conflicts</span>
                                    <span className={`font-bold ${metrics.conflicts > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>{metrics.conflicts?.toLocaleString() || 0}</span>
                                </div>
                                <div className="flex justify-between bg-white/5 p-2 rounded">
                                    <span className="text-gray-400">Deadlocks Detected</span>
                                    <span className={`font-bold ${metrics.deadlocks > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>{metrics.deadlocks?.toLocaleString() || 0}</span>
                                </div>
                            </div>
                            {metrics.stat_error && (
                                <div className="text-xs text-rose-500 mt-2">Error: {metrics.stat_error}</div>
                            )}
                        </MetricCard>
                    </>
                )}
            </div>

            <div className="bg-panel border border-border p-4 rounded text-xs text-secondary italic border-l-4 border-l-primary">
                Note: This provides a snapshot analysis based on database engine statistical tables (`pg_stat_database`, `information_schema`).
                Metrics are cumulative since the last server stats reset.
            </div>
        </ScrollArea>
    );
}
