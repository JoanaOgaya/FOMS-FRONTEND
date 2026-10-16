import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ROLES } from '../types/auth';
import * as AuthContextModule from '../context/AuthContext';
import { AIDuplicateScan } from '../pages/AIDuplicateScan';
import { MySubmissions } from '../pages/MySubmissions';
import { ManualReviewQueue } from '../pages/ManualReviewQueue';
import { FlaggedDuplicates } from '../pages/FlaggedDuplicates';

const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
  showToast: vi.fn(),
};

vi.mock('../components/ToastContext', () => ({
  useToast: () => ({
    toast: mockToast,
    toasts: [],
    triggerToast: vi.fn(),
    dismissToast: vi.fn(),
  }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function mockAuth(role: (typeof ROLES)[keyof typeof ROLES], id = 'EMP-004', name = 'Maria Mariel Jane Anonuevo') {
  vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
    user: {
      employeeId: id,
      fullName: name,
      role,
    },
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
  });
}

describe('AI Duplicate Scan: Screens A to G Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Screen A: Scan Console (Accountant)', () => {
    it('renders console header, dropzone, and role notice for Accountant', () => {
      mockAuth(ROLES.ACCOUNTANT);
      render(
        <MemoryRouter>
          <AIDuplicateScan />
        </MemoryRouter>
      );

      expect(screen.getByText('Document Checking & AI Scan Console')).toBeDefined();
      expect(screen.getByText('Drag & Drop or Upload Document')).toBeDefined();
      expect(screen.getByText('Choose File')).toBeDefined();
      expect(screen.getByText('Scan Document')).toBeDefined();
      expect(screen.getByText('Decision Support Notice')).toBeDefined();
    });

    it('rejects unsupported file formats with inline error', async () => {
      mockAuth(ROLES.ACCOUNTANT);
      const { container } = render(
        <MemoryRouter>
          <AIDuplicateScan />
        </MemoryRouter>
      );

      const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
      const invalidFile = new File(['dummy'], 'document.pdf', { type: 'application/pdf' });
      fireEvent.change(fileInput, { target: { files: [invalidFile] } });

      await waitFor(() => {
        expect(
          screen.getByText('Unsupported file type. Please upload JPG, JPEG, or PNG receipt statements only.')
        ).toBeDefined();
      });
    });

    it('denies upload and scan access to Financial Manager', () => {
      mockAuth(ROLES.FINANCIAL_MANAGER, 'EMP-001', 'Crystalyn Joyce C. Fajardo');
      render(
        <MemoryRouter>
          <AIDuplicateScan />
        </MemoryRouter>
      );

      expect(screen.getByText('Accountant Document Scanning Console')).toBeDefined();
      expect(
        screen.getByText(/Financial Managers review the manual review queue and make decisions/i)
      ).toBeDefined();
    });
  });

  describe('Screen B & C: Scan Results and Actions', () => {
    it('calculates weighted score, displays matrix, and restricts actions on flagged result (Score >= 60)', async () => {
      mockAuth(ROLES.ACCOUNTANT);
      const { container } = render(
        <MemoryRouter>
          <AIDuplicateScan />
        </MemoryRouter>
      );

      // Select valid file
      const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
      const validFile = new File(['valid'], 'invoice_0042.png', { type: 'image/png' });
      fireEvent.change(fileInput, { target: { files: [validFile] } });

      const startScanBtn = await screen.findByRole('button', { name: /Start AI Duplicate Scan/i });
      fireEvent.click(startScanBtn);

      // Scanning steps
      expect(screen.getByText('Scanning Document...')).toBeDefined();

      // Result screen
      const resultHeader = await screen.findByText('Possible Duplicate Detected', {}, { timeout: 4000 });
      expect(resultHeader).toBeDefined();

      // Comparison matrix rows
      expect(screen.getByText('Comparison Parameters Matrix')).toBeDefined();
      expect(screen.getByText('OR / Invoice Number')).toBeDefined();
      expect(screen.getByText('Amount')).toBeDefined();
      expect(screen.getByText('Client Name')).toBeDefined();

      // For score >= 60, both Submit for Manual Review and Confirm as Unique Document are available (if not needed for duplication)
      expect(screen.getByRole('button', { name: /Submit for Manual Review/i })).toBeDefined();
      expect(screen.getByRole('button', { name: /Confirm as Unique Document/i })).toBeDefined();
      expect(screen.queryByRole('button', { name: /Mark as Duplicate/i })).toBeNull();
    });

    it('shows Confirm as Unique Document when score is below 60', async () => {
      mockAuth(ROLES.ACCOUNTANT);
      const { container } = render(
        <MemoryRouter>
          <AIDuplicateScan />
        </MemoryRouter>
      );

      const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
      const cleanFile = new File(['clean'], 'unique_receipt_statement.png', { type: 'image/png' });
      fireEvent.change(fileInput, { target: { files: [cleanFile] } });

      const startScanBtn = await screen.findByRole('button', { name: /Start AI Duplicate Scan/i });
      fireEvent.click(startScanBtn);

      const resultHeader = await screen.findByText('No Duplicate Found', {}, { timeout: 4000 });
      expect(resultHeader).toBeDefined();

      // For score < 60, action is Confirm as Unique Document
      expect(screen.getByRole('button', { name: /Confirm as Unique Document/i })).toBeDefined();
    });
  });

  describe('Screen D: My Submissions (Accountant)', () => {
    it('renders submissions table with Alert ID, Document No, Match Score, Status, and Returned items note', async () => {
      mockAuth(ROLES.ACCOUNTANT);
      render(
        <MemoryRouter>
          <MySubmissions />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /My Submissions/i })).toBeDefined();
        expect(screen.getByText('ALT-2026-081')).toBeDefined();
        expect(screen.getByText('INV-2026-0042')).toBeDefined();
        expect(screen.getByText('94%')).toBeDefined();
        expect(screen.getAllByText('Pending Review').length).toBeGreaterThan(0);
      });

      // Check returned item FM note and Rescan/Resubmit button
      expect(screen.getByText('ALT-2026-079')).toBeDefined();
      expect(screen.getByText('Returned')).toBeDefined();
      expect(screen.getByRole('button', { name: /Rescan \/ Resubmit/i })).toBeDefined();
      expect(
        screen.getByText(/Rescan required: Official Receipt date stamp and footer tin are blurry in current upload/i)
      ).toBeDefined();
    });
  });

  describe('Screen E & F: Manual Review Queue & Comparison Modal (Financial Manager)', () => {
    it('lists pending review items and enforces Separation of Duties on decision', async () => {
      mockAuth(ROLES.FINANCIAL_MANAGER, 'EMP-001', 'Crystalyn Joyce C. Fajardo');
      render(
        <MemoryRouter>
          <ManualReviewQueue />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /Manual Review Queue/i })).toBeDefined();
        expect(screen.getByText('ALT-2026-081')).toBeDefined();
      });

      // Click Review to open Screen F Comparison Modal
      const reviewButtons = screen.getAllByRole('button', { name: /Review/i });
      fireEvent.click(reviewButtons[0]);

      // Screen F elements
      expect(screen.getByText(/Duplicate Record Comparison/i)).toBeDefined();
      expect(screen.getByText(/Matching Factors Confidence/i)).toBeDefined();
      expect(screen.getByText(/Accountant Submission Note/i)).toBeDefined();
      expect(screen.getByText('Log Human Validation Action')).toBeDefined();
      expect(screen.getByText('Mark as Duplicate')).toBeDefined();
      expect(screen.getByText('Mark as Unique')).toBeDefined();
      expect(screen.getByText('Return to Accountant')).toBeDefined();

      // Submit Decision button is available when FM did NOT submit it
      const submitDecisionBtn = screen.getByRole('button', { name: /Submit Decision/i }) as HTMLButtonElement;
      expect(submitDecisionBtn.disabled).toBe(false);
    });

    it('blocks decision submission when Financial Manager submitted the document themselves (Separation of Duties)', async () => {
      // Mock FM user who also submitted ALT-2026-081 (EMP-004)
      mockAuth(ROLES.FINANCIAL_MANAGER, 'EMP-004', 'Maria Mariel Jane Anonuevo');
      render(
        <MemoryRouter>
          <ManualReviewQueue />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('ALT-2026-081')).toBeDefined();
      });

      const reviewButtons = screen.getAllByRole('button', { name: /Review/i });
      fireEvent.click(reviewButtons[0]);

      // Separation of Duties warning must appear
      expect(screen.getByText(/Separation of Duties Notice/i)).toBeDefined();

      // Submit Decision button MUST be disabled
      const submitDecisionBtn = screen.getByRole('button', { name: /Submit Decision/i }) as HTMLButtonElement;
      expect(submitDecisionBtn.disabled).toBe(true);
    });
  });

  describe('Screen G: Flagged Duplicate Documents', () => {
    it('renders confirmed duplicate table with export and read-only details', async () => {
      mockAuth(ROLES.FINANCIAL_MANAGER);
      render(
        <MemoryRouter>
          <FlaggedDuplicates />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /Flagged Duplicate Documents/i })).toBeDefined();
        expect(screen.getByText('Flag ID')).toBeDefined();
        expect(screen.getByText('Uploaded Number')).toBeDefined();
        expect(screen.getByText('Existing Record')).toBeDefined();
      });

      expect(screen.getByRole('button', { name: /Export/i })).toBeDefined();
    });
  });
});
