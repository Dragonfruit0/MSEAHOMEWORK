import { useNavigate } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { BottomNav } from '../components/BottomNav';
import { useAuth } from '../auth/AuthContext';

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  BRANCH_HEAD: 'Branch Head',
  TEACHER: 'Teacher',
  STUDENT: 'Student',
  PARENT: 'Parent',
};

export function ProfilePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 pb-24 sm:pb-10">
      <header className="bg-white sticky top-0 z-10 border-b border-slate-100">
        <div className="max-w-lg mx-auto px-5 pt-5 pb-4 flex items-center justify-between">
          <Logo className="h-7" />
          <span className="h-9 w-9 rounded-full bg-brand-indigo/10 flex items-center justify-center text-sm font-bold text-brand-indigo">
            {user?.loginId?.[0]?.toUpperCase()}
          </span>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-5 pt-4 space-y-4">
        <div className="bg-white rounded-2xl shadow-card p-5 flex items-center gap-4">
          <span className="h-14 w-14 rounded-full bg-brand-indigo/10 flex items-center justify-center text-xl font-bold text-brand-indigo">
            {user?.loginId?.[0]?.toUpperCase()}
          </span>
          <div>
            <p className="font-bold text-slate-900">{user?.loginId}</p>
            <p className="text-sm text-slate-400">{user ? ROLE_LABEL[user.role] ?? user.role : ''}</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-card overflow-hidden">
          <button
            onClick={() => navigate('/change-password')}
            className="w-full flex items-center justify-between px-5 py-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Change password
            <span className="text-slate-300">›</span>
          </button>
          <button
            onClick={() => logout().then(() => navigate('/login'))}
            className="w-full flex items-center justify-between px-5 py-4 text-sm font-semibold text-rose-500 hover:bg-rose-50 border-t border-slate-50"
          >
            Sign out
          </button>
        </div>

        <p className="text-center text-xs text-slate-300">MS Education Academy · Homework Portal</p>
      </main>

      <BottomNav />
    </div>
  );
}
