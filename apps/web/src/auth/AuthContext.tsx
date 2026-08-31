import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, getAccessToken, setAccessToken } from '../api/client';

export type Role = 'SUPER_ADMIN' | 'BRANCH_HEAD' | 'TEACHER' | 'STUDENT' | 'PARENT';

export interface AuthUser {
  id: number;
  loginId: string;
  role: Role;
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  mustChangePassword: boolean;
  login: (loginId: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  clearMustChangePassword: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [mustChangePassword, setMustChangePassword] = useState(false);

  useEffect(() => {
    (async () => {
      const token = getAccessToken();
      if (token) {
        try {
          const res = await api.get('/auth/me');
          setUser({ id: res.data.id, loginId: res.data.login_id, role: res.data.role });
          setMustChangePassword(res.data.must_change_password);
          setLoading(false);
          return;
        } catch {
          setAccessToken(null);
        }
      }
      // No (or stale) access token — the httpOnly refresh cookie might still
      // be valid (e.g. the page was reloaded well after the 15-minute access
      // token expired), so try a silent refresh before giving up.
      try {
        const res = await api.post('/auth/refresh');
        setAccessToken(res.data.accessToken);
        setUser(res.data.user);
        setMustChangePassword(res.data.mustChangePassword);
      } catch {
        // Not logged in — fine, land on /login.
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function login(loginId: string, password: string) {
    const res = await api.post('/auth/login', { loginId, password });
    setAccessToken(res.data.accessToken);
    setUser(res.data.user);
    setMustChangePassword(res.data.mustChangePassword);
  }

  async function logout() {
    try {
      await api.post('/auth/logout');
    } catch {
      // best-effort — clear local state regardless
    }
    setAccessToken(null);
    setUser(null);
    setMustChangePassword(false);
  }

  function clearMustChangePassword() {
    setMustChangePassword(false);
  }

  return (
    <AuthContext.Provider value={{ user, loading, mustChangePassword, login, logout, clearMustChangePassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
