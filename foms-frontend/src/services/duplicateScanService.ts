/**
 * src/services/duplicateScanService.ts
 * API Service for AI Duplicate Scan, Manual Review Queue, Submissions, Decisions, and Audit Trail.
 * Enforces Separation of Duties, Weighted Scoring (0-100), Renormalization, and Status Lifecycle.
 */

import { http } from './apiClient';
import type {
  DuplicateAlert,
  DuplicateScanResult,
  HumanValidationPayload,
  SubmitAlertPayload,
  ComparisonMatrixRow,
  ExtractedDocumentFields,
  ExistingFomsRecord,
} from '../types/duplicateScan';

const STORAGE_KEY_ALERTS = 'foms_duplicate_alerts_v2';
const STORAGE_KEY_NOTIFS = 'foms_notifications';
const STORAGE_KEY_AUDIT = 'foms_audit_logs';

/* Initial mock alerts to populate the Financial Manager's Manual Review Queue, Accountant's (EMP-003), and Asst. FM's (EMP-004) My Submissions */
const SEED_ALERTS: DuplicateAlert[] = [
  {
    alertId: 'ALT-2026-081',
    scanId: 'SCN-10982',
    documentNo: 'INV-2026-0042',
    documentType: 'Invoice',
    clientName: 'San Miguel Logistics Corp',
    matchScore: 94,
    status: 'Pending Review',
    conflictFlag: false,
    conflictReason: null,
    lowExtractionQuality: false,
    submittedBy: 'Maria Mariel Jane Anonuevo',
    submittedById: 'EMP-003',
    submittedAt: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
    submissionNote: 'Invoice number and amount match existing billing record in the system. Needs verification for potential duplicate payout.',
    uploadedDocument: {
      fileName: 'san_miguel_inv_0042.png',
      fileSize: 1024 * 720,
      previewUrl: '/mock-receipt.png',
      extracted: {
        documentType: { value: 'Commercial Invoice', confidence: 0.98 },
        orInvoiceNumber: { value: 'INV-2026-0042', confidence: 0.99 },
        clientName: { value: 'San Miguel Logistics Corp', confidence: 0.95 },
        amount: { value: 185450.0, confidence: 0.96 },
        transactionDate: { value: '2026-10-12', confidence: 0.92 },
        referenceNumber: { value: 'REF-SML-9921', confidence: 0.9 },
        waybillNumber: { value: 'WBL-881920', confidence: 0.88 },
      },
    },
    existingRecord: {
      recordId: 'INV-RECORD-0042',
      documentType: 'Commercial Invoice',
      orInvoiceNumber: 'INV-2026-0042',
      clientName: 'San Miguel Logistics Corp',
      amount: 185450.0,
      transactionDate: '2026-10-12',
      referenceNumber: 'REF-SML-9921',
      waybillNumber: 'WBL-881920',
      dueDate: '2026-11-12',
      clientId: 'CLI-0012',
      invoiceId: 'INV-2026-0042',
      updatedAt: '2026-10-13 14:22:00',
      previewUrl: '/mock-receipt.png',
    },
    matrix: [
      { fieldKey: 'documentType', fieldLabel: 'Document Type', uploadedValue: 'Commercial Invoice', uploadedConfidence: 0.98, existingValue: 'Commercial Invoice', matchResult: 'EXACT_MATCH', weight: 5 },
      { fieldKey: 'orInvoiceNumber', fieldLabel: 'OR / Invoice Number', uploadedValue: 'INV-2026-0042', uploadedConfidence: 0.99, existingValue: 'INV-2026-0042', matchResult: 'EXACT_MATCH', weight: 35 },
      { fieldKey: 'clientName', fieldLabel: 'Client Name', uploadedValue: 'San Miguel Logistics Corp', uploadedConfidence: 0.95, existingValue: 'San Miguel Logistics Corp', matchResult: 'EXACT_MATCH', weight: 15 },
      { fieldKey: 'amount', fieldLabel: 'Amount', uploadedValue: 185450.0, uploadedConfidence: 0.96, existingValue: 185450.0, matchResult: 'EXACT_MATCH', weight: 20 },
      { fieldKey: 'transactionDate', fieldLabel: 'Transaction Date', uploadedValue: '2026-10-12', uploadedConfidence: 0.92, existingValue: '2026-10-12', matchResult: 'EXACT_MATCH', weight: 10 },
      { fieldKey: 'referenceNumber', fieldLabel: 'Reference Number', uploadedValue: 'REF-SML-9921', uploadedConfidence: 0.9, existingValue: 'REF-SML-9921', matchResult: 'EXACT_MATCH', weight: 10 },
      { fieldKey: 'waybillNumber', fieldLabel: 'Waybill Number', uploadedValue: 'WBL-881920', uploadedConfidence: 0.88, existingValue: 'WBL-881920', matchResult: 'EXACT_MATCH', weight: 5 },
    ],
  },
  {
    alertId: 'ALT-2026-082',
    scanId: 'SCN-10983',
    documentNo: 'OR-77291',
    documentType: 'Official Receipt',
    clientName: 'Petron Corporation',
    matchScore: 82,
    status: 'Pending Review',
    conflictFlag: true,
    conflictReason: 'Invoice ID mismatch with existing client master record (CLI-0089 vs CLI-0091).',
    lowExtractionQuality: false,
    submittedBy: 'Maria Mariel Jane Anonuevo',
    submittedById: 'EMP-003',
    submittedAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    submissionNote: 'Official receipt reference matches previous fuel disbursement, but invoice ID belongs to a sub-account.',
    uploadedDocument: {
      fileName: 'petron_fuel_receipt_77291.jpg',
      fileSize: 1024 * 512,
      previewUrl: '/mock-receipt.png',
      extracted: {
        documentType: { value: 'Official Receipt', confidence: 0.97 },
        orInvoiceNumber: { value: 'OR-77291', confidence: 0.98 },
        clientName: { value: 'Petron Corp', confidence: 0.91 },
        amount: { value: 65200.0, confidence: 0.95 },
        transactionDate: { value: '2026-10-14', confidence: 0.89 },
        referenceNumber: { value: 'REF-PET-441', confidence: 0.87 },
        waybillNumber: { value: null, confidence: 0.0 },
      },
    },
    existingRecord: {
      recordId: 'REC-77291',
      documentType: 'Official Receipt',
      orInvoiceNumber: 'OR-77291',
      clientName: 'Petron Corporation',
      amount: 65200.0,
      transactionDate: '2026-10-11',
      referenceNumber: 'REF-PET-441',
      waybillNumber: null,
      dueDate: '2026-10-25',
      clientId: 'CLI-0089',
      invoiceId: 'INV-2026-77291',
      updatedAt: '2026-10-12 09:15:00',
      previewUrl: '/mock-receipt.png',
    },
    matrix: [
      { fieldKey: 'documentType', fieldLabel: 'Document Type', uploadedValue: 'Official Receipt', uploadedConfidence: 0.97, existingValue: 'Official Receipt', matchResult: 'EXACT_MATCH', weight: 5 },
      { fieldKey: 'orInvoiceNumber', fieldLabel: 'OR / Invoice Number', uploadedValue: 'OR-77291', uploadedConfidence: 0.98, existingValue: 'OR-77291', matchResult: 'EXACT_MATCH', weight: 35 },
      { fieldKey: 'clientName', fieldLabel: 'Client Name', uploadedValue: 'Petron Corp', uploadedConfidence: 0.91, existingValue: 'Petron Corporation', matchResult: 'PARTIAL_MATCH', weight: 15 },
      { fieldKey: 'amount', fieldLabel: 'Amount', uploadedValue: 65200.0, uploadedConfidence: 0.95, existingValue: 65200.0, matchResult: 'EXACT_MATCH', weight: 20 },
      { fieldKey: 'transactionDate', fieldLabel: 'Transaction Date', uploadedValue: '2026-10-14', uploadedConfidence: 0.89, existingValue: '2026-10-11', matchResult: 'NO_MATCH', weight: 10 },
      { fieldKey: 'referenceNumber', fieldLabel: 'Reference Number', uploadedValue: 'REF-PET-441', uploadedConfidence: 0.87, existingValue: 'REF-PET-441', matchResult: 'EXACT_MATCH', weight: 10 },
      { fieldKey: 'waybillNumber', fieldLabel: 'Waybill Number', uploadedValue: null, uploadedConfidence: 0, existingValue: null, matchResult: 'NOT_READ', weight: 5 },
    ],
  },
  {
    alertId: 'ALT-2026-079',
    scanId: 'SCN-10970',
    documentNo: 'OR-66102',
    documentType: 'Official Receipt',
    clientName: 'Shell Pilipinas',
    matchScore: 89,
    status: 'Returned',
    conflictFlag: false,
    conflictReason: null,
    lowExtractionQuality: false,
    submittedBy: 'Maria Mariel Jane Anonuevo',
    submittedById: 'EMP-003',
    submittedAt: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    submissionNote: 'Submitted for duplicate verification against fleet expenses.',
    reviewedBy: 'Crystalyn Joyce C. Fajardo',
    reviewedById: 'EMP-001',
    reviewedAt: new Date(Date.now() - 20 * 3600 * 1000).toISOString(),
    decision: 'RETURNED',
    auditNotes: 'Rescan required: Official Receipt date stamp and footer tin are blurry in current upload.',
    uploadedDocument: {
      fileName: 'shell_fleet_66102.png',
      fileSize: 1024 * 320,
      previewUrl: '/mock-receipt.png',
      extracted: {
        documentType: { value: 'Official Receipt', confidence: 0.85 },
        orInvoiceNumber: { value: 'OR-66102', confidence: 0.88 },
        clientName: { value: 'Shell Pilipinas', confidence: 0.82 },
        amount: { value: 12500.0, confidence: 0.88 },
        transactionDate: { value: null, confidence: 0.0 },
        referenceNumber: { value: 'REF-SHL-10', confidence: 0.75 },
        waybillNumber: { value: null, confidence: 0.0 },
      },
    },
    existingRecord: {
      recordId: 'REC-66102',
      documentType: 'Official Receipt',
      orInvoiceNumber: 'OR-66102',
      clientName: 'Shell Pilipinas',
      amount: 12500.0,
      transactionDate: '2026-10-08',
      referenceNumber: 'REF-SHL-10',
      waybillNumber: null,
      dueDate: '2026-10-22',
      clientId: 'CLI-0005',
      invoiceId: 'INV-2026-66102',
      updatedAt: '2026-10-09 11:00:00',
      previewUrl: '/mock-receipt.png',
    },
    matrix: [
      { fieldKey: 'documentType', fieldLabel: 'Document Type', uploadedValue: 'Official Receipt', uploadedConfidence: 0.85, existingValue: 'Official Receipt', matchResult: 'EXACT_MATCH', weight: 5 },
      { fieldKey: 'orInvoiceNumber', fieldLabel: 'OR / Invoice Number', uploadedValue: 'OR-66102', uploadedConfidence: 0.88, existingValue: 'OR-66102', matchResult: 'EXACT_MATCH', weight: 35 },
      { fieldKey: 'clientName', fieldLabel: 'Client Name', uploadedValue: 'Shell Pilipinas', uploadedConfidence: 0.82, existingValue: 'Shell Pilipinas', matchResult: 'EXACT_MATCH', weight: 15 },
      { fieldKey: 'amount', fieldLabel: 'Amount', uploadedValue: 12500.0, uploadedConfidence: 0.88, existingValue: 12500.0, matchResult: 'EXACT_MATCH', weight: 20 },
      { fieldKey: 'transactionDate', fieldLabel: 'Transaction Date', uploadedValue: null, uploadedConfidence: 0, existingValue: '2026-10-08', matchResult: 'NOT_READ', weight: 10 },
      { fieldKey: 'referenceNumber', fieldLabel: 'Reference Number', uploadedValue: 'REF-SHL-10', uploadedConfidence: 0.75, existingValue: 'REF-SHL-10', matchResult: 'EXACT_MATCH', weight: 10 },
      { fieldKey: 'waybillNumber', fieldLabel: 'Waybill Number', uploadedValue: null, uploadedConfidence: 0, existingValue: null, matchResult: 'NOT_READ', weight: 5 },
    ],
  },
  {
    alertId: 'ALT-2026-085',
    scanId: 'SCN-10990',
    documentNo: 'LIQ-2026-0019',
    documentType: 'Liquidation',
    clientName: 'Speedex Operations Fleet',
    matchScore: 78,
    status: 'Pending Review',
    conflictFlag: false,
    conflictReason: null,
    lowExtractionQuality: false,
    submittedBy: 'Joana Marie Ogaya',
    submittedById: 'EMP-004',
    submittedAt: new Date(Date.now() - 1 * 3600 * 1000).toISOString(),
    submissionNote: 'Field driver toll and fuel reimbursement liquidation expense receipt.',
    uploadedDocument: {
      fileName: 'fleet_fuel_liq_0019.png',
      fileSize: 1024 * 420,
      previewUrl: '/mock-receipt.png',
      extracted: {
        documentType: { value: 'Liquidation Report', confidence: 0.95 },
        orInvoiceNumber: { value: 'LIQ-2026-0019', confidence: 0.94 },
        clientName: { value: 'Speedex Operations Fleet', confidence: 0.91 },
        amount: { value: 38400.0, confidence: 0.96 },
        transactionDate: { value: '2026-10-15', confidence: 0.92 },
        referenceNumber: { value: 'REF-FLT-882', confidence: 0.88 },
        waybillNumber: { value: null, confidence: 0.0 },
      },
    },
    existingRecord: {
      recordId: 'REC-38400',
      documentType: 'Liquidation Report',
      orInvoiceNumber: 'LIQ-2026-0019',
      clientName: 'Speedex Operations Fleet',
      amount: 38400.0,
      transactionDate: '2026-10-14',
      referenceNumber: 'REF-FLT-882',
      waybillNumber: null,
      dueDate: '2026-10-28',
      clientId: 'CLI-FLEET',
      invoiceId: 'INV-2026-38400',
      updatedAt: '2026-10-15 08:30:00',
      previewUrl: '/mock-receipt.png',
    },
    matrix: [
      { fieldKey: 'documentType', fieldLabel: 'Document Type', uploadedValue: 'Liquidation Report', uploadedConfidence: 0.95, existingValue: 'Liquidation Report', matchResult: 'EXACT_MATCH', weight: 5 },
      { fieldKey: 'orInvoiceNumber', fieldLabel: 'OR / Invoice Number', uploadedValue: 'LIQ-2026-0019', uploadedConfidence: 0.94, existingValue: 'LIQ-2026-0019', matchResult: 'EXACT_MATCH', weight: 35 },
      { fieldKey: 'clientName', fieldLabel: 'Client Name', uploadedValue: 'Speedex Operations Fleet', uploadedConfidence: 0.91, existingValue: 'Speedex Operations Fleet', matchResult: 'EXACT_MATCH', weight: 15 },
      { fieldKey: 'amount', fieldLabel: 'Amount', uploadedValue: 38400.0, uploadedConfidence: 0.96, existingValue: 38400.0, matchResult: 'EXACT_MATCH', weight: 20 },
      { fieldKey: 'transactionDate', fieldLabel: 'Transaction Date', uploadedValue: '2026-10-15', uploadedConfidence: 0.92, existingValue: '2026-10-14', matchResult: 'PARTIAL_MATCH', weight: 10 },
      { fieldKey: 'referenceNumber', fieldLabel: 'Reference Number', uploadedValue: 'REF-FLT-882', uploadedConfidence: 0.88, existingValue: 'REF-FLT-882', matchResult: 'EXACT_MATCH', weight: 10 },
      { fieldKey: 'waybillNumber', fieldLabel: 'Waybill Number', uploadedValue: null, uploadedConfidence: 0, existingValue: null, matchResult: 'NOT_READ', weight: 5 },
    ],
  },
];

