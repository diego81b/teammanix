import { EntityManager } from '@mikro-orm/postgresql';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { AuthService, SessionDto } from '../auth/auth.service';
import type { AuthContext } from '../common/auth-context';
import { appConfig, INVITATION_DAYS } from '../config/app.config';
import { Activity } from '../entities/activity.entity';
import { AuditAction, Language, AccessRoleType, InvitationRole, InvitationStatus, ScopeType } from '../entities/enums';
import { Invitation } from '../entities/invitation.entity';
import { Person } from '../entities/person.entity';
import { AccessRole } from '../entities/access-role.entity';
import { Club } from '../entities/club.entity';
import { Team } from '../entities/team.entity';
import { User } from '../entities/user.entity';
import { MailService } from '../mail/mail.service';
import { TEXTS_MAIL } from '../mail/texts';
import type { CreateInvitationDto } from './dto';

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

/** Identical for nonexistent token, different email, revoked, expired or already accepted: reveals nothing. */
const invitationNotValid = () => new NotFoundException({ message: 'Invalid invitation', code: 'INVALID_INVITATION' });

export interface InvitationDto {
  id: string;
  email: string;
  role: InvitationRole;
  scope: ScopeType;
  activityId: string | null;
  teamId: string | null;
  personId: string | null;
  status: InvitationStatus;
  language: Language;
  expiresAt: Date;
}

export interface PreviewInvitation {
  club: string;
  role: InvitationRole;
  scope: ScopeType;
  /** Language chosen by the inviter: the invitation page opens in this one for anyone with no preference yet. */
  language: Language;
  /** Name of the activity or team, if the invitation has that scope. */
  destination: string | null;
  /** Staff and player: name of the record the account will be linked to. */
  recordName: string | null;
}

@Injectable()
export class InvitationsService {
  constructor(
    private readonly em: EntityManager,
    private readonly auth: AuthService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
  ) {}

