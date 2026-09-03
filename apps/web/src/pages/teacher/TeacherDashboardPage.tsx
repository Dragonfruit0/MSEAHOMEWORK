import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { Logo } from '../../components/Logo';
import { BottomNav } from '../../components/BottomNav';
import { subjectStyle } from '../../components/subjectStyle';
import { useAuth } from '../../auth/AuthContext';

interface MyClass {
  assignmentId: number;
  classId: number;
  className: string;
  sectionId: number | null;
  sectionName: string | null;
  subjectId: number;
  subjectName: string;
}

interface HomeworkRow {
  id: number;
  title: string;
  description: string | null;
  subject: string | null;
  status: 'draft' | 'published' | 'archived';
  assigned_date: string;
  due_date: string | null;
}

export function TeacherDashboardPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [composerOpen, setComposerOpen] = useState(false);
  const [selectedClasses, setSelectedClasses] = useState<Set<number>>(new Set());
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachmentCount, setAttachmentCount] = useState(0);
  const [page, setPage] = useState(1);

  const { data: myClasses } = useQuery({
    queryKey: ['teacher-my-classes'],
    queryFn: async () => (await api.get<MyClass[]>('/teacher/my-classes')).data,
  });

  const { data: homeworkData } = useQuery({
    queryKey: ['teacher-homework', page],
    queryFn: async () => (await api.get<{ rows: HomeworkRow[]; total: number; pageSize: number }>('/teacher/homework', { params: { page } })).data,
  });
  const homeworkList = homeworkData?.rows;
  const totalPages = homeworkData ? Math.max(1, Math.ceil(homeworkData.total / homeworkData.pageSize)) : 1;

  const createMutation = useMutation({
    mutationFn: async () => {
      const targets = (myClasses ?? [])
        .filter((c) => selectedClasses.has(c.classId))
        .map((c) => ({ classId: c.classId, sectionId: c.sectionId }));
      const res = await api.post('/teacher/homework', {
        title,
        description,
        assignedDate: new Date().toISOString().slice(0, 10),
        dueDate: dueDate || undefined,
        allowSubmission: true,
        targets,
      });
      return res.data.id as number;
    },
    onSuccess: async (id) => {
      const files = Array.from(fileInputRef.current?.files ?? []).slice(0, 5);
      // Uploaded sequentially, not in parallel: each call is its own request
      // against the same homework row, and the backend has no batch
      // endpoint — one request per file keeps this a straightforward loop
      // rather than needing to reconcile partial-failure ordering.
      for (const file of files) {
        const form = new FormData();
        form.append('file', file);
        await api.post(`/teacher/homework/${id}/attachments`, form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }
      await api.post(`/teacher/homework/${id}/publish`);
      setTitle('');
      setDescription('');
      setDueDate('');
      setSelectedClasses(new Set());
      setAttachmentCount(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setComposerOpen(false);
      queryClient.invalidateQueries({ queryKey: ['teacher-homework'] });
    },
  });

  return (
    <div className="min-h-screen pb-24 sm:pb-10">
      <header className="bg-white sticky top-0 z-10 border-b border-slate-100">
        <div className="max-w-lg mx-auto px-5 pt-5 pb-3 flex items-center justify-between">
          <Logo className="h-7" />
          <span className="h-9 w-9 rounded-full bg-brand-indigo/10 flex items-center justify-center text-sm font-bold text-brand-indigo">
            {user?.loginId?.[0]?.toUpperCase()}
          </span>
        </div>
        <div className="max-w-lg mx-auto px-5 pb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">My Homework</h1>
            <p className="text-sm text-slate-400">What you've posted to your classes</p>
          </div>
          <button
            onClick={() => setComposerOpen((v) => !v)}
            className="shrink-0 rounded-xl bg-brand-indigo text-white font-semibold text-sm px-4 py-2.5 hover:bg-brand-indigo-dark transition-colors"
          >
            {composerOpen ? 'Close' : '+ Post'}
          </button>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-5 pt-4 space-y-4">
        {composerOpen && (
          <section className="bg-white rounded-2xl shadow-card p-5 space-y-3">
            <h2 className="font-bold text-slate-900">Post new homework</h2>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title"
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-indigo/30"
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description / instructions"
              rows={4}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-indigo/30"
            />
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Due date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Attachments (up to 5)</label>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={(e) => setAttachmentCount(e.target.files?.length ?? 0)}
                className="text-xs text-slate-500"
              />
              {attachmentCount > 5 && <p className="text-xs text-rose-500 mt-1">Select at most 5 files.</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-2">Assign to</label>
              <div className="space-y-1.5 max-h-40 overflow-auto">
                {(myClasses ?? []).map((c) => (
                  <label key={c.assignmentId} className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={selectedClasses.has(c.classId)}
                      onChange={(e) => {
                        const next = new Set(selectedClasses);
                        if (e.target.checked) next.add(c.classId);
                        else next.delete(c.classId);
                        setSelectedClasses(next);
                      }}
                    />
                    {c.className}
                    {c.sectionName ? ` - ${c.sectionName}` : ' (whole class)'} · {c.subjectName}
                  </label>
                ))}
                {myClasses?.length === 0 && (
                  <p className="text-xs text-slate-400">No classes assigned to you yet — ask your branch head.</p>
                )}
              </div>
            </div>

            <button
              disabled={!title || selectedClasses.size === 0 || attachmentCount > 5 || createMutation.isPending}
              onClick={() => createMutation.mutate()}
              className="w-full rounded-xl bg-brand-indigo text-white font-semibold py-2.5 text-sm hover:bg-brand-indigo-dark transition-colors disabled:opacity-50"
            >
              {createMutation.isPending ? 'Publishing…' : 'Publish homework'}
            </button>
          </section>
        )}

        <section>
          <div className="space-y-3">
            {(homeworkList ?? []).map((hw) => (
              <HomeworkCard key={hw.id} hw={hw} />
            ))}
            {homeworkList?.length === 0 && (
              <div className="text-center py-16">
                <p className="text-4xl mb-2">📭</p>
                <p className="text-slate-500 text-sm">Nothing posted yet — tap "+ Post" to get started.</p>
              </div>
            )}
          </div>
          {homeworkData && homeworkData.total > homeworkData.pageSize && (
            <div className="flex items-center justify-center gap-3 mt-4 text-sm">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-2 py-1 disabled:opacity-30">
                ← Prev
              </button>
              <span className="text-slate-500">
                Page {page} of {totalPages}
              </span>
              <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="px-2 py-1 disabled:opacity-30">
                Next →
              </button>
            </div>
          )}
        </section>
      </main>

      <BottomNav />
    </div>
  );
}

const STATUS_PILL: Record<HomeworkRow['status'], string> = {
  published: 'bg-brand-green text-white',
  draft: 'bg-slate-200 text-slate-600',
  archived: 'bg-slate-200 text-slate-600',
};

function HomeworkCard({ hw }: { hw: HomeworkRow }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(hw.title);
  const [description, setDescription] = useState(hw.description ?? '');
  const [dueDate, setDueDate] = useState(hw.due_date ? hw.due_date.slice(0, 10) : '');
  const style = subjectStyle(hw.subject);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['teacher-homework'] });
  }

  const saveMutation = useMutation({
    mutationFn: async () => api.patch(`/teacher/homework/${hw.id}`, { title, description, dueDate: dueDate || null }),
    onSuccess: () => {
      setEditing(false);
      invalidate();
    },
  });
  const unpublishMutation = useMutation({
    mutationFn: async () => api.post(`/teacher/homework/${hw.id}/unpublish`),
    onSuccess: invalidate,
  });
  const republishMutation = useMutation({
    mutationFn: async () => api.post(`/teacher/homework/${hw.id}/publish`),
    onSuccess: invalidate,
  });

  if (editing) {
    return (
      <div className="rounded-2xl border border-brand-indigo/30 bg-white p-4 space-y-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm font-semibold"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm"
        />
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm"
          />
          <button
            onClick={() => saveMutation.mutate()}
            disabled={!title || saveMutation.isPending}
            className="rounded-lg bg-brand-indigo text-white font-semibold px-3 py-1.5 text-sm disabled:opacity-50"
          >
            Save
          </button>
          <button onClick={() => setEditing(false)} className="text-sm text-slate-500">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl p-4 ${style.bg}`}>
      <div className="flex items-center gap-3">
        <span className={`h-11 w-11 shrink-0 rounded-full flex items-center justify-center text-lg ${style.icon}`}>
          {style.emoji}
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-900 truncate">{hw.title}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {hw.subject ?? 'General'} · Assigned {new Date(hw.assigned_date).toLocaleDateString()}
            {hw.due_date && ` · Due ${new Date(hw.due_date).toLocaleDateString()}`}
          </p>
        </div>
        <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_PILL[hw.status]}`}>{hw.status}</span>
      </div>
      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-black/5">
        <button onClick={() => setEditing(true)} className="text-xs font-semibold text-slate-600 hover:underline">
          Edit
        </button>
        {hw.status === 'published' ? (
          <>
            <Link to={`/teacher/homework/${hw.id}/submissions`} className="text-xs font-semibold text-brand-indigo hover:underline">
              Submissions
            </Link>
            <button
              onClick={() => unpublishMutation.mutate()}
              disabled={unpublishMutation.isPending}
              className="text-xs font-semibold text-rose-500 hover:underline ml-auto"
            >
              Unpublish
            </button>
          </>
        ) : (
          <button
            onClick={() => republishMutation.mutate()}
            disabled={republishMutation.isPending}
            className="text-xs font-semibold text-brand-green-dark hover:underline ml-auto"
          >
            Publish
          </button>
        )}
      </div>
    </div>
  );
}
