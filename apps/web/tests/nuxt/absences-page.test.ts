import { baseApiRelative } from './helpers'
import { beforeEach, describe, expect, it } from 'vitest'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import AbsencesPage from '../../app/pages/absences.vue'

beforeEach(() => {
  baseApiRelative()
  localStorage.clear()
  const s = useSessionStore()
  s.clear()
  s.token = 'tok'
})

describe('absences page', () => {
  it('loads the own enrollments when it opens: the person does not have to do anything first', async () => {
    let asked = 0
    registerEndpoint('/api/absences/me', () => {
      asked++
      return [{
        enrollmentId: 'i1',
        type: 'player',
        teamName: 'Under 12',
        seasonName: 'Stagione 2026',
        seasonStatus: 'active',
        seasonStart: '2026-09-01',
        seasonEnd: '2027-06-30',
        absences: [],
      }]
    })
    const wrapper = await mountSuspended(AbsencesPage)
    await flushPromises()
    expect(asked).toBe(1)
    expect(wrapper.text()).toContain('Under 12')
  })
})
