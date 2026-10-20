import React, { useMemo } from 'react';
import { DataTable } from './DataTable';
import { useQuery } from '../hooks/useQuery';
import { auditLogsService } from '../services/auditLogsService';
import type { AuditLog } from '../types/entities';
import './FormModals.css';

interface RecordHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  recordId: string;
  recordType?: string;
  title?: string;
}

export const RecordHistoryModal: React.FC<RecordHistoryModalProps> = ({
  isOpen,
  onClose,
  recordId,
  recordType,
  title
}) => {
  const { data } = useQuery(`auditLogs:${recordId}`, () => auditLogsService.list({ pageSize: 100 }), { enabled: isOpen });
  const auditLogs = data?.items || [];

  // Filter logs for this specific record. We can loosely match recordId.
  const historyLogs = useMemo(() => {
    return auditLogs
      .filter(log => log.recordId === recordId || (recordType && log.recordType === recordType && log.details.includes(recordId)))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [auditLogs, recordId, recordType]);

  const columns = [
    { 
      key: 'timestamp', 
      label: 'DATE & TIME', 
      render: (row: AuditLog) => new Date(row.timestamp).toLocaleString('en-PH', { 
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
      }) 
    },
    { 
      key: 'userFullName', 
      label: 'USER / ROLE',
      render: (row: AuditLog) => (
        <div>
          <span style={{ fontWeight: 600, color: '#0F172A', display: 'block' }}>{row.userFullName}</span>
          <span style={{ fontSize: '0.75rem', color: '#64748B' }}>{row.userRole}</span>
        </div>
      )
    },
    { 
      key: 'action', 
      label: 'ACTION',
      render: (row: AuditLog) => (
        <span style={{ fontWeight: 600, color: '#0F172A' }}>{row.action.replace(/_/g, ' ')}</span>
      )
    },
    { key: 'details', label: 'DETAILS' },
  ];

  if (!isOpen) return null;

  return (
    <div className="tf-modal-overlay">
      <div className="tf-modal-container" style={{ maxWidth: '800px', width: '90%' }}>
        <div className="tf-modal-header">
          <h2 className="tf-modal-title">{title || `Change History for ${recordId}`}</h2>
          <button className="tf-modal-close" onClick={onClose}>
            <i className="ti ti-x"></i>
          </button>
        </div>
        
        <div className="tf-modal-content" style={{ padding: '0', borderTop: '1px solid #E2E8F0' }}>
          <div style={{ padding: '24px' }}>
            {historyLogs.length > 0 ? (
              <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden' }}>
                <DataTable
                  data={historyLogs}
                  columns={columns}
                  rowKey="id"
                  searchPlaceholder="Search history..."
                  searchFields={['action', 'details', 'userFullName', 'userRole']}
                  defaultPageSize={10}
                />
              </div>
            ) : (
              <div style={{ padding: '40px 20px', textAlign: 'center', background: '#F8FAFC', borderRadius: '8px', border: '1px dashed #CBD5E1' }}>
                <i className="ti ti-history" style={{ fontSize: '2rem', color: '#94A3B8', marginBottom: '8px' }}></i>
                <h3 style={{ margin: '0 0 4px', fontSize: '1rem', color: '#334155' }}>No History Found</h3>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748B' }}>
                  There are no recorded changes for this record yet.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
