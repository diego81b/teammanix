import 'reflect-metadata';
import { MikroORM } from '@mikro-orm/postgresql';
import config from '../mikro-orm.config';
import { appConfig } from '../config/app.config';
import { StorageFileSystem } from '../storage/storage-filesystem';
import { StorageS3 } from '../storage/storage-s3';
import { assertNotProduction, parseKeepEmail, resetData } from './reset-data';

/** `npm run dev:reset-data -- --keep <email>`: thin shell around resetData. */
async function main() {
  assertNotProduction(process.env.NODE_ENV);
  const keep = parseKeepEmail(process.argv.slice(2));
  const cfg = appConfig();
  const storage = cfg.s3 ? new StorageS3(cfg.s3, cfg.storageKey) : new StorageFileSystem(cfg.storageDir, cfg.storageKey);
  const orm = await MikroORM.init({ ...config, debug: false });
  try {
    const r = await resetData(orm.em.fork(), storage, keep);
    console.log(`Reset done, kept ${keep}: ${r.clubs} clubs, ${r.users} accounts and ${r.files} files deleted`);
  } finally {
    await orm.close();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
