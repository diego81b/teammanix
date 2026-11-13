import { authLimit } from './auth-limit';

describe('authLimit', () => {
  it('is strict by default and in production', () => {
    expect(authLimit({})).toBe(10);
    expect(authLimit({ NODE_ENV: 'development' })).toBe(10);
    expect(authLimit({ NODE_ENV: 'production' })).toBe(10);
  });
  it('is raised under test', () => {
    expect(authLimit({ NODE_ENV: 'test' })).toBe(10_000);
  });
  it('is raised when the end to end outbox is on, because the e2e suite logs in many users within a minute', () => {
    expect(authLimit({ NODE_ENV: 'development', E2E_OUTBOX: '1' })).toBe(10_000);
  });
  it('stays strict in production even with the e2e variable', () => {
    expect(authLimit({ NODE_ENV: 'production', E2E_OUTBOX: '1' })).toBe(10);
  });
});
