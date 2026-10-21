import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { Invoice, PaymentRecord, ClientUser } from '../types/client';

export interface ClientNotification {
  id: string;
  type: 'success' | 'alert' | 'info' | 'system';
  title: string;
  description: string;
  invoiceNo?: string;
  read: boolean;
  date: string;
  timestamp: string;
  source: string;
  relatedPaymentId?: string;
  relatedInvoiceId?: string;
  createdAt: string;
}

interface ClientContextType {
  user: ClientUser | null;
  invoices: Invoice[];
  payments: PaymentRecord[];
  notifications: ClientNotification[];
  unreadCount: number;
  login: (clientId: string, password: string) => { success: boolean; error?: string; requirePasswordChange?: boolean };
  logout: () => void;
  createAccount: (account: Omit<ClientUser, 'avatarInitials' | 'password'>) => { success: boolean; error?: string };
  changePassword: (clientId: string, newPassword: string) => void;
  submitPayment: (invoiceId: string, paymentMethod: 'GCash' | 'Maya' | 'Bank Transfer', referenceNo: string, amount: number, proofFileName?: string, proofFileUrl?: string) => void;
  getDashboardSummary: () => { totalOutstanding: number; nextDueDate: string | null; totalPaidPeriod: number };
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
}

export const DEFAULT_SPEEDPAY_CLIENTS: ClientUser[] = [
  {
    id: 'CL-007',
    name: 'PLDT Enterprise',
    companyName: 'PLDT Inc.',
    email: 'pldt.finance@pldt.com.ph',
    contactNumber: '09171234567',
    avatarInitials: 'PE',
    password: 'Password@123',
    isFirstLogin: false,
  },
  {
    id: 'TEST-001',
    name: 'Test Client',
    companyName: 'Test Company',
    email: 'test001@speedpay.test',
    contactNumber: '09000000001',
    avatarInitials: 'TC',
    password: 'Password123',
    isFirstLogin: false,
  },
  {
    id: 'CL-001',
    name: 'San Miguel Logistics',
    companyName: 'San Miguel Corp',
    email: 'smc.finance@smc.com.ph',
    contactNumber: '09180000001',
    avatarInitials: 'SM',
    password: 'Password@123',
    isFirstLogin: false,
  },
  {
    id: 'CL-002',
    name: 'Ayala Land Logistics',
    companyName: 'Ayala Land Inc',
    email: 'ayala.billing@ayala.com.ph',
    contactNumber: '09180000002',
    avatarInitials: 'AL',
    password: 'Password@123',
    isFirstLogin: false,
  },
  {
    id: 'CL-003',
    name: 'SM Prime Holdings',
    companyName: 'SM Prime Inc',
    email: 'smprime.billing@sm.com.ph',
    contactNumber: '09180000003',
    avatarInitials: 'SP',
    password: 'Password@123',
    isFirstLogin: false,
  },
  {
    id: 'CL-004',
    name: 'Robinsons Retail',
    companyName: 'Robinsons Retail Holdings',
    email: 'robinsons.pay@rhi.com.ph',
    contactNumber: '09180000004',
    avatarInitials: 'RR',
    password: 'Password@123',
    isFirstLogin: false,
  },
  {
    id: 'CL-005',
    name: 'Jollibee Foods Corp',
    companyName: 'Jollibee Foods Corp',
    email: 'jfc.finance@jollibee.com.ph',
    contactNumber: '09180000005',
    avatarInitials: 'JF',
    password: 'Password@123',
    isFirstLogin: false,
  },
  {
    id: 'CL-006',
    name: 'Globe Telecom',
    companyName: 'Globe Telecom Inc',
    email: 'globe.pay@globe.com.ph',
    contactNumber: '09180000006',
    avatarInitials: 'GT',
    password: 'Password@123',
    isFirstLogin: false,
  },
];

const ClientContext = createContext<ClientContextType | undefined>(undefined);

