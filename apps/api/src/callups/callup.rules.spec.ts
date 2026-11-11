import { AccessRoleType, CallupResponse, EnrollmentStatus, EventType, ReasonDecline, ScopeType } from '../entities/enums';
import type { CtxRole } from '../common/auth-context';
import {
  absenceProvider,
  canCallUp,
  certificateProvider,
  checkAnswer,
  evaluate,
  isChange,
  noCoachAvailable,
  partition,
  statusProvider,
  suspensionProvider,
  viewOf,
  type Candidate,
  type Reason,
  type ReasonProvider,
} from './callup.rules';

const ctx = { eventType: EventType.TRAINING, blockCertificate: true };
const fit: Candidate = { status: EnrollmentStatus.AVAILABLE, certificate: 'valid' };
const role = (r: Partial<CtxRole> & Pick<CtxRole, 'role' | 'scope'>): CtxRole => ({ activityId: null, teamId: null, ...r });

describe('reasons from the status and the certificate', () => {
  it('a fit player has no reason', () => {
    expect(evaluate(fit, ctx)).toEqual([]);
  });

  it('injured is a hard block', () => {
    expect(evaluate({ ...fit, status: EnrollmentStatus.INJURED }, ctx)).toEqual([{ code: 'injured', severity: 'hard' }]);
  });

  it.each(['expired', 'missing'] as const)('%s certificate blocks when the club blocks', (certificate) => {
    expect(evaluate({ ...fit, certificate }, ctx)).toEqual([{ code: `certificate_${certificate}`, severity: 'hard' }]);
  });

  it.each(['expired', 'missing'] as const)('%s certificate only warns when the club warns', (certificate) => {
    expect(evaluate({ ...fit, certificate }, { ...ctx, blockCertificate: false })).toEqual([
      { code: `certificate_${certificate}`, severity: 'warning' },
    ]);
  });

  it('an expiring certificate only warns, whatever the club setting', () => {
    for (const blockCertificate of [true, false]) {
      expect(evaluate({ ...fit, certificate: 'expiring' }, { ...ctx, blockCertificate })).toEqual([
        { code: 'certificate_expiring', severity: 'warning' },
      ]);
    }
  });

  it('injured and expired certificate give both reasons', () => {
    const codes = evaluate({ status: EnrollmentStatus.INJURED, certificate: 'expired' }, ctx).map((r) => r.code);
    expect(codes).toEqual(['injured', 'certificate_expired']);
  });

  it('the single providers can be used on their own', () => {
    expect(statusProvider(fit, ctx)).toEqual([]);
    expect(certificateProvider({ ...fit, certificate: 'expired' }, ctx)).toHaveLength(1);
  });
});

describe('extension point: new blocking reasons plug in as providers', () => {
  const absence: ReasonProvider = () => [{ code: 'absence', severity: 'hard', until: '2026-11-15' }];
  const suspension: ReasonProvider = (_c, x) => (x.eventType === EventType.MATCH ? [{ code: 'suspended', severity: 'hard' }] : []);

  it('adds the reasons of every provider after the built in ones', () => {
    const reasons = evaluate({ ...fit, status: EnrollmentStatus.INJURED }, ctx, [statusProvider, certificateProvider, absence]);
    expect(reasons.map((r) => r.code)).toEqual(['injured', 'absence']);
  });

  it('a suspension provider blocks matches only', () => {
    const providers = [statusProvider, certificateProvider, suspension];
    expect(evaluate(fit, ctx, providers)).toEqual([]);
    expect(evaluate(fit, { ...ctx, eventType: EventType.MATCH }, providers)).toEqual([{ code: 'suspended', severity: 'hard' }]);
  });
});