  /**
   * The response and the email are identical regardless of whether the address already has an account:
   * the club must not be able to find out.
   */
  async create(a: AuthContext, dto: CreateInvitationDto): Promise<InvitationDto> {
    const clubId = a.clubId as string;
    const language = dto.language ?? (await this.em.findOneOrFail(User, a.userId)).language;
    const scope = dto.role === InvitationRole.ADMIN ? ScopeType.CLUB : (dto.scope ?? ScopeType.CLUB);
    if (dto.role === InvitationRole.ADMIN && dto.scope && dto.scope !== ScopeType.CLUB) {
      throw new BadRequestException({ message: 'An admin always has club scope', code: 'SCOPE_ADMIN_CLUB' });
    }
    const unrelated =
      scope === ScopeType.CLUB ? [dto.activityId, dto.teamId] : scope === ScopeType.ACTIVITY ? [dto.teamId] : [dto.activityId];
    if (unrelated.some(Boolean)) throw new BadRequestException({ message: 'Scope and destination are inconsistent', code: 'SCOPE_INCONSISTENT' });
    if (scope === ScopeType.ACTIVITY && !dto.activityId) throw new BadRequestException({ message: 'activityId is required for activity scope', code: 'ACTIVITY_REQUIRED' });
    if (scope === ScopeType.TEAM && !dto.teamId) throw new BadRequestException({ message: 'teamId is required for team scope', code: 'TEAM_REQUIRED' });

    const staffOrPlayer = dto.role === InvitationRole.STAFF || dto.role === InvitationRole.PLAYER;
    if (staffOrPlayer && !dto.personId === !dto.name) {
      throw new BadRequestException({ message: 'For staff and players provide either personId (existing record) or name (new record)', code: 'RECORD_REQUIRED' });
    }
    if (!staffOrPlayer && (dto.personId || dto.name)) throw new BadRequestException({ message: 'personId and name apply only to staff and players', code: 'RECORD_NOT_ALLOWED' });

    // Reads go through the tenant filter: the id of another club is not found.
    const activity = scope === ScopeType.ACTIVITY ? await this.em.findOne(Activity, dto.activityId as string) : null;
    const team = scope === ScopeType.TEAM ? await this.em.findOne(Team, dto.teamId as string) : null;
    if ((scope === ScopeType.ACTIVITY && !activity) || (scope === ScopeType.TEAM && !team)) {
      throw new BadRequestException({ message: 'Activity or team not found', code: 'DESTINATION_NOT_FOUND' });
    }
    const person = dto.personId ? await this.em.findOne(Person, dto.personId) : null;
    if (dto.personId && (!person || person.user)) {
      throw new BadRequestException({ message: 'Person not found or already linked to an account', code: 'PERSON_NOT_AVAILABLE' });
    }
    if (person?.disabledAt) {
      throw new ConflictException({ message: 'The person is disabled: re-enable them before inviting', code: 'PERSON_DISABLED' });
    }

    const token = randomBytes(32).toString('base64url');
    const invitation = await this.em.transactional(async (tem) => {
      // A new invitation replaces the one still open for the same email, role and destination.
      const open = await tem.find(Invitation, { email: dto.email, role: dto.role, scope, status: InvitationStatus.SENT });
      for (const v of open) {
        const same =
          (v.activity?.id ?? null) === (activity?.id ?? null) &&
          (v.team?.id ?? null) === (team?.id ?? null) &&
          (v.person?.id ?? null) === (person?.id ?? null);
        if (same) v.status = InvitationStatus.REVOKED;
      }
      // New record with only the minimum data. A record with the same email is not reused: siblings with the parent's email.
      const fresh = dto.name
        ? tem.create(Person, { club: tem.getReference(Club, clubId), name: dto.name, email: dto.email })
        : null;
      return tem.create(Invitation, {
        club: tem.getReference(Club, clubId),
        email: dto.email,
        role: dto.role,
        scope,
        activity: activity ? tem.getReference(Activity, activity.id) : null,
        team: team ? tem.getReference(Team, team.id) : null,
        person: fresh ?? (person ? tem.getReference(Person, person.id) : null),
        tokenHash: hash(token),
        expiresAt: new Date(Date.now() + INVITATION_DAYS * 86_400_000),
        invitedBy: tem.getReference(User, a.userId),
        language,
      });
    });
    await this.audit.register({ action: AuditAction.INVITATION_CREATED, userId: a.userId, clubId, entity: 'Invitation', entityId: invitation.id });

    await this.sendMail(invitation, clubId, token);
    return this.dto(invitation);
  }

  /**
   * New link and new expiry for a still open invitation (even expired). The old link stops working
   * because the token hash changes.
   */
  async resend(a: AuthContext, id: string): Promise<InvitationDto> {
    const invitation = await this.em.findOne(Invitation, { id, status: InvitationStatus.SENT }, { populate: ['person'] });
    if (!invitation) throw new NotFoundException({ message: 'Invitation not found', code: 'INVITATION_NOT_FOUND' });
    if (invitation.person?.disabledAt) {
      throw new ConflictException({ message: 'The person is disabled: re-enable them before inviting', code: 'PERSON_DISABLED' });
    }
    const token = randomBytes(32).toString('base64url');
    invitation.tokenHash = hash(token);
    invitation.expiresAt = new Date(Date.now() + INVITATION_DAYS * 86_400_000);
    await this.em.flush();
    await this.audit.register({ action: AuditAction.INVITATION_RESENT, userId: a.userId, clubId: a.clubId, entity: 'Invitation', entityId: id });
    await this.sendMail(invitation, a.clubId as string, token);
    return this.dto(invitation);
  }

  private async sendMail(invitation: Invitation, clubId: string, token: string): Promise<void> {
    const club = await this.em.findOneOrFail(Club, clubId);
    await this.mail.send({
      to: invitation.email,
      ...TEXTS_MAIL.invitation[invitation.language]({ club: club.name, days: INVITATION_DAYS, link: `${appConfig().appUrl}/invitation?token=${token}` }),
    });
  }

