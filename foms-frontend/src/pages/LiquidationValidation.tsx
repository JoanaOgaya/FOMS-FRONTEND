import React, { useState } from 'react';
import { DataTable } from '../components/DataTable';
import { TableContainer } from '../components/TableContainer';
import { Button } from '../components/Buttons';
import { StatusBadge } from '../components/shared/StatusBadge';
import { useToast } from '../components/ToastContext';
import { useAuth } from '../context/AuthContext';
import { RecordHistoryModal } from '../components/RecordHistoryModal';
import { CalendarPicker } from '../components/FormModals';
import { useQuery } from '../hooks/useQuery';
import { liquidationsService } from '../services/liquidationsService';
import { cashFlowService } from '../services/cashFlowService';
import { auditLogsService } from '../services/auditLogsService';
import type { Liquidation, LiquidationExpense } from '../types/entities';
import { formatCurrency, formatDate } from '../utils/format';
import '../components/FormModals.css';

export default function LiquidationValidation() {
  const { data: liqData, refetch } = useQuery('liquidations', () => liquidationsService.list({ pageSize: 100 }));
  const liquidations: Liquidation[] = liqData?.items || [];

  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedLiquidationId, setSelectedLiquidationId] = useState<string | null>(null);

  const [remarks, setRemarks] = useState('');
  const [reviewDecision, setReviewDecision] = useState('Validate Liquidation');
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<{ name: string; url: string; size: string } | null>(null);

  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const filteredLiquidations = liquidations.filter((row: Liquidation) => {
    const submittedDate = row.submittedAt || row.dateSubmitted || '';
    if (fromDate && new Date(submittedDate) < new Date(fromDate)) return false;
    if (toDate) {
      const t = new Date(toDate);
      t.setHours(23, 59, 59, 999);
      if (new Date(submittedDate) > t) return false;
    }
    return true;
  });

  const columns = [
    { key: 'reference', label: 'REFERENCE NO.', sortable: true },
    { key: 'submittedBy', label: 'SUBMITTED BY', sortable: true },
    {
      key: 'submittedAt',
      label: 'DATE SUBMITTED',
      sortable: true,
      render: (row: Liquidation) => formatDate(row.submittedAt)
    },
    {
      key: 'amount',
      label: 'AMOUNT',
      sortable: true,
      render: (row: Liquidation) => formatCurrency(row.amount)
    },
    {
      key: 'status',
      label: 'STATUS',
      render: (row: Liquidation) => <StatusBadge status={row.status} />
    }
  ];

  const actions = [
    {
      label: 'Review Liquidation',
      icon: 'ti-file-search',
      onClick: (row: Liquidation) => setSelectedLiquidationId(row.id)
    }
  ];

  const viewRecord = liquidations.find((l: Liquidation) => l.id === selectedLiquidationId);

  const handleLogDecision = () => {
    if (reviewDecision === 'Validate Liquidation') {
      handleValidate();
    } else {
      handleReject();
    }
  };

  const handleValidate = async () => {
    if (!viewRecord) return;

    try {
      await liquidationsService.update(viewRecord.id, { status: 'Validated', remarks: 'Successfully validated.' });

      await cashFlowService.create({
        sourceReference: `Liquidation Validated: ${viewRecord.id} - ${viewRecord.reference}`,
        type: 'Outflow',
        amount: viewRecord.amount,
        date: new Date().toISOString(),
        recordedBy: user?.fullName || 'System'
      });

      await auditLogsService.create({
        userId: user?.employeeId || 'System',
        userFullName: user?.fullName || 'System',
        userRole: user?.role || 'ASSISTANT_FM',
        action: 'VALIDATE_LIQUIDATION',
        module: 'Liquidation Validation',
        recordId: viewRecord.id,
        recordType: 'Liquidation',
        ipAddress: '127.0.0.1',
        details: 'Liquidation report completely validated against supporting documents.',
        timestamp: new Date().toISOString()
      });

      toast.success(`Liquidation ${viewRecord.id} successfully validated.`);
      setSelectedLiquidationId(null);
      refetch();
    } catch {
      toast.error('Failed to validate liquidation.');
    }
  };

  const handleReject = async () => {
    if (!viewRecord) return;
    if (!remarks.trim()) {
      toast.error('Please enter remarks for rejection.');
      return;
    }

    try {
      await liquidationsService.update(viewRecord.id, { status: 'Returned', remarks });

      await auditLogsService.create({
        userId: user?.employeeId || 'System',
        userFullName: user?.fullName || 'System',
        userRole: user?.role || 'ASSISTANT_FM',
        action: 'REJECT_LIQUIDATION',
        module: 'Liquidation Validation',
        recordId: viewRecord.id,
        recordType: 'Liquidation',
        ipAddress: '127.0.0.1',
        details: `Liquidation returned. Reason: ${remarks}`,
        timestamp: new Date().toISOString()
      });

      toast.error(`Liquidation ${viewRecord.id} returned for correction.`);
      setRemarks('');
      setSelectedLiquidationId(null);
      refetch();
    } catch {
      toast.error('Failed to return liquidation.');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {viewRecord && (
        <div className="modal-overlay" style={{ zIndex: 999 }}>
          <div className="modal-card" style={{ width: '800px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-hd">
              <h3 className="modal-hd-title">Liquidation Details</h3>
              <button className="modal-x-btn" onClick={() => setSelectedLiquidationId(null)}>&times;</button>
            </div>
            <div className="modal-bd" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                <h3 style={{ margin: 0, fontSize: '1.75rem', color: '#0F172A', fontWeight: 800 }}>{viewRecord.id}</h3>
                <StatusBadge status={viewRecord.status} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '32px' }}>
                <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', padding: '16px', background: '#fff' }}>
                  <div style={{ fontSize: '12px', color: '#64748B', marginBottom: '6px' }}>Operations / trip reference</div>
                  <div style={{ fontSize: '15px', color: '#0F172A', fontWeight: 700 }}>{viewRecord.reference}</div>
                </div>
                <div style={{ border: '1px solid #10B981', borderRadius: '8px', padding: '16px', background: '#F0FDF4' }}>
                  <div style={{ fontSize: '12px', color: '#047857', marginBottom: '6px' }}>Total computed amount</div>
                  <div style={{ fontSize: '18px', color: '#047857', fontWeight: 800 }}>{formatCurrency(viewRecord.amount)}</div>
                </div>
              </div>

              <div style={{ marginBottom: '32px' }}>
                <h4 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>Expense breakdown</h4>
                <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden', background: '#fff' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead style={{ background: '#F8FAFC' }}>
                      <tr>
                        <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 600, color: '#64748B', borderBottom: '1px solid #E2E8F0' }}>Type</th>
                        <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 600, color: '#64748B', borderBottom: '1px solid #E2E8F0', textAlign: 'right' }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(viewRecord.expenses || []).map((exp: LiquidationExpense, idx: number) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #E2E8F0' }}>
                          <td style={{ padding: '16px', verticalAlign: 'top' }}>
                            <div style={{ fontSize: '14px', color: '#0F172A', fontWeight: 700, marginBottom: '4px' }}>{exp.type}</div>
                            <div style={{ fontSize: '13px', color: '#64748B' }}>{exp.description}</div>
                          </td>
                          <td style={{ padding: '16px', fontSize: '14px', color: '#0F172A', fontWeight: 700, textAlign: 'right', verticalAlign: 'top' }}>
                            {formatCurrency(exp.amount)}
                          </td>
                        </tr>
                      ))}
                      <tr style={{ background: '#F8FAFC' }}>
                        <td style={{ padding: '16px', fontSize: '14px', color: '#0F172A', fontWeight: 800 }}>Total</td>
                        <td style={{ padding: '16px', fontSize: '15px', color: '#10B981', fontWeight: 800, textAlign: 'right' }}>
                          {formatCurrency(viewRecord.amount)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={{ marginBottom: '40px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>Supporting documents</h4>
                  <span style={{ fontSize: '13px', color: '#64748B', fontWeight: 600 }}>{(viewRecord.documents || []).length} files</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {(viewRecord.documents || []).map((doc: { name: string; url: string; size: string }, idx: number) => (
                    <div key={idx} style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{ width: '40px', height: '40px', borderRadius: '6px', background: '#F1F5F9', border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <i className="ti ti-file-text" style={{ color: '#64748B', fontSize: '20px' }} />
                        </div>
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>{doc.name}</div>
                          <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>{doc.size}</div>
                        </div>
                      </div>
                      <button
                        onClick={() => setSelectedDoc(doc)}
                        style={{ padding: '6px 16px', background: '#fff', border: '1px solid #E2E8F0', borderRadius: '6px', fontSize: '13px', fontWeight: 700, color: '#0F172A', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                      >
                        <i className="ti ti-eye" /> View
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {viewRecord.remarks && viewRecord.status !== 'Pending Validation' && (
                <div style={{ marginBottom: '32px', padding: '16px', background: '#F1F5F9', borderLeft: '4px solid #64748B', borderRadius: '4px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', textTransform: 'uppercase', marginBottom: '6px' }}>Previous Remarks</span>
                  <span style={{ fontSize: '14px', color: '#1E293B' }}>{viewRecord.remarks}</span>
                </div>
              )}

              {selectedDoc && (
                <div className="modal-overlay" style={{ zIndex: 1000 }}>
                  <div className="modal-card" style={{ width: '500px' }}>
                    <div className="modal-hd">
                      <h3 className="modal-hd-title">View Document: {selectedDoc.name}</h3>
                      <button className="modal-x-btn" onClick={() => setSelectedDoc(null)}>&times;</button>
                    </div>
                    <div className="modal-bd" style={{ textAlign: 'center', padding: '32px 24px' }}>
                      <i className="ti ti-file-text" style={{ fontSize: '48px', color: '#94A3B8', marginBottom: '16px', display: 'block' }} />
                      <p style={{ color: '#475569', fontSize: '14px', marginBottom: '24px' }}>
                        Previewing <strong>{selectedDoc.name}</strong> ({selectedDoc.size}).
                      </p>
                      <Button title="Download Document" variant="secondary" icon="ti-download" onClick={() => toast.success(`Downloading ${selectedDoc.name}...`)} />
                    </div>
                  </div>
                </div>
              )}

              {viewRecord.status === 'Pending Validation' ? (
                <div style={{ marginTop: '8px', borderTop: '1px solid #E2E8F0', paddingTop: '24px' }}>
                  <div className="tf-group state-default" style={{ marginBottom: '20px' }}>
                    <label className="tf-label" style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>Review decision</label>
                    <div className="tf-wrapper">
                      <select
                        className="tf-input"
                        value={reviewDecision}
                        onChange={(e) => setReviewDecision(e.target.value)}
                        style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A', padding: '10px 14px' }}
                      >
                        <option value="Validate Liquidation">Validate liquidation</option>
                        <option value="Return for Correction">Return for correction</option>
                      </select>
                    </div>
                  </div>

                  <div className="tf-group state-default" style={{ marginBottom: '32px' }}>
                    <label className="tf-label" style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>Remarks / validation notes (optional)</label>
                    <div className="tf-wrapper tf-textarea-wrapper">
                      <textarea
                        className="tf-textarea"
                        value={remarks}
                        onChange={e => setRemarks(e.target.value)}
                        placeholder="Optional validation steps or extra context..."
                        style={{ padding: '12px 14px', fontSize: '14px', minHeight: '80px' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                    <button
                      onClick={() => setSelectedLiquidationId(null)}
                      style={{ padding: '10px 24px', background: '#fff', color: '#0F172A', border: '1px solid #E2E8F0', borderRadius: '6px', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleLogDecision}
                      style={{ padding: '10px 24px', background: '#14B8A6', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}
                    >
                      Log decision
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px', borderTop: '1px solid #E2E8F0', paddingTop: '24px' }}>
                  <Button title="Close" variant="secondary" onClick={() => setSelectedLiquidationId(null)} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <RecordHistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        recordId={viewRecord?.id || ''}
        recordType="Liquidation"
      />
      <TableContainer>
        <DataTable
          title="Liquidation Validation Queue"
          data={filteredLiquidations}
          columns={columns}
          actions={actions}
          rowKey="id"
          searchPlaceholder="Search liquidations..."
          searchFields={['id', 'reference', 'submittedBy']}
          defaultPageSize={10}
          filters={[
            {
              key: 'status',
              label: 'All Statuses',
              options: [
                { label: 'Pending Validation', value: 'Pending Validation' },
                { label: 'Validated', value: 'Validated' },
                { label: 'Returned', value: 'Returned' }
              ],
              filterFn: (row: Liquidation, value: string) => row.status === value
            }
          ]}
          customFilters={
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '13px', color: '#64748B', fontWeight: 600 }}>From:</span>
                <div style={{ width: '140px' }}>
                  <CalendarPicker 
                    label=""
                    value={fromDate} 
                    onChange={setFromDate} 
                    placeholder="Start date..." 
                    variant="filter"
                  />
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '13px', color: '#64748B', fontWeight: 600 }}>To:</span>
                <div style={{ width: '140px' }}>
                  <CalendarPicker 
                    label=""
                    value={toDate} 
                    onChange={setToDate} 
                    placeholder="End date..." 
                    variant="filter"
                    minDate={fromDate}
                  />
                </div>
              </div>
            </div>
          }
        />
      </TableContainer>
    </div>
  );
}
