import { describe, expect, it } from 'vitest'
import { labelPosition, positionOptions, sortProfiles } from '../../app/utils/sport'

const texts: Record<string, string> = {
  'position.goalkeeper': 'Goalkeeper',
  'position.small_forward': 'Ala piccola',
  'sport.football': 'Football',
  'sport.basket': 'Basket',
  'sport.fencing': 'Fencing',
}
const translate = (k: string) => texts[k] ?? k
const exists = (k: string) => k in texts

describe('positionOptions', () => {
  it('keeps the profile order and translates each code', () => {
    expect(positionOptions(['small_forward', 'goalkeeper'], translate)).toEqual([
      { label: 'Ala piccola', value: 'small_forward' },
      { label: 'Goalkeeper', value: 'goalkeeper' },
    ])
  })

  it('a profile without positions offers nothing', () => {
    expect(positionOptions([], translate)).toEqual([])
  })
})

describe('labelPosition', () => {
  it('translates a known code', () => {
    expect(labelPosition('goalkeeper', exists, translate)).toBe('Goalkeeper')
  })

  it('without position returns null', () => {
    expect(labelPosition(null, exists, translate)).toBeNull()
  })

  it('an old value that is not a code is shown as is, never a raw key', () => {
    expect(labelPosition('Halfback', exists, translate)).toBe('Halfback')
  })
})

describe('sortProfiles', () => {
  const profiles = [{ code: 'fencing' }, { code: 'football' }, { code: 'basket' }]

  it('sorts by translated name, not by code', () => {
    const t = (k: string) => ({ 'sport.fencing': 'Alpha', 'sport.football': 'Zeta', 'sport.basket': 'Beta' })[k] ?? k
    expect(sortProfiles(profiles, t, 'it').map(p => p.code)).toEqual(['fencing', 'basket', 'football'])
  })

  it('does not modify the received list', () => {
    const copy = [...profiles]
    sortProfiles(profiles, translate, 'it')
    expect(profiles).toEqual(copy)
  })
})
