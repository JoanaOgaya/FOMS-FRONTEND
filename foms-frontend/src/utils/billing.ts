// ─── SPEEDEX FREIGHT BILLING COMPUTATION ENGINE ──────────────────────────────
// Formula based on official rate matrix:
//
// AREA       | MINIMUM (5 kgs) | EXCESS PER KG
// -----------|-----------------|--------------
// NCR/METRO  |  ₱100           |  ₱25 / kg
// LUZON      |  ₱130           |  ₱45 / kg
// VISAYAS    |  ₱150           |  ₱50 / kg
// MINDANAO   |  ₱150           |  ₱50 / kg
//
// Chargeable weight = whichever is HIGHER between:
//   - Actual weight (kg)
//   - Volume weight = (L cm × W cm × H cm × #boxes) / 3500
//
// Full Breakdown:
//   Freight Cost    = MinRate + max(0, chargeableWeight - 5) × ExcessRate
//   Valuation       = declaredValue × 1%
//   ODA             = user-defined flat or 0 if not ODA
//   Subtotal        = FreightCost + Valuation + ODA
//   12% VAT         = Subtotal × 12%
//   Fuel Surcharge  = FreightCost × 15%
//   GRAND TOTAL     = Subtotal + VAT + FuelSurcharge

import type { BillingRate } from '../types/entities';

export interface FreightBreakdown {
  area: string;
  actualWeight: number;
  volumeWeight: number;
  chargeableWeight: number;
  weightBasis: 'Actual Weight' | 'Volume Weight';
  minimumRate: number;
  excessRate: number;
  excessKgs: number;
  freightCost: number;
  declaredValue: number;
  valuation: number;        // declaredValue × valuationRate
  odaCharge: number;
  subtotal: number;         // freightCost + valuation + odaCharge
  vat: number;              // subtotal × vatRate
  fuelSurcharge: number;    // freightCost × fuelSurchargeRate
  grandTotal: number;       // subtotal + vat + fuelSurcharge
  calculatedAmount: number; // alias for grandTotal (for legacy compat)
}

export function detectArea(waybill: any): string {
  const dest = (waybill.destinationArea || waybill.receiverAddress || '').toUpperCase();
  if (
    dest.includes('METRO MANILA') || dest.includes('NCR') ||
    dest.includes('MAKATI') || dest.includes('TAGUIG') ||
    dest.includes('QUEZON CITY') || dest.includes('MANILA') ||
    dest.includes('PASIG') || dest.includes('PARANAQUE') ||
    dest.includes('CALOOCAN') || dest.includes('MANDALUYONG') ||
    dest.includes('MARIKINA') || dest.includes('MALABON') ||
    dest.includes('NAVOTAS') || dest.includes('VALENZUELA') ||
    dest.includes('LAS PINAS') || dest.includes('MUNTINLUPA') ||
    dest.includes('PATEROS') || dest.includes('SAN JUAN')
  ) return 'NCR';

  if (
    dest.includes('CEBU') || dest.includes('ILOILO') ||
    dest.includes('BACOLOD') || dest.includes('DUMAGUETE') ||
    dest.includes('TACLOBAN') || dest.includes('LEYTE') ||
    dest.includes('SAMAR') || dest.includes('NEGROS') ||
    dest.includes('VISAYAS') || dest.includes('BOHOL') ||
    dest.includes('AKLAN') || dest.includes('CAPIZ')
  ) return 'Visayas';

  if (
    dest.includes('DAVAO') || dest.includes('CAGAYAN DE ORO') ||
    dest.includes('CDO') || dest.includes('ZAMBOANGA') ||
    dest.includes('GENERAL SANTOS') || dest.includes('COTABATO') ||
    dest.includes('ILIGAN') || dest.includes('MINDANAO') ||
    dest.includes('BUKIDNON') || dest.includes('MISAMIS') ||
    dest.includes('LANAO') || dest.includes('MAGUINDANAO')
  ) return 'Mindanao';

  return 'Luzon'; // default
}