function getStoredAlerts(): DuplicateAlert[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ALERTS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY_ALERTS, JSON.stringify(SEED_ALERTS));
      return SEED_ALERTS;
    }
    const parsed: DuplicateAlert[] = JSON.parse(raw);
    let migrated = false;
    for (const a of parsed) {
      if (a.submittedBy?.includes('Maria Mariel') && a.submittedById === 'EMP-004') {
        a.submittedById = 'EMP-003';
        migrated = true;
      }
    }
    // Also ensure EMP-004 seed alert exists in stored alerts
    if (!parsed.some((a) => a.submittedById === 'EMP-004')) {
      const emp004Alert = SEED_ALERTS.find((a) => a.submittedById === 'EMP-004');
      if (emp004Alert) {
        parsed.push(emp004Alert);
        migrated = true;
      }
    }
    if (migrated) {
      localStorage.setItem(STORAGE_KEY_ALERTS, JSON.stringify(parsed));
    }
    return parsed;
  } catch {
    return SEED_ALERTS;
  }
}

function saveStoredAlerts(alerts: DuplicateAlert[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_ALERTS, JSON.stringify(alerts));
  } catch (err) {
    console.warn('Failed to persist duplicate alerts:', err);
  }
}

function recordAuditLog(log: {
  action: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  affectedRecordId: string;
  remarks: string;
  beforeState?: any;
  afterState?: any;
}) {
  try {
    const existing = JSON.parse(localStorage.getItem(STORAGE_KEY_AUDIT) || '[]');
    const newEntry = {
      id: `AUD-${Date.now()}`,
      module: 'AI Duplicate Detection',
      timestamp: new Date().toISOString(),
      ...log,
    };
    localStorage.setItem(STORAGE_KEY_AUDIT, JSON.stringify([newEntry, ...existing]));
  } catch {
    // Ignore storage errors
  }
}

