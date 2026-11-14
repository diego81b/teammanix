# TeamManix: analisi e modello dati

Versione 0.3. Intento confermato dall'utente, modello da validare.

## 1. Obiettivo

Web app PWA per la gestione di squadre sportive: anagrafica atleti e staff, calendario allenamenti e partite, certificati medici, comunicazioni, convocazioni, presenze, sanzioni, formazione titolare e panchina. Accesso per staff, dirigenti e giocatori con visibilità profilata. Piattaforma SaaS gratuita, self-service, con più società indipendenti e isolate tra loro, ognuna multi-sport. UX moderna e semplice, mobile-first. Grafica tematizzabile con foglio di stile (colori e loghi) fornito a parte.

### Intento confermato

- **Outcome**: un allenatore pianifica allenamenti e partite, convoca con risposta del giocatore da tre liste (convocati, convocabili, non convocabili), rileva le presenze e controlla i certificati scaduti, tutto dal telefono, senza chat né Excel.
- **Utenti**: società sportive indipendenti che si registrano da sole. Chi crea la società ne è admin e invita staff, dirigenti e giocatori assegnando i ruoli.
- **Successo**: un allenatore reale completa il ciclo sopra senza strumenti esterni.
- **Vincoli**: stack Nuxt (SPA) e NestJS, API come adyton, isolamento rigido tra società, certificato medico come dato sanitario GDPR, gratuito (nessun piano, nessuna fatturazione).
- **Fuori scope MVP**: sanzioni complete (importi, pagamenti, ammonizioni; la squalifica entra nell'MVP), comunicazioni, tesseramento federale, quote, statistiche, scrittura offline, utenti su più società, piani e fatturazione, editor di sport.

## 2. Stack

Riferimento: `C:\varie\adyton\apps\api`.

- Backend: NestJS 11 su Fastify, MikroORM 6 con PostgreSQL, Redis, JWT con passport, argon2, class-validator, Swagger, Helmet, rate limit. Test con Jest e testcontainers.
- Frontend: Nuxt 4 in modalità SPA (`ssr: false`), Vue 3, TypeScript, Pinia, Nuxt UI 4, PWA con `@vite-pwa/nuxt`. Nessun rendering lato server: il JWT sta lato client e l'app è dietro login. Font Montserrat e Inter ospitati localmente (`@nuxt/fonts`), non da Google (GDPR).
- Due progetti npm indipendenti: `apps/api` e `apps/web` (pnpm non è installato; `packages/shared` con DTO e tipi condivisi resta da creare, per ora i tipi dell'API sono copiati in `apps/web/app/types/api.ts`).
- UI: Nuxt UI v4 (Tailwind) tematizzato con le variabili CSS del brand (`--tm-*`: bordeaux #790F20, nero, bianco, grigi; Montserrat per i titoli, Inter per l'interfaccia). Il frontend si adatta al mockup HTML in `mockup/ui`, generato con `mockup/PROMPT-UI.md`: il mockup è la fonte di verità visiva.
- PWA: Web Push (VAPID). Su iOS le push richiedono l'app installata in home (iOS 16.4 e successivi). Offline in sola lettura nell'MVP.
- Multi-tenancy: campo `societaId` su ogni entità e filtro globale MikroORM.

## 3. Gerarchia

```
Societa 1:N Settore (facoltativo) 1:N Squadra 1:N Stagione
Societa 1:N Squadra (una squadra può stare fuori da ogni settore)
Persona N:M Stagione, tramite Iscrizione
```

- **Società**: tenant. Confine di isolamento dati e di titolarità GDPR.
- **Settore**: raggruppamento facoltativo di squadre (esempio: Calcio, Pallavolo). Non porta il profilo sport. Una società senza settori mostra l'elenco piatto delle squadre; con i settori le squadre si raggruppano e quelle senza settore stanno in un gruppo a parte. Una squadra si sposta dentro, fuori o tra settori.
- **Squadra**: identità persistente (nome, categoria, genere, logo). Porta il profilo sport, non modificabile dopo la creazione, e i moduli attivi. Il calcio femminile è una squadra con profilo calcio e genere F. La parola per l'unità dipende dalla disciplina: "squadra" per quasi tutte, "gruppo" per la scherma.
- **Stagione**: cosa accade in una squadra in un periodo, inclusa la rosa. Una sola stagione attiva per squadra, più una in bozza. Stati: bozza, attiva, chiusa.
- **Iscrizione**: appartenenza di una persona a una stagione, come giocatore o come staff. Una persona può avere più iscrizioni attive contemporanee (esempio: Under 18 e prima squadra). L'admin può iscrivere la stessa persona come staff in più squadre in un solo passo, scegliendole (anche filtrate per settore): ognuna usa la stagione attiva, o la bozza se non c'è un'attiva, e se una scelta non si può fare non si crea nessuna iscrizione.

Regola di classificazione: se descrive chi è la persona o l'ente, è globale. Se descrive cosa succede in un periodo per una squadra, è stagionale.

### Registrazione e onboarding

1. L'utente si registra con email e password, verifica l'email. A questo punto esiste un account senza società.
2. Può creare una società (diventa admin) oppure accettare un invito a una società esistente.
3. L'admin invita per email e assegna il ruolo: dirigente (con ambito), staff o giocatore. L'invito scade e si può revocare. Chi ha già un account lo accetta dopo il login, chi non lo ha si registra dall'invito. Il flusso è identico nei due casi, così la società non scopre se l'email ha già un account altrove.
4. L'account è globale: una persona fisica, un login, email unica su tutta la piattaforma. Può appartenere a più società indipendenti. Le appartenenze derivano da `Persona.utente` e da `RuoloAccesso`. Dopo il login, con una sola società si entra direttamente, con più società si sceglie da un selettore. La società attiva sta nel JWT e il cambio società emette un nuovo JWT.
5. Distacco: l'atleta o lo staff può staccarsi da una società ("Lascia la società"). Si scollega l'account da `Persona.utente`, si tolgono i suoi `RuoloAccesso` in quella società e si eliminano le sue preferenze di notifica per quella società. La scheda e i dati restano alla società, che è titolare. Un admin non può staccarsi se è l'ultimo admin. La società può reinvitare.
6. Notifiche per società: l'atleta decide per ogni società e per ogni canale (in app, email, push) se riceverle. Esempio: ricevere da A e non da B. Default tutto attivo. Il titolo di ogni notifica riporta il nome della società.
7. Protezioni anti abuso sulla registrazione: rate limit, verifica email obbligatoria, captcha se serve. Un admin non può rimuovere l'ultimo admin della società.
8. Ruoli admin della società: gestione utenti, ruoli, settori, squadre, stagioni. I dati restano della società, nessun accesso del gestore della piattaforma ai dati sportivi.

## 4. Entità

### Globali (livello società)

- **Societa**: nome, logo, tema.
- **Settore**: societa, nome. Facoltativo.
- **ProfiloSport** (da seed): elenco opzionale di posizioni (solo etichette, non strutturano nulla), funzione "titolare o panchina" attiva sì o no (calcio sì) con numero massimo di titolari come avviso, parametri formazione in fase 2 (schemi con slot e coordinate), tipi di sanzione, regole di squalifica, campi extra opzionali e non sensibili, terminologia (compresa la parola per l'unità, squadra o gruppo), moduli disponibili.
- **Squadra**: societa, settore (facoltativo), nome, categoria, genere, logo, profilo sport, moduli attivi. Il nome è univoco per società e settore, e le squadre senza settore contano come un unico gruppo.
- **Persona**: anagrafica unica nella società, dati minimi: nome, cognome, data di nascita, email o telefono (almeno uno), foto opzionale. Niente sesso, niente codice fiscale. Un solo record anche se atleta, staff o entrambi. Il genere sta sulla squadra, non sulla persona. Può essere disabilitata dalla società (regola 12): campo `disabilitataIl`, nullo se attiva.
- **LegameTutore**: persona minorenne e persona tutore, con tipo di relazione.
- **Utente**: account di accesso, indipendente dall'anagrafica. Email univoca su tutta la piattaforma, password (argon2), nome e cognome. Login classico con sessione JWT, niente 2FA, passkey o refresh token nell'MVP. Account globale, non appartiene a una società: le appartenenze derivano da Persona.utente e RuoloAccesso. Il ruolo non è un campo: admin e dirigente stanno in RuoloAccesso, staff e giocatore derivano dall'Iscrizione.
- **Persona.utente**: collegamento opzionale all'account, sul lato della Persona. L'atleta può non avere alcun accesso all'app.
- **PreferenzaNotifiche**: utente, società, canali in app, email e push (sì o no, default sì). Appartiene all'account: l'atleta le gestisce tutte da una schermata. Si elimina al distacco dalla società.
- **PushSubscription**: dispositivo dell'account (non della società). Le società che possono inviare push le decide PreferenzaNotifiche.
- **Invito**: società, email, ruolo e ambito proposti, scadenza, stato (inviato, accettato, revocato, scaduto).
- **RuoloAccesso**: utente, ruolo (admin, dirigente), ambito (società, settore o squadra). Nessuna scadenza.
- **Appartenenza**: utente, società, differenze di policy rispetto al modello del ruolo (mappa chiave e valore sì o no, colonna JSON). Una sola per utente e società, vale per tutti i ruoli che la persona ha lì. Elenco delle chiavi e modelli predefiniti alla regola 14.
- **CertificatoMedico**: persona, tipo, data emissione, scadenza, file. Vale per tutte le squadre.
- **Consenso**: persona, tipo, data, stato (GDPR, minori).
- **Impianto**: nome, indirizzo.
- **Avversario**: squadra, nome.
- **ComunicazioneSocieta**: avvisi a livello società o settore.

### Stagionali (dentro la stagione)

- **Stagione**: squadra, nome, data inizio, data fine, stato, campionato.
- **Iscrizione**: stagione, persona, tipo (giocatore o staff), ruolo staff, posizione (etichetta opzionale dal profilo sport), numero maglia, stato manuale solo per i giocatori (disponibile, infortunato) senza alcun dettaglio clinico. Lo staff non ha stato manuale: lo rendono non disponibile l'assenza dichiarata e la squalifica. Sospeso e ceduto non esistono più come stati: la squalifica ha una propria entità, la cessione è la disabilitazione della persona (regola 12). L'idoneità ("eleggibile") non è un campo: si calcola da certificato valido e assenza di squalifica. Unico per stagione, persona e tipo.
- **Assenza**: iscrizione (quindi stagione e squadra), data inizio, data fine (nulla significa "fino a nuovo avviso"), creata dall'interessato, giocatore o staff. Nessun motivo e nessun testo libero. Il periodo sta dentro le date della stagione. Periodi adiacenti o sovrapposti si fondono in lettura. Stagione chiusa in sola lettura.
- **Squalifica**: iscrizione (giocatore o staff), tipo (a giornate o a tempo), data inizio, numero di giornate (a giornate) oppure data fine (a tempo), competizioni opzionali (solo a giornate, scelte tra i nomi già presenti sugli eventi della stagione), evento di origine opzionale (la partita da cui nasce). Nessun testo libero. La inserisce chi ha la policy `squalifiche.gestisci` (regola 14), mai l'interessato. Giornate scontate e residue si calcolano dal calendario, non si salvano. Importi, pagamenti e conteggio ammonizioni restano nella Sanzione di fase 2.
- **Evento**: stagione, tipo (allenamento, partita, altro), inizio, fine, impianto, note, stato. Le partite aggiungono avversario, casa o trasferta, competizione, risultato.
- **Convocazione**: evento, iscrizione, stato (convocato, confermato, declinato, senza risposta), motivo da elenco chiuso (impegno personale, lavoro, non disponibile). Nessun testo libero. Notifica inviata sì o no, per avvisare solo i nuovi convocati. Collocazione (titolare, panchina o vuota): campo opzionale, attivo solo per le squadre il cui profilo sport lo prevede (calcio), visibile solo a staff e dirigenti. Le liste "convocabili" e "non convocabili" non sono salvate: si calcolano dall'iscrizione (stato, certificato, squalifica) e dall'assenza di una convocazione per l'evento.
- **Disponibilità dello staff per evento**: non è un'entità nuova, è una Convocazione sull'iscrizione di tipo staff, creata dall'interessato stesso. Stati solo confermato ("Disponibile") e declinato ("Non disponibile"). "Senza risposta" si calcola dall'assenza della riga. Nessuna lista convocabili o non convocabili per lo staff, nessuna collocazione titolare o panchina.
- **Presenza**: evento, iscrizione (giocatore o staff), esito (presente, assente giustificato, assente, in ritardo). Nessuna nota libera, per non far entrare dati sanitari.
- Fase 2, **vista formazione per sport**: ordine in panchina, schema, slot, rotazioni, come dati opzionali sulla Convocazione. Nessuna entità Formazione separata.
- Fase 2, **Sanzione**: iscrizione, tipo, importo, stato pagamento, giornate di squalifica, evento di origine, ambito (stagione o persona).
- Fase 2, **Comunicazione**: stagione, autore, destinatari, testo, allegati. **LetturaComunicazione** per la conferma di lettura.
- Fase 3: **StatisticaPartita**, **QuotaStagionale**.

## 5. Regole di dominio

1. Una sola stagione attiva per squadra.
2. Tre liste per evento, uguali per ogni sport. **Convocati**: hanno una convocazione per l'evento. **Convocabili**: iscrizione attiva, nessun blocco, non ancora convocati. **Non convocabili**: infortunato, squalificato (solo per le partite, regola 13), certificato scaduto o mancante, in assenza dichiarata (regola 10). Le persone disabilitate (regola 12) non compaiono in nessuna lista.
3. Il blocco per certificato scaduto è configurabile per società: blocco (non convocabile) o warning (convocabile con avviso). La squalifica blocca sempre e non è forzabile. Certificato in scadenza: sempre solo warning.
4. Alert certificato a 30 e 15 giorni dalla scadenza.
5. Fase 2. Sanzione con ambito persona vale in tutte le squadre della persona. Le squalifiche residue passano alla stagione successiva. Le ammonizioni si contano per competizione. La squalifica semplice (regola 13) è nell'MVP. La Sanzione completa (importi, pagamenti, ammonizioni, ambito persona) resta in fase 2.
6. Sovrapposizione di eventi per la stessa persona: warning in convocazione. Lo staff dell'altra squadra vede solo "impegnato altrove". L'assenza dichiarata (regola 10) è un caso diverso: vale solo per la squadra della sua iscrizione e non esce da lì.
7. Stagione chiusa in sola lettura. Lo staff conserva la lettura, il giocatore vede lo storico.
8. Chiusura e nuova stagione: clonazione guidata di rosa e staff. Eventi e comunicazioni non si copiano.
9. Promozione tra squadre: nuova iscrizione nella destinazione, quella di origine resta o si chiude a scelta.
10. Assenza dichiarata. Giocatore e staff dichiarano da soli un'assenza sulla propria iscrizione, con data inizio e fine oppure "fino a nuovo avviso". Per un giocatore, l'evento che cade nell'assenza lo porta tra i non convocabili con l'etichetta "Non disponibile fino al 15/11" (fine del blocco continuo, "Non disponibile" se senza fine). Lo staff può convocarlo comunque, con conferma. Alla creazione l'app elenca gli eventi già convocati nel periodo e propone di declinarli in un tap, e lo staff riceve una notifica in app. Ogni creazione, modifica e cancellazione va nell'audit. Atleti senza account restano sullo stato manuale dello staff. L'infortunio resta stato manuale e non passa dall'assenza.
11. Staff per evento. Ogni membro dello staff si dichiara da solo "Disponibile" o "Non disponibile" per ogni evento, in un tap, senza passare dalla convocazione. Durante un'assenza dichiarata il pulsante "Disponibile" è disabilitato ("Sei in assenza fino al 15/11"). Il certificato medico non vale per lo staff. Lo staff disponibile è visibile a tutti, giocatori compresi, nella convocazione e nelle presenze. I non disponibili e i senza risposta li vedono solo staff, dirigenti e admin. Le presenze rilevano anche lo staff. Warning opzionale se nessun allenatore è disponibile per l'evento. Per una partita in cui è squalificato lo staff non può dichiararsi disponibile (pulsante disabilitato con "Sei squalificato per questa partita"), per gli allenamenti sì. Il livello evento (Disponibile, Non disponibile) non è uno stato dell'iscrizione.
12. Disabilitazione. Sostituisce lo stato "ceduto", per giocatori, staff e chiunque altro. La persona disabilitata sparisce da rosa, calendario, convocazioni, presenze, liste e contatori, non riceve notifiche e non può più entrare in quella società. Vale solo per la società: l'account è globale e resta valido nelle altre. Si distingue dal distacco (iniziativa dell'interessato) e dalla chiusura di un'iscrizione (esce da una squadra e resta in società, regola 9). I dati restano alla società, titolare del trattamento. Solo l'admin li vede, in un archivio "Disabilitati" da cui può riabilitare la persona o esportare i dati. Le convocazioni future della persona si rimuovono. Gli eventi passati e le stagioni chiuse conservano la riga storica per i totali, mostrata come "Persona disabilitata" a tutti tranne l'admin. Disabilita chi ha la policy `persone.disabilita` (per modello solo l'admin, regola 14). L'ultimo admin non si disabilita. Disabilitazione e riabilitazione vanno nell'audit. Il blocco d'accesso usa il controllo che a ogni richiesta rilegge l'appartenenza, come il distacco, quindi vale subito. La disabilitazione vale per tutte le stagioni successive: la persona non si può iscrivere a nessuna squadra della società, la clonazione guidata (regola 8) la esclude e un invito a suo nome è rifiutato finché non è riabilitata. Riabilitare non ripristina le iscrizioni passate: l'admin la iscrive di nuovo dove serve. L'azione parte dalla squadra (riga in Rosa), ma l'effetto è su tutta la società. Per far uscire la persona da una sola squadra si chiude l'iscrizione (regola 9).
13. Squalifica. Si inserisce dal calendario (scheda persona o pagina "Squalifiche" della squadra) oppure dalla partita stessa ("Squalifica" sulla riga della persona, con la partita come origine e partenza dalla partita successiva). Due forme. A tempo: dal giorno X al giorno Y, copre tutte le partite del periodo, di qualunque competizione. A giornate: le prossime N partite dalla data di inizio, solo nelle competizioni scelte se ne è indicata almeno una, altrimenti in tutte. La competizione è il nome che l'admin dà all'evento nel campo competizione (campionato, coppa o altro): non esiste un'entità Competizione, e la schermata propone i nomi già usati negli eventi della stagione. Riguarda solo le partite: lo squalificato resta convocabile e disponibile agli allenamenti, a differenza dell'infortunato. Per ogni partita coperta il giocatore va in Non convocabili con "Squalificato (giornata 1 di 2)" e lo staff non può dichiararsi disponibile. A giornate, una partita conta come scontata se è svolta (data passata e non annullata). Annullata o rinviata non conta, quindi se il calendario cambia il calcolo si aggiorna da solo. Il blocco non è forzabile. Le giornate residue a fine stagione passano alla stagione successiva, e la clonazione guidata (regola 8) propone di riportarle. La squalifica è visibile alla persona, allo staff, ai dirigenti e all'admin, mai ai compagni. Ogni modifica va nell'audit.
14. Policy. Cosa può fare una persona si decide con un insieme di permessi (policy) e non con il solo ruolo. Le policy stanno sull'`Appartenenza`, cioè sull'unione utente e società, e non su `RuoloAccesso`, perché staff e giocatore non hanno un RuoloAccesso: derivano dall'Iscrizione. Ogni ruolo (admin, dirigente, ruoli staff come allenatore, vice, preparatore, giocatore) ha un modello predefinito. L'Appartenenza salva solo le differenze rispetto al modello e l'admin le modifica persona per persona. Le policy valgono dentro l'ambito del ruolo (società, settore o squadra per il dirigente, squadra e stagione dell'iscrizione per lo staff) e non lo superano mai. Un dirigente con ambito settore ha le sue policy su ogni squadra del settore, comprese quelle aggiunte dopo. Chiavi iniziali: `eventi.gestisci`, `convocazioni.gestisci`, `presenze.rileva`, `squalifiche.gestisci`, `persone.gestisci` (anagrafica, iscrizioni, stato infortunato), `persone.disabilita`, `certificati.stato`, `certificati.file`. Modelli predefiniti: admin tutte, e non si possono togliere, così nessuna società resta senza chi la governa. Allenatore tutte tranne `persone.disabilita` e `certificati.file`. Vice `convocazioni.gestisci`, `presenze.rileva`, `certificati.stato`. Preparatore `presenze.rileva`. Dirigente e giocatore nessuna, quindi il dirigente è in sola lettura finché l'admin non gli concede policy nel suo ambito. Le policy si rileggono dal DB a ogni richiesta, come l'appartenenza, quindi una modifica vale subito. Ogni modifica va nell'audit. Il distacco cancella l'Appartenenza e la disabilitazione la sospende. La UI nasconde le azioni non permesse e il backend le rifiuta comunque.

## 6. Visibilità per ruolo

Il ruolo staff e giocatore deriva dall'iscrizione. Il ruolo dirigente deriva dal RuoloAccesso. Le colonne mostrano il modello predefinito: le policy (regola 14) estendono o restringono le azioni di gestione persona per persona.

| Dato | Giocatore | Staff (sua stagione) | Dirigente (suo ambito) | Admin società |
|---|---|---|---|---|
| Anagrafica persona | propria, modifica parziale | rosa della stagione, completa | completa | completa |
| Calendario | proprio, tutte le sue stagioni | sua stagione, gestione | lettura | gestione |
| Convocazioni: lista convocati con risposte | sì, risponde alla propria | gestione | lettura | gestione |
| Convocazioni: liste convocabili e non convocabili | no | gestione | lettura | gestione |
| Titolare o panchina (solo sport che lo prevedono) | no | gestione (ruoli abilitati) | lettura | gestione |
| Vista formazione per sport (fase 2) | no | gestione | lettura | gestione |
| Presenze | proprie, più lo staff presente | gestione, anche dello staff | statistiche | tutto |
| Certificato | proprio, con file | solo stato e scadenza | stato, file se necessario | tutto |
| Stato di disponibilità | proprio | rosa della sua stagione | completo | completo |
| Assenze dichiarate (solo date) | proprie, in modifica | proprie in modifica, quelle della rosa in sola lettura | lettura | lettura |
| Staff disponibile per evento | sì, solo i disponibili | sì, tutti con stato, la propria disponibilità in modifica | lettura | lettura |
| Squalifiche | proprie, sola lettura | gestione (policy `squalifiche.gestisci`) | lettura | gestione |
| Persone disabilitate | no | no | no | archivio, riabilitazione, export |
| Sanzioni (fase 2) | proprie | inserimento | gestione | gestione |
| Comunicazioni (fase 2) | ricezione | invio alla sua squadra | invio nell'ambito | tutto |
| Utenti, inviti e ruoli | no | no | no | gestione |

Il certificato medico è dato sanitario (GDPR, categoria particolare). Accesso al file minimizzato e tracciato nell'audit. Per i minorenni serve il consenso del tutore.

## 7. Moduli attivabili per squadra

Convocazione, titolare o panchina (solo calcio), vista formazione (fase 2), classifica, presenze, sanzioni. Esempio: la scherma è individuale, quindi senza titolari e panchina. La "gara" convoca singoli atleti con la stessa convocazione a tre liste.

## 8. UX

Home per ruolo con prossimo evento in evidenza. Risposta alla convocazione in un tap. Convocazione da telefono o tablet: tre liste (convocati, convocabili, non convocabili), spostamento a tocco, invio della convocazione ai soli nuovi convocati. Il giocatore vede i convocati e risponde in un tap. Per il calcio, un interruttore T / P accanto al convocato indica titolare o panchina, visibile solo allo staff. Nessuna vista formazione nell'MVP. Calendario personale unico per chi ha più iscrizioni. Selettore di squadra nell'header (la società è implicita nell'account). Tema chiaro e scuro fin dall'MVP, con il brand TeamManix: l'utente sceglie Chiaro, Scuro o Automatico (segue il sistema) nel Profilo, i colori sono variabili CSS semantiche. Nel tema scuro il bordeaux ha una variante più chiara (il #790F20 su fondo scuro non è leggibile) e serve una versione del logo per fondo scuro. La personalizzazione dei colori per società è rinviata. Assenze: da Profilo > Iscrizione, due date e un interruttore "fino a nuovo avviso", per giocatori e staff. Lo staff risponde "Ci sono / Non posso" a ogni evento come i giocatori, e l'evento mostra "Staff presente" a tutti. Squalifiche: pagina "Squalifiche" della squadra, con vista a calendario, e azione "Squalifica" sulla partita. Persone disabilitate: archivio nell'Amministrazione.

## 9. Fasi

- **MVP**: registrazione self-service e creazione società, inviti e ruoli, settori facoltativi, squadre, stagioni, anagrafica, calendario (allenamenti e partite, con ricorrenze), convocazioni per evento con tre liste (convocati, convocabili, non convocabili) e risposta del giocatore, indicazione titolare o panchina per gli sport che la prevedono (solo staff), presenze rilevate dallo staff, anche per lo staff stesso (solo online), assenze dichiarate di giocatori e staff, disponibilità dello staff per evento, squalifiche a giornate e a tempo, disabilitazione delle persone, certificati medici con scadenza e alert, notifiche in app, email e push (Web Push).
- **Fase 2**: comunicazioni, sanzioni complete (importi, pagamenti, ammonizioni), vista formazione per sport guidata dal profilo, sugli stessi dati della convocazione (calcio: raggruppamento per ruolo, modulo e campo; pallavolo: rotazioni).
- **Fase 3**: statistiche, quote, account tutore, scrittura offline, integrazioni.

## 10. Decisioni assunte, da confermare

1. Anagrafica unica dentro la società, non tra società. Persona in due società ha due schede.
2. Ambito della sanzione scelto all'inserimento (stagione o persona).
3. Tesseramento federale fuori scope: l'atleta è considerato tesserato by default. Nessuna entità, nessun controllo di validità tessera.
4. Più società indipendenti sulla stessa piattaforma, isolate tra loro, nessun gestore centrale cross-società. Un account può appartenere a più società (revisione: prima era escluso), una alla volta nella sessione, senza dati condivisi tra società.
5. Registrazione self-service: chi si registra crea una società o accetta un invito. Nessun provisioning manuale.
6. Piattaforma gratuita, nessun piano, nessuna fatturazione.
7. Nell'MVP le notifiche sono in app, email e push (Web Push).
8. Primo rilascio come pilot su una sola società dilettantistica con la sola prima squadra, quindi atleti quasi tutti maggiorenni. L'account tutore non serve per il pilot.
9. Modello SaaS, non on premise (motivazioni in sezione 12).
10. Dirigente e staff sono due cose distinte sulla stessa persona. Il dirigente è un ruolo di accesso attivo (`RuoloAccesso`, con ambito e permessi propri). Non compare tra chi è disponibile agli eventi. Un dirigente accompagnatore riceve in più un'iscrizione di tipo staff, quindi una sola Persona con due legami e nessun meccanismo nuovo.

## 11. Punti aperti

1. Federazione di riferimento e regole di squalifica effettive.
2. Quote e pagamenti: rimandati alla fase 3.
3. Minorenni: nell'MVP il certificato e l'account del minorenne richiedono consenso del tutore, ma senza account tutore dedicato (fase 3). Come si gestisce il consenso nel frattempo?
4. Uso offline in campo per presenze e formazione (fuori MVP).
5. GDPR: vedi sezione 12. Da validare con un legale o un DPO prima del pilot.
6. Cancellazione: tempi di conservazione dopo la chiusura di una società e dopo la richiesta di una persona (vedi sezione 12).
7. Canali di notifica oltre a push, in app ed email (WhatsApp).
8. Statistiche di partita (gol, minuti, assist).
9. Sport con rotazioni obbligatorie (pallavolo) o cambi liberi (basket): richiedono un modello formazione diverso dallo slot statico.
10. Schema MikroORM in `apps/api/src/entities`. Aggiunte rispetto alla sezione 4: SerieEventi (ricorrenze, eventi generati come righe reali), Notifica, PreferenzaNotifiche, PushSubscription, AuditLog, AccettazioneTermini e `Societa.bloccoCertificatoScaduto`. Autenticazione semplice: JWT di accesso (durata da definire) senza refresh token, quindi alla scadenza si rifà il login.
11. Vista unificata "il mio calendario" tra più società per l'atleta: fase 3. Nessun problema GDPR perché mostra solo gli impegni dell'atleta stesso, a lui solo. Vincolo: nessuna informazione tra società verso lo staff, quindi il warning "impegnato altrove" (regola 6) resta dentro la società.
12. Persona.email e Utente.email: per le schede create da invito coincidono per costruzione (l'invito vale solo per l'account con quell'email). Resta il caso di schede create a mano con un'altra email.
13. Modulo auth implementato in `apps/api` (23 test e2e su Postgres reale, tutti verdi). Endpoint sotto `/api`: `auth/registrazione`, `verifica-email`, `reinvia-verifica`, `login`, `password-dimenticata`, `reimposta-password`, `me`, `seleziona-societa`, `cambia-password`; `societa` (crea, `corrente/distacco`); `inviti` (crea, elenca, revoca, `accetta`). Scelte di dettaglio:
    - Il JWT porta `sub`, `sid` (società attiva) e `tv`, la versione dei token dell'account. Il cambio o il reset password cambia la versione e invalida tutti i token precedenti, senza dipendere dall'orologio.
    - A ogni richiesta l'appartenenza a `sid` e i ruoli si rileggono dal DB: il distacco vale subito, non alla scadenza del token.
    - Registrazione, password dimenticata e reinvio verifica rispondono sempre 202 con lo stesso testo. L'accettazione invito risponde con lo stesso 404 "Invito non valido" per token inventato, email diversa, revocato, scaduto o già usato. L'invito vale solo per l'account con la stessa email verificata.
    - Unica regola sugli admin: l'ultimo admin di una società non può essere tolto. Oggi vale nel distacco; va applicata anche quando si scrive la rimozione di un ruolo admin da parte di un altro admin.
    - Invito di staff e giocatore: chi invita indica solo nome ed email (nuova scheda "da completare") oppure una scheda esistente (`personaId`). Cognome, data di nascita e telefono li inserisce l'interessato dopo l'accettazione (`PATCH /persone/me`). `Persona.cognome` e `dataNascita` sono quindi null fino a `completataIl`, con check a DB. La sessione espone `schedaDaCompletare` per società, così il client mostra il modulo. Non si riusa una scheda con la stessa email (fratelli con l'email del genitore): un invito ripetuto lascia una scheda bozza in più, da ripulire dall'admin.
    - Aperto: minorenni. Sotto i 14 anni in Italia il consenso digitale è del genitore, quindi l'invito a un minore deve passare dal tutore (LegameTutore) e non da un account proprio. Il flusso non è ancora scritto.
    - Email transazionali via Brevo (SDK ufficiale `@getbrevo/brevo`, piano gratuito, azienda europea). `BREVO_API_KEY` e `MAIL_FROM_EMAIL` da variabili d'ambiente; senza chiave le email vanno solo nel log, e in produzione l'avvio fallisce. Un errore di invio viene loggato e non cambia la risposta HTTP. Serve un dominio autenticato su Brevo (SPF, DKIM) per non finire in spam. JWT 24 ore confermato. Il rate limit è per IP.
    - Database: migrazione iniziale in `apps/api/src/migrations` (non reversibile, come ogni migrazione iniziale generata). Finché non esiste un DB di produzione si rigenera invece di accumulare migrazioni; dopo il primo deploy ogni modifica allo schema è una nuova migrazione. Un test verifica che le migrazioni su DB vuoto producano esattamente lo schema delle entità. Seed dei profili sport (generico, calcio a 11, calcio a 5, pallavolo, basket, scherma) idempotente, in codice: `npm run db:setup` applica migrazioni e seed, da rilanciare a ogni deploy. Titolare o panchina è attivo solo per i due calcio.
    - Argon2 confermato per l'hash delle password. Login con Google in un secondo passaggio (`passwordHash` nullabile, identificativo Google, collegamento solo con email verificata da Google). Gestione dei minorenni rimandata.

## 12. GDPR (proposta, da validare con legale o DPO)

Questa sezione è un'impostazione di progetto, non consulenza legale.

### Ruoli

- **Società sportiva**: titolare del trattamento. Decide finalità e mezzi per i dati di atleti e staff.
- **Piattaforma (chi gestisce TeamManix)**: responsabile del trattamento (art. 28). Tratta i dati solo per conto e su istruzione della società. Se usasse i dati per finalità proprie (marketing, analisi proprie) diventerebbe titolare: da evitare.
- **Sub-responsabili**: hosting, provider email, servizi push (FCM, APNs). Elenco pubblico e aggiornato.

### Cosa deve accettare chi crea la società

1. Termini d'uso della piattaforma.
2. Accordo di nomina a responsabile (DPA, art. 28) tra la società e la piattaforma.
3. Dichiarazione di agire come rappresentante della società con i poteri per farlo.

Accettazione online con tracciamento (click-wrap) in registrazione. Per il pilot meglio un DPA firmato anche in forma elettronica. Nuova entità `AccettazioneTermini`: utente, società, documento, versione, data e ora, IP. A ogni nuova versione dei documenti, nuova accettazione.

### Obblighi che restano alla società (titolare)

Informativa agli atleti e allo staff, base giuridica del trattamento, gestione delle richieste degli interessati, notifica di data breach al Garante entro 72 ore. La piattaforma fornisce: testo di informativa pronto da personalizzare, strumenti di export e cancellazione, avviso tempestivo alla società in caso di breach.

### Obblighi della piattaforma

Registro dei trattamenti del responsabile, misure di sicurezza (art. 32), elenco dei sub-responsabili, procedura di breach, hosting in UE, valutazione se serve una DPIA (dati sanitari, possibili minori).

### Scelte di progetto

- **Minimizzazione sul certificato medico**: salvare di default solo tipo, data di emissione e scadenza. Il file allegato è opzionale e attivabile dalla società. Meno dati sanitari custoditi, meno rischio.
- **Visibilità**: lo staff vede stato e scadenza, non il file. Accesso al file tracciato nell'audit.
- **Anagrafica minima**: nessun sesso, codice fiscale, peso o altezza. Se una federazione li richiederà in futuro, si aggiungeranno come campi opzionali per società.
- **Stato di disponibilità**: "infortunato" resta dato sanitario anche senza dettagli. Visibile solo a staff, dirigenti e al giocatore stesso, mai ai compagni. Ogni cambio di stato va nell'audit. Nessuna diagnosi, durata o parte del corpo.
- **Assenze**: solo date, nessun motivo e nessun testo libero. Un motivo o una durata esplicita permetterebbero di dedurre un infortunio. Visibili solo alla squadra della propria iscrizione, mai ai compagni e mai alle altre squadre.
- **Squalifica e disabilitazione**: la squalifica è un dato disciplinare, visibile solo a interessato, staff, dirigenti e admin, mai ai compagni. La disabilitazione non cancella i dati: la società resta titolare e i diritti dell'interessato (export, cancellazione) passano dall'admin.
- **Testi liberi**: nessuno su convocazioni e presenze, per evitare l'ingresso di dati sanitari. Motivi a elenco chiuso.
- **Liste di convocazione**: il giocatore vede solo i convocati e le risposte, mai convocabili e non convocabili. L'appartenenza ai non convocabili rivelerebbe infortuni, sospensioni o certificato scaduto dei compagni. Chi non è convocato vede solo "Non sei in convocazione", senza motivo.
- **Sicurezza**: cifratura in transito e a riposo, file certificati su storage cifrato, backup, audit su accessi a dati sanitari.
- **Diritti degli interessati**: export dei dati di una persona e cancellazione o anonimizzazione, con conservazione dei soli dati dovuti per legge.
- **Chiusura società**: periodo di grazia per l'export, poi cancellazione di tutti i dati. Tempo da fissare.
- **Informativa e consenso nel pilot**: la società informa gli atleti prima dell'inserimento. Il consenso del tutore serve per i minorenni, fuori dal pilot.

### Perché SaaS e non on premise

L'on premise non elimina il GDPR: la società resta titolare in ogni caso e in più diventa responsabile di sicurezza, backup e aggiornamenti, competenze che una società dilettantistica non ha. Le PWA con push richiedono un server raggiungibile da internet con HTTPS valido, quindi l'installazione presso la società richiederebbe comunque dominio, porte aperte e manutenzione. Le push passano comunque da servizi terzi (FCM, APNs). Chi fa assistenza sul sistema accede ai dati e diventa di nuovo responsabile. Alternativa futura per chi lo richiede: istanza dedicata in cloud UE, stesso codice (adyton ha già Docker).
