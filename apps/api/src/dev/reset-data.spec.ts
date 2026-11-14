import { assertNotProduction, parseKeepEmail } from './reset-data';

describe('assertNotProduction', () => {
  it('refuses in production', () => {
    expect(() => assertNotProduction('production')).toThrow('production');
  });

  it.each([undefined, 'development', 'test'])('allows %s', (env) => {
    expect(() => assertNotProduction(env)).not.toThrow();
  });
});

describe('parseKeepEmail', () => {
  it('reads the address after --keep and lowercases it', () => {
    expect(parseKeepEmail(['--keep', 'Diego@Example.it'])).toBe('diego@example.it');
  });

  it('works with other arguments around it', () => {
    expect(parseKeepEmail(['x', '--keep', 'a@b.it', 'y'])).toBe('a@b.it');
  });

  it('fails without --keep: the command never runs without an account to keep', () => {
    expect(() => parseKeepEmail([])).toThrow('--keep');
  });

  it('fails when --keep has no address or another option follows', () => {
    expect(() => parseKeepEmail(['--keep'])).toThrow('--keep');
    expect(() => parseKeepEmail(['--keep', '--force'])).toThrow('--keep');
  });

  it('fails on a value that is not an email', () => {
    expect(() => parseKeepEmail(['--keep', 'diego'])).toThrow('--keep');
  });
});
