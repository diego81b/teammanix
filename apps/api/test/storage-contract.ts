import { randomUUID } from 'node:crypto';
import type { StorageService } from '../src/storage/storage.service';

/**
 * Behaviour every `StorageService` driver must guarantee. Used from a test file:
 * `storageContract('name', () => ({ storage, otherWithDifferentKey }))`.
 * `otherWithDifferentKey` points to the same store but with another encryption key.
 */
export function contractStorage(name: string, create: () => { storage: StorageService; otherWithDifferentKey: StorageService }): void {
  describe(`StorageService contract: ${name}`, () => {
    const club = randomUUID();

    it('saves and reads back the same bytes', async () => {
      const { storage } = create();
      const data = Buffer.from('%PDF-1.7 certificato');
      const key = await storage.save(club, data);
      expect((await storage.read(key)).equals(data)).toBe(true);
    });

    it('handles 5 MB files', async () => {
      const { storage } = create();
      const data = Buffer.alloc(5 * 1024 * 1024, 42);
      expect((await storage.read(await storage.save(club, data))).equals(data)).toBe(true);
    });

    it('the key has the club prefix and differs on every save', async () => {
      const { storage } = create();
      const a = await storage.save(club, Buffer.from('a'));
      const b = await storage.save(club, Buffer.from('a'));
      expect(a).not.toBe(b);
      expect(a.startsWith(`${club}/`)).toBe(true);
    });

    it('with another encryption key the file cannot be read', async () => {
      const { storage, otherWithDifferentKey } = create();
      const key = await storage.save(club, Buffer.from('secret'));
      await expect(otherWithDifferentKey.read(key)).rejects.toThrow();
    });

    it('deletes the file and is idempotent', async () => {
      const { storage } = create();
      const key = await storage.save(club, Buffer.from('x'));
      await storage.remove(key);
      await expect(storage.read(key)).rejects.toThrow();
      await expect(storage.remove(key)).resolves.toBeUndefined();
    });

    it('rejects keys with a format other than clubId/uuid', async () => {
      const { storage } = create();
      for (const k of ['../../etc/passwd', `${club}/../x`, '/assoluto', `${club}/not-uuid`, '']) {
        await expect(storage.read(k)).rejects.toThrow('Invalid storage key');
        await expect(storage.remove(k)).rejects.toThrow('Invalid storage key');
      }
    });

    it('a valid key never saved cannot be read', async () => {
      const { storage } = create();
      await expect(storage.read(`${club}/${randomUUID()}`)).rejects.toThrow();
    });
  });
}
