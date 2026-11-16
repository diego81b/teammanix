import { clubsWhereSoleAdmin } from './account-deletion.rules';

const row = (clubId: string, userId: string) => ({ clubId, userId });

describe('clubsWhereSoleAdmin', () => {
  it('lists the clubs where the account is the only admin', () => {
    const rows = [row('c1', 'u1'), row('c2', 'u1'), row('c2', 'u2')];
    expect(clubsWhereSoleAdmin(rows, 'u1')).toEqual(['c1']);
  });

  it('is empty when every club has another admin', () => {
    const rows = [row('c1', 'u1'), row('c1', 'u2')];
    expect(clubsWhereSoleAdmin(rows, 'u1')).toEqual([]);
  });

  it('ignores clubs where the account is not an admin', () => {
    const rows = [row('c1', 'u2'), row('c2', 'u3')];
    expect(clubsWhereSoleAdmin(rows, 'u1')).toEqual([]);
  });

  it('counts the account once even with duplicate rows', () => {
    const rows = [row('c1', 'u1'), row('c1', 'u1')];
    expect(clubsWhereSoleAdmin(rows, 'u1')).toEqual(['c1']);
  });

  it('is empty without admin rows', () => {
    expect(clubsWhereSoleAdmin([], 'u1')).toEqual([]);
  });
});
