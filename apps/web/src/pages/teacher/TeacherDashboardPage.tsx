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

  const { data: myClasses } = useQuery({
    queryKey: ['teacher-my-classes'],
    queryFn: async () => (await api.get<MyClass[]>('/teacher/my-classes')).data,
  });

  const { data: homeworkList } = useQuery({
    queryKey: ['teacher-homework'],
    queryFn: async () => (await api.get<HomeworkRow[]>('/teacher/homework')).data,
  });

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
      const file = fileInputRef.current?.files?.[0];
      if (file) {
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
              <label className="block text-xs font-semibold text-slate-500 mb-1">Attachment</label>
              <input ref={fileInputRef} type="file" className="text-xs text-slate-500" />
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
              disabled={!title || selectedClasses.size === 0 || createMutation.isPending}
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
        </section>
      </main>
    </div>
  );
}
