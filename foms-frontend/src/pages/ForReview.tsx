import React, { useState, useEffect } from 'react';
import DataTable from '../components/DataTable';
import { useAuth } from '../context/AuthContext';
import { http } from '../services/apiClient';
import { ManualReviewQueue } from './ManualReviewQueue';

interface ReviewRecord {
  id: string;
  timestamp: string;
  invoiceNumber: string;
  clientName: string;
  balance: string;
  decision: string;
  loggedBy: string;
  loggedByRole: string;
  actionTaken: string;
  remarks: string;
}

const truncate = (str: string, n: number) => (str && str.length > n) ? str.slice(0, n) + '...' : str;

const ForReview: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'DUPLICATES' | 'COLLECTIONS'>('DUPLICATES');
  const [selectedRecord, setSelectedRecord] = useState<ReviewRecord | null>(null);
  const [data, setData] = useState<ReviewRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const json: any = await http.get('/ai/collection/recommendations', { status: 'all' });
      const rawList = Array.isArray(json) ? json : (json?.items || []);
      const logged = rawList.filter((r: any) => r.review_status && r.review_status !== 'Pending Review');
      const mapped = logged.map((r: any) => ({
        id: String(r.id),
        timestamp: r.reviewed_at ? new Date(r.reviewed_at).toLocaleString() : 'N/A',
        invoiceNumber: r.priority?.normalized_invoice_number || r.priority?.invoice_number || 'N/A',
        clientName: r.priority?.client_name || 'N/A',
        balance: `₱${(r.priority?.outstanding_balance || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
        decision: r.review_status || 'Pending',
        loggedBy: r.reviewed_by || r.reviewer_username || 'System',
        loggedByRole: r.reviewer_role || 'Finance Manager',
        actionTaken: r.remarks || 'No action taken',
        remarks: r.recommended_action || 'No remarks',
      }));
      setData(mapped);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const totalDecisions = data.length;
  const acceptedDecisions = data.filter(d => String(d.decision).toLowerCase().includes('accept') || String(d.decision).toLowerCase().includes('processing')).length;
  const closedDecisions = data.filter(d => String(d.decision).toLowerCase().includes('reviewed') || String(d.decision).toLowerCase().includes('closed')).length;
  const rejectedDecisions = data.filter(d => String(d.decision).toLowerCase().includes('reject')).length;

  // KPIs
  const kpis = [
    { label: 'TOTAL LOGGED DECISIONS', value: String(totalDecisions), icon: 'ti-clipboard-check', iconColor: '#0D9488', iconBg: '#F0FDFA' },
    { label: 'ACCEPTED RECOMMENDATIONS', value: String(acceptedDecisions), icon: 'ti-circle-check', iconColor: '#059669', iconBg: '#ECFDF5' },
    { label: 'REVIEWED & CLOSED', value: String(closedDecisions), icon: 'ti-history', iconColor: '#0284C7', iconBg: '#E0F2FE' },
    { label: 'REJECTED ASSIGNMENT', value: String(rejectedDecisions), icon: 'ti-circle-x', iconColor: '#DC2626', iconBg: '#FEF2F2' },
  ];

  const columns = [
    {
      label: 'Log Date & Time',
      key: 'timestamp',
      render: (row: ReviewRecord) => <span style={{ fontSize: '0.85rem', color: '#475569' }}>{row.timestamp}</span>
    },
    {
      label: 'Invoice Number',
      key: 'invoiceNumber',
      render: (row: ReviewRecord) => <span style={{ fontWeight: 700, color: '#0F172A', fontSize: '0.85rem' }}>{row.invoiceNumber}</span>
    },
    {
      label: 'Client Name (FOMS)',
      key: 'clientName',
      render: (row: ReviewRecord) => <span style={{ color: '#475569', fontSize: '0.85rem' }}>{row.clientName}</span>
    },
    {
      label: 'Outstanding Balance',
      key: 'balance',
      render: (row: ReviewRecord) => <span style={{ fontWeight: 700, color: '#0F172A', fontSize: '0.85rem' }}>{row.balance}</span>
    },
    {
      label: 'Logged Decision',
      key: 'decision',
      render: (row: ReviewRecord) => (
        <span style={{ 
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          padding: '4px 10px', borderRadius: '999px',
          fontSize: '0.75rem', fontWeight: 700,
          background: '#FFF7ED', color: '#EA580C', border: '1px solid #FFEDD5'
        }}>
          <i className="ti ti-loader" />
          {row.decision}
        </span>
      )
    },
    {
      label: 'Logged By',
      key: 'loggedBy',
      render: (row: ReviewRecord) => (
        <div style={{ lineHeight: 1.2 }}>
          <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#0F172A', maxWidth: 120 }}>{row.loggedBy}</div>
          <div style={{ fontSize: '0.7rem', color: '#94A3B8', marginTop: 2 }}>{row.loggedByRole}</div>
        </div>
      )
    },
    {
      label: 'Action Taken & Remarks',
      key: 'actionTaken',
      render: (row: ReviewRecord) => (
        <div style={{ lineHeight: 1.4 }}>
          <div style={{ fontWeight: 700, fontSize: '0.8rem', color: '#0F172A' }}>
            Action Taken: {truncate(row.actionTaken, 20)}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
            Notes: {truncate(row.remarks, 20)}
          </div>
        </div>
      )
    },
    {
      label: 'Actions',
      key: 'actions',
      render: (row: ReviewRecord) => (
        <button 
          onClick={() => setSelectedRecord(row)}
          style={{ 
            background: '#F1F5F9', border: 'none', borderRadius: '8px', 
            width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', 
            cursor: 'pointer', color: '#64748B'
          }}
        >
          <i className="ti ti-dots-vertical" />
        </button>
      )
    }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Top Tab Switcher */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #E2E8F0', paddingBottom: '12px' }}>
        <button
          type="button"
          onClick={() => setActiveTab('DUPLICATES')}
          style={{
            padding: '8px 18px',
            borderRadius: '8px',
            border: 'none',
            fontSize: '0.85rem',
            fontWeight: 700,
            cursor: 'pointer',
            background: activeTab === 'DUPLICATES' ? '#0D9488' : '#F1F5F9',
            color: activeTab === 'DUPLICATES' ? '#FFFFFF' : '#475569',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <i className="ti ti-scan" />
          Duplicate Detection Manual Review Queue
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('COLLECTIONS')}
          style={{
            padding: '8px 18px',
            borderRadius: '8px',
            border: 'none',
            fontSize: '0.85rem',
            fontWeight: 700,
            cursor: 'pointer',
            background: activeTab === 'COLLECTIONS' ? '#0D9488' : '#F1F5F9',
            color: activeTab === 'COLLECTIONS' ? '#FFFFFF' : '#475569',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <i className="ti ti-report-money" />
          Collection Decision Audit Log
        </button>
      </div>

      {activeTab === 'DUPLICATES' ? (
        <ManualReviewQueue />
      ) : (
        <>
          {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20 }}>
        {kpis.map((kpi, i) => (
          <div key={i} style={{ background: '#fff', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '24px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {kpi.label}
              </div>
              <div style={{ width: 32, height: 32, borderRadius: '8px', background: kpi.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <i className={`ti ${kpi.icon}`} style={{ fontSize: '18px', color: kpi.iconColor }} />
              </div>
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#0F172A', lineHeight: 1 }}>
              {kpi.value}
            </div>
          </div>
        ))}
      </div>

      {/* Main Table Area */}
      <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
        <DataTable 
          title="Logged Decisions Audit Log"
          data={data}
          columns={columns}
          rowKey="id"
          selectable={false}
          exportable={false}
          searchPlaceholder="Search..."
          createButtons={[
            { label: 'Export CSV', icon: 'ti-download', onClick: () => {}, variant: 'secondary' },
            { label: 'Export Formal PDF', icon: 'ti-file-text', onClick: () => {}, variant: 'primary' },
            { label: 'Refresh Log', icon: 'ti-refresh', onClick: fetchData, variant: 'primary' }
          ]}
        />
      </div>

      {/* Detail Modal */}
      {selectedRecord && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={() => setSelectedRecord(null)}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 560, boxShadow: '0 20px 60px rgba(0,0,0,0.18)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid #E2E8F0' }}>
              <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 800, color: '#0F172A' }}>Decision Log Record #{selectedRecord.id}</h3>
              <button onClick={() => setSelectedRecord(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94A3B8' }}>
                <i className="ti ti-x" style={{ fontSize: 20 }} />
              </button>
            </div>
            
            <div style={{ padding: '24px', overflowY: 'auto' }}>
              {/* Account Box */}
              <div style={{ border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px', marginBottom: 20 }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                  Official FOMS Account
                </div>
                <div style={{ fontSize: '1.125rem', fontWeight: 800, color: '#0F172A', marginBottom: 16 }}>
                  {selectedRecord.clientName} (Client ID: {selectedRecord.clientName})
                </div>
                <div style={{ display: 'flex', gap: 40 }}>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#64748B', marginBottom: 4 }}>Invoice Number</div>
                    <div style={{ fontWeight: 700, color: '#0F172A' }}>{selectedRecord.invoiceNumber}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#64748B', marginBottom: 4 }}>Outstanding Balance</div>
                    <div style={{ fontWeight: 700, color: '#0F172A' }}>{selectedRecord.balance}</div>
                  </div>
                </div>
              </div>

              {/* Audit Trail Box */}
              <div style={{ border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px', marginBottom: 20 }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
                  Human Audit Trail
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.875rem' }}>
                  <div><strong style={{ color: '#0F172A' }}>Review Decision:</strong> <span style={{ color: '#475569' }}>Accepted as Recommendation</span></div>
                  <div><strong style={{ color: '#0F172A' }}>Logged By:</strong> <span style={{ color: '#475569' }}>{selectedRecord.loggedBy} ({selectedRecord.loggedByRole})</span></div>
                  <div><strong style={{ color: '#0F172A' }}>Timestamp:</strong> <span style={{ color: '#475569' }}>{selectedRecord.timestamp}</span></div>
                </div>
                <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '8px', marginTop: 12, border: '1px solid #E2E8F0', fontSize: '0.85rem' }}>
                  <strong style={{ color: '#0F172A' }}>Action Taken:</strong> <span style={{ color: '#475569' }}>{selectedRecord.actionTaken}</span>
                  <span style={{ color: '#CBD5E1', margin: '0 8px' }}>|</span>
                  <strong style={{ color: '#0F172A' }}>Notes:</strong> <span style={{ color: '#475569' }}>{selectedRecord.remarks}</span>
                </div>
              </div>

              {/* Finance Review Section */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
                  <i className="ti ti-circle-check" style={{ fontSize: 16 }} /> Finance Review
                </div>
                <div style={{ marginBottom: 8, fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>Review Decision</div>
                <div style={{ position: 'relative', marginBottom: 16 }}>
                  <select style={{ width: '100%', appearance: 'none', padding: '12px 16px', border: '1px solid #CBD5E1', borderRadius: '8px', fontSize: '0.95rem', color: '#0F172A', outline: 'none' }}>
                    <option>Accept Recommendation</option>
                    <option>Reviewed & Closed</option>
                    <option>Reject Priority Assignment</option>
                  </select>
                  <i className="ti ti-chevron-down" style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', color: '#64748B', pointerEvents: 'none' }} />
                </div>
                
                <div style={{ marginBottom: 8, fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>Action Taken <span style={{ color: '#EF4444' }}>*</span></div>
                <div style={{ marginBottom: 16 }}>
                  <input type="text" placeholder="e.g. Sent payment reminder" style={{ width: '100%', padding: '12px 16px', border: '1px solid #CBD5E1', borderRadius: '8px', fontSize: '0.95rem', color: '#0F172A', outline: 'none' }} />
                </div>

                <div style={{ marginBottom: 8, fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>Remarks / Validation Notes (Optional)</div>
                <div>
                  <textarea placeholder="Optional validation steps or extra context..." rows={3} style={{ width: '100%', padding: '12px 16px', border: '1px solid #CBD5E1', borderRadius: '8px', fontSize: '0.95rem', color: '#0F172A', outline: 'none', resize: 'vertical' }} />
                </div>
              </div>
            </div>

            <div style={{ padding: '16px 24px', borderTop: '1px solid #E2E8F0', display: 'flex', gap: 12 }}>
              <button onClick={() => setSelectedRecord(null)} style={{ flex: 1, padding: '12px', background: '#fff', border: '1px solid #CBD5E1', borderRadius: '8px', fontWeight: 700, color: '#475569', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={() => setSelectedRecord(null)} style={{ flex: 1, padding: '12px', background: '#4ADE80', border: 'none', borderRadius: '8px', fontWeight: 700, color: '#fff', cursor: 'pointer' }}>
                Log Decision
              </button>
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
};

export default ForReview;
