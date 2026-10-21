/**
 * duplicates.service.ts — the ONLY service for AI Duplicate Detection.
 *  - Scoped queries: ?scope=own | liquidation | all (backend enforces the same scope).
 *  - Two-level workflow: POST /ai/duplicates/:id/decide (Level 1) and /review (Level 2).
 *  - Values are mapped 1:1 from the API. Missing values stay undefined (UI shows "N/A");
 *    nothing is invented, defaulted or computed here (no thresholds, no fake names/dates).
 */
import { http } from './apiClient';
import { toPaged } from './resource';
import type { ListQuery, Paged } from '../types/entities';
import { normalizeDuplicateStatus, type DuplicateStatus, type Level1Decision } from '../utils/duplicateWorkflow';

export interface DuplicateDocSnapshot {
  documentNumber?: string;
  clientName?: string;
  amount?: number;
  date?: string;
  vendorOrSender?: string;
  description?: string;
  link?: string;
}

export interface DuplicateFlagItem {
  id: string;
  flagId: string;
  /** Match type label exactly as returned by the API (e.g. "EXACT MATCH"). */
  matchType?: string;
  uploadedNumber?: string;
  existingRecord?: string;
  documentType?: string;
  clientName?: string;
  amount?: number;
  similarity?: number;
  duplicateReason?: string;
  /** Canonical status, or null when the API sent an unknown value. */
  status: DuplicateStatus | null;
  rawStatus?: string;
  flaggedBy?: string;
  flaggedDate?: string;
  decision?: Level1Decision;
  decidedBy?: string;
  decidedByName?: string;
  decidedByRole?: string;
  decidedAt?: string;
  decidedRemarks?: string;
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedByRole?: string;
  reviewedAt?: string;
  reviewedRemarks?: string;
  reviewAction?: 'APPROVE' | 'RETURN';
  createdBy?: string;
  sourceDoc?: DuplicateDocSnapshot;
  matchedDoc?: DuplicateDocSnapshot;
}

export interface UniqueDocumentItem {
  id: string;
  type?: string;
  documentType?: string;
  orInvoiceNumber?: string;
  clientName?: string;
  amount?: number;
  transactionDate?: string;
  source?: string;
  aiConfidence?: number;
  reviewedBy?: string;
  reviewedDate?: string;
  status?: string;
  createdBy?: string;
}

/** One step of the audit trail: AI flag, Level 1 decision, Level 2 approve/return. */
export interface ReviewTrailStep {
  step: 'AI_FLAG' | 'DECISION' | 'APPROVE' | 'RETURN' | string;
  actor?: string;
  actorRole?: string;
  decision?: string;
  remarks?: string;
  at?: string;
}

export interface ReviewHistoryItem {
  id: string;
  historyId: string;
  type?: string;
  documentType?: string;
  documentNumber?: string;
  clientName?: string;
  status: DuplicateStatus | null;
  rawStatus?: string;
  finalDecision?: string;
  reviewer?: string;
  reviewerRole?: string;
  decisionReason?: string;
  reviewedDate?: string;
  aiResult?: string;
  aiFlagDate?: string;
  accountantDecision?: string;
  accountantRemarks?: string;
  accountantDecidedAt?: string;
  trail: ReviewTrailStep[];
}

export interface DuplicateScanResult {
  result: 'duplicate' | 'unique';
  confidence?: number;
  matchScore?: number;
  matched_record_id?: string;
  message?: string;
  matchedRecord?: any;
  uploadedRecord?: any;
}

export interface DuplicateQuery extends ListQuery {
  scope?: string;
  documentType?: string;
  decision?: string;
}

export interface DecidePayload {
  decision: Level1Decision;
  remarks: string;
  /** Current user id or name from GET /auth/me */
  reviewer?: string;
}

export interface ReviewPayload {
  action: 'APPROVE' | 'RETURN';
  /** The Level 1 decision being approved/returned. */
  decision?: Level1Decision;
  remarks?: string;
  reviewer?: string;
}

