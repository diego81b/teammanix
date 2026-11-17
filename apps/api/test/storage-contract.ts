import { randomBytes, randomUUID } from 'node:crypto';
import { keyRing, type KeyRing } from '../src/storage/encryption';
import { rewrapAll, type StorageService } from '../src/storage/storage.service';

/**
 * Behaviour every `StorageService` driver must guarantee. Used from a test file:
 * `contractStorage('name', () => ({ storage, withRing }))`.
 * `storage` writes with a key; `withRing(ring)` points to the same store with another key ring.
 */
export function contractStorage(name: string, create: () => { storage: StorageService; withRing: (ring: KeyRing) => StorageService }): void {
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
      const { storage, withRing } = create();
      const key = await storage.save(club, Buffer.from('secret'));
      await expect(withRing(keyRing(randomBytes(32))).read(key)).rejects.toThrow();
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

    it('an object copied under another key cannot be read (bound to its key)', async () => {
      const { storage } = create();
      const raw = storage as unknown as { getRaw(k: string): Promise<Buffer>; putRaw(k: string, b: Buffer): Promise<void> };
      const one = await storage.save(club, Buffer.from('certificate of person one'));
      const two = await storage.save(club, Buffer.from('certificate of person two'));
      await raw.putRaw(two, await raw.getRaw(one));
      await expect(storage.read(two)).rejects.toThrow();
    });

    describe('key rotation', () => {
      const oldKey = randomBytes(32);
      const newKey = randomBytes(32);

      it('a previous key stays readable and new files use the current key', async () => {
        const { withRing } = create();
        const club = randomUUID();
        const before = await withRing(keyRing(oldKey)).save(club, Buffer.from('written before'));
        const rotated = withRing(keyRing(newKey, [oldKey]));
        expect((await rotated.read(before)).toString()).toBe('written before');
        const after = await rotated.save(club, Buffer.from('written after'));
        await expect(withRing(keyRing(oldKey)).read(after)).rejects.toThrow();
      });

      it('rewrap moves every object to the current key, then the old key can go', async () => {
        const { withRing } = create();
        const club = randomUUID();
        const key = await withRing(keyRing(oldKey)).save(club, Buffer.from('to rewrap'));
        const rotated = withRing(keyRing(newKey, [oldKey]));
        const r = await rewrapAll(rotated, false, club);
        expect(r.rewrapped).toBeGreaterThanOrEqual(1);
        expect((await withRing(keyRing(newKey)).read(key)).toString()).toBe('to rewrap');
        await expect(withRing(keyRing(oldKey)).read(key)).rejects.toThrow();
      });

      it('rewrap is repeatable: converted objects are skipped', async () => {
        const { withRing } = create();
        const club = randomUUID();
        await withRing(keyRing(oldKey)).save(club, Buffer.from('once'));
        const rotated = withRing(keyRing(newKey, [oldKey]));
        await rewrapAll(rotated, false, club);
        expect((await rewrapAll(rotated, false, club)).rewrapped).toBe(0);
      });

      it('a dry run reports the count and writes nothing', async () => {
        const { withRing } = create();
        const club = randomUUID();
        const key = await withRing(keyRing(oldKey)).save(club, Buffer.from('dry'));
        const r = await rewrapAll(withRing(keyRing(newKey, [oldKey])), true, club);
        expect(r.rewrapped).toBeGreaterThanOrEqual(1);
        expect((await withRing(keyRing(oldKey)).read(key)).toString()).toBe('dry');
      });

      it('a ring without the old key stops on the first object and writes nothing', async () => {
        const { withRing } = create();
        const club = randomUUID();
        const key = await withRing(keyRing(oldKey)).save(club, Buffer.from('untouched'));
        await expect(rewrapAll(withRing(keyRing(randomBytes(32))), false, club)).rejects.toThrow('Rewrap stopped at');
        expect((await withRing(keyRing(oldKey)).read(key)).toString()).toBe('untouched');
      });
    });
  });
}
