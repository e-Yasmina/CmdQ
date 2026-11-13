import React, { useState, useRef, useId } from 'react';
import { apiService } from '../../services/apiService';

interface ImportFormProps {
    isDatabase: boolean;
    targetName: string;
    activeConfig: any;
    schemaName?: string;
    tableName?: string;
    onCancel: () => void;
    onSuccess?: () => void;
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default function ImportForm({
    isDatabase,
    targetName,
    activeConfig,
    schemaName,
    tableName,
    onCancel,
    onSuccess
}: ImportFormProps) {
    const [format, setFormat] = useState(isDatabase ? 'sql' : 'csv');
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [statusMessage, setStatusMessage] = useState<string>('');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [scanResult, setScanResult] = useState<any>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [targetDatabase, setTargetDatabase] = useState(targetName || activeConfig?.database || '');

    const fileInputRef = useRef<HTMLInputElement>(null);
    const fileInputId = useId();

    const handleFileSelection = (file: File | null) => {
        setSelectedFile(file);
        setErrorMessage(null);
        setSuccessMessage(null);
        setScanResult(null);

        if (!file) return;

        // Auto-detect format based on file extension
        const lowerName = file.name.toLowerCase();
        if (lowerName.endsWith('.sql')) {
            setFormat('sql');
        } else if (!isDatabase && lowerName.endsWith('.csv')) {
            setFormat('csv');
        } else if (!isDatabase && lowerName.endsWith('.json')) {
            setFormat('json');
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isDragging) setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFileSelection(e.dataTransfer.files[0]);
        }
    };

    const handleScan = async () => {
        if (!selectedFile) {
            setErrorMessage('Please select a file to scan.');
            return;
        }

        setIsLoading(true);
        setStatusMessage('Scanning file contents...');
        setErrorMessage(null);
        setSuccessMessage(null);
        setScanResult(null);

        try {
            const formData = new FormData();
            formData.append('file', selectedFile);
            formData.append('format', format);

            const res = await apiService.scanImport(formData);
            if (res.status === 'success') {
                setScanResult(res.report);
            } else {
                setErrorMessage(res.message || 'Scan reported an error.');
            }
        } catch (err: any) {
            setErrorMessage(err.message || 'Failed to scan import file.');
        } finally {
            setIsLoading(false);
            setStatusMessage('');
        }
    };

    const handleImport = async () => {
        if (!selectedFile) {
            setErrorMessage('Please select a file to import.');
            return;
        }

        setIsLoading(true);
        setStatusMessage(
            isDatabase
                ? 'Importing SQL statements into database...'
                : 'Importing data into table...'
        );
        setErrorMessage(null);
        setSuccessMessage(null);

        try {
            const formData = new FormData();
            formData.append('file', selectedFile);
            formData.append('db_config', JSON.stringify(activeConfig || {}));

            let result: any;
            if (isDatabase) {
                const finalTargetDb = targetDatabase.trim() || activeConfig?.database || targetName || '';
                formData.append('target_database', finalTargetDb);
                result = await apiService.importDatabase(formData);
            } else {
                const effectiveSchema = schemaName || activeConfig?.schema || (activeConfig?.db_type === 'postgres' ? 'public' : '');
                const effectiveTable = tableName || targetName || '';
                if (!effectiveTable) {
                    throw new Error('No target table specified.');
                }
                formData.append('schema_name', effectiveSchema);
                formData.append('table_name', effectiveTable);
                formData.append('format', format);
                result = await apiService.importTable(formData);
            }

            const successMsg = result?.message || 'Import completed successfully!';
            setSuccessMessage(successMsg);
            if (onSuccess) {
                onSuccess();
            }

            // Keep success message visible briefly before closing
            setTimeout(() => {
                onCancel();
            }, 1400);
        } catch (err: any) {
            setErrorMessage(err.message || 'Import failed. Please check file format and connection.');
        } finally {
            setIsLoading(false);
            setStatusMessage('');
        }
    };

