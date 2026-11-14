import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { resetData } from '../src/dev/reset-data';
import { AccessRole } from '../src/entities/access-role.entity';
import { AuditLog } from '../src/entities/audit-log.entity';
import { Club } from '../src/entities/club.entity';
import { Document } from '../src/entities/document.entity';
import { Membership } from '../src/entities/membership.entity';
import { Person } from '../src/entities/person.entity';
import { SportProfile } from '../src/entities/sport-profile.entity';
import { User } from '../src/entities/user.entity';
import { DocumentCategory } from '../src/entities/enums';
import { StorageService } from '../src/storage/storage.service';
import { Environment, startEnvironment } from './helpers';

describe('dev data reset', () => {
  let t: Environment;
  beforeAll(async () => {
    t = await startEnvironment();
    const em = t.orm.em.fork();
    em.create(SportProfile, { code: 'football', positions: ['goalkeeper'], modulesAvailable: ['attendances'] } as never);
    await em.flush();
  });
  afterAll(async () => {
    await t?.close();
  });

  async function club(email: string, name: string) {
    const s = await t.newUser(email);
    const c = await t.req('POST', '/club', { token: s.accessToken, body: { name, acceptDpa: true } });
    expect(c.status).toBe(201);
    return { userId: s.user.id as string, clubId: c.body.activeClub.id as string, token: c.body.accessToken as string };
  }

  it('keeps one account without memberships, drops every club with its data and the other accounts, leaves the sport profiles', async () => {
    const keep = await club('keep@test.it', 'Club of the kept account');
    const other = await club('other@test.it', 'Another club');

    // The kept account also administers the other club: after the reset it has no role anywhere.
    const em0 = t.orm.em.fork();
    em0.create(AccessRole, { club: other.clubId, user: keep.userId, role: 'admin', scope: 'club' } as never);
    await em0.flush();

    // A person with a stored file in each club: the file leaves the storage with the club.
    const storage = t.app.get(StorageService);
    for (const c of [keep, other]) {
      const person = await t.req('POST', '/people', { token: c.token, body: { name: 'Anna', surname: 'Rossi', birthDate: '1990-01-01', email: `anna-${c.userId}@test.it` } });
      expect(person.status).toBe(201);
      const key = await storage.save(c.clubId, Buffer.from('file'));
      const em = t.orm.em.fork();
      em.create(Document, {
        club: c.clubId,
        person: person.body.id,
        category: DocumentCategory.CERTIFICATE_MEDICAL,
        mime: 'application/pdf',
        size: 4,
        storageKey: key,
      } as never);
      await em.flush();
    }
    expect((await readdir(t.storageDir)).sort()).toEqual([keep.clubId, other.clubId].sort());

    const em = t.orm.em.fork();
    expect(await em.count(AuditLog, {})).toBeGreaterThan(0);

    const result = await resetData(em, storage, 'KEEP@test.it');
    expect(result).toEqual({ clubs: 2, users: 1, files: 2 });

    const check = t.orm.em.fork();
    const users = await check.find(User, {});
    expect(users.map((u) => u.email)).toEqual(['keep@test.it']);
    expect(await check.count(Club, {})).toBe(0);
    expect(await check.count(Membership, {}, { filters: false })).toBe(0);
    expect(await check.count(AccessRole, {}, { filters: false })).toBe(0);
    expect(await check.count(Person, {}, { filters: false })).toBe(0);
    expect(await check.count(Document, {}, { filters: false })).toBe(0);
    expect(await check.count(AuditLog, {})).toBe(0);
    expect(await check.count(SportProfile, {})).toBe(1);
    // The folders stay (the driver removes files only), the files are gone.
    for (const c of [keep, other]) await expect(readdir(join(t.storageDir, c.clubId))).resolves.toEqual([]);

    // The kept account still logs in and has nothing to enter.
    const login = await t.req('POST', '/auth/login', { body: { email: 'keep@test.it', password: 'password-long-123' } });
    expect(login.status).toBe(200);
    const me = await t.req('GET', '/auth/me', { token: login.body.accessToken });
    expect(me.status).toBe(200);
    expect(me.body.memberships ?? []).toEqual([]);
  });

  it('fails without touching anything when the account to keep does not exist', async () => {
    const a = await club('survivor@test.it', 'Survivor club');
    const em = t.orm.em.fork();
    await expect(resetData(em, t.app.get(StorageService), 'ghost@test.it')).rejects.toThrow('ghost@test.it');
    const check = t.orm.em.fork();
    expect(await check.count(Club, { id: a.clubId })).toBe(1);
    expect(await check.count(User, { id: a.userId })).toBe(1);
  });
});
