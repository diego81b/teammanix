import 'reflect-metadata';
import { MikroORM } from '@mikro-orm/postgresql';
import config from '../mikro-orm.config';
import { seedSportProfiles } from './sport-profiles';

async function main() {
  const orm = await MikroORM.init({ ...config, debug: false });
  try {
    await seedSportProfiles(orm.em.fork());
    console.log('Sport profiles seed completed');
  } finally {
    await orm.close();
  }
}

void main();
