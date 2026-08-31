import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth, type Role } from '../auth/AuthContext';

export function ProtectedRoute({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { user, loading, mustChangePassword } = useAuth();
  if (loading) return <div className="p-10 text-center text-sm text-slate-400">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (mustChangePassword) return <Navigate to="/change-password" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}
