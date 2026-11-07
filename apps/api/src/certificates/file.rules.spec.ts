import { MAX_FILE_SIZE, detectFile } from './file.rules';

const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(20)]);
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(20)]);
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20)]);

describe('detectFile', () => {
  it('recognises PDF, PNG and JPEG from the first bytes', () => {
    expect(detectFile(pdf)).toBe('application/pdf');
    expect(detectFile(png)).toBe('image/png');
    expect(detectFile(jpeg)).toBe('image/jpeg');
  });

  it('rejects everything else, even with the right extension or declared type', () => {
    expect(detectFile(Buffer.from('<html><script>alert(1)</script></html>'))).toBeNull();
    expect(detectFile(Buffer.from('GIF89a'))).toBeNull();
    expect(detectFile(Buffer.from('MZ eseguibile'))).toBeNull();
  });

  it('rejects an empty or too short file', () => {
    expect(detectFile(Buffer.alloc(0))).toBeNull();
    expect(detectFile(Buffer.from([0xff, 0xd8]))).toBeNull();
  });

  it('the limit is 5 MB', () => {
    expect(MAX_FILE_SIZE).toBe(5 * 1024 * 1024);
  });
});
