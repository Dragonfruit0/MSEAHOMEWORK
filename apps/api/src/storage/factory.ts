import path from 'path';
import { portalDb } from '../db/portal-connection';
import { LocalStorageProvider } from './local-provider';
import { S3StorageProvider } from './s3-provider';
import { SupabaseStorageProvider } from './supabase-provider';
import type { StorageProvider } from './provider';

export async function getActiveStorageProvider(): Promise<{
  provider: StorageProvider;
  maxFileMb: number;
  allowedExtensions: string[];
}> {
  const row = await portalDb()('hp_storage_config').where({ is_active: true }).first();
  if (!row) throw new Error('No active storage configuration. Complete setup first.');
  const config = typeof row.config_json === 'string' ? JSON.parse(row.config_json) : row.config_json;
  const allowedExtensions = typeof row.allowed_extensions === 'string' ? JSON.parse(row.allowed_extensions) : row.allowed_extensions;

  let provider: StorageProvider;
  if (row.provider === 's3') {
    provider = new S3StorageProvider(config);
  } else if (row.provider === 'supabase') {
    provider = new SupabaseStorageProvider(config);
  } else {
    provider = new LocalStorageProvider(config.rootDir ?? path.join(process.cwd(), 'uploads'));
  }

  return { provider, maxFileMb: row.max_file_mb, allowedExtensions };
}
