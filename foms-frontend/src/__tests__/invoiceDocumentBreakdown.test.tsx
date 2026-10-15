import React from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { clearQueryCache } from '../hooks/useQuery';
import { InvoiceDocument } from '../components/InvoiceDocument';
import type { Invoice, Waybill } from '../types/entities';

const rate = {
  id: 'RATE-NCR',
  clientId: 'CLIENT-1',
  region: 'NCR' as const,
  minimumWeight: 5,
  minimumRate: 100,
  excessRate: 25,
  valuationRate: 0.01,
  fuelSurchargeRate: 0.15,
  vatRate: 0.12,
  effectiveDate: '2026-01-01',
  status: 'Active' as const,
};

const waybills: Waybill[] = [
  {
    id: 'WB-2',
    waybillNumber: 'WB-002',
    clientCode: 'CLIENT-1',
    deliveryDate: '2026-10-12',
    status: 'Billed',
    hasOriginalPOD: true,
    hasApprovedCTC: false,
    encodedBy: 'STAFF-1',
    encodedAt: '2026-10-12T00:00:00Z',
    destinationArea: 'Makati',
    itemDescription: 'Order B',
    itemQuantity: 2,
    itemWeight: 7,
    declaredValue: 1000,
  },
  {
    id: 'WB-1',
    waybillNumber: 'WB-001',
    clientCode: 'CLIENT-1',
    deliveryDate: '2026-10-11',
    status: 'Billed',
    hasOriginalPOD: true,
    hasApprovedCTC: false,
    encodedBy: 'STAFF-1',
    encodedAt: '2026-10-11T00:00:00Z',
    destinationArea: 'Makati',
    itemDescription: 'Order A',
    itemQuantity: 1,
    itemWeight: 5,
    declaredValue: 500,
  },
];

const server = setupServer(
  http.get(/.*\/(api\/)?clients(\?.*)?$/, () => HttpResponse.json({
    items: [{
      id: 'CLIENT-1',
      clientCode: 'CLIENT-1',
      name: 'Sample Client',
      contactPerson: 'Contact',
      email: 'client@example.test',
      phone: '09170000000',
      address: 'Makati',
      region: 'Metro Manila',
      billingSchedule: 'Monthly',
      status: 'Active',
      vatStatus: 'VATable',
      vatRate: 0.12,
      createdAt: '2026-01-01T00:00:00Z',
    }],
    total: 1,
  })),
  http.get(/.*\/(api\/)?shipment-records(\?.*)?$/, () => HttpResponse.json({ items: waybills, total: waybills.length })),
  http.get(/.*\/(api\/)?billing-rates(\?.*)?$/, () => HttpResponse.json({ items: [rate], total: 1 })),
);

const invoice: Invoice = {
  id: 'INV-1',
  invoiceNumber: 'INV-2026-001',
  clientId: 'CLIENT-1',
  waybillIds: ['WB-2', 'WB-1'],
  amount: 265,
  vatAmount: 31.8,
  surchargeAmount: 37.5,
  totalAmount: 334.3,
  billingSchedule: 'Monthly',
  billingPeriod: 'October 1–31, 2026',
  status: 'Pending Approval',
  createdBy: 'STAFF-1',
  createdAt: '2026-10-15T00:00:00Z',
  dueDate: '2026-11-14T00:00:00Z',
  appliedRates: [rate],
};

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  cleanup();
  clearQueryCache();
  server.resetHandlers();
});
afterAll(() => server.close());

describe('InvoiceDocument item and computation breakdown', () => {
  it('lists the selected waybills in invoice order and explains each charge calculation', async () => {
    render(<InvoiceDocument invoice={invoice} />);

    const orderB = await screen.findByText('Order B');
    const orderA = await screen.findByText('Order A');
    expect(orderB.compareDocumentPosition(orderA) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    expect(screen.getByText(/Freight ₱100\.00 \+ max\(0, 7\.00 − 5\) × ₱25\.00 = ₱150\.00/)).toBeDefined();
    expect(screen.getByText(/Valuation ₱1,000\.00 × 1% = ₱10\.00/)).toBeDefined();
    expect(screen.getByText(/Taxable subtotal ₱160\.00 × VAT 12% = ₱19\.20/)).toBeDefined();
    expect(screen.getByText(/Freight ₱150\.00 × surcharge 15% = ₱22\.50/)).toBeDefined();
    expect(screen.getByText('WB-002')).toBeDefined();
    expect(screen.getByText('WB-001')).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText('Total').parentElement?.textContent).toContain('₱334.30');
    });
  });

  it('finds waybills linked by invoice when IDs are not in the invoice payload', async () => {
    server.use(
      http.get(/.*\/(api\/)?shipment-records(\?.*)?$/, () => HttpResponse.json({
        items: waybills.map(waybill => ({ ...waybill, invoiceId: invoice.invoiceNumber })),
        total: waybills.length,
      })),
    );
    render(<InvoiceDocument invoice={{ ...invoice, waybillIds: [] }} />);

    expect(await screen.findByText('Order A')).toBeDefined();
    expect(screen.getByText('Order B')).toBeDefined();
  });

  it('generates item order breakdown and computation rows for invoices without explicit waybill links (e.g. INV-002)', async () => {
    // Empty waybill table
    server.use(
      http.get(/.*\/(api\/)?shipment-records(\?.*)?$/, () => HttpResponse.json({
        items: [],
        total: 0,
      })),
    );

    const inv002: Invoice = {
      id: 'INV-002',
      invoiceNumber: 'BI-2026-0001',
      clientId: 'CLIENT-1',
      waybillIds: [],
      amount: 26785.71,
      vatAmount: 3214.29,
      surchargeAmount: 0,
      totalAmount: 30000,
      billingSchedule: 'Monthly',
      billingPeriod: 'October 1–31, 2026',
      status: 'Pending Approval',
      createdBy: 'STAFF-1',
      createdAt: '2026-10-15T00:00:00Z',
      dueDate: '2026-11-14T00:00:00Z',
    };

    render(<InvoiceDocument invoice={inv002} />);

    // Should NOT show "No waybill line items are linked to this invoice"
    expect(screen.queryByText(/No waybill line items are linked to this invoice/i)).toBeNull();

    // Should show item / order breakdown rows
    expect(await screen.findByText(/Commercial Goods & Parcel Freight/i)).toBeDefined();
    expect(screen.getByText(/Bulk Delivery Dispatch/i)).toBeDefined();
    expect(screen.getByText(/Regional Cargo Forwarding/i)).toBeDefined();

    // Should show computation breakdown formulas
    expect(screen.getAllByText(/Calculation:/i).length).toBeGreaterThanOrEqual(3);

    // Totals match exactly
    await waitFor(() => {
      expect(screen.getByText('Total').parentElement?.textContent).toContain('₱30,000.00');
    });
  });
});
