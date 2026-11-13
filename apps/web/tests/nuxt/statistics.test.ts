import { baseApiRelative } from './helpers'
import { beforeEach, describe, expect, it } from 'vitest'
import { registerEndpoint } from '@nuxt/test-utils/runtime'
import { useStatistics } from '../../app/composables/useStatistics'

beforeEach(() => {
  baseApiRelative()
  localStorage.clear()
  const s = useSessionStore()
  s.clear()
  s.token = 'tok'
})

describe('useStatistics', () => {
  it('reads the statistics of a season', async () => {
    registerEndpoint('/api/seasons/s1/statistics', () => ({ view: 'full', rows: [], totals: null, mine: null }))
    expect(await useStatistics().ofSeason('s1')).toMatchObject({ view: 'full' })
  })

  it('reads the own figures of every season', async () => {
    registerEndpoint('/api/statistics/me', () => [{ seasonId: 's1', mine: { enrollmentId: 'e1' } }])
    expect(await useStatistics().mine()).toEqual([{ seasonId: 's1', mine: { enrollmentId: 'e1' } }])
  })

  it('a refusal reaches the caller with its code', async () => {
    registerEndpoint('/api/seasons/s2/statistics', () => new Response(JSON.stringify({ message: 'no', code: 'PERMISSION_DENIED' }), { status: 403, headers: { 'content-type': 'application/json' } }))
    await expect(useStatistics().ofSeason('s2')).rejects.toMatchObject({ status: 403, code: 'PERMISSION_DENIED' })
  })
})
