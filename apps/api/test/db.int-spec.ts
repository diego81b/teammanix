import { MikroORM } from '@mikro-orm/postgresql';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { SportProfile } from '../src/entities/sport-profile.entity';
import { SPORT_PROFILES, seedSportProfiles } from '../src/seed/sport-profiles';

describe('database: migrations and seed', () => {
  let pg: StartedPostgreSqlContainer;
  let orm: MikroORM;

  beforeAll(async () => {
    pg = await new PostgreSqlContainer('postgres:16-alpine').start();
    process.env.NODE_ENV = 'test';
    const { default: config } = await import('../src/mikro-orm.config');
    orm = await MikroORM.init({ ...config, clientUrl: pg.getConnectionUri(), debug: false });
  });
  afterAll(async () => {
    await orm?.close();
    await pg?.stop();
  });

  it('migrations on an empty DB produce exactly the entity schema', async () => {
    await orm.migrator.up();
    expect(await orm.schema.getUpdateSchemaSQL()).toBe('');
  });
  it('the sport profiles seed is idempotent and realigns the values', async () => {
    await seedSportProfiles(orm.em.fork());
    const before = await orm.em.fork().findOneOrFail(SportProfile, { code: 'football' });
    await orm.em.fork().nativeUpdate(SportProfile, { code: 'football' }, { positions: [], maxStarters: 99 });
    await seedSportProfiles(orm.em.fork());

    const em = orm.em.fork();
    expect(await em.count(SportProfile)).toBe(SPORT_PROFILES.length);
    const after = await em.findOneOrFail(SportProfile, { code: 'football' });
    expect(after).toMatchObject({ id: before.id, positions: ['goalkeeper', 'defender', 'midfielder', 'forward'], maxStarters: 11, starterBench: true });
    expect(after.createdAt.getTime()).toBe(before.createdAt.getTime());
    expect((await em.findOneOrFail(SportProfile, { code: 'fencing' })).starterBench).toBe(false);
  });
});