describe('canCallUp', () => {
  const r = (severity: Reason['severity'], code = 'x'): Reason => ({ code, severity });

  it('no reasons or only warnings: ok', () => {
    expect(canCallUp([], false)).toBe('ok');
    expect(canCallUp([r('warning')], false)).toBe('ok');
  });

  it('a hard reason refuses, and no confirmation overrides it', () => {
    expect(canCallUp([r('hard', 'injured')], false)).toBe('NOT_CALLABLE');
    expect(canCallUp([r('hard', 'suspended')], true)).toBe('NOT_CALLABLE');
  });

  it('a confirm reason needs the confirmation', () => {
    expect(canCallUp([r('confirm', 'absence')], false)).toBe('CONFIRMATION_REQUIRED');
    expect(canCallUp([r('confirm', 'absence')], true)).toBe('ok');
  });

  it('hard wins over confirm', () => {
    expect(canCallUp([r('confirm'), r('hard')], true)).toBe('NOT_CALLABLE');
  });
});

describe('partition', () => {
  const row = (enrollmentId: string, calledUp: boolean, reasons: Reason[] = []) => ({ enrollmentId, calledUp, reasons });

  it('puts every person in exactly one list', () => {
    const rows = [
      row('a', true),
      row('b', false),
      row('c', false, [{ code: 'injured', severity: 'hard' }]),
      row('d', false, [{ code: 'certificate_expired', severity: 'warning' }]),
      row('e', false, [{ code: 'absence', severity: 'hard' }]),
      row('f', true, [{ code: 'injured', severity: 'hard' }]),
    ];
    const lists = partition(rows);
    expect(lists.calledUp.map((x) => x.enrollmentId)).toEqual(['a', 'f']);
    expect(lists.callable.map((x) => x.enrollmentId)).toEqual(['b', 'd']);
    expect(lists.notCallable.map((x) => x.enrollmentId)).toEqual(['c', 'e']);
    expect(lists.calledUp.length + lists.callable.length + lists.notCallable.length).toBe(rows.length);
  });
});

describe('viewOf: who sees what of the call-up', () => {
  const season = { id: 's1', activityId: 'a1', teamId: 't1' };
  const input = (over: Partial<Parameters<typeof viewOf>[0]> = {}) => ({
    roles: [] as CtxRole[],
    enrollments: [] as { type: 'player' | 'staff' }[],
    canManage: false,
    season,
    ...over,
  });

  it('whoever has the policy manages', () => {
    expect(viewOf(input({ canManage: true }))).toBe('manage');
  });

  it('admin and managers in their scope read all the lists', () => {
    const admin = role({ role: AccessRoleType.ADMIN, scope: ScopeType.CLUB });
    const manager = role({ role: AccessRoleType.MANAGER, scope: ScopeType.TEAM, teamId: 't1' });
    expect(viewOf(input({ roles: [admin] }))).toBe('read');
    expect(viewOf(input({ roles: [manager] }))).toBe('read');
  });

  it('a manager of another team sees nothing', () => {
    const manager = role({ role: AccessRoleType.MANAGER, scope: ScopeType.TEAM, teamId: 't2' });
    expect(viewOf(input({ roles: [manager] }))).toBe('none');
  });

  it('staff of the season reads all the lists', () => {
    expect(viewOf(input({ enrollments: [{ type: 'staff' }] }))).toBe('read');
  });

  it('a player only gets the player view', () => {
    expect(viewOf(input({ enrollments: [{ type: 'player' }] }))).toBe('player');
  });

  it('staff wins over player when the person is both', () => {
    expect(viewOf(input({ enrollments: [{ type: 'player' }, { type: 'staff' }] }))).toBe('read');
  });

  it('no role and no enrollment: none', () => {
    expect(viewOf(input())).toBe('none');
  });
});

