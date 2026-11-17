import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const IV = 12;
const TAG = 16;
const DEK = 32;
const VERSION = 1;

export interface StorageKey {
  id: string;
  key: Buffer;
}

/** The key that writes, plus the previous ones that stay readable until a rewrap has moved every object. */
export interface KeyRing {
  current: StorageKey;
  previous: StorageKey[];
}

function checkKey(key: Buffer): void {
  if (key.length !== 32) throw new Error('The encryption key must be 32 bytes');
}

/** Stable identifier derived from the key itself, so it never has to be configured and cannot disagree with the key. */
export function keyId(key: Buffer): string {
  return createHash('sha256').update('storage-key-id:').update(key).digest('hex').slice(0, 8);
}

export function keyRing(current: Buffer, previous: Buffer[] = []): KeyRing {
  const keys = [current, ...previous].map((key) => {
    checkKey(key);
    return { id: keyId(key), key };
  });
  if (new Set(keys.map((k) => k.id)).size !== keys.length) throw new Error('Duplicate key in the key ring');
  return { current: keys[0], previous: keys.slice(1) };
}

function find(ring: KeyRing, id: string): Buffer {
  const k = [ring.current, ...ring.previous].find((x) => x.id === id);
  if (!k) throw new Error(`Unknown storage key ${id}`);
  return k.key;
}

function seal(data: Buffer, key: Buffer, aad: string): Buffer {
  const iv = randomBytes(IV);
  const c = createCipheriv('aes-256-gcm', key, iv);
  c.setAAD(Buffer.from(aad));
  const encrypted = Buffer.concat([c.update(data), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), encrypted]);
}

function open(data: Buffer, key: Buffer, aad: string): Buffer {
  if (data.length < IV + TAG) throw new Error('Invalid encrypted data');
  const d = createDecipheriv('aes-256-gcm', key, data.subarray(0, IV));
  d.setAAD(Buffer.from(aad));
  d.setAuthTag(data.subarray(IV, IV + TAG));
  return Buffer.concat([d.update(data.subarray(IV + TAG)), d.final()]);
}

/** Both parts are bound to the object key, so neither the wrapped key nor the file can be moved to another object. */
const wrapAad = (aad: string) => `wrap:${aad}`;
const fileAad = (aad: string) => `file:${aad}`;

interface Parts {
  id: string;
  wrapped: Buffer;
  body: Buffer;
}

function header(id: string): Buffer {
  return Buffer.concat([Buffer.from([VERSION, id.length]), Buffer.from(id, 'ascii')]);
}

function parse(blob: Buffer): Parts {
  if (blob.length < 2) throw new Error('Invalid encrypted data');
  if (blob[0] !== VERSION) throw new Error('Unsupported encrypted format');
  const idEnd = 2 + blob[1];
  const wrappedEnd = idEnd + IV + TAG + DEK;
  if (blob.length < wrappedEnd + IV + TAG) throw new Error('Invalid encrypted data');
  return { id: blob.subarray(2, idEnd).toString('ascii'), wrapped: blob.subarray(idEnd, wrappedEnd), body: blob.subarray(wrappedEnd) };
}

/**
 * Envelope encryption, AES-256-GCM twice. A random data key encrypts the file; the current key of the ring wraps the data key.
 * Format: version (1), key id length (1), key id, wrapped data key (IV 12, tag 16, key 32), file (IV 12, tag 16, ciphertext).
 */
export function encrypt(data: Buffer, ring: KeyRing, aad: string): Buffer {
  const dek = randomBytes(DEK);
  return Buffer.concat([header(ring.current.id), seal(dek, ring.current.key, wrapAad(aad)), seal(data, dek, fileAad(aad))]);
}

/** Throws if the key is unknown or wrong, the data was altered or truncated, or it belongs to another object key. */
export function decrypt(blob: Buffer, ring: KeyRing, aad: string): Buffer {
  const p = parse(blob);
  const dek = open(p.wrapped, find(ring, p.id), wrapAad(aad));
  return open(p.body, dek, fileAad(aad));
}

/** Wraps the data key again under the current key and leaves the file ciphertext as is. Null when already current. */
export function rewrap(blob: Buffer, ring: KeyRing, aad: string): Buffer | null {
  const p = parse(blob);
  if (p.id === ring.current.id) return null;
  const dek = open(p.wrapped, find(ring, p.id), wrapAad(aad));
  return Buffer.concat([header(ring.current.id), seal(dek, ring.current.key, wrapAad(aad)), p.body]);
}
