import { randomBytes, randomUUID } from 'node:crypto';
import { CreateBucketCommand, GetObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import { StorageS3, type ConfigS3 } from '../src/storage/storage-s3';
import { contractStorage } from './storage-contract';

/**
 * A fake S3 (adobe/s3mock) is enough to verify the protocol: the same driver talks to R2, Hetzner or MinIO.
 * The official MinIO image is no longer on Docker Hub, so we do not use it in tests.
 */
const BUCKET = 'test-certificates';
let container: StartedTestContainer;
let cfg: ConfigS3;
const key = randomBytes(32);

beforeAll(async () => {
  container = await new GenericContainer('adobe/s3mock:latest')
    .withExposedPorts(9090)
    .withWaitStrategy(Wait.forListeningPorts())
    .start();
  cfg = {
    endpoint: `http://${container.getHost()}:${container.getMappedPort(9090)}`,
    region: 'us-east-1',
    bucket: BUCKET,
    accessKeyId: 'test',
    secretAccessKey: 'test',
  };
  await clientTest().send(new CreateBucketCommand({ Bucket: BUCKET }));
}, 120_000);

afterAll(async () => {
  await container?.stop();
});

const clientTest = () =>
  new S3Client({
    endpoint: cfg.endpoint,
    region: cfg.region,
    forcePathStyle: true,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  });

contractStorage('S3', () => ({
  storage: new StorageS3(cfg, key),
  otherWithDifferentKey: new StorageS3(cfg, randomBytes(32)),
}));

describe('StorageS3, object specific', () => {
  const client = clientTest;

  it('the object in the bucket is encrypted and declared as opaque binary', async () => {
    const club = randomUUID();
    const k = await new StorageS3(cfg, key).save(club, Buffer.from('%PDF-1.7 contenuto in chiaro riconoscibile'));
    const raw = Buffer.from(await (await client().send(new GetObjectCommand({ Bucket: BUCKET, Key: k }))).Body!.transformToByteArray());
    expect(raw.includes(Buffer.from('contenuto in chiaro'))).toBe(false);
    const head = await client().send(new HeadObjectCommand({ Bucket: BUCKET, Key: k }));
    expect(head.ContentType).toBe('application/octet-stream');
  });
});
