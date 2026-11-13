import { describe, expect, it } from 'vitest'
import { countRoster, filterRoster, fullName, statusAction } from '../../app/utils/roster'
import type { RosterRow } from '../../app/types/api'

const row = (o: Partial<RosterRow>): RosterRow => ({
  id: 'i', personId: 'p', name: 'Mario', surname: 'Rossi', type: 'player', staffRole: null, position: null,
  jerseyNumber: null, status: 'available', certificate: { status: 'valid', expiry: '2027-01-01' }, ...o,
})

const roster = [
  row({ id: '1', name: 'Mario', surname: 'Rossi', jerseyNumber: 9 }),
  row({ id: '2', name: 'Luca', surname: 'Bianchi', status: 'injured', certificate: { status: 'expired', expiry: '2025-01-01' } }),
  row({ id: '3', name: 'Anna', surname: null, certificate: { status: 'missing', expiry: null } }),
  row({ id: '4', name: 'Paolo', surname: 'Verdi', type: 'staff', staffRole: 'coach', certificate: null }),
]

describe('fullName', () => {
  it('joins name and surname', () => expect(fullName(roster[0]!)).toBe('Mario Rossi'))
  it('without surname the first name remains', () => expect(fullName(roster[2]!)).toBe('Anna'))
})

describe('filterRoster', () => {
  it('without filters returns everything', () => expect(filterRoster(roster, {})).toHaveLength(4))
  it('searches by name or surname case-insensitively', () => {
    expect(filterRoster(roster, { q: 'ROSS' }).map((r) => r.id)).toEqual(['1'])
    expect(filterRoster(roster, { q: 'anna' }).map((r) => r.id)).toEqual(['3'])
  })
  it('search ignores surrounding spaces', () => expect(filterRoster(roster, { q: '  luca ' })).toHaveLength(1))
  it('filters by status', () => expect(filterRoster(roster, { status: 'injured' }).map((r) => r.id)).toEqual(['2']))
  it('filters by certificate status and drops those without one', () => {
    expect(filterRoster(roster, { certificate: 'expired' }).map((r) => r.id)).toEqual(['2'])
    expect(filterRoster(roster, { certificate: 'missing' }).map((r) => r.id)).toEqual(['3'])
  })
  it('filters by type', () => expect(filterRoster(roster, { type: 'staff' }).map((r) => r.id)).toEqual(['4']))
  it('combines filters', () => {
    expect(filterRoster(roster, { type: 'player', status: 'available', q: 'o' }).map((r) => r.id)).toEqual(['1'])
  })
})

describe('countRoster', () => {
  it('counts players and staff', () => expect(countRoster(roster)).toEqual({ players: 3, staff: 1 }))
  it('empty roster', () => expect(countRoster([])).toEqual({ players: 0, staff: 0 }))
})

describe('statusAction', () => {
  it('offers the opposite state, for players only and only with the permission', () => {
    expect(statusAction(row({ status: 'available' }), true)).toBe('injured')
    expect(statusAction(row({ status: 'injured' }), true)).toBe('available')
    expect(statusAction(row({ status: 'available' }), false)).toBeNull()
    expect(statusAction(row({ type: 'staff', staffRole: 'coach' }), true)).toBeNull()
  })
})
