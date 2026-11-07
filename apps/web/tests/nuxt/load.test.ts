import { describe, expect, it } from 'vitest'
import { ApiError } from '../../app/composables/useApi'
import { useLoad } from '../../app/composables/useLoad'
import { inSetup } from './helpers'

describe('useLoad', () => {
  it('starts empty, then loads the data', async () => {
    const c = await inSetup(() => useLoad(async () => [1, 2]))
    expect(c.data.value).toBeNull()
    await c.reload()
    expect(c.data.value).toEqual([1, 2])
    expect(c.loading.value).toBe(false)
    expect(c.error.value).toBeNull()
  })

  it('reports loading while waiting', async () => {
    let unlock!: () => void
    const c = await inSetup(() => useLoad(() => new Promise<number>((r) => { unlock = () => r(7) })))
    const p = c.reload()
    expect(c.loading.value).toBe(true)
    unlock()
    await p
    expect(c.loading.value).toBe(false)
    expect(c.data.value).toBe(7)
  })

  it('an API error becomes user text and the data stays as before', async () => {
    let round = 0
    const c = await inSetup(() => useLoad(async () => {
      if (round++ === 0) return 'ok'
      throw new ApiError('boh', 500, 'QUALCOSA')
    }))
    await c.reload()
    await c.reload()
    expect(c.data.value).toBe('ok')
    expect(c.error.value).toBeTruthy()
    await c.reload().catch(() => {})
  })

  it('a new success clears the error', async () => {
    let round = 0
    const c = await inSetup(() => useLoad(async () => {
      if (round++ === 0) throw new ApiError('x', 500)
      return 5
    }))
    await c.reload()
    expect(c.error.value).toBeTruthy()
    await c.reload()
    expect(c.error.value).toBeNull()
    expect(c.data.value).toBe(5)
  })
})
