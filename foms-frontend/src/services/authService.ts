import { http } from './apiClient';
import type { User } from '../types/auth';
import { normalizeRole } from '../utils/roleAccess';

interface LoginResult { accessToken: string; refreshToken?: string }
interface MeResponse { id: string; fullName: string; role: string; email?: string }

export const authService = {
  login: (username: string, password: string) => http.post<LoginResult>('/auth/login', { username, password }),

  /** Current user. The role is always taken from the server response. */
  async me(): Promise<User> {
    const me = await http.get<MeResponse>('/auth/me');
    const role = normalizeRole(me.role);
    if (!role) throw new Error(`Unsupported role: ${me.role}`);
    return { employeeId: me.id, fullName: me.fullName, role, email: me.email };
  },

  logout: () => http.post<void>('/auth/logout'),
};
