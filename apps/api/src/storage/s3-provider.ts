import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { StorageProvider, StoredFile } from './provider';

export interface S3Config {
  endpoint?: string; // set for MinIO / non-AWS S3-compatible stores
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean; // required by most MinIO deployments
}

export class S3StorageProvider implements StorageProvider {
  private readonly client: S3Client;

  constructor(private readonly config: S3Config) {
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
  }

  async save(key: string, data: Buffer, mimeType: string): Promise<StoredFile> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.config.bucket, Key: key, Body: data, ContentType: mimeType })
    );
    return { storedPath: key };
  }

  async read(storedPath: string): Promise<{ redirectUrl: string }> {
    const command = new GetObjectCommand({ Bucket: this.config.bucket, Key: storedPath });
    // 5-minute presigned URL — attachment paths themselves are never exposed to clients.
    const redirectUrl = await getSignedUrl(this.client, command, { expiresIn: 300 });
    return { redirectUrl };
  }

  async delete(storedPath: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: storedPath }));
  }
}
