import React, { useState, useEffect, useRef } from 'react';
import { apiService } from '../../services/apiService';
import ScrollArea from '../ScrollArea';

function MultiSelectDropdown({ options, selected, onChange, placeholder = "Select fields..." }) {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
        <div className="relative" ref={dropdownRef}>
            <div
                className="w-full bg-background border border-border rounded p-1.5 text-xs text-textPrimary cursor-pointer flex justify-between items-center min-h-[30px]"
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className="truncate flex-1 pr-2">
                    {selected.length > 0 ? selected.join(", ") : <span className="text-gray-500">{placeholder}</span>}
                </div>
                <span className="text-gray-500 text-[10px] transform transition-transform" style={{ transform: isOpen ? 'rotate(180deg)' : 'none' }}>▼</span>
            </div>
            {isOpen && (
                <div className="absolute z-10 w-full mt-1 bg-panel border gap-1 border-border rounded shadow-lg max-h-48 overflow-y-auto">
                    {options.map(opt => (
                        <label key={opt} className="flex items-center px-2 py-1.5 hover:bg-white/5 cursor-pointer accent-primary">
                            <input
                                type="checkbox"
                                checked={selected.includes(opt)}
                                onChange={(e) => {
                                    if (e.target.checked) {
                                        onChange([...selected, opt]);
                                    } else {
                                        onChange(selected.filter(item => item !== opt));
                                    }
                                }}
                                className="mr-2 cursor-pointer"
                            />
                            <span className="text-xs truncate">{opt}</span>
                        </label>
                    ))}
                    {options.length === 0 && (
                        <div className="p-2 text-xs text-gray-500 text-center">No options available</div>
                    )}
                </div>
            )}
        </div>
    );
}

