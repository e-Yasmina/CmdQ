import { useState, useEffect, useRef, useLayoutEffect } from 'react';

export default function ExplorerContextMenu({ x, y, onClose, onAction, entity }) {
    const menuRef = useRef(null);
    const [coords, setCoords] = useState({ top: y, left: x });

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    useLayoutEffect(() => {
        if (menuRef.current) {
            const rect = menuRef.current.getBoundingClientRect();
            const padding = 8;
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;

            let adjustedX = x;
            let adjustedY = y;

            if (adjustedY + rect.height > viewportHeight - padding) {
                adjustedY = Math.max(padding, viewportHeight - rect.height - padding);
            }
            if (adjustedX + rect.width > viewportWidth - padding) {
                adjustedX = Math.max(padding, viewportWidth - rect.width - padding);
            }

            setCoords({
                top: Math.max(padding, adjustedY),
                left: Math.max(padding, adjustedX),
            });
        }
    }, [x, y, entity]);

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
            { id: 'copy', label: 'Copy Database', icon: '📋' },
        ];
    } else if (entity.type === 'database') {
        menuItems = [
            { id: 'generate_graph', label: 'Entity Graph', icon: '🔀' },
            { id: 'refresh', label: 'Refresh', icon: '🔄' },
            { id: 'export', label: 'Export', icon: '📤' },
            { id: 'restore', label: 'Restore', icon: '📥' },
            { id: 'copy', label: 'Copy', icon: '📋' },
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

    // Protection items
    const WRITE_OPS = [
        { key: 'insert', label: 'INSERT', icon: '➕' },
        { key: 'update', label: 'UPDATE', icon: '✏️' },
        { key: 'delete', label: 'DELETE', icon: '🗑️' },
    ];

    const currentLevel = entity.protectionLevel || (entity.isProtected ? 'full' : null);
    const currentPerms = entity.writePermissions || [];

    let displayTitle = '';
    if (entity.type === 'server') displayTitle = entity.server.config.server_name || entity.server.id;
    if (entity.type === 'database') displayTitle = entity.database;
    if (entity.type === 'schema') displayTitle = entity.schemaName;
    if (entity.type === 'table') displayTitle = entity.tableName;

    const handleProtectionAction = (action) => {
        onAction(action, entity);
        onClose();
    };

    const handleWritePermToggle = (op) => {
        onAction('set_write_permissions', { ...entity, toggleOp: op });
        onClose();
    };

    return (
        <div
            ref={menuRef}
            className="fixed bg-panel border border-border rounded shadow-2xl py-1 z-[100] w-56 max-h-[calc(100vh-16px)] overflow-y-auto"
            style={{ top: coords.top, left: coords.left }}
        >
            <div className="px-3 py-1.5 text-[10px] text-secondary font-bold uppercase border-b border-border/50 mb-1 flex items-center justify-between">
                <span className="truncate">{displayTitle}</span>
                {entity.isProtected && <span className="text-red-500" title={`Protected (${currentLevel})`}>🛡️</span>}
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
                    <span>{item.label}</span>
                </button>
            ))}

            {/* Separator */}
            <div className="border-t border-border/50 my-1" />

            {/* Protection section */}
            <div className="px-3 py-1.5 text-[10px] text-secondary font-bold uppercase">
                AI Protection
            </div>

            {/* Quick presets */}
            <button
                className="w-full flex items-center gap-3 px-3 py-1.5 text-xs text-textPrimary hover:bg-primary hover:text-background transition-colors text-left"
                onClick={(e) => { e.stopPropagation(); handleProtectionAction('protect_full'); }}
            >
                <span className="w-4">{currentLevel === 'full' ? '●' : '○'}</span>
                <span>🛡️ Hidden from AI</span>
            </button>
            <button
                className="w-full flex items-center gap-3 px-3 py-1.5 text-xs text-textPrimary hover:bg-primary hover:text-background transition-colors text-left"
                onClick={(e) => { e.stopPropagation(); handleProtectionAction('protect_readonly'); }}
            >
                <span className="w-4">{currentLevel === 'readonly' ? '●' : '○'}</span>
                <span>👁️ Read-Only</span>
            </button>

            {/* Custom permissions with checkboxes */}
            {currentLevel === 'custom' && (
                <div className="px-3 py-1">
                    <div className="text-[10px] text-secondary mb-1">Allowed writes:</div>
                    {WRITE_OPS.map(op => (
                        <label
                            key={op.key}
                            className="flex items-center gap-2 px-1 py-0.5 text-xs text-textPrimary hover:bg-white/5 rounded cursor-pointer"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <input
                                type="checkbox"
                                checked={currentPerms.includes(op.key)}
                                onChange={() => handleWritePermToggle(op.key)}
                                className="w-3 h-3 accent-primary"
                            />
                            <span>{op.icon} {op.label}</span>
                        </label>
                    ))}
                </div>
            )}
            {currentLevel !== 'custom' && (
                <button
                    className="w-full flex items-center gap-3 px-3 py-1.5 text-xs text-textPrimary hover:bg-primary hover:text-background transition-colors text-left"
                    onClick={(e) => { e.stopPropagation(); handleProtectionAction('protect_custom_all'); }}
                >
                    <span className="w-4">○</span>
                    <span>⚙️ Custom Permissions...</span>
                </button>
            )}

            {entity.isProtected && (
                <>
                    <div className="border-t border-border/50 my-1" />
                    <button
                        className="w-full flex items-center gap-3 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500 hover:text-white transition-colors text-left"
                        onClick={(e) => { e.stopPropagation(); handleProtectionAction('protect_remove'); }}
                    >
                        <span className="w-4">🔓</span>
                        <span>Remove Protection</span>
                    </button>
                </>
            )}
        </div>
    );
}
