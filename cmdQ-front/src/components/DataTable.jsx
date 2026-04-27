import React, { useState } from 'react';
import ScrollArea from './ScrollArea';
import { apiService } from '../services/apiService';
import ExportForm from './forms/ExportForm';
import ImportForm from './forms/ImportForm';

export default function DataTable({ result, activeConfig, activeSchemaName, activeTableName, onRefresh, onLocalMutation, onDiagnose }) {
    const [editingCell, setEditingCell] = useState(null); // { rowIndex, key, value }
    const [addingRow, setAddingRow] = useState(null);
    const [isMutating, setIsMutating] = useState(false);
    const [mutationError, setMutationError] = useState("");
    const [showExportModal, setShowExportModal] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false);

    const canMutate = Boolean(activeConfig && activeSchemaName && activeTableName && onRefresh);

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

            const whereClause = Object.entries(origRow)
                .map(([k, v]) => v === null ? `"${k}" IS NULL` : `"${k}" = ${formatSqlValue(v)}`)
                .join(' AND ');

            const query = `UPDATE "${activeSchemaName}"."${activeTableName}" SET "${realUpdateKey}" = ${formatSqlValue(updateValue)} WHERE ${whereClause}`;

            await apiService.executeQuery({
                query,
                db_config: activeConfig
            });

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
            
            const origRow = result.original_data && typeof rowIndex === 'number' ? result.original_data[rowIndex] : row;
            
            const whereClause = Object.entries(origRow)
                .map(([k, v]) => v === null ? `"${k}" IS NULL` : `"${k}" = ${formatSqlValue(v)}`)
                .join(' AND ');

            const query = `DELETE FROM "${activeSchemaName}"."${activeTableName}" WHERE ${whereClause}`;

            await apiService.executeQuery({
                query,
                db_config: activeConfig
            });

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

            const query = `INSERT INTO "${activeSchemaName}"."${activeTableName}" (${validColNames}) VALUES (${validValues})`;

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
                    className="bg-black/50 text-white p-1 border border-primary text-xs w-full min-w-[100px] outline-none rounded"
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

    const hasData = result.data && result.data.length > 0;
    const columns = hasData ? Object.keys(result.data[0]) : (result.columns || []);

    console.log("DEBUG: DataTable rendering for", activeTableName, "hasData:", hasData, "columns:", columns, "constraints:", result.constraints);

    return (
        <ScrollArea className="p-4 flex flex-col gap-4 h-full relative">
            {isMutating && (
                <div className="absolute inset-0 bg-background/50 z-50 flex items-center justify-center">
                    <div className="bg-panel border border-border p-4 rounded shadow-lg text-primary font-bold animate-pulse">
                        Applying changes...
                    </div>
                </div>
            )}

            {/* Data Rows displayed first */}
            {(hasData || (result.isTableClick && columns.length > 0)) && (
                <div className="flex flex-col flex-1 min-h-[200px]">
                    <ScrollArea className="flex-1 border border-border rounded bg-background overflow-auto min-h-0 relative">
                        <table className="min-w-max w-full text-left text-xs text-gray-300">
                            <thead className="bg-panel text-gray-400 uppercase sticky top-0 shadow-sm z-10">
                                <tr>
                                    {canMutate && <th className="p-2 border-b border-r border-border w-16 text-center">Act</th>}
                                    {columns.map(k => (
                                        <th key={k} className="p-2 border-b border-r border-border whitespace-nowrap">{k}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {result.data.map((row, i) => (
                                    <tr key={i} className="border-b border-border/50 hover:bg-white/5 transition-colors">
                                        {canMutate && (
                                            <td className="p-2 border-r border-border/50 text-center select-none">
                                                <button
                                                    onClick={() => handleDelete(row, i)}
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
                                                {renderCell(row, i, k, row[k])}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
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
                                                    className="bg-black/50 text-white p-1 border border-primary/50 text-xs w-full min-w-[100px] outline-none rounded focus:border-primary"
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

            {/* AI Text Output */}
            {result.message && (
                <ScrollArea className="max-h-32 overflow-y-auto mt-2 border border-border rounded bg-background shrink-0">
                    <div className="text-secondary whitespace-pre-wrap font-code text-xs p-3">
                        {result.message}
                    </div>
                </ScrollArea>
            )}

            {/* Error Output */}
            {mutationError && (
                <div className="bg-red-500/20 border border-red-500 text-red-400 p-2 rounded text-xs mt-2 shrink-0">
                    Error: {mutationError}
                    <button className="float-right font-bold text-red-300 hover:text-white" onClick={() => setMutationError("")}>X</button>
                </div>
            )}

            {/* SQL Executed */}
            {result.extracted_sql && (
                <div className="mt-2 shrink-0">
                    <strong className="text-primary text-xs uppercase flex items-center gap-2">
                        Executed SQL
                        {canMutate && (
                            <span className="text-gray-500 text-[10px] font-normal normal-case">
                                (Double-click cells to edit)
                            </span>
                        )}
                    </strong>
                    <div className="text-gray-300 font-code text-xs bg-black/50 p-2 rounded mt-1 border border-border/50 h-max max-h-24 overflow-y-auto">
                        {result.extracted_sql}
                    </div>
                </div>
            )}

            {/* Removed the bottom placement of these rendering blocks in favor of putting them above */}

            {!hasData && (result.extracted_sql || result.message) && (
                <div className="flex flex-col items-center gap-3 mt-4 p-6 border border-dashed border-border rounded bg-panel/30">
                    <div className="text-gray-500 italic text-xs">Query executed successfully (0 rows returned).</div>
                    
                    {(result.hasRls || !result.isTableClick) && (
                        <>
                            <button 
                                onClick={() => onDiagnose && onDiagnose(activeSchemaName, activeTableName)}
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

            {/* Constraints Display */}
            {(result.constraints || (result.isTableClick && columns.length > 0)) && (
                <div className="mt-4 border border-border rounded bg-panel/20 p-4">
                    <h3 className="text-xs font-bold text-primary uppercase mb-2 flex items-center gap-2">
                        🔗 Table Constraints
                    </h3>
                    {result.constraints && result.constraints.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {result.constraints.map((c, idx) => (
                                <div key={idx} className="flex flex-col bg-black/40 border border-border/60 p-3 rounded-lg hover:border-primary/50 transition-all group shadow-sm">
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

            {showExportModal && (
                <ExportForm
                    isDatabase={false}
                    targetName={activeTableName || activeSchemaName}
                    activeConfig={activeConfig}
                    schemaName={activeSchemaName}
                    tableName={activeTableName}
                    onCancel={() => setShowExportModal(false)}
                />
            )}
            {showImportModal && (
                <ImportForm
                    isDatabase={false}
                    targetName={activeTableName || activeSchemaName}
                    activeConfig={activeConfig}
                    schemaName={activeSchemaName}
                    tableName={activeTableName}
                    onCancel={() => setShowImportModal(false)}
                    onSuccess={onRefresh}
                />
            )}
        </ScrollArea>
    );
}
