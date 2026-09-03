import type { StorageProvider, StoredFile } from './provider';

export interface SupabaseStorageConfig {
  /** e.g. https://adonepldkqghkfzebzcs.supabase.co — no trailing slash. */
  projectUrl: string;
  /** The service_role key (full access, bypasses RLS) — never the anon key. */
  serviceRoleKey: string;
  bucket: string;
}

/**
 * Talks to Supabase Storage's own REST API directly (not its S3-compatible
 * endpoint) — the service_role key works here with no extra dashboard step,
 * unlike the S3 API which needs separately-generated S3 access keys. See
 * https://supabase.com/docs/guides/storage for the endpoint shapes used.
 */
export class SupabaseStorageProvider implements StorageProvider {
  private bucketEnsured = false;

  constructor(private readonly config: SupabaseStorageConfig) {}

  private get baseUrl(): string {
    return `${this.config.projectUrl.replace(/\/$/, '')}/storage/v1`;
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config.serviceRoleKey}`,
      apikey: this.config.serviceRoleKey,
      ...extra,
    };
  }

  /**
   * Creates the configured bucket on first use if it doesn't already exist
   * — the admin shouldn't need a separate manual step in the Supabase
   * dashboard. Deliberately does NOT branch on the check call's status code:
   * a missing bucket comes back as HTTP 400 (not 404) with a body claiming
   * `"statusCode":"404"` as a string inside it — confirmed against a real
   * project, not assumed. Any non-ok check is treated as "attempt to create
   * it"; the create call's own response is what's actually authoritative.
   */
  private async ensureBucket(): Promise<void> {
    if (this.bucketEnsured) return;
    const check = await fetch(`${this.baseUrl}/bucket/${encodeURIComponent(this.config.bucket)}`, {
      headers: this.headers(),
    });
    if (check.ok) {
      this.bucketEnsured = true;
      return;
    }
    const create = await fetch(`${this.baseUrl}/bucket`, {
      method: 'POST',
      headers: this.headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ id: this.config.bucket, name: this.config.bucket, public: false }),
    });
    if (!create.ok && create.status !== 409 /* already exists, created by a concurrent request */) {
      throw new Error(`Could not create Supabase Storage bucket "${this.config.bucket}": ${create.status} ${await create.text()}`);
    }
    this.bucketEnsured = true;
  }

  async save(key: string, data: Buffer, mimeType: string): Promise<StoredFile> {
    await this.ensureBucket();
    const res = await fetch(`${this.baseUrl}/object/${this.config.bucket}/${key}`, {
      method: 'POST',
      headers: this.headers({ 'Content-Type': mimeType, 'x-upsert': 'true' }),
      // fetch's BodyInit type (from the DOM lib) doesn't include Node's
      // Buffer in every @types/node/lib.dom combination — seen only in
      // Vercel's isolated function build, not this repo's own tsc. A plain
      // Uint8Array view is unambiguous everywhere Buffer already *is* one.
      body: new Uint8Array(data),
    });
    if (!res.ok) {
      throw new Error(`Supabase Storage upload failed for "${key}": ${res.status} ${await res.text()}`);
    }
    return { storedPath: key };
  }

  async read(storedPath: string): Promise<{ redirectUrl: string }> {
    // Signed URL rather than a public one — attachments are private by
    // default (the bucket itself is created non-public) and every download
    // already goes through our own authorization check before this is ever
    // called (see attachments/routes.ts).
    const res = await fetch(`${this.baseUrl}/object/sign/${this.config.bucket}/${storedPath}`, {
      method: 'POST',
      headers: this.headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ expiresIn: 300 }),
    });
    if (!res.ok) {
      throw new Error(`Supabase Storage sign failed for "${storedPath}": ${res.status} ${await res.text()}`);
    }
    const { signedURL } = (await res.json()) as { signedURL: string };
    // signedURL comes back as a path relative to /storage/v1 (e.g.
    // "/object/sign/<bucket>/<path>?token=..."), not an absolute URL.
    return { redirectUrl: `${this.baseUrl}${signedURL}` };
  }

  async delete(storedPath: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/object/${this.config.bucket}`, {
      method: 'DELETE',
      headers: this.headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ prefixes: [storedPath] }),
    });
    if (!res.ok) {
      throw new Error(`Supabase Storage delete failed for "${storedPath}": ${res.status} ${await res.text()}`);
    }
  }
}
