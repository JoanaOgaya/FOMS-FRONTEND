import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { DataTable } from '../components/DataTable';
import { StatusBadge } from '../components/shared/StatusBadge';
import { Button } from '../components/Buttons';
import { Card } from '../components/Card';
import { InvoiceDocument } from '../components/InvoiceDocument';
import { useQuery } from '../hooks/useQuery';
import { invoicesService } from '../services/invoicesService';
import { clientsService } from '../services/clientsService';
import { paymentsService } from '../services/paymentsService';
import { auditLogsService } from '../services/auditLogsService';
import type { Invoice, Client, Payment } from '../types/entities';
import { useAuth } from '../context/AuthContext';
import { TableContainer } from '../components/TableContainer';
import { useToast } from '../components/ToastContext';
import { ClientInfoCard } from '../components/ClientInfoCard';
import { CalendarPicker } from '../components/FormModals';
import { formatCurrency, formatDate } from '../utils/format';

/** Derive payment status from invoice */
function derivePaymentStatus(inv: Invoice): 'Unpaid' | 'Due Soon' | 'Overdue' | 'Paid' {
  if (inv.status === 'Paid') return 'Paid';
  const now = Date.now();
  const due = new Date(inv.dueDate).getTime();
  const daysUntilDue = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
  if (daysUntilDue < 0) return 'Overdue';
  if (daysUntilDue <= 7) return 'Due Soon';
  return 'Unpaid';
}

