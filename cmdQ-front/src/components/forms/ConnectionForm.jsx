import { useState } from 'react';
import { apiService } from '../../services/apiService';

export default function ConnectionForm({ onConnected, onCancel }) {
    const [dbConfig, setDbConfig] = useState({
        db_type: "postgres",
        host: "127.0.0.1",
        port: 5432,
        user: "postgres",
        password: "",
        database: "",
        server_name: ""
    });
    const [isLoading, setIsLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");
    const [connStep, setConnStep] = useState(1);

    const databases = [
        { name: "postgres", label: "PostgreSQL", icon: "🐘", defaultPort: 5432 },
        { name: "mysql", label: "MySQL", icon: "🐬", defaultPort: 3306 }
    ];

    const handleDbTypeChange = (e) => {
        const dbType = e.target.value;
        const db = databases.find(d => d.name === dbType);
        setDbConfig({ ...dbConfig, db_type: dbType, port: db ? db.defaultPort : 5432 });
    };

    const handleConfigChange = (e) => {
        setDbConfig({ ...dbConfig, [e.target.name]: e.target.value });
    };

    const checkPort = async () => {
        setIsLoading(true);
        setErrorMsg("");
        try {
            await apiService.checkPort(dbConfig.host, parseInt(dbConfig.port));
            setConnStep(2);
        } catch (err) {
            console.error("Port check failed:", err.message);
            setErrorMsg("Connection failed. Check console for details.");
        } finally {
            setIsLoading(false);
        }
    };

    const connectDb = async () => {
        setIsLoading(true);
        setErrorMsg("");
        try {
            const payload = { ...dbConfig, port: parseInt(dbConfig.port), database: "" };
            const data = await apiService.connectDb(payload);

            const retrievedDbs = data.databases || [];
            let initialDb = retrievedDbs.length > 0 ? retrievedDbs[0] : "";

            onConnected(retrievedDbs, initialDb, { ...dbConfig, database: initialDb });
        } catch (err) {
            console.error("Database connection error:", err.message);
            const msg = err.message.toLowerCase();
            if (msg.includes("password authentication failed") || msg.includes("access denied")) {
                setErrorMsg("The password is wrong or credentials are incorrect.");
            } else {
                setErrorMsg("Connection failed. Check console for details.");
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
            <div className="bg-panel border border-border rounded-lg shadow-2xl p-6 w-96 flex flex-col gap-4 relative">
                {onCancel && (
                    <button
                        onClick={onCancel}
                        className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors cursor-pointer"
                        title="Close"
                    >
                        ✕
                    </button>
                )}
                <h2 className="text-xl font-bold text-primary flex items-center gap-2">
                    <span className="text-2xl">🔌</span> Database Connection
                </h2>

                {errorMsg && (
                    <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-2 rounded text-sm">
                        {errorMsg}
                    </div>
                )}

                {connStep === 1 && (
                    <>
                        <div className="flex flex-col gap-1">
                            <label className="text-xs text-gray-400 uppercase">Server Name (Custom Label)</label>
                            <input
                                type="text" name="server_name" value={dbConfig.server_name} onChange={handleConfigChange}
                                placeholder="e.g. Production DB"
                                className="bg-background border border-border text-textPrimary rounded p-2 focus:border-primary outline-none"
                            />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-xs text-gray-400 uppercase">Database Type</label>
                            <select
                                name="db_type"
                                value={dbConfig.db_type}
                                onChange={handleDbTypeChange}
                                className="bg-background border border-border text-textPrimary rounded p-2 focus:border-primary outline-none"
                            >
                                {databases.map(db => (
                                    <option key={db.name} value={db.name}>{db.icon} {db.label}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex gap-2">
                            <div className="flex flex-col gap-1 flex-1">
                                <label className="text-xs text-gray-400 uppercase">Host</label>
                                <input
                                    type="text" name="host" value={dbConfig.host} onChange={handleConfigChange}
                                    className="bg-background border border-border text-textPrimary rounded p-2 focus:border-primary outline-none"
                                />
                            </div>
                            <div className="flex flex-col gap-1 w-24">
                                <label className="text-xs text-gray-400 uppercase">Port</label>
                                <input
                                    type="number" name="port" value={dbConfig.port} onChange={handleConfigChange}
                                    className="bg-background border border-border text-textPrimary rounded p-2 focus:border-primary outline-none"
                                />
                            </div>
                        </div>
                        <button
                            onClick={checkPort}
                            disabled={isLoading}
                            className="mt-2 bg-primary text-background font-bold py-2 rounded hover:brightness-110 disabled:opacity-50 transition-all cursor-pointer"
                        >
                            {isLoading ? "Checking..." : "Verify Port"}
                        </button>
                    </>
                )}

                {connStep === 2 && (
                    <>
                        <div className="flex flex-col gap-1">
                            <label className="text-xs text-gray-400 uppercase">Username</label>
                            <input
                                type="text" name="user" value={dbConfig.user} onChange={handleConfigChange}
                                className="bg-background border border-border text-textPrimary rounded p-2 focus:border-primary outline-none"
                            />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-xs text-gray-400 uppercase">Password</label>
                            <input
                                type="password" name="password" value={dbConfig.password} onChange={handleConfigChange}
                                className="bg-background border border-border text-textPrimary rounded p-2 focus:border-primary outline-none"
                            />
                        </div>
                        <div className="flex gap-2 mt-2">
                            <button
                                onClick={() => setConnStep(1)}
                                className="bg-background border border-border text-textPrimary font-bold py-2 px-4 rounded hover:bg-white/5 transition-all w-1/3 cursor-pointer"
                            >
                                Back
                            </button>
                            <button
                                onClick={connectDb}
                                disabled={isLoading}
                                className="bg-secondary text-background font-bold py-2 px-4 rounded hover:brightness-110 disabled:opacity-50 transition-all flex-1 cursor-pointer"
                            >
                                {isLoading ? "Connecting..." : "Connect"}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
