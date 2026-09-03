import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { Logo } from '../components/Logo';
import { BottomNav } from '../components/BottomNav';
import { MonthCalendar } from '../components/MonthCalendar';
import { subjectStyle } from '../components/subjectStyle';
import { useAuth } from '../auth/AuthContext';

interface CalendarItem {
  id: number;
  title: string;
  subject: string | null;
  assigned_date: string;
  due_date: string | null;
  status?: 'draft' | 'published' | 'archived'; // teacher
  submission_status?: 'pending' | 'submitted' | 'late' | 'graded'; // student
}

const now = new Date();

/**
 * A history/calendar view of homework by month, shared between students and
 * teachers — which endpoint it calls and how it labels each item's status is
 * the only thing that differs per role; the calendar UI itself is identical,
 * matching the request to keep the two roles' apps feeling like one product.
 */
export function CalendarPage() {
  const { user } = useAuth();
  const isTeacher = user?.role === 'TEACHER';
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [selectedDate, setSelectedDate] = useState<string | null>(now.toISOString().slice(0, 10));

  const { data: items, isLoading } = useQuery({
    queryKey: ['calendar', isTeacher ? 'teacher' : 'student', year, month],
    queryFn: async () => {
      const path = isTeacher ? '/teacher/homework/calendar' : '/student/homework/calendar';
      return (await api.get<CalendarItem[]>(path, { params: { year, month } })).data;
    },
  });

  const markedDates = useMemo(() => {
    const set = new Set<string>();
    for (const item of items ?? []) {
      set.add(item.assigned_date.slice(0, 10));
      if (item.due_date) set.add(item.due_date.slice(0, 10));
    }
    return set;
  }, [items]);

  const dayItems = useMemo(() => {
    if (!selectedDate) return [];
    return (items ?? []).filter((i) => i.assigned_date.slice(0, 10) === selectedDate || i.due_date?.slice(0, 10) === selectedDate);
  }, [items, selectedDate]);

  function handleNavigate(y: number, m: number) {
    setYear(y);
    setMonth(m);
    setSelectedDate(null);
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24 sm:pb-10">
      <header className="bg-white sticky top-0 z-10 border-b border-slate-100">
        <div className="max-w-lg mx-auto px-5 pt-5 pb-3 flex items-center justify-between">
          <Logo className="h-7" />
          <span className="h-9 w-9 rounded-full bg-brand-indigo/10 flex items-center justify-center text-sm font-bold text-brand-indigo">
            {user?.loginId?.[0]?.toUpperCase()}
          </span>
        </div>
        <div className="max-w-lg mx-auto px-5 pb-4">
          <h1 className="text-2xl font-extrabold text-slate-900">Calendar</h1>
          <p className="text-sm text-slate-400">{isTeacher ? 'Homework you\'ve posted, by date' : 'Your homework history, by date'}</p>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-5 pt-4 space-y-4">
        <MonthCalendar
          year={year}
          month={month}
          markedDates={markedDates}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          onNavigate={handleNavigate}
        />

        <div>
          <h2 className="text-sm font-bold text-slate-800 mb-2">
            {selectedDate
              ? new Date(selectedDate).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
              : 'Select a day'}
          </h2>

          {isLoading && <p className="text-sm text-slate-400 py-6 text-center">Loading…</p>}

          {!isLoading && dayItems.length === 0 && (
            <p className="text-sm text-slate-400 py-6 text-center">Nothing on this day.</p>
          )}

          <div className="space-y-2">
            {dayItems.map((item) => {
              const style = subjectStyle(item.subject);
              const statusLabel = isTeacher ? item.status : item.submission_status;
              return (
                <Link
                  key={item.id}
                  to={isTeacher ? '/' : `/homework/${item.id}`}
                  className={`flex items-center gap-3 rounded-2xl p-4 ${style.bg} hover:brightness-[0.98] transition`}
                >
                  <span className={`h-10 w-10 shrink-0 rounded-full flex items-center justify-center text-base ${style.icon}`}>
                    {style.emoji}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 truncate text-sm">{item.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {item.subject ?? 'General'}
                      {item.due_date && ` · Due ${new Date(item.due_date).toLocaleDateString()}`}
                    </p>
                  </div>
                  {statusLabel && (
                    <span className="shrink-0 text-[10px] font-semibold px-2.5 py-1 rounded-full bg-white/70 text-slate-600 capitalize">
                      {statusLabel}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
