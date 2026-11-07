import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const IV = 12;
const TAG = 16;

function checkKey(key: Buffer): void {
  if (key.length !== 32) throw new Error('The encryption key must be 32 bytes');
}

/** AES-256-GCM. Format: IV (12) + authentication tag (16) + ciphertext. */
export function encrypt(data: Buffer, key: Buffer): Buffer {
  checkKey(key);
  const iv = randomBytes(IV);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([c.update(data), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), encrypted]);
}

/** Throws if the key is wrong or the data was altered or truncated. */
export function decrypt(data: Buffer, key: Buffer): Buffer {
  checkKey(key);
  if (data.length < IV + TAG) throw new Error('Invalid encrypted data');
  const d = createDecipheriv('aes-256-gcm', key, data.subarray(0, IV));
  d.setAuthTag(data.subarray(IV, IV + TAG));
  return Buffer.concat([d.update(data.subarray(IV + TAG)), d.final()]);
}
