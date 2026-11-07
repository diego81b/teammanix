<template>
  <LegalText title="Termini di servizio">
    <p>
      Questi termini regolano l'uso di TeamManix, la piattaforma per gestire squadre sportive messa a disposizione da
      <OperatorData field="legalName" />, con sede in <OperatorData field="headquarters" />, partita IVA
      <OperatorData field="vatNumber" /> (di seguito "la Piattaforma"). Creando un account o una società dichiari di averli letti e li accetti.
    </p>

    <h2>1. Il servizio</h2>
    <p>
      TeamManix permette a una società sportiva di gestire anagrafica di atleti e staff, calendario, convocazioni, presenze,
      certificati medici e comunicazioni. Il servizio è gratuito. La Piattaforma può aggiungere, cambiare o togliere funzioni.
      Se una modifica incide in modo rilevante su chi usa il servizio, lo comunica in anticipo.
    </p>

    <h2>2. Account</h2>
    <ul>
      <li>Ogni persona usa un solo account personale, con un indirizzo email che controlla.</li>
      <li>Le credenziali sono personali: non vanno condivise. Chi sospetta un uso non autorizzato cambia subito la password e avvisa la Piattaforma.</li>
      <li>Le informazioni date in registrazione devono essere vere e aggiornate.</li>
    </ul>

    <h2>3. Società e amministratori</h2>
    <p>
      Chi crea una società ne diventa amministratore e dichiara di avere il potere di agire per conto di quella società,
      di accettare questi termini e la nomina a responsabile del trattamento (DPA) a suo nome. Gli amministratori decidono chi
      entra nella società, con quale ruolo e con quali permessi. La società è un ambiente separato: nessun'altra società vede i suoi dati.
    </p>

    <h2>4. Dati dei tesserati: la società è titolare</h2>
    <p>
      I dati di atleti e staff inseriti in una società sono trattati dalla Piattaforma per conto della società, che ne è titolare
      ai sensi del GDPR. Alla società spetta, tra l'altro:
    </p>
    <ul>
      <li>informare atleti e staff prima di inserire i loro dati e avere una base giuridica per farlo;</li>
      <li>ottenere il consenso di chi esercita la responsabilità genitoriale per i minori, quando serve;</li>
      <li>inserire solo i dati necessari, in particolare quelli sanitari come i certificati medici;</li>
      <li>rispondere alle richieste degli interessati e, in caso di violazione dei dati, notificarla al Garante nei termini di legge.</li>
    </ul>
    <p>
      I dettagli sono nella <NuxtLink to="/dpa">nomina a responsabile del trattamento</NuxtLink> e nell'<NuxtLink to="/privacy">informativa privacy</NuxtLink>.
    </p>

    <h2>5. Uso consentito</h2>
    <p>È vietato:</p>
    <ul>
      <li>usare la Piattaforma per scopi illeciti o per danneggiare altre persone;</li>
      <li>inserire dati di persone senza averne titolo, o dati non necessari allo scopo sportivo;</li>
      <li>tentare di accedere a dati di altre società o ad aree non autorizzate;</li>
      <li>compromettere il funzionamento del servizio, ad esempio con richieste automatiche massive;</li>
      <li>copiare, rivendere o fornire a terzi il servizio.</li>
    </ul>
    <p>
      La Piattaforma può sospendere un account o una società che violano questi termini, avvisando l'interessato quando possibile.
    </p>

    <h2>6. Disponibilità e responsabilità</h2>
    <p>
      Il servizio è fornito gratuitamente e "così com'è". La Piattaforma lavora per mantenerlo disponibile e sicuro, ma non garantisce
      assenza di interruzioni o errori. Nei limiti consentiti dalla legge, non risponde dei danni indiretti, come la mancata partecipazione
      a un evento per una notifica non recapitata. Resta ferma la responsabilità che la legge non permette di escludere.
    </p>

    <h2>7. Chiusura e cancellazione dei dati</h2>
    <p>
      Una società può chiudere il proprio spazio. Per {{ TIMES.graceClosureDays }} giorni gli amministratori possono ancora esportare i dati;
      poi i dati della società vengono cancellati, salvo quanto la legge impone di conservare. Chi lascia una società perde l'accesso,
      ma la scheda resta alla società che ne è titolare. Una persona può chiedere la cancellazione del proprio account.
    </p>

    <h2>8. Modifiche ai termini</h2>
    <p>
      I termini possono cambiare. A ogni nuova versione ti viene chiesto di accettarla di nuovo: l'accettazione è registrata
      con data, ora e versione del documento. Se non accetti, puoi chiedere la chiusura dell'account.
    </p>

    <h2>9. Legge applicabile e foro</h2>
    <p>
      Questi termini sono regolati dalla legge italiana. Per le controversie è competente il foro di <OperatorData field="jurisdiction" />,
      salvo che la legge preveda un foro inderogabile, ad esempio per i consumatori.
    </p>

    <h2>10. Contatti</h2>
    <p>Per qualsiasi domanda scrivi a <OperatorData field="emailPrivacy" />.</p>
  </LegalText>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'legal' })
useHead({ title: 'Termini di servizio · TeamManix' })
</script>
