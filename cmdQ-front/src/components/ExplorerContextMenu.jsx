import { useState, useEffect, useRef } from 'react';

export default function ExplorerContextMenu({ x, y, onClose, onAction, entity }) {
    const menuRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    // common actions based on type
    // entity: { type: 'server'|'database'|'schema'|'table', server: obj, database: str, schemaName: str, tableName: str, isProtected: bool }
    
    let menuItems = [];

    if (entity.type === 'server') {
        menuItems = [
            { id: 'import', label: 'Import Database', icon: '📥' },
            { id: 'rename', label: 'Rename', icon: '✏️' },
            { id: 'disconnect', label: 'Disconnect', icon: '🔌' },
            { id: 'refresh', label: 'Refresh', icon: '🔄' },
            { id: 'properties', label: 'Properties', icon: '📋' },
            { id: 'reload', label: 'Reload', icon: '⚡' },
            { id: 'backup', label: 'Backup', icon: '💾' },
        ];
    } else if (entity.type === 'database') {
        menuItems = [
            { id: 'refresh', label: 'Refresh', icon: '🔄' },
            { id: 'export', label: 'Export', icon: '📤' },
            { id: 'restore', label: 'Restore', icon: '📥' },
            { id: 'delete', label: 'Delete', icon: '🗑️' },
            { id: 'properties', label: 'Properties', icon: '📋' }
        ];
    } else if (entity.type === 'schema') {
        menuItems = [
            { id: 'refresh', label: 'Refresh', icon: '🔄' },
            { id: 'export', label: 'Export', icon: '📤' },
            { id: 'properties', label: 'Properties', icon: '📋' }
        ];
    } else if (entity.type === 'table') {
        menuItems = [
            { id: 'refresh', label: 'Refresh', icon: '🔄' },
            { id: 'export', label: 'Export', icon: '📤' },
            { id: 'properties', label: 'Properties', icon: '📋' }
        ];
    }

    // Protection toggle
    menuItems.push({ 
        id: 'toggle_protect', 
        label: entity.isProtected ? 'Allow AI Access' : 'Forbid AI Access', 
        icon: entity.isProtected ? '🔓' : '🔒' 
    });

    let displayTitle = '';
    if (entity.type === 'server') displayTitle = entity.server.config.server_name || entity.server.id;
    if (entity.type === 'database') displayTitle = entity.database;
    if (entity.type === 'schema') displayTitle = entity.schemaName;
    if (entity.type === 'table') displayTitle = entity.tableName;

    return (
        <div
            ref={menuRef}
            className="fixed bg-panel border border-border rounded shadow-2xl py-1 z-[100] w-48"
            style={{ top: y, left: x }}
        >
            <div className="px-3 py-1.5 text-[10px] text-secondary font-bold uppercase border-b border-border/50 mb-1 flex items-center justify-between">
                <span className="truncate">{displayTitle}</span>
                {entity.isProtected && <span className="text-red-500" title="Protected from AI">🛡️</span>}
            </div>
            {menuItems.map(item => (
                <button
                    key={item.id}
                    className="w-full flex items-center gap-3 px-3 py-1.5 text-xs text-textPrimary hover:bg-primary hover:text-background transition-colors text-left"
                    onClick={(e) => {
                        e.stopPropagation();
                        onAction(item.id, entity);
                        onClose();
                    }}
                >
                    <span className="w-4">{item.icon}</span>
                    <span className={item.id === 'toggle_protect' && !entity.isProtected ? 'text-red-400' : ''}>
                        {item.label}
                    </span>
                </button>
            ))}
        </div>
    );
}
