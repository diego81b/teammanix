<template>
  <LegalText title="Nomina a responsabile del trattamento (DPA)">
    <p>
      Accordo ai sensi dell'art. 28 del Regolamento (UE) 2016/679 (GDPR) tra la società sportiva che lo accetta online ("il Titolare") e
      <OperatorData field="legalName" />, con sede in <OperatorData field="headquarters" />, partita IVA <OperatorData field="vatNumber" />
      ("il Responsabile"). Si applica ai dati personali che il Titolare tratta tramite TeamManix.
    </p>

    <h2>1. Oggetto, natura e durata</h2>
    <p>
      Il Responsabile tratta i dati per fornire al Titolare la piattaforma TeamManix: conservazione, consultazione, elaborazione e cancellazione dei dati
      di atleti e staff, calendario, convocazioni, presenze, certificati, sanzioni e comunicazioni. L'accordo dura quanto l'uso del servizio da parte del Titolare
      e termina con la chiusura della società, salvi gli obblighi del punto 9.
    </p>

    <h2>2. Tipi di dati e persone interessate</h2>
    <ul>
      <li><strong>Interessati</strong>: atleti, anche minorenni, staff, dirigenti e amministratori della società, ed eventuali tutori.</li>
      <li><strong>Dati comuni</strong>: nome, cognome, data di nascita, email, telefono, appartenenza a squadre, convocazioni, presenze, sanzioni e squalifiche, assenze (solo date).</li>
      <li><strong>Dati particolari</strong>: certificati medici (tipo, emissione, scadenza, file facoltativo) e stato di infortunio, senza diagnosi.</li>
    </ul>

    <h2>3. Istruzioni del Titolare</h2>
    <p>
      Il Responsabile tratta i dati solo su istruzione documentata del Titolare, cioè secondo questo accordo e le funzioni del servizio usate dagli amministratori.
      Non li usa per finalità proprie, come marketing o analisi per conto proprio. Se ritiene che un'istruzione violi la normativa, ne avvisa subito il Titolare.
    </p>

    <h2>4. Riservatezza</h2>
    <p>
      Chi per conto del Responsabile può accedere ai dati è vincolato alla riservatezza e riceve istruzioni adeguate. L'accesso è limitato a quanto serve
      all'assistenza e alla manutenzione, ed è tracciato.
    </p>

    <h2>5. Misure di sicurezza (art. 32)</h2>
    <ul>
      <li>cifratura dei dati in transito e a riposo, file dei certificati su storage cifrato;</li>
      <li>isolamento rigido tra società e accessi profilati per ruolo;</li>
      <li>password con hash robusto, sessioni a scadenza, limiti alle richieste;</li>
      <li>registro (audit) degli accessi ai dati sanitari e delle operazioni sensibili;</li>
      <li>backup e procedura di gestione degli incidenti;</li>
      <li>dati ospitati nell'Unione Europea.</li>
    </ul>

    <h2>6. Sub-responsabili</h2>
    <p>
      Il Titolare autorizza in via generale il ricorso ai sub-responsabili qui elencati. Il Responsabile impone loro obblighi equivalenti a questi e ne risponde verso il Titolare.
      Prima di aggiungere o sostituire un sub-responsabile, il Responsabile aggiorna l'elenco e avvisa il Titolare, che può opporsi per motivi legittimi.
    </p>
    <ul>
      <li>Hosting e database: <OperatorData field="hosting" />.</li>
      <li>Email di servizio: Brevo, fornitore europeo.</li>
      <li>Notifiche push, quando attive: Firebase Cloud Messaging (Google) e il servizio notifiche di Apple. Il contenuto è limitato, senza dati sanitari.</li>
    </ul>

    <h2>7. Diritti degli interessati</h2>
    <p>
      Il Responsabile assiste il Titolare, con gli strumenti del servizio, nel rispondere alle richieste degli interessati: esportazione dei dati di una persona,
      rettifica, cancellazione o anonimizzazione. Se riceve direttamente una richiesta su dati dei tesserati, la inoltra al Titolare senza darvi seguito.
    </p>

    <h2>8. Violazioni dei dati</h2>
    <p>
      Il Responsabile avvisa il Titolare senza ingiustificato ritardo dopo essere venuto a conoscenza di una violazione, con le informazioni disponibili per valutarla.
      La notifica al Garante, da fare entro 72 ore dalla conoscenza, e la comunicazione agli interessati restano al Titolare.
    </p>

    <h2>9. Restituzione e cancellazione</h2>
    <p>
      Alla chiusura della società, per {{ TIMES.graceClosureDays }} giorni gli amministratori possono esportare i dati. Poi il Responsabile li cancella,
      comprese le copie, salvo che la legge imponga di conservarli.
    </p>

    <h2>10. Verifiche</h2>
    <p>
      Il Responsabile mette a disposizione del Titolare le informazioni per dimostrare il rispetto di questo accordo e consente verifiche ragionevoli,
      concordate in anticipo e senza compromettere la sicurezza degli altri clienti. Assiste il Titolare nelle valutazioni d'impatto (DPIA) quando servono.
    </p>

    <h2>11. Obblighi del Titolare</h2>
    <p>
      Il Titolare garantisce di avere una base giuridica per i trattamenti, di aver informato gli interessati, di raccogliere i consensi quando richiesti
      (in particolare per i minori e per i dati sanitari) e di inserire solo i dati necessari. Gli amministratori sono responsabili di chi ammettono nella società e dei permessi che assegnano.
    </p>

    <h2>12. Trasferimenti fuori dall'Unione Europea</h2>
    <p>
      I dati non vengono trasferiti fuori dall'UE, salvo che per i servizi di notifica push dei sistemi operativi. In tal caso il fornitore opera con garanzie adeguate
      previste dal GDPR, come le clausole contrattuali standard o il Data Privacy Framework.
    </p>

    <h2>13. Accettazione</h2>
    <p>
      L'accordo si perfeziona con l'accettazione online alla creazione della società, da parte di chi dichiara di avere i poteri per rappresentarla.
      L'accettazione è registrata con data, ora, indirizzo IP e versione del documento. Una nuova versione richiede una nuova accettazione.
    </p>
  </LegalText>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'legal' })
useHead({ title: 'Nomina a responsabile del trattamento (DPA) · TeamManix' })
</script>
