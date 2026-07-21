import { useState } from 'react';

const ChevronRight = ({ className }) => (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
);

function getColIcon(colName, colInfo, constraints) {
    const isPk = constraints?.some(c =>
        c.type === 'PRIMARY KEY' && c.definition?.toLowerCase().includes(colName.toLowerCase())
    );
    const isFk = constraints?.some(c =>
        c.type === 'FOREIGN KEY' && c.definition?.toLowerCase().includes(colName.toLowerCase())
    );
    const isNullable = colInfo?.nullable;

    if (isPk) return { icon: '🔑', color: 'text-yellow-400', title: 'Primary Key' };
    if (isFk) return { icon: '🔗', color: 'text-blue-400', title: 'Foreign Key' };
    if (isNullable === false) return { icon: '◆', color: 'text-gray-400', title: 'NOT NULL' };
    return { icon: '◇', color: 'text-gray-600', title: 'nullable' };
}

const SchemaAccordion = ({ schemaName, tables, onTableClick, onContextMenu, isSchemaProtected, getIsTableProtected }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [expandedTable, setExpandedTable] = useState(null);
    const tableNames = Object.keys(tables);

    const handleTableClick = (tableName) => {
        if (expandedTable === tableName) {
            setExpandedTable(null);
        } else {
            setExpandedTable(tableName);
        }
        if (onTableClick) onTableClick(schemaName, tableName);
    };

    return (
        <div className="mb-1">
            <li
                className="cursor-context-menu text-secondary transition-colors flex items-center font-bold py-1 select-none hover:text-primary group"
                onClick={() => setIsOpen(!isOpen)}
                onContextMenu={(e) => onContextMenu && onContextMenu(e, 'schema', schemaName)}
                title={schemaName}
            >
                <span className={`mr-1.5 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''} text-gray-500 group-hover:text-primary`}>
                    <ChevronRight className="w-3 h-3" />
                </span>
                <span className="mr-2 text-sm">
                    {isOpen ? '📂' : '📁'}
                </span>
                <span className="truncate flex-1 flex items-center gap-1">
                    {isSchemaProtected && <span className="text-red-500" title="Protected">🛡️</span>}
                    {schemaName}
                </span>
                <span className="ml-2 text-[10px] text-gray-400 bg-black/30 border border-border px-1.5 py-0.5 rounded-full font-code">
                    {tableNames.length}
                </span>
            </li>

            {isOpen && tableNames.length > 0 && (
                <ul className="ml-4 space-y-0 mt-1 mb-2 border-l border-border pl-2">
                    {tableNames.map(tableName => {
                        const tableData = tables[tableName] || {};
                        const cols = tableData.columns || [];
                        const colInfo = tableData.column_info || {};
                        const constraints = tableData.constraints || [];
                        const isExpanded = expandedTable === tableName;

                        return (
                            <li key={tableName}>
                                <div
                                    onClick={() => handleTableClick(tableName)}
                                    onContextMenu={(e) => onContextMenu && onContextMenu(e, 'table', schemaName, tableName)}
                                    className="cursor-context-menu hover:text-primary transition-colors flex items-center group text-textPrimary py-0.5"
                                >
                                    <span className={`mr-1.5 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''} text-gray-500 group-hover:text-primary`}>
                                        <ChevronRight className="w-3 h-3" />
                                    </span>
                                    <span className="mr-1.5 text-gray-500 group-hover:text-primary text-xs opacity-70">📄</span>
                                    <span className="truncate text-xs flex items-center gap-1" title={tableName}>
                                        {getIsTableProtected && getIsTableProtected(tableName) && <span className="text-red-500" title="Protected">🛡️</span>}
                                        {tableData.has_rls && <span className="text-cyan-400" title="Row Level Security Active">🔐</span>}
                                        {tableName}
                                    </span>
                                    <span className="ml-1.5 text-[9px] text-gray-500 opacity-60">{cols.length}</span>
                                </div>
                                {isExpanded && cols.length > 0 && (
                                    <ul className="ml-4 border-l border-border/50 pl-2 mt-0.5 mb-1">
                                        {cols.map(col => {
                                            const info = getColIcon(col, colInfo[col], constraints);
                                            return (
                                                <li key={col} className="text-[11px] py-px flex items-center gap-1.5 hover:bg-white/5 rounded px-1 group/col" title={info.title}>
                                                    <span className={`text-[8px] ${info.color} w-3 text-center flex-shrink-0`}>{info.icon}</span>
                                                    <span className="text-gray-400 group-hover/col:text-gray-200 truncate">{col}</span>
                                                    {colInfo[col]?.nullable === false && (
                                                        <span className="text-[8px] text-gray-600 ml-auto">NN</span>
                                                    )}
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}
                                {isExpanded && cols.length === 0 && (
                                    <div className="ml-4 text-[10px] text-gray-600 italic">No columns</div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}

            {isOpen && tableNames.length === 0 && (
                <div className="ml-4 mt-1 mb-2 text-xs text-gray-600 italic">
                    No tables inside
                </div>
            )}
        </div>
    );
};

export default SchemaAccordion;
