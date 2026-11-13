import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import SuspensionCalendar from '../../app/components/SuspensionCalendar.vue'
import { todayDay } from '../../app/utils/calendar'
import type { SeasonSuspension } from '../../app/types/api'

// Days of the month the calendar opens on (the current one), so the test does not depend on the date it runs.
const prefix = todayDay().slice(0, 7)
const day = (n: number) => `${prefix}-${String(n).padStart(2, '0')}`
const noon = (n: number) => `${day(n)}T12:00:00`

const common = { enrollmentId: 'i', competitions: [], originEventId: null, remaining: 0, completed: false, personId: 'p', type: 'player' }
const period = { ...common, id: 'p1', name: 'Marco', surname: 'Bertini', form: 'period', startDate: day(10), endDate: day(12), matchCount: null, covered: [], served: 0 }
const byMatches = {
  ...common, id: 'm1', name: 'Riccardo', surname: 'Ferri', form: 'matches', startDate: day(14), endDate: null, matchCount: 2, served: 1,
  covered: [
    { eventId: 'e1', start: noon(15), number: 1, of: 2, served: true },
    { eventId: 'e2', start: noon(22), number: 2, of: 2, served: false },
  ],
} as unknown as SeasonSuspension

const mountCalendar = (list: SeasonSuspension[], matchDays: string[] = []) =>
  mountSuspended(SuspensionCalendar, { props: { suspensions: list, matchDays: new Set(matchDays) } })

describe('SuspensionCalendar', () => {
  it('draws a named bar for a period and initials on each covered match day', async () => {
    const wrapper = await mountCalendar([period as unknown as SeasonSuspension, byMatches])
    await flushPromises()
    const labels = wrapper.findAll('[role="img"]').map(e => e.attributes('aria-label'))
    expect(labels.filter(l => l?.startsWith('Marco Bertini'))).not.toHaveLength(0)
    expect(labels.filter(l => l?.startsWith('Riccardo Ferri'))).toHaveLength(2)
    expect(wrapper.text()).toContain('RF')
  })

  it('tells a played match from one still to play in the label', async () => {
    const wrapper = await mountCalendar([byMatches])
    await flushPromises()
    const labels = wrapper.findAll('[role="img"]').map(e => e.attributes('aria-label') ?? '')
    expect(labels.filter(l => l.includes('match played') || l.includes('partita giocata') || l.includes('match joué'))).toHaveLength(1)
    expect(labels).toHaveLength(2)
  })

  it('underlines match days only', async () => {
    const wrapper = await mountCalendar([], [day(15)])
    await flushPromises()
    expect(wrapper.findAll('.underline')).toHaveLength(1)
    expect(wrapper.find('.underline').text()).toBe('15')
  })

  it('moves the marks with the month', async () => {
    const wrapper = await mountCalendar([byMatches])
    await flushPromises()
    await wrapper.find('button[aria-label="Next month"]').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('[role="img"]')).toHaveLength(0)
  })
})
