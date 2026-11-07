# TeamManix web

Nuxt 4 SPA (`ssr: false`) con Nuxt UI 4. Tema derivato da `mockup/ui/css/tokens.css`, icone da `mockup/ui/assets/icons.svg`.

```
cd apps/web
npm install
cp .env.example .env     # facoltativo: i default di sviluppo stanno in .env.dev (http://localhost:3001/api), .env li sovrascrive
npm run dev              # http://localhost:5173 (porta fissa: l'API ammette solo questa origine)
```

L'API in sviluppo: `docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build` dalla radice.
Senza `BREVO_API_KEY` le email (verifica, reset, invito) escono nel log del container `api`.

Se cambiano i token o lo sprite nel mockup: `node gen-theme.mjs` e `node gen-icons.mjs`.

PWA: `public/manifest.webmanifest` e le icone PNG rendono l'app installabile. Se cambia `public/app-icon.svg`: `npm i --no-save sharp && node gen-pwa-icons.mjs`.
Service worker, cache offline e Web Push (VAPID) arrivano nella fetta 6, con le preferenze di notifica.
Testi legali: `termini`, `privacy` e `dpa` sono bozze non approvate. I dati di chi gestisce la piattaforma stanno in `app/utils/operatore.ts` (un campo null appare come "[da completare]" nel testo).

## Lingue (it, en, fr)

Testi in `i18n/locales/it.ts` (origine e ripiego); `en.ts` e `fr.ts` hanno tipo `typeof it`, quindi una chiave mancante rompe `npx nuxt typecheck`. Nei template `$t('sezione.chiave')`, negli script `const { t } = useI18n()`. Titoli di pagina: `useHead({ title: () => ... })`.

- Lingua all'avvio (`app/plugins/lingua.client.ts`): `Utente.lingua` > scelta in localStorage `tm-lingua` > lingua del browser > italiano. Nessun cookie del modulo.
- Cambio lingua: `useLingua().imposta(l)` (salva in locale e, da autenticati, fa PATCH `/auth/lingua`). Selettore: menu utente e footer dei layout `auth` e `legale`.
- Errori API: si traducono per `codice` (`errori.codici.<CODICE>`), ripiego per stato HTTP. Il `message` del server non si mostra mai. Ogni nuovo `codice` dell'API richiede la chiave in tutte e tre le lingue.
- Nomi di persone, squadre e società non si traducono. Date e ore: `datetimeFormats` in `i18n/i18n.config.ts`.
- Notifiche: in-app = `tipo` + `parametri` dal server, tradotti qui (`notifiche.<tipo>.titolo/corpo`); email e push le compone il backend nella lingua di `Utente.lingua`. Mai dati sanitari nei parametri.
- `termini`, `privacy`, `dpa` restano solo in italiano (avviso nelle altre lingue) finché non c'è una revisione legale.
- Profili sport: l'API manda solo codici. Nome dello sport e posizioni sono `sport.<codice>` e `posizione.<codice>` (un test legge il seed dell'API e blocca i codici senza testo). Un nuovo sport o una nuova posizione richiede il seed e i testi nelle tre lingue. Tipi di sanzione e terminologia per sport seguiranno la stessa regola con le fette 3 e 5.
