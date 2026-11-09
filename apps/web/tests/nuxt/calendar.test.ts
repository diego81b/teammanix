import { baseApiRelative } from './helpers'
import { beforeEach, describe, expect, it } from 'vitest'
import { registerEndpoint } from '@nuxt/test-utils/runtime'
import { useCalendar } from '../../app/composables/useCalendar'

beforeEach(() => {
  baseApiRelative()
  localStorage.clear()
  const s = useSessionStore()
  s.clear()
  s.token = 'tok'
})

describe('useCalendar', () => {
  it('reads the personal calendar and the calendars the person can open', async () => {
    registerEndpoint('/api/calendar/me', () => [{ id: 'e1', teamName: 'U14' }])
    registerEndpoint('/api/calendar/teams', () => [{ seasonId: 's1', teamName: 'U14' }])
    const c = useCalendar()
    expect(await c.mine()).toEqual([{ id: 'e1', teamName: 'U14' }])
    expect(await c.seasons()).toEqual([{ seasonId: 's1', teamName: 'U14' }])
  })

  it('reads the next event', async () => {
    registerEndpoint('/api/calendar/next', () => ({ id: 'e2', teamName: 'U16' }))
    expect(await useCalendar().next()).toEqual({ id: 'e2', teamName: 'U16' })
  })

  it('the next event is null when the API has nothing to show (empty body)', async () => {
    registerEndpoint('/api/calendar/next', () => new Response(null, { status: 200 }))
    expect(await useCalendar().next()).toBeNull()
  })
})
