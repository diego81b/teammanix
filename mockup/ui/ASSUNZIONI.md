# TeamManix mockup · Assunzioni (fase 2: token, CSS, catalogo)

## Logo
- I PNG forniti hanno fondo bianco pieno. In `assets/logo.png` e `assets/app-icon.png` il fondo è stato reso trasparente con l'inversione esatta della composizione su bianco: su fondo chiaro il risultato è identico all'originale, colori e forme non sono toccati. Gli originali sono in `assets/originali/`.
- Manca la versione per fondo scuro: vedi Revisione 3 per la versione provvisoria. Il cambio avviene con due `<img>` mostrate per tema (`.tm-logo__light` / `.tm-logo__dark`), senza filtri.
- A 28 px di altezza il payoff "La tua squadra. Tutto sotto controllo." diventa illeggibile (circa 3 px). Per header e sidebar servirebbe una versione senza payoff.

## Correzioni alla guida per accessibilità
- **Focus**: l'anello `rgba(121,15,32,0.22)` ha contrasto circa 1,4:1. È stato sostituito da un outline pieno di 2 px con offset 2 px (`--tm-focus`).
- **Placeholder**: passa dal grigio 500 al grigio 700.
- **Bordi dei controlli**: input, checkbox e radio usano il grigio 500 (4,48:1). Il grigio 300 della guida (1,4:1) non raggiunge il minimo di 3:1 per i componenti. Le card restano sul grigio 200, come da guida.
- **Avviso**: `#B26A00` come testo su bianco fa 4,2:1. Resta per icone e bordi, mentre il testo usa `--tm-warning-text` (`#7A4900`).
- **Successo**: `#1B7F3B` sul suo sfondo tenue fa 4,4:1. Anche qui il testo usa la variante scura.
- **Errore nel tema scuro**: il rosso suggerito, vicino al rosa del brand (`#E5798B`), si confondeva. Il colore è spostato verso il corallo (`#FF7B66`). Inoltre il pulsante distruttivo ha sempre il fondo tinto di errore, mentre il secondario è trasparente: si distinguono per struttura, oltre che per icona e testo.
- **Fondo scuro**: `#100F0F` invece di `#0F0F10`, che è leggermente freddo; la guida chiede un nero caldo.
- **Contrasto**: tutte le coppie testo e fondo sono verificate AA in entrambi i temi. Il testo più basso è il link scuro su superficie attenuata, a 5,5:1.

## Revisione 1 (feedback sul catalogo)
- **Tabelle sostituite da collezioni a card** (`tm-collection` + `tm-entity`): un solo layout a ogni larghezza, griglia a una colonna su telefono e a più colonne quando c'è spazio. Ricerca, filtri, ordinamento (per cognome) e selezione sono identici su mobile e desktop. Le schermate 23 (rosa) e 29 (inviti e ruoli) useranno questo pattern al posto delle tabelle. `tm-table` è stato rimosso dal CSS dell'app.
- **Rosso primario nel tema scuro**:
  - Il primario pieno passa da `#A3182E` a un vino più profondo (`#8C1D31`, testo bianco 9,0:1), senza bordo chiaro.
  - Secondario e terziario diventano neutri (testo chiaro, bordo vino attenuato `#AF6E7A`), quindi il bordeaux resta solo al pulsante principale, ai link e alla voce attiva.
  - L'errore resta corallo con fondo tinto: nel tema scuro primario ed errore si distinguono per luminosità e per forma (pieno contro tinto con bordo).
  - Nel tema chiaro nulla cambia.
- **Intestazione di gruppo sostituita dall'agenda** (`tm-agenda`, `tm-day`, `tm-event-item`): la data è un riquadro a sinistra (giorno della settimana, numero, mese) che raggruppa gli eventi dello stesso giorno; oggi ha bordo e scritta "Oggi". Serve al calendario e ai "Prossimi eventi" delle home.
- **Riga di lista a zone fisse**:
  - inizio: numero di maglia in colonna da 28 px allineato a destra, poi avatar;
  - corpo: nome, ruolo, stato, ognuno su una propria riga;
  - fine: una sola azione da 44 px.
  Numero e stato non si spostano più in base alla lunghezza del testo.