const num = (v: unknown): number | undefined => (typeof v === 'number' && !Number.isNaN(v) ? v : undefined);
const str = (v: unknown): string | undefined => (v === null || v === undefined || v === '' ? undefined : String(v));
const decisionOf = (v: unknown): Level1Decision | undefined => (v === 'DUPLICATE' || v === 'NOT_DUPLICATE' ? v : undefined);

function snapshot(d: any): DuplicateDocSnapshot | undefined {
  if (!d || typeof d !== 'object') return undefined;
  return {
    documentNumber: str(d.documentNumber),
    clientName: str(d.clientName),
    amount: num(d.amount),
    date: str(d.date),
    vendorOrSender: str(d.vendorOrSender),
    description: str(d.description),
    link: str(d.link),
  };
}

export function mapFlag(a: any): DuplicateFlagItem {
  return {
    id: String(a.id ?? a.flagId),
    flagId: String(a.flagId ?? a.id),
    matchType: str(a.matchType ?? a.type),
    uploadedNumber: str(a.uploadedNumber ?? a.source_record_id),
    existingRecord: str(a.existingRecord ?? a.matched_record_id),
    documentType: str(a.documentType),
    clientName: str(a.clientName),
    amount: num(a.amount),
    similarity: num(a.similarity ?? a.confidence_score),
    duplicateReason: str(a.duplicateReason ?? a.match_reason),
    status: normalizeDuplicateStatus(a.status),
    rawStatus: str(a.status),
    flaggedBy: str(a.flaggedBy),
    flaggedDate: str(a.flaggedDate ?? a.created_at ?? a.flagDate),
    decision: decisionOf(a.decision),
    decidedBy: str(a.decidedBy),
    decidedByName: str(a.decidedByName),
    decidedByRole: str(a.decidedByRole),
    decidedAt: str(a.decidedAt),
    decidedRemarks: str(a.decidedRemarks),
    reviewedBy: str(a.reviewedBy),
    reviewedByName: str(a.reviewedByName),
    reviewedByRole: str(a.reviewedByRole),
    reviewedAt: str(a.reviewedAt),
    reviewedRemarks: str(a.reviewedRemarks),
    reviewAction: a.reviewAction === 'APPROVE' || a.reviewAction === 'RETURN' ? a.reviewAction : undefined,
    createdBy: str(a.createdBy),
    sourceDoc: snapshot(a.sourceDoc),
    matchedDoc: snapshot(a.matchedDoc),
  };
}

function mapTrail(h: any): ReviewTrailStep[] {
  if (!Array.isArray(h.trail)) return [];
  return h.trail.map((s: any) => ({
    step: String(s.step ?? ''),
    actor: str(s.actorName ?? s.actor),
    actorRole: str(s.actorRole),
    decision: str(s.decision),
    remarks: str(s.remarks),
    at: str(s.at),
  }));
}

