import React, { useState } from 'react';
import { useQuery } from '../hooks/useQuery';
import { useToast } from '../components/ToastContext';
import { useAuth } from '../context/AuthContext';
import { TableContainer } from '../components/TableContainer';
import { Button } from '../components/Buttons';
import { StatusBadge } from '../components/shared/StatusBadge';
import {
  integrationService,
  CashAdvanceItem,
  DmsLiquidationDto,
} from '../services/integrationService';
import { liquidationsService } from '../services/liquidationsService';
import { formatCurrency, formatDate } from '../utils/format';
import type { Liquidation } from '../types/entities';

export const CashAdvanceLiquidationPortal: React.FC = () => {
  const { toast } = useToast();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<'advances' | 'liquidations'>('advances');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch Cash Advances
  const {
    data: cashAdvances = [],
    isLoading: loadingAdvances,
    refetch: refetchAdvances,
  } = useQuery('cashAdvances', () => integrationService.getCashAdvances());

  // Fetch Liquidations
  const {
    data: liqData,
    isLoading: loadingLiquidations,
    refetch: refetchLiquidations,
  } = useQuery('liquidations', () => liquidationsService.list({ pageSize: 100 }));

  const liquidations: Liquidation[] = liqData?.items || [];

  // Modals & form state
  const [showAdvanceModal, setShowAdvanceModal] = useState(false);
  const [showDisburseModal, setShowDisburseModal] = useState(false);
  const [selectedAdvance, setSelectedAdvance] = useState<CashAdvanceItem | null>(null);
  const [showLiquidationModal, setShowLiquidationModal] = useState(false);
  const [selectedLiquidation, setSelectedLiquidation] = useState<Liquidation | null>(null);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Disbursement Form
  const [disbursementMethod, setDisbursementMethod] = useState('Petty Cash Voucher (PCV)');
  const [voucherNumber, setVoucherNumber] = useState(`PCV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`);
  const [disbursedBy, setDisbursedBy] = useState(user?.fullName || 'Finance Cashier');

  // New Advance Request Form (simulation of Ops DMS creation)
  const [advanceForm, setAdvanceForm] = useState({
    courierName: 'Danilo Reyes',
    tripReference: `TRIP-NORTH-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
    amountGiven: 3500,
    purpose: 'Fuel & RFID Expressway Tolls for Northern Luzon Hubs',
    notes: 'Route: Manila Central Hub -> Bulacan -> Tarlac -> Baguio City',
  });

  // Action / Audit Form for Liquidation
  const [auditAction, setAuditAction] = useState('Mark as Liquidated');
  const [auditRemarks, setAuditRemarks] = useState('');

  // KPI Calculations
  const pendingAdvancesCount = cashAdvances.filter((a) => a.status === 'Pending Finance Review').length;
  const approvedAdvancesCount = cashAdvances.filter((a) => a.status === 'Approved').length;
  const disbursedAdvancesTotal = cashAdvances
    .filter((a) => a.status === 'Disbursed' || a.status === 'Approved')
    .reduce((sum, a) => sum + (a.amountGiven || 0), 0);
  const pendingLiquidationsCount = liquidations.filter((l) => l.status === 'Pending Validation' || l.status === 'Submitted').length;

  // Filtered lists
  const filteredAdvances = cashAdvances.filter((a) => {
    return (
      (a.advanceId || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (a.courierName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (a.tripReference || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (a.status || '').toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const filteredLiquidations = liquidations.filter((l) => {
    const ref = l.reference || l.referenceNumber || '';
    const submitter = l.submittedBy || l.submittedByName || '';
    return (
      ref.toLowerCase().includes(searchQuery.toLowerCase()) ||
      submitter.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (l.status && l.status.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  });

  // Handle Approve Cash Advance (FR-050)
  const handleApproveAdvance = async (advance: CashAdvanceItem) => {
    if (!window.confirm(`Approve Cash Advance request ${advance.advanceId} for ${advance.courierName} (₱${advance.amountGiven.toLocaleString()})?`)) {
      return;
    }
    try {
      const res = await integrationService.approveCashAdvance(
        advance.advanceId,
        user?.fullName || 'Financial Manager',
        'Finance review passed per FR-050. Ready for disbursement.'
      );
      if (res.isSuccess) {
        toast.success(res.message);
        refetchAdvances();
      } else {
        toast.error(res.message || 'Failed to approve cash advance.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error approving cash advance.');
    }
  };

  // Open Disburse Modal
  const handleOpenDisburseModal = (advance: CashAdvanceItem) => {
    setSelectedAdvance(advance);
    setVoucherNumber(`PCV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`);
    setShowDisburseModal(true);
  };

  // Handle Disburse Cash Advance (FR-043, 044)
  const handleDisburseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAdvance) return;
    try {
      setIsSubmitting(true);
      const res = await integrationService.disburseCashAdvance(
        selectedAdvance.advanceId,
        disbursedBy,
        disbursementMethod,
        voucherNumber
      );
      if (res.isSuccess) {
        toast.success(res.message);
        setShowDisburseModal(false);
        refetchAdvances();
      } else {
        toast.error(res.message || 'Failed to disburse advance.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error recording payout disbursement.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Create Advance Request (DMS simulation)
  const handleCreateAdvanceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      const res = await integrationService.submitCashAdvance(advanceForm);
      if (res.isSuccess) {
        toast.success(res.message);
        setShowAdvanceModal(false);
        refetchAdvances();
      } else {
        toast.error(res.message || 'Failed to create cash advance request.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error submitting cash advance request.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Audit / Validate Liquidation (FR-048–053)
  const handleOpenAuditModal = (liq: Liquidation) => {
    setSelectedLiquidation(liq);
    setAuditAction('Mark as Liquidated');
    setAuditRemarks('All receipts verified against courier trip reference.');
    setShowAuditModal(true);
  };

  const handleAuditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLiquidation) return;
    try {
      setIsSubmitting(true);
      const id = selectedLiquidation.id || selectedLiquidation.referenceNumber || '';
      const res = await integrationService.actOnLiquidation(id, auditAction, auditRemarks);
      if (res.isSuccess) {
        toast.success(res.message || `Liquidation status updated: ${auditAction}`);
        setShowAuditModal(false);
        refetchLiquidations();
        refetchAdvances();
      } else {
        toast.error(res.message || 'Failed to process liquidation validation.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error processing liquidation.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', paddingBottom: '40px' }}>
      {/* ─── Top Actions Bar ──────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '10px' }}>
        <Button
          title="Refresh"
          variant="secondary"
          onClick={() => {
            refetchAdvances();
            refetchLiquidations();
            toast.info('Refreshed advances and liquidations.');
          }}
        >
          <i className="ti ti-refresh" style={{ marginRight: '6px' }} />
          Refresh
        </Button>
        <Button title="New DMS Cash Advance Request" variant="primary" onClick={() => setShowAdvanceModal(true)}>
          <i className="ti ti-plus" style={{ marginRight: '6px' }} />
          New DMS Cash Advance Request
        </Button>
      </div>

      {/* ─── KPI Cards ───────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
        <div style={{ background: '#fff', borderRadius: '12px', padding: '18px 20px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ color: '#64748b', fontSize: '13px', fontWeight: 600 }}>Pending Finance Review</div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#f59e0b', marginTop: '6px' }}>
            {pendingAdvancesCount}
          </div>
          <div style={{ fontSize: '12px', color: '#f59e0b', marginTop: '4px', fontWeight: 500 }}>
            <i className="ti ti-clock" style={{ marginRight: '4px' }} /> Awaiting review prior to departure (FR-050)
          </div>
        </div>

        <div style={{ background: '#fff', borderRadius: '12px', padding: '18px 20px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ color: '#64748b', fontSize: '13px', fontWeight: 600 }}>Approved / Ready for Payout</div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#2563eb', marginTop: '6px' }}>
            {approvedAdvancesCount}
          </div>
          <div style={{ fontSize: '12px', color: '#2563eb', marginTop: '4px', fontWeight: 500 }}>
            <i className="ti ti-wallet" style={{ marginRight: '4px' }} /> Ready for cash voucher disbursement
          </div>
        </div>

        <div style={{ background: '#fff', borderRadius: '12px', padding: '18px 20px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ color: '#64748b', fontSize: '13px', fontWeight: 600 }}>Active Disbursed Funds</div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#7c3aed', marginTop: '6px' }}>
            {formatCurrency(disbursedAdvancesTotal)}
          </div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>Recorded Outflow to couriers (FR-043)</div>
        </div>

        <div style={{ background: '#fff', borderRadius: '12px', padding: '18px 20px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ color: '#64748b', fontSize: '13px', fontWeight: 600 }}>Liquidations For Audit</div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#059669', marginTop: '6px' }}>
            {pendingLiquidationsCount}
          </div>
          <div style={{ fontSize: '12px', color: '#059669', marginTop: '4px', fontWeight: 500 }}>
            <i className="ti ti-receipt" style={{ marginRight: '4px' }} /> Submitted post-trip with receipts
          </div>
        </div>
      </div>

      {/* ─── Tabs ────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '2px solid #e2e8f0', paddingBottom: '2px' }}>
        <button
          onClick={() => setActiveTab('advances')}
          style={{
            padding: '10px 20px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'advances' ? '3px solid #7c3aed' : '3px solid transparent',
            color: activeTab === 'advances' ? '#7c3aed' : '#64748b',
            fontWeight: 700,
            fontSize: '14px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <i className="ti ti-wallet" />
          Cash Advance Requests &amp; Payouts ({cashAdvances.length})
        </button>
        <button
          onClick={() => setActiveTab('liquidations')}
          style={{
            padding: '10px 20px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'liquidations' ? '3px solid #059669' : '3px solid transparent',
            color: activeTab === 'liquidations' ? '#059669' : '#64748b',
            fontWeight: 700,
            fontSize: '14px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <i className="ti ti-file-certificate" />
          Trip Liquidations &amp; Receipts Audit ({liquidations.length})
        </button>
      </div>

      {/* ─── Search & View Switcher Bar ──────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '14px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', flexWrap: 'wrap', gap: '14px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flex: 1, minWidth: '280px' }}>
          <i className="ti ti-search" style={{ color: '#94a3b8', fontSize: '16px' }} />
          <input
            type="text"
            placeholder={activeTab === 'advances' ? 'Search by Advance ID, Courier, or Trip...' : 'Search by Ref #, Submitter, or Status...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ border: 'none', outline: 'none', fontSize: '13px', width: '100%', maxWidth: '360px', color: '#1e293b' }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ fontSize: '13px', color: '#64748b' }}>
            Showing {activeTab === 'advances' ? filteredAdvances.length : filteredLiquidations.length} records
          </div>

          {/* Cards vs Table Switcher */}
          <div style={{ display: 'inline-flex', borderRadius: '8px', border: '1px solid #e2e8f0', overflow: 'hidden', background: '#f8fafc' }}>
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 15px',
                fontSize: '0.85rem',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                background: viewMode === 'cards' ? '#0D9488' : 'transparent',
                color: viewMode === 'cards' ? '#FFFFFF' : '#64748b',
                transition: 'all 0.2s ease',
              }}
            >
              <i className="ti ti-layout-grid" style={{ fontSize: '15px' }} />
              Cards
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 15px',
                fontSize: '0.85rem',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                background: viewMode === 'table' ? '#0D9488' : 'transparent',
                color: viewMode === 'table' ? '#FFFFFF' : '#64748b',
                transition: 'all 0.2s ease',
              }}
            >
              <i className="ti ti-table" style={{ fontSize: '15px' }} />
              Table
            </button>
          </div>
        </div>
      </div>

      {/* ─── TAB 1: Cash Advances ────────────────────────────────────────── */}
      {activeTab === 'advances' && (
        viewMode === 'cards' ? (
          loadingAdvances ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>
              <div style={{ fontSize: '14px', fontWeight: 600 }}>Loading cash advance records...</div>
            </div>
          ) : filteredAdvances.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <i className="ti ti-wallet" style={{ fontSize: '42px', display: 'block', marginBottom: '12px', color: '#cbd5e1' }} />
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#334155' }}>No cash advances found</div>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>Try adjusting your search query.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '20px' }}>
              {filteredAdvances.map((adv) => (
                <div
                  key={adv.advanceId}
                  style={{
                    background: '#FFFFFF',
                    borderRadius: '12px',
                    border: '1px solid #e2e8f0',
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                    transition: 'box-shadow 0.2s, transform 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.08)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <div>
                    {/* Top Header Row */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <span
                        style={{
                          fontFamily: 'monospace',
                          fontWeight: 700,
                          fontSize: '13px',
                          color: '#0f172a',
                          background: '#f1f5f9',
                          padding: '3px 9px',
                          borderRadius: '6px',
                          border: '1px solid #e2e8f0',
                        }}
                      >
                        {adv.advanceId}
                      </span>
                      <StatusBadge status={adv.status} />
                    </div>

                    {/* Courier and Trip */}
                    <div style={{ marginBottom: '14px' }}>
                      <h4 style={{ margin: '0 0 6px 0', fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
                        {adv.courierName}
                      </h4>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '3px 8px', fontSize: '12px', color: '#2563eb', fontFamily: 'monospace' }}>
                        <i className="ti ti-truck" />
                        {adv.tripReference}
                      </div>
                    </div>

                    {/* Amount Banner */}
                    <div
                      style={{
                        background: '#faf5ff',
                        border: '1px solid #f3e8ff',
                        borderRadius: '10px',
                        padding: '12px 14px',
                        marginBottom: '14px',
                      }}
                    >
                      <div style={{ fontSize: '11px', color: '#9333ea', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Cash Advance Outflow
                      </div>
                      <div style={{ fontSize: '24px', fontWeight: 800, color: '#7c3aed', marginTop: '2px' }}>
                        {formatCurrency(adv.amountGiven)}
                      </div>
                    </div>

                    {/* Purpose / Notes */}
                    <div
                      style={{
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        padding: '10px 12px',
                        fontSize: '12px',
                        color: '#475569',
                        marginBottom: '14px',
                        lineHeight: 1.45,
                      }}
                    >
                      <i className="ti ti-notes" style={{ marginRight: '6px', color: '#94a3b8' }} />
                      {adv.notes || 'Fuel and Tollway Fees'}
                    </div>

                    {/* Verification & Payout Status Box */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', padding: '10px 12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #f1f5f9', marginBottom: '16px', fontSize: '12px' }}>
                      <div>
                        <div style={{ color: '#64748b', fontSize: '11px', fontWeight: 600 }}>Finance Review</div>
                        {adv.approvedBy ? (
                          <div style={{ fontWeight: 600, color: '#059669', marginTop: '2px' }}>
                            <i className="ti ti-check" /> Approved
                            <div style={{ fontSize: '10px', color: '#64748b' }}>by {adv.approvedBy}</div>
                          </div>
                        ) : (
                          <div style={{ color: '#f59e0b', fontWeight: 600, marginTop: '2px' }}>Pending Review</div>
                        )}
                      </div>
                      <div>
                        <div style={{ color: '#64748b', fontSize: '11px', fontWeight: 600 }}>Disbursement</div>
                        {adv.disbursedBy ? (
                          <div style={{ fontWeight: 600, color: '#2563eb', marginTop: '2px' }}>
                            <i className="ti ti-wallet" /> Disbursed
                            <div style={{ fontSize: '10px', color: '#64748b' }}>by {adv.disbursedBy}</div>
                          </div>
                        ) : adv.status === 'Approved' ? (
                          <div style={{ color: '#7c3aed', fontWeight: 600, marginTop: '2px' }}>Ready for Payout</div>
                        ) : (
                          <div style={{ color: '#94a3b8', marginTop: '2px' }}>Awaiting Approval</div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions Row */}
                  <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '14px', display: 'flex', justifyContent: 'flex-end' }}>
                    {adv.status === 'Pending Finance Review' ? (
                      <Button
                        title="Approve (FR-050)"
                        variant="primary"
                        onClick={() => handleApproveAdvance(adv)}
                        style={{ width: '100%', background: '#059669', borderColor: '#059669' }}
                      >
                        <i className="ti ti-check" style={{ marginRight: '6px' }} />
                        Approve (FR-050)
                      </Button>
                    ) : adv.status === 'Approved' ? (
                      <Button
                        title="Disburse Funds (FR-043)"
                        variant="primary"
                        onClick={() => handleOpenDisburseModal(adv)}
                        style={{ width: '100%', background: '#7c3aed', borderColor: '#7c3aed' }}
                      >
                        <i className="ti ti-cash" style={{ marginRight: '6px' }} />
                        Disburse Funds (FR-043)
                      </Button>
                    ) : (
                      <div style={{ width: '100%', textAlign: 'center', padding: '8px', background: '#ecfdf5', borderRadius: '6px', color: '#059669', fontWeight: 600, fontSize: '13px' }}>
                        <i className="ti ti-check-double" style={{ marginRight: '6px' }} />
                        Funds Released to Courier
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          <TableContainer>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
                Cash Advance Approval &amp; Payout Registry
              </h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>
                Pre-trip cash advances submitted by Operations Dispatch. Finance reviews (FR-050) and disburses (FR-043) before departure.
              </p>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: '1100px', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                    <th style={{ padding: '14px 18px', fontWeight: 600, whiteSpace: 'nowrap' }}>Advance ID</th>
                    <th style={{ padding: '14px 18px', fontWeight: 600, whiteSpace: 'nowrap' }}>Courier Name</th>
                    <th style={{ padding: '14px 18px', fontWeight: 600, whiteSpace: 'nowrap' }}>Trip Reference</th>
                    <th style={{ padding: '14px 18px', fontWeight: 600, whiteSpace: 'nowrap' }}>Amount Given</th>
                    <th style={{ padding: '14px 18px', fontWeight: 600 }}>Purpose / Notes</th>
                    <th style={{ padding: '14px 18px', fontWeight: 600, whiteSpace: 'nowrap' }}>Status</th>
                    <th style={{ padding: '14px 18px', fontWeight: 600, whiteSpace: 'nowrap' }}>Finance Review</th>
                    <th style={{ padding: '14px 18px', fontWeight: 600, whiteSpace: 'nowrap' }}>Disbursement</th>
                    <th style={{ padding: '14px 18px', fontWeight: 600, whiteSpace: 'nowrap', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingAdvances ? (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', padding: '36px', color: '#94a3b8' }}>
                        Loading cash advance records...
                      </td>
                    </tr>
                  ) : filteredAdvances.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', padding: '36px', color: '#94a3b8' }}>
                        No cash advance records found matching criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredAdvances.map((adv) => (
                      <tr
                        key={adv.advanceId}
                        style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}
                      >
                        <td style={{ padding: '14px 18px', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap' }}>
                          <span style={{ fontFamily: 'monospace', background: '#f1f5f9', padding: '3px 8px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                            {adv.advanceId}
                          </span>
                        </td>
                        <td style={{ padding: '14px 18px', fontWeight: 600, whiteSpace: 'nowrap' }}>{adv.courierName}</td>
                        <td style={{ padding: '14px 18px', whiteSpace: 'nowrap' }}>
                          <span style={{ fontFamily: 'monospace', color: '#2563eb', background: '#eff6ff', padding: '3px 8px', borderRadius: '4px', border: '1px solid #bfdbfe' }}>
                            {adv.tripReference}
                          </span>
                        </td>
                        <td style={{ padding: '14px 18px', fontWeight: 700, color: '#7c3aed', whiteSpace: 'nowrap' }}>
                          {formatCurrency(adv.amountGiven)}
                        </td>
                        <td style={{ padding: '14px 18px', minWidth: '220px', maxWidth: '320px', lineHeight: 1.45 }}>
                          {adv.notes || 'Fuel & Tollway'}
                        </td>
                        <td style={{ padding: '14px 18px', whiteSpace: 'nowrap' }}>
                          <StatusBadge status={adv.status} />
                        </td>
                        <td style={{ padding: '14px 18px', whiteSpace: 'nowrap' }}>
                          {adv.approvedBy ? (
                            <div style={{ fontSize: '12px' }}>
                              <span style={{ fontWeight: 600, color: '#059669' }}>
                                <i className="ti ti-check" /> Approved
                              </span>
                              <div style={{ fontSize: '11px', color: '#64748b' }}>by {adv.approvedBy}</div>
                            </div>
                          ) : (
                            <span style={{ color: '#f59e0b', fontSize: '12px', fontWeight: 600 }}>Pending Review</span>
                          )}
                        </td>
                        <td style={{ padding: '14px 18px', whiteSpace: 'nowrap' }}>
                          {adv.disbursedBy ? (
                            <div style={{ fontSize: '12px' }}>
                              <span style={{ fontWeight: 600, color: '#2563eb' }}>
                                <i className="ti ti-wallet" /> Disbursed
                              </span>
                              <div style={{ fontSize: '11px', color: '#64748b' }}>by {adv.disbursedBy}</div>
                            </div>
                          ) : adv.status === 'Approved' ? (
                            <span style={{ color: '#7c3aed', fontWeight: 600, fontSize: '12px' }}>Ready for Payout</span>
                          ) : (
                            <span style={{ color: '#94a3b8', fontSize: '12px' }}>Awaiting Approval</span>
                          )}
                        </td>
                        <td style={{ padding: '14px 18px', whiteSpace: 'nowrap', textAlign: 'right' }}>
                          {adv.status === 'Pending Finance Review' ? (
                            <Button
                              title="Approve (FR-050)"
                              variant="primary"
                              size="sm"
                              onClick={() => handleApproveAdvance(adv)}
                              style={{ background: '#059669', borderColor: '#059669' }}
                            >
                              <i className="ti ti-check" style={{ marginRight: '4px' }} />
                              Approve
                            </Button>
                          ) : adv.status === 'Approved' ? (
                            <Button
                              title="Disburse Funds (FR-043)"
                              variant="primary"
                              size="sm"
                              onClick={() => handleOpenDisburseModal(adv)}
                              style={{ background: '#7c3aed', borderColor: '#7c3aed' }}
                            >
                              <i className="ti ti-cash" style={{ marginRight: '4px' }} />
                              Disburse
                            </Button>
                          ) : (
                            <span style={{ color: '#059669', fontWeight: 600, fontSize: '12px' }}>
                              <i className="ti ti-check-double" /> Released
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </TableContainer>
        )
      )}

      {/* ─── TAB 2: Liquidations ─────────────────────────────────────────── */}
      {activeTab === 'liquidations' && (
        viewMode === 'cards' ? (
          loadingLiquidations ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>
              <div style={{ fontSize: '14px', fontWeight: 600 }}>Loading liquidation records...</div>
            </div>
          ) : filteredLiquidations.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <i className="ti ti-receipt" style={{ fontSize: '42px', display: 'block', marginBottom: '12px', color: '#cbd5e1' }} />
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#334155' }}>No liquidation records found</div>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>Try adjusting your search query.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '20px' }}>
              {filteredLiquidations.map((liq) => {
                const totalAmt = Number(liq.amount || liq.totalAmount || 0);
                const leftover = Number(liq.leftoverCash || 0);
                const reimb = Number(liq.reimbursementAmount || 0);

                return (
                  <div
                    key={liq.id}
                    style={{
                      background: '#FFFFFF',
                      borderRadius: '12px',
                      border: '1px solid #e2e8f0',
                      padding: '20px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                      transition: 'box-shadow 0.2s, transform 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.08)';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    <div>
                      {/* Top Header Row */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <span
                          style={{
                            fontFamily: 'monospace',
                            fontWeight: 700,
                            fontSize: '13px',
                            color: '#0f172a',
                            background: '#f1f5f9',
                            padding: '3px 9px',
                            borderRadius: '6px',
                            border: '1px solid #e2e8f0',
                          }}
                        >
                          {liq.reference || liq.referenceNumber}
                        </span>
                        <StatusBadge status={liq.status} />
                      </div>

                      {/* Submitter and Date */}
                      <div style={{ marginBottom: '14px' }}>
                        <h4 style={{ margin: '0 0 4px 0', fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
                          {liq.submittedBy || liq.submittedByName || 'Courier'}
                        </h4>
                        <div style={{ fontSize: '12px', color: '#64748b' }}>
                          Submitted: {formatDate(liq.dateSubmitted || liq.submittedAt || liq.createdAt || '')}
                        </div>
                      </div>

                      {/* Total Expenses Banner */}
                      <div
                        style={{
                          background: '#f0fdf4',
                          border: '1px solid #dcfce7',
                          borderRadius: '10px',
                          padding: '12px 14px',
                          marginBottom: '14px',
                        }}
                      >
                        <div style={{ fontSize: '11px', color: '#16a34a', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          Audited Trip Expenses
                        </div>
                        <div style={{ fontSize: '24px', fontWeight: 800, color: '#059669', marginTop: '2px' }}>
                          {formatCurrency(totalAmt)}
                        </div>
                      </div>

                      {/* Cash Settlement Details */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', padding: '10px 12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '16px', fontSize: '12px' }}>
                        <div>
                          <div style={{ color: '#64748b', fontSize: '11px', fontWeight: 600 }}>Leftover Cash</div>
                          <div style={{ fontWeight: 700, color: leftover > 0 ? '#16a34a' : '#64748b', marginTop: '2px' }}>
                            {leftover > 0 ? `+ ${formatCurrency(leftover)}` : '₱0.00'}
                          </div>
                        </div>
                        <div>
                          <div style={{ color: '#64748b', fontSize: '11px', fontWeight: 600 }}>Reimbursement</div>
                          <div style={{ fontWeight: 700, color: reimb > 0 ? '#dc2626' : '#64748b', marginTop: '2px' }}>
                            {reimb > 0 ? `+ ${formatCurrency(reimb)}` : '₱0.00'}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Actions Row */}
                    <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '14px' }}>
                      <Button
                        title="Audit & Validate (FR-051)"
                        variant="primary"
                        onClick={() => handleOpenAuditModal(liq)}
                        style={{ width: '100%', background: '#059669', borderColor: '#059669' }}
                      >
                        <i className="ti ti-file-check" style={{ marginRight: '6px' }} />
                        Audit &amp; Validate (FR-051)
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          <TableContainer>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
                Courier Trip Liquidations &amp; Expense Audits
              </h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>
                Post-trip liquidations submitted from DMS. Finance audits receipts, settles advances, and records leftover returns or reimbursements.
              </p>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: '1000px', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                    <th style={{ padding: '14px 18px', fontWeight: 600, whiteSpace: 'nowrap' }}>Reference #</th>
                    <th style={{ padding: '14px 18px', fontWeight: 600, whiteSpace: 'nowrap' }}>Courier / Submitter</th>
                    <th style={{ padding: '14px 18px', fontWeight: 600, whiteSpace: 'nowrap' }}>Total Expenses</th>
                    <th style={{ padding: '14px 18px', fontWeight: 600, whiteSpace: 'nowrap' }}>Leftover Cash (Return)</th>
                    <th style={{ padding: '14px 18px', fontWeight: 600, whiteSpace: 'nowrap' }}>Reimbursement Due</th>
                    <th style={{ padding: '14px 18px', fontWeight: 600, whiteSpace: 'nowrap' }}>Status</th>
                    <th style={{ padding: '14px 18px', fontWeight: 600, whiteSpace: 'nowrap' }}>Date Submitted</th>
                    <th style={{ padding: '14px 18px', fontWeight: 600, whiteSpace: 'nowrap', textAlign: 'right' }}>Audit Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingLiquidations ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '36px', color: '#94a3b8' }}>
                        Loading liquidation records...
                      </td>
                    </tr>
                  ) : filteredLiquidations.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '36px', color: '#94a3b8' }}>
                        No liquidation records found matching criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredLiquidations.map((liq) => {
                      const totalAmt = Number(liq.amount || liq.totalAmount || 0);
                      const leftover = Number(liq.leftoverCash || 0);
                      const reimb = Number(liq.reimbursementAmount || 0);

                      return (
                        <tr
                          key={liq.id}
                          style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s' }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}
                        >
                          <td style={{ padding: '14px 18px', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap' }}>
                            <span style={{ fontFamily: 'monospace', background: '#f1f5f9', padding: '3px 8px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                              {liq.reference || liq.referenceNumber}
                            </span>
                          </td>
                          <td style={{ padding: '14px 18px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            {liq.submittedBy || liq.submittedByName || 'Courier'}
                          </td>
                          <td style={{ padding: '14px 18px', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap' }}>
                            {formatCurrency(totalAmt)}
                          </td>
                          <td style={{ padding: '14px 18px', fontWeight: 600, color: leftover > 0 ? '#16a34a' : '#64748b', whiteSpace: 'nowrap' }}>
                            {leftover > 0 ? (
                              <span>
                                <i className="ti ti-arrow-down-left" style={{ marginRight: '4px' }} />
                                {formatCurrency(leftover)}
                              </span>
                            ) : (
                              '₱0.00'
                            )}
                          </td>
                          <td style={{ padding: '14px 18px', fontWeight: 600, color: reimb > 0 ? '#dc2626' : '#64748b', whiteSpace: 'nowrap' }}>
                            {reimb > 0 ? (
                              <span>
                                <i className="ti ti-arrow-up-right" style={{ marginRight: '4px' }} />
                                {formatCurrency(reimb)}
                              </span>
                            ) : (
                              '₱0.00'
                            )}
                          </td>
                          <td style={{ padding: '14px 18px', whiteSpace: 'nowrap' }}>
                            <StatusBadge status={liq.status} />
                          </td>
                          <td style={{ padding: '14px 18px', color: '#64748b', whiteSpace: 'nowrap' }}>
                            {formatDate(liq.dateSubmitted || liq.submittedAt || liq.createdAt || '')}
                          </td>
                          <td style={{ padding: '14px 18px', whiteSpace: 'nowrap', textAlign: 'right' }}>
                            <Button
                              title="Audit & Validate (FR-051)"
                              variant="primary"
                              size="sm"
                              onClick={() => handleOpenAuditModal(liq)}
                              style={{ background: '#059669', borderColor: '#059669' }}
                            >
                              <i className="ti ti-file-check" style={{ marginRight: '4px' }} />
                              Audit &amp; Validate
                            </Button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </TableContainer>
        )
      )}

      {/* ─── Disburse Funds Modal (FR-043, 044) ─────────────────────────── */}
      {showDisburseModal && selectedAdvance && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px',
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: '12px',
              maxWidth: '520px',
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '18px 24px', background: '#f5f3ff', borderBottom: '1px solid #ede9fe', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#5b21b6' }}>
                  Disburse Cash Advance (FR-043, 044)
                </h3>
                <div style={{ fontSize: '13px', color: '#6d28d9', marginTop: '2px' }}>
                  Cash Outflow voucher release for {selectedAdvance.courierName}
                </div>
              </div>
              <button
                onClick={() => setShowDisburseModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#94a3b8' }}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleDisburseSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>Advance ID &amp; Trip</div>
                  <div style={{ fontWeight: 700, color: '#0f172a' }}>{selectedAdvance.advanceId} ({selectedAdvance.tripReference})</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>Amount to Payout</div>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: '#7c3aed' }}>
                    {formatCurrency(selectedAdvance.amountGiven)}
                  </div>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  Disbursement Method *
                </label>
                <select
                  value={disbursementMethod}
                  onChange={(e) => setDisbursementMethod(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', background: '#fff' }}
                >
                  <option value="Petty Cash Voucher (PCV)">Petty Cash Voucher (PCV)</option>
                  <option value="Check Voucher">Check Voucher</option>
                  <option value="Direct Bank Transfer">Direct Bank Transfer</option>
                  <option value="E-Wallet (GCash / Maya)">E-Wallet (GCash / Maya)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  Voucher / Reference Number *
                </label>
                <input
                  type="text"
                  required
                  value={voucherNumber}
                  onChange={(e) => setVoucherNumber(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  Disbursing Custodian / Officer *
                </label>
                <input
                  type="text"
                  required
                  value={disbursedBy}
                  onChange={(e) => setDisbursedBy(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <Button title="Cancel" variant="secondary" onClick={() => setShowDisburseModal(false)} type="button">
                  Cancel
                </Button>
                <Button title="Confirm Payout & Record Outflow" variant="primary" type="submit" disabled={isSubmitting} style={{ background: '#7c3aed', borderColor: '#7c3aed' }}>
                  {isSubmitting ? 'Recording Outflow...' : 'Confirm Payout & Record Outflow'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Audit Liquidation Modal (FR-048–053) ────────────────────────── */}
      {showAuditModal && selectedLiquidation && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px',
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: '12px',
              maxWidth: '580px',
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '18px 24px', background: '#f0fdf4', borderBottom: '1px solid #dcfce7', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#166534' }}>
                  Audit Liquidation: {selectedLiquidation.reference || selectedLiquidation.referenceNumber}
                </h3>
                <div style={{ fontSize: '13px', color: '#15803d', marginTop: '2px' }}>
                  Submitted by {selectedLiquidation.submittedBy || selectedLiquidation.submittedByName}
                </div>
              </div>
              <button
                onClick={() => setShowAuditModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#94a3b8' }}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleAuditSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', textAlign: 'center' }}>
                <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>Total Expenses</div>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
                    {formatCurrency(Number(selectedLiquidation.amount || selectedLiquidation.totalAmount || 0))}
                  </div>
                </div>
                <div style={{ background: '#f0fdf4', padding: '10px', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                  <div style={{ fontSize: '11px', color: '#15803d' }}>Leftover Return</div>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: '#16a34a' }}>
                    {formatCurrency(Number(selectedLiquidation.leftoverCash || 0))}
                  </div>
                </div>
                <div style={{ background: '#fef2f2', padding: '10px', borderRadius: '8px', border: '1px solid #fecaca' }}>
                  <div style={{ fontSize: '11px', color: '#b91c1c' }}>Reimbursement Due</div>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: '#dc2626' }}>
                    {formatCurrency(Number(selectedLiquidation.reimbursementAmount || 0))}
                  </div>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  Finance Validation Action *
                </label>
                <select
                  value={auditAction}
                  onChange={(e) => setAuditAction(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', background: '#fff' }}
                >
                  <option value="Mark as Liquidated">Mark as Liquidated (Settle &amp; Close Advance)</option>
                  <option value="Return for Correction">Return for Correction (Missing Receipts / Discrepancy)</option>
                  <option value="Flag for Dispute">Flag for Dispute / Supervisory Audit</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  Audit Remarks &amp; Settlement Notes *
                </label>
                <textarea
                  rows={3}
                  required
                  value={auditRemarks}
                  onChange={(e) => setAuditRemarks(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', fontFamily: 'inherit' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <Button title="Cancel" variant="secondary" onClick={() => setShowAuditModal(false)} type="button">
                  Cancel
                </Button>
                <Button
                  title={`Execute Action: ${auditAction}`}
                  variant="primary"
                  type="submit"
                  disabled={isSubmitting}
                  style={{
                    background: auditAction === 'Mark as Liquidated' ? '#16a34a' : '#dc2626',
                    borderColor: auditAction === 'Mark as Liquidated' ? '#16a34a' : '#dc2626',
                  }}
                >
                  {isSubmitting ? 'Saving...' : `Execute Action: ${auditAction}`}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Create Advance Request Modal (Ops DMS Simulation) ───────────── */}
      {showAdvanceModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px',
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: '12px',
              maxWidth: '520px',
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '18px 24px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
                  New DMS Cash Advance Request (FR-043, 050)
                </h3>
                <div style={{ fontSize: '13px', color: '#64748b', marginTop: '2px' }}>
                  Transmitted from DMS Operations to FOMS for finance review.
                </div>
              </div>
              <button
                onClick={() => setShowAdvanceModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#94a3b8' }}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateAdvanceSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  Courier Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={advanceForm.courierName}
                  onChange={(e) => setAdvanceForm({ ...advanceForm, courierName: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                    Trip Reference *
                  </label>
                  <input
                    type="text"
                    required
                    value={advanceForm.tripReference}
                    onChange={(e) => setAdvanceForm({ ...advanceForm, tripReference: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                    Amount Requested (₱) *
                  </label>
                  <input
                    type="number"
                    required
                    value={advanceForm.amountGiven}
                    onChange={(e) => setAdvanceForm({ ...advanceForm, amountGiven: Number(e.target.value) })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  Purpose
                </label>
                <input
                  type="text"
                  value={advanceForm.purpose}
                  onChange={(e) => setAdvanceForm({ ...advanceForm, purpose: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  Route / Destination Notes
                </label>
                <textarea
                  rows={2}
                  value={advanceForm.notes}
                  onChange={(e) => setAdvanceForm({ ...advanceForm, notes: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', fontFamily: 'inherit' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <Button title="Cancel" variant="secondary" onClick={() => setShowAdvanceModal(false)} type="button">
                  Cancel
                </Button>
                <Button title="Submit to Finance Review" variant="primary" type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Transmitting...' : 'Submit to Finance Review'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CashAdvanceLiquidationPortal;
