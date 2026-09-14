import { useState, useRef } from 'react';
import { apiService } from '../../services/apiService';

export default function ImportForm({ isDatabase, targetName, activeConfig, schemaName, tableName, onCancel, onSuccess }) {
    const [format, setFormat] = useState(isDatabase ? 'sql' : 'csv');
    const [selectedFile, setSelectedFile] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [scanResult, setScanResult] = useState(null);
    const [targetDatabase, setTargetDatabase] = useState(activeConfig?.database || "");
    const fileInputRef = useRef();

    const handleScan = async () => {
        if (!selectedFile) return;
        setIsLoading(true);
        setScanResult(null);
        try {
            const formData = new FormData();
            formData.append('file', selectedFile);
            formData.append('format', format);
            const res = await apiService.scanImport(formData);
            if (res.status === 'success') {
                setScanResult(res.report);
            } else {
                alert(res.message);
            }
        } catch (err) {
            alert(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleImport = async () => {
        if (!selectedFile) {
            alert("Please select a file to import.");
            return;
        }

        setIsLoading(true);
        try {
            const formData = new FormData();
            formData.append('file', selectedFile);
            formData.append('db_config', JSON.stringify(activeConfig));

            formData.append('target_database', targetDatabase);

            let result;
            if (isDatabase) {
                result = await apiService.importDatabase(formData);
            } else {
                formData.append('schema_name', schemaName);
                formData.append('table_name', tableName);
                formData.append('format', format);
                result = await apiService.importTable(formData);
            }

            alert(result.message || "Import successful!");
            if (onSuccess) onSuccess();
            onCancel();
        } catch (err) {
            alert("Import Error: " + err.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
            <div className="bg-panel border border-border rounded-lg shadow-2xl p-6 w-96 flex flex-col gap-4">
                <h2 className="text-xl font-bold text-primary flex justify-between items-center w-full">
                    <div className="flex items-center gap-2">
                        <span className="text-2xl">📥</span> Import into {isDatabase ? 'Database' : 'Table'}
                    </div>
                </h2>
                <p className="text-xs text-gray-400">
                    Importing to {isDatabase ? `database: ${targetName}` : `table: ${schemaName}.${tableName}`}
                </p>

                <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-400 uppercase">Format</label>
                    <select
                        value={format}
                        onChange={(e) => {
                            setFormat(e.target.value);
                            setSelectedFile(null);
                            if (fileInputRef.current) fileInputRef.current.value = "";
                        }}
                        className="bg-background border border-border text-textPrimary rounded p-2 focus:border-primary outline-none text-sm"
                    >
                        {isDatabase ? (
                            <option value="sql">SQL Dump</option>
                        ) : (
                            <>
                                <option value="csv">CSV</option>
                                <option value="json">JSON</option>
                                <option value="sql">SQL Inserts</option>
                            </>
                        )}
                    </select>
                </div>

                <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-400 uppercase">Select File</label>
                    <input
                        type="file"
                        ref={fileInputRef}
                        accept={format === 'csv' ? '.csv' : format === 'json' ? '.json' : '.sql'}
                        onChange={(e) => setSelectedFile(e.target.files[0])}
                        className="bg-background border border-border text-textPrimary rounded p-2 focus:border-primary outline-none text-sm cursor-pointer"
                    />
                </div>

                {isDatabase && (
                    <div className="flex flex-col gap-1">
                        <label className="text-xs text-gray-400 uppercase">Target Database (optional — leave blank to use name from SQL dump)</label>
                        <input
                            type="text"
                            value={targetDatabase}
                            onChange={(e) => setTargetDatabase(e.target.value)}
                            placeholder={activeConfig?.database || "mydb"}
                            className="bg-background border border-border text-textPrimary rounded p-2 focus:border-primary outline-none text-sm"
                        />
                    </div>
                )}

                <div className="flex gap-2 mt-2">
                    <button
                        onClick={onCancel}
                        className="bg-red-500/20 border border-red-500/50 text-red-400 font-bold py-2 px-4 rounded hover:bg-red-500/30 transition-all w-1/4 cursor-pointer text-sm"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleScan}
                        disabled={isLoading || !selectedFile}
                        className="bg-blue-500/20 border border-blue-500/50 text-blue-400 font-bold py-2 px-4 rounded hover:bg-blue-500/30 disabled:opacity-50 transition-all w-1/4 cursor-pointer text-sm"
                    >
                        Scan
                    </button>
                    <button
                        onClick={handleImport}
                        disabled={isLoading || !selectedFile}
                        className="bg-primary text-background font-bold py-2 px-4 rounded hover:brightness-110 disabled:opacity-50 transition-all flex-1 cursor-pointer text-sm"
                    >
                        {isLoading ? "Running..." : "Run Import"}
                    </button>
                </div>

                {scanResult && (
                    <div className="mt-4 p-3 bg-background/50 border border-border rounded text-xs flex flex-col gap-2 max-h-40 overflow-y-auto">
                        <div className="font-bold text-blue-400">Pre-Import Scan Report:</div>
                        <div className="flex justify-between">
                            <span>Expected Rows:</span>
                            <span className="text-primary">{scanResult.row_count}</span>
                        </div>
                        {scanResult.table_count > 0 && (
                            <div className="flex justify-between">
                                <span>Tables to Create:</span>
                                <span className="text-primary">{scanResult.table_count}</span>
                            </div>
                        )}
                        {scanResult.tables_affected.length > 0 && (
                            <div>
                                <div className="text-gray-400">Affected Tables:</div>
                                <div className="pl-2">{scanResult.tables_affected.join(', ')}</div>
                            </div>
                        )}
                        {scanResult.destructive_actions.length > 0 && (
                            <div className="text-red-400 font-bold">
                                ⚠️ Warnings:
                                <ul className="list-disc pl-4 font-normal">
                                    {scanResult.destructive_actions.map((act, i) => (
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
