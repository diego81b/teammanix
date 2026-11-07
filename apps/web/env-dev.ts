import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseEnv } from 'node:util'

/**
 * Frontend development defaults, from `.env.dev` (versioned). Same rule as the API: personal `.env` and
 * shell variables take precedence, here only the not yet defined variables are filled.
 * Nuxt loads `.env` before reading nuxt.config.ts, so at this point it is already inside `env`.
 * In production it reads nothing: there the variables come from the build environment.
 */
export function loadEnvDev(directory: string, env: Record<string, string | undefined> = process.env): void {
  if (env.NODE_ENV === 'production') return
  const file = join(directory, '.env.dev')
  if (!existsSync(file)) return
  for (const [key, value] of Object.entries(parseEnv(readFileSync(file, 'utf8')))) {
    if (env[key] === undefined) env[key] = value
  }
}
