import { randomBytes } from 'node:crypto';
import { encrypt, decrypt } from './encryption';

const key = randomBytes(32);

describe('AES-256-GCM encryption', () => {
  it('decrypts what it encrypted', () => {
    const data = Buffer.from('%PDF-1.7 test content');
    expect(decrypt(encrypt(data, key), key).equals(data)).toBe(true);
  });

  it('the ciphertext does not contain the plaintext', () => {
    const data = Buffer.from('recognisable content recognisable content');
    expect(encrypt(data, key).includes(data.subarray(0, 12))).toBe(false);
  });

  it('two encryptions of the same data differ (random IV)', () => {
    const data = Buffer.from('uguale');
    expect(encrypt(data, key).equals(encrypt(data, key))).toBe(false);
  });

  it('wrong key: error', () => {
    expect(() => decrypt(encrypt(Buffer.from('x'), key), randomBytes(32))).toThrow();
  });

  it('tampered data: error (integrity)', () => {
    const c = encrypt(Buffer.from('content not to alter'), key);
    c[c.length - 1] ^= 0xff;
    expect(() => decrypt(c, key)).toThrow();
  });

  it('truncated data: error', () => {
    expect(() => decrypt(Buffer.alloc(10), key)).toThrow();
  });

  it('rejects a key that is not 32 bytes', () => {
    expect(() => encrypt(Buffer.from('x'), randomBytes(16))).toThrow();
  });
});
