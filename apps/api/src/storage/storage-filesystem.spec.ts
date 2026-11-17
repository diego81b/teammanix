import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { keyRing } from './encryption';
import { StorageFileSystem } from './storage-filesystem';
import { contractStorage } from '../../test/storage-contract';

let dir: string;
const ring = keyRing(randomBytes(32));

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'tm-storage-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

contractStorage('filesystem', () => ({
  storage: new StorageFileSystem(dir, ring),
  withRing: (r) => new StorageFileSystem(dir, r),
}));

describe('StorageFileSystem, disk specific', () => {
  const club = randomUUID();

  it('data on disk is encrypted', async () => {
    const storage = new StorageFileSystem(dir, ring);
    const k = await storage.save(club, Buffer.from('%PDF-1.7 recognisable plaintext content'));
    const raw = await readFile(join(dir, ...k.split('/')));
    expect(raw.includes(Buffer.from('plaintext content'))).toBe(false);
  });

  it('one file per club in its own folder', async () => {
    const storage = new StorageFileSystem(dir, ring);
    await storage.save(club, Buffer.from('a'));
    await storage.save(club, Buffer.from('b'));
    expect(await readdir(join(dir, club))).toHaveLength(2);
  });
});
