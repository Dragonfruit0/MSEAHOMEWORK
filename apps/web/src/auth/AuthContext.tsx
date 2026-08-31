import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '../api/client';

export type Role = 'SUPER_ADMIN' | 'BRANCH_HEAD' | 'TEACHER' | 'STUDENT' | 'PARENT';

export interface AuthUser {
  id: number;
  loginId: string;
  role: Role;
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  login: (loginId: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('hp_access_token');
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get('/auth/me')
      .then((res) => setUser({ id: res.data.id, loginId: res.data.login_id, role: res.data.role }))
      .catch(() => localStorage.removeItem('hp_access_token'))
      .finally(() => setLoading(false));
  }, []);

  async function login(loginId: string, password: string) {
    const res = await api.post('/auth/login', { loginId, password });
    localStorage.setItem('hp_access_token', res.data.accessToken);
    setUser(res.data.user);
  }

  function logout() {
    localStorage.removeItem('hp_access_token');
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
