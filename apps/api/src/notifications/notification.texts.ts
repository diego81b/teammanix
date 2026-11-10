import { Language, NotificationType } from '../entities/enums';
import { CLUB_TIMEZONE } from '../events/event.rules';

/**
 * Text of a notification that leaves the app (email, push), rendered in the recipient's language from the stored type and
 * params. The in-app text is rendered by the frontend from the same pair (`notifications.<type>` in the i18n files).
 * The title always names the club (ANALISI rule 6): the same device receives from several clubs.
 * Italian and French are the recipients' languages: have them read by someone who speaks them.
 */
export interface NotificationText {
  title: string;
  body: string;
}

type Params = Record<string, string | number>;

const LOCALE: Record<Language, string> = { [Language.IT]: 'it-IT', [Language.EN]: 'en-GB', [Language.FR]: 'fr-FR' };

/** An instant, in the club's timezone: "giovedì 3 dicembre 2026, 18:00". */
function when(iso: string, language: Language): string {
  return new Intl.DateTimeFormat(LOCALE[language], { dateStyle: 'full', timeStyle: 'short', timeZone: CLUB_TIMEZONE }).format(new Date(iso));
}

/** A calendar day `YYYY-MM-DD`, as written: no timezone applies. */
function day(iso: string, language: Language): string {
  return new Intl.DateTimeFormat(LOCALE[language], { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
}

const str = (p: Params, key: string): string => String(p[key] ?? '');

interface Dictionary {
  kind: Record<'training' | 'match' | 'other', string>;
  callup: (club: string, what: string, at: string) => NotificationText;
  modified: (club: string, what: string, at: string) => NotificationText;
  modifiedMany: (club: string, count: number, title: string) => NotificationText;
  cancelled: (club: string, what: string, at: string) => NotificationText;
  expiring: (club: string, expiry: string, days: number) => NotificationText;
  inDays: (days: number) => string;
  expired: (club: string, expiry: string) => NotificationText;
  due: (club: string, expiring: number, expired: number) => NotificationText;
  absence: (club: string, person: string, from: string, until: string | null) => NotificationText;
}

const IT: Dictionary = {
  kind: { training: 'Allenamento', match: 'Partita', other: 'Evento' },
  callup: (club, what, at) => ({ title: `${club}: nuova convocazione`, body: `${what}, ${at}. Apri l'app per rispondere.` }),
  modified: (club, what, at) => ({ title: `${club}: evento modificato`, body: `${what} modificato. Quando: ${at}.` }),
  modifiedMany: (club, count, title) => ({ title: `${club}: eventi modificati`, body: `${count} eventi${title ? ` di "${title}"` : ''} sono cambiati. Controlla il calendario.` }),
  cancelled: (club, what, at) => ({ title: `${club}: evento annullato`, body: `${what} annullato. Era: ${at}.` }),
  inDays: (n) => (n === 0 ? 'oggi' : n === 1 ? 'domani' : `tra ${n} giorni`),
  expiring: (club, expiry, days) => ({ title: `${club}: certificato in scadenza`, body: `Il tuo certificato medico scade il ${expiry} (${IT.inDays(days)}). Carica quello nuovo appena ce l'hai.` }),
  expired: (club, expiry) => ({ title: `${club}: certificato scaduto`, body: `Il tuo certificato medico è scaduto il ${expiry}.` }),
  due: (club, expiring, expired) => {
    const cert = (n: number) => (n === 1 ? 'certificato medico' : 'certificati medici');
    const gone = (n: number) => (n === 1 ? 'scaduto' : 'scaduti');
    const what =
      expiring > 0 && expired > 0
        ? `${expiring} ${cert(expiring)} in scadenza e ${expired} ${gone(expired)}`
        : expiring > 0
          ? `${expiring} ${cert(expiring)} in scadenza`
          : `${expired} ${cert(expired)} ${gone(expired)}`;
    return { title: `${club}: certificati da controllare`, body: `${what}. Apri l'app per controllare.` };
  },
  absence: (club, person, from, until) => ({
    title: `${club}: assenza dichiarata`,
    body: `${person} è assente dal ${from} ${until ? `al ${until}` : 'fino a nuovo avviso'}.`,
  }),
};

const EN: Dictionary = {
  kind: { training: 'Training', match: 'Match', other: 'Event' },
  callup: (club, what, at) => ({ title: `${club}: new call-up`, body: `${what}, ${at}. Open the app to answer.` }),
  modified: (club, what, at) => ({ title: `${club}: event changed`, body: `${what} changed. When: ${at}.` }),
  modifiedMany: (club, count, title) => ({ title: `${club}: events changed`, body: `${count} events${title ? ` of "${title}"` : ''} changed. Check the calendar.` }),
  cancelled: (club, what, at) => ({ title: `${club}: event cancelled`, body: `${what} cancelled. It was: ${at}.` }),
  inDays: (n) => (n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`),
  expiring: (club, expiry, days) => ({ title: `${club}: certificate expiring`, body: `Your medical certificate expires on ${expiry} (${EN.inDays(days)}). Upload the new one as soon as you have it.` }),
  expired: (club, expiry) => ({ title: `${club}: certificate expired`, body: `Your medical certificate expired on ${expiry}.` }),
  due: (club, expiring, expired) => {
    const cert = (n: number) => (n === 1 ? 'medical certificate' : 'medical certificates');
    const what =
      expiring > 0 && expired > 0
        ? `${expiring} ${cert(expiring)} expiring and ${expired} expired`
        : expiring > 0
          ? `${expiring} ${cert(expiring)} expiring`
          : `${expired} ${cert(expired)} expired`;
    return { title: `${club}: certificates to check`, body: `${what}. Open the app to check.` };
  },
  absence: (club, person, from, until) => ({
    title: `${club}: absence declared`,
    body: `${person} is away from ${from} ${until ? `to ${until}` : 'until further notice'}.`,
  }),
};

const FR: Dictionary = {
  kind: { training: 'Entraînement', match: 'Match', other: 'Événement' },
  callup: (club, what, at) => ({ title: `${club} : nouvelle convocation`, body: `${what}, ${at}. Ouvrez l'application pour répondre.` }),
  modified: (club, what, at) => ({ title: `${club} : événement modifié`, body: `${what} modifié. Quand : ${at}.` }),
  modifiedMany: (club, count, title) => ({ title: `${club} : événements modifiés`, body: `${count} événements${title ? ` de « ${title} »` : ''} ont changé. Consultez le calendrier.` }),
  cancelled: (club, what, at) => ({ title: `${club} : événement annulé`, body: `${what} annulé. C'était : ${at}.` }),
  inDays: (n) => (n === 0 ? "aujourd'hui" : n === 1 ? 'demain' : `dans ${n} jours`),
  expiring: (club, expiry, days) => ({ title: `${club} : certificat bientôt expiré`, body: `Votre certificat médical expire le ${expiry} (${FR.inDays(days)}). Téléversez le nouveau dès que vous l'avez.` }),
  expired: (club, expiry) => ({ title: `${club} : certificat expiré`, body: `Votre certificat médical a expiré le ${expiry}.` }),
  due: (club, expiring, expired) => {
    const cert = (n: number) => (n > 1 ? 'certificats médicaux' : 'certificat médical');
    const gone = (n: number) => (n > 1 ? 'expirés' : 'expiré');
    const soon = (n: number) => (n > 1 ? 'arrivent à expiration' : 'arrive à expiration');
    const what =
      expiring > 0 && expired > 0
        ? `${expiring} ${cert(expiring)} ${soon(expiring)} et ${expired} ${gone(expired)}`
        : expiring > 0
          ? `${expiring} ${cert(expiring)} ${soon(expiring)}`
          : `${expired} ${cert(expired)} ${gone(expired)}`;
    return { title: `${club} : certificats à vérifier`, body: `${what}. Ouvrez l'application pour vérifier.` };
  },
  absence: (club, person, from, until) => ({
    title: `${club} : absence déclarée`,
    body: `${person} est absent du ${from} ${until ? `au ${until}` : "jusqu'à nouvel ordre"}.`,
  }),
};

/** `Record<Language, ...>` fails to compile when a language is added without a dictionary. */
const DICTIONARY: Record<Language, Dictionary> = { [Language.IT]: IT, [Language.EN]: EN, [Language.FR]: FR };

/** The event as the text names it: "Training (Speed)". */
function what(d: Dictionary, p: Params): string {
  const code = str(p, 'kind');
  const kind = code in d.kind ? d.kind[code as keyof Dictionary['kind']] : d.kind.other;
  const title = str(p, 'title');
  return title ? `${kind} (${title})` : kind;
}

export function notificationText(type: NotificationType, language: Language, p: Params): NotificationText {
  const d = DICTIONARY[language];
  const club = str(p, 'club');
  switch (type) {
    case NotificationType.CALLUP:
      return d.callup(club, what(d, p), when(str(p, 'start'), language));
    case NotificationType.EVENT_MODIFIED:
      return Number(p.count) > 1 || str(p, 'kind') === 'series'
        ? d.modifiedMany(club, Number(p.count), str(p, 'title'))
        : d.modified(club, what(d, p), when(str(p, 'start'), language));
    case NotificationType.EVENT_CANCELLED:
      return d.cancelled(club, what(d, p), when(str(p, 'start'), language));
    case NotificationType.CERTIFICATE_EXPIRING:
      return d.expiring(club, day(str(p, 'expiry'), language), Number(p.days));
    case NotificationType.CERTIFICATE_EXPIRED:
      return d.expired(club, day(str(p, 'expiry'), language));
    case NotificationType.CERTIFICATES_DUE:
      return d.due(club, Number(p.expiring ?? 0), Number(p.expired ?? 0));
    case NotificationType.ABSENCE_DECLARED:
      return d.absence(club, str(p, 'person'), day(str(p, 'from'), language), p.until ? day(str(p, 'until'), language) : null);
  }
}
