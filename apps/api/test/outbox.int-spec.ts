import { startEnvironment, Environment } from './helpers';

describe('test outbox (E2E_OUTBOX=1)', () => {
  let scope: Environment;

  beforeAll(async () => {
    process.env.E2E_OUTBOX = '1';
    scope = await startEnvironment();
  });
  afterAll(async () => {
    delete process.env.E2E_OUTBOX;
    await scope?.close();
  });

  it('returns the mails sent to an address, even without authentication', async () => {
    await scope.req('POST', '/auth/registration', {
      body: { email: 'outbox@test.it', password: 'password-long-123', name: 'O', surname: 'B', acceptTerms: true },
    });
    const r = await scope.req('GET', '/__test/outbox?a=Outbox@Test.it');
    expect(r.status).toBe(200);
    expect(r.body).toHaveLength(1);
    expect(r.body[0].a).toBe('outbox@test.it');
    expect(r.body[0].text).toMatch(/token=/);
  });

  it('missing address: empty list', async () => {
    const r = await scope.req('GET', '/__test/outbox');
    expect(r.status).toBe(200);
    expect(r.body).toEqual([]);
  });
});
