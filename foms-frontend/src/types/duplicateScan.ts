/**
 * src/types/duplicateScan.ts
 * Type definitions for the AI Financial Intelligence Layer (AFIL) Duplicate Scan module.
 * Strictly adheres to Separation of Duties, Weighted Match Scoring, and FOMS Review Lifecycle.
 */

export type MatchResultType = 'EXACT_MATCH' | 'PARTIAL_MATCH' | 'NO_MATCH' | 'NOT_READ';

export type DuplicateClassification = 'POSSIBLE_DUPLICATE' | 'NEEDS_MANUAL_REVIEW' | 'NO_DUPLICATE';

export type DuplicateAlertStatus =
  | 'Scanned'
  | 'Pending Review'
  | 'Confirmed Duplicate'
  | 'Cleared as Unique'
  | 'Returned'
  | 'AI Cleared';

export interface ExtractedField<T = string | number | null> {
  value: T;
  confidence: number;
}

export interface ExtractedDocumentFields {
  documentType: ExtractedField<string | null>;
  orInvoiceNumber: ExtractedField<string | null>;
  clientName: ExtractedField<string | null>;
  amount: ExtractedField<number | null>;
  transactionDate: ExtractedField<string | null>;
  referenceNumber: ExtractedField<string | null>;
  waybillNumber: ExtractedField<string | null>;
}

export interface ComparisonMatrixRow {
  fieldKey: string;
  fieldLabel: string;
  uploadedValue: string | number | null;
  uploadedConfidence: number;
  existingValue: string | number | null;
  matchResult: MatchResultType;
  weight: number;
}

export interface ExistingFomsRecord {
  recordId: string;
  documentType: string;
  orInvoiceNumber: string;
  clientName: string;
  amount: number | null;
  transactionDate: string | null;
  referenceNumber: string | null;
  waybillNumber: string | null;
  dueDate?: string | null;
  clientId?: string | number | null;
  invoiceId?: string | number | null;
  updatedAt?: string | null;
  previewUrl?: string;
}

export interface DuplicateScanResult {
  scanId: string;
  alertId?: string;
  matchScore: number;
  classification: DuplicateClassification;
  classificationLabel: 'Possible Duplicate Detected' | 'Needs Manual Review' | 'No Duplicate Found';
  classificationColor: 'red' | 'amber' | 'green';
  conflictFlag: boolean;
  conflictReason?: string | null;
  lowExtractionQuality: boolean;
  checkedDateTime: string;
  uploadedDocument: {
    fileName: string;
    fileSize: number;
    previewUrl: string;
    extracted: ExtractedDocumentFields;
  };
  existingRecord: ExistingFomsRecord | null;
  matrix: ComparisonMatrixRow[];
}

export interface DuplicateAlert {
  alertId: string;
  scanId: string;
  documentNo: string;
  documentType: string;
  clientName: string;
  matchScore: number;
  status: DuplicateAlertStatus;
  conflictFlag: boolean;
  conflictReason?: string | null;
  lowExtractionQuality: boolean;
  submittedBy: string;
  submittedById: string;
  submittedAt: string;
  submissionNote?: string;
  reviewedBy?: string | null;
  reviewedById?: string | null;
  reviewedAt?: string | null;
  decision?: 'DUPLICATE' | 'UNIQUE' | 'RETURNED';
  duplicateReason?: 'Same reference number' | 'Same invoice number' | 'Same amount and client' | 'Other';
  recommendedAction?: 'Flag and Block New Submission' | 'Keep for Investigation';
  auditNotes?: string;
  uploadedDocument: {
    fileName: string;
    fileSize: number;
    previewUrl: string;
    extracted: ExtractedDocumentFields;
  };
  existingRecord: ExistingFomsRecord | null;
  matrix: ComparisonMatrixRow[];
}

export interface HumanValidationPayload {
  decision: 'DUPLICATE' | 'UNIQUE' | 'RETURNED';
  duplicateReason?: 'Same reference number' | 'Same invoice number' | 'Same amount and client' | 'Other';
  recommendedAction?: 'Flag and Block New Submission' | 'Keep for Investigation';
  remarks: string;
  reviewedBy?: string;
  reviewedById?: string;
}

export interface SubmitAlertPayload {
  submissionNote?: string;
  submittedBy?: string;
  submittedById?: string;
}
