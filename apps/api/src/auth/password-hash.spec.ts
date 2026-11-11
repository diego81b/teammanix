import * as argon2 from 'argon2';
import { hashOptions } from './password-hash';

describe('hashOptions', () => {
  it.each([undefined, 'production', 'development', 'staging', ''])('keeps the argon2 defaults when NODE_ENV is %p', (env) => {
    expect(hashOptions(env)).toEqual({});
  });

  it('uses light parameters only when NODE_ENV is exactly test, so the integration suites do not pay for the production cost', async () => {
    const options = hashOptions('test');
    expect(options).toEqual({ memoryCost: 1024, timeCost: 1, parallelism: 1 });
    const hash = await argon2.hash('password-long-123', options);
    expect(hash).toContain('m=1024,t=1,p=1');
    expect(await argon2.verify(hash, 'password-long-123')).toBe(true);
  });

  it('verifies a hash made with the production defaults even when the process runs with the light parameters', async () => {
    const hash = await argon2.hash('password-long-123', hashOptions('production'));
    expect(await argon2.verify(hash, 'password-long-123')).toBe(true);
  });
});
