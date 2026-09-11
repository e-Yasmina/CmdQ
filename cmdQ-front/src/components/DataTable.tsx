import React, { useState, useEffect, useMemo, useCallback } from 'react';
import ScrollArea from './ScrollArea';
import { apiService } from '../services/apiService';
import ExportForm from './forms/ExportForm';
import ImportForm from './forms/ImportForm';
import SaveFileDialog from './SaveFileDialog';
import { CopyIcon } from './icons/CopyIcon';
import AiMessageRenderer from './AiMessageRenderer';

const IDENTIFIER_RE = /^[a-zA-Z_][a-zA-Z0-9_$]{0,127}$/;

function checkIdentifier(name, label) {
    if (!name || typeof name !== 'string') {
        throw new Error(`Invalid ${label}: must be a non-empty string`);
    }
    if (!IDENTIFIER_RE.test(name)) {
        throw new Error(`Invalid ${label} '${name}': contains unsafe characters`);
    }
    return name;
}

const PAGE_SIZES = [25, 50, 100, 250, 500];

function compareValues(a, b) {
    if (a === null || a === undefined) return 1;
    if (b === null || b === undefined) return -1;
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    const sa = String(a);
    const sb = String(b);
    return sa.localeCompare(sb, undefined, { numeric: true, sensitivity: 'base' });
}

