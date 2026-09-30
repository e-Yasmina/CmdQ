import { useState, useEffect, useRef, useLayoutEffect } from 'react';

export default function ServerContextMenu({ x, y, onClose, onAction, server }) {
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
    }, [x, y, server]);

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
            className="fixed bg-panel border border-border rounded shadow-2xl py-1 z-[100] w-48 max-h-[calc(100vh-16px)] overflow-y-auto"
            style={{ top: coords.top, left: coords.left }}
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
