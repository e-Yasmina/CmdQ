import React from 'react';

const ScrollArea = ({ children, className = '', ...props }) => {
    return (
        <div className={`custom-scrollbar ${className}`} {...props}>
            {children}
        </div>
    );
};

export default ScrollArea;
