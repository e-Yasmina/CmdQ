import { useState } from 'react';

const ChevronRight = ({ className }) => (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
);

const SchemaAccordion = ({ schemaName, tables, onTableClick, onContextMenu, isSchemaProtected, getIsTableProtected }) => {
    const [isOpen, setIsOpen] = useState(false);
    const tableNames = Object.keys(tables);

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
                <ul className="ml-4 space-y-1 mt-1 mb-2 border-l border-border pl-2">
                    {tableNames.map(tableName => (
                        <li key={tableName}
                            onClick={() => onTableClick && onTableClick(schemaName, tableName)}
                            onContextMenu={(e) => onContextMenu && onContextMenu(e, 'table', schemaName, tableName)}
                            className="cursor-context-menu hover:text-primary transition-colors flex items-center group text-textPrimary py-0.5"
                        >
                            <span className="mr-2 text-gray-500 group-hover:text-primary text-xs opacity-70">📄</span>
                            <span className="truncate text-xs flex items-center gap-1" title={tableName}>
                                {getIsTableProtected && getIsTableProtected(tableName) && <span className="text-red-500" title="Protected">🛡️</span>}
                                {tables[tableName]?.has_rls && <span className="text-cyan-400" title="ERLS / Row Level Security Active">🔐</span>}
                                {tableName}
                            </span>
                        </li>
                    ))}
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
