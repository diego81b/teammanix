import { EntityManager } from '@mikro-orm/postgresql';
import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuditService } from '../audit/audit.service';
import { appConfig, DOCUMENTS_VERSION } from '../config/app.config';
import { TermsAcceptance } from '../entities/terms-acceptance.entity';
import { AuditAction, Language, TypeLegalDocument } from '../entities/enums';
import { User } from '../entities/user.entity';
import { MailService } from '../mail/mail.service';
import { TEXTS_MAIL } from '../mail/texts';
import { Membership, MembershipsService } from './memberships.service';
import type { ChangePasswordDto, LoginDto, RegistrationDto, ResetPasswordDto } from './dto';
import { TokenService } from './token.service';

export interface SessionDto {
  accessToken: string;
  user: { id: string; email: string; name: string; surname: string; language: Language };
  /** Club the token is bound to. null = to be chosen (several clubs) or to be created (none). */
  activeClub: { id: string; name: string } | null;
  memberships: Membership[];
}

const MESSAGE_NEUTRAL = 'If the data is correct you will receive an email shortly.';

@Injectable()
export class AuthService {
  /** Comparison hash to equalize timing when the email does not exist. */
  private readonly hashFake = argon2.hash('fake-password-for-uniform-timing');

  constructor(
    private readonly em: EntityManager,
    private readonly tokens: TokenService,
    private readonly memberships: MembershipsService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Always answers the same way, even if the email already exists: nobody can find out who has an account.
   * If it exists and is active, the only effect is an email to the owner.
   * If it exists but was never verified, the new registration overwrites it and resends the verification:
   * it has no data or sessions, and without the link in the inbox it does not activate. Previous links stop working
   * because the verification token is bound to the password hash.
   */
  async register(dto: RegistrationDto): Promise<{ message: string }> {
    const hash = await argon2.hash(dto.password);
    const existing = await this.em.findOne(User, { email: dto.email });
    if (existing && (existing.emailVerifiedAt || existing.deactivatedAt)) {
      // The language is the one of the request, not the stored one: whoever writes now reads it.
      await this.mail.send({
        to: existing.email,
        ...TEXTS_MAIL.alreadyRegistered[dto.language ?? existing.language]({ link: `${appConfig().appUrl}/login` }),
      });
      return { message: MESSAGE_NEUTRAL };
    }

    const user = await this.em.transactional(async (tem) => {
      const data = { passwordHash: hash, name: dto.name, surname: dto.surname, language: dto.language ?? Language.IT };
      const u = existing ? tem.assign(await tem.findOneOrFail(User, existing.id), data) : tem.create(User, { email: dto.email, ...data });
      for (const type of [TypeLegalDocument.TERMS, TypeLegalDocument.PRIVACY]) {
        tem.create(TermsAcceptance, { user: u, type, version: DOCUMENTS_VERSION });
      }
      return u;
    });
    await this.audit.register({ action: AuditAction.REGISTRATION, userId: user.id });
    await this.sendVerify(user);
    return { message: MESSAGE_NEUTRAL };
  }

  async verifyEmail(token: string): Promise<{ message: string }> {
    const id = this.tokens.idFromTokenVerify(token);
    const found = id ? await this.em.findOne(User, id) : null;
    const user = found && (await this.tokens.readEmailVerify(token, found.passwordHash)) ? found : null;
    if (!user) throw new BadRequestException({ message: 'Invalid or expired link', code: 'INVALID_LINK' });
    if (!user.emailVerifiedAt) {
      user.emailVerifiedAt = new Date();
      await this.em.flush();
    }
    return { message: 'Email verified' };
  }

  async resendVerify(email: string): Promise<{ message: string }> {
    const user = await this.em.findOne(User, { email });
    if (user && !user.emailVerifiedAt && !user.deactivatedAt) await this.sendVerify(user);
    return { message: MESSAGE_NEUTRAL };
  }

  async login(dto: LoginDto): Promise<SessionDto> {
    const user = await this.em.findOne(User, { email: dto.email });
    const ok = await argon2.verify(user?.passwordHash ?? (await this.hashFake), dto.password).catch(() => false);
    if (!user || !ok || user.deactivatedAt) {
      await this.audit.register({ action: AuditAction.LOGIN_KO, userId: user?.id });
      throw new UnauthorizedException({ message: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
    }
    if (!user.emailVerifiedAt) {
      throw new ForbiddenException({ message: 'Verify your email before signing in', code: 'EMAIL_NOT_VERIFIED' });
    }
    user.lastAccessAt = new Date();
    await this.em.flush();
    await this.audit.register({ action: AuditAction.LOGIN_OK, userId: user.id });

    // A single club: sign in directly. None or more than one: the client shows the choice or the creation.
    const app = await this.memberships.list(user.id);
    return this.session(user, app.length === 1 ? (app[0]?.clubId ?? null) : null, app);
  }

  /** New token for the chosen club, if the account belongs to it. */
  async select(userId: string, clubId: string): Promise<SessionDto> {
    const app = await this.memberships.list(userId);
    if (!app.some((a) => a.clubId === clubId)) throw new ForbiddenException({ message: 'You do not belong to this club', code: 'NOT_CLUB_MEMBER' });
    return this.session(await this.em.findOneOrFail(User, userId), clubId, app);
  }

  /** Current account state, without issuing a new token. */
  async me(userId: string, clubId: string | null) {
    const user = await this.em.findOneOrFail(User, userId);
    const app = await this.memberships.list(userId);
    return {
      user: this.userDto(user),
      activeClub: app.find((a) => a.clubId === clubId) ?? null,
      memberships: app,
    };
  }

  /** Issues the session for an account and a club (possibly null). Also used by club creation, invitations and detachment. */
  async session(user: User, clubId: string | null, memberships?: Membership[]): Promise<SessionDto> {
    const app = memberships ?? (await this.memberships.list(user.id));
    const active = app.find((a) => a.clubId === clubId);
    return {
      accessToken: await this.tokens.access(user.id, active?.clubId ?? null, user.tokenValidFrom?.getTime() ?? 0),
      user: this.userDto(user),
      activeClub: active ? { id: active.clubId, name: active.name } : null,
      memberships: app,
    };
  }

  async changeLanguage(userId: string, language: Language): Promise<{ language: Language }> {
    const user = await this.em.findOneOrFail(User, userId);
    user.language = language;
    await this.em.flush();
    return { language };
  }

  async passwordForgotten(email: string): Promise<{ message: string }> {
    const user = await this.em.findOne(User, { email });
    if (user && !user.deactivatedAt) {
      const token = await this.tokens.reset(user.id, user.passwordHash);
      await this.mail.send({
        to: user.email,
        ...TEXTS_MAIL.resetPassword[user.language]({ link: `${appConfig().appUrl}/reset-password?token=${token}` }),
      });
    }
    return { message: MESSAGE_NEUTRAL };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const id = this.tokens.idFromTokenReset(dto.token);
    const user = id ? await this.em.findOne(User, id) : null;
    if (!user || !(await this.tokens.readReset(dto.token, user.passwordHash))) {
      throw new BadRequestException({ message: 'Invalid or expired link', code: 'INVALID_LINK' });
    }
    await this.setPassword(user, dto.password);
    return { message: 'Password updated' };
  }

  async changePassword(userId: string, clubId: string | null, dto: ChangePasswordDto): Promise<SessionDto> {
    const user = await this.em.findOneOrFail(User, userId);
    if (!(await argon2.verify(user.passwordHash, dto.currentPassword).catch(() => false))) {
      throw new UnauthorizedException({ message: 'Current password is wrong', code: 'PASSWORD_CURRENT_WRONG' });
    }
    await this.setPassword(user, dto.newPassword);
    // The account's other tokens are now invalid: immediately return a valid token to whoever changed the password.
    return this.session(user, clubId);
  }

  private async setPassword(user: User, password: string): Promise<void> {
    user.passwordHash = await argon2.hash(password);
    user.tokenValidFrom = new Date();
    await this.em.flush();
  }

  private async sendVerify(user: User): Promise<void> {
    const token = await this.tokens.emailVerify(user.id, user.passwordHash);
    await this.mail.send({
      to: user.email,
      ...TEXTS_MAIL.verifyEmail[user.language]({ name: user.name, link: `${appConfig().appUrl}/verify-email?token=${token}` }),
    });
  }

  private userDto(u: User) {
    return { id: u.id, email: u.email, name: u.name, surname: u.surname, language: u.language };
  }
}