export default function DataTable({ result, activeConfig, activeSchemaName, activeTableName, onRefresh, onLocalMutation, onDiagnose }) {
    const [editingCell, setEditingCell] = useState(null);
    const [addingRow, setAddingRow] = useState(null);
    const [isMutating, setIsMutating] = useState(false);
    const [mutationError, setMutationError] = useState("");
    const [showExportModal, setShowExportModal] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false);
    const [showDbImportModal, setShowDbImportModal] = useState(false);
    const [saveDialog, setSaveDialog] = useState(null);
    const [isFullScreen, setIsFullScreen] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(100);
    const [sortConfig, setSortConfig] = useState(null); // { key, direction: 'asc' | 'desc' }
    const [messageCopied, setMessageCopied] = useState(false);
    const [sqlCopied, setSqlCopied] = useState(false);

    useEffect(() => {
        setMutationError("");
        setEditingCell(null);
        setAddingRow(null);
        setCurrentPage(1);
        setSortConfig(null);
    }, [result]);

    useEffect(() => {
        setCurrentPage(1);
    }, [pageSize]);

    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape' && isFullScreen) setIsFullScreen(false);
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [isFullScreen]);

    const effectiveSchema = result?.targetSchema || activeSchemaName;
    const effectiveTable = result?.targetTable || activeTableName;
    const canMutate = Boolean(activeConfig && effectiveSchema && effectiveTable && onRefresh);
    const refSchema = effectiveSchema;
    const refTable = effectiveTable;

    const hasData = result?.data && result.data.length > 0;
    const rawColumns = hasData ? Object.keys(result.data[0]) : (result?.columns || []);
    const columns = rawColumns.map(c => typeof c === 'object' && c !== null ? (c.name || c.column_name || JSON.stringify(c)) : String(c));

    const sortedData = useMemo(() => {
        if (!hasData || !sortConfig) return result?.data || [];
        const sorted = [...result.data];
        sorted.sort((a, b) => {
            const cmp = compareValues(a[sortConfig.key], b[sortConfig.key]);
            return sortConfig.direction === 'desc' ? -cmp : cmp;
        });
        return sorted;
    }, [hasData, result?.data, sortConfig]);

    const totalPages = hasData ? Math.max(1, Math.ceil(sortedData.length / pageSize)) : 1;
    const safeCurrentPage = Math.min(currentPage, totalPages);
    const paginatedData = useMemo(() => {
        if (!hasData) return [];
        const start = (safeCurrentPage - 1) * pageSize;
        return sortedData.slice(start, start + pageSize);
    }, [hasData, sortedData, safeCurrentPage, pageSize]);

    const handleSort = useCallback((key) => {
        setSortConfig(prev => {
            if (prev?.key === key) {
                if (prev.direction === 'asc') return { key, direction: 'desc' };
                return null;
            }
            return { key, direction: 'asc' };
        });
    }, []);

    if (result?.loading) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-primary font-code text-sm animate-pulse p-8 text-center max-w-lg mx-auto">
                <span className="text-3xl mb-4">⚙️</span>
                {result.message || "Executing and fetching results..."}
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

    const formatSqlValue = (val) => {
        if (val === null || val === undefined) return 'NULL';
        if (val === "") return "''";
        if (typeof val === 'number') return val;
        if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
        return `'${String(val).replace(/'/g, "''")}'`;
    };

    const handleUpdate = async (rowIndex, rowSelected, updateKey, updateValue, originalValue) => {
        const origStr = originalValue === null ? "" : String(originalValue);
        if (origStr === updateValue) {
            setEditingCell(null);
            return;
        }

        try {
            setIsMutating(true);
            setMutationError("");

            const safeSchema = checkIdentifier(refSchema, "schema name");
            const safeTable = checkIdentifier(refTable, "table name");

            const origRow = result.original_data ? result.original_data[rowIndex] : rowSelected;
            
            let realUpdateKey = updateKey;
            if (result.original_data) {
                const translatedKeys = Object.keys(rowSelected);
                const originalKeys = Object.keys(origRow);
                const keyIdx = translatedKeys.indexOf(updateKey);
                if (keyIdx !== -1 && originalKeys[keyIdx]) {
                    realUpdateKey = originalKeys[keyIdx];
                }
            }

            const safeUpdateKey = checkIdentifier(realUpdateKey, "column name");

            const whereClause = Object.entries(origRow)
                .map(([k, v]) => v === null ? `"${k}" IS NULL` : `"${k}" = ${formatSqlValue(v)}`)
                .join(' AND ');

            const query = `UPDATE "${safeSchema}"."${safeTable}" SET "${safeUpdateKey}" = ${formatSqlValue(updateValue)} WHERE ${whereClause}`;

            const response = await apiService.executeQuery({
                query,
                db_config: activeConfig
            });

            if (response.rows_affected === 0) {
                throw new Error("Update affected 0 rows. The row data may have changed since it was fetched, or the WHERE clause did not match any rows. Try re-running the query and editing again.");
            }

            if (onLocalMutation) {
                onLocalMutation('update', { rowIndex, updateKey, updateValue });
            } else if (onRefresh) {
                onRefresh();
            }
            setEditingCell(null);
        } catch (err) {
            setMutationError(err.message || "Failed to update row");
            setEditingCell(null);
        } finally {
            setIsMutating(false);
        }
    };

    const handleDelete = async (row, rowIndex) => {
        if (!window.confirm("Are you sure you want to delete this row?")) return;
        try {
            setIsMutating(true);
            setMutationError("");

            const safeSchema = checkIdentifier(refSchema, "schema name");
            const safeTable = checkIdentifier(refTable, "table name");

            const origRow = result.original_data && typeof rowIndex === 'number' ? result.original_data[rowIndex] : row;
            
            const whereClause = Object.entries(origRow)
                .map(([k, v]) => v === null ? `"${k}" IS NULL` : `"${k}" = ${formatSqlValue(v)}`)
                .join(' AND ');

            const query = `DELETE FROM "${safeSchema}"."${safeTable}" WHERE ${whereClause}`;

            const response = await apiService.executeQuery({
                query,
                db_config: activeConfig
            });

            if (response.rows_affected === 0) {
                throw new Error("Delete affected 0 rows. The row data may have changed since it was fetched, or the WHERE clause did not match any rows. Try re-running the query and editing again.");
            }

            if (onLocalMutation) {
                onLocalMutation('delete', { row });
            } else if (onRefresh) {
                onRefresh();
            }
        } catch (err) {
            setMutationError(err.message || "Failed to delete row");
        } finally {
            setIsMutating(false);
        }
    };

    const handleInsert = async () => {
        try {
            setIsMutating(true);
            setMutationError("");

            const safeSchema = checkIdentifier(refSchema, "schema name");
            const safeTable = checkIdentifier(refTable, "table name");

            const origCols = result.original_data && result.original_data.length > 0 
                ? Object.keys(result.original_data[0]) 
                : null;
                
            let validColNamesList = [];
            let validValuesList = [];
            
            const rowKeys = Object.keys(addingRow);
            for (let i = 0; i < rowKeys.length; i++) {
                const k = rowKeys[i];
                if (addingRow[k] !== "") {
                    const realKey = origCols && origCols[i] ? origCols[i] : k;
                    checkIdentifier(realKey, "column name");
                    validColNamesList.push(`"${realKey}"`);
                    validValuesList.push(formatSqlValue(addingRow[k]));
                }
            }

            if (validColNamesList.length === 0) {
                setMutationError("Cannot insert completely empty row");
                setIsMutating(false);
                return;
            }

            const validColNames = validColNamesList.join(', ');
            const validValues = validValuesList.join(', ');

            const query = `INSERT INTO "${safeSchema}"."${safeTable}" (${validColNames}) VALUES (${validValues})`;

            await apiService.executeQuery({
                query,
                db_config: activeConfig
            });

            if (onLocalMutation) {
                onLocalMutation('insert', { row: addingRow });
            } else if (onRefresh) {
                onRefresh();
            }
            setAddingRow(null);
        } catch (err) {
            setMutationError(err.message || "Failed to insert row");
        } finally {
            setIsMutating(false);
        }
    };

    const handleAddRowInit = () => {
        if (columns.length === 0) return;
        const newRow = {};
        columns.forEach(c => newRow[c] = "");
        setAddingRow(newRow);
    };

    const isColorString = (val) => {
        if (typeof val !== 'string') return false;
        const str = val.trim().toLowerCase();
        const hexRegex = /^#([a-f0-9]{3}|[a-f0-9]{4}|[a-f0-9]{6}|[a-f0-9]{8})$/;
        const rgbRegex = /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*[\d.]+)?\s*\)$/;
        const hslRegex = /^hsla?\(\s*\d{1,3}\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?(?:\s*,\s*[\d.]+)?\s*\)$/;
        return hexRegex.test(str) || rgbRegex.test(str) || hslRegex.test(str);
    };

    const renderCell = (row, i, k, val) => {
        const isEditing = editingCell?.rowIndex === i && editingCell?.key === k;
        if (isEditing) {
            return (
                <input
                    autoFocus
                    type="text"
                    className="bg-background text-textPrimary p-1 border border-primary text-xs w-full min-w-[100px] outline-none rounded"
                    value={editingCell.value === null ? "" : editingCell.value}
                    onChange={e => setEditingCell({ ...editingCell, value: e.target.value })}
                    onKeyDown={e => {
                        if (e.key === 'Enter') e.currentTarget.blur();
                        if (e.key === 'Escape') {
                            setEditingCell({ ...editingCell, value: val === null ? "" : String(val) });
                            setTimeout(() => e.target.blur(), 0);
                        }
                    }}
                    onBlur={() => handleUpdate(i, row, k, editingCell.value, val)}
                    disabled={isMutating}
                />
            );
        }

        let content;
        if (val === null) {
            content = <span className="opacity-50 italic">NULL</span>;
        } else if (isColorString(val)) {
            content = (
                <div className="flex items-center gap-2">
                    <div 
                        className="w-3.5 h-3.5 rounded-sm shadow-sm ring-1 ring-white/20 shrink-0" 
                        style={{ backgroundColor: val }}
                    />
                    <span className="truncate">{String(val)}</span>
                </div>
            );
        } else {
            content = String(val);
        }

        return (
            <div
                className={`truncate w-full h-full p-1 ${canMutate ? 'cursor-pointer hover:bg-white/10' : ''} rounded`}
                onDoubleClick={() => canMutate && setEditingCell({ rowIndex: i, key: k, value: val })}
                title={val === null ? "NULL" : String(val)}
            >
                {content}
            </div>
        );
    };

    const parseMutationError = (raw, targetTable) => {
        if (!raw) return '';
        let msg = raw;
        msg = msg.replace(/^Query Failed:\s*/i, '');
        msg = msg.replace(/^\([\w.]+\)\s*/, '');
        const updateMatch = msg.match(/UPDATE\s+"?(\w+)"?\s*\.\s*"?(\w+)"?/i);
        msg = msg.replace(/\s+LINE \d+:.*/s, '');
        msg = msg.replace(/\s*\[SQL:.*/s, '');
        msg = msg.replace(/\s*\(Background on this error.*$/s, '');
        msg = msg.trim();
        const tableName = updateMatch ? `${updateMatch[1]}.${updateMatch[2]}` : targetTable;
        if (/pg_constraint|pg_catalog|information_schema/i.test(msg)) {
            msg += '\n\nSystem catalogs cannot be updated directly. Use ALTER TABLE to modify constraints.';
        } else if (tableName) {
            msg += `\n\nTried to UPDATE "${tableName}" but it failed. Click the exact table in the schema explorer on the left to set the right target, then edit its data directly.`;
        } else if (/does not exist/i.test(msg)) {
            msg += '\n\nThe result may reference tables from a different schema or system views. Try selecting a table from the schema explorer before editing.';
        }
        return msg;
    };

    const containerClass = isFullScreen
        ? "fixed inset-0 z-50 bg-background p-4 flex flex-col h-screen w-screen"
        : "p-4 flex flex-col gap-4 h-full relative";

    return (
        <ScrollArea className={containerClass}>
            {isMutating && (
                <div className="absolute inset-0 bg-background/50 z-50 flex items-center justify-center">
                    <div className="bg-panel border border-border p-4 rounded shadow-lg text-primary font-bold animate-pulse">
                        Applying changes...
                    </div>
                </div>
            )}

            {mutationError && (
                <div className="bg-red-500/20 border-2 border-red-500/70 text-red-300 p-3 rounded-lg text-xs shrink-0 shadow-lg flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                        <div className="font-bold text-red-200 uppercase tracking-wide text-[11px] mb-1">
                            ✕ Update Failed
                        </div>
                        <div className="font-code leading-relaxed break-words">
                            {parseMutationError(mutationError, `${refSchema}.${refTable}`)}
                        </div>
                    </div>
                    <button
                        className="text-red-400 hover:text-white font-bold text-sm leading-none shrink-0 mt-0.5"
                        onClick={() => setMutationError("")}
                    >
                        ✕
                    </button>
                </div>
            )}

            {(hasData || columns.length > 0) && (
                <div className="flex flex-col flex-1 min-h-[200px]">
                    {/* Toolbar row: row count + fullscreen + pagination */}
                    <div className="flex items-center justify-between mb-1.5 shrink-0 flex-wrap gap-2">
                        <div className="flex items-center gap-3">
                            <span className="text-[11px] text-gray-500 font-bold">
                                {sortedData.length} row{sortedData.length !== 1 ? 's' : ''}
                                {sortConfig && ` · sorted by ${sortConfig.key} ${sortConfig.direction === 'asc' ? '↑' : '↓'}`}
                            </span>
                            {hasData && sortedData.length > pageSize && (
                                <div className="flex items-center gap-1">
                                    {PAGE_SIZES.map(sz => (
                                        <button
                                            key={sz}
                                            onClick={() => setPageSize(sz)}
                                            className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${pageSize === sz ? 'bg-primary/20 text-primary font-bold' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}
                                        >
                                            {sz}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            {hasData && totalPages > 1 && (
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => setCurrentPage(1)}
                                        disabled={safeCurrentPage <= 1}
                                        className="text-gray-500 hover:text-white disabled:opacity-30 disabled:cursor-default px-1 text-xs"
                                        title="First page"
                                    >«</button>
                                    <button
                                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                        disabled={safeCurrentPage <= 1}
                                        className="text-gray-500 hover:text-white disabled:opacity-30 disabled:cursor-default px-1 text-xs"
                                        title="Previous page"
                                    >‹</button>
                                    <span className="text-[11px] text-gray-400 font-code min-w-[80px] text-center">
                                        {safeCurrentPage} / {totalPages}
                                    </span>
                                    <button
                                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                        disabled={safeCurrentPage >= totalPages}
                                        className="text-gray-500 hover:text-white disabled:opacity-30 disabled:cursor-default px-1 text-xs"
                                        title="Next page"
                                    >›</button>
                                    <button
                                        onClick={() => setCurrentPage(totalPages)}
                                        disabled={safeCurrentPage >= totalPages}
                                        className="text-gray-500 hover:text-white disabled:opacity-30 disabled:cursor-default px-1 text-xs"
                                        title="Last page"
                                    >»</button>
                                </div>
                            )}
                            <button
                                onClick={() => setIsFullScreen(!isFullScreen)}
                                className="text-gray-500 hover:text-primary px-1.5 py-0.5 rounded text-xs transition-colors border border-transparent hover:border-border"
                                title={isFullScreen ? 'Exit full view (Esc)' : 'Full view'}
                            >
                                {isFullScreen ? '⊡' : '⛶'}
                            </button>
                        </div>
                    </div>

                    <ScrollArea className="flex-1 border border-border rounded bg-background overflow-auto min-h-0 relative">
                        <table className="min-w-max w-full text-left text-xs text-textPrimary">
                            <thead className="bg-panel text-textSecondary uppercase sticky top-0 shadow-sm z-10">
                                <tr>
                                    {canMutate && <th className="p-2 border-b border-r border-border w-16 text-center">Act</th>}
                                    {columns.map(k => {
                                        const isSorted = sortConfig?.key === k;
                                        const arrow = isSorted ? (sortConfig.direction === 'asc' ? ' ▲' : ' ▼') : '';
                                        return (
                                            <th
                                                key={k}
                                                className="p-2 border-b border-r border-border whitespace-nowrap cursor-pointer hover:text-primary transition-colors select-none"
                                                onClick={() => handleSort(k)}
                                                title={`Click to sort by ${k}`}
                                            >
                                                {k}{arrow}
                                            </th>
                                        );
                                    })}
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedData.map((row, i) => {
                                    const realIndex = (safeCurrentPage - 1) * pageSize + i;
                                    return (
                                        <tr key={realIndex} className="border-b border-border/50 hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                                            {canMutate && (
                                                <td className="p-2 border-r border-border/50 text-center select-none">
                                                    <button
                                                        onClick={() => handleDelete(row, realIndex)}
                                                        className="text-red-400 hover:text-red-300 transition-colors p-1"
                                                        title="Delete Row"
                                                        disabled={isMutating}
                                                    >
                                                        🗑️
                                                    </button>
                                                </td>
                                            )}
                                            {columns.map((k, idx) => (
                                                <td key={idx} className="p-1 border-r border-border/50 max-w-sm whitespace-nowrap">
                                                    {renderCell(row, realIndex, k, row[k])}
                                                </td>
                                            ))}
                                        </tr>
                                    );
                                })}
                                {paginatedData.length === 0 && !addingRow && (
                                    <tr>
                                        <td
                                            colSpan={columns.length + (canMutate ? 1 : 0)}
                                            className="p-8 text-center text-gray-500 italic text-xs border-b border-border/50 select-none"
                                        >
                                            No rows returned (empty table)
                                        </td>
                                    </tr>
                                )}
                                {addingRow && (
                                    <tr className="bg-primary/10 border-b border-primary/30">
                                        <td className="p-2 border-r border-border/50 text-center whitespace-nowrap">
                                            <button
                                                onClick={handleInsert}
                                                className="text-green-400 hover:text-green-300 mr-3 px-1"
                                                title="Save Row"
                                            >
                                                💾
                                            </button>
                                            <button
                                                onClick={() => setAddingRow(null)}
                                                className="text-red-400 hover:text-red-300 px-1"
                                                title="Cancel"
                                            >
                                                ❌
                                            </button>
                                        </td>
                                        {columns.map(k => (
                                            <td key={k} className="p-1 border-r border-border/50">
                                                <input
                                                    type="text"
                                                    className="bg-background text-textPrimary p-1 border border-primary/50 text-xs w-full min-w-[100px] outline-none rounded focus:border-primary"
                                                    value={addingRow[k]}
                                                    onChange={e => setAddingRow({ ...addingRow, [k]: e.target.value })}
                                                    placeholder={k}
                                                    onKeyDown={e => {
                                                        if (e.key === 'Enter') handleInsert();
                                                        if (e.key === 'Escape') setAddingRow(null);
                                                    }}
                                                />
                                            </td>
                                        ))}
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </ScrollArea>
                    {canMutate && !addingRow && (
                        <div className="flex justify-end mt-2 shrink-0 gap-2">
                            <button
                                onClick={() => setShowImportModal(true)}
                                className="bg-panel border border-border hover:bg-white/5 text-secondary px-3 py-1.5 text-xs font-bold rounded transition-colors shadow-sm"
                                disabled={isMutating}
                            >
                                📥 Import
                            </button>
                            <button
                                onClick={() => setShowExportModal(true)}
                                className="bg-panel border border-border hover:bg-white/5 text-secondary px-3 py-1.5 text-xs font-bold rounded transition-colors shadow-sm"
                                disabled={isMutating}
                            >
                                📤 Export
                            </button>
                            <button
                                onClick={handleAddRowInit}
                                className="bg-panel border border-border hover:bg-white/5 text-primary px-3 py-1.5 text-xs font-bold rounded transition-colors shadow-sm"
                                disabled={isMutating}
                            >
                                + Add Row
                            </button>
                        </div>
                    )}
                </div>
            )}

            {!isFullScreen && result.message && (
              <div className="mt-2 shrink-0">
                <div className="flex justify-between items-center mb-1 text-[11px] text-gray-500 font-bold uppercase tracking-wider">
                  <span>AI Message & Output</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(result.message);
                      setMessageCopied(true);
                      setTimeout(() => setMessageCopied(false), 2000);
                    }}
                    className="text-[10px] text-gray-400 hover:text-primary transition-colors flex items-center gap-1 cursor-pointer bg-transparent hover:bg-white/5 px-1.5 py-0.5 rounded"
                    title="Copy AI Message"
                  >
                    {messageCopied ? (
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
                <ScrollArea
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
                      e.preventDefault();
                      e.stopPropagation();
                      const range = document.createRange();
                      range.selectNodeContents(e.currentTarget);
                      const sel = window.getSelection();
                      sel.removeAllRanges();
                      sel.addRange(range);
                    }
                  }}
                  className="max-h-48 overflow-y-auto border border-border rounded bg-background select-text outline-none focus:ring-1 focus:ring-primary/40"
                >
                  <div className="p-3 select-text">
                    <AiMessageRenderer content={result.message} />
                  </div>
                </ScrollArea>
              </div>
            )}

            {saveDialog && (
              <SaveFileDialog
                content={saveDialog.content}
                defaultFilename={saveDialog.filename}
                onClose={() => setSaveDialog(null)}
              />
            )}

            {!isFullScreen && result.extracted_sql && (
                <div className="mt-2 shrink-0">
                    <div className="flex justify-between items-center mb-1">
                        <strong className="text-primary text-xs uppercase flex items-center gap-2">
                            Executed SQL
                            {canMutate && (
                                <span className="text-gray-500 text-[10px] font-normal normal-case">
                                    (Double-click cells to edit)
                                </span>
                            )}
                        </strong>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(result.extracted_sql);
                            setSqlCopied(true);
                            setTimeout(() => setSqlCopied(false), 2000);
                          }}
                          className="text-[10px] text-gray-400 hover:text-primary transition-colors flex items-center gap-1 cursor-pointer bg-transparent hover:bg-white/5 px-1.5 py-0.5 rounded"
                          title="Copy Executed SQL"
                        >
                          {sqlCopied ? (
                            <>
                              <svg className="w-3 h-3 text-emerald-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                              <span className="text-emerald-400">Copied</span>
                            </>
                          ) : (
                            <>
                              <CopyIcon className="w-3 h-3" />
                              <span>Copy SQL</span>
                            </>
                          )}
                        </button>
                    </div>
                    <div
                        tabIndex={0}
                        onKeyDown={(e) => {
                            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
                                e.preventDefault();
                                e.stopPropagation();
                                const range = document.createRange();
                                range.selectNodeContents(e.currentTarget);
                                const sel = window.getSelection();
                                sel.removeAllRanges();
                                sel.addRange(range);
                            }
                        }}
                        className="text-textPrimary font-code text-xs bg-panel p-2 rounded mt-1 border border-border h-max max-h-24 overflow-y-auto select-text outline-none focus:ring-1 focus:ring-primary/40"
                    >
                        {result.extracted_sql}
                    </div>
                </div>
            )}

            {!isFullScreen && !hasData && columns.length === 0 && (result.extracted_sql || result.message) && (
                <div className="flex flex-col items-center gap-3 mt-4 p-6 border border-dashed border-border rounded bg-panel/30">
                    <div className="text-gray-500 italic text-xs">Query executed successfully (0 rows returned).</div>
                    
                    {(result.hasRls || !result.isTableClick) && (
                        <>
                            <button 
                                onClick={() => onDiagnose && onDiagnose(refSchema, refTable)}
                                className="bg-cyan-500/10 border border-cyan-500/50 text-cyan-400 hover:bg-cyan-500 hover:text-black px-4 py-2 rounded text-xs font-bold transition-all flex items-center gap-2"
                            >
                                🔐 Diagnose ERLS / Protection
                            </button>
                            <p className="text-[10px] text-gray-600 max-w-sm text-center">
                                If this table should have data but returns nothing, it might be protected by Row Level Security or a Multi-tenant Protocol.
                            </p>
                        </>
                    )}
                </div>
            )}

            {!isFullScreen && !hasData && columns.length > 0 && (result.hasRls || (!result.isTableClick && refTable)) && onDiagnose && (
                <div className="flex items-center justify-between gap-3 mt-2 p-3 border border-border/60 rounded bg-panel/20 text-xs">
                    <div className="flex items-center gap-2 text-gray-400">
                        <span>ℹ️ Empty table result.</span>
                        <span className="text-[11px] text-gray-500">If data is expected, check if access is restricted by Row Level Security.</span>
                    </div>
                    <button 
                        onClick={() => onDiagnose && onDiagnose(refSchema, refTable)}
                        className="bg-cyan-500/10 border border-cyan-500/50 text-cyan-400 hover:bg-cyan-500 hover:text-black px-3 py-1 rounded text-xs font-bold transition-all shrink-0 flex items-center gap-1.5"
                    >
                        🔐 Diagnose Protection
                    </button>
                </div>
            )}

            {!isFullScreen && (result.constraints || (result.isTableClick && columns.length > 0)) && (
                <div className="mt-4 border border-border rounded bg-panel/20 p-4">
                    <h3 className="text-xs font-bold text-primary uppercase mb-2 flex items-center gap-2">
                        🔗 Table Constraints
                    </h3>
                    {result.constraints && result.constraints.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {result.constraints.map((c, idx) => (
                                <div key={idx} className="flex flex-col bg-panel border border-border p-3 rounded-lg hover:border-primary/50 transition-all group shadow-sm">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-[11px] text-secondary font-bold truncate group-hover:text-primary transition-colors" title={c.name}>{c.name}</span>
                                        <span className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded border border-primary/20 uppercase font-bold tracking-tighter shrink-0">{c.type}</span>
                                    </div>
                                    {c.definition && c.definition !== 'None' && c.definition !== '' && (
                                        <div className="text-[10px] text-gray-400 font-code mt-1 break-words opacity-80 group-hover:opacity-100 transition-opacity">
                                            {c.definition}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-[10px] text-gray-500 italic py-2">
                            No constraints found for this table. Try refreshing the schema if you expect constraints here.
                        </div>
                    )}
                </div>
            )}

            {!isFullScreen && hasData && (
                <div className="flex justify-end mt-2 shrink-0 gap-2">
                    <button
                        onClick={() => setShowDbImportModal(true)}
                        className="bg-panel border border-border hover:bg-white/5 text-secondary px-3 py-1.5 text-xs font-bold rounded transition-colors shadow-sm"
                    >
                        📥 Import SQL File
                    </button>
                </div>
            )}

            {showExportModal && (
                <ExportForm
                    isDatabase={false}
                    targetName={refTable || refSchema}
                    activeConfig={activeConfig}
                    schemaName={refSchema}
                    tableName={refTable}
                    onCancel={() => setShowExportModal(false)}
                />
            )}
            {showImportModal && (
                <ImportForm
                    isDatabase={false}
                    targetName={refTable || refSchema}
                    activeConfig={activeConfig}
                    schemaName={refSchema}
                    tableName={refTable}
                    onCancel={() => setShowImportModal(false)}
                    onSuccess={onRefresh}
                />
            )}
            {showDbImportModal && activeConfig && (
                <ImportForm
                    isDatabase={true}
                    targetName={activeConfig.database}
                    activeConfig={activeConfig}
                    onCancel={() => setShowDbImportModal(false)}
                    onSuccess={() => setShowDbImportModal(false)}
                />
            )}
        </ScrollArea>
    );
}
