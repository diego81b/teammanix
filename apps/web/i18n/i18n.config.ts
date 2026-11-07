export default defineI18nConfig(() => ({
  legacy: false,
  fallbackLocale: 'it',
  // Un testo mancante in en o fr ricade sull'italiano. Il tipo di en.ts e fr.ts (typeof it) rende l'omissione un errore di compilazione.
  missingWarn: false,
  fallbackWarn: false,
  datetimeFormats: {
    it: {
      data: { day: 'numeric', month: 'long', year: 'numeric' },
      shortDate: { day: '2-digit', month: '2-digit', year: 'numeric' },
      day: { weekday: 'long', day: 'numeric', month: 'long' },
      time: { hour: '2-digit', minute: '2-digit' },
    },
    en: {
      data: { day: 'numeric', month: 'long', year: 'numeric' },
      shortDate: { day: '2-digit', month: '2-digit', year: 'numeric' },
      day: { weekday: 'long', day: 'numeric', month: 'long' },
      time: { hour: '2-digit', minute: '2-digit' },
    },
    fr: {
      data: { day: 'numeric', month: 'long', year: 'numeric' },
      shortDate: { day: '2-digit', month: '2-digit', year: 'numeric' },
      day: { weekday: 'long', day: 'numeric', month: 'long' },
      time: { hour: '2-digit', minute: '2-digit' },
    },
  },
}))
