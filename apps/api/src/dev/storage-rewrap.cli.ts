import { appConfig } from '../config/app.config';
import { StorageFileSystem } from '../storage/storage-filesystem';
import { StorageS3 } from '../storage/storage-s3';
import { rewrapAll } from '../storage/storage.service';

/**
 * `npm run storage:rewrap -- [--dry-run] [--club <id>]`: thin shell around rewrapAll. Run after a key rotation, with the new key in
 * STORAGE_ENCRYPTION_KEY and the old one in STORAGE_ENCRYPTION_KEY_PREVIOUS. Safe to repeat.
 */
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const clubIndex = args.indexOf('--club');
  const clubId = clubIndex >= 0 ? args[clubIndex + 1] : undefined;
  const cfg = appConfig();
  const storage = cfg.s3 ? new StorageS3(cfg.s3, cfg.storageKeys) : new StorageFileSystem(cfg.storageDir, cfg.storageKeys);
  const r = await rewrapAll(storage, dryRun, clubId);
  console.log(`${dryRun ? 'Dry run: ' : ''}${r.scanned} objects scanned, ${r.rewrapped} ${dryRun ? 'would be ' : ''}rewrapped`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