export default function DataMigrationForm({ connections, onCancel, onSuccess }) {
    const [sourceConnId, setSourceConnId] = useState("");
    const [sourceDb, setSourceDb] = useState("");
    const [sourceSchema, setSourceSchema] = useState("");
    const [sourceTable, setSourceTable] = useState("");
    const [sourceColumns, setSourceColumns] = useState([]);

    const [targetConnId, setTargetConnId] = useState("");
    const [targetDb, setTargetDb] = useState("");
    const [targetSchema, setTargetSchema] = useState("");
    const [targetTable, setTargetTable] = useState("");
    const [targetColumns, setTargetColumns] = useState([]);

    const [mappings, setMappings] = useState([]);

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    // Helpers to get current structures
    const srcConn = connections.find(c => c.id === sourceConnId);
    const srcDbs = srcConn ? srcConn.databases : [];
    const srcSchemas = srcConn && sourceDb && srcConn.schemas ? srcConn.schemas[sourceDb] : null;

    const tgtConn = connections.find(c => c.id === targetConnId);
    const tgtDbs = tgtConn ? tgtConn.databases : [];
    const tgtSchemas = tgtConn && targetDb && tgtConn.schemas ? tgtConn.schemas[targetDb] : null;

    // Load Source Columns
    useEffect(() => {
        if (srcSchemas && sourceSchema && sourceTable && srcSchemas[sourceSchema]) {
            setSourceColumns(srcSchemas[sourceSchema][sourceTable] || []);
        } else {
            setSourceColumns([]);
        }
    }, [srcSchemas, sourceSchema, sourceTable]);

    // Load Target Columns
    useEffect(() => {
        if (tgtSchemas && targetSchema && targetTable && tgtSchemas[targetSchema]) {
            setTargetColumns(tgtSchemas[targetSchema][targetTable] || []);
        } else {
            setTargetColumns([]);
        }
    }, [tgtSchemas, targetSchema, targetTable]);

    const handleAddMapping = () => {
        setMappings([...mappings, { source_fields: [], target_fields: [], transformation: "none" }]);
    };

    const handleMappingChange = (index, field, value) => {
        const newMappings = [...mappings];
        newMappings[index][field] = value;
        setMappings(newMappings);
    };

    const handleRemoveMapping = (index) => {
        setMappings(mappings.filter((_, i) => i !== index));
    };

    const handleExecute = async () => {
        if (!sourceConnId || !sourceTable || !targetConnId || !targetTable) {
            setError("Please complete both Source and Target selections.");
            return;
        }
        if (mappings.length === 0) {
            setError("Please define at least one field mapping.");
            return;
        }

        setIsLoading(true);
        setError(null);

        const payload = {
            source_config: { ...srcConn.config, database: sourceDb },
            source_schema: sourceSchema,
            source_table: sourceTable,
            target_config: { ...tgtConn.config, database: targetDb },
            target_schema: targetSchema,
            target_table: targetTable,
            mappings: mappings.map(m => ({
                source_fields: Array.isArray(m.source_fields) ? m.source_fields : (m.source_fields ? [m.source_fields] : []),
                target_fields: Array.isArray(m.target_fields) ? m.target_fields : (m.target_fields ? [m.target_fields] : []),
                transformation: m.transformation
            }))
        };

        try {
            const result = await apiService.migrateData(payload);
            if (result.status === "success") {
                if (onSuccess) onSuccess(result.message);
                onCancel();
            } else {
                setError(result.message);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-panel rounded-lg shadow-2xl border border-border w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
                <div className="p-4 border-b border-border bg-panel flex justify-between items-center">
                    <h2 className="text-lg font-bold text-primary flex items-center gap-2">
                        <span>🔄</span> Data Mapping & ETL
                    </h2>
                    <button onClick={onCancel} className="text-gray-400 hover:text-white cursor-pointer transition-colors p-1">
                        ✕
                    </button>
                </div>

                <ScrollArea className="p-6 overflow-y-auto flex-1 font-ui space-y-6">
                    {/* Source & Target Configuration */}
                    <div className="grid grid-cols-2 gap-6">
                        {/* Source Box */}
                        <div className="border border-border rounded p-4 bg-background/50">
                            <h3 className="text-sm font-bold text-secondary mb-4 flex items-center gap-2 uppercase tracking-wider">
                                📤 Source Config
                            </h3>
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">Connection</label>
                                    <select className="w-full bg-panel border gap-1 border-border rounded p-2 text-sm text-textPrimary focus:border-primary focus:outline-none" value={sourceConnId} onChange={e => setSourceConnId(e.target.value)}>
                                        <option value="">Select Connection...</option>
                                        {connections.map(c => <option key={c.id} value={c.id}>{c.id}</option>)}
                                    </select>
                                </div>
                                {sourceConnId && (
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1">Database</label>
                                        <select className="w-full bg-panel border border-border rounded p-2 text-sm text-textPrimary focus:border-primary focus:outline-none" value={sourceDb} onChange={e => { setSourceDb(e.target.value); setSourceSchema(""); setSourceTable(""); }}>
                                            <option value="">Select Database...</option>
                                            {srcDbs.map(db => <option key={db} value={db}>{db}</option>)}
                                        </select>
                                    </div>
                                )}
                                {sourceDb && srcSchemas && (
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1">Schema</label>
                                        <select className="w-full bg-panel border border-border rounded p-2 text-sm text-textPrimary focus:border-primary focus:outline-none" value={sourceSchema} onChange={e => { setSourceSchema(e.target.value); setSourceTable(""); }}>
                                            <option value="">Select Schema...</option>
                                            {Object.keys(srcSchemas).map(s => <option key={s} value={s}>{s}</option>)}
                                        </select>
                                    </div>
                                )}
                                {sourceSchema && (
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1">Table</label>
                                        <select className="w-full bg-panel border border-border rounded p-2 text-sm text-textPrimary focus:border-primary focus:outline-none" value={sourceTable} onChange={e => setSourceTable(e.target.value)}>
                                            <option value="">Select Table...</option>
                                            {Object.keys(srcSchemas[sourceSchema] || {}).map(t => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Target Box */}
                        <div className="border border-border rounded p-4 bg-background/50">
                            <h3 className="text-sm font-bold text-secondary mb-4 flex items-center gap-2 uppercase tracking-wider">
                                📥 Target Config
                            </h3>
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">Connection</label>
                                    <select className="w-full bg-panel border border-border rounded p-2 text-sm text-textPrimary focus:border-primary focus:outline-none" value={targetConnId} onChange={e => setTargetConnId(e.target.value)}>
                                        <option value="">Select Connection...</option>
                                        {connections.map(c => <option key={c.id} value={c.id}>{c.id}</option>)}
                                    </select>
                                </div>
                                {targetConnId && (
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1">Database</label>
                                        <select className="w-full bg-panel border border-border rounded p-2 text-sm text-textPrimary focus:border-primary focus:outline-none" value={targetDb} onChange={e => { setTargetDb(e.target.value); setTargetSchema(""); setTargetTable(""); }}>
                                            <option value="">Select Database...</option>
                                            {tgtDbs.map(db => <option key={db} value={db}>{db}</option>)}
                                        </select>
                                    </div>
                                )}
                                {targetDb && tgtSchemas && (
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1">Schema</label>
                                        <select className="w-full bg-panel border border-border rounded p-2 text-sm text-textPrimary focus:border-primary focus:outline-none" value={targetSchema} onChange={e => { setTargetSchema(e.target.value); setTargetTable(""); }}>
                                            <option value="">Select Schema...</option>
                                            {Object.keys(tgtSchemas).map(s => <option key={s} value={s}>{s}</option>)}
                                        </select>
                                    </div>
                                )}
                                {targetSchema && (
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1">Table</label>
                                        <select className="w-full bg-panel border border-border rounded p-2 text-sm text-textPrimary focus:border-primary focus:outline-none" value={targetTable} onChange={e => setTargetTable(e.target.value)}>
                                            <option value="">Select Table...</option>
                                            {Object.keys(tgtSchemas[targetSchema] || {}).map(t => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Mapping Section */}
                    {sourceTable && targetTable && (
                        <div className="border border-border rounded p-4 bg-background/50">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-sm font-bold text-secondary uppercase tracking-wider">⚙️ Schema Mapping</h3>
                                <button onClick={handleAddMapping} className="bg-primary/20 text-primary border border-primary/50 hover:bg-primary hover:text-background px-3 py-1 rounded text-xs font-bold transition-colors cursor-pointer">
                                    + Add Field Map
                                </button>
                            </div>

                            {mappings.length === 0 ? (
                                <div className="text-gray-500 text-sm text-center py-4 italic border border-dashed border-border rounded">
                                    No mappings defined. Add one to begin transforming data!
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {mappings.map((map, idx) => (
                                        <div key={idx} className="flex gap-2 items-center bg-panel p-3 border border-border rounded">
                                            {/* Source Field Select */}
                                            <div className="flex-1">
                                                <label className="block text-[10px] text-gray-500 uppercase tracking-widest mb-1">Source Field(s)</label>
                                                {map.transformation === 'concat' ? (
                                                    <MultiSelectDropdown
                                                        options={sourceColumns}
                                                        selected={Array.isArray(map.source_fields) ? map.source_fields : []}
                                                        onChange={newVal => handleMappingChange(idx, 'source_fields', newVal)}
                                                    />
                                                ) : (
                                                    <select className="w-full bg-background border border-border rounded p-1.5 text-xs text-textPrimary focus:border-primary"
                                                        value={Array.isArray(map.source_fields) ? map.source_fields[0] || "" : map.source_fields}
                                                        onChange={e => handleMappingChange(idx, 'source_fields', [e.target.value])}>
                                                        <option value="">Select Field...</option>
                                                        {sourceColumns.map(c => <option key={c} value={c}>{c}</option>)}
                                                    </select>
                                                )}
                                            </div>

                                            <div className="flex flex-col items-center justify-center px-2 text-primary">
                                                <span className="text-xs font-bold uppercase mb-1">Transform</span>
                                                <select className="bg-background border border-primary/50 text-primary rounded p-1 text-xs focus:outline-none" value={map.transformation} onChange={e => handleMappingChange(idx, 'transformation', e.target.value)}>
                                                    <option value="none">→</option>
                                                    <option value="concat">Concat →</option>
                                                    <option value="split">Split →</option>
                                                    <option value="split_first">Split First →</option>
                                                    <option value="split_last">Split Last →</option>
                                                    <option value="cast_int">Cast Int →</option>
                                                    <option value="cast_str">Cast Str →</option>
                                                </select>
                                            </div>

                                            <div className="flex-1">
                                                <label className="block text-[10px] text-gray-500 uppercase tracking-widest mb-1">Target Field(s)</label>
                                                {map.transformation === 'split' ? (
                                                    <MultiSelectDropdown
                                                        options={targetColumns}
                                                        selected={Array.isArray(map.target_fields) ? map.target_fields : []}
                                                        onChange={newVal => handleMappingChange(idx, 'target_fields', newVal)}
                                                        placeholder="Select target branches..."
                                                    />
                                                ) : (
                                                    <select className="w-full bg-background border border-border rounded p-1.5 text-xs text-textPrimary focus:border-primary"
                                                        value={Array.isArray(map.target_fields) ? map.target_fields[0] || "" : map.target_fields}
                                                        onChange={e => handleMappingChange(idx, 'target_fields', [e.target.value])}>
                                                        <option value="">Select Field...</option>
                                                        {targetColumns.map(c => <option key={c} value={c}>{c}</option>)}
                                                    </select>
                                                )}
                                            </div>

                                            <button onClick={() => handleRemoveMapping(idx)} className="text-red-400 hover:text-red-300 ml-2 mt-4 p-1 rounded hover:bg-red-400/10 cursor-pointer">
                                                🗑️
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {error && (
                        <div className="p-3 bg-red-500/10 border border-red-500/50 text-red-400 text-sm rounded">
                            {error}
                        </div>
                    )}
                </ScrollArea>

                <div className="p-4 border-t border-border bg-panel flex justify-end gap-3">
                    <button onClick={onCancel} className="px-4 py-2 hover:bg-white/5 text-textPrimary text-sm font-bold rounded cursor-pointer transition-colors" disabled={isLoading}>
                        Cancel
                    </button>
                    <button onClick={handleExecute} className="px-5 py-2 bg-primary hover:brightness-110 text-background text-sm font-bold rounded cursor-pointer transition-all flex items-center gap-2 disabled:opacity-50" disabled={isLoading || mappings.length === 0}>
                        {isLoading ? (
                            <><div className="w-4 h-4 border-2 border-background border-t-transparent rounded-full animate-spin"></div> Migrating...</>
                        ) : (
                            <>🚀 Start Migration</>
                        )}
                    </button>
                </div>
            </div>
        </div >
    );
}
