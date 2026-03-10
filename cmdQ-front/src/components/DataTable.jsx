import React from 'react';
import ScrollArea from './ScrollArea';

export default function DataTable({ result }) {
    if (result?.loading) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-primary font-code text-sm animate-pulse p-8">
                <span className="text-3xl mb-4">⚙️</span>
                Executing and fetching results...
            </div>
        );
    }

    if (result?.error) {
        return <div className="p-4 text-red-400 font-code text-sm">{result.error}</div>;
    }

    if (!result) {
        return (
            <div className="h-full flex items-center justify-center text-gray-600 font-code text-sm p-4 text-center">
                No results to display. Run a query or select a table.
            </div>
        );
    }

    return (
        <div className="p-4 flex flex-col gap-4 h-full overflow-hidden">
            {/* AI Text Output */}
            {result.message && (
                <ScrollArea className="max-h-64 overflow-y-auto mb-2 border border-border rounded bg-background">
                    <div className="text-secondary whitespace-pre-wrap font-code text-xs p-3">
                        {result.message}
                    </div>
                </ScrollArea>
            )}
            {/* SQL Executed */}
            {result.extracted_sql && (
                <div>
                    <strong className="text-primary text-xs uppercase">Executed SQL</strong>
                    <div className="text-gray-300 font-code text-xs bg-black/50 p-2 rounded mt-1 border border-border/50">
                        {result.extracted_sql}
                    </div>
                </div>
            )}
            {/* Data Rows */}
            {result.data && result.data.length > 0 && (
                <ScrollArea className="flex-1 border border-border rounded mt-2 bg-background overflow-auto min-h-0 relative">
                    <table className="min-w-max w-full text-left text-xs text-gray-300">
                        <thead className="bg-panel text-gray-400 uppercase sticky top-0 shadow-sm z-10">
                            <tr>
                                {Object.keys(result.data[0]).map(k => (
                                    <th key={k} className="p-2 border-b border-r border-border whitespace-nowrap">{k}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {result.data.map((row, i) => (
                                <tr key={i} className="border-b border-border/50 hover:bg-white/5 transition-colors">
                                    {Object.values(row).map((val, idx) => (
                                        <td key={idx} className="p-2 border-r border-border/50 max-w-sm truncate whitespace-nowrap" title={String(val)}>
                                            {String(val)}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </ScrollArea>
            )}
            {result.data && result.data.length === 0 && (result.extracted_sql || result.message) && (
                <div className="text-gray-500 italic text-xs">Query executed successfully (0 rows returned).</div>
            )}
        </div>
    );
}
