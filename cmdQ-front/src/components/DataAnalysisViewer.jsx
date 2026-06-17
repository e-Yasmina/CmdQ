import React from 'react';
import ScrollArea from './ScrollArea';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import ReactMarkdown from 'react-markdown';
import { PALETTE } from '../theme/palette';

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

export default function DataAnalysisViewer({ result }) {
    if (!result || !result.metrics) {
        return <div className="p-4 text-secondary italic">No data metrics available.</div>;
    }

    const { metrics, ai_summary } = result;
    const isTable = metrics.level === 'table';

    // -- DB Data --
    const largestTables = metrics.largest_tables || [];
    const dbRowsChartData = largestTables.map(t => ({
        name: t.name,
        rows: t.rows
    }));

    // -- Table Data --
    const columnStats = metrics.column_stats || {};
    const colChartData = Object.keys(columnStats).map(col => ({
        name: col,
        FillRate: Math.round(columnStats[col].fill_rate * 100),
        UniqueRatio: Math.round(columnStats[col].unique_ratio * 100)
    }));

    return (
        <ScrollArea className="flex-1 p-6 space-y-6 overflow-y-auto">
            <div className="flex justify-between items-end border-b border-border pb-4">
                <div>
                    <h2 className="text-2xl font-black tracking-tight text-primary flex items-center gap-2">
                        <span>📊</span> Analysis
                    </h2>
                    <p className="text-secondary text-sm mt-1">
                        Analyzing {isTable ? 'Table' : 'Database'}: <span className="text-textPrimary font-bold">{metrics.target}</span>
                    </p>
                </div>
            </div>

            {ai_summary && (
                <div className="bg-primary/5 border border-primary/20 rounded p-4 text-sm font-ui text-textPrimary" style={{ boxShadow: `inset 0 0 15px ${PALETTE.shadowInset}` }}>
                    <div className="flex items-center gap-2 mb-2">
                        <span className="text-primary font-bold">✨ AI Insights:</span>
                    </div>
                    <div className="text-gray-300 leading-relaxed overflow-x-auto">
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
                        {/* Table Capacity / Total Rows */}
                        <MetricCard
                            title="Total Volume"
                            icon="📂"
                            value={metrics.total_rows?.toLocaleString() || 0}
                            description="Estimated Record Count"
                            status="success"
                        />
                        <MetricCard
                            title="Schema Breadth"
                            icon="📏"
                            value={metrics.total_columns || 0}
                            description="Total Columns in Table"
                            status="success"
                        />

                        {/* Column Quality Profiling */}
                        <MetricCard
                            title="Data Quality Sampling"
                            icon="✨"
                            description="(First 10 Columns: Fill Rate vs Uniqueness)"
                            status={colChartData.some(c => c.FillRate < 50) ? 'warning' : 'success'}
                        >
                            <div className="h-48 w-full mt-4">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={colChartData} margin={{ left: -15, right: 15, top: 0, bottom: 0 }}>
                                        <XAxis dataKey="name" stroke={PALETTE.chartTextMuted} fontSize={9} tick={{ fill: PALETTE.chartTextMuted }} angle={-25} textAnchor="end" height={40} />
                                        <YAxis stroke={PALETTE.chartTextMuted} fontSize={11} axisLine={false} tickLine={false} />
                                        <Tooltip contentStyle={{ backgroundColor: PALETTE.tooltipBg, borderColor: PALETTE.chartBorder }} cursor={{ fill: PALETTE.chartCursorFill }} />
                                        <Legend wrapperStyle={{ fontSize: '10px' }} />
                                        <Bar dataKey="FillRate" fill={PALETTE.chartEmerald} radius={[2, 2, 0, 0]} name="Fill Rate %" maxBarSize={30} />
                                        <Bar dataKey="UniqueRatio" fill={PALETTE.chartIndigo} radius={[2, 2, 0, 0]} name="Unique Ratio %" maxBarSize={30} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </MetricCard>
                    </>
                ) : (
                    <>
                        {/* Database High Level */}
                        <MetricCard
                            title="Global Data Volume"
                            icon="🌐"
                            value={metrics.total_db_rows?.toLocaleString() || 0}
                            description="Estimated Total Rows in Database"
                            status="success"
                        />
                        <MetricCard
                            title="Global Architecture"
                            icon="🏢"
                            value={metrics.total_tables?.toLocaleString() || 0}
                            description="Total Tables Detected"
                            status="success"
                        />

                        {/* Largest Tables Distributions */}
                        <MetricCard
                            title="Largest Data Hotspots"
                            icon="🔥"
                            description="Top Tables by Row Volume"
                        >
                            <div className="h-48 w-full mt-4">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={dbRowsChartData} layout="vertical" margin={{ left: 10, right: 15, top: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={PALETTE.chartBorder} />
                                        <XAxis type="number" stroke={PALETTE.chartTextMuted} fontSize={10} />
                                        <YAxis dataKey="name" type="category" stroke={PALETTE.chartTextMuted} fontSize={11} axisLine={false} tickLine={false} width={80} />
                                        <Tooltip contentStyle={{ backgroundColor: PALETTE.tooltipBg, borderColor: PALETTE.chartBorder, fontSize: '12px' }} cursor={{ fill: PALETTE.chartCursorFill }} formatter={(val) => val.toLocaleString()} />
                                        <Bar dataKey="rows" fill={PALETTE.chartAmber} radius={[0, 4, 4, 0]} maxBarSize={20} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </MetricCard>
                    </>
                )}
            </div>

            <div className="bg-panel border border-border p-4 rounded text-xs text-secondary italic border-l-4 border-l-primary">
                Note: Statistical estimates sourced from DB stats and Information Schema. Fill Rate / Unique Ratio requires active row inspection and is bounded.
            </div>
        </ScrollArea>
    );
}
