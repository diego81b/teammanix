import { CertificateAlertsService } from '../src/certificates/certificate-alerts.service';
import { NotificationType } from '../src/entities/enums';
import { Notification } from '../src/entities/notification.entity';
import { SportProfile } from '../src/entities/sport-profile.entity';
import { Environment, startEnvironment, createTeams } from './helpers';

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
/** The moment the job runs, `offset` days from now. */
const at = (offset: number) => new Date(Date.now() + offset * 86_400_000);

describe('certificate alerts job', () => {
  let t: Environment;
  let job: CertificateAlertsService;
  beforeAll(async () => {
    t = await startEnvironment();
    job = t.app.get(CertificateAlertsService);
    const em = t.orm.em.fork();
    em.create(SportProfile, { code: 'football', positions: ['goalkeeper'], starterBench: true, maxStarters: 11, modulesAvailable: ['attendances'] } as never);
    await em.flush();
  });
  afterAll(async () => {
    await t?.close();
  });

  const post = async (token: string, url: string, body: object) => {
    const r = await t.req('POST', url, { token, body });
    expect(r.status).toBe(201);
    return r.body;
  };

  /** A club with one team in an active season: a coach and a trainer with accounts, and players with or without one. */
  async function club(tag: string) {
    const s = await t.newUser(`${tag}@test.it`);
    const c = await t.req('POST', '/club', { token: s.accessToken, body: { name: `Club ${tag}`, acceptDpa: true } });
    expect(c.status).toBe(201);
    const admin = c.body.accessToken as string;
    const adminUserId = s.user.id as string;
    const struct = await createTeams(t.req, admin, { sportProfile: 'football', section: 'Sport' });
    const team = await struct.team('T1');
    const season = await post(admin, `/teams/${team.id}/seasons`, { name: 'Now', startDate: day(-60), endDate: day(400) });
    const member = async (name: string, type: 'player' | 'staff', opts: { account?: boolean; staffRole?: string } = {}) => {
      const email = `${name}-${tag}@test.it`;
      const p = await post(admin, '/people', { name, surname: 'Rossi', birthDate: '1990-01-01', email });
      await post(admin, `/seasons/${season.id}/enrollments`, { personId: p.id, type, ...(type === 'staff' ? { staffRole: opts.staffRole ?? 'coach' } : {}) });
      if (opts.account === false) return { personId: p.id as string, userId: '', token: '' };
      await post(admin, '/invitations', { email, role: type, personId: p.id });
      const u = await t.newUser(email);
      const acc = await t.req('POST', '/invitations/accept', { token: u.accessToken, body: { token: t.tokenInvitation(email) } });
      expect(acc.status).toBe(200);
      return { personId: p.id as string, userId: u.user.id as string, token: acc.body.accessToken as string };
    };
    const coach = await member('coach', 'staff');
    const trainer = await member('trainer', 'staff', { staffRole: 'trainer' });
    const anna = await member('anna', 'player');
    const bea = await member('bea', 'player');
    const carl = await member('carl', 'player', { account: false });
    expect((await t.req('POST', `/seasons/${season.id}/active`, { token: admin })).status).toBe(200);
    /** Adds a certificate that expires `expiry` days from now. */
    const certificate = (personId: string, expiry: number) => post(admin, `/people/${personId}/certificates`, { type: 'competitive', issueDate: day(Math.min(expiry, 0) - 300), expiryDate: day(expiry) });
    return { admin, adminUserId, struct, sectionId: struct.sectionId, seasonId: season.id as string, clubId: c.body.activeClub.id as string, coach, trainer, anna, bea, carl, certificate };
  }
  type Scenario = Awaited<ReturnType<typeof club>>;

  /** A second team in the same section, with a season not yet active. */
  async function secondTeam(s: Scenario, name: string) {
    const team = await s.struct.team(name);
    const season = await post(s.admin, `/teams/${team.id}/seasons`, { name: 'Now', startDate: day(-60), endDate: day(400) });
    const enroll = (personId: string, type: 'player' | 'staff') =>
      post(s.admin, `/seasons/${season.id}/enrollments`, { personId, type, ...(type === 'staff' ? { staffRole: 'coach' } : {}) });
    const activate = async () => expect((await t.req('POST', `/seasons/${season.id}/active`, { token: s.admin })).status).toBe(200);
    return { seasonId: season.id as string, enroll, activate };
  }

  const of = (userId: string, type?: NotificationType) =>
    t.orm.em.fork().find(Notification, { user: userId, ...(type ? { type } : {}) }, { filters: false, orderBy: { createdAt: 'asc' } });
  const personal = (userId: string) => t.orm.em.fork().find(Notification, { user: userId, type: { $in: [NotificationType.CERTIFICATE_EXPIRING, NotificationType.CERTIFICATE_EXPIRED] } }, { filters: false, orderBy: { createdAt: 'asc' } });

  describe('the player', () => {
    it('is told once when the certificate expires in 30 days, with the club and the date', async () => {
      const s = await club('j1');
      await s.certificate(s.anna.personId, 30);
      await job.run(at(0));
      await job.run(at(0));
      const rows = await personal(s.anna.userId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ type: NotificationType.CERTIFICATE_EXPIRING, params: { club: 'Club j1', expiry: day(30), days: 30 } });
    });

    it('is told again at 15 days, and not again on the days between', async () => {
      const s = await club('j2');
      await s.certificate(s.anna.personId, 30);
      for (const offset of [0, 1, 14, 15, 16, 20]) await job.run(at(offset));
      const rows = await personal(s.anna.userId);
      expect(rows.map((n) => n.params.days)).toEqual([30, 15]);
    });

    it('a first run already inside 15 days sends the 15 day alert only', async () => {
      const s = await club('j3');
      await s.certificate(s.anna.personId, 9);
      await job.run(at(0));
      expect((await personal(s.anna.userId)).map((n) => n.params.days)).toEqual([9]);
    });

    it('is told once when it has expired', async () => {
      const s = await club('j4');
      await s.certificate(s.anna.personId, -5);
      await job.run(at(0));
      await job.run(at(1));
      const rows = await personal(s.anna.userId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ type: NotificationType.CERTIFICATE_EXPIRED, params: { expiry: day(-5) } });
    });

    it('hears nothing about a certificate that is valid, long expired, or replaced by a later one', async () => {
      const s = await club('j5');
      await s.certificate(s.anna.personId, 200);
      await s.certificate(s.bea.personId, -60);
      await job.run(at(0));
      expect(await personal(s.anna.userId)).toEqual([]);
      expect(await personal(s.bea.userId)).toEqual([]);
      // An old certificate about to expire does not count when the person has a later one.
      await s.certificate(s.anna.personId, 10);
      await job.run(at(0));
      expect(await personal(s.anna.userId)).toEqual([]);
    });

    it('a certificate that arrives late is alerted from then on', async () => {
      const s = await club('j6');
      await job.run(at(0));
      await s.certificate(s.anna.personId, 12);
      await job.run(at(1));
      expect((await personal(s.anna.userId)).map((n) => n.params.days)).toEqual([11]);
    });

    it('a disabled person hears nothing', async () => {
      const s = await club('j7');
      await s.certificate(s.anna.personId, 20);
      expect((await t.req('POST', `/people/${s.anna.personId}/disable`, { token: s.admin })).status).toBe(200);
      await job.run(at(0));
      expect(await of(s.anna.userId)).toEqual([]);
    });

    it('a person who plays nowhere any more is not alerted', async () => {
      const s = await club('j8');
      await s.certificate(s.anna.personId, 20);
      await s.certificate(s.bea.personId, 20);
      expect((await t.req('POST', `/seasons/${s.seasonId}/close`, { token: s.admin })).status).toBe(200);
      await job.run(at(0));
      expect(await personal(s.anna.userId)).toEqual([]);
    });
  });

  describe('the staff digest', () => {
    const digest = (s: Scenario, userId: string) => of(userId, NotificationType.CERTIFICATES_DUE);

    it('goes to whoever holds the certificates permission, with counts and no names', async () => {
      const s = await club('d1');
      await s.certificate(s.anna.personId, 20);
      await s.certificate(s.bea.personId, -3);
      await s.certificate(s.carl.personId, 28); // no account: the staff still hears of it
      await job.run(at(0));
      for (const userId of [s.adminUserId, s.coach.userId]) {
        const [d, ...rest] = await digest(s, userId);
        expect(rest).toEqual([]);
        expect(d?.params).toEqual(userId === s.adminUserId ? { club: 'Club d1', expiring: 2, expired: 1 } : { club: 'Club d1', team: 'T1', expiring: 2, expired: 1 });
        // The admin keeps the people list, staff open the page of their team.
        expect(d?.link).toBe(userId === s.adminUserId ? '/people' : `/team-certificates/${s.seasonId}`);
      }
      expect(await digest(s, s.trainer.userId)).toEqual([]);
    });

    it('says nothing when nobody is due, and never reaches the players', async () => {
      const s = await club('d2');
      await s.certificate(s.anna.personId, 200);
      await job.run(at(0));
      expect(await digest(s, s.adminUserId)).toEqual([]);
      await s.certificate(s.bea.personId, 12);
      await job.run(at(0));
      expect(await digest(s, s.anna.userId)).toEqual([]);
      expect(await digest(s, s.bea.userId)).toEqual([]);
    });

    it('comes once a week while someone is due', async () => {
      const s = await club('d3');
      await s.certificate(s.anna.personId, 25);
      for (const offset of [0, 1, 2, 3, 4, 5, 6, 7, 8, 14]) await job.run(at(offset));
      const rows = await digest(s, s.adminUserId);
      expect(rows.length).toBeGreaterThanOrEqual(2);
      expect(rows.length).toBeLessThanOrEqual(4);
      const keys = rows.map((n) => n.dedupKey);
      expect(new Set(keys).size).toBe(keys.length);
    });

    describe('per team', () => {
      /** Two teams, the coach coaches both. Anna plays in both, Bea only in T1, Dora only in T2. */
      async function twoTeams(tag: string) {
        const s = await club(tag);
        const t2 = await secondTeam(s, 'T2');
        const dora = await post(s.admin, '/people', { name: 'dora', surname: 'Rossi', birthDate: '1990-01-01', email: `dora-${tag}@test.it` });
        await t2.enroll(s.coach.personId, 'staff');
        await t2.enroll(s.anna.personId, 'player');
        await t2.enroll(dora.id, 'player');
        await t2.activate();
        return { s, t2, dora: dora.id as string };
      }

      it('a coach of two teams gets one digest for each, with the count and the link of its own team', async () => {
        const { s, t2, dora } = await twoTeams('p1');
        await s.certificate(s.anna.personId, 20); // plays in both teams
        await s.certificate(s.bea.personId, -3); // T1 only
        await s.certificate(dora, 10); // T2 only
        await job.run(at(0));
        const rows = await digest(s, s.coach.userId);
        expect(rows).toHaveLength(2);
        const byLink = new Map(rows.map((n) => [n.link, n.params]));
        expect(byLink.get(`/team-certificates/${s.seasonId}`)).toEqual({ club: 'Club p1', team: 'T1', expiring: 1, expired: 1 });
        expect(byLink.get(`/team-certificates/${t2.seasonId}`)).toEqual({ club: 'Club p1', team: 'T2', expiring: 2, expired: 0 });
      });

      it('the admin keeps a single digest for the club, counting each person once', async () => {
        const { s, dora } = await twoTeams('p2');
        await s.certificate(s.anna.personId, 20);
        await s.certificate(s.bea.personId, -3);
        await s.certificate(dora, 10);
        await job.run(at(0));
        const rows = await digest(s, s.adminUserId);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ link: '/people', params: { club: 'Club p2', expiring: 2, expired: 1 } });
        expect(rows[0]?.params).not.toHaveProperty('team');
      });

      it('a team with nobody due sends nothing: the coach hears only about the team that has someone', async () => {
        const { s, t2, dora } = await twoTeams('p3');
        await s.certificate(dora, 10);
        await job.run(at(0));
        const rows = await digest(s, s.coach.userId);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ link: `/team-certificates/${t2.seasonId}`, params: { team: 'T2', expiring: 1, expired: 0 } });
      });

      it('a second run in the same week sends nothing twice, team by team', async () => {
        const { s } = await twoTeams('p4');
        await s.certificate(s.anna.personId, 20);
        await job.run(at(0));
        await job.run(at(0));
        await job.run(at(1));
        expect(await digest(s, s.coach.userId)).toHaveLength(2);
        expect(await digest(s, s.adminUserId)).toHaveLength(1);
      });

      it('the count in each notification is the number of rows of the page it opens', async () => {
        const { s, dora } = await twoTeams('p5');
        await s.certificate(s.anna.personId, 20);
        await s.certificate(s.bea.personId, -3);
        await s.certificate(dora, 10);
        await job.run(at(0));
        const rows = await digest(s, s.coach.userId);
        expect(rows).toHaveLength(2);
        for (const n of rows) {
          const page = await t.req('GET', `/seasons/${(n.link as string).split('/').pop()}/certificates-due`, { token: s.coach.token });
          expect(page.status).toBe(200);
          expect(page.body).toHaveLength(Number(n.params.expiring) + Number(n.params.expired));
        }
      });

      it('a manager granted the permission over the section gets a digest for each team with people due', async () => {
        const { s, t2, dora } = await twoTeams('p6');
        const email = 'manager-p6@test.it';
        await post(s.admin, '/invitations', { email, role: 'manager', scope: 'section', sectionId: s.sectionId });
        const u = await t.newUser(email);
        expect((await t.req('POST', '/invitations/accept', { token: u.accessToken, body: { token: t.tokenInvitation(email) } })).status).toBe(200);
        expect((await t.req('PUT', `/permissions/${u.user.id}`, { token: s.admin, body: { diff: { 'certificates.status': true } } })).status).toBe(200);
        await s.certificate(s.bea.personId, 10);
        await s.certificate(dora, 10);
        await job.run(at(0));
        const rows = await of(u.user.id as string, NotificationType.CERTIFICATES_DUE);
        expect(rows.map((n) => n.link).sort()).toEqual([`/team-certificates/${s.seasonId}`, `/team-certificates/${t2.seasonId}`].sort());
      });
    });

    it('does not count a disabled person', async () => {
      const s = await club('d4');
      await s.certificate(s.anna.personId, 20);
      await s.certificate(s.bea.personId, 20);
      await t.req('POST', `/people/${s.anna.personId}/disable`, { token: s.admin });
      await job.run(at(0));
      expect((await digest(s, s.adminUserId))[0]?.params).toMatchObject({ expiring: 1 });
    });
  });

  describe('clubs and failures', () => {
    it('each club is told about its own people only', async () => {
      const a = await club('k1');
      const b = await club('k2');
      await a.certificate(a.anna.personId, 20);
      await job.run(at(0));
      expect(await of(b.adminUserId)).toEqual([]);
      expect((await of(a.adminUserId, NotificationType.CERTIFICATES_DUE))[0]?.params).toMatchObject({ club: 'Club k1', expiring: 1 });
    });

    it('a run that fails in one club still serves the others', async () => {
      const a = await club('k3');
      const b = await club('k4');
      await a.certificate(a.anna.personId, 20);
      await b.certificate(b.anna.personId, 20);
      const original = job.processClub.bind(job);
      const spy = jest.spyOn(job, 'processClub').mockImplementation(async (clubId, today) => {
        if (clubId === a.clubId) throw new Error('boom');
        return original(clubId, today);
      });
      await expect(job.run(at(0))).resolves.toBeUndefined();
      spy.mockRestore();
      expect(await personal(a.anna.userId)).toEqual([]);
      expect(await personal(b.anna.userId)).toHaveLength(1);
    });
  });
});
