# Test e flusso TDD

Regola: ogni funzionalità e ogni bug parte da un test che fallisce. Si scrive il test, si vede rosso, si scrive il codice minimo, si vede verde, si ripulisce.

## Livelli

| Livello | Dove | Cosa prova | Costo |
|---|---|---|---|
| Unit API | `apps/api/src/**/*.spec.ts` | Logica pura e classi con dipendenze finte (permessi, token, testi mail, guard) | secondi, senza Docker |
| Integration API | `apps/api/test/*.int-spec.ts` | App Nest reale, Postgres 16 vero (Testcontainers), `app.inject`. Regole di business, tenant, ruoli, migrazioni | ~1 min, serve Docker |
| Unit web | `apps/web/tests/unit/*.test.ts` | TypeScript puro: utils, parità delle lingue, contratto con l'API | secondi |
| Nuxt web | `apps/web/tests/nuxt/*.test.ts` | Store, composable, componenti dentro il runtime Nuxt (happy-dom, API simulata con `registerEndpoint`) | secondi |
| E2E | `apps/web/e2e/*.spec.ts` | Browser reale (Chrome) su web + API + DB di sviluppo. Pochi percorsi critici | ~20 s |

Piramide: tanti unit, un buon numero di integration, pochissimi e2e. Un e2e si aggiunge solo per un percorso che attraversa tutto lo stack e il cui guasto blocca l'uso dell'app.

## Comandi

```bash
# API (apps/api)
npm run test:unit        # veloce, ad ogni salvataggio: npm run test:watch
npm run test:int         # richiede Docker acceso
npm test                 # unit + integration

# Web (apps/web)
npm run test:unit
npm run test:nuxt
npm test                 # unit + nuxt
npm run test:coverage
npm run test:e2e         # vedi sotto
```

### E2E: prerequisiti

1. Database e API di sviluppo con l'outbox di test acceso (le mail con i token si leggono da `/api/__test/outbox`, attiva solo con `E2E_OUTBOX=1`, acceso in `apps/api/.env.dev`, e mai in produzione):
   `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d`
2. Chrome installato (nessun browser viene scaricato). Il web dev server parte da solo se non è già attivo.
3. Ogni test usa email uniche: il database di sviluppo non va ripulito. Non puntare mai gli e2e a un ambiente con dati veri.

Se l'API non è pronta, `e2e/global-setup.ts` si ferma subito con il comando da lanciare.

## Convenzioni

- **Estrarre la logica in funzioni pure** e testarle per prime. Esempi: `decideAccess` (web, accesso alle rotte), `outboxEnabled`, `token.service`. La guardia o il componente restano un guscio sottile.
- **API**: un file `*.spec.ts` accanto al sorgente per gli unit; gli integration usano `startEnvironment()` e `newUser()` da `test/helpers.ts`. Un test integration per ogni regola di tenant e per ogni ruolo che deve essere respinto.
- **Web**: gli errori si testano per `code` dell'API, mai per il testo. `tests/unit/i18n.test.ts` fallisce se en/fr perdono una chiave, un segnaposto, o se l'API introduce un `code` senza traduzione: aggiungere il testo in `it.ts`, `en.ts`, `fr.ts` insieme al codice.
- **Nuxt test**: i composable che usano `useI18n()` vanno eseguiti dentro `setup` (`inSetup` in `tests/nuxt/helpers.ts`). L'URL dell'API nei test è relativo (`baseApiRelative`) e gli endpoint finti si registrano con prefisso `/api`.
- **E2E**: dopo `page.goto` usare `go()` (aspetta l'idratazione, in sviluppo i click prima vengono persi). Selezionare per ruolo e testo visibile, come farebbe una persona.
- Un bug trovato in uso o in revisione si riproduce prima con un test, nel livello più basso che lo cattura, poi si corregge.

## Per ogni fetta nuova

1. Scrivere le regole di business come test unit/integration (rosso): permessi per ruolo e ambito, isolamento tra società, validazioni, codici di errore.
2. Implementare backend fino al verde.
3. Scrivere i test Vitest di store e composable, poi la UI. Aggiungere i testi nelle tre lingue.
4. Un e2e solo se nasce un percorso critico nuovo.
5. Prima di chiudere: `npm test` in entrambe le app e `npm run test:e2e`.
