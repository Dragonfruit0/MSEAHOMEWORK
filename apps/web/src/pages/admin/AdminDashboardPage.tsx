import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { TopBar } from '../../components/TopBar';

interface SyncRun {
  id: number;
  status: 'success' | 'failed';
  started_at: string;
  finished_at: string | null;
  rows_inserted: number;
  rows_updated: number;
  rows_deactivated: number;
  error_log: string | null;
}

interface UserRow {
  id: number;
  login_id: string;
  role: string;
  linked_entity_type: string | null;
  linked_entity_id: number | null;
  is_active: boolean;
  must_change_password: boolean;
  last_login_at: string | null;
  created_at: string;
}

interface AuditRow {
  id: number;
  actor_login_id: string | null;
  action: string;
  entity_type: string;
  entity_id: number | null;
  payload_json: unknown;
  at: string;
}

interface ProvisionedAccount {
  loginId: string;
  tempPassword: string;
  name: string;
}

function fmtDate(s: string | null) {
  if (!s) return '—';
  return new Date(s).toLocaleString();
}

function downloadCsv(filename: string, rows: ProvisionedAccount[]) {
  const header = 'Login ID,Temporary Password,Name\n';
  const body = rows.map((r) => `${r.loginId},${r.tempPassword},"${r.name.replace(/"/g, '""')}"`).join('\n');
  const blob = new Blob([header + body], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function AdminDashboardPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <TopBar title="Admin" />
      <main className="max-w-5xl mx-auto px-5 py-6 space-y-6">
        <TestingModeBanner />
        <SyncSection />
        <ProvisionSection />
        <UsersSection />
        <AuditLogSection />
      </main>
    </div>
  );
}

function TestingModeBanner() {
  const { data } = useQuery({
    queryKey: ['setup-state'],
    queryFn: async () => (await api.get<{ completed: boolean; testingMode: boolean }>('/setup/state')).data,
  });
  if (!data?.testingMode) return null;
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 flex items-center justify-between gap-4">
      <div>
        <p className="font-semibold text-amber-900">You're running on demo/testing data</p>
        <p className="text-sm text-amber-700">
          Everything works, but nothing here is real school data. Connect and map your actual
          database when you're ready to go live.
        </p>
      </div>
      <a href="/setup" className="rounded-xl bg-amber-600 text-white font-semibold px-4 py-2 text-sm shrink-0 hover:bg-amber-700">
        Connect real database
      </a>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl shadow-card p-5">
      <h2 className="font-bold text-slate-900 mb-4">{title}</h2>
      {children}
    </section>
  );
}

