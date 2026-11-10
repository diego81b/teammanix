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
});
