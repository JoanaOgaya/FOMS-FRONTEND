import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Button from '../components/Buttons';
import { DataTable } from '../components/DataTable';
import { TableContainer } from '../components/TableContainer';
import { ClientInfoCard } from '../components/ClientInfoCard';
import { Card } from '../components/Card';
import { useToast } from '../components/ToastContext';
import { useQuery } from '../hooks/useQuery';
import { useApiMutation } from '../hooks/useApiMutation';
import { queryKeys } from '../services/queryKeys';
import { ratesService } from '../services/ratesService';
import { clientsService } from '../services/clientsService';
import { getApiStatus, getRecordErrorMessage } from '../utils/apiErrors';
import type { BillingRate, Client } from '../types/entities';

export const RateConfiguration: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const selectedClientId = id;
  const { toast } = useToast();

  const { data: ratesData, refetch: refetchRates } = useQuery(queryKeys.rates.list({ pageSize: 100 }), () => ratesService.list({ pageSize: 100 }));
  const { data: clientsData } = useQuery('clients', () => clientsService.list({ pageSize: 100 }));

  const billingRates: BillingRate[] = ratesData?.items || [];
  const clients: Client[] = clientsData?.items || [];

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalData, setModalData] = useState<Partial<BillingRate>>({});
  const [originalModalData, setOriginalModalData] = useState<Partial<BillingRate> | null>(null);
  const [selectedRateId, setSelectedRateId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const rateDetailQuery = useQuery(
    selectedRateId ? queryKeys.rates.detail(selectedRateId) : null,
    () => ratesService.get(selectedRateId!),
  );
  const updateRateMutation = useApiMutation(
    (rateId: string, payload: Partial<BillingRate>) => ratesService.update(rateId, payload),
    { mutation: 'updateRate' },
  );
  const isRateDirty = Boolean(originalModalData && JSON.stringify(modalData) !== JSON.stringify(originalModalData));
  const regionOptions = Array.from(new Set(billingRates.map(rate => rate.region).filter(Boolean)));

  useEffect(() => {
    if (isModalOpen && selectedRateId && rateDetailQuery.data) {
      setModalData(rateDetailQuery.data);
      setOriginalModalData(rateDetailQuery.data);
    }
  }, [isModalOpen, selectedRateId, rateDetailQuery.data]);

  // Combine Rates with Client Data for the top-level list
  let groupedClients: any[] = [];
  if (!selectedClientId) {
    groupedClients = clients.map((client: Client) => {
      const clientRates = billingRates.filter((r: BillingRate) => r.clientId === client.id && r.status === 'Active');
      return {
        id: client.id,
        clientId: client.id,
        clientName: client.name,
        configuredAreas: clientRates.length > 0 ? clientRates.map((r: BillingRate) => r.region).join(', ') : 'None',
        vatStatus: client.vatStatus,
        vatRateDisplay: client.vatRate !== null && client.vatRate !== undefined ? `${(client.vatRate * 100).toFixed(0)}%` : '—',
        agreedSchedule: client.billingSchedule,
      };
    });
  }

  const tableColumns = [
    {
      key: 'clientName', label: 'CLIENT NAME', render: (row: any) => (
        !selectedClientId ? (
          <span onClick={() => navigate(`/rate-configuration/${row.clientId}`)} style={{ color: '#0F172A', fontWeight: 700, cursor: 'pointer', textDecoration: 'none' }}>
            {row.clientName}
          </span>
        ) : (
          <span style={{ fontWeight: 600 }}>{row.clientName}</span>
        )
      )
    },
    { key: 'configuredAreas', label: 'CONFIGURED AREAS' },
    { key: 'vatStatus', label: 'VAT STATUS' },
    { key: 'vatRateDisplay', label: 'VAT RATE' },
    { key: 'agreedSchedule', label: 'AGREED SCHEDULE' }
  ];

  const openModal = (rate?: BillingRate) => {
    setFormError(null);
    if (rate) {
      setSelectedRateId(rate.id);
      setModalData(rate);
      setOriginalModalData(rate);
    } else {
      setSelectedRateId(null);
      const client = clients.find((c: Client) => c.id === selectedClientId);
      const initialData: Partial<BillingRate> = {
        clientId: selectedClientId,
        minimumWeight: 5,
        minimumRate: 100,
        excessRate: 25,
        valuationRate: 0.01,
        fuelSurchargeRate: 0.15,
        vatRate: client?.vatRate || 0.12,
        effectiveDate: new Date().toISOString().split('T')[0],
      };
      if (regionOptions.length === 1) initialData.region = regionOptions[0];
      setModalData(initialData);
      setOriginalModalData(initialData);
    }
    setIsModalOpen(true);
  };

  const handleSaveRate = async () => {
    if (isSaving) return;
    if (!modalData.region || (!regionOptions.includes(modalData.region) && modalData.region !== originalModalData?.region)) {
      setFormError('A service area option returned by the API is required.');
      return;
    }
    if (![modalData.minimumWeight, modalData.minimumRate, modalData.excessRate].every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0)) {
      setFormError('Minimum weight, minimum rate, and excess rate must be valid non-negative numbers.');
      return;
    }

    setIsSaving(true);
    setFormError(null);
    try {
      const isExisting = billingRates.some((r: BillingRate) => r.id === modalData.id);
      if (isExisting && modalData.id) {
        await updateRateMutation.mutateAsync(modalData.id, modalData);
        toast.success('Billing Rate updated successfully.');
      } else {
        await ratesService.create(modalData);
        await refetchRates();
        toast.success('New Billing Rate created successfully.');
      }
      setIsModalOpen(false);
    } catch (error: unknown) {
      setFormError(getRecordErrorMessage(error));
      if (getApiStatus(error) === 409 && selectedRateId) {
        await rateDetailQuery.refetch();
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (selectedClientId && clients.find((c: Client) => c.id === selectedClientId)) {
    const client = clients.find((c: Client) => c.id === selectedClientId)!;
    const clientRates = billingRates.filter((r: BillingRate) => r.clientId === selectedClientId && r.status === 'Active');

    const inputStyle: React.CSSProperties = {
      padding: '8px 10px', border: '1px solid #E2E8F0', borderRadius: 8,
      fontSize: '0.85rem', color: '#0F172A', width: '100%', boxSizing: 'border-box', background: '#F8FAFC'
    };

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', position: 'relative' }}>
        <ClientInfoCard client={client} onBack={() => navigate('/rate-configuration')} />

        <Card>
          <div style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i className="ti ti-table" style={{ fontSize: 20, color: '#3B82F6' }} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0F172A' }}>Client Billing Rate Configuration</h3>
                  <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#64748B' }}>Configure specific rates per area for this client.</p>
                </div>
              </div>
              <Button title="Add Billing Rate" icon="ti-plus" variant="primary" onClick={() => openModal()} />
            </div>

            {clientRates.length === 0 ? (
              <div style={{ padding: '32px', textAlign: 'center', color: '#64748B', background: '#F8FAFC', borderRadius: 8 }}>
                No active billing rates configured for this client.
              </div>
            ) : (
              <div style={{ border: '1px solid #E2E8F0', borderRadius: 10, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                  <thead>
                    <tr style={{ background: '#0F172A', color: '#fff' }}>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase' }}>Service Area</th>
                      <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase' }}>Min. Weight</th>
                      <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase' }}>Minimum Rate</th>
                      <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase' }}>Excess/Kg</th>
                      <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase' }}>Valuation</th>
                      <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase' }}>Fuel Surcharge</th>
                      <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase' }}>VAT</th>
                      <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientRates.map((ar: BillingRate, i: number) => (
                      <tr key={ar.id} style={{ background: i % 2 === 0 ? '#fff' : '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                        <td style={{ padding: '14px 16px', fontWeight: 700, color: '#0F172A' }}>{ar.region}</td>
                        <td style={{ padding: '14px 16px', textAlign: 'center' }}>{ar.minimumWeight} kg</td>
                        <td style={{ padding: '14px 16px', textAlign: 'center', color: '#059669', fontWeight: 700 }}>₱{ar.minimumRate.toFixed(2)}</td>
                        <td style={{ padding: '14px 16px', textAlign: 'center', color: '#DC2626', fontWeight: 700 }}>+₱{ar.excessRate.toFixed(2)}</td>
                        <td style={{ padding: '14px 16px', textAlign: 'center' }}>{(ar.valuationRate * 100).toFixed(0)}%</td>
                        <td style={{ padding: '14px 16px', textAlign: 'center' }}>{(ar.fuelSurchargeRate * 100).toFixed(0)}%</td>
                        <td style={{ padding: '14px 16px', textAlign: 'center' }}>{(ar.vatRate * 100).toFixed(0)}%</td>
                        <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                          <button onClick={() => openModal(ar)} style={{ background: 'none', border: 'none', color: '#3B82F6', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>Edit</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Card>

        {isModalOpen && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#fff', borderRadius: 12, width: '500px', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', maxHeight: '90vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#0F172A' }}>
                  {billingRates.some((r: BillingRate) => r.id === modalData.id) ? 'Edit Client Billing Rate' : 'Add Client Billing Rate'}
                </h2>
                <i className="ti ti-x" role="button" aria-label="Close billing rate editor" style={{ cursor: 'pointer', fontSize: 20, color: '#64748B' }} onClick={() => {
                  if (!isRateDirty || window.confirm('Discard changes?')) setIsModalOpen(false);
                }} />
              </div>

              {selectedRateId && rateDetailQuery.isLoading && (
                <div role="status" style={{ color: '#64748B', marginBottom: 12 }}>Refreshing billing rate details…</div>
              )}
              {selectedRateId && rateDetailQuery.error && (
                <div role="alert" style={{ color: '#B91C1C', marginBottom: 12 }}>
                  {getRecordErrorMessage(rateDetailQuery.error)}
                  <Button variant="secondary" onClick={() => void rateDetailQuery.refetch()} title="Retry loading" />
                </div>
              )}
              {formError && (
                <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', padding: '12px', borderRadius: 8, fontSize: '0.85rem', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <i className="ti ti-alert-circle" style={{ fontSize: 16 }} />
                  {formError}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: 6 }}>Service Area / Destination</label>
                  <select
                    value={modalData.region || ''}
                    onChange={e => setModalData({ ...modalData, region: e.target.value as BillingRate['region'] })}
                    style={inputStyle}
                  >
                    <option value="">Select service area</option>
                    {modalData.region && !regionOptions.includes(modalData.region) && (
                      <option value={modalData.region}>{modalData.region} (not in current options)</option>
                    )}
                    {regionOptions.map(option => <option key={option} value={option}>{option}</option>)}
                  </select>
                  {modalData.region && !regionOptions.includes(modalData.region) && (
                    <span style={{ color: '#92400E', fontSize: '0.75rem' }}>This saved service area is not in the current API options.</span>
                  )}
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: 6 }}>Min. Weight (kg)</label>
                  <input type="number" min={0} value={modalData.minimumWeight ?? ''} onChange={e => setModalData({ ...modalData, minimumWeight: Number(e.target.value) })} style={inputStyle} />
                </div>
                
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: 6 }}>Minimum Rate (₱) *</label>
                  <input type="number" min={0} value={modalData.minimumRate ?? ''} onChange={e => setModalData({ ...modalData, minimumRate: Number(e.target.value) })} style={inputStyle} />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: 6 }}>Excess Rate / kg (₱) *</label>
                  <input type="number" min={0} value={modalData.excessRate ?? ''} onChange={e => setModalData({ ...modalData, excessRate: Number(e.target.value) })} style={inputStyle} />
                </div>
                
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: 6 }}>Valuation Rate (Decimal)</label>
                  <input type="number" step="0.01" value={modalData.valuationRate ?? ''} onChange={e => setModalData({ ...modalData, valuationRate: Number(e.target.value) })} style={inputStyle} />
                </div>
                
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: 6 }}>Fuel Surcharge (Decimal)</label>
                  <input type="number" step="0.01" value={modalData.fuelSurchargeRate ?? ''} onChange={e => setModalData({ ...modalData, fuelSurchargeRate: Number(e.target.value) })} style={inputStyle} />
                </div>
                
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: 6 }}>VAT Rate (Decimal)</label>
                  <input type="number" step="0.01" value={modalData.vatRate ?? ''} onChange={e => setModalData({ ...modalData, vatRate: Number(e.target.value) })} style={inputStyle} />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24 }}>
                <Button variant="secondary" onClick={() => {
                  if (!isRateDirty || window.confirm('Discard changes?')) setIsModalOpen(false);
                }} title="Cancel" />
                <Button variant="primary" onClick={handleSaveRate} title="Save Rate Configuration" disabled={isSaving || (Boolean(selectedRateId) && !isRateDirty)} loading={isSaving} />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <TableContainer>
        <DataTable
          title=""
          data={groupedClients}
          columns={tableColumns}
          rowKey="id"
          columnToggle={true}
          densityToggle={true}
          exportable={false}
        />
      </TableContainer>
    </div>
  );
};

export default RateConfiguration;
