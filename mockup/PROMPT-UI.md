# Prompt per il mockup UI di TeamManix

Incolla tutto quello che segue (dalla riga "RUOLO" in giù) in una conversazione con Claude. Allega il logo approvato (SVG o PNG con sfondo trasparente) in versione per fondo chiaro e, se esiste, anche per fondo scuro e, se vuoi, `mockup/convocazione.html` come riferimento di contenuto (non di stile).

---

RUOLO

Sei un product designer e front-end developer senior. Devi produrre il mockup HTML+CSS navigabile di TeamManix, una web app PWA per la gestione di squadre sportive (calcio, pallavolo, scherma, ecc.). Il mockup è la fonte di verità visiva: dopo la tua consegna lo sviluppatore costruirà il frontend Nuxt (con Nuxt UI v4 e Tailwind) adattandolo al tuo mockup, quindi struttura, nomi e token devono essere puliti e riusabili. Niente decorazioni inutili: l'interfaccia è uno strumento di lavoro quotidiano, usato spesso da telefono, a bordo campo, con una mano.

PRODOTTO E UTENTI

- Piattaforma gratuita e self-service. Più società sportive indipendenti, ognuna multi-sport. Gerarchia: Società > Attività (disciplina) > Squadra > Stagione.
- Un account globale (email + password) può appartenere a più società, una alla volta. Selettore squadra nell'header, la società è implicita nell'account.
- Ruoli: giocatore, staff (allenatore e collaboratori), dirigente (lettura nel suo ambito), admin società.
- Obiettivo dell'MVP: un allenatore pianifica allenamenti e partite, convoca con risposta del giocatore da tre liste (convocati, convocabili, non convocabili), rileva le presenze e controlla i certificati medici scaduti, tutto dal telefono.
- Lingua dell'interfaccia: italiano. Dati di esempio realistici e italiani (nomi, squadre come "Under 17", "Prima squadra", impianti come "Campo comunale Via dello Sport", avversari, date in formato "sab 8 nov", orari 24h).
- Mobile-first (390 px di riferimento), poi tablet (768 px) e desktop (1280 px).

DESIGN SYSTEM: REGOLE NON NEGOZIABILI

