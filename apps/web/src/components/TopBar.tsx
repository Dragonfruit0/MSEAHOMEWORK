import { Logo } from './Logo';
import { useAuth } from '../auth/AuthContext';

export function TopBar({ title }: { title: string }) {
  const { user, logout } = useAuth();
  return (
    <header className="bg-brand-indigo text-white">
      <div className="max-w-5xl mx-auto px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-white rounded-lg px-2 py-1">
            <Logo className="h-6" />
          </div>
          <span className="font-semibold text-sm hidden sm:inline">{title}</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="opacity-80">{user?.loginId}</span>
          <button onClick={logout} className="bg-white/10 hover:bg-white/20 rounded-lg px-3 py-1.5 transition-colors">
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
