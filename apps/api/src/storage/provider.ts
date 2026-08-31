export interface StoredFile {
  storedPath: string; // opaque key/path, never exposed to clients
}

export interface StorageProvider {
  /** Saves a buffer under a generated key and returns the opaque stored path. */
  save(key: string, data: Buffer, mimeType: string): Promise<StoredFile>;
  /** Streams a previously-saved file to an Express response (local) or returns a redirect URL (S3). */
  read(storedPath: string): Promise<{ stream?: NodeJS.ReadableStream; redirectUrl?: string }>;
  delete(storedPath: string): Promise<void>;
}
