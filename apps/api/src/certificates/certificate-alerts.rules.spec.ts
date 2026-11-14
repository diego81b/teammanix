import type { Source } from '../permissions/policy';
import { alertBucket, alertKey, digestKey, staffDigests, type AlertedPerson, type StaffCandidate } from './certificate-alerts.rules';

const TODAY = '2026-11-10';
const plus = (n: number) => new Date(Date.UTC(2026, 10, 10 + n)).toISOString().slice(0, 10);

describe('alertBucket', () => {
  it('nothing beyond 30 days', () => {
    expect(alertBucket(plus(31), TODAY)).toBeNull();
    expect(alertBucket(plus(400), TODAY)).toBeNull();
  });

  it('the 30 day alert from day 30 to day 16', () => {
    expect(alertBucket(plus(30), TODAY)).toBe('30d');
    expect(alertBucket(plus(16), TODAY)).toBe('30d');
  });

  it('the 15 day alert from day 15 to the expiry day itself', () => {
    expect(alertBucket(plus(15), TODAY)).toBe('15d');
    expect(alertBucket(plus(0), TODAY)).toBe('15d');
  });

  it('expired from the day after, which is when the certificate stops counting', () => {
    expect(alertBucket(plus(-1), TODAY)).toBe('expired');
    expect(alertBucket(plus(-30), TODAY)).toBe('expired');
  });

  it('a certificate long expired is old news: no alert, so data loaded late does not flood people', () => {
    expect(alertBucket(plus(-31), TODAY)).toBeNull();
    expect(alertBucket(plus(-300), TODAY)).toBeNull();
  });

  it('a first run that finds the certificate already inside 15 days sends the 15 day alert only', () => {
    expect(alertBucket(plus(9), TODAY)).toBe('15d');
  });
});

describe('alertKey', () => {
  it('is stable for the same certificate, expiry and bucket, and differs otherwise', () => {
    expect(alertKey('c1', '2026-12-01', '30d')).toBe(alertKey('c1', '2026-12-01', '30d'));
    expect(alertKey('c1', '2026-12-01', '30d')).not.toBe(alertKey('c1', '2026-12-01', '15d'));
    expect(alertKey('c1', '2026-12-01', '30d')).not.toBe(alertKey('c1', '2026-12-15', '30d'));
    expect(alertKey('c1', '2026-12-01', '30d')).not.toBe(alertKey('c2', '2026-12-01', '30d'));
  });
});

describe('digestKey', () => {
  it('one per club and week, Monday to Sunday', () => {
    // 2026-11-09 is a Monday.
    expect(digestKey('c1', '2026-11-09')).toBe(digestKey('c1', '2026-11-15'));
    expect(digestKey('c1', '2026-11-15')).not.toBe(digestKey('c1', '2026-11-16'));
    expect(digestKey('c1', '2026-11-09')).not.toBe(digestKey('c2', '2026-11-09'));
  });

  it('the week crosses months and years', () => {
    expect(digestKey('c1', '2026-12-28')).toBe(digestKey('c1', '2027-01-03'));
    expect(digestKey('c1', '2027-01-03')).not.toBe(digestKey('c1', '2027-01-04'));
  });

  it('a team digest is one per club, week and season, apart from the club digest', () => {
    expect(digestKey('c1', '2026-11-09', 's1')).toBe(digestKey('c1', '2026-11-15', 's1'));
    expect(digestKey('c1', '2026-11-15', 's1')).not.toBe(digestKey('c1', '2026-11-16', 's1'));
    expect(digestKey('c1', '2026-11-09', 's1')).not.toBe(digestKey('c1', '2026-11-09', 's2'));
    expect(digestKey('c1', '2026-11-09', 's1')).not.toBe(digestKey('c2', '2026-11-09', 's1'));
    expect(digestKey('c1', '2026-11-09', 's1')).not.toBe(digestKey('c1', '2026-11-09'));
  });

  it('the club digest keeps the key it had before the digest went per team, so the week of the release does not repeat it', () => {
    expect(digestKey('c1', '2026-11-10')).toBe('cert-due:c1:2026-11-09');
  });
});

