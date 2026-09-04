export interface StoredFile {
  storedPath: string; // opaque key/path, never exposed to clients
}

export interface StorageProvider {
  /** Saves a buffer under a generated key and returns the opaque stored path. */
  save(key: string, data: Buffer, mimeType: string): Promise<StoredFile>;
  /**
   * Streams a previously-saved file to an Express response (local) or returns
   * a redirect URL (S3/Supabase). `expiresInSeconds` only affects providers
   * that hand back a signed redirectUrl — a preview embed needs longer than
   * a one-shot download link since the tab can stay open a while.
   */
  read(storedPath: string, expiresInSeconds?: number): Promise<{ stream?: NodeJS.ReadableStream; redirectUrl?: string }>;
  delete(storedPath: string): Promise<void>;
}
