import { useState, useEffect } from 'react';

export default function PropertiesModal({ entity, onClose }) {
    const [activeTab, setActiveTab] = useState('general');

    // entity: { type: 'database'|'schema'|'table', server: obj, database: str, schemaName: str, tableName: str, isProtected: bool, ... }
    
    const renderGeneral = () => {
        const details = [];
        if (entity.type === 'database') {
            details.push({ label: 'Name', value: entity.database });
            details.push({ label: 'Server', value: entity.server.config.server_name || entity.server.id });
            details.push({ label: 'Type', value: entity.server.config.db_type });
        } else if (entity.type === 'schema') {
            details.push({ label: 'Name', value: entity.schemaName });
            details.push({ label: 'Database', value: entity.database });
            details.push({ label: 'Server', value: entity.server.config.server_name || entity.server.id });
        } else if (entity.type === 'table') {
            details.push({ label: 'Name', value: entity.tableName });
            details.push({ label: 'Schema', value: entity.schemaName });
            details.push({ label: 'Database', value: entity.database });
            details.push({ label: 'Server', value: entity.server.config.server_name || entity.server.id });
            
            const tableData = entity.server.schemas[entity.database]?.[entity.schemaName]?.[entity.tableName];
            if (tableData) {
                details.push({ label: 'Columns Count', value: tableData.columns?.length || 0 });
                if (entity.server.config.db_type === 'postgres') {
                    details.push({ label: 'RLS Enabled', value: tableData.has_rls ? 'Yes' : 'No' });
                }
            }
        }

        return (
            <div className="grid grid-cols-1 gap-4 mt-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
                {details.map((d, i) => (
                    <div key={i} className="flex flex-col border-b border-white/5 pb-2">
                        <span className="text-[10px] text-secondary font-bold uppercase tracking-wider">{d.label}</span>
                        <span className="text-textPrimary font-medium">{d.value}</span>
                    </div>
                ))}
            </div>
        );
    };

    const renderColumns = () => {
        if (entity.type !== 'table') return null;
        const tableData = entity.server.schemas[entity.database]?.[entity.schemaName]?.[entity.tableName];
        const columns = tableData?.columns || [];

        return (
            <div className="mt-2 flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar animate-in fade-in slide-in-from-bottom-2 duration-300">
                <table className="w-full text-left text-xs">
                    <thead>
                        <tr className="text-secondary border-b border-white/10 pb-2">
                            <th className="font-bold uppercase py-2">Column Name</th>
                        </tr>
                    </thead>
                    <tbody>
                        {columns.map((col, i) => (
                            <tr key={i} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                                <td className="py-2 text-textPrimary font-mono">{col}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    };

    const titleIcon = entity.type === 'database' ? '🗄️' : entity.type === 'schema' ? '📂' : '📊';
    const title = entity.type === 'database' ? entity.database : entity.type === 'schema' ? entity.schemaName : entity.tableName;

    return (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-md z-[9999] flex items-center justify-center p-4">
            <div className="bg-panel border border-primary/30 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col transition-all duration-300 scale-100">
                {/* Header */}
                <div className="p-6 pb-4 flex items-center justify-between border-b border-white/5 bg-gradient-to-r from-primary/5 to-transparent">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-2xl shadow-inner border border-primary/20">
                            {titleIcon}
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-textPrimary tracking-tight">{title}</h2>
                            <p className="text-xs text-secondary font-medium uppercase tracking-widest opacity-70">{entity.type} Properties</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-secondary hover:text-textPrimary hover:bg-white/10 transition-all cursor-pointer"
                    >
                        ✕
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-white/5 bg-white/2 px-6">
                    <button 
                        onClick={() => setActiveTab('general')}
                        className={`px-4 py-3 text-xs font-bold uppercase tracking-widest transition-all relative ${activeTab === 'general' ? 'text-primary' : 'text-secondary hover:text-textPrimary'}`}
                    >
                        General
                        {activeTab === 'general' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-full shadow-[0_0_8px_rgba(251,146,60,0.8)]"></div>}
                    </button>
                    {entity.type === 'table' && (
                        <button 
                            onClick={() => setActiveTab('columns')}
                            className={`px-4 py-3 text-xs font-bold uppercase tracking-widest transition-all relative ${activeTab === 'columns' ? 'text-primary' : 'text-secondary hover:text-textPrimary'}`}
                        >
                            Columns
                            {activeTab === 'columns' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-full shadow-[0_0_8px_rgba(251,146,60,0.8)]"></div>}
                        </button>
                    )}
                </div>

                {/* Content */}
                <div className="p-6 overflow-hidden flex-1 min-h-[250px]">
                    {activeTab === 'general' && renderGeneral()}
                    {activeTab === 'columns' && renderColumns()}
                </div>

                {/* Footer */}
                <div className="p-4 px-6 bg-white/2 border-t border-white/5 flex justify-end">
                    <button
                        onClick={onClose}
                        className="bg-primary text-background font-bold py-2 px-8 rounded-lg hover:brightness-110 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer shadow-lg shadow-primary/20"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