## Revisione 4 (palette scelta: Petrolio intenso, fondo ghiaccio e petrolio scuro)
- **Sostituisce Inchiostro + bordeaux** (Revisione 3). Token riscritti in `css/tokens.css` (versione 2.0); markup invariato.
- **Tema chiaro**: fondo ghiaccio `#F4F7F8`, card bianche, superficie attenuata `#E9EFF1`, bordi `#DAE3E6`. Pulsante primario `#007A7E` (testo bianco 5,1:1; 3,9:1 rispetto al nero del testo). Link, contorni, voce attiva e focus `#006F76`, appena più scuro, per restare AA anche sulle superfici attenuate.
- **Tema scuro**: fondo petrolio scuro `#0E1616`, card `#162020`, superficie rialzata `#243131`. Pulsante e accento `#4FD1C9` con testo scuro (9,9:1). Testo `#F1F4F4`, secondario `#B3BEBE`, bordi dei controlli `#869494`, contorno del secondario `#3F9A96`: tutti verificati sulla superficie più sfavorevole.
- **Accento** (checkbox, radio, interruttore, contatore notifiche, riga "Da avvisare", voce attiva): stesso petrolio del primario; il bordeaux non è più usato.
- **Successo** spostato verso il giallo (`#2E7D1F`, scuro `#9BD46A`) per staccarsi dal petrolio. Avviso, errore, info e squalifica invariati.
- **Verifica**: 27 coppie di contrasto per tema calcolate dai token, nessuna sotto soglia.
- **Logo**: ricolorato in modo provvisorio; i colori per il vettoriale sono in `assets/LOGO-COLORI.md`.

## Revisione dopo squalifiche (feedback)
- **Convocazione (18-19) a due colonne**: Convocati a sinistra, Non convocati a destra. La colonna di destra contiene prima i Convocabili (con il pulsante Convoca), poi i Non convocabili. Su telefono due schede: "Convocati" e "Non convocati". Sostituisce la versione a tre colonne.
- **Staff in verticale**: i gruppi Disponibili, Non disponibili, Senza risposta sono sempre impilati (larghezza massima 720 px), perché le persone sono poche. Il ruolo è in evidenza sopra il nome (Montserrat maiuscolo, colore del testo). Vale anche nel catalogo.
- **Squalifiche (34)**: elenco a righe di altezza uniforme (persona, residuo, badge); il dettaglio si apre in un pannello laterale da 1024 px, modale su tablet, foglio su telefono, con Modifica ed Elimina. Nuovo componente `tm-dialog--side` (USlideover) e riga cliccabile `tm-row--button`, documentati nel catalogo.
- **Assenze (33) in due viste**:
  - `33-assenze.html`, giocatore: "Le mie assenze", dal Profilo; solo l'interessato le imposta e modifica;
  - `33b-assenze-squadra.html`, staff: "Assenze" della squadra, da Rosa; elenco in sola lettura di giocatori e staff raggruppato per stato, più la scheda "Le mie" per le proprie assenze (anche lo staff ne dichiara).
- **Studio colori, seconda tornata**: Inchiostro + bordeaux (scelta attuale), Petrolio profondo e intenso, Blu notte profondo e intenso. Nuova misura "Primario rispetto al nero del testo" (consigliato almeno 3:1): le versioni profonde stanno a 2,5:1 e 1,8:1, le intense a 3,9:1 e 3,3:1. Petrolio intenso sposta il verde di successo verso il giallo; le palette blu spostano l'info al magenta. Il cambio di colore non è ancora applicato al design system.
- **Studio colori, fondi**: cinque fondi chiari (bianco, avorio, crema, carta, ghiaccio) e cinque scuri (nero caldo attuale, antracite, grafite calda, ardesia blu, petrolio scuro), combinabili con ogni palette. Le card restano un poco più chiare del fondo. La tabella dei contrasti si ricalcola sul fondo scelto; verificate tutte le 125 combinazioni: l'unico valore sotto soglia è la misura consigliata "Primario rispetto al nero del testo" per le palette profonde e per Inchiostro (che è nero per scelta). Petrolio intenso usa per link e contorni `#006F76`, appena più scuro del pulsante `#007A7E`, per restare AA sulle superfici attenuate dei fondi caldi.

