import { Language } from '../entities/enums';

/**
 * Testi delle email transazionali, una funzione per tipo e per lingua.
 * `Record<Lingua, ...>` fa fallire la compilazione se si aggiunge una lingua e ne manca un testo.
 * Italiano e francese sono le lingue dei destinatari reali, quindi vanno riviste da chi le parla.
 */
interface Text {
  subject: string;
  text: string;
}

const byKey = <P>(d: Record<Language, (p: P) => Text>) => d;

export const TEXTS_MAIL = {
  verifyEmail: byKey<{ name: string; link: string }>({
    [Language.IT]: (p): Text => ({
      subject: 'TeamManix: conferma la tua email',
      text: `Ciao ${p.name}, conferma la tua email aprendo questo link entro 24 ore:\n${p.link}`,
    }),
    [Language.EN]: (p): Text => ({
      subject: 'TeamManix: confirm your email',
      text: `Hello ${p.name}, confirm your email by opening this link within 24 hours:\n${p.link}`,
    }),
    [Language.FR]: (p): Text => ({
      subject: 'TeamManix : confirmez votre adresse e-mail',
      text: `Bonjour ${p.name}, confirmez votre adresse e-mail en ouvrant ce lien dans les 24 heures :\n${p.link}`,
    }),
  }),

  alreadyRegistered: byKey<{ link: string }>({
    [Language.IT]: (p): Text => ({
      subject: 'TeamManix: hai già un account',
      text:
        'Qualcuno ha tentato di registrarsi con questa email, ma esiste già un account.\n' +
        `Se sei stato tu, accedi dalla pagina di login (${p.link}) o reimposta la password.\n` +
        'Se non sei stato tu, ignora questo messaggio.',
    }),
    [Language.EN]: (p): Text => ({
      subject: 'TeamManix: you already have an account',
      text:
        'Someone tried to sign up with this email address, but an account already exists.\n' +
        `If it was you, sign in from the login page (${p.link}) or reset your password.\n` +
        'If it was not you, ignore this message.',
    }),
    [Language.FR]: (p): Text => ({
      subject: 'TeamManix : vous avez déjà un compte',
      text:
        "Quelqu'un a essayé de s'inscrire avec cette adresse e-mail, mais un compte existe déjà.\n" +
        `Si c'était vous, connectez-vous depuis la page de connexion (${p.link}) ou réinitialisez votre mot de passe.\n` +
        "Si ce n'était pas vous, ignorez ce message.",
    }),
  }),

  resetPassword: byKey<{ link: string }>({
    [Language.IT]: (p): Text => ({
      subject: 'TeamManix: reimposta la password',
      text: `Per scegliere una nuova password apri questo link entro un'ora:\n${p.link}\nSe non l'hai chiesto tu, ignora questo messaggio.`,
    }),
    [Language.EN]: (p): Text => ({
      subject: 'TeamManix: reset your password',
      text: `To choose a new password, open this link within one hour:\n${p.link}\nIf you did not ask for this, ignore this message.`,
    }),
    [Language.FR]: (p): Text => ({
      subject: 'TeamManix : réinitialisez votre mot de passe',
      text: `Pour choisir un nouveau mot de passe, ouvrez ce lien dans l'heure :\n${p.link}\nSi vous n'avez pas fait cette demande, ignorez ce message.`,
    }),
  }),

  invitation: byKey<{ club: string; days: number; link: string }>({
    [Language.IT]: (p): Text => ({
      subject: `Invito a ${p.club} su TeamManix`,
      text:
        `Hai ricevuto un invito a ${p.club} su TeamManix.\n` +
        `Apri questo link entro ${p.days} giorni, accedi o registrati con questo indirizzo email e conferma:\n${p.link}`,
    }),
    [Language.EN]: (p): Text => ({
      subject: `Invitation to ${p.club} on TeamManix`,
      text:
        `You have been invited to ${p.club} on TeamManix.\n` +
        `Open this link within ${p.days} days, sign in or sign up with this email address, and confirm:\n${p.link}`,
    }),
    [Language.FR]: (p): Text => ({
      subject: `Invitation à ${p.club} sur TeamManix`,
      text:
        `Vous avez reçu une invitation à ${p.club} sur TeamManix.\n` +
        `Ouvrez ce lien dans les ${p.days} jours, connectez-vous ou inscrivez-vous avec cette adresse e-mail, puis confirmez :\n${p.link}`,
    }),
  }),
};
