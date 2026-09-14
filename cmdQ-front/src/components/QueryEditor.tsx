import { useState, useCallback } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { sql } from '@codemirror/lang-sql';
import { vscodeDark, vscodeLight } from '@uiw/codemirror-theme-vscode';
import SaveQueryModal from './SaveQueryModal';

export default function QueryEditor({ value, onChange, onExecuteQuery, onSaveQuery, isLoading, theme = 'dark' }) {

    const [showSaveModal, setShowSaveModal] = useState(false);

    const handleKeyDown = (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            onExecuteQuery(value);
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
            e.preventDefault();
            if (value.trim()) {
                setShowSaveModal(true);
            }
        }
        if (e.key === 'F5') {
            e.preventDefault();
            onExecuteQuery(value);
        }
    };

    return (
        <div className="flex flex-col h-full bg-panel p-4">
            <div className="flex justify-between items-center mb-2">
                <h2 className="text-xs uppercase text-textSecondary font-bold tracking-wider">SQL Editor</h2>
                <div className="flex gap-2">
                    <button
                        onClick={() => setShowSaveModal(true)}
                        disabled={isLoading || !value.trim()}
                        className="bg-panel border border-border hover:bg-black/5 dark:hover:bg-white/5 text-textPrimary px-3 py-1 rounded text-xs font-bold transition-all cursor-pointer"
                    >
                        💾 Save Query
                    </button>
                    <button
                        onClick={() => {
                            if (value.trim()) {
                                onExecuteQuery(value);
                            }
                        }}
                        disabled={isLoading || !value.trim()}
                        className="bg-primary hover:brightness-110 disabled:opacity-50 text-background flex items-center justify-center p-1 px-3 rounded text-xs font-bold transition-all cursor-pointer"
                    >
                        {isLoading ? "Running..." : "Run Query"}
                    </button>
                </div>
            </div>
            <div
                className="flex-1 border border-border rounded overflow-x-hidden overflow-y-auto scrollbar-hidden flex flex-col focus-within:border-primary transition-colors bg-background"
                onKeyDown={handleKeyDown}
            >
                <CodeMirror
                    value={value}
                    placeholder="Write your SQL here (e.g. SELECT * FROM public.users LIMIT 10)..."
                    theme={theme === 'light' ? vscodeLight : vscodeDark}
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

            <SaveQueryModal
                isOpen={showSaveModal}
                onClose={() => setShowSaveModal(false)}
                onSave={(name) => onSaveQuery(value, name)}
            />
        </div>
    );
}
