import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadEnvDev } from '../../env-dev'

describe('loadEnvDev', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'tm-env-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  const write = (content: string) => writeFileSync(join(dir, '.env.dev'), content)

  it('fills missing variables with the .env.dev defaults', () => {
    write('# commento\nNUXT_PUBLIC_API_BASE_URL=http://localhost:3001/api\n')
    const env: Record<string, string | undefined> = { NODE_ENV: 'development' }
    loadEnvDev(dir, env)
    expect(env.NUXT_PUBLIC_API_BASE_URL).toBe('http://localhost:3001/api')
  })

  it('does not overwrite what already exists: .env and the shell win over .env.dev', () => {
    write('NUXT_PUBLIC_API_BASE_URL=http://localhost:3001/api\n')
    const env: Record<string, string | undefined> = { NODE_ENV: 'development', NUXT_PUBLIC_API_BASE_URL: 'http://other:9000/api' }
    loadEnvDev(dir, env)
    expect(env.NUXT_PUBLIC_API_BASE_URL).toBe('http://other:9000/api')
  })

  it('an empty but defined variable stays empty', () => {
    write('NUXT_PUBLIC_X=valore\n')
    const env: Record<string, string | undefined> = { NODE_ENV: 'development', NUXT_PUBLIC_X: '' }
    loadEnvDev(dir, env)
    expect(env.NUXT_PUBLIC_X).toBe('')
  })

  it('in production it reads nothing', () => {
    write('NUXT_PUBLIC_API_BASE_URL=http://localhost:3001/api\n')
    const env: Record<string, string | undefined> = { NODE_ENV: 'production' }
    loadEnvDev(dir, env)
    expect(env.NUXT_PUBLIC_API_BASE_URL).toBeUndefined()
  })

  it('without the file it does nothing', () => {
    const env: Record<string, string | undefined> = { NODE_ENV: 'development' }
    expect(() => loadEnvDev(dir, env)).not.toThrow()
    expect(Object.keys(env)).toEqual(['NODE_ENV'])
  })
})
