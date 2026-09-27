import { useState } from 'react';
import { apiService } from '../../services/apiService';
import databaseIcon from '../../assets/icons/database.png';

export default function CreateDatabaseForm({ activeConfig, onCancel, onSuccess }) {
    const [dbName, setDbName] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    const handleCreate = async () => {
        if (!dbName.trim()) {
            alert("Database name is required.");
            return;
        }

        setIsLoading(true);
        try {
            const payload = {
                db_config: activeConfig,
                new_db_name: dbName.trim()
            };
            const result = await apiService.createDatabase(payload);
            alert(result.message || "Database created successfully!");
            if (onSuccess) onSuccess(dbName.trim());
            onCancel();
        } catch (err) {
            alert("Creation Error: " + err.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
            <div className="bg-panel border border-border rounded-lg shadow-2xl p-6 w-96 flex flex-col gap-4">
                <h2 className="text-xl font-bold text-primary flex justify-between items-center w-full">
                    <div className="flex items-center gap-2">
                        <img src={databaseIcon} alt="Database icon" className="w-6 h-6 object-contain" /> Create Database
                    </div>
                </h2>
                <p className="text-xs text-gray-400">
                    Create a new database on {activeConfig.host}:{activeConfig.port}
                </p>

                <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-400 uppercase">Database Name</label>
                    <input
                        type="text"
                        value={dbName}
                        onChange={(e) => setDbName(e.target.value)}
                        placeholder="e.g. new_project_db"
                        className="bg-background border border-border text-textPrimary rounded p-2 focus:border-primary outline-none text-sm"
                        autoFocus
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleCreate();
                        }}
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
                        onClick={handleCreate}
                        disabled={isLoading || !dbName.trim()}
                        className="bg-primary text-background font-bold py-2 px-4 rounded hover:brightness-110 disabled:opacity-50 transition-all flex-1 cursor-pointer"
                    >
                        {isLoading ? "Creating..." : "Create"}
                    </button>
                </div>
            </div>
        </div>
    );
}
