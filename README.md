# TeamManix

## Test

Si lavora in TDD: test rosso, codice, verde. Livelli, comandi e convenzioni in [TESTING.md](TESTING.md).

## Sviluppo (Docker)

    docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build

API su http://localhost:3001/api, Postgres su localhost:5433 (utente `teammanix`, password `devpassword`).
All'avvio applica migrazioni e seed; il sorgente di `apps/api` è montato e nodemon riavvia a ogni modifica.
Nuova migrazione: `docker compose -f docker-compose.yml -f docker-compose.dev.yml exec api npm run migration:create`.
Test (usano Testcontainers, girano sull'host): `cd apps/api && npm test`.

## Produzione (Coolify su Hetzner)

Applicazione Docker Compose in Coolify con file `docker-compose.prod.yml` (standalone, non overlay).

- DB: risorsa Postgres di Coolify, con backup schedulati su S3 dalla risorsa stessa. `DATABASE_URL` è l'URL interno della risorsa.
- Variabili: vedi `.env.prod.example`, da impostare nell'applicazione in Coolify.
- File sensibili (certificati medici e altri documenti delle persone): bucket S3 compatibile dedicato (per esempio Cloudflare R2 con giurisdizione EU), configurato con le variabili `S3_*` di `.env.prod.example`. I file sono cifrati AES-256-GCM dall'app con `STORAGE_ENCRYPTION_KEY` prima dell'upload, quindi il fornitore vede solo byte opachi. Il bucket deve essere privato; abilitare versioning o replica per il backup (quelli del DB su S3 non lo coprono). Conservare la chiave fuori da Coolify: perderla rende illeggibili i file, e cambiarla richiede di ricifrare quelli esistenti. Serve un DPA con il fornitore dello storage.
- Dominio e TLS: assegnati in Coolify al servizio `api` (porta 3001), routing Traefik.
- Migrazioni e seed girano all'avvio del container; se falliscono il container non parte.
- Frontend: servizio aggiuntivo nello stesso file, stesso schema di label.
