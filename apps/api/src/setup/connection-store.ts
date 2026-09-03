import { createAdapter, type ConnectionConfig, type DbAdapter, type Engine } from '@homework-portal/db-adapters';
import { decryptSecret, encryptSecret } from '../crypto/secret-box';
import { portalDb } from '../db/portal-connection';

export interface DbConnectionRow {
  id: number;
  role: 'source' | 'portal';
  engine: Engine;
  config_json: Omit<ConnectionConfig, 'password' | 'engine'>;
  secret_encrypted: string;
  is_active: boolean;
}

/** Persists a draft connection (password encrypted) and returns its row id. Does NOT test it. */
export async function saveDraftConnection(
  role: 'source' | 'portal',
  config: ConnectionConfig
): Promise<number> {
  const { password, engine, ...rest } = config;
  const [row] = await portalDb()('hp_db_connections')
    .insert({
      role,
      engine,
      config_json: JSON.stringify(rest),
      secret_encrypted: encryptSecret(password),
      is_active: false,
    })
    .returning('id');
  return typeof row === 'object' ? row.id : row;
}

export async function loadConnectionConfig(id: number): Promise<ConnectionConfig> {
  const row: DbConnectionRow | undefined = await portalDb()('hp_db_connections').where({ id }).first();
  if (!row) throw new Error(`No stored connection with id ${id}.`);
  const configJson = typeof row.config_json === 'string' ? JSON.parse(row.config_json) : row.config_json;
  return {
    ...configJson,
    engine: row.engine,
    password: decryptSecret(row.secret_encrypted),
  };
}

export async function adapterForConnection(id: number): Promise<DbAdapter> {
  const config = await loadConnectionConfig(id);
  return await createAdapter(config);
}

export async function activateConnection(id: number): Promise<void> {
  const row = await portalDb()('hp_db_connections').where({ id }).first();
  if (!row) throw new Error(`No stored connection with id ${id}.`);
  // Only one active connection per role at a time.
  await portalDb()('hp_db_connections').where({ role: row.role }).update({ is_active: false });
  await portalDb()('hp_db_connections').where({ id }).update({ is_active: true });
}

export async function getActiveConnectionId(role: 'source' | 'portal'): Promise<number | null> {
  const row = await portalDb()('hp_db_connections').where({ role, is_active: true }).first();
  return row?.id ?? null;
}