## Integrazione: staff, disponibilità e assenze
Criterio applicato: mockup solo dove c'è un flusso nuovo, componente nel catalogo dove basta comporre.

| Punto | Dove | Perché |
|---|---|---|
| 1. Badge disponibilità e assenza | Catalogo, sezioni Badge e Disponibilità | Elementi riusabili |
| 2. Card "La tua disponibilità" (3 varianti) | Catalogo, ora; Home staff (12) quando sarà prodotta | La home 12 è ancora da fare |
| 3. "Staff presente" | Catalogo | Il dettaglio evento giocatore (15) lo costruisce Claude Code |
| 4. Sezione Staff del dettaglio evento staff | Catalogo, interattiva, e in fondo alla convocazione 18-19 | La convocazione è la tab "Convocazione" del dettaglio evento staff |
| 5. Assenza nei non convocabili | Mockup 18-19, aggiornato | Cambia un flusso esistente |
| 6. Staff nelle presenze | Presenze (22) quando sarà prodotta | La schermata 22 è ancora da fare |
| 7. Assenze | Nuovo mockup 33 | Flusso nuovo in due passi con validazione |
| 8. Notifica di assenza | Catalogo | Il centro notifiche (32) lo costruisce Claude Code |

- **"Senza risposta" dello staff è grigio** (come da integrazione), mentre quello dei giocatori è ambra. Restano distinguibili per contesto; da valutare se uniformarli.
- **Assenza tra i non convocabili**: è l'unica riga di quella lista con un'azione, "Convoca comunque", che sta sotto il testo perché la colonna può essere stretta. La conferma non è distruttiva. Chi viene convocato comunque mostra anche tra i convocati l'etichetta dell'assenza; se viene tolto torna tra i non convocabili.
- **Assenze, secondo passo**: compare solo se nel periodo ci sono eventi futuri in cui la persona era già convocata; altrimenti si chiude con un toast. Ogni "Declina" diventa il badge "Declinato".
- **Validazione delle date**: periodo dentro la stagione, fine non prima dell'inizio, almeno una delle due date di fine o "Fino a nuovo avviso". L'interruttore disabilita e svuota la data di fine.
- **Ordine delle assenze**: in corso, poi future dalla più vicina, poi passate dalla più recente.
- **Staff nella convocazione**: sezione in fondo, sotto le liste dei giocatori, con i tre gruppi (Disponibili, Non disponibili, Senza risposta), l'avviso "Nessun allenatore disponibile" e la propria riga con "Ci sono / Non posso". Su telefono è raggiungibile dal riepilogo in alto ("Staff: 2 disponibili su 4"), perché sotto 16 convocati sarebbe difficile da trovare. Da 720 px di spazio i tre gruppi si affiancano. Nell'evento passato anche la propria riga è in sola lettura.
- **Stati e squalifica (punto 10, sostituisce la versione precedente con Sospeso e Ceduto)**:
  - iscrizione giocatore con due soli valori, Disponibile e Infortunato; lo staff non ha stato manuale; Sospeso e Ceduto rimossi da badge, filtri, catalogo e convocazione;
  - nuovo badge Squalificato in ambra scura piena con icona cartellino (token `--tm-squal-bg` e `--tm-squal-text`, 7,5:1 nel chiaro e 11,1:1 nello scuro), con le varianti "Squalificato", "Squalificato, giornata 2 di 2", "Squalificato fino al 30/11"; in allenamento badge info "Squalificato, disponibile in allenamento";
  - convocazione di una partita: lo squalificato è tra i Non convocabili senza azioni; in allenamento (`?evento=allenamento`) è tra i Convocabili con il badge informativo, senza Titolare/Panchina e senza azione "Squalifica";
  - staff squalificato (`?staff=squalificato`): nella partita "Ci sono / Non posso" disabilitati con "Sei squalificato per questa partita", risulta tra i Non disponibili; in allenamento i controlli restano attivi;
  - il selettore di stato nella scheda persona è visibile solo a chi gestisce la squadra e all'admin, l'interessato lo vede in sola lettura.
