import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { TopBar } from '../../components/TopBar';

interface ClassRow {
  id: number;
  name: string;
}
interface TeacherRow {
  id: number;
  full_name: string;
}
interface SubjectRow {
  id: number;
  name: string;
}
interface SectionRow {
  id: number;
  name: string;
}
interface Assignment {
  id: number;
  teacherId: number;
  teacherName: string;
  classId: number;
  className: string;
  sectionId: number | null;
  sectionName: string | null;
  subjectId: number;
  subjectName: string;
  academic_year: string;
}

const CURRENT_YEAR = String(new Date().getFullYear());

export function BranchAssignmentsPage() {
  const queryClient = useQueryClient();
  const [teacherId, setTeacherId] = useState('');
  const [classId, setClassId] = useState('');
  const [sectionId, setSectionId] = useState(''); // '' = whole class
  const [subjectId, setSubjectId] = useState('');
  const [academicYear, setAcademicYear] = useState(CURRENT_YEAR);
  const [yearFilter, setYearFilter] = useState(CURRENT_YEAR);

  const { data: classes } = useQuery({
    queryKey: ['branch-classes'],
    queryFn: async () => (await api.get<ClassRow[]>('/branch/classes')).data,
  });
  const { data: teachers } = useQuery({
    queryKey: ['branch-teachers'],
    queryFn: async () => (await api.get<TeacherRow[]>('/branch/teachers')).data,
  });
  const { data: subjects } = useQuery({
    queryKey: ['branch-subjects', classId],
    queryFn: async () => (await api.get<SubjectRow[]>('/branch/subjects', { params: { classId } })).data,
    enabled: !!classId,
  });
  const { data: sections } = useQuery({
    queryKey: ['branch-sections', classId],
    queryFn: async () => (await api.get<SectionRow[]>('/branch/sections', { params: { classId } })).data,
    enabled: !!classId,
  });
  const { data: assignments } = useQuery({
    queryKey: ['branch-assignments', yearFilter],
    queryFn: async () => (await api.get<Assignment[]>('/branch/assignments', { params: { year: yearFilter } })).data,
  });

  const assignMutation = useMutation({
    mutationFn: async () => {
      await api.post('/branch/assignments', {
        teacherId: Number(teacherId),
        classId: Number(classId),
        sectionId: sectionId ? Number(sectionId) : null,
        subjectId: Number(subjectId),
        academicYear,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branch-assignments'] });
      setTeacherId('');
      setClassId('');
      setSectionId('');
      setSubjectId('');
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (id: number) => api.delete(`/branch/assignments/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['branch-assignments'] }),
  });

  return (
    <div className="min-h-screen bg-slate-50">
      <TopBar title="Branch Head" />
      <main className="max-w-4xl mx-auto px-5 py-6">
        <section className="bg-white rounded-2xl shadow-card p-5 mb-6">
          <h2 className="font-bold text-slate-900 mb-4">Assign a teacher</h2>
          <div className="grid sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <select
              value={classId}
              onChange={(e) => {
                setClassId(e.target.value);
                setSubjectId('');
                setSectionId('');
              }}
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
            >
              <option value="">Class…</option>
              {(classes ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              value={sectionId}
              onChange={(e) => setSectionId(e.target.value)}
              disabled={!classId}
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm disabled:opacity-50"
            >
              <option value="">Whole class</option>
              {(sections ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  Section {s.name}
                </option>
              ))}
            </select>
            <select
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              disabled={!classId}
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm disabled:opacity-50"
            >
              <option value="">Subject…</option>
              {(subjects ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
              <option value="">Teacher…</option>
              {(teachers ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name}
                </option>
              ))}
            </select>
            <input
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
              placeholder="Academic year"
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
            />
            <button
              disabled={!teacherId || !classId || !subjectId || !academicYear || assignMutation.isPending}
              onClick={() => assignMutation.mutate()}
              className="rounded-xl bg-brand-indigo text-white font-semibold text-sm hover:bg-brand-indigo-dark transition-colors disabled:opacity-50"
            >
              Assign
            </button>
          </div>
          {classId && subjects?.length === 0 && (
            <p className="text-xs text-amber-600 mt-2">This class has no subjects mapped yet.</p>
          )}
        </section>

        <section className="bg-white rounded-2xl shadow-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-slate-900">Current assignments</h2>
            <input
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm w-28"
              placeholder="Year"
            />
          </div>
          <div className="space-y-2">
            {(assignments ?? []).map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3 text-sm">
                <span>
                  <strong className="text-slate-800">{a.teacherName}</strong> teaches{' '}
                  <strong className="text-slate-800">{a.subjectName}</strong> to{' '}
                  <strong className="text-slate-800">
                    {a.className}
                    {a.sectionName ? ` - ${a.sectionName}` : ' (whole class)'}
                  </strong>
                </span>
                <button onClick={() => removeMutation.mutate(a.id)} className="text-rose-500 text-xs font-semibold hover:underline">
                  Remove
                </button>
              </div>
            ))}
            {assignments?.length === 0 && <p className="text-sm text-slate-400">No assignments yet for {yearFilter}.</p>}
          </div>
        </section>
      </main>
    </div>
  );
}
