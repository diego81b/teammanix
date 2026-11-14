import type { EntityManager } from '@mikro-orm/core';
import { AuditLog } from '../entities/audit-log.entity';
import { Club } from '../entities/club.entity';
import { Document } from '../entities/document.entity';
import { User } from '../entities/user.entity';
import type { StorageService } from '../storage/storage.service';

export interface ResetResult {
  clubs: number;
  users: number;
  files: number;
}

/** Development only: the command wipes data, so it never runs where real data may live. */
export function assertNotProduction(nodeEnv: string | undefined): void {
  if (nodeEnv === 'production') throw new Error('The data reset is a development command: refused with NODE_ENV=production');
}

/** The address after `--keep`, lowercased. Without it the command does not run: there is always an account to keep. */
export function parseKeepEmail(args: string[]): string {
  const i = args.indexOf('--keep');
  const value = i >= 0 ? args[i + 1] : undefined;
  if (!value || value.startsWith('--') || !value.includes('@')) throw new Error('Usage: --keep <email of the account to keep>');
  return value.toLowerCase();
}

/**
 * Deletes every club with all its data (the tenant tables follow by cascade), every account except the one
 * to keep, the audit log and the stored files of the deleted documents. The kept account stays without
 * memberships or roles. Sport profiles and other seed data are untouched. Files go after the commit, so a
 * failed delete does not lose them.
 */
export async function resetData(em: EntityManager, storage: StorageService, keepEmail: string): Promise<ResetResult> {
  const keep = await em.findOne(User, { email: keepEmail.toLowerCase() });
  if (!keep) throw new Error(`No account with email ${keepEmail}: nothing was deleted`);

  const documents = await em.find(Document, {}, { filters: false });
  const keys = documents.map((d) => d.storageKey);

  const counts = await em.transactional(async (tem) => {
    const clubs = await tem.nativeDelete(Club, {});
    const users = await tem.nativeDelete(User, { id: { $ne: keep.id } });
    await tem.nativeDelete(AuditLog, {});
    return { clubs, users };
  });

  for (const key of keys) await storage.remove(key);
  return { ...counts, files: keys.length };
}