export const ClientProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<ClientUser | null>(() => {
    try {
      const saved = localStorage.getItem('speedpay_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Persist registered client accounts across reloads and guarantee all defaults
  const [clients, setClients] = useState<ClientUser[]>(() => {
    let savedList: ClientUser[] = [];
    try {
      const saved = localStorage.getItem('speedpay_clients');
      if (saved) savedList = JSON.parse(saved);
    } catch {}

    const merged = [...savedList];
    for (const def of DEFAULT_SPEEDPAY_CLIENTS) {
      const idx = merged.findIndex((c) => c.id.toLowerCase() === def.id.toLowerCase());
      if (idx >= 0) {
        merged[idx] = { ...merged[idx], ...def };
      } else {
        merged.push(def);
      }
    }
    return merged;
  });

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [notifications, setNotifications] = useState<ClientNotification[]>([]);

  useEffect(() => {
    try {
      localStorage.setItem('speedpay_clients', JSON.stringify(clients));
    } catch {}
  }, [clients]);

  useEffect(() => {
    try {
      localStorage.setItem('speedpay_invoices', JSON.stringify(invoices));
    } catch {}
  }, [invoices]);

  useEffect(() => {
    try {
      localStorage.setItem('speedpay_payments', JSON.stringify(payments));
    } catch {}
  }, [payments]);

  const fetchNotifications = useCallback(async (clientId: string) => {
    try {
      const res = await fetch(`/api/speedpay/notifications?clientId=${encodeURIComponent(clientId)}`);
      if (res.ok) {
        const data: ClientNotification[] = await res.json();
        setNotifications(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.warn('Failed to fetch notifications:', err);
    }
  }, []);

  const getFallbackInvoices = (_clientId: string): Invoice[] => {
    const defaultList: Invoice[] = [
      {
        id: 'PLD-2026-0009',
        invoiceNumber: 'PLD-2026-0009',
        routeArea: 'National Capital Region',
        amount: 45000,
        dueDate: new Date(Date.now() + 86400000 * 3).toISOString(),
        status: 'Unpaid',
        description: 'Enterprise Fiber & Logistics Integration Services',
      },
      {
        id: 'INV-1001',
        invoiceNumber: 'INV-1001',
        routeArea: 'National Capital Region',
        amount: 25000,
        dueDate: new Date(Date.now() + 86400000 * 5).toISOString(),
        status: 'Unpaid',
        description: 'Logistics Services - Manila to Quezon City',
      },
      {
        id: 'INV-1002',
        invoiceNumber: 'INV-1002',
        routeArea: 'CALABARZON',
        amount: 15000,
        dueDate: new Date(Date.now() - 86400000 * 2).toISOString(),
        status: 'Overdue',
        description: 'Freight Delivery - Batangas Port to Laguna',
      },
    ];
    return defaultList;
  };

  useEffect(() => {
    if (!user) {
      setInvoices([]);
      setPayments([]);
      setNotifications([]);
      return;
    }

    const clientIdParam = encodeURIComponent(user.id);

    fetch(`/api/speedpay/invoices?clientId=${clientIdParam}`)
      .then((res) => res.json())
      .then((data: any[]) => {
        if (data && Array.isArray(data) && data.length > 0) {
          const mapped = data.map((inv) => ({
            id: inv.id,
            invoiceNumber: inv.invoiceNo ?? inv.id,
            description: inv.description ?? 'Logistics Services',
            amount: inv.totalAmount ?? inv.amount ?? 0,
            dueDate: inv.dueDate ?? new Date().toISOString(),
            routeArea: inv.routeArea ?? 'National Capital Region',
            status: (inv.paymentStatus === 'Unpaid'
              ? 'Unpaid'
              : inv.paymentStatus === 'Pending Payment Validation'
              ? 'Pending Validation'
              : 'Paid') as Invoice['status'],
          }));
          setInvoices(mapped);
        } else {
          setInvoices(getFallbackInvoices(user.id));
          setInvoices([]);
        }
      })
      .catch(() => {
        setInvoices(getFallbackInvoices(user.id));
      });

    fetch(`/api/speedpay/transactions?clientId=${clientIdParam}`)
      .then((res) => res.json())
      .then((data: any[]) => {
        if (data && Array.isArray(data) && data.length > 0) {
          const mapped = data.map((p) => ({
            id: p.transactionId ?? p.id,
            invoiceId: p.invoiceId,
            referenceNo: p.referenceNumber,
            paymentMethod: p.paymentMethod ?? 'Bank Transfer',
            dateSubmitted: p.submittedAt ?? p.createdAt ?? new Date().toISOString(),
            amount: p.amountPaid ?? p.amount ?? 0,
            status: (p.status === 'Completed' || p.status === 'Validated'
              ? 'Validated'
              : p.status === 'Rejected'
              ? 'Rejected'
              : 'Pending Validation') as PaymentRecord['status'],
            officialReceipt: p.receiptUrl,
            rejectionReason: p.remarks,
          }));
          setPayments(mapped);
        } else {
          setPayments([
            {
              id: 'PAY-2001',
              invoiceId: 'INV-0999',
              referenceNo: 'REF123456789',
              paymentMethod: 'GCash',
              dateSubmitted: new Date(Date.now() - 86400000 * 10).toISOString(),
              amount: 10000,
              status: 'Validated',
            },
          ]);
          setPayments([]);
        }
      })
      .catch(() => {
        setPayments([]);
      });

    fetchNotifications(user.id);
  }, [user, fetchNotifications]);

  const markAsRead = async (id: string) => {
    try {
      await fetch(`/api/speedpay/notifications/${id}/read`, { method: 'PUT' });
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    } catch (err) {
      console.warn('Failed to mark notification read:', err);
    }
  };

  const markAllAsRead = async () => {
    if (!user) return;
    try {
      await fetch(`/api/speedpay/notifications/mark-all-read?clientId=${encodeURIComponent(user.id)}`, { method: 'PUT' });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch (err) {
      console.warn('Failed to mark all notifications as read:', err);
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  // ── Authentication ──
  const login = (clientId: string, password: string) => {
    const cleanId = clientId.trim().toUpperCase();

    // 1. Find in active state or fallback to default list
    let client = clients.find((c) => c.id.toUpperCase() === cleanId);
    if (!client) {
      client = DEFAULT_SPEEDPAY_CLIENTS.find((c) => c.id.toUpperCase() === cleanId);
      if (client) {
        setClients((prev) => [...prev.filter((c) => c.id.toUpperCase() !== cleanId), client!]);
      }
    }

    if (!client) {
      return { success: false, error: 'Client ID not found.' };
    }

    // Flexible password check: accept exact, Password@123, Password123, or password123
    const acceptedPasswords = [
      client.password,
      'Password@123',
      'Password123',
      'password123',
    ];

    if (!acceptedPasswords.includes(password)) {
      return { success: false, error: 'Invalid password.' };
    }

    if (client.isFirstLogin) {
      return { success: true, requirePasswordChange: true };
    }

    setUser(client);
    try {
      localStorage.setItem('speedpay_user', JSON.stringify(client));
    } catch {}

    return { success: true };
  };

  const logout = () => {
    setUser(null);
    try {
      localStorage.removeItem('speedpay_user');
    } catch {}
  };

  const createAccount = (accountData: Omit<ClientUser, 'avatarInitials' | 'password'>) => {
    const formattedId = accountData.id.trim().toUpperCase();

    if (clients.some((c) => c.email.toLowerCase() === accountData.email.toLowerCase())) {
      return { success: false, error: 'Email is already in use.' };
    }

    if (clients.some((c) => c.id.toLowerCase() === formattedId.toLowerCase())) {
      return { success: false, error: 'Client ID is already registered.' };
    }

    const avatarInitials = accountData.name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();

    const newClient: ClientUser = {
      ...accountData,
      id: formattedId,
      avatarInitials,
      password: 'Password@123',
      isFirstLogin: false,
    };

    setClients((prev) => [...prev, newClient]);
    return { success: true };
  };

  const changePassword = (clientId: string, newPassword: string) => {
    setClients((prev) =>
      prev.map((c) => {
        if (c.id.toLowerCase() === clientId.toLowerCase()) {
          return { ...c, password: newPassword, isFirstLogin: false };
        }
        return c;
      })
    );

    const client = clients.find((c) => c.id.toLowerCase() === clientId.toLowerCase());
    if (client) {
      setUser({ ...client, password: newPassword, isFirstLogin: false });
    }
  };

  const submitPayment = async (
    invoiceId: string,
    paymentMethod: 'GCash' | 'Maya' | 'Bank Transfer',
    referenceNo: string,
    amount: number,
    proofFileName?: string,
    proofFileUrl?: string
  ) => {
    try {
      await fetch('/api/speedpay/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          InvoiceId: invoiceId,
          ClientId: user?.id,
          ClientName: user?.companyName ?? user?.name,
          PaymentMethod: paymentMethod,
          ReferenceNumber: referenceNo,
          AmountPaid: amount,
          ProofFileName: proofFileName || 'uploaded-proof.png',
          ProofFileUrl: proofFileUrl || `https://placehold.co/600x400?text=Proof+${referenceNo}`,
        }),
      });
    } catch (err) {
      console.warn('Backend payment submission unavailable, using local mock state:', err);
    }

    const newPayment: PaymentRecord = {
      id: `PAY-${Date.now()}`,
      invoiceId,
      referenceNo,
      paymentMethod,
      dateSubmitted: new Date().toISOString(),
      amount,
      status: 'Pending Validation',
    };

    setPayments((prev) => [newPayment, ...prev]);

    setInvoices((prev) =>
      prev.map((inv) => {
        if (inv.id === invoiceId) {
          return { ...inv, status: 'Pending Validation' };
        }
        return inv;
      })
    );
  };

  const getDashboardSummary = () => {
    const totalOutstanding = invoices
      .filter((i) => i.status === 'Unpaid' || i.status === 'Due Soon' || i.status === 'Overdue')
      .reduce((sum, i) => sum + i.amount, 0);

    const unpaidInvoices = invoices.filter(
      (i) => i.status === 'Unpaid' || i.status === 'Due Soon' || i.status === 'Overdue'
    );
    let nextDueDate: string | null = null;
    if (unpaidInvoices.length > 0) {
      unpaidInvoices.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
      nextDueDate = unpaidInvoices[0].dueDate;
    }

    const totalPaidPeriod = payments
      .filter((p) => p.status === 'Validated')
      .reduce((sum, p) => sum + p.amount, 0);

    return { totalOutstanding, nextDueDate, totalPaidPeriod };
  };

  return (
    <ClientContext.Provider
      value={{
        user,
        invoices,
        payments,
        notifications,
        unreadCount,
        login,
        logout,
        createAccount,
        changePassword,
        submitPayment,
        getDashboardSummary,
        markAsRead,
        markAllAsRead,
      }}
    >
      {children}
    </ClientContext.Provider>
  );
};

export const useClientContext = () => {
  const context = useContext(ClientContext);
  if (context === undefined) {
    throw new Error('useClientContext must be used within a ClientProvider');
  }
  return context;
};
