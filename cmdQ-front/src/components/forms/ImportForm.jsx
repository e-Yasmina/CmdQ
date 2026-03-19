import { useState, useRef } from 'react';
import { apiService } from '../../services/apiService';

export default function ImportForm({ isDatabase, targetName, activeConfig, schemaName, tableName, onCancel, onSuccess }) {
    const [format, setFormat] = useState(isDatabase ? 'sql' : 'csv');
    const [selectedFile, setSelectedFile] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const fileInputRef = useRef();

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

                <div className="flex gap-2 mt-2">
                    <button
                        onClick={onCancel}
                        className="bg-red-500/20 border border-red-500/50 text-red-400 font-bold py-2 px-4 rounded hover:bg-red-500/30 transition-all w-1/3 cursor-pointer"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleImport}
                        disabled={isLoading || !selectedFile}
                        className="bg-primary text-background font-bold py-2 px-4 rounded hover:brightness-110 disabled:opacity-50 transition-all flex-1 cursor-pointer"
                    >
                        {isLoading ? "Importing..." : "Upload & Run"}
                    </button>
                </div>
            </div>
        </div>
    );
}