export const InvoicingDesk: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const actionParam = searchParams.get('action');

  const { toast } = useToast();
  const { user } = useAuth();

  const { data: invData, refetch: refetchInvoices } = useQuery('desk:invoices', () => invoicesService.list({ pageSize: 100 }));
  const { data: clientData } = useQuery('desk:clients', () => clientsService.list({ pageSize: 100 }));
  const { data: payData } = useQuery('desk:payments', () => paymentsService.list({ pageSize: 100 }));

  const invoices: Invoice[] = invData?.items || [];
  const clients: Client[] = clientData?.items || [];
  const payments: Payment[] = payData?.items || [];

  const canApprove = ['FINANCIAL_MANAGER', 'HEAD_ACCOUNTANT', 'ASSISTANT_FM'].includes(user?.role || '');

  const [isPrintMode, setIsPrintMode] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{ action: string; invId: string } | null>(null);

  let viewInvoice: Invoice | undefined = undefined;
  let viewClient: Client | undefined = undefined;

  if (id) {
    viewInvoice = invoices.find(i => i.id === id);
    if (!viewInvoice) {
      viewClient = clients.find(c => c.id === id);
    }
  }

  const selectedClientId = viewClient ? viewClient.id : null;

  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  // Enrich invoices with derived payment status
  const enrichedInvoices = useMemo(() => {
    const base = selectedClientId
      ? invoices.filter(i => i.clientId === selectedClientId)
      : invoices;

    const activeInvoices = base.filter((inv: Invoice) => {
      if (!['Draft', 'Needs Revision', 'Pending Approval', 'Approved'].includes(inv.status)) return false;
      if (filterDateFrom || filterDateTo) {
        const itemDate = new Date(inv.createdAt);
        itemDate.setHours(0, 0, 0, 0);
        if (filterDateFrom) {
          const fromDate = new Date(filterDateFrom);
          fromDate.setHours(0, 0, 0, 0);
          if (itemDate < fromDate) return false;
        }
        if (filterDateTo) {
          const toDate = new Date(filterDateTo);
          toDate.setHours(23, 59, 59, 999);
          if (itemDate > toDate) return false;
        }
      }
      return true;
    });

    return activeInvoices.map((inv: Invoice) => {
      const client = clients.find(c => c.id === inv.clientId);
      const ps = derivePaymentStatus(inv);
      return {
        ...inv,
        clientName: client?.name ?? inv.clientId,
        waybillCount: inv.waybillIds?.length || 0,
        derivedPaymentStatus: ps,
      };
    });
  }, [invoices, clients, selectedClientId, filterDateFrom, filterDateTo]);

  const allClients: string[] = useMemo(() => {
    return Array.from(new Set(invoices.map((inv: Invoice) => {
      const client = clients.find(c => c.id === inv.clientId);
      return client?.name ?? inv.clientId;
    }))).filter(Boolean);
  }, [invoices, clients]);

  const handleTransition = async (invId: string, newStatus: Invoice['status'], successMsg: string, updates?: Partial<Invoice>) => {
    const inv = invoices.find(i => i.id === invId);
    if (!inv) return;

    try {
      await invoicesService.update(invId, { status: newStatus, ...updates });
      await auditLogsService.create({
        action: 'INVOICE_STATUS_CHANGE',
        module: 'InvoicingDesk',
        recordId: invId,
        recordType: 'Invoice',
        details: `Changed status to ${newStatus}`,
        ipAddress: '127.0.0.1',
      });
      refetchInvoices();
      toast.success(successMsg, 'Success');
      setConfirmModal(null);
    } catch {
      toast.error('Failed to update invoice status.', 'Error');
    }
  };

  const tableColumns = [
    { key: 'invoiceNumber', label: 'Invoice No.', sortable: true },
    { key: 'clientName', label: 'Client', sortable: true },
    { key: 'billingPeriod', label: 'Billing Period' },
    { key: 'waybillCount', label: 'Waybills', render: (row: any) => `${row.waybillCount} waybills` },
    { key: 'createdAt', label: 'Date', render: (row: any) => formatDate(row.createdAt) },
    { key: 'totalAmount', label: 'Total Amount', render: (row: any) => formatCurrency(row.totalAmount) },
    { key: 'status', label: 'Invoice Status', render: (row: any) => <StatusBadge status={row.status} /> },
  ];

  const actions = [
    {
      label: 'View',
      icon: 'ti-eye',
      onClick: (row: any) => navigate(`/invoicing-desk/${row.id}`),
    },
    {
      label: 'Edit Draft',
      icon: 'ti-pencil',
      show: (row: any) => row.status === 'Draft' || row.status === 'Needs Revision',
      onClick: (row: any) => navigate(`/invoice-create?edit=${row.id}`),
    },
    {
      label: 'Submit for Approval',
      icon: 'ti-send',
      show: (row: any) => row.status === 'Draft' || row.status === 'Needs Revision',
      onClick: (row: any) => handleTransition(row.id, 'Pending Approval', `Invoice ${row.invoiceNumber} submitted for approval`),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {selectedClientId && viewClient ? (
        <ClientInfoCard client={viewClient} onBack={() => navigate('/invoicing-desk')} />
      ) : null}

      {viewInvoice ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Button title="Back to Invoices" variant="secondary" icon="ti-arrow-left" onClick={() => navigate('/invoicing-desk')} />
            <div style={{ display: 'flex', gap: 8 }}>
              {(viewInvoice.status === 'Draft' || viewInvoice.status === 'Needs Revision') && (
                <Button title="Edit Invoice" variant="secondary" icon="ti-pencil" onClick={() => navigate(`/invoice-create?edit=${viewInvoice?.id}`)} />
              )}
              {viewInvoice.status === 'Approved' && (
                <Button title="Mark as Sent" variant="primary" icon="ti-send" onClick={() => handleTransition(viewInvoice!.id, 'Sent', 'Invoice marked as sent')} />
              )}
            </div>
          </div>
          <Card>
            <InvoiceDocument invoice={viewInvoice} />
          </Card>
        </div>
      ) : (
        <TableContainer>
          <DataTable
            title="Invoicing Desk"
            data={enrichedInvoices}
            columns={tableColumns}
            actions={actions}
            rowKey="id"
            searchPlaceholder="Search invoices..."
            searchFields={['invoiceNumber', 'clientName']}
            createButtons={[
              {
                label: 'Create Invoice',
                icon: 'ti-plus',
                onClick: () => navigate('/invoice-create'),
              }
            ]}
            filters={[
              {
                key: 'clientName',
                label: 'All Clients',
                options: allClients.map(c => ({ label: c, value: c })),
              },
              {
                key: 'status',
                label: 'Invoice Status',
                options: [
                  { label: 'Draft', value: 'Draft' },
                  { label: 'Pending Approval', value: 'Pending Approval' },
                  { label: 'Approved', value: 'Approved' },
                  { label: 'Needs Revision', value: 'Needs Revision' },
                ],
              }
            ]}
            customFilters={
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <CalendarPicker
                  label="From:"
                  placeholder="Start date..."
                  value={filterDateFrom}
                  onChange={date => {
                    if (filterDateTo && date > filterDateTo) {
                      toast.error('Start date cannot be later than end date.');
                      return;
                    }
                    setFilterDateFrom(date);
                  }}
                  maxDate={filterDateTo}
                />
                <CalendarPicker
                  label="To:"
                  placeholder="End date..."
                  value={filterDateTo}
                  onChange={date => {
                    if (filterDateFrom && date < filterDateFrom) {
                      toast.error('End date cannot be earlier than start date.');
                      return;
                    }
                    setFilterDateTo(date);
                  }}
                  minDate={filterDateFrom}
                />
              </div>
            }
          />
        </TableContainer>
      )}
    </div>
  );
};

export default InvoicingDesk;
