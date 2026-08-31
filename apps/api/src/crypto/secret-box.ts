import crypto from 'crypto';

/**
 * AES-256-GCM encryption for secrets stored at rest (source-DB passwords,
 * S3 keys). The key lives only in PORTAL_MASTER_KEY (an env var / secret
 * manager entry) — it is never written to the database, so a DB dump alone
 * never leaks a school's database password.
 */
function getMasterKey(): Buffer {
  const raw = process.env.PORTAL_MASTER_KEY;
  if (!raw) {
    throw new Error(
      'PORTAL_MASTER_KEY is not set. Generate one with `openssl rand -hex 32` and set it before starting the server.'
    );
  }
  const key = Buffer.from(raw, 'hex');
  if (key.length !== 32) {
    throw new Error('PORTAL_MASTER_KEY must be a 32-byte value hex-encoded (64 hex characters).');
  }
  return key;
}

export function encryptSecret(plaintext: string): string {
  const key = getMasterKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // iv.authTag.ciphertext, all base64
  return `${iv.toString('base64')}.${authTag.toString('base64')}.${encrypted.toString('base64')}`;
}

export function decryptSecret(payload: string): string {
  const key = getMasterKey();
  const [ivB64, tagB64, dataB64] = payload.split('.');
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Malformed encrypted secret payload.');
  }
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString('utf8');
}
