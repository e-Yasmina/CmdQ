import { useState } from 'react';

const SchemaAccordion = ({ schemaName, tables }) => {
    const [isOpen, setIsOpen] = useState(false);
    const tableNames = Object.keys(tables);

    return (
        <div className="mb-1">
            <li
                className="cursor-pointer text-secondary transition-colors flex items-center font-bold py-1 select-none hover:text-primary group"
                onClick={() => setIsOpen(!isOpen)}
                title={schemaName}
            >
                <span className="mr-2 text-sm transition-transform duration-200">
                    {isOpen ? '📂' : '📁'}
                </span>
                <span className="truncate flex-1">{schemaName}</span>
                <span className="ml-2 text-[10px] text-gray-400 bg-black/30 border border-border px-1.5 py-0.5 rounded-full font-code">
                    {tableNames.length}
                </span>
            </li>

            {isOpen && tableNames.length > 0 && (
                <ul className="ml-4 space-y-1 mt-1 mb-2 border-l border-border pl-2">
                    {tableNames.map(tableName => (
                        <li key={tableName} className="cursor-pointer hover:text-primary transition-colors flex items-center group text-textPrimary py-0.5">
                            <span className="mr-2 text-gray-500 group-hover:text-primary text-xs opacity-70">📄</span>
                            <span className="truncate text-xs" title={tableName}>{tableName}</span>
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
