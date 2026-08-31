import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '../../components/Logo';
import { useAuth } from '../../auth/AuthContext';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(loginId, password);
      navigate('/');
    } catch {
      setError('Invalid login ID or password.');
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
            <h1 className="text-xl font-bold text-slate-900">Homework Portal</h1>
            <p className="text-sm text-slate-500 mt-1">Sign in to continue</p>
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Login ID</label>
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-indigo/40 focus:border-brand-indigo"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              placeholder="e.g. student ID or staff ID"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Password</label>
            <input
              type="password"
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-indigo/40 focus:border-brand-indigo"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-brand-indigo text-white font-semibold py-2.5 text-sm hover:bg-brand-indigo-dark transition-colors disabled:opacity-60"
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="text-center text-xs text-white/70 mt-4">MS Education Academy · Homework Portal</p>
      </div>
    </div>
  );
}
