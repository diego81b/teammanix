import 'reflect-metadata';
import { MikroORM } from '@mikro-orm/postgresql';
import config from './mikro-orm.config';
import { seedSportProfiles } from './seed/sport-profiles';

/** Applies pending migrations and the idempotent seed. Used by the production image, without ts-node. */
async function main() {
  const orm = await MikroORM.init({ ...config, debug: false });
  try {
    await orm.migrator.up();
    await seedSportProfiles(orm.em.fork());
    console.log('Migrations and seed completed');
  } finally {
    await orm.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
