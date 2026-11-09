import { describe, expect, it } from 'vitest'
import {
  DECLINE_REASONS,
  blockers,
  callupCounts,
  canSend,
  formatChangeTime,
  groupStaff,
  historyParts,
  myAnswer,
  needsConfirmation,
  ownStaffRow,
  reasonKey,
  rowAction,
  togglePlacement,
  unsentCount,
  warnings,
} from '../../app/utils/callup'
import type { AnswerChange, CallupReason, CallupRow, StaffAnswerRow } from '../../app/types/api'

const row = (over: Partial<CallupRow> = {}): CallupRow => ({
  enrollmentId: 'i1', personId: 'p1', name: 'Anna', surname: 'Rossi', jerseyNumber: null, position: null,
  status: 'available', response: null, placement: null, notified: false, reasons: [], ...over,
})
const reason = (severity: CallupReason['severity'], code = 'x'): CallupReason => ({ code, severity })

describe('reasons', () => {
  it('splits what blocks from what only warns', () => {
    const r = row({ reasons: [reason('hard', 'injured'), reason('confirm', 'absence'), reason('warning', 'certificate_expiring')] })
    expect(blockers(r).map(x => x.code)).toEqual(['injured', 'absence'])
    expect(warnings(r).map(x => x.code)).toEqual(['certificate_expiring'])
  })
  it('the translation key follows the code', () => {
    expect(reasonKey('certificate_expired')).toBe('callup.reason.certificate_expired')
  })
})

describe('rowAction: what a tap does', () => {
  it('a callable person is added', () => expect(rowAction('callable', row())).toBe('add'))
  it('a callable person with only warnings is added', () => {
    expect(rowAction('callable', row({ reasons: [reason('warning')] }))).toBe('add')
  })
  it('a called up person is removed', () => expect(rowAction('calledUp', row())).toBe('remove'))
  it('not callable for a hard reason: nothing can be done', () => {
    expect(rowAction('notCallable', row({ reasons: [reason('hard', 'injured')] }))).toBe('none')
  })
  it('not callable for an absence: added after a confirmation', () => {
    expect(rowAction('notCallable', row({ reasons: [reason('confirm', 'absence')] }))).toBe('add_confirm')
  })
  it('hard wins over confirm', () => {
    expect(rowAction('notCallable', row({ reasons: [reason('confirm'), reason('hard')] }))).toBe('none')
  })
})

describe('togglePlacement', () => {
  it('a tap sets the mark, a second tap on the same mark clears it, the other mark replaces it', () => {
    expect(togglePlacement(null, 'starter')).toBe('starter')
    expect(togglePlacement('starter', 'starter')).toBeNull()
    expect(togglePlacement('starter', 'bench')).toBe('bench')
  })
})

describe('counts', () => {
  it('counts the three lists and the call-ups not sent yet', () => {
    const lists = {
      calledUp: [row({ notified: true }), row({ notified: false }), row({ notified: false })],
      callable: [row()],
      notCallable: [],
    }
    expect(callupCounts(lists)).toEqual({ calledUp: 3, callable: 1, notCallable: 0 })
    expect(unsentCount(lists.calledUp)).toBe(2)
  })
})

describe('needsConfirmation', () => {
  it('recognises the API code', () => {
    expect(needsConfirmation('CALLUP_CONFIRMATION_REQUIRED')).toBe(true)
    expect(needsConfirmation('ENROLLMENT_NOT_CALLABLE')).toBe(false)
    expect(needsConfirmation(undefined)).toBe(false)
  })
})

describe('answering', () => {
  it('the decline reasons are the closed list of the API', () => {
    expect(DECLINE_REASONS).toEqual(['commitment_personal', 'work', 'not_available'])
  })

  it('my answer is the one of my own row, and null when I am not called up', () => {
    const rows = [
      { enrollmentId: 'a', name: 'A', surname: null, jerseyNumber: null, response: 'pending' as const, mine: false },
      { enrollmentId: 'b', name: 'B', surname: null, jerseyNumber: null, response: 'declined' as const, mine: true },
    ]
    expect(myAnswer(rows)).toBe('declined')
    expect(myAnswer([rows[0]!])).toBeNull()
    expect(myAnswer([])).toBeNull()
  })

  it('declining needs a reason, confirming does not', () => {
    expect(canSend('declined', null)).toBe(false)
    expect(canSend('declined', 'work')).toBe(true)
    expect(canSend('confirmed', null)).toBe(true)
  })
})

describe('staff availability', () => {
  const s = (enrollmentId: string, response: StaffAnswerRow['response']): StaffAnswerRow => ({ enrollmentId, name: enrollmentId, surname: null, staffRole: 'coach', response, mine: false })

  it('groups staff by answer, keeping the order', () => {
    const g = groupStaff([s('a', 'declined'), s('b', 'confirmed'), s('c', null), s('d', 'confirmed'), s('e', 'pending')])
    expect(g.available.map(x => x.enrollmentId)).toEqual(['b', 'd'])
    expect(g.notAvailable.map(x => x.enrollmentId)).toEqual(['a'])
    expect(g.noAnswer.map(x => x.enrollmentId)).toEqual(['c', 'e'])
  })

  it('the viewer own row is found, if the viewer is staff', () => {
    expect(ownStaffRow([s('a', null), { ...s('b', 'confirmed'), mine: true }])?.enrollmentId).toBe('b')
    expect(ownStaffRow([s('a', null)])).toBeNull()
  })
})

describe('the trail of answers', () => {
  const change = (to: AnswerChange['to'], reason: AnswerChange['reason'] = null): AnswerChange => ({ from: 'pending', fromReason: null, to, reason, changedAt: '2026-11-12T18:40:00.000Z' })

  it('each entry says the new answer and, for a decline, the reason', () => {
    expect(historyParts(change('confirmed'))).toEqual({ responseKey: 'callup.response.confirmed', reasonKey: null })
    expect(historyParts(change('declined', 'work'))).toEqual({ responseKey: 'callup.response.declined', reasonKey: 'callup.declineReason.work' })
  })

  it('the date and time are written for the reader language', () => {
    const it = formatChangeTime('2026-11-12T18:40:00.000Z', 'it', 'UTC')
    expect(it).toContain('12/11/2026')
    expect(it).toContain('18:40')
  })
})