  async preview(token: string): Promise<PreviewInvitation> {
    const invitation = await this.em.findOne(
      Invitation,
      { tokenHash: hash(token) },
      { filters: false, populate: ['club', 'activity', 'team', 'person'] },
    );
    if (!invitation || invitation.status !== InvitationStatus.SENT || invitation.expiresAt.getTime() < Date.now()) throw invitationNotValid();
    return {
      club: invitation.club.name,
      role: invitation.role,
      scope: invitation.scope,
      language: invitation.language,
      destination: invitation.team?.name ?? invitation.activity?.name ?? null,
      recordName: invitation.person?.name ?? null,
    };
  }

  async list(): Promise<InvitationDto[]> {
    const invitations = await this.em.find(Invitation, {}, { orderBy: { createdAt: 'desc' }, limit: 200 });
    return invitations.map((i) => this.dto(i));
  }

  async revoke(a: AuthContext, id: string): Promise<void> {
    const invitation = await this.em.findOne(Invitation, { id, status: InvitationStatus.SENT });
    if (!invitation) throw new NotFoundException({ message: 'Invitation not found', code: 'INVITATION_NOT_FOUND' });
    invitation.status = InvitationStatus.REVOKED;
    await this.em.flush();
    await this.audit.register({
      action: AuditAction.INVITATION_REVOKED,
      userId: a.userId,
      clubId: a.clubId,
      entity: 'Invitation',
      entityId: id,
    });
  }

  /**
   * Whoever accepts is already authenticated with a verified email: whether the account is new or existing changes nothing.
   * The invitation email must match the account's, otherwise a forwarded link would grant access.
   */
  async accept(userId: string, token: string): Promise<SessionDto> {
    const user = await this.em.findOneOrFail(User, userId);
    const clubId = await this.em.transactional(async (tem) => {
      const invitation = await tem.findOne(
        Invitation,
        { tokenHash: hash(token) },
        { filters: false, populate: ['club', 'activity', 'team', 'person'] },
      );
      if (!invitation || invitation.status !== InvitationStatus.SENT || invitation.expiresAt.getTime() < Date.now() || invitation.email !== user.email) {
        throw invitationNotValid();
      }
      const sid = invitation.club.id;

      if (invitation.role === InvitationRole.ADMIN || invitation.role === InvitationRole.MANAGER) {
        const type = invitation.role === InvitationRole.ADMIN ? AccessRoleType.ADMIN : AccessRoleType.MANAGER;
        const exists = await tem.findOne(
          AccessRole,
          {
            club: sid,
            user: userId,
            role: type,
            scope: invitation.scope,
            activity: invitation.activity?.id ?? null,
            team: invitation.team?.id ?? null,
          },
          { filters: false },
        );
        if (!exists) {
          tem.create(AccessRole, {
            club: invitation.club,
            user,
            role: type,
            scope: invitation.scope,
            activity: invitation.activity,
            team: invitation.team,
          });
        }
      } else {
        const person = invitation.person;
        if (!person || person.disabledAt || (person.user && person.user.id !== userId)) throw invitationNotValid();
        const other = await tem.findOne(Person, { club: sid, user: userId }, { filters: false });
        if (other && other.id !== person.id) {
          throw new ConflictException({ message: 'Your account is already linked to another record in this club', code: 'ACCOUNT_ALREADY_LINKED' });
        }
        person.user = user;
      }

      invitation.status = InvitationStatus.ACCEPTED;
      invitation.acceptedBy = user;
      return sid;
    });
    await this.audit.register({ action: AuditAction.INVITATION_ACCEPTED, userId, clubId });
    return this.auth.session(user, clubId);
  }

  private dto(i: Invitation): InvitationDto {
    return {
      id: i.id,
      email: i.email,
      role: i.role,
      scope: i.scope,
      activityId: i.activity?.id ?? null,
      teamId: i.team?.id ?? null,
      personId: i.person?.id ?? null,
      status: i.status,
      language: i.language,
      expiresAt: i.expiresAt,
    };
  }
}
