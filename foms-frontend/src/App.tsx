/**
 * App — providers + routes. Routes are generated from MODULES (utils/roleAccess), so the sidebar,
 * the route table and the guards can never disagree. Add a page by adding a module and a PAGES entry.
 */
import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ToastProvider } from './components/ToastContext';
import ToastBar from './components/ToastBar';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ProtectedRoute, RoleGuard } from './components/ProtectedRoute';
import MainLayout from './components/MainLayout';
import { useCancelButtonFeedback } from './hooks/useCancelButtonFeedback';
import { LANDING_PATH, MODULES, type ModuleKey } from './utils/roleAccess';

import { LoginPage } from './pages/LoginPage';
import SpeedPay from './pages/SpeedPay';
import Dashboard from './pages/Dashboard';
import ProfilePage from './pages/ProfilePage';
import NotificationsPage from './pages/NotificationsPage';
import ClientManagement from './pages/ClientManagement';
import RateConfiguration from './pages/RateConfiguration';
import Waybills from './pages/Waybills';
import BillingValidation from './pages/BillingValidation';
import InvoiceCreation from './pages/InvoiceCreation';
import InvoicingDesk from './pages/InvoicingDesk';
import InvoiceReview from './pages/InvoiceReview';
import AccountsReceivable from './pages/AccountsReceivable';
import Payments from './pages/Payments';
import Receipts from './pages/Receipts';
import Settlements from './pages/Settlements';
import RecordSettlement from './pages/RecordSettlement';
import SpeedPayValidation from './pages/SpeedPayValidation';
import FinancialAdjustments from './pages/FinancialAdjustments';
import LiquidationValidation from './pages/LiquidationValidation';
import CashFlowManagement from './pages/CashFlowManagement';
import AIDuplicateScan from './pages/AIDuplicateScan';
import UniqueDocuments from './pages/UniqueDocuments';
import FlaggedDuplicates from './pages/FlaggedDuplicates';
import ReviewHistory from './pages/ReviewHistory';
import ForReview from './pages/ForReview';
import Reports from './pages/Reports';
import { AuditLogs } from './pages/AuditLogs';
import DocumentExtraction from './pages/DocumentExtraction';
import AIOutputHistory from './pages/AIOutputHistory';

const PAGES: Record<ModuleKey, React.ComponentType> = {
  dashboard: Dashboard,
  clients: ClientManagement,
  rates: RateConfiguration,
  waybills: Waybills,
  billingValidation: BillingValidation,
  invoiceCreate: InvoiceCreation,
  invoicingDesk: InvoicingDesk,
  invoiceReview: InvoiceReview,
  accountsReceivable: AccountsReceivable,
  payments: Payments,
  receipts: Receipts,
  settlements: Settlements,
  recordSettlement: RecordSettlement,
  speedpayValidation: SpeedPayValidation,
  adjustments: FinancialAdjustments,
  liquidations: LiquidationValidation,
  cashFlow: CashFlowManagement,
  duplicateScan: AIDuplicateScan,
  uniqueDocuments: UniqueDocuments,
  flaggedDuplicates: FlaggedDuplicates,
  reviewHistory: ReviewHistory,
  documentExtraction: DocumentExtraction,
  forReview: ForReview,
  reports: Reports,
  auditLogs: AuditLogs,
  aiHistory: AIOutputHistory,
  profile: ProfilePage,
  notifications: NotificationsPage,
};

/** "/" and unknown URLs send each role to its own landing page. */
const RoleHome: React.FC = () => {
  const { user } = useAuth();
  return <Navigate to={user ? LANDING_PATH[user.role] : '/login'} replace />;
};

const AppRoutes: React.FC = () => {
  useCancelButtonFeedback();
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/speedpay" element={<SpeedPay />} />

      <Route
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        {MODULES.flatMap((m) => {
          const Page = PAGES[m.key];
          const element = <RoleGuard module={m.key}><Page /></RoleGuard>;
          return [m.path, ...(m.detailPath ? [m.detailPath] : [])].map((path) => <Route key={path} path={path} element={element} />);
        })}
        <Route path="/ai/output-history" element={<Navigate to="/ai-history" replace />} />
        <Route path="/" element={<RoleHome />} />
        <Route path="*" element={<RoleHome />} />
      </Route>
    </Routes>
  );
};

const App: React.FC = () => (
  <BrowserRouter>
    <AuthProvider>
      <ToastProvider>
        <ToastBar />
        <AppRoutes />
      </ToastProvider>
    </AuthProvider>
  </BrowserRouter>
);

export default App;