describe('validating an answer', () => {
  it('a player confirms with no reason, or declines with one from the closed list', () => {
    expect(checkAnswer('player', { response: CallupResponse.CONFIRMED })).toBe('ok');
    expect(checkAnswer('player', { response: CallupResponse.DECLINED, reason: ReasonDecline.WORK })).toBe('ok');
  });

  it('a decline without a reason is refused for a player', () => {
    expect(checkAnswer('player', { response: CallupResponse.DECLINED })).toBe('REASON_REQUIRED');
    expect(checkAnswer('player', { response: CallupResponse.DECLINED, reason: null })).toBe('REASON_REQUIRED');
  });

  it('a reason with a confirmation is invalid', () => {
    expect(checkAnswer('player', { response: CallupResponse.CONFIRMED, reason: ReasonDecline.WORK })).toBe('INVALID_DATA');
  });

  it('staff declare without any reason', () => {
    expect(checkAnswer('staff', { response: CallupResponse.CONFIRMED })).toBe('ok');
    expect(checkAnswer('staff', { response: CallupResponse.DECLINED })).toBe('ok');
    expect(checkAnswer('staff', { response: CallupResponse.DECLINED, reason: ReasonDecline.WORK })).toBe('INVALID_DATA');
  });

  it('nobody answers pending: it is the lack of an answer', () => {
    expect(checkAnswer('player', { response: CallupResponse.PENDING })).toBe('INVALID_DATA');
    expect(checkAnswer('staff', { response: CallupResponse.PENDING })).toBe('INVALID_DATA');
  });
});

describe('what counts as a change of answer', () => {
  const was = { response: CallupResponse.CONFIRMED, reason: null };

  it('the same answer is not a change', () => {
    expect(isChange(was, { response: CallupResponse.CONFIRMED, reason: null })).toBe(false);
    expect(isChange({ response: CallupResponse.DECLINED, reason: ReasonDecline.WORK }, { response: CallupResponse.DECLINED, reason: ReasonDecline.WORK })).toBe(false);
  });

  it('another answer is, and so is another reason for the same decline', () => {
    expect(isChange(was, { response: CallupResponse.DECLINED, reason: ReasonDecline.WORK })).toBe(true);
    expect(isChange({ response: CallupResponse.DECLINED, reason: ReasonDecline.WORK }, { response: CallupResponse.DECLINED, reason: ReasonDecline.NOT_AVAILABLE })).toBe(true);
  });

  it('the first answer is a change from pending', () => {
    expect(isChange({ response: CallupResponse.PENDING, reason: null }, { response: CallupResponse.CONFIRMED, reason: null })).toBe(true);
  });
});

describe('no coach available', () => {
  const staff = (...rows: [string, CallupResponse | null][]) => rows.map(([staffRole, response]) => ({ staffRole, response }));

  it('warns when no coach has confirmed, whether declined or silent', () => {
    expect(noCoachAvailable(staff(['coach', null]), ['coach'])).toBe(true);
    expect(noCoachAvailable(staff(['coach', CallupResponse.DECLINED]), ['coach'])).toBe(true);
    expect(noCoachAvailable([], ['coach'])).toBe(true);
  });

  it('a confirmed coach is enough; other roles do not replace the coach', () => {
    expect(noCoachAvailable(staff(['coach', CallupResponse.CONFIRMED]), ['coach'])).toBe(false);
    expect(noCoachAvailable(staff(['assistant_coach', CallupResponse.CONFIRMED], ['trainer', CallupResponse.CONFIRMED]), ['coach'])).toBe(true);
  });

  it('the club decides which roles count as a coach', () => {
    const assistantOnly = staff(['assistant_coach', CallupResponse.CONFIRMED], ['coach', CallupResponse.DECLINED]);
    expect(noCoachAvailable(assistantOnly, ['coach', 'assistant_coach'])).toBe(false);
    expect(noCoachAvailable(assistantOnly, ['coach'])).toBe(true);
    expect(noCoachAvailable(staff(['trainer', CallupResponse.CONFIRMED]), ['coach', 'assistant_coach'])).toBe(true);
  });
});

