import React, { ReactNode, CSSProperties } from 'react';
import { Card } from './Card';
import './TableContainer.css';

export interface TableContainerProps {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
}

export const TableContainer: React.FC<TableContainerProps> = ({ children, style, className }) => {
  return (
    <Card noPadding className={`table-container ${className || ''}`} style={{ overflow: 'visible', ...style }}>
      {children}
    </Card>
  );
};

export default TableContainer;
