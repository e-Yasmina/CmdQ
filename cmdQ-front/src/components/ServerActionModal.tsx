import { useState } from 'react';

export default function ServerActionModal({ type, server, onClose, onConfirm, existingConnections = [] }) {
    const [newName, setNewName] = useState(server.config.server_name || server.id);
    const [selectedBackupDb, setSelectedBackupDb] = useState(server.databases?.[0] || "");
    const [isProcessing, setIsProcessing] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");

    const handleConfirm = async () => {
        setErrorMsg("");
        if (type === 'rename') {
            const trimmed = newName.trim();
            if (!trimmed) {
                setErrorMsg("Server name cannot be empty.");
                return;
            }
            const conflict = existingConnections.find(c =>
                c.id !== server.id &&
                ((c.config?.server_name && c.config.server_name.trim().toLowerCase() === trimmed.toLowerCase()) ||
                 (c.id && c.id.toLowerCase() === trimmed.toLowerCase()))
            );
            if (conflict) {
                setErrorMsg(`A server named "${trimmed}" already exists.`);
                return;
            }
            setIsProcessing(true);
            await onConfirm(trimmed);
        } else if (type === 'backup') {
            setIsProcessing(true);
            await onConfirm(selectedBackupDb);
        }
        setIsProcessing(false);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[9999] flex items-center justify-center">
            <div className="bg-panel border border-primary/50 rounded-lg shadow-2xl p-6 w-[450px] flex flex-col gap-4 relative">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors cursor-pointer"
                >
                    ✕
                </button>

                <h2 className="text-xl font-bold text-primary flex items-center gap-2 capitalize">
                    {type === 'properties' ? '📋 Server Properties' : type === 'rename' ? '✏️ Rename Server' : '💾 Database Backup'}
                </h2>

                {errorMsg && (
                    <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-2 rounded text-xs">
                        {errorMsg}
                    </div>
                )}

                {type === 'rename' && (
                    <div className="flex flex-col gap-2">
                        <label className="text-xs text-gray-400 uppercase">New Server Name</label>
                        <input
                            type="text"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            className="bg-background border border-border text-textPrimary rounded p-2 focus:border-primary outline-none"
                            autoFocus
                        />
                    </div>
                )}

                {type === 'properties' && (
                    <div className="grid grid-cols-2 gap-4 text-sm mt-2">
                        <div className="flex flex-col">
                            <span className="text-xs text-secondary font-bold uppercase">Type</span>
                            <span className="text-textPrimary">{server.config.db_type}</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-xs text-secondary font-bold uppercase">Host</span>
                            <span className="text-textPrimary">{server.config.host}</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-xs text-secondary font-bold uppercase">Port</span>
                            <span className="text-textPrimary">{server.config.port}</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-xs text-secondary font-bold uppercase">User</span>
                            <span className="text-textPrimary">{server.config.user}</span>
                        </div>
                        <div className="flex flex-col col-span-2">
                            <span className="text-xs text-secondary font-bold uppercase">Databases</span>
                            <span className="text-textPrimary text-xs break-all opacity-80">
                                {server.databases?.join(', ') || 'No databases loaded'}
                            </span>
                        </div>
                    </div>
                )}

                {type === 'backup' && (
                    <div className="flex flex-col gap-3">
                        <p className="text-sm text-gray-400">Select a database to export as a full SQL dump.</p>
                        <div className="flex flex-col gap-1">
                            <label className="text-xs text-gray-400 uppercase">Target Database</label>
                            <select
                                value={selectedBackupDb}
                                onChange={(e) => setSelectedBackupDb(e.target.value)}
                                className="bg-background border border-border text-textPrimary rounded p-2 focus:border-primary outline-none"
                            >
                                {server.databases?.map(db => (
                                    <option key={db} value={db}>{db}</option>
                                ))}
                            </select>
                        </div>
                        <p className="text-[10px] text-yellow-500/80 italic mt-1">
                            The database schema and data will be exported as a SQL dump.
                        </p>
                    </div>
                )}

                <div className="flex justify-end gap-3 mt-4">
                    <button
                        onClick={onClose}
                        className="bg-background border border-border text-textPrimary font-bold py-2 px-6 rounded hover:bg-white/5 transition-all cursor-pointer"
                    >
                        {type === 'properties' ? 'Close' : 'Cancel'}
                    </button>
                    {type !== 'properties' && (
                        <button
                            onClick={handleConfirm}
                            disabled={isProcessing}
                            className="bg-primary text-background font-bold py-2 px-8 rounded hover:brightness-110 disabled:opacity-50 transition-all cursor-pointer"
                        >
                            {isProcessing ? "Processing..." : type === 'rename' ? 'Save' : 'Start Backup'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
