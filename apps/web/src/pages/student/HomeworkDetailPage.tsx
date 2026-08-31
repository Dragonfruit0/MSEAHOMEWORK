import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { subjectStyle } from './subjectStyle';

interface Attachment {
  id: number;
  file_name: string;
  mime_type: string;
  size_bytes: number;
}

interface HomeworkDetail {
  id: number;
  title: string;
  description: string | null;
  subject: string | null;
  teacher: string;
  assigned_date: string;
  due_date: string | null;
  allow_submission: boolean;
  attachments: Attachment[];
  submission: { status: string; note: string | null; grade: number | null; feedback: string | null } | null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function HomeworkDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['homework-detail', id],
    queryFn: async () => (await api.get<HomeworkDetail>(`/student/homework/${id}`)).data,
  });

  if (isLoading || !data) {
    return <div className="p-6 text-center text-sm text-slate-400">Loading…</div>;
  }

  const style = subjectStyle(data.subject);
  const alreadySubmitted = data.submission?.status === 'submitted' || data.submission?.status === 'graded' || data.submission?.status === 'late';

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const form = new FormData();
      form.append('note', note);
      const files = fileInputRef.current?.files;
      if (files) {
        for (const file of Array.from(files)) form.append('files', file);
      }
      await api.post(`/student/homework/${id}/submit`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await queryClient.invalidateQueries({ queryKey: ['homework-detail', id] });
      await queryClient.invalidateQueries({ queryKey: ['student-homework'] });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen pb-16">
      <div className={`${style.bg} px-5 pt-6 pb-8`}>
        <button onClick={() => navigate(-1)} className="text-sm text-slate-600 font-medium mb-4 flex items-center gap-1">
          ← Back
        </button>
        <span className={`h-12 w-12 rounded-full flex items-center justify-center text-2xl mb-3 ${style.icon}`}>
          {style.emoji}
        </span>
        <h1 className="text-2xl font-extrabold text-slate-900 leading-tight">{data.title}</h1>
        <p className="text-sm text-slate-600 mt-1">
          {data.subject ?? 'General'} · {data.teacher}
        </p>
      </div>

      <div className="max-w-lg mx-auto px-5 -mt-4">
        <div className="bg-white rounded-2xl shadow-card p-5 mb-4">
          <div className="flex gap-6 text-sm mb-4">
            <div>
              <p className="text-slate-400 text-xs">Assigned</p>
              <p className="font-semibold text-slate-800">{new Date(data.assigned_date).toLocaleDateString()}</p>
            </div>
            {data.due_date && (
              <div>
                <p className="text-slate-400 text-xs">Due</p>
                <p className="font-semibold text-slate-800">{new Date(data.due_date).toLocaleDateString()}</p>
              </div>
            )}
          </div>
          {data.description && (
            <div
              className="prose prose-sm max-w-none text-slate-700"
              dangerouslySetInnerHTML={{ __html: data.description }}
            />
          )}
        </div>

        {data.attachments.length > 0 && (
          <div className="bg-white rounded-2xl shadow-card p-5 mb-4">
            <h3 className="text-sm font-bold text-slate-800 mb-3">Attachments</h3>
            <div className="space-y-2">
              {data.attachments.map((a) => (
                <a
                  key={a.id}
                  href={`/api/attachments/${a.id}/download`}
                  className="flex items-center gap-3 rounded-xl border border-slate-100 px-3 py-2.5 hover:bg-slate-50 transition"
                >
                  <span className="h-8 w-8 rounded-lg bg-brand-indigo/10 text-brand-indigo flex items-center justify-center text-xs font-bold">
                    {a.file_name.split('.').pop()?.toUpperCase().slice(0, 3)}
                  </span>
                  <span className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{a.file_name}</p>
                    <p className="text-xs text-slate-400">{formatBytes(a.size_bytes)}</p>
                  </span>
                </a>
              ))}
            </div>
          </div>
        )}

        {data.allow_submission && (
          <div className="bg-white rounded-2xl shadow-card p-5">
            <h3 className="text-sm font-bold text-slate-800 mb-3">Your submission</h3>
            {data.submission?.status === 'graded' ? (
              <div className="rounded-xl bg-brand-green/10 text-brand-green-dark px-4 py-3 text-sm">
                <p className="font-semibold">Graded: {Number(data.submission.grade)}/100</p>
                {data.submission.feedback && <p className="mt-1 text-slate-600">{data.submission.feedback}</p>}
              </div>
            ) : alreadySubmitted ? (
              <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Submitted{data.submission?.status === 'late' ? ' (late)' : ''}. Waiting for grading.
              </div>
            ) : (
              <div className="space-y-3">
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Add a note (optional)"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-indigo/30"
                  rows={3}
                />
                <input ref={fileInputRef} type="file" multiple className="text-xs text-slate-500" />
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="w-full rounded-xl bg-brand-green text-white font-semibold py-2.5 text-sm hover:bg-brand-green-dark transition-colors disabled:opacity-60"
                >
                  {submitting ? 'Submitting…' : 'Submit homework'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function BackLink() {
  return (
    <Link to="/" className="text-sm text-brand-indigo font-medium">
      ← Back to homework
    </Link>
  );
}