describe('staffDigests', () => {
  const team = (teamId: string, sectionId: string | null = 'a1') => ({ sectionId, teamId, seasonId: `s-${teamId}`, teamName: `Team ${teamId}` });
  const admin: Source = { role: 'admin', scope: { type: 'club' } };
  const coachOf = (teamId: string): Source => ({ role: 'coach', scope: { type: 'team', teamId } });
  const assistantOf = (teamId: string): Source => ({ role: 'assistant_coach', scope: { type: 'team', teamId } });
  const trainerOf = (teamId: string): Source => ({ role: 'trainer', scope: { type: 'team', teamId } });
  const managerOfSection = (sectionId: string): Source => ({ role: 'manager', scope: { type: 'section', sectionId } });
  const person = (personId: string, bucket: AlertedPerson['bucket'], ...teams: string[]): AlertedPerson => ({
    personId,
    bucket,
    targets: teams.map((t) => team(t)),
  });
  const candidate = (userId: string, sources: Source[], diff: StaffCandidate['diff'] = {}): StaffCandidate => ({ userId, sources, diff });
  const usersOf = (digests: ReturnType<typeof staffDigests>) => [...new Set(digests.map((d) => d.userId))].sort();
  const of = (digests: ReturnType<typeof staffDigests>, userId: string) => digests.filter((d) => d.userId === userId);

  it('the admin hears about everyone in one digest for the club, the coach only about their team', () => {
    const digests = staffDigests(
      [candidate('admin', [admin]), candidate('coach', [coachOf('t1')])],
      [person('p1', '30d', 't1'), person('p2', '15d', 't2')],
    );
    expect(of(digests, 'admin')).toEqual([{ userId: 'admin', seasonId: null, team: null, expiring: 2, expired: 0, link: '/people' }]);
    expect(of(digests, 'coach')).toEqual([{ userId: 'coach', seasonId: 's-t1', team: 'Team t1', expiring: 1, expired: 0, link: '/team-certificates/s-t1' }]);
  });

  it('counts expired apart from expiring', () => {
    const digests = staffDigests([candidate('admin', [admin])], [person('p1', '30d', 't1'), person('p2', 'expired', 't1'), person('p3', 'expired', 't1')]);
    expect(of(digests, 'admin')).toMatchObject([{ expiring: 1, expired: 2 }]);
  });

  it('whoever lacks the certificates permission gets nothing, and the diff can grant or revoke it', () => {
    const digests = staffDigests(
      [
        candidate('trainer', [trainerOf('t1')]),
        candidate('trainerGranted', [trainerOf('t1')], { 'certificates.status': true }),
        candidate('assistant', [assistantOf('t1')]),
        candidate('assistantRevoked', [assistantOf('t1')], { 'certificates.status': false }),
      ],
      [person('p1', '15d', 't1')],
    );
    expect(usersOf(digests)).toEqual(['assistant', 'trainerGranted']);
  });

  it('the admin counts a person in two teams once', () => {
    const digests = staffDigests([candidate('admin', [admin])], [person('p1', '30d', 't1', 't2')]);
    expect(of(digests, 'admin')).toMatchObject([{ expiring: 1, expired: 0, link: '/people' }]);
  });

  it('a person in two teams reaches the coaches of either', () => {
    const digests = staffDigests([candidate('c1', [coachOf('t1')]), candidate('c2', [coachOf('t2')]), candidate('c3', [coachOf('t3')])], [person('p1', '30d', 't1', 't2')]);
    expect(usersOf(digests)).toEqual(['c1', 'c2']);
  });

  it('a person who plays in two teams of one coach counts in the digest of each, never in a total', () => {
    const digests = staffDigests([candidate('c', [coachOf('t1'), coachOf('t2')])], [person('p1', '30d', 't1', 't2')]);
    expect(of(digests, 'c')).toMatchObject([
      { seasonId: 's-t1', expiring: 1 },
      { seasonId: 's-t2', expiring: 1 },
    ]);
  });

  it('staff get one digest per team of their scope that has someone due, each counting its own people and opening its own page', () => {
    const digests = staffDigests(
      [candidate('c', [coachOf('t1'), coachOf('t2'), coachOf('t3')])],
      [person('p1', '30d', 't1'), person('p2', 'expired', 't1'), person('p3', '15d', 't2')],
    );
    expect(of(digests, 'c')).toEqual([
      { userId: 'c', seasonId: 's-t1', team: 'Team t1', expiring: 1, expired: 1, link: '/team-certificates/s-t1' },
      { userId: 'c', seasonId: 's-t2', team: 'Team t2', expiring: 1, expired: 0, link: '/team-certificates/s-t2' },
    ]);
  });

  it('staff with people due in one team only get one digest, for that team', () => {
    const digests = staffDigests([candidate('c', [coachOf('t1'), coachOf('t2')])], [person('p1', '30d', 't2')]);
    expect(of(digests, 'c')).toMatchObject([{ seasonId: 's-t2' }]);
  });

  it('a manager granted the permission over a section gets one digest for each of its teams with people due', () => {
    const digests = staffDigests(
      [candidate('m', [managerOfSection('a1')], { 'certificates.status': true })],
      [person('p1', '30d', 't1'), person('p2', '30d', 't2'), person('p3', '30d', 't3'), person('p4', '30d', 't4')],
    );
    expect(of(digests, 'm').map((d) => d.seasonId)).toEqual(['s-t1', 's-t2', 's-t3', 's-t4']);
    expect(of(digests, 'm').every((d) => d.expiring === 1)).toBe(true);
  });

  it('a section manager is not told about a team that has no section', () => {
    const noSection: AlertedPerson = { personId: 'p9', bucket: '30d', targets: [team('t9', null)] };
    const digests = staffDigests([candidate('m', [managerOfSection('a1')], { 'certificates.status': true })], [noSection]);
    expect(of(digests, 'm')).toEqual([]);
  });

  it('two sources of the permission over the same team give one digest for that team', () => {
    const digests = staffDigests([candidate('c', [coachOf('t1'), managerOfSection('a1'), coachOf('t1')], { 'certificates.status': true })], [person('p1', '30d', 't1')]);
    expect(of(digests, 'c')).toHaveLength(1);
  });

  it('the admin who also coaches keeps the single digest for the club, not one per team', () => {
    const digests = staffDigests([candidate('both', [admin, coachOf('t1'), coachOf('t2')])], [person('p1', '30d', 't1'), person('p2', '30d', 't2')]);
    expect(of(digests, 'both')).toEqual([{ userId: 'both', seasonId: null, team: null, expiring: 2, expired: 0, link: '/people' }]);
  });

  it('the digests come in a stable order: by user, then by season id', () => {
    const digests = staffDigests(
      [candidate('b', [coachOf('t2'), coachOf('t1')]), candidate('a', [coachOf('t1')])],
      [person('p1', '30d', 't2'), person('p2', '30d', 't1')],
    );
    expect(digests.map((d) => `${d.userId}:${d.seasonId}`)).toEqual(['a:s-t1', 'b:s-t1', 'b:s-t2']);
  });

  it('nobody to tell, nothing to tell', () => {
    expect(staffDigests([], [person('p1', '30d', 't1')])).toEqual([]);
    expect(staffDigests([candidate('admin', [admin])], [])).toEqual([]);
  });
});
