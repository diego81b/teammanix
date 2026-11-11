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

const enrollment = (absences: { id: string, startDate: string, endDate: string | null }[]) => [{
  enrollmentId: 'i1',
  type: 'player',
  teamName: 'Under 12',
  seasonName: 'Stagione 2026',
  seasonStatus: 'active',
  seasonStart: '2026-09-01',
  seasonEnd: '2099-06-30',
  absences,
}]

describe('absences page: free days', () => {
  it('offers to free days when an absence still has days from today on', async () => {
    registerEndpoint('/api/absences/me', () => enrollment([{ id: 'a1', startDate: '2026-09-10', endDate: '2099-01-01' }]))
    const wrapper = await mountSuspended(AbsencesPage)
    await flushPromises()
    expect(wrapper.text()).toContain('Free some days')
  })

  it('offers it for an absence with no end', async () => {
    registerEndpoint('/api/absences/me', () => enrollment([{ id: 'a1', startDate: '2026-09-10', endDate: null }]))
    const wrapper = await mountSuspended(AbsencesPage)
    await flushPromises()
    expect(wrapper.text()).toContain('Free some days')
  })

  it('hides it when there is no absence', async () => {
    registerEndpoint('/api/absences/me', () => enrollment([]))
    const wrapper = await mountSuspended(AbsencesPage)
    await flushPromises()
    expect(wrapper.text()).not.toContain('Free some days')
  })

  it('hides it when every absence is over: the past never changes', async () => {
    registerEndpoint('/api/absences/me', () => enrollment([{ id: 'a1', startDate: '2026-09-10', endDate: '2026-09-12' }]))
    const wrapper = await mountSuspended(AbsencesPage)
    await flushPromises()
    expect(wrapper.text()).not.toContain('Free some days')
  })
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
