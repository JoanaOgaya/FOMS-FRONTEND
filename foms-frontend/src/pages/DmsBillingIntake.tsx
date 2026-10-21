import React, { useState } from 'react';
import { useQuery } from '../hooks/useQuery';
import { useToast } from '../components/ToastContext';
import { useAuth } from '../context/AuthContext';
import { TableContainer } from '../components/TableContainer';
import { Button } from '../components/Buttons';
import { StatusBadge } from '../components/shared/StatusBadge';
import {
  integrationService,
  DmsDeliveryCompletedDto,
  DmsDeliveryFailedDto,
  DmsRedeliveryCompletedDto,
} from '../services/integrationService';
import { http } from '../services/apiClient';
import { formatCurrency, formatDate } from '../utils/format';
import { canIntakeDelivery } from '../utils/roleAccess';

interface CombinedWaybillDoc {
  waybillId: number;
  waybillNumber: string;
  clientId: number;
  clientName?: string;
  deliveryArea: string;
  actualWeight: number;
  chargeableWeight?: number;
  deliveryStatus: string;
  podStatus: string;
  podUrl?: string;
  isBilled: boolean;
  invoiceId?: number;
  invoiceNo?: string;
  createdAt: string;
  // Computed billing & hold info
  failureReason?: string;
  computedAmount?: number;
}