function SyncSection() {
  const queryClient = useQueryClient();
  const { data: runs } = useQuery({
    queryKey: ['admin-sync-runs'],
    queryFn: async () => (await api.get<SyncRun[]>('/admin/sync-runs')).data,
    refetchInterval: 5000,
  });

  const syncMutation = useMutation({
    mutationFn: async () => (await api.post('/admin/sync')).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-sync-runs'] });
      queryClient.invalidateQueries({ queryKey: ['admin-audit-log'] });
    },
  });

  const latest = runs?.[0];

  return (
    <Card title="Database sync">
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-slate-600">
          {latest ? (
            <>
              Last run <strong>{fmtDate(latest.started_at)}</strong> —{' '}
              <span className={latest.status === 'success' ? 'text-brand-green-dark font-semibold' : 'text-rose-600 font-semibold'}>
                {latest.status}
              </span>{' '}
              · +{latest.rows_inserted} / ~{latest.rows_updated} / -{latest.rows_deactivated} rows
            </>
          ) : (
            'No sync has run yet.'
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <a href="/setup" className="rounded-xl border border-slate-200 text-slate-600 font-semibold px-4 py-2 text-sm hover:bg-slate-50">
            Re-map source data
          </a>
          <button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            className="rounded-xl bg-brand-indigo text-white font-semibold px-4 py-2 text-sm disabled:opacity-50"
          >
            {syncMutation.isPending ? 'Syncing…' : 'Sync now'}
          </button>
        </div>
      </div>
      {latest?.error_log && (
        <pre className="text-xs bg-rose-50 text-rose-700 rounded-xl p-3 overflow-auto mb-3">{latest.error_log}</pre>
      )}
      <div className="space-y-1.5 max-h-48 overflow-auto">
        {(runs ?? []).slice(0, 10).map((r) => (
          <div key={r.id} className="flex items-center justify-between text-xs text-slate-500 border-b border-slate-50 py-1.5">
            <span>{fmtDate(r.started_at)}</span>
            <span className={r.status === 'success' ? 'text-brand-green-dark' : 'text-rose-600'}>{r.status}</span>
            <span>+{r.rows_inserted} / ~{r.rows_updated} / -{r.rows_deactivated}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ProvisionSection() {
  const queryClient = useQueryClient();
  const [entityType, setEntityType] = useState<'student' | 'teacher'>('student');
  const [branchId, setBranchId] = useState('');
  const [lastResult, setLastResult] = useState<{ created: ProvisionedAccount[]; skipped: number } | null>(null);

  const { data: branches } = useQuery({
    queryKey: ['admin-branches'],
    queryFn: async () => (await api.get<{ id: number; name: string }[]>('/admin/branches')).data,
  });

  const { data: preview, isFetching: previewLoading } = useQuery({
    queryKey: ['provision-preview', entityType, branchId],
    queryFn: async () =>
      (await api.post('/admin/users/provision-preview', { entityType, branchId: branchId ? Number(branchId) : undefined })).data as {
        total: number;
        alreadyProvisioned: number;
        toProvision: number;
      },
  });

  const provisionMutation = useMutation({
    mutationFn: async () => (await api.post('/admin/users/provision', { entityType, branchId: branchId ? Number(branchId) : undefined })).data,
    onSuccess: (data) => {
      setLastResult(data);
      queryClient.invalidateQueries({ queryKey: ['admin-audit-log'] });
      queryClient.invalidateQueries({ queryKey: ['provision-preview'] });
    },
  });

  return (
    <Card title="Bulk account provisioning">
      <p className="text-sm text-slate-500 mb-4">
        Creates one login per synced {entityType} who doesn't already have a portal account. Temporary passwords are shown
        once — export them before leaving this page.
      </p>
      <div className="flex items-center gap-3 mb-4">
        <select
          value={entityType}
          onChange={(e) => {
            setEntityType(e.target.value as 'student' | 'teacher');
            setLastResult(null);
          }}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
        >
          <option value="student">Students</option>
          <option value="teacher">Teachers</option>
        </select>
        <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
          <option value="">All branches</option>
          {(branches ?? []).map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <span className="text-sm text-slate-500">
          {previewLoading
            ? 'Checking…'
            : preview
              ? `${preview.toProvision} of ${preview.total} need an account (${preview.alreadyProvisioned} already provisioned)`
              : ''}
        </span>
        <button
          onClick={() => provisionMutation.mutate()}
          disabled={provisionMutation.isPending || !preview?.toProvision}
          className="ml-auto rounded-xl bg-brand-green text-white font-semibold px-4 py-2 text-sm disabled:opacity-50"
        >
          {provisionMutation.isPending ? 'Provisioning…' : `Provision ${preview?.toProvision ?? 0} accounts`}
        </button>
      </div>

      {lastResult && (
        <div className="border border-slate-100 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between bg-slate-50 px-4 py-2">
            <span className="text-sm font-semibold text-slate-700">
              Created {lastResult.created.length} account{lastResult.created.length === 1 ? '' : 's'}
              {lastResult.skipped > 0 && ` · skipped ${lastResult.skipped} already provisioned`}
            </span>
            {lastResult.created.length > 0 && (
              <button
                onClick={() => downloadCsv(`${entityType}-accounts.csv`, lastResult.created)}
                className="text-xs font-semibold text-brand-indigo hover:underline"
              >
                Export CSV
              </button>
            )}
          </div>
          <div className="max-h-64 overflow-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-slate-400 sticky top-0 bg-white">
                <tr>
                  <th className="text-left px-4 py-1.5">Name</th>
                  <th className="text-left px-4 py-1.5">Login ID</th>
                  <th className="text-left px-4 py-1.5">Temp password</th>
                </tr>
              </thead>
              <tbody>
                {lastResult.created.map((r) => (
                  <tr key={r.loginId} className="border-t border-slate-50">
                    <td className="px-4 py-1.5">{r.name}</td>
                    <td className="px-4 py-1.5 font-mono">{r.loginId}</td>
                    <td className="px-4 py-1.5 font-mono">{r.tempPassword}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
  );
}

function UsersSection() {
  const queryClient = useQueryClient();
  const [role, setRole] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [newLoginId, setNewLoginId] = useState('');
  const [newRole, setNewRole] = useState('BRANCH_HEAD');
  const [newBranchId, setNewBranchId] = useState('');
  const [createdAccount, setCreatedAccount] = useState<{ loginId: string; tempPassword: string } | null>(null);
  const [revealedPasswords, setRevealedPasswords] = useState<Record<number, string>>({});

  const { data } = useQuery({
    queryKey: ['admin-users', role, q, page],
    queryFn: async () =>
      (await api.get<{ rows: UserRow[]; total: number; pageSize: number }>('/admin/users', { params: { role: role || undefined, q: q || undefined, page } })).data,
  });

  const { data: branches } = useQuery({
    queryKey: ['admin-branches'],
    queryFn: async () => (await api.get<{ id: number; name: string }[]>('/admin/branches')).data,
  });

  const createMutation = useMutation({
    mutationFn: async () =>
      (
        await api.post('/admin/users', {
          loginId: newLoginId,
          role: newRole,
          linkedEntityType: newRole === 'BRANCH_HEAD' ? 'branch' : null,
          linkedEntityId: newRole === 'BRANCH_HEAD' && newBranchId ? Number(newBranchId) : null,
        })
      ).data,
    onSuccess: (data) => {
      setCreatedAccount({ loginId: data.loginId, tempPassword: data.tempPassword });
      setNewLoginId('');
      setNewBranchId('');
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-audit-log'] });
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: async (id: number) => api.post(`/admin/users/${id}/deactivate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-audit-log'] });
    },
  });
  const reactivateMutation = useMutation({
    mutationFn: async (id: number) => api.post(`/admin/users/${id}/reactivate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-audit-log'] });
    },
  });
  const resetPasswordMutation = useMutation({
    mutationFn: async (id: number) => (await api.post(`/admin/users/${id}/reset-password`)).data,
    onSuccess: (data, id) => {
      setRevealedPasswords((prev) => ({ ...prev, [id]: data.tempPassword }));
      queryClient.invalidateQueries({ queryKey: ['admin-audit-log'] });
    },
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <Card title="Users">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder="Search login ID…"
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
        />
        <select
          value={role}
          onChange={(e) => {
            setRole(e.target.value);
            setPage(1);
          }}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
        >
          <option value="">All roles</option>
          <option value="SUPER_ADMIN">Super admin</option>
          <option value="BRANCH_HEAD">Branch head</option>
          <option value="TEACHER">Teacher</option>
          <option value="STUDENT">Student</option>
          <option value="PARENT">Parent</option>
        </select>

        <div className="ml-auto flex items-center gap-2">
          <input
            value={newLoginId}
            onChange={(e) => setNewLoginId(e.target.value)}
            placeholder="New login ID"
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
          <select value={newRole} onChange={(e) => setNewRole(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
            <option value="SUPER_ADMIN">Super admin</option>
            <option value="BRANCH_HEAD">Branch head</option>
          </select>
          {newRole === 'BRANCH_HEAD' && (
            <select value={newBranchId} onChange={(e) => setNewBranchId(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <option value="">Branch…</option>
              {(branches ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
          <button
            disabled={!newLoginId || (newRole === 'BRANCH_HEAD' && !newBranchId) || createMutation.isPending}
            onClick={() => createMutation.mutate()}
            className="rounded-xl bg-brand-indigo text-white font-semibold px-3 py-2 text-sm disabled:opacity-50"
          >
            Create
          </button>
        </div>
      </div>

      {createdAccount && (
        <div className="text-sm bg-brand-green/10 text-brand-green-dark rounded-xl px-3 py-2 mb-3">
          Created <strong>{createdAccount.loginId}</strong> — temporary password: <span className="font-mono">{createdAccount.tempPassword}</span>
        </div>
      )}

      <div className="border border-slate-100 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-xs text-slate-400 bg-slate-50">
            <tr>
              <th className="text-left px-4 py-2">Login ID</th>
              <th className="text-left px-4 py-2">Role</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="text-left px-4 py-2">Last login</th>
              <th className="text-right px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(data?.rows ?? []).map((u) => (
              <tr key={u.id} className="border-t border-slate-50">
                <td className="px-4 py-2 font-mono">{u.login_id}</td>
                <td className="px-4 py-2">{u.role}</td>
                <td className="px-4 py-2">
                  <span className={u.is_active ? 'text-brand-green-dark' : 'text-rose-600'}>{u.is_active ? 'Active' : 'Inactive'}</span>
                  {u.must_change_password && <span className="text-amber-600 text-xs ml-1.5">(temp password)</span>}
                </td>
                <td className="px-4 py-2 text-slate-500">{fmtDate(u.last_login_at)}</td>
                <td className="px-4 py-2 text-right space-x-2 whitespace-nowrap">
                  {revealedPasswords[u.id] && (
                    <span className="font-mono text-xs bg-amber-50 text-amber-700 rounded px-1.5 py-0.5">{revealedPasswords[u.id]}</span>
                  )}
                  <button onClick={() => resetPasswordMutation.mutate(u.id)} className="text-xs font-semibold text-brand-indigo hover:underline">
                    Reset password
                  </button>
                  {u.is_active ? (
                    <button onClick={() => deactivateMutation.mutate(u.id)} className="text-xs font-semibold text-rose-500 hover:underline">
                      Deactivate
                    </button>
                  ) : (
                    <button onClick={() => reactivateMutation.mutate(u.id)} className="text-xs font-semibold text-brand-green-dark hover:underline">
                      Reactivate
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {data?.rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  No users match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {data && data.total > data.pageSize && (
        <div className="flex items-center justify-center gap-3 mt-3 text-sm">
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
    </Card>
  );
}

function AuditLogSection() {
  const [page, setPage] = useState(1);
  const { data } = useQuery({
    queryKey: ['admin-audit-log', page],
    queryFn: async () => (await api.get<{ rows: AuditRow[]; total: number; pageSize: number }>('/admin/audit-log', { params: { page } })).data,
  });
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <Card title="Audit log">
      <div className="space-y-1.5 max-h-72 overflow-auto">
        {(data?.rows ?? []).map((r) => (
          <div key={r.id} className="text-xs text-slate-500 border-b border-slate-50 py-1.5 flex items-center gap-2">
            <span className="text-slate-400 shrink-0">{fmtDate(r.at)}</span>
            <span className="font-semibold text-slate-700 shrink-0">{r.actor_login_id ?? 'system'}</span>
            <span className="shrink-0">{r.action}</span>
            <span className="text-slate-400 truncate">
              {r.entity_type}
              {r.entity_id ? `#${r.entity_id}` : ''}
            </span>
          </div>
        ))}
        {data?.rows.length === 0 && <p className="text-sm text-slate-400 text-center py-4">No activity yet.</p>}
      </div>
      {data && data.total > data.pageSize && (
        <div className="flex items-center justify-center gap-3 mt-3 text-sm">
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
    </Card>
  );
}
