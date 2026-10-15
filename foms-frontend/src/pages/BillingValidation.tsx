import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ToastContext';
import { useQuery } from '../hooks/useQuery';
import { waybillsService } from '../services/waybillsService';
import { ratesService } from '../services/ratesService';
import { clientsService } from '../services/clientsService';
import { DataTable } from '../components/DataTable';
import { StatusBadge } from '../components/shared/StatusBadge';
import { Button } from '../components/Buttons';
import { Card } from '../components/Card';
import { TableContainer } from '../components/TableContainer';
import { computeFreightCost } from '../utils/billing';
import { formatCurrency, formatDate } from '../utils/format';
import type { BillingRecord, Waybill, BillingRate, Client } from '../types/entities';

export const BillingValidation: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: waybillsData, refetch: refetchWaybills } = useQuery('billing:waybills', () => waybillsService.list({ pageSize: 100 }));
  const { data: ratesData } = useQuery('billing:rates', () => ratesService.list({ pageSize: 100 }));
  const { data: clientsData } = useQuery('billing:clients', () => clientsService.list({ pageSize: 100 }));
  const { data: recordsData, refetch: refetchRecords } = useQuery('billing:records', () => ratesService.records.list({ pageSize: 100 }));

  const waybills: Waybill[] = waybillsData?.items || [];
  const billingRates: BillingRate[] = ratesData?.items || [];
  const clients: Client[] = clientsData?.items || [];

  const [billingRecords, setBillingRecords] = useState<BillingRecord[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    if (recordsData?.items) {
      setBillingRecords(recordsData.items);
    }
  }, [recordsData?.items]);

  const isHead = user?.role === 'HEAD_ACCOUNTANT' || user?.role === 'FINANCIAL_MANAGER';

  // 1. Validated Waybills WITHOUT Billing Records (For Accountant to Submit)
  const availableWaybills = waybills.filter(wb => 
    wb.status === 'Validated' && 
    !billingRecords.some(br => br.waybillId === wb.id)
  );

  // 2. Billing Records in Pending Review (For Head Accountant to Approve/Reject)
  const pendingRecords = billingRecords.filter(br => br.status === 'Pending Review');

  const handleSubmitBilling = () => {
    if (selectedIds.length === 0) return;
    
    let successCount = 0;
    let errorCount = 0;
    const newRecords: BillingRecord[] = [];

    selectedIds.forEach(wbId => {
      const wb = waybills.find(w => w.id === wbId);
      if (!wb) return;
      
      try {
        const clientRates = billingRates.filter(r => r.clientId === wb.clientCode && r.status === 'Active');
        const freightData = computeFreightCost(wb, clientRates);
        const rateUsed = clientRates.find(r => r.region.toUpperCase() === (wb.destinationArea || 'NCR').toUpperCase());
        
        if (rateUsed) {
          const newRecord: BillingRecord = {
            id: `BR-${Date.now()}-${wbId}`,
            waybillId: wbId,
            clientId: wb.clientCode,
            rateId: rateUsed.id,
            volumeWeight: freightData.volumeWeight,
            actualWeight: freightData.actualWeight,
            chargeableWeight: freightData.chargeableWeight,
            freightCost: freightData.freightCost,
            valuation: freightData.valuation,
            odaCharge: freightData.odaCharge,
            subtotal: freightData.subtotal,
            vat: freightData.vat,
            fuelSurcharge: freightData.fuelSurcharge,
            grandTotal: freightData.grandTotal,
            status: 'Pending Review',
            computedBy: user?.fullName || 'User',
            computedAt: new Date().toISOString(),
          };
          newRecords.push(newRecord);
          successCount++;
        }
      } catch {
        errorCount++;
      }
    });

    if (newRecords.length > 0) {
      setBillingRecords(prev => [...prev, ...newRecords]);
    }

    if (successCount > 0) toast.success(`Submitted ${successCount} billing records for review.`, 'Success');
    if (errorCount > 0) toast.error(`Failed to compute ${errorCount} records. Check billing rates.`, 'Error');
    
    setSelectedIds([]);
  };

  const handleApprove = (recordId: string) => {
    setBillingRecords(prev => prev.map(r => r.id === recordId ? {
      ...r,
      status: 'Approved',
      reviewedBy: user?.fullName,
      reviewedAt: new Date().toISOString()
    } : r));
    toast.success('Billing record approved.', 'Success');
  };

  const handleReject = (recordId: string) => {
    setBillingRecords(prev => prev.map(r => r.id === recordId ? {
      ...r,
      status: 'Returned'
    } : r));
    toast.info('Billing record returned for revision.', 'Returned');
  };

  const isMisty = user?.employeeId === 'EMP-002' || user?.role === 'HEAD_ACCOUNTANT';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {!isHead && (
        <Card>
          <div style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0F172A', margin: 0 }}>Unbilled Waybills</h2>
              <Button title="Compute & Submit" variant="primary" icon="ti-calculator" onClick={handleSubmitBilling} disabled={selectedIds.length === 0} />
            </div>
            <TableContainer>
              <DataTable
                title=""
                data={availableWaybills.map(wb => {
                  const client = clients.find(c => c.id === wb.clientCode);
                  let amount = 0;
                  try {
                    amount = computeFreightCost(wb, billingRates).grandTotal;
                  } catch {}
                  return {
                    ...wb,
                    clientName: client?.name || wb.clientCode,
                    estimatedAmount: amount,
                  };
                })}
                columns={[
                  { key: 'waybillNumber', label: 'Waybill No.', sortable: true },
                  { key: 'clientName', label: 'Client', sortable: true },
                  { key: 'deliveryDate', label: 'Delivery Date', render: (row: any) => formatDate(row.deliveryDate) },
                  { key: 'estimatedAmount', label: 'Estimated Freight', render: (row: any) => formatCurrency(row.estimatedAmount) }
                ]}
                rowKey="id"
                selectable={true}
                selectedKeys={selectedIds}
                onSelectionChange={(keys) => setSelectedIds(keys.map(String))}
              />
            </TableContainer>
          </div>
        </Card>
      )}

      {isHead && (
        isMisty ? (
          <TableContainer>
            <DataTable
              data={pendingRecords.map(br => {
                const wb = waybills.find(w => w.id === br.waybillId);
                const client = clients.find(c => c.id === br.clientId);
                return {
                  ...br,
                  waybillNumber: wb?.waybillNumber || br.waybillId,
                  clientName: client?.name || br.clientId,
                };
              })}
              columns={[
                { key: 'waybillNumber', label: 'Waybill No.', sortable: true },
                { key: 'clientName', label: 'Client', sortable: true },
                { key: 'grandTotal', label: 'Computed Amount', render: (row: any) => formatCurrency(row.grandTotal) },
                { key: 'status', label: 'Status', render: (row: any) => <StatusBadge status={row.status} /> }
              ]}
              actions={[
                { label: 'Approve', icon: 'ti-check', onClick: (row: any) => handleApprove(row.id) },
                { label: 'Reject', icon: 'ti-x', onClick: (row: any) => handleReject(row.id) }
              ]}
              rowKey="id"
            />
          </TableContainer>
        ) : (
          <Card>
            <div style={{ padding: '24px' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0F172A', marginBottom: '16px', marginTop: 0 }}>Pending Billing Approvals</h2>
              <TableContainer>
                <DataTable
                  title=""
                  data={pendingRecords.map(br => {
                    const wb = waybills.find(w => w.id === br.waybillId);
                    const client = clients.find(c => c.id === br.clientId);
                    return {
                      ...br,
                      waybillNumber: wb?.waybillNumber || br.waybillId,
                      clientName: client?.name || br.clientId,
                    };
                  })}
                  columns={[
                    { key: 'waybillNumber', label: 'Waybill No.', sortable: true },
                    { key: 'clientName', label: 'Client', sortable: true },
                    { key: 'grandTotal', label: 'Computed Amount', render: (row: any) => formatCurrency(row.grandTotal) },
                    { key: 'status', label: 'Status', render: (row: any) => <StatusBadge status={row.status} /> }
                  ]}
                  actions={[
                    { label: 'Approve', icon: 'ti-check', onClick: (row: any) => handleApprove(row.id) },
                    { label: 'Reject', icon: 'ti-x', onClick: (row: any) => handleReject(row.id) }
                  ]}
                  rowKey="id"
                />
              </TableContainer>
            </div>
          </Card>
        )
      )}
    </div>
  );
};

export default BillingValidation;
