import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '../../components/Logo';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';

export function ChangePasswordPage() {
  const { user, mustChangePassword, clearMustChangePassword, logout } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!user) {
    navigate('/login', { replace: true });
    return null;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }
    setBusy(true);
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      clearMustChangePassword();
      navigate('/', { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Could not change password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-indigo via-brand-indigo-dark to-brand-green px-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-6">
          <div className="bg-white rounded-2xl px-6 py-4 shadow-card">
            <Logo className="h-10" />
          </div>
        </div>
        <form onSubmit={onSubmit} className="bg-white rounded-2xl shadow-card p-6 space-y-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              {mustChangePassword ? 'Set a new password' : 'Change password'}
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              {mustChangePassword
                ? 'Your account was provisioned with a temporary password. Set your own before continuing.'
                : 'Update the password for your account.'}
            </p>
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Current password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-indigo/40 focus:border-brand-indigo"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">New password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-indigo/40 focus:border-brand-indigo"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Confirm new password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-indigo/40 focus:border-brand-indigo"
            />
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-brand-indigo text-white font-semibold py-2.5 text-sm hover:bg-brand-indigo-dark transition-colors disabled:opacity-60"
          >
            {busy ? 'Saving…' : 'Save password'}
          </button>
          {!mustChangePassword && (
            <button type="button" onClick={() => navigate(-1)} className="w-full text-xs text-slate-400 hover:text-slate-600">
              Cancel
            </button>
          )}
          <button type="button" onClick={() => logout().then(() => navigate('/login'))} className="w-full text-xs text-slate-400 hover:text-slate-600">
            Sign out instead
          </button>
        </form>
      </div>
    </div>
  );
}
