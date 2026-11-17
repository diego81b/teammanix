import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { KeyRing } from './encryption';
import { StorageService, validateKey } from './storage.service';

/** Encrypted files on a private volume. Meant for development and test: production uses S3. */
export class StorageFileSystem extends StorageService {
  constructor(
    private readonly root: string,
    ring: KeyRing,
  ) {
    super(ring);
  }

  async remove(key: string): Promise<void> {
    await rm(this.path(key), { force: true });
  }

  async *listKeys(clubId?: string): AsyncIterable<string> {
    const clubs = await readdir(this.root, { withFileTypes: true }).catch(() => []);
    for (const club of clubs) {
      if (!club.isDirectory() || (clubId && club.name !== clubId)) continue;
      for (const name of await readdir(join(this.root, club.name))) {
        const key = `${club.name}/${name}`;
        try {
          validateKey(key);
        } catch {
          continue; // temporary or foreign file
        }
        yield key;
      }
    }
  }

  protected async getRaw(key: string): Promise<Buffer> {
    return readFile(this.path(key));
  }

  /** Written aside and renamed, so a crash never leaves half an object. */
  protected async putRaw(key: string, blob: Buffer): Promise<void> {
    const path = this.path(key);
    await mkdir(dirname(path), { recursive: true });
    const temp = `${path}.tmp`;
    await writeFile(temp, blob, { mode: 0o600 });
    await rename(temp, path);
  }

  private path(key: string): string {
    validateKey(key);
    return join(this.root, ...key.split('/'));
  }
}