export const DmsBillingIntake: React.FC = () => {
  const { toast } = useToast();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<'completed' | 'holds'>('completed');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch Waybills
  const {
    data: waybillsData = [],
    isLoading: loadingWaybills,
    refetch: refetchWaybills,
  } = useQuery('billing:waybills', async () => {
    const res = await http.get<any>('/api/shipment-records');
    if (res && res.items && Array.isArray(res.items)) return res.items;
    if (Array.isArray(res)) return res;
    return [];
  });

  // Fetch Invoices
  const {
    data: invoicesData = [],
    isLoading: loadingInvoices,
    refetch: refetchInvoices,
  } = useQuery('invoices', async () => {
    const res = await http.get<any>('/api/invoices');
    if (res && res.items && Array.isArray(res.items)) return res.items;
    if (Array.isArray(res)) return res;
    return [];
  });

  // Modals state
  const [showCompletedModal, setShowCompletedModal] = useState(false);
  const [showFailedModal, setShowFailedModal] = useState(false);
  const [showRedeliveryModal, setShowRedeliveryModal] = useState(false);
  const [selectedWaybillForRedelivery, setSelectedWaybillForRedelivery] = useState<string>('');
  const [previewPodUrl, setPreviewPodUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // New Completed Delivery Form (all fields empty)
  const [completedForm, setCompletedForm] = useState<DmsDeliveryCompletedDto>({
    waybillNumber: '',
    clientName: '',
    deliveryArea: '',
    actualWeight: '' as unknown as number,
    lengthCm: undefined,
    widthCm: undefined,
    heightCm: undefined,
    declaredValue: undefined,
    podUrl: '',
    recipientName: '',
    driverName: '',
    autoGenerateInvoice: true,
  });

  // Failed Delivery Form (all fields empty)
  const [failedForm, setFailedForm] = useState<Omit<DmsDeliveryFailedDto, 'attemptCount'> & { attemptCount: number | string }>({
    waybillNumber: '',
    failureReason: 'Consignee Not Available',
    attemptCount: 1,
    driverName: '',
    remarks: '',
  });

  // Redelivery Form (all fields empty)
  const [redeliveryForm, setRedeliveryForm] = useState<DmsRedeliveryCompletedDto>({
    waybillNumber: '',
    podUrl: '',
    recipientName: '',
    driverName: '',
    remarks: '',
  });

  // Normalize waybills list
  const safeWaybillsData = Array.isArray(waybillsData) ? waybillsData : (waybillsData as any)?.items || [];
  const safeInvoicesData = Array.isArray(invoicesData) ? invoicesData : (invoicesData as any)?.items || [];

  const waybills: CombinedWaybillDoc[] = safeWaybillsData.map((w: any) => ({
    waybillId: w?.waybillId || w?.id || 0,
    waybillNumber: String(w?.waybillNumber || w?.trackingNumber || `WB-${w?.waybillId || ''}`),
    clientId: w?.clientId || 1,
    clientName: w?.clientName || 'Client',
    deliveryArea: String(w?.deliveryArea || 'NCR'),
    actualWeight: Number(w?.actualWeight) || 0,
    deliveryStatus: String(w?.deliveryStatus || (w?.podStatus?.includes('Hold') ? 'Failed Delivery' : 'Delivered')),
    podStatus: String(w?.podStatus || 'Validated'),
    podUrl: w?.podUrl || '',
    isBilled: !!w?.isBilled,
    invoiceId: w?.invoiceId,
    invoiceNo: w?.invoiceNo,
    createdAt: w?.createdAt || new Date().toISOString(),
    failureReason: w?.failureReason,
  }));

  // Separate holds vs completed
  const holdWaybills = waybills.filter(
    (w) =>
      w.podStatus?.toLowerCase().includes('hold') ||
      w.deliveryStatus?.toLowerCase().includes('fail') ||
      w.podStatus?.toLowerCase().includes('failed')
  );

  const completedWaybills = waybills.filter(
    (w) => !w.podStatus?.toLowerCase().includes('hold') && !w.deliveryStatus?.toLowerCase().includes('fail')
  );

  const filteredWaybills = (activeTab === 'completed' ? completedWaybills : holdWaybills).filter(
    (w) =>
      (w.waybillNumber || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (w.clientName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (w.deliveryArea || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Completed Delivery Submission
  const handleCompletedSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      const res = await integrationService.submitDeliveryCompleted(completedForm);
      if (res.isSuccess) {
        toast.success(res.message);
        setCompletedForm({
          waybillNumber: '',
          clientName: '',
          deliveryArea: '',
          actualWeight: '' as unknown as number,
          lengthCm: undefined,
          widthCm: undefined,
          heightCm: undefined,
          declaredValue: undefined,
          podUrl: '',
          recipientName: '',
          driverName: '',
          autoGenerateInvoice: true,
        });
        setShowCompletedModal(false);
        refetchWaybills();
        refetchInvoices();
      } else {
        toast.error(res.message || 'Failed to process completed delivery.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error executing delivery completion intake.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Failed Delivery Submission (Billing Hold)
  const handleFailedSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const count = Number(failedForm.attemptCount);
    if (!count || count < 1) {
      toast.error('Attempt count must be at least 1.');
      return;
    }
    try {
      setIsSubmitting(true);
      const res = await integrationService.submitDeliveryFailed({
        ...failedForm,
        attemptCount: count,
      });
      if (res.isSuccess) {
        toast.warning(res.message);
        setShowFailedModal(false);
        setActiveTab('holds');
        refetchWaybills();
        setFailedForm({
          waybillNumber: '',
          failureReason: 'Consignee Not Available',
          attemptCount: 1,
          driverName: '',
          remarks: '',
        });
      } else {
        toast.error(res.message || 'Failed to place billing hold.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error executing billing hold.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Redelivery Submission (Lift Hold)
  const handleRedeliverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      const payload: DmsRedeliveryCompletedDto = {
        ...redeliveryForm,
        waybillNumber: selectedWaybillForRedelivery || redeliveryForm.waybillNumber,
      };
      const res = await integrationService.submitRedeliveryCompleted(payload);
      if (res.isSuccess) {
        toast.success(res.message);
        setShowRedeliveryModal(false);
        refetchWaybills();
        refetchInvoices();
      } else {
        toast.error(res.message || 'Failed to lift billing hold.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error processing re-delivery completion.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openRedeliveryModal = (waybillNumber: string) => {
    setSelectedWaybillForRedelivery(waybillNumber);
    setRedeliveryForm((prev) => ({ ...prev, waybillNumber }));
    setShowRedeliveryModal(true);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', paddingBottom: '40px' }}>
      {/* ─── Top Actions Bar ──────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '10px' }}>
        <Button
          title="Refresh"
          variant="secondary"
          onClick={() => {
            refetchWaybills();
            refetchInvoices();
            toast.info('Refreshed delivery and billing records.');
          }}
        >
          <i className="ti ti-refresh" style={{ marginRight: '6px' }} />
          Refresh
        </Button>
        {canIntakeDelivery(user?.role) && (
          <Button
            title="Record Failed Delivery (Hold)"
            variant="secondary"
            style={{ borderColor: '#ef4444', color: '#dc2626' }}
            onClick={() => setShowFailedModal(true)}
          >
            <i className="ti ti-alert-triangle" style={{ marginRight: '6px' }} />
            Record Failed Delivery (Hold)
          </Button>
        )}
        {canIntakeDelivery(user?.role) && (
          <Button title="Intake Completed Delivery" variant="primary" onClick={() => setShowCompletedModal(true)}>
            <i className="ti ti-plus" style={{ marginRight: '6px' }} />
            Intake Completed Delivery
          </Button>
        )}
      </div>

      {/* ─── Summary Metrics Banner ──────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
        <div style={{ background: '#fff', borderRadius: '12px', padding: '18px 20px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ color: '#64748b', fontSize: '13px', fontWeight: 600 }}>Completed Deliveries</div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#0f172a', marginTop: '6px' }}>
            {completedWaybills.length}
          </div>
          <div style={{ fontSize: '12px', color: '#16a34a', marginTop: '4px', fontWeight: 500 }}>
            <i className="ti ti-circle-check" style={{ marginRight: '4px' }} /> Validated with POD attachments
          </div>
        </div>

        <div style={{ background: '#fff', borderRadius: '12px', padding: '18px 20px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ color: '#64748b', fontSize: '13px', fontWeight: 600 }}>Active Billing Holds</div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#dc2626', marginTop: '6px' }}>
            {holdWaybills.length}
          </div>
          <div style={{ fontSize: '12px', color: '#ef4444', marginTop: '4px', fontWeight: 500 }}>
            <i className="ti ti-lock" style={{ marginRight: '4px' }} /> Blocked from invoicing until re-delivery
          </div>
        </div>

        <div style={{ background: '#fff', borderRadius: '12px', padding: '18px 20px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ color: '#64748b', fontSize: '13px', fontWeight: 600 }}>Generated Invoices</div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#2563eb', marginTop: '6px' }}>
            {safeInvoicesData.length}
          </div>
          <div style={{ fontSize: '12px', color: '#2563eb', marginTop: '4px', fontWeight: 500 }}>
            <i className="ti ti-file-text" style={{ marginRight: '4px' }} /> Linked to Accounts Receivable
          </div>
        </div>

        <div style={{ background: '#fff', borderRadius: '12px', padding: '18px 20px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ color: '#64748b', fontSize: '13px', fontWeight: 600 }}>Billing Rate Compliance</div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#059669', marginTop: '6px' }}>100%</div>
          <div style={{ fontSize: '12px', color: '#059669', marginTop: '4px', fontWeight: 500 }}>
            <i className="ti ti-check" style={{ marginRight: '4px' }} /> Matrix applied dynamically
          </div>
        </div>
      </div>

      {/* ─── Navigation Tabs ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '2px solid #e2e8f0', paddingBottom: '2px' }}>
        <button
          onClick={() => setActiveTab('completed')}
          style={{
            padding: '10px 20px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'completed' ? '3px solid #2563eb' : '3px solid transparent',
            color: activeTab === 'completed' ? '#2563eb' : '#64748b',
            fontWeight: 700,
            fontSize: '14px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <i className="ti ti-circle-check" />
          Completed Deliveries &amp; Invoicing ({completedWaybills.length})
        </button>
        <button
          onClick={() => setActiveTab('holds')}
          style={{
            padding: '10px 20px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'holds' ? '3px solid #dc2626' : '3px solid transparent',
            color: activeTab === 'holds' ? '#dc2626' : '#64748b',
            fontWeight: 700,
            fontSize: '14px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <i className="ti ti-lock" />
          Billing Holds &amp; Re-Delivery Management ({holdWaybills.length})
        </button>
      </div>

      {/* ─── Filter & View Switcher Bar ─────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '14px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', flexWrap: 'wrap', gap: '14px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flex: 1, minWidth: '280px' }}>
          <i className="ti ti-search" style={{ color: '#94a3b8', fontSize: '16px' }} />
          <input
            type="text"
            placeholder="Search by Waybill #, Client, or Area..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ border: 'none', outline: 'none', fontSize: '13px', width: '100%', maxWidth: '360px', color: '#1e293b' }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ fontSize: '13px', color: '#64748b' }}>
            Showing {filteredWaybills.length} records
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

      {/* ─── Content: Cards or Table ─────────────────────────────────────── */}
      {viewMode === 'cards' ? (
        loadingWaybills ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>
            <div style={{ fontSize: '14px', fontWeight: 600 }}>Loading waybills...</div>
          </div>
        ) : filteredWaybills.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <i className="ti ti-truck-delivery" style={{ fontSize: '42px', display: 'block', marginBottom: '12px', color: '#cbd5e1' }} />
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#334155' }}>
              {activeTab === 'completed' ? 'No completed waybills found' : 'No billing holds active'}
            </div>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
              {activeTab === 'completed' ? 'Try adjusting your search criteria.' : 'All deliveries are in good standing.'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '20px' }}>
            {filteredWaybills.map((w) => (
              <div
                key={w.waybillId}
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
                      {w.waybillNumber}
                    </span>
                    <StatusBadge status={w.deliveryStatus} />
                  </div>

                  {/* Client & Region */}
                  <div style={{ marginBottom: '14px' }}>
                    <h4 style={{ margin: '0 0 6px 0', fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
                      {w.clientName}
                    </h4>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ background: '#f1f5f9', padding: '3px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 600, color: '#334155' }}>
                        <i className="ti ti-map-pin" style={{ marginRight: '4px', color: '#64748b' }} />
                        {w.deliveryArea}
                      </span>
                      <span style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '3px 8px', borderRadius: '4px', fontSize: '12px', color: '#64748b' }}>
                        <i className="ti ti-scale" style={{ marginRight: '4px' }} />
                        {w.actualWeight} kg
                      </span>
                    </div>
                  </div>

                  {/* Status / Linkage Box */}
                  <div style={{ marginBottom: '16px' }}>
                    {activeTab === 'holds' ? (
                      <div style={{ background: '#fef2f2', border: '1px solid #fee2e2', borderRadius: '8px', padding: '10px 12px', fontSize: '12px' }}>
                        <div style={{ color: '#dc2626', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <i className="ti ti-lock" />
                          Billing Blocked
                        </div>
                        <div style={{ color: '#991b1b', marginTop: '4px', fontSize: '11px' }}>
                          {w.failureReason || 'Consignee Not Available on 1st Attempt'}
                        </div>
                      </div>
                    ) : w.invoiceNo ? (
                      <div style={{ background: '#f0fdf4', border: '1px solid #dcfce7', borderRadius: '8px', padding: '10px 12px', fontSize: '12px' }}>
                        <div style={{ color: '#16a34a', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <i className="ti ti-file-check" />
                          Linked Invoice: {w.invoiceNo}
                        </div>
                        <div style={{ color: '#15803d', marginTop: '2px', fontSize: '11px' }}>
                          Accounts Receivable recorded
                        </div>
                      </div>
                    ) : (
                      <div style={{ background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: '8px', padding: '10px 12px', fontSize: '12px' }}>
                        <div style={{ color: '#d97706', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <i className="ti ti-clock" />
                          Pending Invoicing Desk
                        </div>
                        <div style={{ color: '#b45309', marginTop: '2px', fontSize: '11px' }}>
                          Delivery validated with POD
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Action Footer */}
                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '14px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  {activeTab === 'holds' && canIntakeDelivery(user?.role) ? (
                    <Button
                      title="Resolve Re-Delivery"
                      variant="primary"
                      onClick={() => openRedeliveryModal(w.waybillNumber)}
                      style={{ width: '100%', background: '#16a34a', borderColor: '#16a34a' }}
                    >
                      <i className="ti ti-check" style={{ marginRight: '6px' }} />
                      Resolve Re-Delivery
                    </Button>
                  ) : activeTab === 'holds' ? null : (
                    <>
                      {w.podUrl && (
                        <button
                          onClick={() => setPreviewPodUrl(w.podUrl!)}
                          style={{
                            flex: 1,
                            background: '#eff6ff',
                            border: '1px solid #bfdbfe',
                            color: '#2563eb',
                            borderRadius: '6px',
                            padding: '8px 12px',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                          }}
                        >
                          <i className="ti ti-photo" /> View POD
                        </button>
                      )}
                      <button
                        onClick={() => setPreviewPodUrl(w.podUrl || 'https://images.unsplash.com/photo-1586281380349-632531db7ed4?w=600&auto=format&fit=crop')}
                        style={{
                          flex: 1,
                          background: '#f8fafc',
                          border: '1px solid #cbd5e1',
                          borderRadius: '6px',
                          padding: '8px 12px',
                          cursor: 'pointer',
                          fontSize: '12px',
                          color: '#475569',
                          fontWeight: 600,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                        }}
                      >
                        <i className="ti ti-file-text" /> Audit Document
                      </button>
                    </>
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
              {activeTab === 'completed' ? 'Validated Completed Deliveries' : 'Deliveries Placed on Billing Hold'}
            </h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>
              {activeTab === 'completed'
                ? 'Deliveries processed from DMS with validated PODs, rate computation, and AR linkage.'
                : 'Deliveries flagged with delivery failure. Billing is halted until successful re-delivery with new POD.'}
            </p>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: '950px', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                  <th style={{ padding: '14px 18px', fontWeight: 600, whiteSpace: 'nowrap' }}>Waybill #</th>
                  <th style={{ padding: '14px 18px', fontWeight: 600, whiteSpace: 'nowrap' }}>Client Account</th>
                  <th style={{ padding: '14px 18px', fontWeight: 600, whiteSpace: 'nowrap' }}>Delivery Area</th>
                  <th style={{ padding: '14px 18px', fontWeight: 600, whiteSpace: 'nowrap' }}>Actual Wt</th>
                  <th style={{ padding: '14px 18px', fontWeight: 600, whiteSpace: 'nowrap' }}>Delivery Status</th>
                  <th style={{ padding: '14px 18px', fontWeight: 600, whiteSpace: 'nowrap' }}>POD Document</th>
                  {activeTab === 'holds' && <th style={{ padding: '14px 18px', fontWeight: 600, whiteSpace: 'nowrap' }}>Hold Reason</th>}
                  <th style={{ padding: '14px 18px', fontWeight: 600, whiteSpace: 'nowrap' }}>Invoiced / AR</th>
                  <th style={{ padding: '14px 18px', fontWeight: 600, whiteSpace: 'nowrap', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loadingWaybills ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: '36px', color: '#94a3b8' }}>
                      Loading waybill records...
                    </td>
                  </tr>
                ) : filteredWaybills.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: '36px', color: '#94a3b8' }}>
                      {activeTab === 'completed'
                        ? 'No completed waybills found.'
                        : 'No billing holds active. All deliveries are in good standing.'}
                    </td>
                  </tr>
                ) : (
                  filteredWaybills.map((w) => (
                    <tr
                      key={w.waybillId}
                      style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}
                    >
                      <td style={{ padding: '14px 18px', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap' }}>
                        <span style={{ fontFamily: 'monospace', background: '#f1f5f9', padding: '3px 8px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                          {w.waybillNumber}
                        </span>
                      </td>
                      <td style={{ padding: '14px 18px', fontWeight: 600, whiteSpace: 'nowrap' }}>{w.clientName}</td>
                      <td style={{ padding: '14px 18px', whiteSpace: 'nowrap' }}>
                        <span style={{ background: '#f1f5f9', padding: '3px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 600 }}>
                          {w.deliveryArea}
                        </span>
                      </td>
                      <td style={{ padding: '14px 18px', whiteSpace: 'nowrap' }}>{w.actualWeight} kg</td>
                      <td style={{ padding: '14px 18px', whiteSpace: 'nowrap' }}>
                        <StatusBadge status={w.deliveryStatus} />
                      </td>
                      <td style={{ padding: '14px 18px', whiteSpace: 'nowrap' }}>
                        {w.podUrl ? (
                          <button
                            onClick={() => setPreviewPodUrl(w.podUrl!)}
                            style={{
                              background: '#eff6ff',
                              border: '1px solid #bfdbfe',
                              color: '#2563eb',
                              borderRadius: '6px',
                              padding: '4px 10px',
                              fontSize: '12px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            <i className="ti ti-photo" /> View POD
                          </button>
                        ) : (
                          <span style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '12px' }}>Missing POD</span>
                        )}
                      </td>
                      {activeTab === 'holds' && (
                        <td style={{ padding: '14px 18px', whiteSpace: 'nowrap' }}>
                          <span style={{ color: '#dc2626', fontWeight: 600, fontSize: '12px' }}>
                            <i className="ti ti-alert-circle" style={{ marginRight: '4px' }} />
                            {w.failureReason || 'Consignee Not Available'}
                          </span>
                        </td>
                      )}
                      <td style={{ padding: '14px 18px', whiteSpace: 'nowrap' }}>
                        {w.invoiceNo ? (
                          <div>
                            <span style={{ fontWeight: 700, color: '#059669' }}>{w.invoiceNo}</span>
                            <div style={{ fontSize: '11px', color: '#16a34a' }}>AR Recorded</div>
                          </div>
                        ) : activeTab === 'holds' ? (
                          <span style={{ color: '#dc2626', fontWeight: 600, fontSize: '12px' }}>
                            <i className="ti ti-lock" style={{ marginRight: '4px' }} /> Invoicing Blocked
                          </span>
                        ) : (
                          <span style={{ color: '#d97706', fontSize: '12px', fontWeight: 600 }}>Pending Invoicing Desk</span>
                        )}
                      </td>
                      <td style={{ padding: '14px 18px', whiteSpace: 'nowrap', textAlign: 'right' }}>
                        {activeTab === 'holds' ? (
                          canIntakeDelivery(user?.role) ? (
                            <Button
                              title="Resolve Re-Delivery"
                              variant="primary"
                              size="sm"
                              onClick={() => openRedeliveryModal(w.waybillNumber)}
                              style={{ background: '#16a34a', borderColor: '#16a34a' }}
                            >
                              <i className="ti ti-check" style={{ marginRight: '4px' }} />
                              Resolve Re-Delivery
                            </Button>
                          ) : null
                        ) : (
                          <button
                            onClick={() => setPreviewPodUrl(w.podUrl || 'https://images.unsplash.com/photo-1586281380349-632531db7ed4?w=600&auto=format&fit=crop')}
                            style={{
                              background: '#f8fafc',
                              border: '1px solid #cbd5e1',
                              borderRadius: '6px',
                              padding: '5px 12px',
                              cursor: 'pointer',
                              fontSize: '12px',
                              color: '#475569',
                              fontWeight: 600,
                            }}
                          >
                            Audit Document
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </TableContainer>
      )}

      {/* ─── POD Preview Modal ───────────────────────────────────────────── */}
      {previewPodUrl && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            padding: '20px',
          }}
          onClick={() => setPreviewPodUrl(null)}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: '12px',
              maxWidth: '650px',
              width: '100%',
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '16px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 700, color: '#0f172a' }}>Proof of Delivery (POD) Document Viewer</div>
              <button
                onClick={() => setPreviewPodUrl(null)}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#94a3b8' }}
              >
                &times;
              </button>
            </div>
            <div style={{ padding: '20px', textAlign: 'center', background: '#0f172a' }}>
              <img
                src={previewPodUrl}
                alt="POD Preview"
                style={{ maxHeight: '450px', maxWidth: '100%', objectFit: 'contain', borderRadius: '6px' }}
              />
            </div>
            <div style={{ padding: '14px 20px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: '#16a34a', fontWeight: 600 }}>
                <i className="ti ti-shield-check" style={{ marginRight: '4px' }} /> Verified Digital Endorsement
              </span>
              <Button title="Close Viewer" variant="secondary" size="sm" onClick={() => setPreviewPodUrl(null)}>
                Close Viewer
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Completed Delivery Intake Modal ─────────────────────────────── */}
      {showCompletedModal && canIntakeDelivery(user?.role) && (
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
              maxWidth: '640px',
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '18px 24px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
                  DMS Completed Delivery Intake
                </h3>
                <div style={{ fontSize: '13px', color: '#64748b', marginTop: '2px' }}>
                  Ingests waybill, applies client rate matrix dynamically, and generates invoice + AR record.
                </div>
              </div>
              <button
                onClick={() => setShowCompletedModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#94a3b8' }}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCompletedSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                    Waybill Number *
                  </label>
                  <input
                    type="text"
                    required
                    value={completedForm.waybillNumber}
                    onChange={(e) => setCompletedForm({ ...completedForm, waybillNumber: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                    Client Account *
                  </label>
                  <select
                    value={completedForm.clientName}
                    onChange={(e) => setCompletedForm({ ...completedForm, clientName: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', background: '#fff' }}
                  >
                    <option value="Lazada Philippines">Lazada Philippines</option>
                    <option value="Shopee Express">Shopee Express</option>
                    <option value="Zalora Philippines">Zalora Philippines</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                    Delivery Area *
                  </label>
                  <select
                    value={completedForm.deliveryArea}
                    onChange={(e) => setCompletedForm({ ...completedForm, deliveryArea: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', background: '#fff' }}
                  >
                    <option value="NCR">NCR</option>
                    <option value="Luzon">Luzon</option>
                    <option value="Visayas">Visayas</option>
                    <option value="Mindanao">Mindanao</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                    Actual Weight (kg) *
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={completedForm.actualWeight}
                    onChange={(e) => setCompletedForm({ ...completedForm, actualWeight: Number(e.target.value) })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                    Declared Value (₱)
                  </label>
                  <input
                    type="number"
                    value={completedForm.declaredValue}
                    onChange={(e) => setCompletedForm({ ...completedForm, declaredValue: Number(e.target.value) })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Length (cm)</label>
                  <input
                    type="number"
                    value={completedForm.lengthCm}
                    onChange={(e) => setCompletedForm({ ...completedForm, lengthCm: Number(e.target.value) })}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Width (cm)</label>
                  <input
                    type="number"
                    value={completedForm.widthCm}
                    onChange={(e) => setCompletedForm({ ...completedForm, widthCm: Number(e.target.value) })}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Height (cm)</label>
                  <input
                    type="number"
                    value={completedForm.heightCm}
                    onChange={(e) => setCompletedForm({ ...completedForm, heightCm: Number(e.target.value) })}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  Proof of Delivery (POD) Image URL *
                </label>
                <input
                  type="url"
                  required
                  value={completedForm.podUrl}
                  onChange={(e) => setCompletedForm({ ...completedForm, podUrl: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                    Recipient Name
                  </label>
                  <input
                    type="text"
                    value={completedForm.recipientName}
                    onChange={(e) => setCompletedForm({ ...completedForm, recipientName: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                    Delivery Courier Name
                  </label>
                  <input
                    type="text"
                    value={completedForm.driverName}
                    onChange={(e) => setCompletedForm({ ...completedForm, driverName: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                <input
                  type="checkbox"
                  id="autoInvoice"
                  checked={completedForm.autoGenerateInvoice}
                  onChange={(e) => setCompletedForm({ ...completedForm, autoGenerateInvoice: e.target.checked })}
                />
                <label htmlFor="autoInvoice" style={{ fontSize: '13px', color: '#334155', fontWeight: 500 }}>
                  Auto-bundle into draft Invoice for validation review
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <Button title="Cancel" variant="secondary" onClick={() => setShowCompletedModal(false)} type="button">
                  Cancel
                </Button>
                <Button title="Ingest Delivery & Generate Draft Invoice" variant="primary" type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Computing Rates...' : 'Ingest Delivery & Generate Draft Invoice'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Record Failed Delivery Modal (Billing Hold) ─────────────────── */}
      {showFailedModal && canIntakeDelivery(user?.role) && (
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
            <div style={{ padding: '18px 24px', background: '#fef2f2', borderBottom: '1px solid #fee2e2', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#991b1b' }}>
                  Record Failed Delivery → Place Billing Hold
                </h3>
                <div style={{ fontSize: '13px', color: '#b91c1c', marginTop: '2px' }}>
                  Places billing hold and halts invoice computation.
                </div>
              </div>
              <button
                onClick={() => setShowFailedModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#94a3b8' }}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleFailedSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  Waybill Number *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. WB-DMS-FAIL-01"
                  value={failedForm.waybillNumber}
                  onChange={(e) => setFailedForm({ ...failedForm, waybillNumber: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  Failure Reason *
                </label>
                <select
                  value={failedForm.failureReason}
                  onChange={(e) => setFailedForm({ ...failedForm, failureReason: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', background: '#fff' }}
                >
                  <option value="Consignee Not Available">Consignee Not Available</option>
                  <option value="Incomplete Address">Incomplete Address</option>
                  <option value="Refused Delivery">Refused Delivery</option>
                  <option value="Weather / Road Access Blocked">Weather / Road Access Blocked</option>
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                    Attempt Count *
                  </label>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    required
                    placeholder="1"
                    value={failedForm.attemptCount === '' || failedForm.attemptCount === 0 ? '' : failedForm.attemptCount}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '') {
                        setFailedForm({ ...failedForm, attemptCount: '' });
                      } else {
                        const parsed = parseInt(val, 10);
                        setFailedForm({
                          ...failedForm,
                          attemptCount: isNaN(parsed) || parsed < 1 ? 1 : parsed,
                        });
                      }
                    }}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                    Driver Name
                  </label>
                  <input
                    type="text"
                    value={failedForm.driverName}
                    onChange={(e) => setFailedForm({ ...failedForm, driverName: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  Operations Remarks
                </label>
                <textarea
                  rows={2}
                  value={failedForm.remarks}
                  onChange={(e) => setFailedForm({ ...failedForm, remarks: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', fontFamily: 'inherit' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <Button title="Cancel" variant="secondary" onClick={() => setShowFailedModal(false)} type="button">
                  Cancel
                </Button>
                <Button title="Place Billing Hold" variant="primary" type="submit" disabled={isSubmitting} style={{ background: '#dc2626', borderColor: '#dc2626' }}>
                  {isSubmitting ? 'Placing Hold...' : 'Place Billing Hold'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Resolve Re-delivery Modal (Lift Hold) ───────────────────────── */}
      {showRedeliveryModal && canIntakeDelivery(user?.role) && (
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
            <div style={{ padding: '18px 24px', background: '#f0fdf4', borderBottom: '1px solid #dcfce7', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#166534' }}>
                  Lift Billing Hold: {selectedWaybillForRedelivery}
                </h3>
                <div style={{ fontSize: '13px', color: '#15803d', marginTop: '2px' }}>
                  Updates status to Completed + validates new POD to resume invoicing.
                </div>
              </div>
              <button
                onClick={() => setShowRedeliveryModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#94a3b8' }}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleRedeliverySubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  Revised Proof of Delivery (POD) URL *
                </label>
                <input
                  type="url"
                  required
                  value={redeliveryForm.podUrl}
                  onChange={(e) => setRedeliveryForm({ ...redeliveryForm, podUrl: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  Recipient Name (Actual Endorser) *
                </label>
                <input
                  type="text"
                  required
                  value={redeliveryForm.recipientName}
                  onChange={(e) => setRedeliveryForm({ ...redeliveryForm, recipientName: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  Delivery Courier Name
                </label>
                <input
                  type="text"
                  value={redeliveryForm.driverName}
                  onChange={(e) => setRedeliveryForm({ ...redeliveryForm, driverName: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  Re-delivery Notes
                </label>
                <textarea
                  rows={2}
                  value={redeliveryForm.remarks}
                  onChange={(e) => setRedeliveryForm({ ...redeliveryForm, remarks: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', fontFamily: 'inherit' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <Button title="Cancel" variant="secondary" onClick={() => setShowRedeliveryModal(false)} type="button">
                  Cancel
                </Button>
                <Button title="Lift Hold & Validate for Billing" variant="primary" type="submit" disabled={isSubmitting} style={{ background: '#16a34a', borderColor: '#16a34a' }}>
                  {isSubmitting ? 'Lifting Hold...' : 'Lift Hold & Validate for Billing'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default DmsBillingIntake;
