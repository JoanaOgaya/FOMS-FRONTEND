import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  canViewReceivableRisk,
  canViewCollectionPriority,
  canUploadDocuments,
  canActOnRecord,
  canCheckDuplicateInForm,
} from '../utils/roleAccess';
import { RiskBadge } from '../components/ai/RiskBadge';
import { PriorityBadge } from '../components/ai/PriorityBadge';
import { AiDisclaimer } from '../components/ai/AiDisclaimer';
import { DuplicatePreCheckModal } from '../components/ai/DuplicatePreCheckModal';
import { ExtractedFieldsForm } from '../components/ai/ExtractedFieldsForm';
import { AiErrorBoundary } from '../components/ai/ErrorBoundary';
import type { ExtractedField, DuplicateMatch, RiskScoreResult, DocumentExtractionResult } from '../types/ai';

describe('AI-Powered Financial Intelligence Layer — Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Role Access & Separation of Duties (FR-001, FR-008, FR-014, NFR-005, NFR-008)
  // ──────────────────────────────────────────────────────────────────────────
  describe('1. Role Access & Separation of Duties', () => {
    it('enforces receivable risk access: FM, HA, Accountant permitted; Asst FM blocked (403)', () => {
      expect(canViewReceivableRisk('FINANCIAL_MANAGER')).toBe(true);
      expect(canViewReceivableRisk('HEAD_ACCOUNTANT')).toBe(true);
      expect(canViewReceivableRisk('ACCOUNTANT')).toBe(true);
      expect(canViewReceivableRisk('ASSISTANT_FM')).toBe(false);
      expect(canViewReceivableRisk(undefined)).toBe(false);
    });

    it('enforces collection priority access: FM, HA, Accountant permitted; Asst FM blocked', () => {
      expect(canViewCollectionPriority('FINANCIAL_MANAGER')).toBe(true);
      expect(canViewCollectionPriority('HEAD_ACCOUNTANT')).toBe(true);
      expect(canViewCollectionPriority('ACCOUNTANT')).toBe(true);
      expect(canViewCollectionPriority('ASSISTANT_FM')).toBe(false);
    });

    it('enforces document upload access: Accountant permitted, Asst FM restricted to liquidation docs', () => {
      expect(canUploadDocuments('ACCOUNTANT', 'invoice')).toBe(true);
      expect(canUploadDocuments('ASSISTANT_FM', 'fuel_receipt_liquidation')).toBe(true);
      expect(canUploadDocuments('ASSISTANT_FM', 'invoice')).toBe(false);
      expect(canUploadDocuments('FINANCIAL_MANAGER', 'invoice')).toBe(false);
    });

    it('enforces form pre-save duplicate check permissions: Accountant, Asst FM (liquidation); HA & FM blocked', () => {
      expect(canCheckDuplicateInForm('HEAD_ACCOUNTANT', 'invoice')).toBe(false);
      expect(canCheckDuplicateInForm('ACCOUNTANT', 'waybill')).toBe(true);
      expect(canCheckDuplicateInForm('ASSISTANT_FM', 'liquidation_expense')).toBe(true);
      expect(canCheckDuplicateInForm('ASSISTANT_FM', 'commercial_invoice')).toBe(false);
      expect(canCheckDuplicateInForm('FINANCIAL_MANAGER', 'invoice')).toBe(false);
    });

    it('enforces Separation of Duties: user CANNOT act on their own record', () => {
      const user = { id: 'STAFF-002', employeeId: 'STAFF-002', role: 'HEAD_ACCOUNTANT' as const };
      const ownRecord = { createdBy: 'STAFF-002', status: 'Pending Review' };
      const otherRecord = { createdBy: 'STAFF-003', status: 'Pending Review' };

      const ownCheck = canActOnRecord(user, ownRecord, 'confirm');
      expect(ownCheck.allowed).toBe(false);
      expect(ownCheck.reason).toBe('You cannot act on your own record');

      const otherCheck = canActOnRecord(user, otherRecord, 'confirm');
      expect(otherCheck.allowed).toBe(true);
    });

    it('enforces role action hierarchy: only FM can perform final resolve on verified records', () => {
      const fm = { id: 'STAFF-001', role: 'FINANCIAL_MANAGER' as const };
      const ha = { id: 'STAFF-002', role: 'HEAD_ACCOUNTANT' as const };
      const acc = { id: 'STAFF-003', role: 'ACCOUNTANT' as const };

      const unverifiedRecord = { createdBy: 'STAFF-099', status: 'Pending Review' };
      const verifiedRecord = { createdBy: 'STAFF-099', status: 'CONFIRMED_DUPLICATE' };

      // FM on unverified -> blocked
      expect(canActOnRecord(fm, unverifiedRecord, 'resolve').allowed).toBe(false);
      // FM on verified -> allowed
      expect(canActOnRecord(fm, verifiedRecord, 'resolve').allowed).toBe(true);
      // HA on verified -> blocked from resolve
      expect(canActOnRecord(ha, verifiedRecord, 'resolve').allowed).toBe(false);
      // Accountant is remarks only
      expect(canActOnRecord(acc, verifiedRecord, 'confirm').allowed).toBe(false);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. AI Disclaimer & Badges (NFR-001, FR-008..FR-011)
  // ──────────────────────────────────────────────────────────────────────────
  describe('2. AI Disclaimers & Dynamic Badges', () => {
    it('renders the mandatory AI disclaimer text', () => {
      render(<AiDisclaimer />);
      expect(screen.getByText(/AI suggestion, requires validation/i)).toBeTruthy();
    });

    it('renders RiskBadge with server-provided level and score', () => {
      render(<RiskBadge score={82} level="HIGH" />);
      expect(screen.getByText(/High/i)).toBeTruthy();
      expect(screen.getByText(/82/i)).toBeTruthy();
    });

    it('renders RiskBadge gracefully with N/A when score is missing', () => {
      render(<RiskBadge score={null} level={null} />);
      expect(screen.getByText('N/A')).toBeTruthy();
    });

    it('renders PriorityBadge with level, rank, and score', () => {
      render(<PriorityBadge level="High Priority" rank={1} score={95} />);
      expect(screen.getByText('High Priority')).toBeTruthy();
      expect(screen.getByText('1')).toBeTruthy();
      expect(screen.getByText('(95 pts)')).toBeTruthy();
    });

    it('opens factor breakdown drawer when RiskBadge is clicked', () => {
      const mockResult: RiskScoreResult = {
        entityId: 'INV-2026-004',
        entityType: 'invoice',
        riskScore: 82,
        riskLevel: 'HIGH',
        paymentLabel: 'OVERDUE',
        formulaVersion: 'v2.4-risk-matrix',
        computedAt: '2026-03-10T08:00:00Z',
        factors: [
          { name: 'Days Past Due', points: 35, inputValue: '38 days', description: 'Overdue' },
        ],
      };

      render(<RiskBadge result={mockResult} />);
      fireEvent.click(screen.getByRole('button'));

      expect(screen.getByText(/Why is this High/i)).toBeTruthy();
      expect(screen.getByText('Days Past Due')).toBeTruthy();
      expect(screen.getByText('+35 pts')).toBeTruthy();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Pre-Save Duplicate Check Modal (FR-002..FR-007, NFR-002)
  // ──────────────────────────────────────────────────────────────────────────
  describe('3. Form Pre-Save Duplicate Check Modal', () => {
    it('shows "Checking for duplicates..." when status is checking', () => {
      render(
        <DuplicatePreCheckModal
          isOpen={true}
          status="checking"
          matches={[]}
          onCancel={vi.fn()}
          onRetry={vi.fn()}
          onProceedWithRemarks={vi.fn()}
          onProceedManualReview={vi.fn()}
        />
      );
      expect(screen.getByText(/Checking for Potential Duplicates/i)).toBeTruthy();
    });

    it('shows "Still checking..." when status is slow (>5s)', () => {
      render(
        <DuplicatePreCheckModal
          isOpen={true}
          status="slow"
          matches={[]}
          onCancel={vi.fn()}
          onRetry={vi.fn()}
          onProceedWithRemarks={vi.fn()}
          onProceedManualReview={vi.fn()}
        />
      );
      expect(screen.getAllByText(/Still checking/i).length).toBeGreaterThan(0);
      expect(screen.getByText(/taking longer than 5 seconds/i)).toBeTruthy();
    });

    it('blocks save when matches found until remarks are entered', () => {
      const matches: DuplicateMatch[] = [
        {
          recordId: 'WB-1002',
          documentNumber: 'WB-1002',
          clientName: 'FastTrack Logistics',
          similarity: 100,
          matchReason: 'Exact waybill number match',
        },
      ];

      const onProceed = vi.fn();
      render(
        <DuplicatePreCheckModal
          isOpen={true}
          status="matches_found"
          matches={matches}
          onCancel={vi.fn()}
          onRetry={vi.fn()}
          onProceedWithRemarks={onProceed}
          onProceedManualReview={vi.fn()}
        />
      );

      expect(screen.getByText(/Duplicate Document Alert/i)).toBeTruthy();
      expect(screen.getByText(/WB-1002/i)).toBeTruthy();

      const proceedButton = screen.getByRole('button', { name: /Proceed with Remarks/i });

      // Click without remarks should show validation error
      fireEvent.click(proceedButton);
      expect(screen.getByText(/Remarks and justification are required/i)).toBeTruthy();
      expect(onProceed).not.toHaveBeenCalled();

      // Enter remarks
      const textarea = screen.getByPlaceholderText(/Explain why this record is legitimate/i);
      fireEvent.change(textarea, { target: { value: 'Verified re-delivery of damaged package' } });

      fireEvent.click(proceedButton);
      expect(onProceed).toHaveBeenCalledWith('Verified re-delivery of damaged package');
    });

    it('provides retry and manual review bypass when AI service fails', () => {
      const onRetry = vi.fn();
      const onManualReview = vi.fn();

      render(
        <DuplicatePreCheckModal
          isOpen={true}
          status="error"
          matches={[]}
          errorMessage="Service 503 Unavailable"
          onCancel={vi.fn()}
          onRetry={onRetry}
          onProceedWithRemarks={vi.fn()}
          onProceedManualReview={onManualReview}
        />
      );

      expect(screen.getByText(/AI check unavailable/i)).toBeTruthy();
      expect(screen.getByText('Service 503 Unavailable')).toBeTruthy();

      // Retry button
      fireEvent.click(screen.getByRole('button', { name: /Retry Check/i }));
      expect(onRetry).toHaveBeenCalled();

      // Manual review button
      const bypassBtn = screen.getByRole('button', { name: /Proceed with Manual Review/i });

      // Click without remarks should show error
      fireEvent.click(bypassBtn);
      expect(screen.getByText(/Remarks and justification are required/i)).toBeTruthy();
      expect(onManualReview).not.toHaveBeenCalled();

      const textarea = screen.getByPlaceholderText(/Explain manual document verification performed/i);
      fireEvent.change(textarea, { target: { value: 'Urgent month-end batch encoding' } });

      fireEvent.click(bypassBtn);
      expect(onManualReview).toHaveBeenCalledWith('Urgent month-end batch encoding');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. Document Extraction & Low-Confidence Fields (FR-020..FR-024)
  // ──────────────────────────────────────────────────────────────────────────
  describe('4. Document Extraction & OCR Form Verification', () => {
    const fields: ExtractedField[] = [
      {
        fieldName: 'invoiceNumber',
        key: 'invoiceNumber',
        label: 'Invoice Number',
        extractedValue: 'INV-2026-901',
        value: 'INV-2026-901',
        confidence: 99,
        isLowConfidence: false,
      },
      {
        fieldName: 'tinNumber',
        key: 'tinNumber',
        label: 'Client TIN',
        extractedValue: '004-912-381-000',
        value: '004-912-381-000',
        confidence: 62,
        isLowConfidence: true,
        warning: 'Low confidence (62% < 70%)',
      },
    ];

    const mockExtraction: DocumentExtractionResult = {
      id: 'DOC-2026-001',
      fileName: 'invoice_scan.pdf',
      fileSize: 102400,
      docType: 'invoice',
      status: 'EXTRACTED',
      overallConfidence: 81,
      uploadedAt: '2026-03-10T10:00:00Z',
      uploadedBy: 'Clara Oswald',
      fields,
      completeness: [],
    };

    it('highlights low confidence fields with warning badges', () => {
      render(
        <ExtractedFieldsForm
          extraction={mockExtraction}
          onConfirm={vi.fn()}
        />
      );

      expect(screen.getByText(/Verify/i)).toBeTruthy();
      expect(screen.getByText(/62%/i)).toBeTruthy();
      expect(screen.getByText(/Yellow highlights denote low AI confidence/i)).toBeTruthy();
    });

    it('requires justification remarks when an extracted field is manually edited', async () => {
      const onConfirm = vi.fn();
      render(
        <ExtractedFieldsForm
          extraction={mockExtraction}
          onConfirm={onConfirm}
        />
      );

      // Edit TIN field
      const tinInput = screen.getByDisplayValue('004-912-381-000');
      fireEvent.change(tinInput, { target: { value: '004-912-381-999' } });

      // Click submit without remarks
      const confirmBtn = screen.getByRole('button', { name: /Confirm & Validate Extraction/i });
      fireEvent.click(confirmBtn);

      expect(screen.getByText(/Reviewer remarks are required when correcting extracted fields/i)).toBeTruthy();
      expect(onConfirm).not.toHaveBeenCalled();

      // Enter modification justification remarks
      const remarksArea = screen.getByPlaceholderText(/Required: Explain corrections made to extracted values/i);
      fireEvent.change(remarksArea, { target: { value: 'Corrected smudged last digit' } });

      fireEvent.click(confirmBtn);

      expect(onConfirm).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'DOC-2026-001',
          confirmedFields: expect.objectContaining({ tinNumber: '004-912-381-999' }),
          remarks: 'Corrected smudged last digit',
        })
      );
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 5. Error Boundary Isolation (FR-006, NFR-004)
  // ──────────────────────────────────────────────────────────────────────────
  describe('5. Error Boundary Isolation', () => {
    it('catches render errors in AI modules without crashing parent', () => {
      const BombComponent = () => {
        throw new Error('AI Engine Matrix Failure');
      };

      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

      render(
        <AiErrorBoundary moduleName="Risk Engine">
          <BombComponent />
        </AiErrorBoundary>
      );

      expect(screen.getByText(/Risk Engine unavailable/i)).toBeTruthy();
      expect(screen.getByRole('button', { name: /Retry Module/i })).toBeTruthy();

      spy.mockRestore();
    });
  });
});
