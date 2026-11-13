import type { EntityManager } from '@mikro-orm/postgresql';
import { AccessRole } from '../entities/access-role.entity';
import { Membership } from '../entities/membership.entity';
import { NotificationPreference } from '../entities/notification-preference.entity';
import type { Person } from '../entities/person.entity';

/** Removes an account from a club inside the caller's transaction; the caller checks the last admin. Returns the roles removed. */
export async function detachAccount(tem: EntityManager, userId: string, clubId: string, person: Person | null): Promise<number> {
  if (person) person.user = null;
  const roles = await tem.find(AccessRole, { club: clubId, user: userId }, { filters: false });
  for (const r of roles) tem.remove(r);
  await tem.nativeDelete(NotificationPreference, { user: userId, club: clubId });
  await tem.nativeDelete(Membership, { user: userId, club: clubId }, { filters: false });
  return roles.length;
}
