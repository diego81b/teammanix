import { dueRows, type DuePlayer } from './certificate-due.rules';

const TODAY = '2026-11-10';
const plus = (n: number) => new Date(Date.UTC(2026, 10, 10 + n)).toISOString().slice(0, 10);
const player = (personId: string, expiry: string | null, over: Partial<DuePlayer> = {}): DuePlayer => ({ personId, name: personId, surname: 'Rossi', expiry, ...over });

describe('dueRows', () => {
  it('lists expiring and expired certificates with the days left, negative once expired', () => {
    const rows = dueRows([player('a', plus(20)), player('b', plus(-5))], TODAY);
    expect(rows.map((r) => [r.personId, r.status, r.daysLeft])).toEqual([
      ['b', 'expired', -5],
      ['a', 'expiring', 20],
    ]);
    expect(rows[1]?.expiry).toBe(plus(20));
  });

  it('leaves out valid certificates and players with none', () => {
    expect(dueRows([player('a', plus(31)), player('b', null), player('c', plus(200))], TODAY)).toEqual([]);
  });

  it('the day of the expiry is still expiring, the day after is expired', () => {
    expect(dueRows([player('a', plus(0)), player('b', plus(-1)), player('c', plus(30))], TODAY).map((r) => [r.personId, r.status])).toEqual([
      ['b', 'expired'],
      ['a', 'expiring'],
      ['c', 'expiring'],
    ]);
  });

  it('keeps an old expiry: a certificate expired for months is the one a coach most needs to see', () => {
    expect(dueRows([player('a', plus(-200))], TODAY).map((r) => r.status)).toEqual(['expired']);
  });

  it('most urgent first, then surname, name and id', () => {
    const rows = dueRows(
      [
        player('p3', plus(10), { surname: 'Bianchi', name: 'Zoe' }),
        player('p2', plus(10), { surname: 'Bianchi', name: 'Anna' }),
        player('p1', plus(10), { surname: 'Alfieri', name: 'Luca' }),
        player('p0', plus(1)),
        player('p4', plus(10), { surname: null, name: 'Zed' }),
      ],
      TODAY,
    );
    expect(rows.map((r) => r.personId)).toEqual(['p0', 'p4', 'p1', 'p2', 'p3']);
  });
});
