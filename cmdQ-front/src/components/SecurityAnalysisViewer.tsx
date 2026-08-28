import React, { useState } from 'react';
import ScrollArea from './ScrollArea';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import ReactMarkdown from 'react-markdown';
import { PALETTE } from '../theme/palette';
import { CopyIcon } from './icons/CopyIcon';

function SecurityCard({ title, value, icon, description, riskText, riskLevel, children }) {
    const riskColor = riskLevel === 'high' ? 'text-rose-500'
        : riskLevel === 'medium' ? 'text-amber-500'
            : riskLevel === 'low' ? 'text-emerald-500'
                : 'text-gray-400';

    return (
        <div className="bg-background border border-border rounded p-4 flex flex-col gap-2">
            <div className="flex justify-between items-start mb-1">
                <div className="flex items-center gap-2">
                    <span className="text-xl">{icon}</span>
                    <h3 className="font-bold text-textPrimary">{title}</h3>
                </div>
                {riskText && (
                    <span className={`text-xs font-bold uppercase ${riskColor} bg-white/5 px-2 py-0.5 rounded`}>
                        {riskText}
                    </span>
                )}
            </div>
            {value !== undefined && <div className="text-2xl font-black text-primary">{value}</div>}
            {description && <div className="text-xs text-secondary mt-1">{description}</div>}
            {children && <div className="mt-3 pt-3 border-t border-border">{children}</div>}
        </div>
    );
}