- Bordeaux (#790F20) per pulsanti primari, link, stato attivo della navigazione, focus ring e azioni importanti. Mai come grande riempimento di superfici. Usalo con parsimonia: se tutto è bordeaux, niente è importante.
- Nero (#090909) per testi principali e titoli.
- Bianco come sfondo prevalente. Superfici secondarie in grigio 100 (#F5F5F5), mai colori di fondo decorativi.
- Grigio per descrizioni, informazioni secondarie e separatori. Per testo secondario usa grigio 700 (#4A4A4A). Il grigio 500 (#777777) ha contrasto 4,48:1 su bianco, sotto il minimo AA di 4,5:1: usalo solo per elementi decorativi e icone, non per testo a corpo piccolo, nemmeno per i placeholder (usa grigio 700 con opacità piena o testo più grande).
- Montserrat per titoli, eyebrow, etichette di sezione e numeri in evidenza. Inter per tutto il resto (testi, form, tabelle, pulsanti, navigazione).
- Il wordmark TEAMMANIX del logo approvato è un elemento grafico originale: non ricrearlo con Montserrat né con altri font. Usa l'immagine allegata. Se manca, inserisci un segnaposto SVG grigio con la scritta "LOGO" e dimensioni reali (altezza 28 px in header, 40 px nelle schermate di accesso) e un `<img>` pronto da sostituire.
- Stile piatto: card con bordo 1 px grigio 200 e raggio 16 px, senza ombre. Ombra leggera ammessa solo su elementi che galleggiano (menu a tendina, bottom sheet, toast, modale).
- Colori di stato convenzionali, SEMPRE accompagnati da icona e testo (mai solo colore, per l'accessibilità): successo #1B7F3B, avviso #B26A00, errore #C62828, info #1F5FA8. Ognuno con sfondo tenue (tinta al 10%) e testo scuro leggibile. L'errore deve essere visivamente distinto dal bordeaux del brand (icona e testo "Errore" o equivalente, non solo il tono).
- Temi: il mockup deve avere SUBITO sia il tema chiaro sia il tema scuro, con le stesse regole di brand. Tutti i colori sono variabili CSS semantiche (sfondo, superficie, superficie attenuata, bordo, testo, testo secondario, primario, link, focus, stati) ridefinite per il tema scuro sotto `[data-theme="dark"]` e, per chi non ha scelto, sotto `@media (prefers-color-scheme: dark)` guardato da `:root:not([data-theme="light"])`. Nessun colore scritto a mano nelle pagine. L'utente sceglie Chiaro, Scuro o Automatico (segue il sistema) nel Profilo; nel mockup aggiungi un interruttore di tema nell'indice, in `components.html` e nell'header di ogni schermata (solo per valutazione) che imposta `data-theme` sull'elemento html. Dichiara `color-scheme: light dark` di conseguenza.
- Tema scuro, indicazioni (valori indicativi da verificare, sei libero di correggerli): sfondo quasi nero e leggermente caldo (circa #0F0F10), superficie circa #1A1A1B, superficie attenuata circa #242424, bordi circa #343434, testo circa #F5F5F5, testo secondario circa #B8B8B8. Mai nero puro #000 e mai bianco puro come testo corpo. ATTENZIONE: il bordeaux #790F20 su fondo scuro ha contrasto circa 1,8:1, quindi come testo, link, icona attiva o focus ring non è leggibile. Nel tema scuro usa una variante più chiara dello stesso colore (circa #E5798B per link, testo e icone attive, contrasto AA) e per i pulsanti primari un bordeaux riempito più luminoso (circa #A3182E) con testo bianco, verificando contrasto e riconoscibilità del bordo. Il brand resta riconoscibile: stessa tinta, luminosità adattata. Le ombre sul tema scuro non funzionano: per gli elementi flottanti usa superficie più chiara e bordo, non ombra.
- Stati nel tema scuro: ridefinisci successo, avviso, errore e info con tinte più chiare e sfondi tenui scuri, sempre con icona e testo e contrasto AA. L'errore resta distinguibile dal bordeaux anche nel tema scuro.
- Logo nel tema scuro: il wordmark originale non va ricreato né ricolorato con filtri o CSS. Se è stata allegata una versione per fondo scuro usala, altrimenti inserisci un segnaposto con la nota "serve versione del logo per fondo scuro" e mettilo in `assets/` come `logo-dark` da sostituire. Prevedi il cambio con `<picture>` o due immagini mostrate per tema.
- Target touch minimo 44x44 px su ogni controllo. Focus visibile su tutti gli elementi interattivi (anello bordeaux già definito). Contrasto AA su tutto il testo. Nessuna informazione solo a colore.

Foglio di stile di riferimento. È una GUIDA di indirizzo, non un file da replicare: serve a farti capire l'identità visiva (colori, caratteri, forme, densità, tono dei componenti). Non copiarlo as-is e non considerarlo completo. Sono fissi solo gli elementi elencati nelle regole sopra (bordeaux #790F20, nero #090909, bianco come fondo, grigi come ruolo, Montserrat per i titoli, Inter per l'interfaccia, logo originale). Tutto il resto (scala dei grigi, dimensioni, raggi, spaziature, stile e stati dei componenti, nomi dei token) puoi rivederlo, correggerlo ed estenderlo con il tuo giudizio, purché resti coerente con questa identità e rispetti i criteri di accessibilità. Se un valore del foglio contraddice una regola di accessibilità (es. il placeholder in grigio 500), correggilo e annota la modifica nelle Assunzioni:

```css
/* =========================================================
   TEAMMANIX — Brand stylesheet
   Versione 1.0 | Colori e tipografia di base
   Marchio di riferimento: logo approvato dall'utente.
   ========================================================= */

/* Font web: Montserrat per titoli, Inter per interfaccia e testi.
   In produzione è preferibile ospitare i font localmente. */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Montserrat:wght@500;600;700;800&display=swap');

:root {
  /* BRAND COLORS */
  --tm-burgundy: #790F20;
  --tm-black: #090909;
  --tm-white: #FFFFFF;

  /* NEUTRALS */
  --tm-gray-900: #242424;
  --tm-gray-700: #4A4A4A;
  --tm-gray-500: #777777;
  --tm-gray-300: #D9D9D9;
  --tm-gray-200: #EAEAEA;
  --tm-gray-100: #F5F5F5;

  /* SEMANTIC COLORS */
  --tm-color-primary: var(--tm-burgundy);
  --tm-color-text: var(--tm-black);
  --tm-color-text-muted: var(--tm-gray-700);
  --tm-color-background: var(--tm-white);
  --tm-color-surface: var(--tm-white);
  --tm-color-border: var(--tm-gray-300);

  /* TYPOGRAPHY */
  --tm-font-heading: 'Montserrat', Arial, sans-serif;
  --tm-font-body: 'Inter', Arial, sans-serif;

  --tm-text-xs: 0.75rem;   /* 12px */
  --tm-text-sm: 0.875rem;  /* 14px */
  --tm-text-md: 1rem;      /* 16px */
  --tm-text-lg: 1.125rem;  /* 18px */
  --tm-text-xl: 1.25rem;   /* 20px */
  --tm-text-2xl: 1.5rem;   /* 24px */
  --tm-text-3xl: 2rem;     /* 32px */
  --tm-text-4xl: 2.5rem;   /* 40px */

  /* SHAPE & SPACING */
  --tm-radius-sm: 6px;
  --tm-radius-md: 10px;
  --tm-radius-lg: 16px;
  --tm-radius-pill: 999px;
  --tm-space-1: 4px;
  --tm-space-2: 8px;
  --tm-space-3: 12px;
  --tm-space-4: 16px;
  --tm-space-6: 24px;
  --tm-space-8: 32px;

  /* FOCUS */
  --tm-focus-ring: 0 0 0 3px rgba(121, 15, 32, 0.22);
}

/* BASE */
html {
  color-scheme: light;
  font-size: 16px;
}

body {
  margin: 0;
  background: var(--tm-color-background);
  color: var(--tm-color-text);
  font-family: var(--tm-font-body);
  font-size: var(--tm-text-md);
  font-weight: 400;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

/* HEADINGS */
h1, h2, h3, h4, h5, h6,
.tm-heading {
  margin: 0 0 0.6em;
  color: var(--tm-black);
  font-family: var(--tm-font-heading);
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: -0.025em;
}

h1 { font-size: clamp(2rem, 4vw, var(--tm-text-4xl)); }
h2 { font-size: clamp(1.5rem, 3vw, var(--tm-text-3xl)); }
h3 { font-size: var(--tm-text-2xl); }
h4 { font-size: var(--tm-text-xl); }

p, li, label, input, button, select, textarea {
  font-family: var(--tm-font-body);
}

/* BRAND ELEMENTS */
.tm-brand { color: var(--tm-burgundy); }
.tm-text-muted { color: var(--tm-gray-700); }

.tm-eyebrow {
  color: var(--tm-burgundy);
  font-family: var(--tm-font-heading);
  font-size: var(--tm-text-xs);
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

/* LINKS */
a {
  color: var(--tm-burgundy);
  text-decoration-thickness: 1px;
  text-underline-offset: 0.18em;
}
a:hover { color: #5F0B19; }

/* BUTTONS */
.tm-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--tm-space-2);
  min-height: 44px;
  padding: 0.7rem 1.1rem;
  border: 1px solid transparent;
  border-radius: var(--tm-radius-md);
  background: var(--tm-burgundy);
  color: var(--tm-white);
  font-size: var(--tm-text-sm);
  font-weight: 700;
  cursor: pointer;
}
.tm-button:hover { background: #650C1B; }
.tm-button:focus-visible,
a:focus-visible,
input:focus-visible,
select:focus-visible,
textarea:focus-visible {
  outline: none;
  box-shadow: var(--tm-focus-ring);
}
.tm-button--secondary {
  border-color: var(--tm-burgundy);
  background: var(--tm-white);
  color: var(--tm-burgundy);
}
.tm-button--secondary:hover {
  background: #F8F0F2;
}

/* FORM FIELDS */
.tm-input {
  box-sizing: border-box;
  width: 100%;
  min-height: 44px;
  padding: 0.65rem 0.8rem;
  border: 1px solid var(--tm-gray-300);
  border-radius: var(--tm-radius-sm);
  background: var(--tm-white);
  color: var(--tm-black);
  font-size: var(--tm-text-sm);
}
.tm-input::placeholder { color: var(--tm-gray-500); }

/* SURFACES */
.tm-card {
  padding: var(--tm-space-6);
  border: 1px solid var(--tm-gray-200);
  border-radius: var(--tm-radius-lg);
  background: var(--tm-white);
}
.tm-surface-muted { background: var(--tm-gray-100); }

/* TABLES */
.tm-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--tm-text-sm);
}
.tm-table th {
  background: var(--tm-gray-100);
  color: var(--tm-gray-700);
  font-weight: 700;
  text-align: left;
}
.tm-table th, .tm-table td {
  padding: 0.8rem 1rem;
  border-bottom: 1px solid var(--tm-gray-200);
}

/* STATUS: keep the brand palette for identity, not for every status.
   Use conventional semantic colors for success/warning/error states. */
```

Nota sui font: il `@import` di Google Fonts va bene per il mockup. In produzione i font saranno ospitati localmente (GDPR), quindi dichiara `--tm-font-heading` e `--tm-font-body` con fallback di sistema già pronti e non aggiungere altre fonti.

Il tuo design system CSS (token e componenti, senza valori sparsi nelle pagine) deve coprire almeno questi aspetti, partendo dalla guida e completandola:
- Token di stato: `--tm-success`, `--tm-warning`, `--tm-danger`, `--tm-info` con le rispettive varianti `-bg` (tinta tenue) e `-text` (scura, contrasto AA).
- Scala di spaziatura aggiuntiva: `--tm-space-5: 20px`, `--tm-space-10: 40px`, `--tm-space-12: 48px`.
- Altezze fisse: header 56 px su mobile e 64 px su desktop, bottom tab bar 64 px più safe area iOS (`env(safe-area-inset-bottom)`).
- Griglia: gutter laterale 16 px su mobile, 24 px su tablet, contenuto massimo 1120 px centrato su desktop, sidebar 248 px su desktop.
- Breakpoint: 640, 768, 1024, 1280 px.
- Ombra per elementi flottanti: `--tm-shadow-float: 0 8px 24px rgba(9, 9, 9, 0.12)`.
- Z-index a livelli nominati (header, sheet, modale, toast).

TIPOGRAFIA D'USO

- Titolo di pagina: Montserrat 700, 24 px mobile e 32 px desktop. Titolo di sezione: Montserrat 600, 18 o 20 px. Eyebrow sopra i titoli di sezione (`tm-eyebrow`): usalo con parsimonia, solo dove aiuta l'orientamento (es. "PROSSIMO EVENTO").
- Testo corpo Inter 400, 16 px su mobile (mai sotto 14 px per testo operativo, 12 px solo per metadati e badge). Etichette e pulsanti Inter 600/700, 14 px.
- Numeri in evidenza (conteggi convocati, giorni alla scadenza): Montserrat 700, 24-32 px.
- Date e orari sempre in formato esteso e coerente: "Sabato 8 novembre, 15:30". Nelle liste compatte "sab 8 nov · 15:30".

COMPONENTI DA REALIZZARE (con tutti gli stati)

Realizza una pagina `components.html` che mostra ogni componente nei suoi stati e in entrambi i temi. Per ogni componente aggiungi un attributo `data-nuxt-ui` con il componente Nuxt UI equivalente (es. `data-nuxt-ui="UButton"`), così lo sviluppatore sa a cosa mapparlo.

1. Pulsanti: primario (bordeaux pieno), secondario (outline bordeaux), terziario/ghost (testo bordeaux senza bordo), distruttivo (usa testo e bordo errore, mai bordeaux), solo icona (44x44). Stati: normale, hover, focus, premuto, disabilitato, caricamento (spinner, testo invariato, larghezza invariata). Dimensione piena larghezza su mobile per le azioni principali di una schermata.
2. Campi form: testo, email, password con mostra/nascondi, data, telefono, select, textarea, checkbox, radio, interruttore, controllo segmentato (per esiti a 3-4 opzioni). Etichetta sopra il campo, testo di aiuto sotto, messaggio di errore con icona sotto il campo, stato disabilitato, stato in sola lettura. Mai placeholder al posto dell'etichetta.
3. Badge e chip di stato: convocazione (convocato, confermato, declinato, senza risposta), disponibilità staff (disponibile, non disponibile, senza risposta), assenza ("Non disponibile fino al 15/11"), iscrizione (disponibile, infortunato, solo per i giocatori), squalifica ("Squalificato", "Squalificato, giornata 1 di 2", "Squalificato fino al 30/11"), certificato (valido, in scadenza, scaduto, mancante), stagione (bozza, attiva, chiusa), invito (inviato, accettato, revocato, scaduto), tipo evento (allenamento, partita, altro, con icona). Pillola 24 px di altezza, icona + testo.
4. Card: card evento (data, orario, tipo, impianto, avversario, stato risposta), card persona (avatar con iniziali, nome, ruolo, badge), card KPI (numero grande Montserrat, etichetta, variazione), card avviso (certificato in scadenza).
5. Liste: riga lista standard (avatar, titolo, sottotitolo, azione a destra, altezza minima 56 px, separatore grigio 200), riga con azione swipe o menu a tre punti, intestazione di gruppo (giorno nel calendario).
6. Navigazione: bottom tab bar mobile (4 voci + "Altro"), sidebar desktop, header con selettore squadra, breadcrumb su desktop, tab orizzontali, segmented control, paginazione.
7. Overlay: bottom sheet (mobile) che diventa modale centrata (desktop), modale di conferma (con variante distruttiva), menu a tendina, toast (successo, errore, info), banner di sistema (offline, "scheda da completare").
8. Tabelle desktop (`tm-table`) con ordinamento, filtri, riga selezionabile; su mobile le stesse tabelle diventano liste di card (mostra il pattern).
9. Stati di pagina: vuoto (icona, titolo, frase, una sola azione), caricamento (skeleton che replica la forma del contenuto, niente spinner a pagina intera), errore (messaggio comprensibile, riprova), offline (banner "Sei offline: puoi solo consultare i dati").
10. Avatar (iniziali su grigio 100, foto), logo società (quadrato arrotondato 40 px con segnaposto), indicatore di avanzamento (stepper per la chiusura stagione).

SHELL DELL'APP

- Mobile: header fisso 56 px con a sinistra il selettore di squadra (nome squadra + chevron, apre un bottom sheet con l'elenco delle squadre dell'utente e, sotto, "Cambia società" se ne ha più di una), a destra campanella notifiche con badge numerico e avatar. Sotto, bottom tab bar fissa con voci in base al ruolo:
  - Giocatore: Home, Calendario, Profilo, Altro.
  - Staff: Home, Calendario, Rosa, Altro.
  - Dirigente: Home, Calendario, Rosa, Altro (sola lettura).
  - Admin: Home, Calendario, Rosa, Amministrazione (con "Altro" nel menu del profilo).
  Voce attiva: icona e testo bordeaux con barra superiore 2 px bordeaux. Voci inattive grigio 700.
- Desktop: sidebar sinistra 248 px bianca con bordo destro grigio 200: logo in alto, selettore società e squadra, voci con icona, sezione "Amministrazione" visibile solo all'admin. Header di pagina con titolo, azioni primarie a destra, breadcrumb sopra.
- Il nome della società appare sempre in modo discreto (selettore, titoli delle notifiche) perché l'utente può appartenere a più società.

SCHERMATE DA PRODURRE

Ogni schermata in un file HTML separato dentro `screens/`, con variante mobile (390 px) e, dove indicato, tablet/desktop. Usa un frame di presentazione (bordo sottile attorno allo schermo simulato) solo nella pagina indice, non dentro i file schermata: i file schermata devono essere HTML reale a larghezza piena, responsive, pronto da portare in Nuxt.

A. Accesso e onboarding (senza shell, layout centrato su fondo bianco, logo in alto, card larga max 440 px)
1. Login: email, password con mostra/nascondi, link "Password dimenticata?", pulsante "Accedi", sotto "Non hai un account? Registrati". Stato errore generico "Email o password non corrette" (stesso messaggio per ogni causa). Spazio predisposto, nascosto, per "Accedi con Google" (arriverà dopo).
2. Registrazione: nome, cognome, email, password con indicazione requisiti, checkbox obbligatorio "Accetto Termini e Informativa privacy" con link, pulsante "Crea account". Errori inline.
3. Controlla la tua email: schermata di conferma generica dopo registrazione, recupero password e reinvio verifica ("Se l'indirizzo è valido, riceverai un'email a breve"). Pulsante "Reinvia email" con countdown, link "Torna all'accesso". Il testo è lo stesso in tutti e tre i casi (non rivelare se l'account esiste).
4. Verifica email: esiti "Email verificata, accedi" e "Link non valido o scaduto" con azione di reinvio.
5. Password dimenticata e Reimposta password (nuova password + conferma, esito).
6. Primo accesso senza società: due scelte affiancate (card): "Crea la tua società" e "Ho ricevuto un invito" (spiega che il link arriva via email).
7. Crea società: nome società, creazione automatica come admin, riquadro con accettazione dell'accordo di trattamento dati (DPA) per il titolare, pulsante "Crea società".
8. Accetta invito: riepilogo (società, ruolo proposto, chi invita, scadenza), pulsante "Accetta invito". Stato "Invito non valido o scaduto" identico per ogni causa di errore. Variante in cui l'utente non è loggato: "Accedi o registrati con questo indirizzo email".
9. Completa la tua scheda: dopo invito come giocatore o staff, l'invitante ha inserito solo nome ed email, quindi mostra cognome, data di nascita, telefono (opzionale), con barra di avanzamento e banner "Scheda da completare" riutilizzabile in app.
10. Selettore società: elenco delle società dell'utente (logo, nome, ruoli, badge "Scheda da completare" dove serve), tap per entrare.

B. Home (con shell)
11. Home giocatore: card "Prossimo evento" in evidenza con data, ora, luogo, e la RISPOSTA IN UN TAP: due pulsanti grandi affiancati "Ci sono" (primario) e "Non posso" (secondario). Con "Non posso" si apre un bottom sheet con motivo da elenco chiuso (Impegno personale, Lavoro, Non disponibile), nessun testo libero. Dopo la risposta lo stato diventa "Confermato" con possibilità di cambiare. Sotto: avviso certificato medico (in scadenza o scaduto, con link per caricarlo), poi "Prossimi eventi" in lista compatta. Varianti: nessun evento in programma, risposta già data, convocazione con sovrapposizione ("Hai un altro impegno alla stessa ora").
12. Home staff: card prossimo evento con avanzamento risposte (es. "11 su 16 hanno risposto", barra), pulsante "Gestisci convocazione", KPI (convocati, confermati, senza risposta), avviso "3 certificati scadono entro 30 giorni" con elenco, azioni rapide ("Nuovo evento", "Rileva presenze"). Sopra le azioni rapide, card "La tua disponibilità" per il prossimo evento con "Ci sono" e "Non posso" in un tap (lo staff si dichiara da solo, come i giocatori). Variante staff squalificato: per quella partita pulsanti disabilitati con "Sei squalificato per questa partita", per gli allenamenti restano attivi.
13. Home dirigente e admin: KPI di società o ambito, squadre con stato, certificati in scadenza. Per l'admin banner "Invita il tuo staff" se la società è nuova (stato vuoto guidato con checklist: crea attività, crea squadra, crea stagione, invita).

C. Calendario ed eventi
14. Calendario: vista a lista raggruppata per giorno (predefinita su mobile) e vista mese (desktop), filtro squadra, filtro tipo (tutti, allenamenti, partite). Ogni riga evento: ora, tipo con icona, titolo, luogo, stato risposta del giocatore o conteggio convocati per lo staff. Pulsante flottante "+" per lo staff.
15. Dettaglio evento (giocatore): informazioni, impianto con indirizzo e link mappa, elenco convocati con risposte (nomi e stato, senza i non convocati), sezione "Staff presente" con i soli membri disponibili, pulsanti di risposta.
16. Dettaglio evento (staff): informazioni, tab "Convocazione", "Presenze", "Dettagli", azioni modifica ed elimina. Nella tab "Convocazione" una sezione "Staff" con disponibili, non disponibili e senza risposta (sola lettura, ognuno si dichiara da solo) e l'avviso opzionale "Nessun allenatore disponibile".
17. Crea/modifica evento: tipo (allenamento, partita, altro), data, ora inizio e fine, impianto (select + "nuovo impianto"), per le partite avversario, casa/trasferta, competizione; ricorrenza (settimanale, fino a data, giorni della settimana) con riepilogo "12 eventi verranno creati"; note.

D. Convocazione (la schermata più importante: progettala con più cura delle altre)
18. Convocazione staff su telefono: titolo evento e data in testata fissa, sotto un segmented control a tre tab con contatori: "Convocati (14)", "Convocabili (9)", "Non convocabili (3)". Ogni riga persona: avatar, nome, numero maglia, posizione (etichetta opzionale), badge di stato. Nella tab Convocabili ogni riga ha un pulsante "Convoca" da 44 px (tap singolo sposta nella lista Convocati con breve animazione). Nella tab Convocati: stato risposta (convocato, confermato, declinato con motivo, senza risposta) e azione "Rimuovi". Nella tab Non convocabili: motivo (infortunato, squalificato solo per le partite con "Squalificato, giornata 1 di 2" e nessun pulsante per forzare, certificato scaduto o mancante, assenza dichiarata con l'etichetta "Non disponibile fino al 15/11", senza motivo) e, se la società ha impostato il solo avviso, la riga appare in Convocabili con badge di avviso. Per il calcio un interruttore T/P (Titolare/Panchina) accanto a ogni convocato, visibile solo allo staff. Barra azione fissa in basso: "Invia convocazione a 4 nuovi convocati" (solo i nuovi), disabilitata se nessun nuovo. Riga di riepilogo in alto: "14 convocati · 9 confermati · 3 senza risposta".
19. Stessa schermata su tablet e desktop: tre colonne affiancate con le tre liste, spostamento a tocco o clic con il pulsante di riga (nessun drag and drop obbligatorio), pannello riepilogo.
20. Stati della convocazione: vuoto (nessun convocato: "Scegli dai convocabili"), avviso sovrapposizione eventi ("Anche in Under 18 alle 15:30"; lo staff dell'altra squadra vede solo "Impegnato altrove"), avviso certificato in scadenza, conferma invio con riepilogo, invio riuscito (toast), evento passato in sola lettura, squalificato in un allenamento (compare tra i convocabili con badge informativo "Squalificato, disponibile in allenamento").
21. Variante sport individuale (scherma): stessa convocazione a tre liste, senza interruttore T/P e con terminologia "gara".

E. Presenze
22. Rilevazione presenze: elenco rosa e, in una sezione separata "Staff", i membri dello staff disponibili, con controllo segmentato a 4 esiti (Presente, In ritardo, Assente giustificato, Assente), un tap per persona, pulsante "Segna tutti presenti" in alto, contatore, salvataggio. Nessun campo di testo libero (niente note, per non far entrare dati sanitari). Pensata per l'uso a bordo campo con una mano: righe alte, pulsanti grandi.

F. Persone e certificati
23. Rosa (staff): lista con ricerca, filtri (stato incluso squalificato, certificato; le persone disabilitate non compaiono mai), conteggio, badge certificato e stato per riga; su desktop tabella con colonne nome, ruolo, maglia, stato, certificato, scadenza.
24. Scheda persona: dati anagrafici (nome, cognome, data di nascita, email, telefono), iscrizioni per stagione, stato disponibilità, squalifiche in corso e residue, certificato. Solo l'admin vede l'azione distruttiva "Disabilita persona" (modale: la persona sparisce da tutte le liste e non può più accedere a questa società, i dati restano, vale per tutte le squadre della società e per tutte le stagioni successive, si può riabilitare dall'archivio; il modale propone in alternativa "Chiudi solo l'iscrizione in questa squadra"). L'azione è raggiungibile anche dal menu a tre punti della riga in Rosa. Visibilità diversa per ruolo: staff vede solo stato e scadenza del certificato, non il file.
25. Certificato medico: stato, data emissione e scadenza, caricamento file (trascina o fotocamera su mobile), anteprima. Banner permanente: "Il certificato è un dato sanitario: l'accesso al file viene tracciato." Nessun dettaglio clinico in nessun campo.
26. Stagione: stato bozza/attiva/chiusa, rosa, staff, aggiunta persone alla rosa.

G. Amministrazione (admin)
27. Attività, squadre e stagioni: albero Società > Attività > Squadre > Stagioni, creazione con modale, badge stato stagione.
28. Chiusura stagione e nuova stagione: wizard a 3 passi con clonazione guidata di rosa e staff (checkbox per persona), riepilogo, conferma distruttiva sulla chiusura.
29. Inviti e ruoli: modulo invito (email, ruolo giocatore/staff/dirigente/admin, ambito per dirigente, nome per staff e giocatore con spiegazione "L'interessato completerà il resto"), tabella inviti con stato e azioni (revoca, reinvia), tabella ruoli di accesso. Conferma che l'ultimo admin non può essere rimosso (messaggio chiaro, azione disabilitata con spiegazione).

H. Account
30. Profilo: nome, cognome, email, cambio password, selettore tema (Chiaro, Scuro, Automatico), elenco società con pulsante "Lascia la società" (modale di conferma che spiega cosa succede: l'account si scollega, i dati restano alla società, la società può reinvitarti; se sei l'ultimo admin l'azione è bloccata con spiegazione).
31. Preferenze di notifica: matrice società x canale (In app, Email, Push) con interruttori, default tutto attivo; una sezione per ogni società con il suo nome; avviso su iOS per le push ("Installa l'app nella schermata Home per ricevere le notifiche push").
32. Centro notifiche: lista cronologica, ogni notifica con il nome della società nel titolo, stato letto/non letto, azione diretta (es. "Rispondi alla convocazione").
33. Assenze (giocatore e staff, da Profilo > Iscrizione): elenco delle proprie assenze per stagione e squadra, pulsante "Imposta assenza" che apre un bottom sheet con data inizio, data fine e interruttore "Fino a nuovo avviso" (disabilita la data fine). Nessun motivo e nessun testo libero. Dopo il salvataggio, elenco degli eventi già convocati nel periodo con "Declina" per riga e "Declina tutti". Stati: nessuna assenza, assenza in corso ("Non disponibile fino al 15/11"), stagione chiusa in sola lettura, errore periodo fuori stagione. Per lo staff, in assenza il pulsante "Ci sono" degli eventi è disabilitato con "Sei in assenza fino al 15/11".
34. Squalifiche (gestione per chi ha la policy squalifiche.gestisci, sola lettura per gli altri): pagina della squadra con elenco delle squalifiche in corso, future e concluse, per persona (giocatore o staff), con tipo (a giornate, a tempo), residuo ("ancora 1 giornata") o scadenza e le partite coinvolte (data e avversario). Vista a calendario: barre sulle date, partite coinvolte evidenziate. Pulsante "Nuova squalifica" apre un bottom sheet: persona, controllo segmentato "A giornate / A tempo", numero di giornate oppure data fine, data inizio, competizioni (selezione multipla opzionale, solo per "A giornate", con i nomi già presenti negli eventi della stagione, nessuna selezione significa tutte le competizioni; "A tempo" copre tutte le partite del periodo), partita di origine (opzionale). Nessun testo libero. Dalla partita (schermate 16 e 18) l'azione "Squalifica" sulla riga di ogni persona precompila persona e partita di origine, e la squalifica parte dalla partita successiva. Stati: nessuna squalifica, in corso, residua a fine stagione ("Passa alla prossima stagione"), errore.
35. Archivio disabilitati (solo admin, dentro Amministrazione): elenco con ricerca e per ogni persona le azioni "Riabilita" ed "Esporta dati". Banner: "Queste persone non compaiono in nessuna lista e non possono accedere a questa società. I dati restano conservati." Conferma non distruttiva alla riabilitazione.
36. Permessi (solo admin, dentro "Inviti e ruoli"): elenco persone con ruolo e ambito (squadra e stagione per lo staff, ambito per il dirigente). Aprendo una persona, pannello con interruttori raggruppati per Eventi, Convocazioni, Presenze, Squalifiche, Persone, Certificati, corrispondenti alle policy eventi.gestisci, convocazioni.gestisci, presenze.rileva, squalifiche.gestisci, persone.gestisci, persone.disabilita, certificati.stato, certificati.file. Ogni interruttore parte dal valore predefinito del ruolo e, se diverso, mostra l'indicatore "Personalizzato", con link "Ripristina predefiniti". Per l'admin tutti gli interruttori sono attivi e bloccati, con spiegazione ("L'admin ha sempre tutti i permessi"). Salvataggio esplicito con toast. Nel resto dell'app le azioni non permesse non compaiono.

COMPORTAMENTO E INTERAZIONI (JavaScript minimo, vanilla)

- Tab, segmented control, bottom sheet, modali, interruttori, spostamento di una persona tra le liste della convocazione, risposta "Ci sono / Non posso" e selezione esiti presenze devono essere realmente interattivi nel mockup, così si valuta la fluidità. Niente logica applicativa, niente framework, niente chiamate di rete.
- Rispetta `prefers-reduced-motion`. Transizioni brevi (150-200 ms), nessuna animazione decorativa.
- Tutto navigabile da tastiera, con ruoli ARIA corretti su tab, dialog, switch e live region per i toast.

ACCESSIBILITÀ E QUALITÀ

- HTML semantico (header, nav, main, section, ul, button, table). Un solo h1 per pagina.
- Etichette collegate a ogni campo, errori associati con `aria-describedby`, stato di caricamento annunciato.
- Contrasto AA verificato in ENTRAMBI i temi. Nessuna informazione solo a colore. Target touch 44 px.
- Testi di interfaccia brevi, in italiano, nel tono di uno strumento sportivo: diretti, senza gergo tecnico e senza esclamazioni.
- Nessun lorem ipsum: dati realistici e coerenti tra le schermate (stessa squadra, stessi giocatori, stesse date).

STRUTTURA DELL'OUTPUT

```
mockup/ui/
  index.html              indice navigabile di tutte le schermate, con anteprima in frame mobile e desktop
  components.html         catalogo componenti con tutti gli stati
  css/tokens.css          token del design system (colori, tipografia, spaziature, raggi, stati), derivati dalla guida
  css/app.css             layout, componenti e utility basati sui token
  js/mock.js              sole interazioni di mockup
  assets/                 logo (originale fornito o segnaposto), icone
  screens/NN-nome.html    una schermata per file (es. 18-convocazione-staff.html)
```

- Nomenclatura CSS: prefisso `tm-`, stile BEM (`tm-card`, `tm-card__title`, `tm-card--highlight`), nessuno stile inline, nessun valore di colore o spaziatura scritto a mano nelle pagine: solo token.
- Icone: SVG inline (set coerente a tratto 1,75 px, 20 e 24 px), un solo set di icone in tutto il mockup.
- Nessuna dipendenza esterna oltre ai font. Il mockup si apre con doppio clic.

CRITERI DI ACCETTAZIONE

1. Una persona non tecnica capisce in 5 secondi qual è l'azione principale di ogni schermata.
2. Il bordeaux compare solo dove c'è un'azione o uno stato attivo.
3. La schermata di convocazione su telefono si usa con una mano, con il pollice, senza scroll orizzontale.
4. Nessun testo sotto i 12 px, nessun target sotto i 44 px, nessun contrasto sotto AA.
5. Il wordmark TEAMMANIX non è stato ricreato con un font né ricolorato via CSS.
6. Ogni schermata e ogni componente è corretto e leggibile in tema chiaro e in tema scuro, con contrasto AA misurato, e il cambio tema non richiede modifiche al markup.
7. Tutti i componenti di `components.html` hanno l'attributo `data-nuxt-ui` e sono usati dalle schermate senza varianti non documentate.

PROCESSO

1. Prima di produrre i file, restituisci un piano in 10 righe: struttura, componenti chiave, decisioni di layout sulla convocazione. Poi attendi il mio via libera.
2. Produci prima `css/tokens.css`, `css/app.css` e `components.html` e fermati per la mia revisione.
3. Poi le schermate in questo ordine: 18-19-20 (convocazione), 11-12 (home), 1-10 (accesso e onboarding), 14-17 (calendario), 22-26, 27-32.
4. Se un'informazione manca o è ambigua, fai un'assunzione ragionevole, annotala in un elenco "Assunzioni" a fine consegna e vai avanti: non farmi più di una domanda per volta.
