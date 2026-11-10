import { describe, expect, it } from 'vitest'
import { OUTCOMES, attendanceOpen, groupRows, percent, rowName, toggleOutcome } from '../../app/utils/attendance'

const now = new Date('2026-11-10T20:00:00Z')

describe('OUTCOMES', () => {
  it('lists the outcomes in the order of the buttons, injured last', () => {
    expect(OUTCOMES).toEqual(['present', 'late', 'absent_excused', 'absent', 'injured'])
  })
})

describe('toggleOutcome', () => {
  it('a new outcome replaces the current one', () => {
    expect(toggleOutcome(null, 'present')).toBe('present')
    expect(toggleOutcome('present', 'absent')).toBe('absent')
  })

  it('tapping the outcome already set clears it', () => {
    expect(toggleOutcome('late', 'late')).toBeNull()
  })
})

describe('attendanceOpen', () => {
  it('opens once the event started, scheduled or concluded', () => {
    expect(attendanceOpen({ start: '2026-11-10T17:00:00Z', status: 'scheduled' }, now)).toBe(true)
    expect(attendanceOpen({ start: '2026-11-10T17:00:00Z', status: 'concluded' }, now)).toBe(true)
  })

  it('stays closed before the start', () => {
    expect(attendanceOpen({ start: '2026-11-10T21:00:00Z', status: 'scheduled' }, now)).toBe(false)
  })

  it('stays closed for a cancelled or postponed event', () => {
    expect(attendanceOpen({ start: '2026-11-01T17:00:00Z', status: 'cancelled' }, now)).toBe(false)
    expect(attendanceOpen({ start: '2026-11-01T17:00:00Z', status: 'postponed' }, now)).toBe(false)
  })
})

describe('percent', () => {
  it('rounds the rate to a whole percentage', () => {
    expect(percent(2 / 3)).toBe(67)
    expect(percent(1)).toBe(100)
    expect(percent(0)).toBe(0)
  })

  it('has no value when nobody was recorded', () => {
    expect(percent(null)).toBeNull()
  })
})

describe('rowName', () => {
  const t = (key: string) => key
  it('joins name and surname', () => {
    expect(rowName({ name: 'Mario', surname: 'Rossi', disabled: false }, t)).toBe('Mario Rossi')
    expect(rowName({ name: 'Mario', surname: null, disabled: false }, t)).toBe('Mario')
  })

  it('a disabled person without a name reads as such', () => {
    expect(rowName({ name: null, surname: null, disabled: true }, t)).toBe('attendance.disabledPerson')
  })

  it('the admin sees the name of a disabled person', () => {
    expect(rowName({ name: 'Mario', surname: 'Rossi', disabled: true }, t)).toBe('Mario Rossi')
  })
})

describe('groupRows', () => {
  it('splits staff and players, keeping the order of the API', () => {
    const rows = [
      { enrollmentId: 'a', type: 'staff' },
      { enrollmentId: 'b', type: 'player' },
      { enrollmentId: 'c', type: 'staff' },
    ] as never[]
    const g = groupRows(rows)
    expect(g.staff.map(r => r.enrollmentId)).toEqual(['a', 'c'])
    expect(g.players.map(r => r.enrollmentId)).toEqual(['b'])
  })
})
