import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  noPadding?: boolean;
}

export const Card: React.FC<CardProps> = ({ children, noPadding = false, style, className, ...props }) => {
  return (
    <div
      className={`foms-card ${className || ''}`}
      style={{
        background: '#fff',
        borderRadius: 12,
        padding: noPadding ? 0 : 24,
        border: '1px solid #E2E8F0',
        boxShadow: '0 1px 3px rgba(15,23,42,.02)',
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
};
