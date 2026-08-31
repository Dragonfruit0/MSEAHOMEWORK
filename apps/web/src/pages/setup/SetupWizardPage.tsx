import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  OPTIONAL_FIELDS,
  REQUIRED_FIELDS,
  type LogicalEntityName,
} from '@homework-portal/shared';
import { api } from '../../api/client';
import { Logo } from '../../components/Logo';

/**
 * The "Power BI-style" setup wizard: connect to whatever SQL database the
 * school actually runs, browse its real tables, and map logical fields
 * (student name, class, ...) onto physical columns — without any of this
 * code knowing the school's schema ahead of time. See packages/mapping for
 * how the resulting document turns into safe, per-engine SQL.
 *
 * This is a functional first cut of the wizard described in the plan: it
 * covers connect -> browse -> map -> storage -> complete end to end. The
 * plan's drag-and-drop relationship canvas (step 4) is not required for the
 * sync engine to work — entity rows are matched to their parents by source
 * ID equality, not by an explicit join graph — so it's left for a later
 * pass; this wizard collects everything the backend needs today.
 */

type Engine = 'mssql' | 'mysql' | 'postgres' | 'oracle';

const ENTITIES: LogicalEntityName[] = ['branch', 'class', 'section', 'subject', 'teacher', 'student'];

const STEP_LABELS = ['Admin account', 'Connect', 'Browse', 'Map fields', 'Validate', 'Storage', 'Finish'];

interface ColumnInfo {
  name: string;
  dataType: string;
}
interface TableInfo {
  schema: string;
  name: string;
  approxRowCount?: number;
}
interface EntityValidation {
  rowCount: number;
  nulls: Record<string, number>;
  duplicatePrimaryKeyCount: number;
  orphans: Record<string, number>;
  preview: Record<string, unknown>[];
}

