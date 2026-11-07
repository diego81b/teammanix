import { outboxEnabled } from './outbox';

describe('outboxEnabled', () => {
  it('off by default', () => {
    expect(outboxEnabled({})).toBe(false);
    expect(outboxEnabled({ NODE_ENV: 'development' })).toBe(false);
  });
  it('on only with E2E_OUTBOX=1 outside production', () => {
    expect(outboxEnabled({ NODE_ENV: 'development', E2E_OUTBOX: '1' })).toBe(true);
    expect(outboxEnabled({ NODE_ENV: 'test', E2E_OUTBOX: '1' })).toBe(true);
    expect(outboxEnabled({ E2E_OUTBOX: '1' })).toBe(true);
  });
  it('in production stays off even with the variable', () => {
    expect(outboxEnabled({ NODE_ENV: 'production', E2E_OUTBOX: '1' })).toBe(false);
  });
  it('values other than 1 do not turn it on', () => {
    for (const v of ['0', 'true', '', 'yes']) expect(outboxEnabled({ E2E_OUTBOX: v })).toBe(false);
  });
});
