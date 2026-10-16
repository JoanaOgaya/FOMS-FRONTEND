import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ClientProvider } from './context/ClientContext';
import { GlobalLayout } from './components/GlobalLayout';
import { Dashboard } from './pages/Dashboard';
import { MyInvoices } from './pages/MyInvoices';
import { PayInvoice } from './pages/PayInvoice';
import { PaymentHistory } from './pages/PaymentHistory';
import { NotificationsPage } from './pages/NotificationsPage';

import { Login } from './pages/Login';
import { ToastProvider } from './components/ToastContext';
import { ToastBar } from './components/ToastBar';

const App: React.FC = () => {
  return (
    <ToastProvider>
      <ClientProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<GlobalLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="invoices" element={<MyInvoices />} />
              <Route path="pay" element={<PayInvoice />} />
              <Route path="history" element={<PaymentHistory />} />
              <Route path="notifications" element={<NotificationsPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        <ToastBar />
      </BrowserRouter>
    </ClientProvider>
    </ToastProvider>
  );
};

export default App;