function SecurityAnalysisViewer({ result }) {
    const [copied, setCopied] = useState(false);

    if (!result || !result.metrics) {
        return <div className="p-4 text-secondary italic">No security metrics available.</div>;
    }

    const { metrics, ai_summary } = result;
    const isTable = metrics.level === 'table';

    // Chart Data Preparation - Table Level
    const columnsData = [
        { name: 'Sensitive', value: metrics.sensitive_columns?.length || 0 },
        { name: 'Standard', value: Math.max((metrics.total_columns || 0) - (metrics.sensitive_columns?.length || 0), 0) }
    ];
    const columnColors = [PALETTE.chartRose, PALETTE.chartEmerald]; // rose-500, emerald-500

    const permissionsByGrantee = metrics.permissions?.reduce((acc, curr) => {
        acc[curr.grantee] = (acc[curr.grantee] || 0) + 1;
        return acc;
    }, {}) || {};
    const permissionsData = Object.keys(permissionsByGrantee).map(grantee => ({
        name: grantee, Privileges: permissionsByGrantee[grantee]
    }));

    const constraintTypes = metrics.constraints?.reduce((acc, curr) => {
        acc[curr.type] = (acc[curr.type] || 0) + 1;
        return acc;
    }, {}) || {};
    const constraintsData = Object.keys(constraintTypes).map(type => ({
        name: type, value: constraintTypes[type]
    }));
    const constraintColors = [PALETTE.chartBlue, PALETTE.chartViolet, PALETTE.chartPink, PALETTE.chartAmber, PALETTE.chartEmerald];

    // Chart Data Preparation - Database Level
    const adminsCount = metrics.admins?.length || 0;
    const regularUsersCount = Math.max((metrics.total_users || 0) - adminsCount, 0);
    const usersData = [
        { name: 'Admins', value: adminsCount },
        { name: 'Standard Users', value: regularUsersCount }
    ];
    const usersColors = [PALETTE.chartRose, PALETTE.chartEmerald];

    return (
        <ScrollArea className="flex-1 p-6 space-y-6 overflow-y-auto">
            <div className="flex justify-between items-end border-b border-border pb-4">
                <div>
                    <h2 className="text-2xl font-black tracking-tight text-primary flex items-center gap-2">
                        <span>🔒</span> Security Analysis
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
                    style={{ boxShadow: 'inset 0 0 15px var(--color-shadow-inset, rgba(0,0,0,0.1))' }}
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
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {isTable ? (
                    <>
                        <SecurityCard
                            title="Column Sensitivity"
                            icon="🛡️"
                            value={metrics.sensitive_columns?.length || 0}
                            description={`Out of ${metrics.total_columns || 0} total columns`}
                            riskLevel={metrics.sensitive_columns?.length > 0 ? 'high' : 'low'}
                            riskText={metrics.sensitive_columns?.length > 0 ? 'Sensitive Data Detected' : 'Clean'}
                        >
                            <div className="h-40 w-full mb-4">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={columnsData} innerRadius={40} outerRadius={60} paddingAngle={5} dataKey="value" stroke="none">
                                            {columnsData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={columnColors[index % columnColors.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip contentStyle={{ backgroundColor: PALETTE.tooltipBg, borderColor: PALETTE.chartBorder }} itemStyle={{ color: PALETTE.chartTextWhite }} />
                                        <Legend wrapperStyle={{ fontSize: '12px' }} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                            {metrics.sensitive_columns?.length > 0 ? (
                                <ul className="text-xs text-gray-300 space-y-1">
                                    {metrics.sensitive_columns.map((c, i) => (
                                        <li key={i} className="flex justify-between border-b border-border/50 pb-1 last:border-0">
                                            <span className="text-primary">{c.column}</span>
                                            <span className="text-secondary">{c.type}</span>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <div className="text-xs text-emerald-500">No passwords or tokens matched by name.</div>
                            )}
                        </SecurityCard>

                        <SecurityCard
                            title="Privilege Distribution"
                            icon="🔑"
                            value={metrics.permissions?.length || 0}
                            description="Total explicit grants on this table"
                            riskLevel={metrics.permissions?.length > 5 ? 'medium' : 'low'}
                            riskText={metrics.permissions?.length > 0 ? 'Exposed' : 'Private'}
                        >
                            {permissionsData.length > 0 && (
                                <div className="h-40 w-full mb-4">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={permissionsData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.chartBorder} vertical={false} />
                                            <XAxis dataKey="name" stroke={PALETTE.chartTextMuted} fontSize={10} tickLine={false} axisLine={false} />
                                            <YAxis stroke={PALETTE.chartTextMuted} fontSize={10} allowDecimals={false} tickLine={false} axisLine={false} />
                                            <Tooltip contentStyle={{ backgroundColor: PALETTE.tooltipBg, borderColor: PALETTE.chartBorder, borderRadius: '4px' }} cursor={{ fill: PALETTE.chartCursorFill }} />
                                            <Bar dataKey="Privileges" fill={PALETTE.chartIndigo} radius={[4, 4, 0, 0]} maxBarSize={40} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                            {metrics.permissions?.length > 0 ? (
                                <div className="max-h-24 overflow-y-auto pr-1 custom-scrollbar">
                                    <ul className="text-xs text-gray-300 space-y-1">
                                        {metrics.permissions.map((p, i) => (
                                            <li key={i} className="flex flex-wrap justify-between gap-1 items-center border-b border-border/50 pb-1 last:border-0">
                                                <span className="font-bold truncate max-w-[120px]" title={p.grantee}>{p.grantee}</span>
                                                <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded uppercase tracking-wider">{p.privilege}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ) : (
                                <div className="text-xs text-emerald-500">No explicit grants found. Check default schema permissions.</div>
                            )}
                        </SecurityCard>

                        <SecurityCard
                            title="Data Integrity Types"
                            icon="🔗"
                            value={metrics.constraints?.length || 0}
                            description="Constraints preventing invalid data"
                            riskLevel={metrics.constraints?.length === 0 ? 'high' : 'low'}
                            riskText={metrics.constraints?.length === 0 ? 'No Constraints' : 'Secured'}
                        >
                            {constraintsData.length > 0 && (
                                <div className="h-40 w-full mb-4">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie data={constraintsData} innerRadius={20} outerRadius={60} dataKey="value" stroke="none" labelLine={false} label={({ name, percent }) => percent > 0.1 ? `${name.substring(0, 3)}` : ''}>
                                                {constraintsData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={constraintColors[index % constraintColors.length]} />
                                                ))}
                                            </Pie>
                                            <Tooltip contentStyle={{ backgroundColor: PALETTE.tooltipBg, borderColor: PALETTE.chartBorder }} itemStyle={{ color: PALETTE.chartTextWhite }} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                            {metrics.constraints?.length > 0 ? (
                                <div className="max-h-32 overflow-y-auto pr-1 custom-scrollbar">
                                    <ul className="text-xs text-gray-300 space-y-1">
                                        {metrics.constraints.map((c, i) => (
                                            <li key={i} className="flex justify-between flex-wrap gap-1 border-b border-border/50 pb-1 last:border-0">
                                                <span className="truncate max-w-[120px] font-medium" title={c.name}>{c.name}</span>
                                                <span className="text-secondary text-[10px] bg-white/5 border border-white/10 px-1 rounded uppercase">{c.type}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ) : (
                                <div className="text-xs text-rose-400">Missing Primary Key or triggers. Weak data integrity.</div>
                            )}
                        </SecurityCard>
                    </>
                ) : (
                    <>
                        <SecurityCard
                            title="Role Distribution"
                            icon="�"
                            value={`${adminsCount} Admins`}
                            description={`Out of ${metrics.total_users || 0} total roles`}
                            riskLevel={adminsCount > 3 ? 'high' : adminsCount > 0 ? 'medium' : 'low'}
                            riskText={adminsCount > 3 ? 'Too Many Admins' : 'Controlled'}
                        >
                            <div className="h-40 w-full mb-4 mt-2">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={usersData} innerRadius={45} outerRadius={65} paddingAngle={5} dataKey="value" stroke="none">
                                            {usersData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={usersColors[index % usersColors.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip contentStyle={{ backgroundColor: PALETTE.tooltipBg, borderColor: PALETTE.chartBorder }} itemStyle={{ color: PALETTE.chartTextWhite }} />
                                        <Legend wrapperStyle={{ fontSize: '12px' }} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </SecurityCard>

                        <SecurityCard
                            title="Admin Privileges"
                            icon="👑"
                            value={adminsCount}
                            description={`Highly Privileged Superusers`}
                        >
                            {metrics.admins?.length > 0 ? (
                                <div className="max-h-56 overflow-y-auto pr-1 custom-scrollbar mt-2">
                                    <ul className="text-xs text-gray-300 space-y-2">
                                        {metrics.admins.map((a, i) => (
                                            <li key={i} className="flex justify-between border-b border-border/50 pb-2 last:border-0 items-center">
                                                <span className="text-rose-400 font-bold">{a}</span>
                                                <span className="text-[10px] bg-rose-500/20 text-rose-300 px-2 py-0.5 rounded uppercase font-bold tracking-wider">Admin</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ) : (
                                <div className="text-xs text-emerald-500 mt-2">Excellent. No explicit admin roles detected.</div>
                            )}
                            {metrics.permissions_error && (
                                <div className="text-xs text-rose-500 mt-2">Error reading roles: {metrics.permissions_error}</div>
                            )}
                        </SecurityCard>

                        <SecurityCard
                            title="Encryption & Auditing"
                            icon="🔐"
                            value="Check Config"
                            riskLevel="medium"
                            riskText="Manual Action Needed"
                            description="Automated config scanning limited by permissions."
                        >
                            <div className="text-xs text-secondary mt-2 p-3 bg-white/5 border border-white/10 rounded">
                                Verification Required:
                                <ul className="list-disc ml-4 mt-2 space-y-1 text-gray-300">
                                    <li>TLS/SSL connections are enforced</li>
                                    <li>Network boundaries are secured</li>
                                    <li>Audit logging is enabled at the server level</li>
                                    <li>Regular backups are actively encrypted</li>
                                </ul>
                            </div>
                        </SecurityCard>
                    </>
                )}
            </div>

            <div className="bg-panel border border-border p-4 rounded text-xs text-secondary italic border-l-4 border-l-primary">
                Note: This provides a snapshot analysis based on standard object schemas ({isTable ? 'information_schema.columns, table_constraints, etc.' : 'pg_roles/mysql.user'}).
                Verify deeper application-level security mechanisms independently.
            </div>
        </ScrollArea>
    );
}

export default SecurityAnalysisViewer;
