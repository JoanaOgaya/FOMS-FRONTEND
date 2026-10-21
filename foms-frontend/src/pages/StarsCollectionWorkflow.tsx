import React, { useState } from 'react';
import { useQuery } from '../hooks/useQuery';
import { useToast } from '../components/ToastContext';
import { useAuth } from '../context/AuthContext';
import { TableContainer } from '../components/TableContainer';
import { Button } from '../components/Buttons';
import { StatusBadge } from '../components/shared/StatusBadge';
import {
  integrationService,
  CoordinatorRoutingMetric,
  StarsCollectionTask,
} from '../services/integrationService';
import { invoicesService } from '../services/invoicesService';
import { canDispatchFollowUp } from '../utils/roleAccess';
import { formatCurrency, formatDate } from '../utils/format';

export const StarsCollectionWorkflow: React.FC = () => {
  const { toast } = useToast();
  const { user } = useAuth();

  // Queries
  const {
    data: routingMetrics = [],
    isLoading: loadingMetrics,
    refetch: refetchMetrics,
  } = useQuery('stars:routing', () => integrationService.getRoutingMetrics());

  const {
    data: tasks = [],
    isLoading: loadingTasks,
    refetch: refetchTasks,
  } = useQuery('stars:tasks', () => integrationService.getCollectionTasks());

  const { data: allInvoices = [] } = useQuery('stars:invoices-lookup', async () => {
    const res = await invoicesService.list({ pageSize: 100 });
    return res?.items || [];
  });

  // Filter overdue invoices from API
  const overdueInvoices = (Array.isArray(allInvoices) ? allInvoices : []).filter((inv: any) => {
    if (!inv) return false;
    const due = inv.dueDate ? new Date(inv.dueDate).getTime() : 0;
    const days = due ? Math.floor((Date.now() - due) / (1000 * 60 * 60 * 24)) : 0;
    const isStatusOverdue =
      String(inv.status || '').toLowerCase() === 'overdue' ||
      String(inv.paymentStatus || '').toLowerCase() === 'overdue';
    const isOutstanding = String(inv.status || '').toLowerCase() !== 'paid';
    return (days > 0 || isStatusOverdue) && isOutstanding;
  });

  // Local state
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedTask, setSelectedTask] = useState<StarsCollectionTask | null>(null);
  const [showExecuteModal, setShowExecuteModal] = useState<boolean>(false);
  const [showDispatchModal, setShowDispatchModal] = useState<boolean>(false);

  // Execution form state
  const [actionTaken, setActionTaken] = useState<string>('');
  const [outcome, setOutcome] = useState<string>('Promised to Pay');
  const [promisedDate, setPromisedDate] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Dispatch form state (all start empty, auto-filled from API)
  const [dispatchInvoiceNo, setDispatchInvoiceNo] = useState<string>('');
  const [dispatchClient, setDispatchClient] = useState<string>('');
  const [dispatchAmount, setDispatchAmount] = useState<number | ''>('');
  const [dispatchDaysOverdue, setDispatchDaysOverdue] = useState<number | ''>('');

  const handleSelectInvoice = (invoiceNo: string) => {
    setDispatchInvoiceNo(invoiceNo);
    const found = overdueInvoices.find(
      (inv: any) => (inv.invoiceNumber || inv.invoiceNo || String(inv.id)) === invoiceNo
    );
    if (found) {
      setDispatchClient(found.clientName || 'Client');
      const bal = found.balance ?? found.totalAmount ?? found.amount ?? 0;
      setDispatchAmount(bal);
      const due = found.dueDate ? new Date(found.dueDate).getTime() : 0;
      const days = due ? Math.max(1, Math.floor((Date.now() - due) / (1000 * 60 * 60 * 24))) : 1;
      setDispatchDaysOverdue(days);
    } else {
      setDispatchClient('');
      setDispatchAmount('');
      setDispatchDaysOverdue('');
    }
  };

  // Filtered tasks
  const filteredTasks = tasks.filter((task) => {
    const matchesStatus =
      statusFilter === 'All' || (task.status || '').toLowerCase() === statusFilter.toLowerCase();
    const matchesSearch =
      (task.taskNumber || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (task.invoiceNumber || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (task.clientName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (task.assignedCoordinatorName || '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const optimalCoordinator = routingMetrics.find((m) => m.isOptimalCandidate);
  const pendingCount = tasks.filter((t) => t.status === 'Assigned' || t.status === 'In Progress').length;
  const completedCount = tasks.filter((t) => t.status === 'Completed').length;
  const totalAmountUnderCollection = tasks
    .filter((t) => t.status !== 'Completed')
    .reduce((sum, t) => sum + (t.amountDue || 0), 0);

  const handleOpenExecuteModal = (task: StarsCollectionTask) => {
    setSelectedTask(task);
    setActionTaken(task.actionTaken || '');
    setOutcome(task.outcome || 'Promised to Pay');
    setPromisedDate(
      task.promisedPaymentDate ? task.promisedPaymentDate.split('T')[0] : ''
    );
    setNotes(task.executionNotes || '');
    setShowExecuteModal(true);
  };

  const handleExecuteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTask) return;
    if (!actionTaken.trim()) {
      toast.error('Please describe the follow-up action taken.');
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await integrationService.executeCollectionTask(selectedTask.taskId, {
        actionTaken,
        outcome,
        promisedPaymentDate: promisedDate || undefined,
        executionNotes: notes,
        executedBy: user?.fullName || 'Collection Coordinator',
      });

      if (res.isSuccess) {
        toast.success(res.message || 'Follow-up executed successfully.');
        setShowExecuteModal(false);
        refetchTasks();
        refetchMetrics();
      } else {
        toast.error(res.message || 'Failed to update follow-up task.');
      }
    } catch (err: any) {
      toast.error(err.message || 'An error occurred while executing task.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDispatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dispatchInvoiceNo) {
      toast.error('Please select an overdue invoice.');
      return;
    }
    try {
      setIsSubmitting(true);
      const res = await integrationService.createCollectionTask({
        invoiceNumber: dispatchInvoiceNo,
        clientName: dispatchClient || 'Client',
        amountDue: Number(dispatchAmount) || 0,
        daysOverdue: Number(dispatchDaysOverdue) || 0,
      });

      if (res.isSuccess) {
        toast.success(res.message);
        setDispatchInvoiceNo('');
        setDispatchClient('');
        setDispatchAmount('');
        setDispatchDaysOverdue('');
        setShowDispatchModal(false);
        refetchTasks();
        refetchMetrics();
      } else {
        toast.error(res.message || 'Failed to dispatch task.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error triggering STARS collection task.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSyncToStars = async (invoiceNo: string) => {
    try {
      const res = await integrationService.triggerStatusSync(invoiceNo);
      if (res.isSuccess) {
        toast.success(`Synchronized Invoice ${invoiceNo} to STARS.`);
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error('Failed to sync payment status with STARS.');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', paddingBottom: '40px' }}>
      {/* ─── Top Actions Bar ──────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '10px' }}>
        <Button
          title="Refresh Engine"
          variant="secondary"
          onClick={() => {
            refetchMetrics();
            refetchTasks();
            toast.info('Refreshed collection metrics and tasks.');
          }}
        >
          <i className="ti ti-refresh" style={{ marginRight: '6px' }} />
          Refresh Engine
        </Button>
        {canDispatchFollowUp(user?.role) && (
          <Button
            title="Dispatch New Follow-Up"
            variant="primary"
            onClick={() => {
              setDispatchInvoiceNo('');
              setDispatchClient('');
              setDispatchAmount('');
              setDispatchDaysOverdue('');
              setShowDispatchModal(true);
            }}
          >
            <i className="ti ti-plus" style={{ marginRight: '6px' }} />
            Dispatch New Follow-Up
          </Button>
        )}
      </div>

      {/* ─── KPI Cards Banner ────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
        <div style={{ background: '#fff', borderRadius: '12px', padding: '18px 20px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ color: '#64748b', fontSize: '13px', fontWeight: 600 }}>Active Collection Tasks</div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#0f172a', marginTop: '6px' }}>{pendingCount}</div>
          <div style={{ fontSize: '12px', color: '#eab308', marginTop: '4px', fontWeight: 500 }}>
            <i className="ti ti-clock" style={{ marginRight: '4px' }} /> Requires Coordinator follow-up
          </div>
        </div>

        <div style={{ background: '#fff', borderRadius: '12px', padding: '18px 20px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ color: '#64748b', fontSize: '13px', fontWeight: 600 }}>Total AR Under Collection</div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#dc2626', marginTop: '6px' }}>
            {formatCurrency(totalAmountUnderCollection)}
          </div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>Overdue balance in pipeline</div>
        </div>

        <div style={{ background: '#fff', borderRadius: '12px', padding: '18px 20px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ color: '#64748b', fontSize: '13px', fontWeight: 600 }}>Completed Follow-ups</div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#16a34a', marginTop: '6px' }}>{completedCount}</div>
          <div style={{ fontSize: '12px', color: '#16a34a', marginTop: '4px', fontWeight: 500 }}>
            <i className="ti ti-check" style={{ marginRight: '4px' }} /> Promises / Resolutions secured
          </div>
        </div>

        <div style={{ background: '#fff', borderRadius: '12px', padding: '18px 20px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ color: '#64748b', fontSize: '13px', fontWeight: 600 }}>Optimal Routing Candidate</div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#0284c7', marginTop: '8px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {optimalCoordinator ? optimalCoordinator.fullName : 'Evaluating...'}
          </div>
          <div style={{ fontSize: '12px', color: '#0284c7', marginTop: '4px', fontWeight: 500 }}>
            {optimalCoordinator ? `Availability: ${optimalCoordinator.availabilityPercentage}% | Workload: ${optimalCoordinator.workloadScore}` : 'Calculating graph weights'}
          </div>
        </div>
      </div>

      {/* ─── STARS Graph Routing Engine Live Visualization ───────────────── */}
      <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#0f172a' }}>
              STARS Graph Routing Engine: Finance Coordinator Nodes
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
              Real-time heuristic evaluation: Active Tasks (1.0x), Overdue Tasks (2.0x), Capacity Max (10.0x). Tasks route automatically to lowest workload score.
            </p>
          </div>
          <span style={{ background: '#eff6ff', color: '#2563eb', padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600 }}>
            Engine Status: Operational
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
          {loadingMetrics ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>Loading Graph Routing metrics...</div>
          ) : routingMetrics.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>No coordinators configured in database.</div>
          ) : (
            routingMetrics.map((coord) => (
              <div
                key={coord.coordinatorId}
                style={{
                  border: coord.isOptimalCandidate ? '2px solid #10b981' : '1px solid #e2e8f0',
                  borderRadius: '10px',
                  padding: '16px',
                  background: coord.isOptimalCandidate ? '#f0fdf4' : '#fafafa',
                  position: 'relative',
                  transition: 'all 0.2s',
                }}
              >
                {coord.isOptimalCandidate && (
                  <span
                    style={{
                      position: 'absolute',
                      top: '12px',
                      right: '12px',
                      background: '#10b981',
                      color: '#fff',
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '12px',
                      letterSpacing: '0.5px',
                    }}
                  >
                    ★ OPTIMAL CANDIDATE
                  </span>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      background: coord.isOptimalCandidate ? '#10b981' : '#94a3b8',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: '14px',
                    }}
                  >
                    {coord.fullName
                      .split(' ')
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join('')}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '14px' }}>{coord.fullName}</div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>Coordinator ID: {coord.coordinatorId}</div>
                  </div>
                </div>

                <div style={{ marginTop: '14px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', textAlign: 'center' }}>
                  <div style={{ background: '#fff', padding: '6px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>Active</div>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>{coord.activeTasksCount}</div>
                  </div>
                  <div style={{ background: '#fff', padding: '6px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>Overdue</div>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: coord.overdueTasksCount > 0 ? '#ef4444' : '#0f172a' }}>
                      {coord.overdueTasksCount}
                    </div>
                  </div>
                  <div style={{ background: '#fff', padding: '6px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>Done</div>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: '#16a34a' }}>{coord.completedTasksCount}</div>
                  </div>
                </div>

                <div style={{ marginTop: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                    <span style={{ color: '#64748b' }}>Availability</span>
                    <span style={{ fontWeight: 600, color: coord.availabilityPercentage > 50 ? '#16a34a' : '#d97706' }}>
                      {coord.availabilityPercentage}%
                    </span>
                  </div>
                  <div style={{ height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${Math.min(coord.availabilityPercentage, 100)}%`,
                        height: '100%',
                        background: coord.availabilityPercentage > 50 ? '#10b981' : '#f59e0b',
                      }}
                    />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ─── Task Filter & View Switcher Bar ────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '14px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', flexWrap: 'wrap', gap: '14px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748b' }}>Status:</span>
          {['All', 'Assigned', 'In Progress', 'Completed'].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                border: statusFilter === s ? '1px solid #10b981' : '1px solid #e2e8f0',
                background: statusFilter === s ? '#f0fdf4' : '#fff',
                color: statusFilter === s ? '#047857' : '#475569',
                fontWeight: 600,
                fontSize: '12px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {s}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Search by task, invoice, client, or coordinator..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              padding: '7px 14px',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              fontSize: '13px',
              width: '280px',
              color: '#1e293b',
            }}
          />

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

      {/* ─── Tasks Content: Cards or Table ───────────────────────────────── */}
      {viewMode === 'cards' ? (
        loadingTasks ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>
            <div style={{ fontSize: '14px', fontWeight: 600 }}>Loading STARS collection tasks...</div>
          </div>
        ) : filteredTasks.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <i className="ti ti-checklist" style={{ fontSize: '42px', display: 'block', marginBottom: '12px', color: '#cbd5e1' }} />
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#334155' }}>No collection follow-up tasks found</div>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>Try adjusting your filters or search query.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '20px' }}>
            {filteredTasks.map((t) => (
              <div
                key={t.taskId}
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
                  {/* Card Header */}
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
                      {t.taskNumber}
                    </span>
                    <StatusBadge status={t.status} />
                  </div>

                  {/* Client & Linked Invoice */}
                  <div style={{ marginBottom: '14px' }}>
                    <h4 style={{ margin: '0 0 6px 0', fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
                      {t.clientName}
                    </h4>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '3px 8px', fontSize: '12px', color: '#2563eb', fontFamily: 'monospace' }}>
                      <i className="ti ti-file-invoice" />
                      {t.invoiceNumber}
                    </div>
                  </div>

                  {/* Amount Due & Overdue */}
                  <div
                    style={{
                      background: '#fff1f2',
                      border: '1px solid #ffe4e6',
                      borderRadius: '10px',
                      padding: '12px 14px',
                      marginBottom: '14px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '11px', color: '#e11d48', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Overdue Balance
                      </div>
                      <div style={{ fontSize: '22px', fontWeight: 800, color: '#be123c', marginTop: '2px' }}>
                        {formatCurrency(t.amountDue)}
                      </div>
                    </div>
                    <span
                      style={{
                        padding: '4px 10px',
                        borderRadius: '20px',
                        fontSize: '12px',
                        fontWeight: 700,
                        background: t.daysOverdue > 30 ? '#fee2e2' : '#fef3c7',
                        color: t.daysOverdue > 30 ? '#dc2626' : '#b45309',
                      }}
                    >
                      {t.daysOverdue} days overdue
                    </span>
                  </div>

                  {/* Coordinator & Outcome Box */}
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 12px', marginBottom: '16px', fontSize: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <span style={{ color: '#64748b', fontWeight: 600 }}>Assigned To:</span>
                      <span style={{ fontWeight: 700, color: '#0f172a' }}>{t.assignedCoordinatorName}</span>
                    </div>
                    {t.outcome ? (
                      <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '6px', marginTop: '6px' }}>
                        <span style={{ color: '#059669', fontWeight: 700 }}>
                          <i className="ti ti-check" style={{ marginRight: '4px' }} />
                          {t.outcome}
                        </span>
                        {t.promisedPaymentDate && (
                          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                            Promise Date: {formatDate(t.promisedPaymentDate)}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '6px', marginTop: '6px', color: '#94a3b8', fontStyle: 'italic' }}>
                        Follow-up action pending
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Action Footer */}
                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '14px', display: 'flex', gap: '8px' }}>
                  <Button
                    title={t.status === 'Completed' ? 'View / Update' : 'Execute Follow-up'}
                    variant={t.status === 'Completed' ? 'secondary' : 'primary'}
                    onClick={() => handleOpenExecuteModal(t)}
                    style={{ flex: 1, ...(t.status !== 'Completed' ? { background: '#059669', borderColor: '#059669' } : {}) }}
                  >
                    <i className="ti ti-edit" style={{ marginRight: '4px' }} />
                    {t.status === 'Completed' ? 'View / Update' : 'Execute Follow-up'}
                  </Button>
                  <button
                    title="Sync Status to STARS"
                    onClick={() => handleSyncToStars(t.invoiceNumber)}
                    style={{
                      background: '#f1f5f9',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      padding: '8px 12px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      color: '#475569',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <i className="ti ti-cloud-upload" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        <TableContainer>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>Collection Follow-Up Tasks</h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>
              Tasks generated automatically from overdue accounts and routed to coordinators via STARS.
            </p>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: '1050px', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                  <th style={{ padding: '14px 18px', fontWeight: 600, whiteSpace: 'nowrap' }}>Task #</th>
                  <th style={{ padding: '14px 18px', fontWeight: 600, whiteSpace: 'nowrap' }}>Invoice #</th>
                  <th style={{ padding: '14px 18px', fontWeight: 600, whiteSpace: 'nowrap' }}>Client Account</th>
                  <th style={{ padding: '14px 18px', fontWeight: 600, whiteSpace: 'nowrap' }}>Amount Due</th>
                  <th style={{ padding: '14px 18px', fontWeight: 600, whiteSpace: 'nowrap' }}>Overdue</th>
                  <th style={{ padding: '14px 18px', fontWeight: 600, whiteSpace: 'nowrap' }}>Assigned Coordinator</th>
                  <th style={{ padding: '14px 18px', fontWeight: 600, whiteSpace: 'nowrap' }}>Status</th>
                  <th style={{ padding: '14px 18px', fontWeight: 600, whiteSpace: 'nowrap' }}>Outcome / Promise</th>
                  <th style={{ padding: '14px 18px', fontWeight: 600, whiteSpace: 'nowrap', textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {loadingTasks ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: '36px', color: '#94a3b8' }}>
                      Loading STARS collection tasks...
                    </td>
                  </tr>
                ) : filteredTasks.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: '36px', color: '#94a3b8' }}>
                      No collection follow-up tasks found matching criteria.
                    </td>
                  </tr>
                ) : (
                  filteredTasks.map((t) => (
                    <tr
                      key={t.taskId}
                      style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}
                    >
                      <td style={{ padding: '14px 18px', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap' }}>
                        <span style={{ fontFamily: 'monospace', background: '#f1f5f9', padding: '3px 8px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                          {t.taskNumber}
                        </span>
                      </td>
                      <td style={{ padding: '14px 18px', whiteSpace: 'nowrap' }}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#2563eb', background: '#eff6ff', padding: '3px 8px', borderRadius: '4px', border: '1px solid #bfdbfe' }}>
                          {t.invoiceNumber}
                        </span>
                      </td>
                      <td style={{ padding: '14px 18px', fontWeight: 600, whiteSpace: 'nowrap' }}>{t.clientName}</td>
                      <td style={{ padding: '14px 18px', fontWeight: 700, color: '#dc2626', whiteSpace: 'nowrap' }}>
                        {formatCurrency(t.amountDue)}
                      </td>
                      <td style={{ padding: '14px 18px', whiteSpace: 'nowrap' }}>
                        <span
                          style={{
                            padding: '3px 10px',
                            borderRadius: '12px',
                            fontSize: '11px',
                            fontWeight: 700,
                            background: t.daysOverdue > 30 ? '#fef2f2' : '#fefce8',
                            color: t.daysOverdue > 30 ? '#ef4444' : '#ca8a04',
                          }}
                        >
                          {t.daysOverdue} days
                        </span>
                      </td>
                      <td style={{ padding: '14px 18px', whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: 600, color: '#0f172a' }}>{t.assignedCoordinatorName}</div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>{t.assignedCoordinatorId}</div>
                      </td>
                      <td style={{ padding: '14px 18px', whiteSpace: 'nowrap' }}>
                        <StatusBadge status={t.status} />
                      </td>
                      <td style={{ padding: '14px 18px', whiteSpace: 'nowrap' }}>
                        {t.outcome ? (
                          <div>
                            <span style={{ fontWeight: 600, color: '#059669', fontSize: '12px' }}>{t.outcome}</span>
                            {t.promisedPaymentDate && (
                              <div style={{ fontSize: '11px', color: '#64748b' }}>
                                Promised: {formatDate(t.promisedPaymentDate)}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '12px' }}>Pending follow-up</span>
                        )}
                      </td>
                      <td style={{ padding: '14px 18px', whiteSpace: 'nowrap', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '6px' }}>
                          <Button
                            title={t.status === 'Completed' ? 'View / Update' : 'Execute Follow-up'}
                            variant={t.status === 'Completed' ? 'secondary' : 'primary'}
                            size="sm"
                            onClick={() => handleOpenExecuteModal(t)}
                          >
                            <i className="ti ti-edit" style={{ marginRight: '4px' }} />
                            {t.status === 'Completed' ? 'View / Update' : 'Execute'}
                          </Button>
                          <button
                            title="Sync Status to STARS"
                            onClick={() => handleSyncToStars(t.invoiceNumber)}
                            style={{
                              background: '#f1f5f9',
                              border: '1px solid #cbd5e1',
                              borderRadius: '6px',
                              padding: '5px 9px',
                              cursor: 'pointer',
                              fontSize: '12px',
                              color: '#475569',
                            }}
                          >
                            <i className="ti ti-cloud-upload" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </TableContainer>
      )}

      {/* ─── Execute Collection Follow-up Modal ──────────────────────────── */}
      {showExecuteModal && selectedTask && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.5)',
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
              maxWidth: '560px',
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '20px 24px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
                  Execute Follow-up: {selectedTask.taskNumber}
                </h3>
                <div style={{ fontSize: '13px', color: '#64748b', marginTop: '2px' }}>
                  Invoice: {selectedTask.invoiceNumber} | {selectedTask.clientName} (
                  {formatCurrency(selectedTask.amountDue)})
                </div>
              </div>
              <button
                onClick={() => setShowExecuteModal(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#94a3b8' }}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleExecuteSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  Action Taken (e.g., Phone Call, Email, Billing Inquiry) *
                </label>
                <textarea
                  rows={2}
                  required
                  placeholder="e.g. Contacted client finance manager via direct call. Verified statement of account..."
                  value={actionTaken}
                  onChange={(e) => setActionTaken(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                    fontFamily: 'inherit',
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                    Follow-Up Outcome *
                  </label>
                  <select
                    value={outcome}
                    onChange={(e) => setOutcome(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '13px',
                      background: '#fff',
                    }}
                  >
                    <option value="Promised to Pay">Promised to Pay</option>
                    <option value="Payment Sent / Bank Advice">Payment Sent / Bank Advice</option>
                    <option value="Dispute Raised">Dispute Raised</option>
                    <option value="Call Scheduled">Follow-up Call Scheduled</option>
                    <option value="Escalated to Head Accountant">Escalated to Head Accountant</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                    Promised Payment Date
                  </label>
                  <input
                    type="date"
                    value={promisedDate}
                    onChange={(e) => setPromisedDate(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '13px',
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  Execution Notes / Resolution Summary
                </label>
                <textarea
                  rows={3}
                  placeholder="Additional notes on check release details, bank transfer reference, or dispute items..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                    fontFamily: 'inherit',
                  }}
                />
              </div>

              <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px', color: '#64748b' }}>
                <span style={{ fontWeight: 600, color: '#334155' }}>Assigned Coordinator:</span> {selectedTask.assignedCoordinatorName} ({selectedTask.assignedCoordinatorId})
                <br />
                <span style={{ fontWeight: 600, color: '#334155' }}>Routing Heuristic:</span> {selectedTask.routingReason}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                <Button title="Cancel" variant="secondary" onClick={() => setShowExecuteModal(false)} type="button">
                  Cancel
                </Button>
                <Button title="Complete & Save Follow-up" variant="primary" type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Recording...' : 'Complete & Save Follow-up'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Dispatch New Follow-up Modal ────────────────────────────────── */}
      {showDispatchModal && canDispatchFollowUp(user?.role) && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.5)',
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
              maxWidth: '500px',
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '20px 24px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
                  Dispatch Follow-Up Task
                </h3>
                <div style={{ fontSize: '13px', color: '#64748b', marginTop: '2px' }}>
                  STARS Graph Routing Engine will automatically assign this to the coordinator with lowest workload.
                </div>
              </div>
              <button
                onClick={() => setShowDispatchModal(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#94a3b8' }}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleDispatchSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  Select Overdue Invoice *
                </label>
                <select
                  required
                  value={dispatchInvoiceNo}
                  onChange={(e) => handleSelectInvoice(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', background: '#fff' }}
                >
                  <option value="">-- Choose an overdue invoice --</option>
                  {overdueInvoices.length === 0 ? (
                    <option value="" disabled>No overdue invoices found in system</option>
                  ) : (
                    overdueInvoices.map((inv: any) => {
                      const no = inv.invoiceNumber || inv.invoiceNo || String(inv.id);
                      const client = inv.clientName || 'Client';
                      const amt = inv.balance ?? inv.totalAmount ?? inv.amount ?? 0;
                      return (
                        <option key={no} value={no}>
                          {no} — {client} (₱{Number(amt).toLocaleString()})
                        </option>
                      );
                    })
                  )}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  Client Account
                </label>
                <input
                  type="text"
                  readOnly
                  placeholder="Auto-filled from selected invoice"
                  value={dispatchClient}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', background: '#f8fafc', color: '#475569' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                    Amount Due (₱)
                  </label>
                  <input
                    type="text"
                    readOnly
                    placeholder="Auto-filled"
                    value={dispatchAmount !== '' ? `₱${Number(dispatchAmount).toLocaleString()}` : ''}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', background: '#f8fafc', color: '#475569' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                    Days Overdue
                  </label>
                  <input
                    type="text"
                    readOnly
                    placeholder="Auto-filled"
                    value={dispatchDaysOverdue !== '' ? `${dispatchDaysOverdue} days` : ''}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', background: '#f8fafc', color: '#475569' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                <Button title="Cancel" variant="secondary" onClick={() => setShowDispatchModal(false)} type="button">
                  Cancel
                </Button>
                <Button title="Route Task via Graph Engine" variant="primary" type="submit" disabled={isSubmitting || !dispatchInvoiceNo}>
                  {isSubmitting ? 'Routing...' : 'Route Task via Graph Engine'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default StarsCollectionWorkflow;
