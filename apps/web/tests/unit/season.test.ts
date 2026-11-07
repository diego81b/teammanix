import { describe, expect, it } from 'vitest'
import { toggleSelection, proposeNewSeason, selectionInitial, seasonStatusItem, validatePeriod } from '../../app/utils/season'
import type { RosterRow, SeasonDto } from '../../app/types/api'

const st = (o: Partial<SeasonDto> = {}): SeasonDto => ({
  id: 's', teamId: 'q', name: '2025/2026', startDate: '2025-09-01', endDate: '2026-06-30', status: 'active', league: null, ...o,
})
const row = (id: string): RosterRow => ({
  id, personId: 'p' + id, name: 'N', surname: 'C', type: 'player', staffRole: null, position: null,
  jerseyNumber: null, status: 'available', certificate: null,
})

describe('proposeNewSeason', () => {
  it('advances name and end by one year, the start is on 1 July: preparation begins before the league', () => {
    expect(proposeNewSeason(st())).toEqual({ name: '2026/2027', startDate: '2026-07-01', endDate: '2027-06-30' })
  })
  it('a start already in July or earlier keeps the same date, one year later', () => {
    expect(proposeNewSeason(st({ startDate: '2025-07-01' })).startDate).toBe('2026-07-01')
    expect(proposeNewSeason(st({ startDate: '2025-01-10' })).startDate).toBe('2026-01-10')
  })
  it('a name that does not follow the pattern stays the same', () => {
    expect(proposeNewSeason(st({ name: 'Estate' })).name).toBe('Estate')
  })
  it('29 February becomes 28 February', () => {
    expect(proposeNewSeason(st({ endDate: '2028-02-29' })).endDate).toBe('2029-02-28')
  })
})

describe('validatePeriod', () => {
  it('end equal to or after the start', () => {
    expect(validatePeriod('2026-09-01', '2027-06-30')).toBe(true)
    expect(validatePeriod('2026-09-01', '2026-09-01')).toBe(true)
  })
  it('end before the start', () => expect(validatePeriod('2026-09-02', '2026-09-01')).toBe(false))
  it('invalid dates', () => {
    expect(validatePeriod('', '2026-09-01')).toBe(false)
    expect(validatePeriod('2026-02-30', '2026-09-01')).toBe(false)
  })
})

describe('selection for cloning', () => {
  it('starts with all selected', () => expect(selectionInitial([row('1'), row('2')])).toEqual(['1', '2']))
  it('toggles an item', () => {
    expect(toggleSelection(['1', '2'], '1')).toEqual(['2'])
    expect(toggleSelection(['2'], '1')).toEqual(['2', '1'])
  })
})

describe('seasonStatusItem', () => {
  it('maps the status to a badge variant', () => {
    expect(seasonStatusItem('active')).toBe('success')
    expect(seasonStatusItem('draft')).toBe('warning')
    expect(seasonStatusItem('closed')).toBe('neutral')
  })
})
