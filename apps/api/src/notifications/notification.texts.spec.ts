import { Language, NotificationType } from '../entities/enums';
import { notificationText } from './notification.texts';

const START = '2026-12-03T17:00:00.000Z'; // 18:00 in Rome
const event = { club: 'ASD Dakar', kind: 'training', title: 'Speed', start: START, count: 1 };
const PARAMS: Record<NotificationType, Record<string, string | number>> = {
  [NotificationType.CALLUP]: event,
  [NotificationType.EVENT_MODIFIED]: event,
  [NotificationType.EVENT_CANCELLED]: event,
  [NotificationType.CERTIFICATE_EXPIRING]: { club: 'ASD Dakar', expiry: '2026-12-10', days: 30 },
  [NotificationType.CERTIFICATE_EXPIRED]: { club: 'ASD Dakar', expiry: '2026-12-10' },
  [NotificationType.CERTIFICATES_DUE]: { club: 'ASD Dakar', expiring: 3, expired: 1 },
  [NotificationType.ABSENCE_DECLARED]: { club: 'ASD Dakar', person: 'Awa Diop', from: '2026-12-01', until: '2026-12-15' },
};

describe('notificationText', () => {
  for (const type of Object.values(NotificationType)) {
    for (const language of Object.values(Language)) {
      it(`${type} in ${language}: club in the title, nothing unresolved`, () => {
        const { title, body } = notificationText(type, language, PARAMS[type]);
        expect(title).toContain('ASD Dakar');
        expect(body.trim()).not.toBe('');
        expect(title + body).not.toMatch(/undefined|NaN|\[object|\$\{|\{\w+\}/);
      });
    }
  }

  it('shows the event time in the club timezone and the language of the recipient', () => {
    expect(notificationText(NotificationType.CALLUP, Language.IT, event).body).toMatch(/18:00/);
    expect(notificationText(NotificationType.CALLUP, Language.IT, event).body).toMatch(/dicembre/);
    expect(notificationText(NotificationType.CALLUP, Language.EN, event).body).toMatch(/December/);
    expect(notificationText(NotificationType.CALLUP, Language.FR, event).body).toMatch(/décembre/);
  });

  it('names the title of the event when there is one, and copes with none', () => {
    expect(notificationText(NotificationType.CALLUP, Language.EN, event).body).toContain('Speed');
    expect(notificationText(NotificationType.CALLUP, Language.EN, { ...event, title: '' }).body).not.toMatch(/""|\(\)/);
  });

  it('says "today" and "tomorrow" instead of "in 0 days" and "in 1 days"', () => {
    const body = (language: Language, days: number) => notificationText(NotificationType.CERTIFICATE_EXPIRING, language, { club: 'C', expiry: '2026-12-10', days }).body
    expect(body(Language.IT, 0)).toMatch(/oggi/);
    expect(body(Language.IT, 1)).toMatch(/domani/);
    expect(body(Language.IT, 15)).toMatch(/tra 15 giorni/);
    expect(body(Language.EN, 0)).toMatch(/today/);
    expect(body(Language.EN, 1)).toMatch(/tomorrow/);
    expect(body(Language.EN, 15)).toMatch(/in 15 days/);
    expect(body(Language.FR, 0)).toMatch(/aujourd'hui/);
    expect(body(Language.FR, 1)).toMatch(/demain/);
    expect(body(Language.FR, 15)).toMatch(/dans 15 jours/);
  });

  it('the staff digest gives counts and no names, and leaves out the part that is zero', () => {
    const both = notificationText(NotificationType.CERTIFICATES_DUE, Language.EN, { club: 'C', expiring: 3, expired: 1 }).body;
    expect(both).toMatch(/3/);
    expect(both).toMatch(/1/);
    const onlyExpiring = notificationText(NotificationType.CERTIFICATES_DUE, Language.EN, { club: 'C', expiring: 2, expired: 0 }).body;
    expect(onlyExpiring).toMatch(/2/);
    expect(onlyExpiring).not.toMatch(/expired/i);
    const onlyExpired = notificationText(NotificationType.CERTIFICATES_DUE, Language.IT, { club: 'C', expiring: 0, expired: 4 }).body;
    expect(onlyExpired).toMatch(/4/);
    expect(onlyExpired).not.toMatch(/in scadenza/i);
  });

  it('the staff digest agrees in number: one certificate, several certificates', () => {
    expect(notificationText(NotificationType.CERTIFICATES_DUE, Language.EN, { club: 'C', expiring: 1, expired: 0 }).body).toMatch(/1 medical certificate expiring/);
    expect(notificationText(NotificationType.CERTIFICATES_DUE, Language.IT, { club: 'C', expiring: 1, expired: 0 }).body).toMatch(/1 certificato medico in scadenza/);
  });

  it('an absence until further notice has no end date', () => {
    const { body } = notificationText(NotificationType.ABSENCE_DECLARED, Language.EN, { club: 'C', person: 'Awa Diop', from: '2026-12-01' });
    expect(body).toContain('Awa Diop');
    expect(body).not.toMatch(/undefined|until 2026/);
  });

  it('a change that covers several events of a series says how many', () => {
    const { body } = notificationText(NotificationType.EVENT_MODIFIED, Language.EN, { club: 'C', kind: 'series', title: 'Weekly', start: '', count: 3 });
    expect(body).toMatch(/3/);
    expect(body).toContain('Weekly');
  });

  describe('a removed series', () => {
    const removed = { club: 'ASD Dakar', kind: 'series', title: 'Speed', start: '', count: 3, days: '2026-12-03,2026-12-05,2026-12-10' };
    const body = (language: Language, over: Record<string, string | number> = {}) =>
      notificationText(NotificationType.EVENT_CANCELLED, language, { ...removed, ...over }).body;

    it('says how many sessions are gone and lists their days, in the language of the recipient', () => {
      expect(body(Language.IT)).toMatch(/Eventi.*Speed.*annullati.*\(3\).*3 dic.*5 dic.*10 dic/);
      expect(body(Language.EN)).toMatch(/Events.*Speed.*cancelled.*\(3\).*3 Dec.*5 Dec.*10 Dec/);
      expect(body(Language.FR)).toMatch(/Événements.*Speed.*annulés.*\(3\).*3 déc.*5 déc.*10 déc/);
    });

    it('reads right for one session, the usual case: the count is not a plural noun', () => {
      const one = { count: 1, days: '2026-12-03' };
      expect(body(Language.IT, one)).not.toMatch(/1 eventi/);
      expect(body(Language.EN, one)).not.toMatch(/1 events/);
      expect(body(Language.FR, one)).not.toMatch(/1 événements/);
      expect(body(Language.EN, one)).toMatch(/\(1\).*3 Dec/);
    });

    it('is not the text of a single cancelled event', () => {
      const single = notificationText(NotificationType.EVENT_CANCELLED, Language.EN, { club: 'ASD Dakar', kind: 'training', title: 'Speed', start: '2026-12-03T17:00:00.000Z', count: 1 });
      expect(body(Language.EN)).not.toBe(single.body);
      expect(notificationText(NotificationType.EVENT_CANCELLED, Language.EN, removed).title).toContain('ASD Dakar');
    });

    it('lists the first days and counts the rest, so a long series does not fill a lock screen', () => {
      const many = Array.from({ length: 8 }, (_, i) => `2026-12-${String(i + 1).padStart(2, '0')}`).join(',');
      const text = body(Language.EN, { count: 8, days: many });
      expect(text).toMatch(/1 Dec/);
      expect(text).toMatch(/5 Dec/);
      expect(text).not.toMatch(/6 Dec/);
      expect(text).toMatch(/and 3 more/);
      expect(body(Language.IT, { count: 8, days: many })).toMatch(/e altri 3/);
      expect(body(Language.FR, { count: 8, days: many })).toMatch(/et 3 autres/);
    });

    it('lists every day of a short series without a "more" part, and copes with no title', () => {
      expect(body(Language.EN)).not.toMatch(/more/);
      expect(body(Language.EN, { title: '' })).not.toMatch(/""|\(\)/);
    });
  });
});
