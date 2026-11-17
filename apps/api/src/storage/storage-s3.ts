import { DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { KeyRing } from './encryption';
import { StorageService, validateKey } from './storage.service';

export interface ConfigS3 {
  /** Service URL, for example `https://<account>.eu.r2.cloudflarestorage.com`. */
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/**
 * Any S3-compatible service (Cloudflare R2, Hetzner Object Storage, MinIO). The content is already encrypted
 * by the application before upload: it is declared as opaque binary and server-side encryption is not used.
 */
export class StorageS3 extends StorageService {
  private readonly client: S3Client;

  constructor(
    private readonly cfg: ConfigS3,
    ring: KeyRing,
  ) {
    super(ring);
    this.client = new S3Client({
      endpoint: cfg.endpoint,
      region: cfg.region,
      forcePathStyle: true,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
      // Compatible services do not always accept the checksums added by default by recent SDK versions.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }

  protected async putRaw(key: string, blob: Buffer): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.cfg.bucket, Key: key, Body: blob, ContentType: 'application/octet-stream' }),
    );
  }

  protected async getRaw(key: string): Promise<Buffer> {
    const r = await this.client.send(new GetObjectCommand({ Bucket: this.cfg.bucket, Key: key }));
    if (!r.Body) throw new Error('Empty object');
    return Buffer.from(await r.Body.transformToByteArray());
  }

  async *listKeys(clubId?: string): AsyncIterable<string> {
    let token: string | undefined;
    do {
      const r = await this.client.send(new ListObjectsV2Command({ Bucket: this.cfg.bucket, ContinuationToken: token, Prefix: clubId ? `${clubId}/` : undefined }));
      for (const o of r.Contents ?? []) {
        try {
          validateKey(o.Key ?? '');
        } catch {
          continue; // foreign object
        }
        yield o.Key as string;
      }
      token = r.IsTruncated ? r.NextContinuationToken : undefined;
    } while (token);
  }

  /** S3 responds with success even if the object does not exist: idempotency is native. */
  async remove(key: string): Promise<void> {
    validateKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.cfg.bucket, Key: key }));
  }
}