export function SetupWizardPage() {
  const [step, setStep] = useState(0);

  // Step 0: bootstrap admin
  const [adminLoginId, setAdminLoginId] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminMsg, setAdminMsg] = useState<string | null>(null);

  // Step 1: connect
  const [engine, setEngine] = useState<Engine>('mssql');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('');
  const [database, setDatabase] = useState('');
  const [schemaName, setSchemaName] = useState('');
  const [dbUser, setDbUser] = useState('');
  const [dbPassword, setDbPassword] = useState('');
  const [testResult, setTestResult] = useState<{ ok: boolean; serverVersion?: string; error?: string } | null>(null);
  const [sourceConnectionId, setSourceConnectionId] = useState<number | null>(null);

  // Step 2/3: browse + map
  const [selectedSchema, setSelectedSchema] = useState('');
  const [entityTable, setEntityTable] = useState<Partial<Record<LogicalEntityName, string>>>({});
  const [entityFields, setEntityFields] = useState<Partial<Record<LogicalEntityName, Record<string, string>>>>({});
  // full_name is the one field commonly split across two source columns
  // (first/last name) rather than a single column — track that separately
  // per entity so saveMapping() can turn it into a concat mapping.
  const [nameConcat, setNameConcat] = useState<Partial<Record<LogicalEntityName, { enabled: boolean; lastNameColumn: string }>>>({});
  const [mappingVersion, setMappingVersion] = useState<number | null>(null);
  const [mappingIssues, setMappingIssues] = useState<unknown[] | null>(null);

  // Step 4: validate
  const [validation, setValidation] = useState<Record<string, EntityValidation> | null>(null);
  const [validating, setValidating] = useState(false);

  // Step 4: storage
  const [storageProvider, setStorageProvider] = useState<'local' | 's3'>('local');
  const [rootDir, setRootDir] = useState('./uploads');
  const [maxFileMb, setMaxFileMb] = useState(25);

  const connectionPayload = () => ({
    engine,
    host,
    port: port ? Number(port) : undefined,
    database,
    schema: schemaName || undefined,
    user: dbUser,
    password: dbPassword,
  });

  async function testConnection() {
    setTestResult(null);
    const res = await api.post('/setup/test-connection', connectionPayload());
    setTestResult(res.data);
  }

  async function saveConnection() {
    const res = await api.post('/setup/connections', { role: 'source', ...connectionPayload() });
    setSourceConnectionId(res.data.id);
    setStep(2);
  }

  const { data: schemas } = useQuery({
    queryKey: ['setup-schemas', sourceConnectionId],
    queryFn: async () => (await api.get<string[]>(`/setup/connections/${sourceConnectionId}/schemas`)).data,
    enabled: sourceConnectionId != null && step === 2,
  });

  const { data: tables } = useQuery({
    queryKey: ['setup-tables', sourceConnectionId, selectedSchema],
    queryFn: async () =>
      (await api.get<TableInfo[]>(`/setup/connections/${sourceConnectionId}/tables`, { params: { schema: selectedSchema } })).data,
    enabled: sourceConnectionId != null && !!selectedSchema,
  });

  function useColumnsFor(entity: LogicalEntityName) {
    const table = entityTable[entity];
    return useQuery({
      queryKey: ['setup-columns', sourceConnectionId, table],
      queryFn: async () => {
        const [schema, name] = table!.split('.');
        return (await api.get<ColumnInfo[]>(`/setup/connections/${sourceConnectionId}/columns`, { params: { schema, table: name } })).data;
      },
      enabled: sourceConnectionId != null && !!table,
    });
  }

  function setField(entity: LogicalEntityName, field: string, column: string) {
    setEntityFields((prev) => ({ ...prev, [entity]: { ...(prev[entity] ?? {}), [field]: column } }));
  }

  async function saveMapping() {
    const entities: Record<string, unknown> = {};
    for (const entity of ENTITIES) {
      const table = entityTable[entity];
      const fields = entityFields[entity];
      if (!table || !fields) continue;
      const concat = nameConcat[entity];
      const finalFields: Record<string, string | string[]> = { ...fields };
      let nameStrategy: 'single' | 'concat' | undefined;
      if (concat?.enabled && fields.full_name && concat.lastNameColumn) {
        finalFields.full_name = [fields.full_name, concat.lastNameColumn];
        nameStrategy = 'concat';
      }
      entities[entity] = { sourceTable: table, fields: finalFields, ...(nameStrategy ? { nameStrategy, nameSeparator: ' ' } : {}) };
    }
    const res = await api.post('/setup/mapping', { sourceConnectionId, entities, relationships: [] });
    setMappingVersion(res.data.version);
    setMappingIssues(res.data.issues ?? []);
    setStep(4);
    setValidation(null);
    runValidation(res.data.version);
  }

  async function runValidation(version: number) {
    setValidating(true);
    try {
      const res = await api.post('/setup/validate', { version, sourceConnectionId });
      setValidation(res.data);
    } finally {
      setValidating(false);
    }
  }

  const hasBlockingIssues =
    validation != null &&
    Object.values(validation).some(
      (v) => v.duplicatePrimaryKeyCount > 0 || Object.values(v.nulls).some((n) => n > 0)
    );

  async function saveStorage() {
    await api.post('/setup/storage', {
      provider: storageProvider,
      config: storageProvider === 'local' ? { rootDir } : {},
      maxFileMb,
    });
    setStep(6);
  }

  async function completeSetup() {
    await api.post('/setup/complete', { sourceConnectionId, mappingVersion });
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-100">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-3">
          <Logo className="h-7" />
          <span className="font-bold text-slate-800">First-time setup</span>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-3">
        <ol className="flex gap-2 text-xs mb-6">
          {STEP_LABELS.map((label, i) => (
            <li
              key={label}
              className={`flex-1 text-center py-2 rounded-lg font-semibold ${
                i === step ? 'bg-brand-indigo text-white' : i < step ? 'bg-brand-green/10 text-brand-green-dark' : 'bg-slate-100 text-slate-400'
              }`}
            >
              {label}
            </li>
          ))}
        </ol>

        <div className="bg-white rounded-2xl shadow-card p-6">
          {step === 0 && (
            <div className="space-y-3 max-w-sm">
              <h2 className="font-bold text-slate-900">Create the first admin account</h2>
              <p className="text-sm text-slate-500">This account can run setup and manage the portal.</p>
              <input
                value={adminLoginId}
                onChange={(e) => setAdminLoginId(e.target.value)}
                placeholder="Login ID"
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
              />
              <input
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="Password (min 8 chars)"
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
              />
              {adminMsg && <p className="text-xs text-slate-500">{adminMsg}</p>}
              <button
                onClick={async () => {
                  try {
                    await api.post('/setup/bootstrap-admin', { loginId: adminLoginId, password: adminPassword });
                    setStep(1);
                  } catch (err: any) {
                    if (err.response?.status === 409) {
                      setAdminMsg('An admin already exists — continuing to the next step.');
                      setStep(1);
                    } else {
                      setAdminMsg('Could not create admin account.');
                    }
                  }
                }}
                className="rounded-xl bg-brand-indigo text-white font-semibold px-4 py-2.5 text-sm"
              >
                Create admin & continue
              </button>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3 max-w-lg">
              <h2 className="font-bold text-slate-900">Connect to the school's database</h2>
              <div className="grid grid-cols-2 gap-3">
                <select value={engine} onChange={(e) => setEngine(e.target.value as Engine)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
                  <option value="mssql">Microsoft SQL Server</option>
                  <option value="mysql">MySQL / MariaDB</option>
                  <option value="postgres">PostgreSQL</option>
                  <option value="oracle">Oracle</option>
                </select>
                <input value={port} onChange={(e) => setPort(e.target.value)} placeholder="Port (default)" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
                <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="Host" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm col-span-2" />
                <input value={database} onChange={(e) => setDatabase(e.target.value)} placeholder="Database" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
                <input value={schemaName} onChange={(e) => setSchemaName(e.target.value)} placeholder="Default schema (optional)" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
                <input value={dbUser} onChange={(e) => setDbUser(e.target.value)} placeholder="Username" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
                <input type="password" value={dbPassword} onChange={(e) => setDbPassword(e.target.value)} placeholder="Password" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
              </div>

              {testResult && (
                <p className={`text-sm ${testResult.ok ? 'text-brand-green-dark' : 'text-rose-600'}`}>
                  {testResult.ok ? `Connected: ${testResult.serverVersion?.slice(0, 60)}` : testResult.error}
                </p>
              )}

              <div className="flex gap-2">
                <button onClick={testConnection} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700">
                  Test connection
                </button>
                <button
                  disabled={!testResult?.ok}
                  onClick={saveConnection}
                  className="rounded-xl bg-brand-indigo text-white font-semibold px-4 py-2.5 text-sm disabled:opacity-50"
                >
                  Save & continue
                </button>
              </div>
              <p className="text-xs text-slate-400">
                Ask the school's DBA for a dedicated read-only login — this portal never writes to their database.
              </p>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h2 className="font-bold text-slate-900">Browse the schema</h2>
              <select value={selectedSchema} onChange={(e) => setSelectedSchema(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
                <option value="">Choose a schema…</option>
                {(schemas ?? []).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              {selectedSchema && (
                <div className="grid sm:grid-cols-2 gap-2 max-h-80 overflow-auto">
                  {(tables ?? []).map((t) => (
                    <div key={t.name} className="rounded-xl border border-slate-100 px-3 py-2 text-sm">
                      <p className="font-semibold text-slate-800">{t.name}</p>
                      <p className="text-xs text-slate-400">~{t.approxRowCount ?? 0} rows</p>
                    </div>
                  ))}
                </div>
              )}
              <button
                disabled={!selectedSchema}
                onClick={() => setStep(3)}
                className="rounded-xl bg-brand-indigo text-white font-semibold px-4 py-2.5 text-sm disabled:opacity-50"
              >
                Continue to field mapping
              </button>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <h2 className="font-bold text-slate-900">Map logical fields to real columns</h2>
              {ENTITIES.map((entity) => (
                <EntityMapper
                  key={entity}
                  entity={entity}
                  tables={tables ?? []}
                  selectedTable={entityTable[entity] ?? ''}
                  onSelectTable={(t) => setEntityTable((prev) => ({ ...prev, [entity]: t }))}
                  fields={entityFields[entity] ?? {}}
                  onSetField={(field, col) => setField(entity, field, col)}
                  useColumns={() => useColumnsFor(entity)}
                  nameConcat={nameConcat[entity] ?? { enabled: false, lastNameColumn: '' }}
                  onChangeNameConcat={(v) => setNameConcat((prev) => ({ ...prev, [entity]: v }))}
                />
              ))}
              {mappingIssues && mappingIssues.length > 0 && (
                <pre className="text-xs bg-amber-50 text-amber-800 rounded-xl p-3 overflow-auto">{JSON.stringify(mappingIssues, null, 2)}</pre>
              )}
              <button onClick={saveMapping} className="rounded-xl bg-brand-indigo text-white font-semibold px-4 py-2.5 text-sm">
                Save mapping & continue
              </button>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-slate-900">Check the data before committing</h2>
                <button
                  onClick={() => mappingVersion && runValidation(mappingVersion)}
                  disabled={validating}
                  className="text-xs font-semibold text-brand-indigo hover:underline disabled:opacity-50"
                >
                  {validating ? 'Checking…' : 'Re-check'}
                </button>
              </div>
              {validating && !validation && <p className="text-sm text-slate-400">Running checks against the source database…</p>}
              {validation &&
                Object.entries(validation).map(([entity, v]) => {
                  const requiredNullIssues = Object.entries(v.nulls).filter(([, count]) => count > 0);
                  const orphanIssues = Object.entries(v.orphans).filter(([, count]) => count > 0);
                  const hasError = requiredNullIssues.length > 0 || v.duplicatePrimaryKeyCount > 0;
                  return (
                    <div
                      key={entity}
                      className={`rounded-xl border p-4 ${hasError ? 'border-rose-200 bg-rose-50' : 'border-slate-100'}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold text-slate-800 capitalize">{entity}</h3>
                        <span className="text-xs text-slate-500">{v.rowCount.toLocaleString()} rows</span>
                      </div>
                      {!hasError && orphanIssues.length === 0 && (
                        <p className="text-xs text-brand-green-dark">✓ No issues found.</p>
                      )}
                      {requiredNullIssues.length > 0 && (
                        <p className="text-xs text-rose-700">
                          Missing required values: {requiredNullIssues.map(([f, c]) => `${f} (${c})`).join(', ')}
                        </p>
                      )}
                      {v.duplicatePrimaryKeyCount > 0 && (
                        <p className="text-xs text-rose-700">{v.duplicatePrimaryKeyCount} duplicate ID(s) — each row must have a unique identifier.</p>
                      )}
                      {orphanIssues.length > 0 && (
                        <p className="text-xs text-amber-700">
                          Orphaned references (won't block sync, but these rows won't link correctly):{' '}
                          {orphanIssues.map(([f, c]) => `${f} (${c})`).join(', ')}
                        </p>
                      )}
                    </div>
                  );
                })}
              {hasBlockingIssues && (
                <p className="text-xs text-rose-600 font-semibold">
                  Fix the missing values or duplicate IDs above (usually by adjusting the field mapping) before continuing.
                </p>
              )}
              <div className="flex gap-2">
                <button onClick={() => setStep(3)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700">
                  Back to mapping
                </button>
                <button
                  disabled={!validation || hasBlockingIssues}
                  onClick={() => setStep(5)}
                  className="rounded-xl bg-brand-indigo text-white font-semibold px-4 py-2.5 text-sm disabled:opacity-50"
                >
                  Looks good, continue
                </button>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-3 max-w-sm">
              <h2 className="font-bold text-slate-900">Where should homework attachments live?</h2>
              <select value={storageProvider} onChange={(e) => setStorageProvider(e.target.value as 'local' | 's3')} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
                <option value="local">Local disk / network path</option>
                <option value="s3">S3-compatible object storage</option>
              </select>
              {storageProvider === 'local' && (
                <input value={rootDir} onChange={(e) => setRootDir(e.target.value)} placeholder="Storage path" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Max file size (MB)</label>
                <input type="number" value={maxFileMb} onChange={(e) => setMaxFileMb(Number(e.target.value))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
              </div>
              <button onClick={saveStorage} className="rounded-xl bg-brand-indigo text-white font-semibold px-4 py-2.5 text-sm">
                Save & continue
              </button>
            </div>
          )}

          {step === 6 && (
            <div className="space-y-3 max-w-sm">
              <h2 className="font-bold text-slate-900">Ready to go</h2>
              <p className="text-sm text-slate-500">
                This runs the portal's own database migrations, then the first sync from the school's database into the
                homework portal.
              </p>
              <button
                onClick={completeSetup}
                className="rounded-xl bg-brand-green text-white font-semibold px-4 py-2.5 text-sm hover:bg-brand-green-dark"
              >
                Finish setup & sync
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EntityMapper({
  entity,
  tables,
  selectedTable,
  onSelectTable,
  fields,
  onSetField,
  useColumns,
  nameConcat,
  onChangeNameConcat,
}: {
  entity: LogicalEntityName;
  tables: TableInfo[];
  selectedTable: string;
  onSelectTable: (t: string) => void;
  fields: Record<string, string>;
  onSetField: (field: string, col: string) => void;
  useColumns: () => { data?: ColumnInfo[] };
  nameConcat: { enabled: boolean; lastNameColumn: string };
  onChangeNameConcat: (v: { enabled: boolean; lastNameColumn: string }) => void;
}) {
  const { data: columns } = useColumns();
  const required = REQUIRED_FIELDS[entity];
  const optional = OPTIONAL_FIELDS[entity];

  return (
    <div className="border border-slate-100 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-slate-800 capitalize">{entity}</h3>
        <select
          value={selectedTable}
          onChange={(e) => onSelectTable(e.target.value)}
          className="text-xs rounded-lg border border-slate-200 px-2 py-1.5"
        >
          <option value="">Source table…</option>
          {tables.map((t) => (
            <option key={t.name} value={`${t.schema}.${t.name}`}>
              {t.schema}.{t.name}
            </option>
          ))}
        </select>
      </div>
      {selectedTable && (
        <div className="grid sm:grid-cols-2 gap-2">
          {[...required.map((f) => [f, true] as const), ...optional.map((f) => [f, false] as const)].map(([field, isRequired]) => (
            <div key={field} className={field === 'full_name' ? 'sm:col-span-2 space-y-1.5' : undefined}>
              <label className="text-xs text-slate-500 flex items-center gap-2">
                <span className="w-28 shrink-0">
                  {field}
                  {isRequired && <span className="text-rose-500">*</span>}
                </span>
                <select
                  value={fields[field] ?? ''}
                  onChange={(e) => onSetField(field, e.target.value)}
                  className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5"
                >
                  <option value="">—</option>
                  {(columns ?? []).map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name} ({c.dataType})
                    </option>
                  ))}
                </select>
              </label>
              {field === 'full_name' && (
                <label className="text-xs text-slate-500 flex items-center gap-2 pl-[8.5rem]">
                  <input
                    type="checkbox"
                    checked={nameConcat.enabled}
                    onChange={(e) => onChangeNameConcat({ ...nameConcat, enabled: e.target.checked })}
                  />
                  <span className="shrink-0">Split as first + last name:</span>
                  {nameConcat.enabled && (
                    <select
                      value={nameConcat.lastNameColumn}
                      onChange={(e) => onChangeNameConcat({ ...nameConcat, lastNameColumn: e.target.value })}
                      className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5"
                    >
                      <option value="">— last name column —</option>
                      {(columns ?? []).map((c) => (
                        <option key={c.name} value={c.name}>
                          {c.name} ({c.dataType})
                        </option>
                      ))}
                    </select>
                  )}
                </label>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
