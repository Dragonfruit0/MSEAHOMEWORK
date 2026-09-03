import { NavLink } from 'react-router-dom';

const items = [
  { to: '/', label: 'Home', icon: HomeIcon },
  { to: '/calendar', label: 'Calendar', icon: CalendarIcon },
  { to: '/profile', label: 'Profile', icon: UserIcon },
];

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-20 sm:hidden bg-white/95 backdrop-blur border-t border-slate-100 px-6 pb-[env(safe-area-inset-bottom)]">
      <ul className="flex items-center justify-between py-2">
        {items.map(({ to, label, icon: Icon }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-2xl text-[11px] font-medium transition-colors ${
                  isActive ? 'text-brand-indigo' : 'text-slate-400'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`flex items-center justify-center h-9 w-9 rounded-xl ${
                      isActive ? 'bg-brand-indigo text-white' : 'text-slate-400'
                    }`}
                  >
                    <Icon />
                  </span>
                  {label}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function HomeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 11l9-7 9 7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 10v9a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1v-9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function CalendarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3.5" y="5" width="17" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3.5 10h17" strokeLinecap="round" />
    </svg>
  );
}
function UserIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20a7.5 7.5 0 0115 0" strokeLinecap="round" />
    </svg>
  );
}
