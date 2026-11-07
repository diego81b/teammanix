const API = process.env.E2E_API_URL ?? 'http://localhost:3001/api'

/** Fails fast with a clear message if the API is not ready for e2e. */
export default async function globalSetup() {
  let r: Response
  try {
    r = await fetch(`${API}/__test/outbox?to=ping@e2e.test`)
  }
  catch {
    throw new Error(`API not reachable at ${API}. Start it: docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d`)
  }
  if (r.status === 404) {
    throw new Error('Test outbox disabled. E2E_OUTBOX=1 is in apps/api/.env.dev: check that apps/api/.env does not override it and restart the API: docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build api')
  }
}
