import { EntityManager } from '@mikro-orm/postgresql';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { AuthContext } from '../common/auth-context';
import { Enrollment } from '../entities/enrollment.entity';
import { Event } from '../entities/event.entity';
import { canPlanEvents, editableEvent } from '../events/event.rules';
import { AuthorizationsService } from '../permissions/authorizations.service';
import { viewOf, type CallupView } from './callup.rules';

export const loadEvent = (em: EntityManager, id: string): Promise<Event> =>
  em.findOneOrFail(Event, { id }, { populate: ['season.team.activity.sportProfile', 'venue', 'opponent'] });

/** The event can still be changed: scheduled or postponed, in the active season. */
export async function openEvent(em: EntityManager, id: string): Promise<Event> {
  const event = await loadEvent(em, id);
  if (!canPlanEvents(event.season.status)) throw new ConflictException({ message: 'The season is closed', code: 'SEASON_CLOSED' });
  if (!editableEvent(event.status)) throw new ConflictException({ message: 'The event can no longer be edited', code: 'EVENT_NOT_EDITABLE' });
  return event;
}

export const permissionDenied = () => new ForbiddenException({ message: 'You do not have permission for this operation', code: 'PERMISSION_DENIED' });

/** What the person sees of the event's call-up, and their own enrollments in the season of the event. */
export async function viewFor(
  em: EntityManager,
  authz: AuthorizationsService,
  a: AuthContext,
  event: Event,
  target: { activityId: string | null; teamId: string | null },
): Promise<{ view: CallupView; own: Pick<Enrollment, 'id' | 'type'>[] }> {
  const own = a.personId ? await em.find(Enrollment, { person: a.personId, season: event.season.id }, { filters: false, fields: ['type'] }) : [];
  const view = viewOf({
    roles: a.roles,
    enrollments: own.map((e) => ({ type: e.type })),
    canManage: await authz.can(a, 'callups.manage', { eventId: event.id }),
    season: { id: event.season.id, activityId: target.activityId as string, teamId: target.teamId as string },
  });
  return { view, own };
}
