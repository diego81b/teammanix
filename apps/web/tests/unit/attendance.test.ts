import { describe, expect, it } from 'vitest'
import { ATTENDANCE_OPENS_MINUTES_BEFORE, OUTCOMES, attendanceNotice, attendanceOpen, attendanceOpensAt, groupRows, percent, rowName, toggleOutcome } from '../../app/utils/attendance'

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

describe('attendanceOpensAt', () => {
  it('is 30 minutes before the start, the same number the API uses', () => {
    expect(ATTENDANCE_OPENS_MINUTES_BEFORE).toBe(30)
    expect(attendanceOpensAt('2026-11-11T19:00:00Z').toISOString()).toBe('2026-11-11T18:30:00.000Z')
  })

  it('counts exact minutes on the instant, across a daylight saving change', () => {
    expect(attendanceOpensAt('2026-10-25T02:15:00Z').toISOString()).toBe('2026-10-25T01:45:00.000Z')
  })
})

describe('attendanceOpen', () => {
  it('opens once the event started, scheduled or concluded', () => {
    expect(attendanceOpen({ start: '2026-11-10T17:00:00Z', status: 'scheduled' }, now)).toBe(true)
    expect(attendanceOpen({ start: '2026-11-10T17:00:00Z', status: 'concluded' }, now)).toBe(true)
  })

  it('opens 30 minutes before the start, to the minute', () => {
    const event = { start: '2026-11-10T20:30:00Z', status: 'scheduled' as const }
    expect(attendanceOpen(event, new Date('2026-11-10T19:59:59Z'))).toBe(false)
    expect(attendanceOpen(event, new Date('2026-11-10T20:00:00Z'))).toBe(true)
  })

  it('stays closed before the window', () => {
    expect(attendanceOpen({ start: '2026-11-10T21:00:00Z', status: 'scheduled' }, now)).toBe(false)
  })

  it('stays closed for a cancelled or postponed event, also inside the window', () => {
    expect(attendanceOpen({ start: '2026-11-01T17:00:00Z', status: 'cancelled' }, now)).toBe(false)
    expect(attendanceOpen({ start: '2026-11-01T17:00:00Z', status: 'postponed' }, now)).toBe(false)
    expect(attendanceOpen({ start: '2026-11-10T20:20:00Z', status: 'cancelled' }, now)).toBe(false)
  })
})

describe('attendanceNotice', () => {
  it('says when the check opens for a scheduled event that is not open yet', () => {
    expect(attendanceNotice({ start: '2026-11-10T21:00:00Z', status: 'scheduled' }, now)).toEqual({ opensAt: new Date('2026-11-10T20:30:00Z') })
  })

  it('has nothing to say once the check is open', () => {
    expect(attendanceNotice({ start: '2026-11-10T20:20:00Z', status: 'scheduled' }, now)).toBeNull()
  })

  it('has nothing to say for a cancelled or postponed event: it never opens', () => {
    expect(attendanceNotice({ start: '2026-11-10T21:00:00Z', status: 'cancelled' }, now)).toBeNull()
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
