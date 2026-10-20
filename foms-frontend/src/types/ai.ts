/**
 * src/types/ai.ts
 * Unified TypeScript types for the AI Financial Intelligence Layer
 * Strictly adheres to FR-001..FR-025 and NFR-001..NFR-024.
 *
 * All values, scores, confidence flags, and extracted fields are returned by the API.
 * The frontend NEVER computes risk scores, thresholds, or priorities.
 */

import type { Role } from './auth';

// ── 1. Receivable Risk & Scoring (FR-008..FR-013) ──────────────────────────

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
export type PaymentLabel = 'UNPAID' | 'DUE_SOON' | 'OVERDUE' | 'PAID' | string;

export interface RiskFactor {
  name: string;
  points: number;
  inputValue: string;
  description?: string;
}

export interface RiskScoreResult {
  entityId: string;
  entityType?: 'invoice' | 'account' | 'client';
  riskScore: number;
  riskLevel: RiskLevel;
  paymentLabel: PaymentLabel;
  factors: RiskFactor[];
  formulaVersion: string;
  computedAt: string;
}

export interface RiskBand {
  level: RiskLevel;
  min: number;
  max: number;
  color?: string;
  badgeBg?: string;
  description?: string;
}

export interface RiskConfig {
  formulaVersion: string;
  bands: RiskBand[];
  description?: string;
  lastUpdated?: string;
}

// ── 2. Collection Forecasting & Recommendations (FR-014..FR-017) ───────────

export interface CollectionPriorityItem {
  id: string;
  invoiceId?: string;
  invoiceNumber: string;
  clientName: string;
  clientId?: string;
  outstandingBalance: number;
  dueDate: string;
  riskScore: number;
  riskLevel: RiskLevel;
  priorityRank: number;
  daysOverdue: number;
  suggestedAction?: string;
  aiConfidence?: number;
  reviewStatus?: string;
  remarks?: string;
  createdBy?: string;
  reviewedBy?: string;
  reviewedAt?: string;
}

export interface FollowUpSuggestion {
  id: string;
  clientId: string;
  clientName: string;
  invoiceId?: string;
  invoiceNumber?: string;
  score: number;
  suggestionText: string;
  priority: string;
  contactPerson?: string;
  contactPhone?: string;
  contactEmail?: string;
  confidence: number;
  isAiGenerated: true;
  createdAt: string;
}

export interface DashboardAiAlert {
  id: string;
  type: 'duplicate' | 'risk' | 'collection' | 'document' | 'liquidation';
  title: string;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  entityId?: string;
  entityType?: string;
  targetRoute?: string;
  createdAt: string;
  createdBy?: string;
  scope?: string;
  score?: number;
}

// ── 3. Duplicate Pre-Save Check (FR-002..FR-007, NFR-002) ──────────────────

export interface DuplicatePreCheckRequest {
  entityType: 'waybill' | 'invoice' | 'receipt' | 'speedpay';
  fieldName: string;
  fieldValue: string;
  entityId?: string;
}

export interface DuplicateMatch {
  recordId: string;
  documentNumber: string;
  clientName?: string;
  amount?: number;
  similarity: number;
  matchReason: string;
  createdAt?: string;
  url?: string;
}

export interface DuplicatePreCheckResult {
  isDuplicate: boolean;
  matches: DuplicateMatch[];
  message?: string;
  checkedAt?: string;
}

// ── 4. Document Checking & Extraction (FR-020..FR-024, NFR-007) ────────────

export type DocumentType = 'invoice' | 'proof_of_payment' | 'waybill' | 'pod' | 'liquidation' | string;
export type ExtractionStatus = 'UPLOADING' | 'PROCESSING' | 'DONE' | 'FAILED' | 'EXTRACTED';

export interface CompletenessItem {
  label: string;
  isPresent: boolean;
  description?: string;
}

export interface ExtractedField {
  key: string;
  label: string;
  value: string | number;
  confidence: number;
  isLowConfidence: boolean;
  type?: 'text' | 'number' | 'date' | 'currency';
  fieldName?: string;
  extractedValue?: string | number;
  warning?: string;
}

export interface DocumentExtractionResult {
  id: string;
  documentType?: DocumentType;
  docType?: string;
  fileName: string;
  fileSize?: number;
  fileUrl?: string;
  status: ExtractionStatus;
  overallConfidence?: number;
  failureReason?: string;
  completeness: CompletenessItem[];
  fields: ExtractedField[];
  uploadedAt: string;
  uploadedBy: string;
  uploadedByRole?: string;
  verifiedAt?: string;
  verifiedBy?: string;
  isConfirmed?: boolean;
  remarks?: string;
  createdBy?: string;
}

export interface ConfirmExtractionPayload {
  id: string;
  confirmedFields: Record<string, string | number>;
  reviewer: string;
  remarks?: string;
}

// ── 5. AI Output History (FR-025, NFR-017..NFR-020) ─────────────────────────

export interface AiOutputRecord {
  id: string;
  module: 'duplicate' | 'risk' | 'collection' | 'document';
  entityType: string;
  entityId: string;
  documentNumber?: string;
  clientName?: string;
  outputSummary: string;
  score?: number;
  level?: string;
  reviewer?: string;
  reviewerRole?: string;
  reviewDecision?: string;
  remarks?: string;
  createdAt: string;
  linkUrl: string;
  createdBy?: string;
}