    const effectiveTargetText = isDatabase
        ? `Database: ${targetName || activeConfig?.database || 'Default'}`
        : `Table: ${schemaName || (activeConfig?.db_type === 'postgres' ? 'public' : '')}.${tableName || targetName}`;

    return (
        <div
            className="absolute inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={(e) => {
                if (e.target === e.currentTarget && !isLoading) {
                    onCancel();
                }
            }}
        >
            <div
                className="bg-panel border border-border rounded-xl shadow-2xl p-6 w-full max-w-lg flex flex-col gap-4 max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex justify-between items-center pb-2 border-b border-border">
                    <div className="flex items-center gap-2">
                        <span className="text-2xl">📥</span>
                        <h2 className="text-lg font-bold text-primary">
                            Import into {isDatabase ? 'Database' : 'Table'}
                        </h2>
                    </div>
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={isLoading}
                        className="text-gray-400 hover:text-textPrimary disabled:opacity-50 text-xl font-bold cursor-pointer p-1"
                        aria-label="Close"
                    >
                        ✕
                    </button>
                </div>

                <div className="text-xs text-gray-400 -mt-2">
                    Target: <span className="text-textPrimary font-semibold">{effectiveTargetText}</span>
                </div>

                {/* Error Banner */}
                {errorMessage && (
                    <div className="p-3 bg-red-500/20 border border-red-500/50 text-red-400 rounded text-xs flex flex-col gap-1">
                        <div className="font-bold flex items-center gap-1">
                            <span>⚠️</span> Error:
                        </div>
                        <div className="break-words">{errorMessage}</div>
                    </div>
                )}

                {/* Success Banner */}
                {successMessage && (
                    <div className="p-3 bg-emerald-500/20 border border-emerald-500/50 text-emerald-400 rounded text-xs flex flex-col gap-1">
                        <div className="font-bold flex items-center gap-1">
                            <span>✓</span> Success:
                        </div>
                        <div className="break-words">{successMessage}</div>
                    </div>
                )}

                {/* Format Selector */}
                <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-400 uppercase tracking-wider font-semibold">
                        Format
                    </label>
                    <select
                        value={format}
                        disabled={isLoading}
                        onChange={(e) => {
                            setFormat(e.target.value);
                            setScanResult(null);
                            setErrorMessage(null);
                        }}
                        className="bg-background border border-border text-textPrimary rounded-lg p-2.5 focus:border-primary outline-none text-sm cursor-pointer disabled:opacity-50"
                    >
                        {isDatabase ? (
                            <option value="sql">SQL Dump (.sql)</option>
                        ) : (
                            <>
                                <option value="csv">CSV (.csv)</option>
                                <option value="json">JSON Array (.json)</option>
                                <option value="sql">SQL Inserts (.sql)</option>
                            </>
                        )}
                    </select>
                </div>

                {/* Target Database Override (for Database Import) */}
                {isDatabase && (
                    <div className="flex flex-col gap-1">
                        <label className="text-xs text-gray-400 uppercase tracking-wider font-semibold">
                            Target Database
                        </label>
                        <input
                            type="text"
                            value={targetDatabase}
                            disabled={isLoading}
                            onChange={(e) => setTargetDatabase(e.target.value)}
                            placeholder={activeConfig?.database || 'e.g. my_database'}
                            className="bg-background border border-border text-textPrimary rounded-lg p-2.5 focus:border-primary outline-none text-sm disabled:opacity-50"
                        />
                        <span className="text-[11px] text-gray-500">
                            Leave as current database or blank to use the database name defined in the SQL dump.
                        </span>
                    </div>
                )}

                {/* Drag and Drop / File Input Zone */}
                <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-400 uppercase tracking-wider font-semibold">
                        Select File
                    </label>
                    <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                        className={`border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all ${
                            isDragging
                                ? 'border-primary bg-primary/10'
                                : selectedFile
                                ? 'border-border bg-background/60 hover:border-primary/50'
                                : 'border-border bg-background/40 hover:border-gray-500 hover:bg-background/60'
                        } ${isLoading ? 'pointer-events-none opacity-60' : ''}`}
                    >
                        <input
                            id={fileInputId}
                            type="file"
                            ref={fileInputRef}
                            accept={format === 'csv' ? '.csv' : format === 'json' ? '.json' : '.sql'}
                            onChange={(e) => handleFileSelection(e.target.files?.[0] || null)}
                            className="hidden"
                        />
                        <span className="text-2xl">{selectedFile ? '📄' : '📁'}</span>
                        {selectedFile ? (
                            <div className="flex flex-col items-center text-center">
                                <span className="text-sm font-semibold text-textPrimary break-all">
                                    {selectedFile.name}
                                </span>
                                <span className="text-xs text-gray-400 mt-0.5">
                                    {formatBytes(selectedFile.size)} • Click or drop to change
                                </span>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center text-center">
                                <span className="text-xs text-textPrimary font-medium">
                                    Click to choose a file or drag and drop here
                                </span>
                                <span className="text-[11px] text-gray-500 mt-0.5">
                                    Supported: {format === 'csv' ? '.csv' : format === 'json' ? '.json' : '.sql'}
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 pt-2">
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={isLoading}
                        className="bg-red-500/20 border border-red-500/50 text-red-400 font-bold py-2.5 px-4 rounded-lg hover:bg-red-500/30 disabled:opacity-50 transition-all cursor-pointer text-sm"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleScan}
                        disabled={isLoading || !selectedFile}
                        className="bg-blue-500/20 border border-blue-500/50 text-blue-400 font-bold py-2.5 px-4 rounded-lg hover:bg-blue-500/30 disabled:opacity-50 transition-all cursor-pointer text-sm"
                    >
                        {isLoading && statusMessage.includes('Scanning') ? 'Scanning...' : 'Scan'}
                    </button>
                    <button
                        type="button"
                        onClick={handleImport}
                        disabled={isLoading || !selectedFile}
                        className="bg-primary text-background font-bold py-2.5 px-4 rounded-lg hover:brightness-110 disabled:opacity-50 transition-all flex-1 cursor-pointer text-sm flex items-center justify-center gap-2"
                    >
                        {isLoading && !statusMessage.includes('Scanning') ? (
                            <>
                                <span className="animate-spin text-sm">⏳</span>
                                <span>{statusMessage || 'Importing...'}</span>
                            </>
                        ) : (
                            <span>Run Import</span>
                        )}
                    </button>
                </div>

                {/* Pre-Import Scan Report */}
                {scanResult && (
                    <div className="p-3 bg-background/70 border border-border rounded-lg text-xs flex flex-col gap-2 max-h-48 overflow-y-auto">
                        <div className="font-bold text-blue-400 flex items-center justify-between">
                            <span>Pre-Import Scan Report:</span>
                            <span className="text-[10px] text-gray-400">
                                {scanResult.estimated_operations} operations
                            </span>
                        </div>
                        <div className="flex justify-between py-0.5 border-b border-border/50">
                            <span className="text-gray-400">Expected Rows:</span>
                            <span className="text-primary font-semibold">{scanResult.row_count}</span>
                        </div>
                        {scanResult.table_count > 0 && (
                            <div className="flex justify-between py-0.5 border-b border-border/50">
                                <span className="text-gray-400">Tables to Create:</span>
                                <span className="text-primary font-semibold">{scanResult.table_count}</span>
                            </div>
                        )}
                        {scanResult.tables_affected && scanResult.tables_affected.length > 0 && (
                            <div className="py-0.5">
                                <div className="text-gray-400 mb-0.5">Affected Tables:</div>
                                <div className="pl-2 font-mono text-[11px] text-textPrimary">
                                    {scanResult.tables_affected.join(', ')}
                                </div>
                            </div>
                        )}
                        {scanResult.destructive_actions && scanResult.destructive_actions.length > 0 && (
                            <div className="text-red-400 font-bold pt-1">
                                ⚠️ Warnings:
                                <ul className="list-disc pl-4 font-normal text-red-300/90 text-[11px] mt-0.5 space-y-0.5">
                                    {scanResult.destructive_actions.map((act: string, i: number) => (
                                        <li key={i}>{act}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
