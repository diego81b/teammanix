<template>
  <LegalText title="Informativa privacy">
    <p>
      Questa informativa spiega come vengono trattati i dati personali in TeamManix. Distingue due situazioni, perché cambia chi è responsabile dei dati.
    </p>

    <h2>1. Chi fa cosa</h2>
    <ul>
      <li>
        <strong>Dati del tuo account</strong> (email, nome, password e simili): il titolare è
        <OperatorData field="legalName" />, sede in <OperatorData field="headquarters" />, partita IVA <OperatorData field="vatNumber" />
        (di seguito "la Piattaforma"). Contatto: <OperatorData field="emailPrivacy" />.
      </li>
      <li>
        <strong>Dati di atleti e staff inseriti in una società</strong>: il titolare è la società sportiva. La Piattaforma li tratta
        solo per conto della società e su sue istruzioni, come responsabile del trattamento (art. 28 GDPR). Per esercitare i tuoi diritti su
        questi dati rivolgiti alla tua società: la Piattaforma la assiste nel rispondere.
      </li>
    </ul>

    <h2>2. Quali dati e perché</h2>
    <p><strong>Account (titolare: la Piattaforma)</strong></p>
    <ul>
      <li>Email, nome, cognome e password, conservata solo come hash non reversibile. Finalità: creare e proteggere l'account, farti accedere, mandarti le email di servizio (verifica email, recupero password, inviti). Base giuridica: esecuzione del servizio che richiedi.</li>
      <li>Data, ora, versione dei documenti e indirizzo IP dell'accettazione di termini e DPA. Finalità: dimostrare l'accettazione. Base giuridica: obbligo di documentare il rispetto della normativa e interesse legittimo.</li>
      <li>Registro delle operazioni sensibili (audit) e log tecnici. Finalità: sicurezza, prevenzione degli abusi, ricostruzione di incidenti. Base giuridica: interesse legittimo.</li>
    </ul>
    <p><strong>Dati dei tesserati (titolare: la società; la Piattaforma è responsabile)</strong></p>
    <ul>
      <li>Anagrafica minima: nome, cognome, data di nascita, email, telefono. Non vengono richiesti sesso, codice fiscale, peso o altezza.</li>
      <li>Appartenenza a squadre e settori, ruolo, convocazioni, risposte, presenze.</li>
      <li>Sanzioni e squalifiche, visibili solo all'interessato, a staff, dirigenti e amministratori.</li>
      <li>Assenze dichiarate: solo le date, senza motivo e senza testo libero.</li>
      <li>Certificato medico: tipo, data di emissione e scadenza. Il file allegato è facoltativo e attivabile dalla società. È un dato sanitario, a visibilità ristretta e con accessi al file tracciati. Lo stato "infortunato" è anch'esso un dato sanitario: senza diagnosi, durata o parte del corpo.</li>
    </ul>
    <p>
      La base giuridica dei dati dei tesserati la sceglie la società, che deve anche informare gli interessati prima di inserirli.
      Per i dati sanitari e per i minori possono servire consensi specifici, raccolti dalla società.
    </p>

    <h2>3. Minorenni</h2>
    <p>
      I dati dei minori sono inseriti e gestiti dalla società. In Italia, sotto i 14 anni il consenso digitale spetta a chi esercita la responsabilità genitoriale.
      La gestione dei consensi dei tutori è in carico alla società.
    </p>

    <h2>4. Con chi vengono condivisi</h2>
    <p>I dati restano nella società che li ha inseriti: nessun'altra società li vede. La Piattaforma si avvale di fornitori, nominati sub-responsabili:</p>
    <ul>
      <li>Hosting e database: <OperatorData field="hosting" />.</li>
      <li>Invio delle email di servizio: Brevo, fornitore europeo.</li>
      <li>Notifiche push (quando attive): i servizi del sistema del tuo dispositivo, come Firebase Cloud Messaging per Android e il servizio di Apple per iOS. Non vi transitano dati sanitari.</li>
    </ul>
    <p>L'elenco aggiornato dei sub-responsabili è nella <NuxtLink to="/dpa">nomina a responsabile</NuxtLink>. I dati sono ospitati nell'Unione Europea.</p>

    <h2>5. Cookie e strumenti di tracciamento</h2>
    <p>
      TeamManix non usa cookie di profilazione né strumenti di analisi o pubblicità. Il browser conserva solo dati tecnici necessari al funzionamento:
      il token di sessione e l'eventuale invito in sospeso. I caratteri del sito sono ospitati sui nostri server, senza chiamate a servizi esterni.
    </p>

    <h2>6. Per quanto tempo</h2>
    <ul>
      <li>Account: finché esiste. Se lo chiudi, viene cancellato, salvo i dati che la legge impone di conservare.</li>
      <li>Dati di una società: finché la società li tiene. Alla chiusura della società, {{ TIMES.graceClosureDays }} giorni per esportarli, poi la cancellazione.</li>
      <li>Se lasci una società, la tua scheda resta alla società; puoi chiederne a lei la cancellazione o l'anonimizzazione.</li>
      <li>Registro di accettazione dei termini e audit: per il tempo necessario a tutelare i diritti delle parti.</li>
    </ul>

    <h2>7. I tuoi diritti</h2>
    <p>
      Puoi chiedere accesso, rettifica, cancellazione, limitazione, portabilità e opporti al trattamento. Per i dati del tuo account scrivi a
      <OperatorData field="emailPrivacy" />. Per i dati di tesserato scrivi alla tua società. Hai diritto di proporre reclamo al
      Garante per la protezione dei dati personali (garanteprivacy.it).
    </p>

    <h2>8. Sicurezza</h2>
    <p>
      Connessioni cifrate, password con hash robusto, isolamento tra società, accessi limitati per ruolo, tracciamento degli accessi ai dati sanitari
      e cifratura dei file dei certificati. In caso di violazione dei dati la Piattaforma avvisa senza ritardo le società coinvolte.
    </p>

    <h2>9. Modifiche</h2>
    <p>Questa informativa può cambiare. Le modifiche rilevanti vengono comunicate e, dove serve, richiedono una nuova accettazione.</p>
  </LegalText>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'legal' })
useHead({ title: 'Informativa privacy · TeamManix' })
</script>