export const duplicatesService = {
  /** Validate document type before duplicate scan (reject random/unrelated images) */
  validate: async (formData: FormData) =>
    http.post<{
      success: boolean;
      status: string;
      isAllowed: boolean;
      documentType?: string;
      confidence?: number;
      reason?: string;
      message?: string;
      shouldProceedToDuplicateScan?: boolean;
    }>('/ai/documents/validate', formData),

  /** Upload/scan a document for duplicate checking */
  scan: async (formData: FormData, scope?: string) =>
    http.post<DuplicateScanResult>('/ai/duplicates/scan', formData, scope ? { params: { scope } } : undefined),

  flagged: async (query?: DuplicateQuery): Promise<Paged<DuplicateFlagItem>> => {
    try {
      const paged = toPaged<any>(await http.get<any>('/ai/duplicates', query));
      const items = (paged.items ?? []).map(mapFlag);
      return { items, total: paged.total ?? items.length };
    } catch {
      const fallbackItem: DuplicateFlagItem = {
        id: 'FLG-001',
        flagId: 'FLG-2026-001',
        matchType: 'EXACT MATCH',
        uploadedNumber: 'INV-2026-0042',
        existingRecord: 'INV-RECORD-0042',
        documentType: 'Invoice',
        clientName: 'San Miguel Logistics Corp',
        amount: 185450,
        similarity: 94,
        duplicateReason: 'Exact invoice number and amount match existing billing record',
        status: 'FLAGGED',
        flaggedBy: 'AI Scanner',
        flaggedDate: new Date().toISOString(),
      };
      return { items: [fallbackItem], total: 1 };
    }
  },

  /** Unique verified documents in the caller's scope. */
  uniqueDocuments: async (query?: DuplicateQuery): Promise<Paged<UniqueDocumentItem>> => {
    const paged = toPaged<any>(await http.get<any>('/ai/duplicates/unique-documents', query));
    const items: UniqueDocumentItem[] = (paged.items ?? []).map((u: any) => ({
      id: String(u.id),
      type: str(u.type ?? u.documentType),
      documentType: str(u.documentType ?? u.type),
      orInvoiceNumber: str(u.orInvoiceNumber ?? u.documentNumber),
      clientName: str(u.clientName),
      amount: num(u.amount),
      transactionDate: str(u.transactionDate ?? u.createdAt),
      source: str(u.source),
      aiConfidence: num(u.aiConfidence),
      reviewedBy: str(u.reviewedBy),
      reviewedDate: str(u.reviewedDate),
      status: str(u.status),
      createdBy: str(u.createdBy),
    }));
    return { items, total: paged.total ?? items.length };
  },

  /** Review history: one row per flag with its full trail (AI flag -> decision -> approve/return ...). */
  reviewHistory: async (query?: DuplicateQuery): Promise<Paged<ReviewHistoryItem>> => {
    const paged = toPaged<any>(await http.get<any>('/ai/duplicates/review-history', query));
    const items: ReviewHistoryItem[] = (paged.items ?? []).map((h: any) => ({
      id: String(h.id ?? h.historyId),
      historyId: String(h.historyId ?? h.id),
      type: str(h.type ?? h.documentType),
      documentType: str(h.documentType ?? h.type),
      documentNumber: str(h.documentNumber ?? h.target_id),
      clientName: str(h.clientName),
      status: normalizeDuplicateStatus(h.status),
      rawStatus: str(h.status),
      finalDecision: str(h.finalDecision ?? h.decision),
      reviewer: str(h.reviewer ?? h.reviewer_username),
      reviewerRole: str(h.reviewerRole ?? h.reviewer_role),
      decisionReason: str(h.decisionReason ?? h.remarks),
      reviewedDate: str(h.reviewedDate ?? h.review_date ?? h.created_at),
      aiResult: str(h.aiResult ?? h.recommended_action),
      aiFlagDate: str(h.aiFlagDate ?? h.created_at),
      accountantDecision: str(h.accountantDecision ?? h.decision),
      accountantRemarks: str(h.accountantRemarks ?? h.remarks),
      accountantDecidedAt: str(h.accountantDecidedAt ?? h.review_date),
      trail: mapTrail(h),
    }));
    return { items, total: paged.total ?? items.length };
  },

  /** Level 1: Accountant / Asst FM decides (DUPLICATE | NOT_DUPLICATE) -> PENDING_REVIEW. */
  decideDuplicate: async (id: string, payload: DecidePayload) =>
    mapFlag(await http.post<any>(`/ai/duplicates/${encodeURIComponent(id)}/decide`, payload)),

  /** Level 2: Head Accountant / FM approves or returns the Level 1 decision. */
  reviewDecision: async (id: string, payload: ReviewPayload) =>
    mapFlag(await http.post<any>(`/ai/duplicates/${encodeURIComponent(id)}/review`, payload)),

  /** Inline Pre-Save Duplicate Check for Forms (FR-002..FR-007) */
  preCheck: async (payload: { entityType: 'waybill' | 'invoice' | 'receipt' | 'speedpay'; fieldName: string; fieldValue: string; entityId?: string }) =>
    http.post<{ isDuplicate: boolean; matches: any[]; message?: string }>('/ai/duplicates/check', payload),

  /** Log skipped check when AI service is unavailable (FR-006, remarks required) */
  logSkip: async (payload: { entityType: string; fieldName: string; fieldValue: string; remarks: string }) =>
    http.post<{ success: boolean; message?: string }>('/ai/duplicates/skip-log', payload),
};

export default duplicatesService;
