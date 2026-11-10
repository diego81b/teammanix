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
});

describe('staffDigests', () => {
  const team = (teamId: string, activityId = 'a1') => ({ activityId, teamId, seasonId: `s-${teamId}` });
  const admin: Source = { role: 'admin', scope: { type: 'club' } };
  const coachOf = (teamId: string): Source => ({ role: 'coach', scope: { type: 'team', activityId: 'a1', teamId } });
  const assistantOf = (teamId: string): Source => ({ role: 'assistant_coach', scope: { type: 'team', activityId: 'a1', teamId } });
  const trainerOf = (teamId: string): Source => ({ role: 'trainer', scope: { type: 'team', activityId: 'a1', teamId } });
  const person = (personId: string, bucket: AlertedPerson['bucket'], ...teams: string[]): AlertedPerson => ({
    personId,
    bucket,
    targets: teams.map((t) => team(t)),
  });
  const candidate = (userId: string, sources: Source[], diff: StaffCandidate['diff'] = {}): StaffCandidate => ({ userId, sources, diff });

  it('the admin hears about everyone, the coach only about their team', () => {
    const digests = staffDigests(
      [candidate('admin', [admin]), candidate('coach', [coachOf('t1')])],
      [person('p1', '30d', 't1'), person('p2', '15d', 't2')],
    );
    expect(digests.get('admin')).toEqual({ expiring: 2, expired: 0, link: '/people' });
    expect(digests.get('coach')).toEqual({ expiring: 1, expired: 0, link: '/team-certificates/s-t1' });
  });

  it('counts expired apart from expiring', () => {
    const digests = staffDigests([candidate('admin', [admin])], [person('p1', '30d', 't1'), person('p2', 'expired', 't1'), person('p3', 'expired', 't1')]);
    expect(digests.get('admin')).toEqual({ expiring: 1, expired: 2, link: '/people' });
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
    expect([...digests.keys()].sort()).toEqual(['assistant', 'trainerGranted']);
  });

  it('a person in two teams is counted once, even when the staff member covers both', () => {
    const digests = staffDigests([candidate('admin', [admin])], [person('p1', '30d', 't1', 't2')]);
    expect(digests.get('admin')).toEqual({ expiring: 1, expired: 0, link: '/people' });
  });

  it('a person in two teams reaches the coaches of either', () => {
    const digests = staffDigests([candidate('c1', [coachOf('t1')]), candidate('c2', [coachOf('t2')]), candidate('c3', [coachOf('t3')])], [person('p1', '30d', 't1', 't2')]);
    expect([...digests.keys()].sort()).toEqual(['c1', 'c2']);
  });

  it('staff are sent to the page of their team, the admin to the people list even when they also coach', () => {
    const digests = staffDigests([candidate('coach', [coachOf('t1')]), candidate('both', [admin, coachOf('t1')])], [person('p1', '30d', 't1')]);
    expect(digests.get('coach')?.link).toBe('/team-certificates/s-t1');
    expect(digests.get('both')?.link).toBe('/people');
  });

  it('staff of several teams are sent to the team with the most people due, the lowest season id on a tie', () => {
    const both = candidate('c', [coachOf('t1'), coachOf('t2')]);
    expect(staffDigests([both], [person('p1', '30d', 't1'), person('p2', '30d', 't2'), person('p3', 'expired', 't2')]).get('c')?.link).toBe('/team-certificates/s-t2');
    expect(staffDigests([both], [person('p1', '30d', 't2'), person('p2', '30d', 't1')]).get('c')?.link).toBe('/team-certificates/s-t1');
  });

  it('nobody to tell, nothing to tell', () => {
    expect(staffDigests([], [person('p1', '30d', 't1')]).size).toBe(0);
    expect(staffDigests([candidate('admin', [admin])], []).size).toBe(0);
  });
});
