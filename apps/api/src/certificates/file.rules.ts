export const MAX_FILE_SIZE = 5 * 1024 * 1024;

export type FileType = 'application/pdf' | 'image/jpeg' | 'image/png';

const SIGNATURES: [FileType, number[]][] = [
  ['application/pdf', [0x25, 0x50, 0x44, 0x46, 0x2d]],
  ['image/png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  ['image/jpeg', [0xff, 0xd8, 0xff]],
];

/** The type is derived from the content, never from the header or extension declared by the client. */
export function detectFile(data: Buffer): FileType | null {
  for (const [type, sign] of SIGNATURES) {
    if (data.length > sign.length && sign.every((b, i) => data[i] === b)) return type;
  }
  return null;
}
