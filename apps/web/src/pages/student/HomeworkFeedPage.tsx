import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { BottomNav } from '../../components/BottomNav';
import { Logo } from '../../components/Logo';
import { subjectStyle } from './subjectStyle';

interface HomeworkItem {
  id: number;
  title: string;
  subject: string | null;
  teacher: string;
  assigned_date: string;
  due_date: string | null;
  submission_status: 'pending' | 'submitted' | 'late' | 'graded';
}

interface SubjectOption {
  id: number;
  name: string;
}

const STATUS_LABEL: Record<HomeworkItem['submission_status'], string> = {
  pending: 'To do',
  submitted: 'Submitted',
  late: 'Late',
  graded: 'Done',
};

const STATUS_PILL: Record<HomeworkItem['submission_status'], string> = {
  pending: 'bg-white text-slate-700',
  submitted: 'bg-brand-green text-white',
  late: 'bg-rose-500 text-white',
  graded: 'bg-brand-indigo text-white',
};

function formatDateHeading(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric' });
}

export function HomeworkFeedPage() {
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending'>('pending');
  const [search, setSearch] = useState('');
  const [subjectFilter, setSubjectFilter] = useState(''); // '' = All
  const [page, setPage] = useState(1);

  // Debounce free-text search so every keystroke doesn't refetch.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => setPage(1), [statusFilter, subjectFilter, debouncedSearch]);

  const { data: subjects } = useQuery({
    queryKey: ['student-subjects'],
    queryFn: async () => (await api.get<SubjectOption[]>('/student/subjects')).data,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['student-homework', statusFilter, subjectFilter, debouncedSearch, page],
    queryFn: async () => {
      const res = await api.get<{ rows: HomeworkItem[]; total: number; pageSize: number }>('/student/homework', {
        params: { status: statusFilter, subjectId: subjectFilter || undefined, q: debouncedSearch || undefined, page },
      });
      return res.data;
    },
  });

  const grouped = useMemo(() => {
    const map = new Map<string, HomeworkItem[]>();
    for (const hw of data?.rows ?? []) {
      const key = hw.assigned_date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(hw);
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [data]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="min-h-screen pb-24 sm:pb-10">
      <header className="bg-white sticky top-0 z-10 border-b border-slate-100">
        <div className="max-w-lg mx-auto px-5 pt-5 pb-3">
          <div className="flex items-center justify-between mb-4">
            <Logo className="h-7" />
            <span className="h-9 w-9 rounded-full bg-brand-indigo/10 flex items-center justify-center text-sm font-bold text-brand-indigo">
              S
            </span>
          </div>
          <div className="flex items-center gap-2 text-2xl font-extrabold text-slate-900 mb-4">
            <button
              className={`transition-colors ${statusFilter === 'pending' ? 'text-slate-900' : 'text-slate-300'}`}
              onClick={() => setStatusFilter('pending')}
            >
              Homework
            </button>
            <span className="text-slate-200 font-medium">/</span>
            <button
              className={`text-base font-semibold transition-colors ${
                statusFilter === 'all' ? 'text-slate-900' : 'text-slate-300'
              }`}
              onClick={() => setStatusFilter('all')}
            >
              All
            </button>
          </div>

          <div className="relative mb-3">
            <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search homework"
              className="w-full rounded-2xl bg-slate-100 pl-10 pr-4 py-2.5 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-indigo/30"
            />
          </div>

          <div className="flex items-center gap-4 text-sm">
            <label className="flex items-center gap-1.5 text-slate-500">
              Subject:
              <select
                value={subjectFilter}
                onChange={(e) => setSubjectFilter(e.target.value)}
                className="font-semibold text-slate-800 bg-transparent focus:outline-none"
              >
                <option value="">All</option>
                {(subjects ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-5 pt-4">
        {isLoading && <p className="text-sm text-slate-400 py-10 text-center">Loading homework…</p>}

        {!isLoading && grouped.length === 0 && (
          <div className="text-center py-16">
            <p className="text-4xl mb-2">🎉</p>
            <p className="text-slate-500 text-sm">Nothing here — you're all caught up!</p>
          </div>
        )}

        {grouped.map(([date, items]) => (
          <section key={date} className="mb-6">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-lg font-bold text-slate-900">{formatDateHeading(date)}</h2>
              <span className="text-sm text-slate-400">{items.length} tasks</span>
            </div>
            <div className="space-y-3">
              {items.map((hw) => {
                const style = subjectStyle(hw.subject);
                return (
                  <Link
                    key={hw.id}
                    to={`/homework/${hw.id}`}
                    className={`flex items-center gap-3 rounded-2xl p-4 ${style.bg} hover:brightness-[0.98] transition`}
                  >
                    <span className={`h-11 w-11 shrink-0 rounded-full flex items-center justify-center text-lg ${style.icon}`}>
                      {style.emoji}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-900 truncate">{hw.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {hw.subject ?? 'General'} · {hw.teacher}
                      </p>
                    </div>
                    <span className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full ${STATUS_PILL[hw.submission_status]}`}>
                      {STATUS_LABEL[hw.submission_status]}
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}

        {!isLoading && data && data.total > data.pageSize && (
          <div className="flex items-center justify-center gap-4 py-4 text-sm">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-2 py-1 disabled:opacity-30 font-medium">
              ← Prev
            </button>
            <span className="text-slate-500">
              Page {page} of {totalPages}
            </span>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="px-2 py-1 disabled:opacity-30 font-medium">
              Next →
            </button>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" strokeLinecap="round" />
    </svg>
  );
}
