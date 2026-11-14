import { baseApiRelative } from './helpers'
import { beforeEach, describe, expect, it } from 'vitest'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import EnrollPerson from '../../app/components/EnrollPerson.vue'

beforeEach(() => {
  baseApiRelative()
  localStorage.clear()
  const s = useSessionStore()
  s.clear()
  s.token = 'tok'
  registerEndpoint('/api/people', () => [{ id: 'p1', name: 'Luca', surname: 'Bianchi', email: null }])
  registerEndpoint('/api/staff-roles', () => [])
})

describe('enroll people dialog', () => {
  it('leaving the search box does not show the "choose a person" error: the list would move under the pointer and swallow the click on a result', async () => {
    await mountSuspended(EnrollPerson, { props: { open: true, seasonId: 's1', positions: [] } })
    await flushPromises()
    const search = document.body.querySelector<HTMLInputElement>('input[type="search"]')!
    expect(search).not.toBeNull()

    search.value = 'Lu'
    search.dispatchEvent(new Event('input', { bubbles: true }))
    search.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    expect(document.body.textContent).not.toContain('Choose a person')
  })

  it('still asks for a person when the form is submitted without one', async () => {
    await mountSuspended(EnrollPerson, { props: { open: true, seasonId: 's1', positions: [] } })
    await flushPromises()
    document.body.querySelector<HTMLFormElement>('#form-enroll')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()

    expect(document.body.textContent).toContain('Choose a person')
  })
})
