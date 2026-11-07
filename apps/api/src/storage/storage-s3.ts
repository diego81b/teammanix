import { randomUUID } from 'node:crypto';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { encrypt, decrypt } from './encryption';
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
    private readonly keyEncryption: Buffer,
  ) {
    super();
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

  async save(clubId: string, data: Buffer): Promise<string> {
    const key = `${clubId}/${randomUUID()}`;
    validateKey(key); // also validates clubId
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.cfg.bucket,
        Key: key,
        Body: encrypt(data, this.keyEncryption),
        ContentType: 'application/octet-stream',
      }),
    );
    return key;
  }

  async read(key: string): Promise<Buffer> {
    validateKey(key);
    const r = await this.client.send(new GetObjectCommand({ Bucket: this.cfg.bucket, Key: key }));
    if (!r.Body) throw new Error('Empty object');
    return decrypt(Buffer.from(await r.Body.transformToByteArray()), this.keyEncryption);
  }

  /** S3 responds with success even if the object does not exist: idempotency is native. */
  async remove(key: string): Promise<void> {
    validateKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.cfg.bucket, Key: key }));
  }
}
