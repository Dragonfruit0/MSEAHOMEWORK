import fs from 'fs';
import path from 'path';
import type { StorageProvider, StoredFile } from './provider';

export class LocalStorageProvider implements StorageProvider {
  constructor(private readonly rootDir: string) {
    fs.mkdirSync(rootDir, { recursive: true });
  }

  async save(key: string, data: Buffer): Promise<StoredFile> {
    const fullPath = path.join(this.rootDir, key);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, data);
    return { storedPath: key };
  }

  async read(storedPath: string, _expiresInSeconds?: number): Promise<{ stream?: NodeJS.ReadableStream }> {
    const fullPath = this.resolveSafe(storedPath);
    return { stream: fs.createReadStream(fullPath) };
  }

  async delete(storedPath: string): Promise<void> {
    const fullPath = this.resolveSafe(storedPath);
    await fs.promises.rm(fullPath, { force: true });
  }

  /** Prevents a stored path containing ".." from escaping the storage root. */
  private resolveSafe(storedPath: string): string {
    const fullPath = path.join(this.rootDir, storedPath);
    const normalizedRoot = path.resolve(this.rootDir);
    const normalizedPath = path.resolve(fullPath);
    if (!normalizedPath.startsWith(normalizedRoot)) {
      throw new Error('Refusing to access a path outside the storage root.');
    }
    return normalizedPath;
  }
}
