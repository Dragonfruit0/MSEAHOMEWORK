import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { TopBar } from '../../components/TopBar';

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
  status: 'draft' | 'published' | 'archived';
  assigned_date: string;
  due_date: string | null;
}

export function TeacherDashboardPage() {
  const queryClient = useQueryClient();
  const [selectedClasses, setSelectedClasses] = useState<Set<number>>(new Set());
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [createdHomeworkId, setCreatedHomeworkId] = useState<number | null>(null);
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
      setCreatedHomeworkId(id);
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
      queryClient.invalidateQueries({ queryKey: ['teacher-homework'] });
    },
  });

  return (
    <div className="min-h-screen bg-slate-50">
      <TopBar title="Teacher" />
      <main className="max-w-5xl mx-auto px-5 py-6 grid gap-6 md:grid-cols-[1fr,1.2fr]">
        <section className="bg-white rounded-2xl shadow-card p-5">
          <h2 className="font-bold text-slate-900 mb-4">Post new homework</h2>

          <div className="space-y-3">
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
            {createdHomeworkId && (
              <p className="text-xs text-brand-green text-center">Published successfully ✓</p>
            )}
          </div>
        </section>

        <section className="bg-white rounded-2xl shadow-card p-5">
          <h2 className="font-bold text-slate-900 mb-4">Your homework</h2>
          <div className="space-y-2">
            {(homeworkList ?? []).map((hw) => (
              <div key={hw.id} className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{hw.title}</p>
                  <p className="text-xs text-slate-400">
                    Assigned {new Date(hw.assigned_date).toLocaleDateString()}
                    {hw.due_date && ` · Due ${new Date(hw.due_date).toLocaleDateString()}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                      hw.status === 'published' ? 'bg-brand-green/10 text-brand-green-dark' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {hw.status}
                  </span>
                  {hw.status === 'published' && (
                    <Link to={`/teacher/homework/${hw.id}/submissions`} className="text-xs font-semibold text-brand-indigo hover:underline">
                      Submissions
                    </Link>
                  )}
                </div>
              </div>
            ))}
            {homeworkList?.length === 0 && <p className="text-sm text-slate-400">Nothing posted yet.</p>}
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
    </div>
  );
}
