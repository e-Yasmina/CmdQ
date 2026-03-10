import { useState } from 'react';

export default function QueryEditor({ onExecuteQuery, isLoading }) {
    const [query, setQuery] = useState("");

    return (
        <div className="flex flex-col h-full bg-panel p-4">
            <div className="flex justify-between items-center mb-2">
                <h2 className="text-xs uppercase text-gray-500 font-bold tracking-wider">SQL Editor</h2>
                <button
                    onClick={() => onExecuteQuery(query)}
                    disabled={isLoading || !query.trim()}
                    className="bg-primary hover:brightness-110 disabled:opacity-50 text-background flex items-center justify-center p-1 px-3 rounded text-xs font-bold transition-all cursor-pointer"
                >
                    {isLoading ? "Running..." : "Run Query"}
                </button>
            </div>
            <textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                        onExecuteQuery(query);
                    }
                    if (e.key === 'F5') {
                        e.preventDefault();
                        onExecuteQuery(query);
                    }
                }}
                placeholder="Write your SQL here (e.g. SELECT * FROM public.users LIMIT 10)..."
                className="flex-1 bg-background border border-border rounded p-2 text-sm text-textPrimary focus:outline-none focus:border-primary font-code resize-none"
            />
            <div className="text-xs text-gray-500 mt-2 text-right">
                Press Ctrl+Enter or F5 to execute
            </div>
        </div>
    );
}
