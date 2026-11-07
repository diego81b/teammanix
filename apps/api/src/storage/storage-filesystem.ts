import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { encrypt, decrypt } from './encryption';
import { StorageService, validateKey } from './storage.service';

/** Encrypted files on a private volume. Meant for development and test: production uses S3. */
export class StorageFileSystem extends StorageService {
  constructor(
    private readonly root: string,
    private readonly keyEncryption: Buffer,
  ) {
    super();
  }

  async save(clubId: string, data: Buffer): Promise<string> {
    const key = `${clubId}/${randomUUID()}`;
    const path = this.path(key); // also validates clubId
    await mkdir(join(this.root, clubId), { recursive: true });
    await writeFile(path, encrypt(data, this.keyEncryption), { flag: 'wx', mode: 0o600 });
    return key;
  }

  async read(key: string): Promise<Buffer> {
    return decrypt(await readFile(this.path(key)), this.keyEncryption);
  }

  async remove(key: string): Promise<void> {
    await rm(this.path(key), { force: true });
  }

  private path(key: string): string {
    validateKey(key);
    return join(this.root, ...key.split('/'));
  }
}
