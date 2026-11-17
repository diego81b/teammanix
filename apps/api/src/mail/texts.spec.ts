import { InvitationRole, Language } from '../entities/enums';
import { TEXTS_MAIL } from './texts';

const LINK = 'https://app.test/x?token=abc123';
const cases = {
  verifyEmail: { name: 'Awa', link: LINK },
  alreadyRegistered: { link: LINK },
  resetPassword: { link: LINK },
  invitation: { club: 'ASD Dakar', days: 7, link: LINK, destination: 'Under 14', role: InvitationRole.PLAYER },
} as const;

describe('TEXTS_MAIL', () => {
  for (const [type, params] of Object.entries(cases)) {
    describe(type, () => {
      for (const language of Object.values(Language)) {
        it(`${language}: subject and text filled in, link present, no unresolved placeholder`, () => {
          const fn = (TEXTS_MAIL as any)[type][language] as (p: unknown) => { subject: string; text: string };
          const { subject, text } = fn(params);
          expect(subject.trim()).not.toBe('');
          expect(text).toContain(LINK);
          expect(subject + text).not.toMatch(/undefined|\[object|\$\{/);
        });
      }
    });
  }

  it('every type has all languages', () => {
    for (const type of Object.keys(cases)) {
      expect(Object.keys((TEXTS_MAIL as any)[type]).sort()).toEqual(Object.values(Language).sort());
    }
  });

  it('languages produce different texts', () => {
    const t = (l: Language) => TEXTS_MAIL.resetPassword[l]({ link: LINK }).text;
    expect(new Set([t(Language.IT), t(Language.EN), t(Language.FR)]).size).toBe(3);
  });

  it('the invitation reports club and validity days', () => {
    for (const l of Object.values(Language)) {
      const { subject, text } = TEXTS_MAIL.invitation[l]({ club: 'ASD Dakar', days: 7, link: LINK, destination: null, role: InvitationRole.ADMIN });
      expect(subject).toContain('ASD Dakar');
      expect(text).toContain('7');
    }
  });

  it('the invitation names the destination when there is one, the role otherwise', () => {
    for (const l of Object.values(Language)) {
      const base = { club: 'ASD Dakar', days: 7, link: LINK };
      const team = TEXTS_MAIL.invitation[l]({ ...base, destination: 'Under 14', role: InvitationRole.PLAYER });
      expect(team.text).toContain('Under 14');
      const roles = Object.values(InvitationRole).map((role) => TEXTS_MAIL.invitation[l]({ ...base, destination: null, role }).text);
      expect(new Set(roles).size).toBe(roles.length);
      expect(roles.join('')).not.toContain('Under 14');
    }
  });
});
