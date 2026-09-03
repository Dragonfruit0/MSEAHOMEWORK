import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { api, downloadAttachment } from '../../api/client';

interface Attachment {
  id: number;
  file_name: string;
  size_bytes: number;
}

interface RosterRow {
  studentId: number;
  studentName: string;
  roll_no: string | null;
  submissionId: number | null;
  submitted_at: string | null;
  note: string | null;
  status: 'pending' | 'submitted' | 'late' | 'graded';
  grade: number | null;
  feedback: string | null;
  attachments: Attachment[];
}

interface HomeworkInfo {
  id: number;
  title: string;
  due_date: string | null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-500',
  submitted: 'bg-brand-indigo/10 text-brand-indigo',
  late: 'bg-amber-100 text-amber-700',
  graded: 'bg-brand-green/10 text-brand-green-dark',
};

export function TeacherSubmissionsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: homework } = useQuery({
    queryKey: ['teacher-homework-detail', id],
    queryFn: async () => (await api.get<HomeworkInfo>(`/teacher/homework/${id}`)).data,
  });

  const { data: roster, isLoading } = useQuery({
    queryKey: ['teacher-submissions', id],
    queryFn: async () => (await api.get<RosterRow[]>(`/teacher/homework/${id}/submissions`)).data,
  });

  const gradeMutation = useMutation({
    mutationFn: async ({ submissionId, grade, feedback }: { submissionId: number; grade: number; feedback: string }) =>
      api.post(`/teacher/submissions/${submissionId}/grade`, { grade, feedback: feedback || undefined }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['teacher-submissions', id] }),
  });

  const submitted = (roster ?? []).filter((r) => r.status !== 'pending').length;
  const total = roster?.length ?? 0;

  return (
    <div className="min-h-screen bg-slate-50 pb-10">
      <main className="max-w-3xl mx-auto px-5 py-6">
        <button onClick={() => navigate(-1)} className="text-sm text-slate-500 font-medium mb-3">
          ← Back
        </button>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl font-bold text-slate-900">{homework?.title ?? 'Submissions'}</h1>
            {homework?.due_date && <p className="text-sm text-slate-500">Due {new Date(homework.due_date).toLocaleDateString()}</p>}
          </div>
          <span className="text-sm font-semibold text-slate-600 bg-white rounded-full px-3 py-1.5 shadow-card">
            {submitted} / {total} submitted
          </span>
        </div>

        {isLoading && <p className="text-sm text-slate-400 text-center py-10">Loading…</p>}

        <div className="space-y-3">
          {(roster ?? []).map((r) => (
            <SubmissionRow key={r.studentId} row={r} onGrade={(grade, feedback) => gradeMutation.mutate({ submissionId: r.submissionId!, grade, feedback })} saving={gradeMutation.isPending} />
          ))}
          {roster?.length === 0 && <p className="text-sm text-slate-400 text-center py-10">No students are targeted by this homework.</p>}
        </div>
      </main>
    </div>
  );
}

function SubmissionRow({ row, onGrade, saving }: { row: RosterRow; onGrade: (grade: number, feedback: string) => void; saving: boolean }) {
  const [editing, setEditing] = useState(false);
  const [grade, setGrade] = useState(row.grade != null ? String(row.grade) : '');
  const [feedback, setFeedback] = useState(row.feedback ?? '');

  const canGrade = row.submissionId != null;

  return (
    <div className="bg-white rounded-2xl shadow-card p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold text-slate-800 text-sm">{row.studentName}</p>
          {row.roll_no && <p className="text-xs text-slate-400">{row.roll_no}</p>}
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_STYLE[row.status]}`}>
            {row.status === 'graded' ? `Graded: ${Number(row.grade)}/100` : row.status}
          </span>
        </div>
      </div>

      {row.note && <p className="text-sm text-slate-600 mt-2 italic">"{row.note}"</p>}

      {row.attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {row.attachments.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => downloadAttachment(`/attachments/submission/${a.id}/download`, a.file_name)}
              className="text-xs bg-slate-50 hover:bg-slate-100 rounded-lg px-2.5 py-1.5 text-slate-600 flex items-center gap-1.5"
            >
              📎 {a.file_name} <span className="text-slate-400">({formatBytes(a.size_bytes)})</span>
            </button>
          ))}
        </div>
      )}

      {canGrade && (row.status !== 'graded' || editing) && (
        <div className="mt-3 pt-3 border-t border-slate-50 flex items-center gap-2">
          <input
            type="number"
            min={0}
            max={100}
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
            placeholder="Grade /100"
            className="w-24 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
          />
          <input
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Feedback (optional)"
            className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
          />
          <button
            disabled={!grade || saving}
            onClick={() => {
              onGrade(Number(grade), feedback);
              setEditing(false);
            }}
            className="rounded-lg bg-brand-indigo text-white font-semibold px-3 py-1.5 text-sm disabled:opacity-50 shrink-0"
          >
            Save
          </button>
        </div>
      )}
      {canGrade && row.status === 'graded' && !editing && (
        <div className="mt-2 flex items-center justify-between">
          {row.feedback && <p className="text-xs text-slate-500">{row.feedback}</p>}
          <button onClick={() => setEditing(true)} className="text-xs font-semibold text-brand-indigo hover:underline ml-auto">
            Edit grade
          </button>
        </div>
      )}
    </div>
  );
}