export function computeFreightCost(waybill: any, clientRates: BillingRate[]): FreightBreakdown {
  let area = waybill.isODA ? 'ODA' : detectArea(waybill);
  
  // Find applicable rate config for the client
  let rateConfig = clientRates.find(r => r.region.toUpperCase() === area.toUpperCase() && r.status === 'Active');
  
  // If no rate configuration is found in database for this client/area, use empty zeroed rate (no mock/hardcoded fallback)
  if (!rateConfig) {
    const allRate = clientRates.find(r => r.clientId === 'ALL' && r.status === 'Active');
    rateConfig = allRate || {
      id: 'NONE',
      clientId: waybill.clientCode || 'UNKNOWN',
      region: area as any,
      minimumWeight: 0,
      minimumRate: 0,
      excessRate: 0,
      valuationRate: 0,
      fuelSurchargeRate: 0,
      vatRate: 0,
      effectiveDate: new Date().toISOString(),
      status: 'Active'
    };
  }

  // ── Parse actual weight ───────────────────────────────────────────────
  let actualWeight = 0;
  if (typeof waybill.itemWeight === 'string') {
    actualWeight = parseFloat(waybill.itemWeight.replace(/[^0-9.]/g, '')) || 0;
  } else if (typeof waybill.itemWeight === 'number') {
    actualWeight = waybill.itemWeight;
  }

  // ── Compute volume weight: L × W × H × boxes / 3500 ─────────────────
  let volumeWeight = 0;
  if (waybill.itemDimensions) {
    const { length, width, height } = waybill.itemDimensions;
    const boxes = waybill.itemQuantity || 1;
    volumeWeight = (length * width * height * boxes) / 3500;
  }

  // ── Chargeable weight: whichever is higher ───────────────────────────
  const chargeableWeight = Math.max(actualWeight, volumeWeight);
  const weightBasis: 'Actual Weight' | 'Volume Weight' =
    volumeWeight >= actualWeight && volumeWeight > 0 ? 'Volume Weight' : 'Actual Weight';

  // ── Freight Cost ──────────────────────────────────────────────────────
  // Formula: MinRate + max(0, chargeableWeight - MinWeight) × ExcessRate
  const excessKgs = Math.max(0, chargeableWeight - rateConfig.minimumWeight);
  const freightCost = rateConfig.minimumRate + (excessKgs * rateConfig.excessRate);

  // ── Valuation: Declared Value × valuationRate ───────────────────────────────────
  const declaredValue = waybill.declaredValue || 0;
  const valuation = declaredValue * (rateConfig.valuationRate ?? 0.01);

  // ── ODA Charge ────────────────────────────────────────────────────────
  // If it's an ODA area, the freightCost already represents the ODA charge based on the ODA matrix.
  // We don't add an extra ODA flat fee unless configured differently, but the prompt says:
  // "Provide a separate ODA rate configuration because ODA pricing is different"
  // So if area === 'ODA', freightCost is the ODA charge.
  const odaCharge = 0; // Handled by rateConfig for ODA

  // ── Subtotal ──────────────────────────────────────────────────────────
  const subtotal = freightCost + valuation + odaCharge;

  // ── VAT on Subtotal ───────────────────────────────────────────────
  const vat = subtotal * (rateConfig.vatRate ?? 0.12);

  // ── Fuel Surcharge: Freight Cost × fuelSurchargeRate ───────────────────────────────
  const fuelSurcharge = freightCost * (rateConfig.fuelSurchargeRate ?? 0.15);

  // ── Grand Total ───────────────────────────────────────────────────────
  const grandTotal = subtotal + vat + fuelSurcharge;

  return {
    area: rateConfig.region,
    actualWeight,
    volumeWeight,
    chargeableWeight,
    weightBasis,
    minimumRate: rateConfig.minimumRate,
    excessRate: rateConfig.excessRate,
    excessKgs,
    freightCost,
    declaredValue,
    valuation,
    odaCharge,
    subtotal,
    vat,
    fuelSurcharge,
    grandTotal,
    calculatedAmount: grandTotal,
  };
}