- **Squalifiche (punto 11)**:
  - **Schermata 34**, mockup: elenco in corso, future, concluse; vista calendario con barre (a tempo) e iniziali sui giorni di partita (a giornate); foglio "Nuova squalifica"; varianti nessuna squalifica, residua a fine stagione, errore. Si raggiunge da Rosa.
  - **Azione "Squalifica" nella convocazione (18)**: nel menu a tre punti di ogni riga persona di una partita, compreso lo staff. Il foglio precompila persona e partita ("Dalla partita"); dopo il salvataggio la persona passa tra i Non convocabili, e se era già stata avvisata riceve un avviso. Per fare spazio al menu, "Togli dai convocati" ora sta nello stesso menu insieme a "Squalifica": è un tocco in più, da valutare.
  - **Interpretazione**: la partita precompilata è la prima partita coperta dalla squalifica, non la partita di origine, che resta un campo facoltativo.
  - **Partite coinvolte**: a giornate le prime N partite dalla data di inizio, a tempo quelle nel periodo. Se la stagione finisce prima, il residuo "passa alla prossima stagione".
  - **Scheda persona (24) e dettaglio evento staff (16)**: solo componenti nel catalogo, li costruisce Claude Code. L'azione "Squalifica" del dettaglio evento è la stessa della convocazione.
- **Disabilitazione e archivio (punto 11)**:
  - modale "Disabilita persona" nel catalogo, con le cinque conseguenze e l'alternativa "Chiudi solo l'iscrizione in questa squadra"; raggiungibile dalla scheda persona (zona Amministrazione, solo admin) e dal menu a tre punti delle card della Rosa;
  - **Archivio disabilitati (35)**: nel catalogo come componenti (banner, ricerca, riga con Riabilita ed Esporta dati), non come mockup: è una pagina elenco senza flussi nuovi, la costruisce Claude Code con il modello di pagina "lista".
- **Testo dell'integrazione**: il punto 7 contiene un paragrafo ripetuto (copia e incolla), considerato una sola volta.

## Decisioni sulla convocazione (risposte alla prima consegna)
1. **Navigazione su telefono**: la tab bar resta visibile anche nelle schermate di lavoro; la barra "Invia" sta sopra la tab bar. Per la navigazione interna si usa la testata con "indietro" (equivale a un breadcrumb di un livello). La variante senza tab bar resta disponibile (`?nav=senza-tab`) per confrontare lo spazio verticale: con la tab bar le righe visibili sono circa 4, senza circa 5.
2. **Colonne in base allo spazio, non al dispositivo**: container query sul contenitore della convocazione. Una colonna con le liste a schede sotto 720 px di spazio, due colonne da 720 px, tre da 960 px. Le larghezze minime delle colonne (340, 300, 240 px) sono calcolate per non troncare i nomi tipici; oltre quel limite il nome va in ellissi. Verificato senza troncamenti a 390, 700, 900, 1100, 1280 e 1600 px.
3. **Avatar e numero impilati**: avatar con il numero di maglia sotto, colonna larga quanto l'avatar. Negli sport individuali solo avatar.
4. **Impegnato altrove**: resta per i conflitti di calendario tra eventi. I periodi di indisponibilità dichiarati dall'atleta sono le Assenze ("Non disponibile fino al ...", vedi ANALISI.md e schermata 33).

