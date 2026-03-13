import { useState, useCallback } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { sql } from '@codemirror/lang-sql';
import { vscodeDark } from '@uiw/codemirror-theme-vscode';

export default function QueryEditor({ onExecuteQuery, isLoading }) {
    const [query, setQuery] = useState("");

    const onChange = useCallback((val) => {
        setQuery(val);
    }, []);

    const handleKeyDown = (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            onExecuteQuery(query);
        }
        if (e.key === 'F5') {
            e.preventDefault();
            onExecuteQuery(query);
        }
    };

    return (
        <div className="flex flex-col h-full bg-panel p-4">
            <div className="flex justify-between items-center mb-2">
                <h2 className="text-xs uppercase text-gray-500 font-bold tracking-wider">SQL Editor</h2>
                <button
                    onClick={() => {
                        if (query.trim()) {
                            onExecuteQuery(query);
                        }
                    }}
                    disabled={isLoading || !query.trim()}
                    className="bg-primary hover:brightness-110 disabled:opacity-50 text-background flex items-center justify-center p-1 px-3 rounded text-xs font-bold transition-all cursor-pointer"
                >
                    {isLoading ? "Running..." : "Run Query"}
                </button>
            </div>
            <div
                className="flex-1 border border-border rounded overflow-hidden flex flex-col focus-within:border-primary transition-colors bg-background"
                onKeyDown={handleKeyDown}
            >
                <CodeMirror
                    value={query}
                    placeholder="Write your SQL here (e.g. SELECT * FROM public.users LIMIT 10)..."
                    theme={vscodeDark}
                    extensions={[sql()]}
                    onChange={onChange}
                    style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
                    height="100%"
                    className="flex-1 text-sm font-code custom-cm"
                    basicSetup={{
                        lineNumbers: true,
                        highlightActiveLineGutter: true,
                        highlightSpecialChars: true,
                        history: true,
                        foldGutter: true,
                        drawSelection: true,
                        dropCursor: true,
                        allowMultipleSelections: true,
                        indentOnInput: true,
                        syntaxHighlighting: true,
                        bracketMatching: true,
                        closeBrackets: true,
                        autocompletion: true,
                        rectangularSelection: true,
                        crosshairCursor: true,
                        highlightActiveLine: true,
                        highlightSelectionMatches: true,
                        closeBracketsKeymap: true,
                        defaultKeymap: true,
                        searchKeymap: true,
                        historyKeymap: true,
                        foldKeymap: true,
                        completionKeymap: true,
                        lintKeymap: true,
                    }}
                />
            </div>
            <div className="text-xs text-gray-500 mt-2 text-right">
                Press Ctrl+Enter or F5 to execute
            </div>
        </div>
    );
}
