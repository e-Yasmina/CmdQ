import { useState, useEffect, useRef } from 'react';

export default function ServerContextMenu({ x, y, onClose, onAction, server }) {
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

    const menuItems = [
        { id: 'rename', label: 'Rename', icon: '✏️' },
        { id: 'disconnect', label: 'Disconnect', icon: '🔌' },
        { id: 'refresh', label: 'Refresh', icon: '🔄' },
        { id: 'properties', label: 'Properties', icon: '📋' },
        { id: 'reload', label: 'Reload', icon: '⚡' },
        { id: 'backup', label: 'Backup', icon: '💾' },
    ];

    return (
        <div
            ref={menuRef}
            className="fixed bg-panel border border-border rounded shadow-2xl py-1 z-[100] w-48"
            style={{ top: y, left: x }}
        >
            <div className="px-3 py-1.5 text-[10px] text-secondary font-bold uppercase border-b border-border/50 mb-1">
                {server.config.server_name || server.id}
            </div>
            {menuItems.map(item => (
                <button
                    key={item.id}
                    className="w-full flex items-center gap-3 px-3 py-1.5 text-xs text-textPrimary hover:bg-primary hover:text-background transition-colors text-left"
                    onClick={() => {
                        onAction(item.id, server);
                        onClose();
                    }}
                >
                    <span className="w-4">{item.icon}</span>
                    {item.label}
                </button>
            ))}
        </div>
    );
}