## Schermate 18-21: convocazione
- **Un file per più schermate**: `screens/18-convocazione-staff.html` è un solo file responsive per telefono (18) e tablet/desktop (19).
  - Gli stati della schermata 20 si aprono con `?stato=vuoto` e `?stato=passato`.
  - La variante per sport individuale (21) si apre con `?sport=scherma`.
  - Le varianti sono raggiungibili anche dal pulsante "Valutazione" nella testata.
- **Testata di attività**: al posto del selettore squadra c'è "indietro" con titolo e data dell'evento. Componente aggiunto al catalogo. Vedi il punto 1 delle decisioni per la tab bar.
- **Titolare/Panchina**: un solo interruttore da 44 px con la lettera visibile (`tm-tp`), al posto dei due segmenti. Fa risparmiare circa 50 px per riga. È volutamente neutro: 18 riempimenti scuri competerebbero con "Invia".
- **Nuovo stato "Da avvisare"** (non presente nel brief): chi è appena aggiunto e non ha ancora ricevuto la notifica. Ha fondo d'accento e badge info. Dopo l'invio diventa "Senza risposta". "Convocato" resta per la vista del giocatore.
- **Regola delle liste** (revisione dopo la prima consegna):
  - tra i **Convocati** stanno solo gli stati Confermato, Senza risposta e Da avvisare; solo loro hanno Titolare/Panchina;
  - chi ha risposto che non può esserci (Declinato, con motivo) passa tra i **Non convocabili**, insieme a chi è escluso per infortunio, squalifica o certificato; nessuna azione, nessun Titolare/Panchina;
  - chi viene tolto dai convocati torna tra i Convocabili, oppure tra i Non convocabili se il suo stato lo esclude.
- **Togliere qualcuno dai convocati**:
  - se era solo "Da avvisare", senza conferma;
  - se aveva già ricevuto la convocazione, con conferma: la persona riceve un avviso.
- **Sovrapposizione**:
  - il convocabile impegnato mostra il badge "Impegnato altrove" con l'orario;
  - "Convoca" chiede conferma;
  - il dettaglio "Anche in Under 18" non viene mostrato, per non esporre informazioni di un'altra squadra. Da decidere se mostrarlo allo staff che gestisce entrambe le squadre.
- **Certificato in scadenza**: con la regola "solo avviso" la persona resta tra i convocabili con il badge "In scadenza" e la data.
- **Evento passato**: tutto in sola lettura. Titolare/Panchina appare come etichetta. Chi era "Da avvisare" non compare tra i convocati, perché non è mai stato avvisato.
- **Dati**: le liste sono generate da `js/convocazione.js` a partire da dati in memoria. Il markup delle righe è lo stesso del catalogo ("Riga di convocazione").

## Revisione 3 (palette scelta: Inchiostro + bordeaux)
- **Azioni in inchiostro**: pulsante primario, secondario, terziario e pulsante flottante sono neri nel tema chiaro (testo bianco, 19,9:1) e quasi bianchi nel tema scuro (testo scuro, 17,1:1). Nessuna sovrapposizione con il rosso di errore.
- **Bordeaux come accento** (nuovi token `--tm-accent`, `--tm-on-accent`, `--tm-accent-soft`):
  - link, voce di navigazione attiva, focus, passo corrente dello stepper;
  - controlli selezionati (checkbox, radio, interruttore);
  - contatore delle notifiche;
  - logo.
  Nel tema scuro l'accento è `#E5798B`, con testo scuro sopra.
