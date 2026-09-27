import { useState } from 'react';
import { apiService } from '../../services/apiService';

export default function ExportForm({ isDatabase, targetName, activeConfig, schemaName, tableName, onCancel }) {
    const [format, setFormat] = useState(isDatabase ? 'sql' : 'csv');
    const [isLoading, setIsLoading] = useState(false);

    const handleExport = async () => {
        setIsLoading(true);
        try {
            let blob;
            let filename = targetName;

            if (isDatabase) {
                blob = await apiService.exportDatabase({
                    db_config: activeConfig,
                    format: format
                });
                filename = `${targetName}_export.sql`;
            } else {
                blob = await apiService.exportTable({
                    db_config: activeConfig,
                    schema_name: schemaName,
                    table_name: tableName,
                    format: format
                });
                filename = `${tableName}_export.${format}`;
            }

            // Create download link
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);

            onCancel(); // Close modal after successful start of download
        } catch (err) {
            alert("Export Error: " + err.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
            <div className="bg-panel border border-border rounded-lg shadow-2xl p-6 w-96 flex flex-col gap-4">
                <h2 className="text-xl font-bold text-primary flex justify-between items-center w-full">
                    <div className="flex items-center gap-2">
                        <span className="text-2xl">📤</span> Export {isDatabase ? 'Database' : 'Table'}
                    </div>
                </h2>
                <p className="text-xs text-gray-400">
                    Exporting {isDatabase ? `database: ${targetName}` : `table: ${schemaName}.${tableName}`}
                </p>

                <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-400 uppercase">Format</label>
                    <select
                        value={format}
                        onChange={(e) => setFormat(e.target.value)}
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

                <div className="flex gap-2 mt-2">
                    <button
                        onClick={onCancel}
                        className="bg-red-500/20 border border-red-500/50 text-red-400 font-bold py-2 px-4 rounded hover:bg-red-500/30 transition-all w-1/3 cursor-pointer"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleExport}
                        disabled={isLoading}
                        className="bg-primary text-background font-bold py-2 px-4 rounded hover:brightness-110 disabled:opacity-50 transition-all flex-1 cursor-pointer"
                    >
                        {isLoading ? "Exporting..." : "Download Data"}
                    </button>
                </div>
            </div>
        </div>
    );
}