describe('declared absence (rule 10)', () => {
  it('a person in absence gets a confirm reason with the end of the block', () => {
    expect(evaluate({ ...fit, absence: { until: '2026-11-15' } }, ctx)).toEqual([{ code: 'absence', severity: 'confirm', until: '2026-11-15' }]);
  });

  it('an absence until further notice has no end', () => {
    expect(evaluate({ ...fit, absence: { until: null } }, ctx)).toEqual([{ code: 'absence', severity: 'confirm' }]);
  });

  it('no absence, no reason', () => {
    expect(absenceProvider(fit, ctx)).toEqual([]);
    expect(absenceProvider({ ...fit, absence: null }, ctx)).toEqual([]);
  });

  it('staff can call up a player in absence only after a confirmation', () => {
    const reasons = evaluate({ ...fit, absence: { until: '2026-11-15' } }, ctx);
    expect(canCallUp(reasons, false)).toBe('CONFIRMATION_REQUIRED');
    expect(canCallUp(reasons, true)).toBe('ok');
  });

  it('an injured player in absence stays refused after the confirmation', () => {
    const reasons = evaluate({ ...fit, status: EnrollmentStatus.INJURED, absence: { until: null } }, ctx);
    expect(canCallUp(reasons, false)).toBe('NOT_CALLABLE');
    expect(canCallUp(reasons, true)).toBe('NOT_CALLABLE');
  });

  it('an expired certificate that the club blocks stays refused after the confirmation, a warning does not', () => {
    const expired: Candidate = { ...fit, certificate: 'expired', absence: { until: null } };
    expect(canCallUp(evaluate(expired, ctx), true)).toBe('NOT_CALLABLE');
    expect(canCallUp(evaluate(expired, { ...ctx, blockCertificate: false }), true)).toBe('ok');
  });

  it('a suspension on a match stays refused after the confirmation, on a training the absence alone asks for it', () => {
    const both: Candidate = { ...fit, absence: { until: '2026-11-15' }, suspension: { match: 1, total: 2, until: null } };
    expect(canCallUp(evaluate(both, { ...ctx, eventType: EventType.MATCH }), true)).toBe('NOT_CALLABLE');
    expect(canCallUp(evaluate(both, ctx), true)).toBe('ok');
  });

  it('a player in absence stays in the not callable list', () => {
    const row = { enrollmentId: 'a', calledUp: false, reasons: evaluate({ ...fit, absence: { until: null } }, ctx) };
    expect(partition([row]).notCallable).toHaveLength(1);
  });
});

describe('suspension provider', () => {
  const match = { ...ctx, eventType: EventType.MATCH };
  const block = { match: 1, total: 2, until: null };

  it('no suspension, no reason', () => {
    expect(suspensionProvider(fit, match)).toEqual([]);
    expect(suspensionProvider({ ...fit, suspension: null }, match)).toEqual([]);
  });

  it('a suspended player is blocked for the match, with its place in the count', () => {
    expect(suspensionProvider({ ...fit, suspension: block }, match)).toEqual([{ code: 'suspended', severity: 'hard', match: 1, total: 2 }]);
  });

  it('a period gives the day it ends', () => {
    expect(suspensionProvider({ ...fit, suspension: { match: 1, total: 1, until: '2026-11-20' } }, match)).toEqual([
      { code: 'suspended', severity: 'hard', match: 1, total: 1, until: '2026-11-20' },
    ]);
  });

  it.each([EventType.TRAINING, EventType.OTHER])('a suspended player stays callable for a %s', (eventType) => {
    expect(evaluate({ ...fit, suspension: block }, { ...ctx, eventType })).toEqual([]);
  });

  it('nobody can call up a suspended player for a match, a confirmation does not change it', () => {
    const reasons = evaluate({ ...fit, suspension: block }, match);
    expect(canCallUp(reasons, false)).toBe('NOT_CALLABLE');
    expect(canCallUp(reasons, true)).toBe('NOT_CALLABLE');
  });

  it('a suspended player goes to the not callable list of the match', () => {
    const row = { enrollmentId: 'a', calledUp: false, reasons: evaluate({ ...fit, suspension: block }, match) };
    expect(partition([row]).notCallable).toHaveLength(1);
  });
});