- **Logo per fondo scuro**: `assets/logo-dark.png` è una versione provvisoria (bordeaux schiarito a `#D2445C`, nero portato a `#F3F2F2`, payoff in grigio chiaro) ottenuta dall'immagine attuale.
- **Icona app**: in `assets/app-icon.png` il fondo bianco attorno al quadrato era stato reso trasparente insieme al bianco del simbolo, che sul tema scuro appariva nero. Ora è trasparente solo l'esterno del quadrato arrotondato: il simbolo resta bianco e nero su bordeaux in entrambi i temi, identico all'originale (senza l'ombra esterna). Sostituisce il segnaposto; va rimpiazzata con l'esportazione dal file vettoriale.
- **Deroga al brief**: il brief chiedeva il bordeaux sui pulsanti primari. La scelta è stata cambiata dopo lo studio colori (`studio-colori.html`), che resta nel pacchetto come documentazione della decisione.
- **Nuxt UI**: primario come scala neutra, bordeaux come colore aggiuntivo del brand; da verificare la configurazione esatta in `app.config.ts`.

## Revisione 2 (bordi nel tema scuro)
- I bordi di secondario e controlli nel tema scuro erano misurati solo sulla superficie base (circa 3,2:1). Su superficie attenuata e rialzata (fogli, menu, card muted) scendevano a 2,6:1, sotto il minimo di 3:1. Ora sono calibrati sul caso peggiore, la superficie rialzata: `--tm-dk-border-strong` `#837F7F` e `--tm-burgundy-dark-outline` `#AF6E7A` stanno ad almeno 3,6:1 ovunque. Lo studio colori misura il bordo sulla superficie più sfavorevole.

## Scelte di interfaccia
- **Tab bar**: le etichette sono a 12 px, perché accompagnano sempre un'icona di 24 px. Per l'admin la quarta voce si chiama "Società" e porta ad Amministrazione: "Amministrazione" non sta in 97 px.
- **Contatore notifiche**: 12 px, su una pillola di 20 px.
- **Esiti presenze e tab della convocazione**: restano a 14 px. Le etichette lunghe vanno a capo invece di essere troncate. Verificato a 390 px con Inter.
- **Card in evidenza**: si distingue con un bordo più marcato e non con un riempimento bordeaux.
- **Barra di avanzamento**: è neutra, perché non è un'azione.
- **Breadcrumb**: i link sono grigi, perché sono navigazione e non azione.
- **Colori degli stati di convocazione**:
  - declinato: errore
  - senza risposta: avviso
  - convocato: info
  - confermato: successo
- **Swipe sulle righe**: sostituito dal menu a tre punti, perché lo swipe non è scopribile né usabile da tastiera.
- **Pulsanti in caricamento**: lo spinner prende il posto dell'icona iniziale, come fa `UButton`. I pulsanti che possono caricare hanno quindi sempre un'icona.
- **Link nelle frasi**: un link dentro una frase (es. "Termini") resta sotto i 44 px, come prevede l'eccezione WCAG 2.5.8 per i link inline. I link autonomi hanno area di tocco di 44 px.

## Dati di esempio
- **Date**: calendario 2026, coerente con la data odierna (gio 5 nov 2026). Il prossimo evento è quindi "sab 7 nov" e non "sab 8 nov".
- **Società**: ASD Polisportiva Valdarno (Figline Valdarno), con Calcio (Under 17, Prima squadra, Under 15) e Scherma.
- **Partita di riferimento**: Under 17 contro US Pontassieve, Campo comunale Via dello Sport.
- **Conteggi**: unificati su 16 convocati (9 confermati, 2 declinati, 5 senza risposta), 7 convocabili e 3 non convocabili. Il brief usava sia 14 sia 16 convocati.

## Tecnica del mockup
- **Icone**: le definisce `js/icons.js`, che inietta lo sprite perché `<use href="file.svg#id">` non funziona aprendo i file con doppio clic. La sorgente è `assets/icons.svg`; in Nuxt va sostituita con un componente icona.
- **Bottom sheet e modali**: usano `<dialog>` nativo (focus intrappolato, Esc, ritorno del focus).
- **Tema**: la scelta del selettore viene ricordata in `localStorage`, solo per la valutazione.
- **Campi data**: mostrano il formato della lingua del browser.
- **Mappatura Nuxt UI**:
  - `UEmpty` va verificato sulla versione in uso.
  - La tab bar non ha un equivalente diretto.
- **File per il solo catalogo**: `css/docs.css` serve solo a `components.html` e non va portato in Nuxt.