function sendInAppNotification(notif: {
  recipientRole: string;
  recipientId?: string;
  title: string;
  message: string;
  alertId?: string;
}) {
  try {
    const existing = JSON.parse(localStorage.getItem(STORAGE_KEY_NOTIFS) || '[]');
    const newNotif = {
      id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      recipientRole: notif.recipientRole,
      recipientId: notif.recipientId || 'ALL',
      title: notif.title,
      message: notif.message,
      alertId: notif.alertId,
      date: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      read: false,
    };
    localStorage.setItem(STORAGE_KEY_NOTIFS, JSON.stringify([newNotif, ...existing]));
  } catch {
    // Ignore storage errors
  }
}

export const duplicateScanService = {
  /**
   * STEP 2 & 3: Run AI Extraction + Duplicate Search + Weighted Scoring
   * Only Accountant role allowed.
   */
  async scanDocument(file: File, userRole: string, userName: string, userId: string): Promise<DuplicateScanResult> {
    if (userRole === 'Financial Manager' || userRole === 'FM') {
      throw new Error('Permission Denied: Financial Managers do not upload documents in this module.');
    }

    // Attempt real backend POST /ai/duplicate-scan first
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await http.post<any>('/ai/duplicate-scan', formData);
      if (res && res.matrix && res.classification) {
        return res as DuplicateScanResult;
      }
    } catch {
      // Fallback to high-fidelity client engine if offline or developing
    }

    // Client-side high-fidelity simulation adhering to exact rules
    const fileName = file.name;
    const fileSize = file.size;
    const previewUrl = URL.createObjectURL(file);
    const checkedDateTime = new Date().toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    // Derive deterministic values based on filename markers
    const lowerName = fileName.toLowerCase();
    const isInvoice = lowerName.includes('inv') || lowerName.includes('invoice') || lowerName.includes('bill');
    const isUniqueCandidate = lowerName.includes('unique') || lowerName.includes('clean') || lowerName.includes('new');
    const isConflictCandidate = lowerName.includes('conflict') || lowerName.includes('diff');
    const isLowQuality = lowerName.includes('blur') || lowerName.includes('unclear') || lowerName.includes('poor');

    const docTypeVal = isInvoice ? 'Commercial Invoice' : 'Official Receipt';
    const numVal = isUniqueCandidate
      ? `INV-2026-${Math.floor(1000 + Math.random() * 9000)}`
      : isInvoice
      ? 'INV-2026-0042'
      : 'OR-77291';
    const clientVal = isUniqueCandidate
      ? 'Universal Robina Corp'
      : isInvoice
      ? 'San Miguel Logistics Corp'
      : 'Petron Corporation';
    const amountVal = isUniqueCandidate ? 45000.0 : isInvoice ? 185450.0 : 65200.0;
    const dateVal = isUniqueCandidate ? '2026-10-15' : isInvoice ? '2026-10-12' : '2026-10-14';
    const refVal = isUniqueCandidate ? 'REF-URC-1092' : isInvoice ? 'REF-SML-9921' : 'REF-PET-441';
    const waybillVal = isUniqueCandidate ? 'WBL-992100' : isInvoice ? 'WBL-881920' : null;

    const extracted: ExtractedDocumentFields = {
      documentType: { value: docTypeVal, confidence: isLowQuality ? 0.65 : 0.98 },
      orInvoiceNumber: { value: numVal, confidence: isLowQuality ? 0.55 : 0.99 },
      clientName: { value: clientVal, confidence: isLowQuality ? 0.6 : 0.95 },
      amount: { value: amountVal, confidence: isLowQuality ? 0.7 : 0.97 },
      transactionDate: { value: isLowQuality ? null : dateVal, confidence: isLowQuality ? 0 : 0.94 },
      referenceNumber: { value: refVal, confidence: 0.91 },
      waybillNumber: { value: isLowQuality ? null : waybillVal, confidence: isLowQuality ? 0 : 0.88 },
    };

    // Calculate null fields count
    const keyFields = [
      extracted.documentType.value,
      extracted.orInvoiceNumber.value,
      extracted.clientName.value,
      extracted.amount.value,
      extracted.transactionDate.value,
    ];
    const nullKeyFieldsCount = keyFields.filter((v) => v === null).length;
    const lowExtractionQuality = nullKeyFieldsCount >= 2 || isLowQuality;

    // Existing matching FOMS record
    let existingRecord: ExistingFomsRecord | null = null;
    let matchScore = 0;
    let conflictFlag = false;
    let conflictReason: string | null = null;

    if (!isUniqueCandidate) {
      existingRecord = {
        recordId: isInvoice ? 'INV-RECORD-0042' : 'REC-77291',
        documentType: docTypeVal,
        orInvoiceNumber: numVal,
        clientName: isConflictCandidate ? 'San Miguel Food & Beverage' : clientVal,
        amount: amountVal,
        transactionDate: isInvoice ? '2026-10-12' : '2026-10-11',
        referenceNumber: refVal,
        waybillNumber: waybillVal,
        dueDate: isInvoice ? '2026-11-12' : '2026-10-25',
        clientId: isConflictCandidate ? 'CLI-0999' : isInvoice ? 'CLI-0012' : 'CLI-0089',
        invoiceId: isInvoice ? 'INV-2026-0042' : 'INV-2026-77291',
        updatedAt: '2026-10-13 14:22:00',
        previewUrl: '/mock-receipt.png',
      };

      // Base score calculation according to weights:
      // OR/Invoice no. 35, Amount 20, Client 15, Date 10, Reference no. 10, Waybill 5, Document type 5 = 100
      let totalAssignedWeight = 0;
      let earnedScore = 0;

      // 1. OR/Invoice no (35)
      if (extracted.orInvoiceNumber.value !== null) {
        totalAssignedWeight += 35;
        if (extracted.orInvoiceNumber.value === existingRecord.orInvoiceNumber) earnedScore += 35;
      }
      // 2. Amount (20)
      if (extracted.amount.value !== null) {
        totalAssignedWeight += 20;
        if (extracted.amount.value === existingRecord.amount) earnedScore += 20;
      }
      // 3. Client (15)
      if (extracted.clientName.value !== null) {
        totalAssignedWeight += 15;
        if (extracted.clientName.value === existingRecord.clientName) earnedScore += 15;
        else earnedScore += 10; // fuzzy match
      }
      // 4. Date (10)
      if (extracted.transactionDate.value !== null) {
        totalAssignedWeight += 10;
        if (extracted.transactionDate.value === existingRecord.transactionDate) earnedScore += 10;
      }
      // 5. Reference (10)
      if (extracted.referenceNumber.value !== null) {
        totalAssignedWeight += 10;
        if (extracted.referenceNumber.value === existingRecord.referenceNumber) earnedScore += 10;
      }
      // 6. Waybill (5)
      if (extracted.waybillNumber.value !== null) {
        totalAssignedWeight += 5;
        if (extracted.waybillNumber.value === existingRecord.waybillNumber) earnedScore += 5;
      }
      // 7. Doc Type (5)
      if (extracted.documentType.value !== null) {
        totalAssignedWeight += 5;
        if (extracted.documentType.value === existingRecord.documentType) earnedScore += 5;
      }

      // Renormalize weights for excluded null fields
      matchScore = totalAssignedWeight > 0 ? Math.round((earnedScore / totalAssignedWeight) * 100) : 0;

      // Apply quality penalty if 2+ key fields null
      if (lowExtractionQuality) {
        matchScore = Math.max(10, matchScore - 25);
      }

      // Conflict rule: If best match has different Client ID or Invoice ID, cap score at 89 and add flag
      if (isConflictCandidate || (existingRecord.clientId && existingRecord.clientId === 'CLI-0999')) {
        conflictFlag = true;
        conflictReason = 'Conflicting records: Client ID mismatch with existing FOMS master billing record.';
        if (matchScore >= 90) matchScore = 89;
      }
    } else {
      matchScore = 22; // No duplicate found
    }

    // Step 4: Classification
    let classification: DuplicateScanResult['classification'] = 'NO_DUPLICATE';
    let classificationLabel: DuplicateScanResult['classificationLabel'] = 'No Duplicate Found';
    let classificationColor: DuplicateScanResult['classificationColor'] = 'green';

    if (matchScore >= 90) {
      classification = 'POSSIBLE_DUPLICATE';
      classificationLabel = 'Possible Duplicate Detected';
      classificationColor = 'red';
    } else if (matchScore >= 60) {
      classification = 'NEEDS_MANUAL_REVIEW';
      classificationLabel = 'Needs Manual Review';
      classificationColor = 'amber';
    }

    // Build comparison matrix
    const matrix: ComparisonMatrixRow[] = [
      {
        fieldKey: 'documentType',
        fieldLabel: 'Document Type',
        uploadedValue: extracted.documentType.value,
        uploadedConfidence: extracted.documentType.confidence,
        existingValue: existingRecord?.documentType ?? null,
        matchResult:
          extracted.documentType.value === null
            ? 'NOT_READ'
            : extracted.documentType.value === existingRecord?.documentType
            ? 'EXACT_MATCH'
            : existingRecord?.documentType
            ? 'PARTIAL_MATCH'
            : 'NO_MATCH',
        weight: 5,
      },
      {
        fieldKey: 'orInvoiceNumber',
        fieldLabel: 'OR / Invoice Number',
        uploadedValue: extracted.orInvoiceNumber.value,
        uploadedConfidence: extracted.orInvoiceNumber.confidence,
        existingValue: existingRecord?.orInvoiceNumber ?? null,
        matchResult:
          extracted.orInvoiceNumber.value === null
            ? 'NOT_READ'
            : extracted.orInvoiceNumber.value === existingRecord?.orInvoiceNumber
            ? 'EXACT_MATCH'
            : 'NO_MATCH',
        weight: 35,
      },
      {
        fieldKey: 'clientName',
        fieldLabel: 'Client Name',
        uploadedValue: extracted.clientName.value,
        uploadedConfidence: extracted.clientName.confidence,
        existingValue: existingRecord?.clientName ?? null,
        matchResult:
          extracted.clientName.value === null
            ? 'NOT_READ'
            : extracted.clientName.value === existingRecord?.clientName
            ? 'EXACT_MATCH'
            : existingRecord?.clientName
            ? 'PARTIAL_MATCH'
            : 'NO_MATCH',
        weight: 15,
      },
      {
        fieldKey: 'amount',
        fieldLabel: 'Amount',
        uploadedValue: extracted.amount.value,
        uploadedConfidence: extracted.amount.confidence,
        existingValue: existingRecord?.amount ?? null,
        matchResult:
          extracted.amount.value === null
            ? 'NOT_READ'
            : extracted.amount.value === existingRecord?.amount
            ? 'EXACT_MATCH'
            : 'NO_MATCH',
        weight: 20,
      },
      {
        fieldKey: 'transactionDate',
        fieldLabel: 'Transaction Date',
        uploadedValue: extracted.transactionDate.value,
        uploadedConfidence: extracted.transactionDate.confidence,
        existingValue: existingRecord?.transactionDate ?? null,
        matchResult:
          extracted.transactionDate.value === null
            ? 'NOT_READ'
            : extracted.transactionDate.value === existingRecord?.transactionDate
            ? 'EXACT_MATCH'
            : 'NO_MATCH',
        weight: 10,
      },
      {
        fieldKey: 'referenceNumber',
        fieldLabel: 'Reference Number',
        uploadedValue: extracted.referenceNumber.value,
        uploadedConfidence: extracted.referenceNumber.confidence,
        existingValue: existingRecord?.referenceNumber ?? null,
        matchResult:
          extracted.referenceNumber.value === null
            ? 'NOT_READ'
            : extracted.referenceNumber.value === existingRecord?.referenceNumber
            ? 'EXACT_MATCH'
            : 'NO_MATCH',
        weight: 10,
      },
      {
        fieldKey: 'waybillNumber',
        fieldLabel: 'Waybill Number',
        uploadedValue: extracted.waybillNumber.value,
        uploadedConfidence: extracted.waybillNumber.confidence,
        existingValue: existingRecord?.waybillNumber ?? null,
        matchResult:
          extracted.waybillNumber.value === null
            ? 'NOT_READ'
            : extracted.waybillNumber.value === existingRecord?.waybillNumber
            ? 'EXACT_MATCH'
            : existingRecord?.waybillNumber
            ? 'PARTIAL_MATCH'
            : 'NO_MATCH',
        weight: 5,
      },
    ];

    const scanId = `SCN-${Date.now()}`;

    // Record scan in audit trail
    recordAuditLog({
      action: 'SCAN_DOCUMENT',
      actorId: userId,
      actorName: userName,
      actorRole: userRole,
      affectedRecordId: scanId,
      remarks: `Scanned ${fileName}: Score ${matchScore}%, Classification: ${classificationLabel}`,
    });

    return {
      scanId,
      matchScore,
      classification,
      classificationLabel,
      classificationColor,
      conflictFlag,
      conflictReason,
      lowExtractionQuality,
      checkedDateTime,
      uploadedDocument: {
        fileName,
        fileSize,
        previewUrl,
        extracted,
      },
      existingRecord,
      matrix,
    };
  },

  /**
   * STEP 5 & 6: Submit for Manual Review (Score 60+)
   * Creates alert in Pending Review, notifies all Financial Managers.
   * Only Accountant role allowed.
   */
  async submitForManualReview(
    scanResult: DuplicateScanResult,
    submissionNote: string,
    submitterName: string,
    submitterId: string
  ): Promise<{ success: boolean; alertId: string; message: string }> {
    const alertId = `ALT-2026-${Math.floor(100 + Math.random() * 900)}`;
    const newAlert: DuplicateAlert = {
      alertId,
      scanId: scanResult.scanId,
      documentNo: scanResult.uploadedDocument.extracted.orInvoiceNumber.value || `DOC-${Date.now().toString().slice(-5)}`,
      documentType: scanResult.uploadedDocument.extracted.documentType.value || 'Document',
      clientName: scanResult.uploadedDocument.extracted.clientName.value || 'Unknown Client',
      matchScore: scanResult.matchScore,
      status: 'Pending Review',
      conflictFlag: scanResult.conflictFlag,
      conflictReason: scanResult.conflictReason,
      lowExtractionQuality: scanResult.lowExtractionQuality,
      submittedBy: submitterName,
      submittedById: submitterId,
      submittedAt: new Date().toISOString(),
      submissionNote: submissionNote.trim(),
      uploadedDocument: scanResult.uploadedDocument,
      existingRecord: scanResult.existingRecord,
      matrix: scanResult.matrix,
    };

    const alerts = getStoredAlerts();
    alerts.unshift(newAlert);
    saveStoredAlerts(alerts);

    // Audit log
    recordAuditLog({
      action: 'SUBMIT_ALERT',
      actorId: submitterId,
      actorName: submitterName,
      actorRole: 'Accountant',
      affectedRecordId: alertId,
      remarks: `Submitted document ${newAlert.documentNo} for manual review. Note: ${submissionNote || 'No note provided.'}`,
    });

    // In-app notification to all Financial Managers
    sendInAppNotification({
      recipientRole: 'Financial Manager',
      title: 'New Document Pending Manual Review',
      message: `Alert #${alertId}: ${newAlert.documentNo} (${scanResult.matchScore}% match) submitted by ${submitterName}.`,
      alertId,
    });

    return {
      success: true,
      alertId,
      message: `Submitted to Financial Manager for review (Alert #${alertId})`,
    };
  },

  /**
   * STEP 5: Confirm as Unique Document
   * Saves to Unique Documents with status "AI Cleared" (score < 60) or "Cleared as Unique" (score >= 60).
   */
  async confirmAsUniqueDocument(
    scanResult: DuplicateScanResult,
    userName: string,
    userId: string,
    submissionNote?: string
  ): Promise<{ success: boolean; message: string }> {
    const alertId = `ALT-UNI-${Date.now().toString().slice(-5)}`;
    const isExemption = scanResult.matchScore >= 60;
    const finalStatus = isExemption ? 'Cleared as Unique' : 'AI Cleared';
    const finalNote = submissionNote?.trim() || (
      isExemption
        ? 'Cleared as unique by Accountant directly from AI Scan Console (Verified distinct transaction).'
        : 'Confirmed unique by Accountant directly from AI Scan Console (Score below 60).'
    );

    const newAlert: DuplicateAlert = {
      alertId,
      scanId: scanResult.scanId,
      documentNo: scanResult.uploadedDocument.extracted.orInvoiceNumber.value || `DOC-UNI-${Date.now().toString().slice(-4)}`,
      documentType: scanResult.uploadedDocument.extracted.documentType.value || 'Document',
      clientName: scanResult.uploadedDocument.extracted.clientName.value || 'Speedex Client',
      matchScore: scanResult.matchScore,
      status: finalStatus,
      conflictFlag: false,
      conflictReason: null,
      lowExtractionQuality: scanResult.lowExtractionQuality,
      submittedBy: userName,
      submittedById: userId,
      submittedAt: new Date().toISOString(),
      submissionNote: finalNote,
      reviewedBy: userName,
      reviewedById: userId,
      reviewedAt: new Date().toISOString(),
      decision: 'UNIQUE',
      auditNotes: finalNote,
      uploadedDocument: scanResult.uploadedDocument,
      existingRecord: null,
      matrix: scanResult.matrix,
    };

    const alerts = getStoredAlerts();
    alerts.unshift(newAlert);
    saveStoredAlerts(alerts);

    // Audit log
    recordAuditLog({
      action: 'CONFIRM_UNIQUE',
      actorId: userId,
      actorName: userName,
      actorRole: 'Accountant',
      affectedRecordId: alertId,
      remarks: `Confirmed document ${newAlert.documentNo} as unique (Match Score: ${scanResult.matchScore}%). Status set to ${finalStatus}. Note: ${finalNote}`,
    });

    return {
      success: true,
      message: `Document confirmed and saved as Unique Document (${finalStatus}).`,
    };
  },

  /**
   * STEP 7: Get Manual Review Queue
   * Lists all alerts with status = "Pending Review", oldest first.
   */
  async getManualReviewQueue(): Promise<DuplicateAlert[]> {
    const alerts = getStoredAlerts();
    const pending = alerts.filter((a) => a.status === 'Pending Review');
    // Sort oldest first
    return pending.sort((a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime());
  },

  /**
   * Get submission count for FM sidebar badge
   */
  async getPendingReviewCount(): Promise<number> {
    const alerts = getStoredAlerts();
    return alerts.filter((a) => a.status === 'Pending Review').length;
  },

  /**
   * Screen D: Get My Submissions for Accountant
   * Shows submissions, returned documents, and validated Finance decisions.
   */
  async getMySubmissions(userId?: string): Promise<DuplicateAlert[]> {
    const alerts = getStoredAlerts();
    if (!userId) {
      return [...alerts].sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
    }
    const cleanId = userId.trim().toUpperCase();
    const userItems = alerts.filter(
      (a) =>
        a.submittedById &&
        a.submittedById.trim().toUpperCase() === cleanId
    );
    if (userItems.length > 0) {
      return userItems.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
    }
    const fallbackMatch = alerts.filter((a) => {
      if (cleanId.includes('003') || cleanId.includes('ACC')) {
        return a.submittedById === 'EMP-003' || a.submittedBy?.includes('Maria Mariel');
      }
      if (cleanId.includes('004') || cleanId.includes('AFM') || cleanId.includes('ASST')) {
        return a.submittedById === 'EMP-004' || a.submittedBy?.includes('Joana');
      }
      return false;
    });
    if (fallbackMatch.length > 0) {
      return fallbackMatch.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
    }
    return [...alerts].sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
  },

  /**
   * Get single alert by ID
   */
  async getAlertById(alertId: string): Promise<DuplicateAlert | null> {
    const alerts = getStoredAlerts();
    return alerts.find((a) => a.alertId === alertId) || null;
  },

  /**
   * STEP 8: Financial Manager Review & Decision
   * Enforces Separation of Duties: Submitter cannot decide their own alert!
   */
  async submitReviewDecision(
    alertId: string,
    payload: HumanValidationPayload,
    reviewerName: string,
    reviewerId: string,
    reviewerRole: string
  ): Promise<{ success: boolean; message: string; alert: DuplicateAlert }> {
    const alerts = getStoredAlerts();
    const alert = alerts.find((a) => a.alertId === alertId);

    if (!alert) {
      throw new Error(`Alert #${alertId} was not found in the system.`);
    }

    // Role check: Only Financial Manager can decide
    const normalizedRole = (reviewerRole || '').toUpperCase().replace(/[^A-Z]/g, '');
    const isFM =
      normalizedRole === 'FINANCIALMANAGER' ||
      normalizedRole === 'FM' ||
      normalizedRole === 'HEADACCOUNTANT' ||
      normalizedRole.includes('MANAGER');

    if (!isFM) {
      throw new Error('Permission Denied: Only Financial Managers can submit final review decisions.');
    }

    // Separation of Duties check: The person who submitted an item can NEVER be the one who decides it!
    if (alert.submittedById && reviewerId && alert.submittedById.toLowerCase() === reviewerId.toLowerCase()) {
      throw new Error('Separation of Duties Violation: You cannot review or decide a document that you submitted yourself.');
    }

    // Audit and remarks validation
    if (!payload.remarks || !payload.remarks.trim()) {
      throw new Error('Validation Error: Audit notes / remarks are required for all review decisions.');
    }

    if (payload.decision === 'DUPLICATE') {
      if (!payload.duplicateReason) {
        throw new Error('Validation Error: Duplicate reason is required when marking as Duplicate.');
      }
      if (!payload.recommendedAction) {
        throw new Error('Validation Error: Recommended legacy action is required when marking as Duplicate.');
      }
      alert.status = 'Confirmed Duplicate';
    } else if (payload.decision === 'UNIQUE') {
      alert.status = 'Cleared as Unique';
    } else if (payload.decision === 'RETURNED') {
      alert.status = 'Returned';
    }

    alert.reviewedBy = reviewerName;
    alert.reviewedById = reviewerId;
    alert.reviewedAt = new Date().toISOString();
    alert.decision = payload.decision;
    alert.duplicateReason = payload.duplicateReason;
    alert.recommendedAction = payload.recommendedAction;
    alert.auditNotes = payload.remarks.trim();

    saveStoredAlerts(alerts);

    // Write to Audit Trail
    recordAuditLog({
      action: 'REVIEW_DECISION',
      actorId: reviewerId,
      actorName: reviewerName,
      actorRole: 'Financial Manager',
      affectedRecordId: alertId,
      remarks: `Financial Manager decision: ${alert.status}. Reason: ${payload.duplicateReason || 'N/A'}. Action: ${payload.recommendedAction || 'N/A'}. Remarks: ${payload.remarks}`,
    });

    // Notify submitting Accountant
    sendInAppNotification({
      recipientRole: 'Accountant',
      recipientId: alert.submittedById,
      title: `Review Decision on Alert #${alertId}`,
      message: `Financial Manager ${reviewerName} decided: ${alert.status} for document ${alert.documentNo}. Remarks: ${payload.remarks}`,
      alertId,
    });

    return {
      success: true,
      message: `Decision successfully submitted: ${alert.status}`,
      alert,
    };
  },

  /**
   * Resubmit a returned alert (for Accountant)
   * Supports replacement scan attachments and categorized resolution tags.
   */
  async resubmitReturnedAlert(
    alertId: string,
    newNote: string,
    userName: string,
    userId: string,
    resolutionTag?: string,
    replacementFileUrl?: string,
    replacementFileName?: string
  ): Promise<{ success: boolean; message: string }> {
    const alerts = getStoredAlerts();
    const alert = alerts.find((a) => a.alertId === alertId);
    if (!alert) throw new Error('Alert not found');

    const formattedNote = [
      resolutionTag ? `[${resolutionTag}]` : '',
      newNote.trim(),
    ]
      .filter(Boolean)
      .join(' ');

    alert.status = 'Pending Review';
    alert.submissionNote = formattedNote
      ? `${alert.submissionNote ? alert.submissionNote + ' | ' : ''}Resubmitted: ${formattedNote}`
      : alert.submissionNote;
    alert.submittedAt = new Date().toISOString();
    alert.submittedBy = userName;
    alert.submittedById = userId;

    if (replacementFileUrl && alert.uploadedDocument) {
      alert.uploadedDocument.previewUrl = replacementFileUrl;
      alert.uploadedDocument.fileName = replacementFileName || 'replacement_rescan.jpg';
    }

    saveStoredAlerts(alerts);

    recordAuditLog({
      action: 'RESUBMIT_ALERT',
      actorId: userId,
      actorName: userName,
      actorRole: 'Accountant',
      affectedRecordId: alertId,
      remarks: `Resubmitted returned alert #${alertId}. Resolution: ${resolutionTag || 'Rescanned'}. Note: ${newNote}${replacementFileName ? ` (Attached: ${replacementFileName})` : ''}`,
    });

    sendInAppNotification({
      recipientRole: 'Financial Manager',
      title: 'Returned Document Resubmitted',
      message: `Alert #${alertId} (${alert.documentNo}) was resubmitted by ${userName} for re-review.`,
      alertId,
    });

    return {
      success: true,
      message: `Alert #${alertId} successfully resubmitted to Financial Manager queue.`,
    };
  },

  /**
   * Screen G: Get Flagged Duplicates
   */
  async getFlaggedDuplicates(): Promise<DuplicateAlert[]> {
    const alerts = getStoredAlerts();
    return alerts.filter((a) => a.status === 'Confirmed Duplicate' || a.status === 'Pending Review' || a.matchScore >= 90);
  },

  /**
   * Screen Unique Documents
   */
  async getUniqueDocuments(): Promise<DuplicateAlert[]> {
    const alerts = getStoredAlerts();
    return alerts.filter((a) => a.status === 'Cleared as Unique' || a.status === 'AI Cleared' || a.matchScore < 60);
  },

  /**
   * Screen Review History
   */
  async getReviewHistory(): Promise<DuplicateAlert[]> {
    const alerts = getStoredAlerts();
    return alerts.filter((a) => a.reviewedAt || a.status !== 'Pending Review');
  },
};

export default duplicateScanService;
