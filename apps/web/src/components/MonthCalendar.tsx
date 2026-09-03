import { useMemo } from 'react';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export interface MonthCalendarProps {
  year: number;
  month: number; // 1-12
  /** Dates (YYYY-MM-DD) that should render a marker dot. */
  markedDates: Set<string>;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  onNavigate: (year: number, month: number) => void;
}

function toKey(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** A plain month-grid calendar — no external date library, this app only ever needs one month at a time. */
export function MonthCalendar({ year, month, markedDates, selectedDate, onSelectDate, onNavigate }: MonthCalendarProps) {
  const monthLabel = useMemo(
    () => new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
    [year, month]
  );

  const cells = useMemo(() => {
    const firstDay = new Date(year, month - 1, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(year, month, 0).getDate();
    const out: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) out.push(null);
    for (let d = 1; d <= daysInMonth; d++) out.push(d);
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [year, month]);

  function goPrev() {
    if (month === 1) onNavigate(year - 1, 12);
    else onNavigate(year, month - 1);
  }
  function goNext() {
    if (month === 12) onNavigate(year + 1, 1);
    else onNavigate(year, month + 1);
  }

  const todayKey = toKey(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate());

  return (
    <div className="bg-white rounded-2xl shadow-card p-4">
      <div className="flex items-center justify-between mb-3">
        <button onClick={goPrev} aria-label="Previous month" className="h-8 w-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-50">
          ‹
        </button>
        <span className="font-bold text-slate-900 text-sm">{monthLabel}</span>
        <button onClick={goNext} aria-label="Next month" className="h-8 w-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-50">
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAYS.map((w, i) => (
          <div key={i} className="text-center text-[10px] font-semibold text-slate-400 py-1">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (d === null) return <div key={i} />;
          const key = toKey(year, month, d);
          const isMarked = markedDates.has(key);
          const isSelected = key === selectedDate;
          const isToday = key === todayKey;
          return (
            <button
              key={i}
              onClick={() => onSelectDate(key)}
              className={`relative h-9 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center
                ${isSelected ? 'bg-brand-indigo text-white' : isToday ? 'bg-brand-indigo/10 text-brand-indigo' : 'text-slate-700 hover:bg-slate-50'}`}
            >
              {d}
              {isMarked && (
                <span
                  className={`absolute bottom-1 h-1 w-1 rounded-full ${isSelected ? 'bg-white' : 'bg-brand-orange'}`}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
