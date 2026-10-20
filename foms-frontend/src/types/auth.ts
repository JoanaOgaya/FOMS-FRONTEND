/**
 * Auth types. The role value always comes from GET /auth/me (see AuthContext).
 */

export const ROLES = {
  FINANCIAL_MANAGER: 'FINANCIAL_MANAGER',
  HEAD_ACCOUNTANT: 'HEAD_ACCOUNTANT',
  ACCOUNTANT: 'ACCOUNTANT',
  ASSISTANT_FM: 'ASSISTANT_FM',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const Role = ROLES;

export interface User {
  id?: string;
  employeeId: string;
  fullName: string;
  role: Role;
  email?: string;
}

export interface LoginCredentials {
  employeeId: string;
  password: string;
}

export interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginCredentials) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
}
