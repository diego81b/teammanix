import { randomBytes } from 'node:crypto';
import { decrypt, encrypt, keyId, keyRing, rewrap } from './encryption';

const a = randomBytes(32);
const b = randomBytes(32);
const ring = keyRing(a);
const AAD = 'club/object';

describe('envelope encryption', () => {
  it('decrypts what it encrypted', () => {
    const data = Buffer.from('%PDF-1.7 test content');
    expect(decrypt(encrypt(data, ring, AAD), ring, AAD).equals(data)).toBe(true);
  });

  it('the ciphertext does not contain the plaintext', () => {
    const data = Buffer.from('recognisable content recognisable content');
    expect(encrypt(data, ring, AAD).includes(data.subarray(0, 12))).toBe(false);
  });

  it('two encryptions of the same data differ (random data key and IV)', () => {
    const data = Buffer.from('same');
    expect(encrypt(data, ring, AAD).equals(encrypt(data, ring, AAD))).toBe(false);
  });

  it('wrong key: error', () => {
    expect(() => decrypt(encrypt(Buffer.from('x'), ring, AAD), keyRing(b), AAD)).toThrow('Unknown storage key');
  });

  it('tampered data: error (integrity)', () => {
    const c = encrypt(Buffer.from('content not to alter'), ring, AAD);
    c[c.length - 1] ^= 0xff;
    expect(() => decrypt(c, ring, AAD)).toThrow();
  });

  it('tampered wrapped data key: error', () => {
    const c = encrypt(Buffer.from('content'), ring, AAD);
    c[2 + keyId(a).length + 12 + 16] ^= 0xff;
    expect(() => decrypt(c, ring, AAD)).toThrow();
  });

  it('truncated data: error', () => {
    expect(() => decrypt(Buffer.alloc(10), ring, AAD)).toThrow();
  });

  it('unknown format version: error', () => {
    const c = encrypt(Buffer.from('x'), ring, AAD);
    c[0] = 9;
    expect(() => decrypt(c, ring, AAD)).toThrow('Unsupported encrypted format');
  });

  it('bound to the object key: the same bytes under another key do not decrypt', () => {
    const c = encrypt(Buffer.from('certificate of person 1'), ring, 'club/one');
    expect(() => decrypt(c, ring, 'club/two')).toThrow();
  });

  it('rejects a key that is not 32 bytes', () => {
    expect(() => keyRing(randomBytes(16))).toThrow('32 bytes');
    expect(() => keyRing(a, [randomBytes(16)])).toThrow('32 bytes');
  });

  it('rejects the same key twice in a ring', () => {
    expect(() => keyRing(a, [a])).toThrow('Duplicate');
  });

  describe('rotation', () => {
    const data = Buffer.from('file written under the old key');
    const old = encrypt(data, ring, AAD);
    const rotated = keyRing(b, [a]);

    it('a previous key still reads', () => {
      expect(decrypt(old, rotated, AAD).equals(data)).toBe(true);
    });

    it('writes use the current key', () => {
      const fresh = encrypt(data, rotated, AAD);
      expect(() => decrypt(fresh, keyRing(a), AAD)).toThrow('Unknown storage key');
      expect(decrypt(fresh, keyRing(b), AAD).equals(data)).toBe(true);
    });

    it('rewrap moves the data key to the current key and keeps the file ciphertext', () => {
      const moved = rewrap(old, rotated, AAD) as Buffer;
      expect(decrypt(moved, keyRing(b), AAD).equals(data)).toBe(true);
      expect(() => decrypt(moved, keyRing(a), AAD)).toThrow();
      const tail = 12 + 16 + data.length;
      expect(moved.subarray(moved.length - tail).equals(old.subarray(old.length - tail))).toBe(true);
    });

    it('rewrap returns null when already on the current key', () => {
      expect(rewrap(encrypt(data, rotated, AAD), rotated, AAD)).toBeNull();
    });

    it('rewrap with a key that is not in the ring: error', () => {
      expect(() => rewrap(old, keyRing(b), AAD)).toThrow('Unknown storage key');
    });

    it('rewrap under another object key: error', () => {
      expect(() => rewrap(old, rotated, 'club/other')).toThrow();
    });
  });
});
