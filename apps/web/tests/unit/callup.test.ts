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
  reasonLabel,
  absenceNotice,
  suspensionNotice,
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
  it('not callable for an absence: no action, the player removes the absence first', () => {
    expect(rowAction('notCallable', row({ reasons: [reason('hard', 'absence')] }))).toBe('none')
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

describe('reasonLabel: the text of a reason', () => {
  const t = (key: string, p?: Record<string, string>) => (p ? `${key}:${JSON.stringify(p)}` : key)
  const fmt = (d: string) => `<${d}>`

  it('a plain reason is its translation', () => {
    expect(reasonLabel({ code: 'certificate_expired', severity: 'hard' }, t, fmt)).toBe('callup.reason.certificate_expired')
  })
  it('a reason with an end date appends it', () => {
    expect(reasonLabel({ code: 'injured', severity: 'hard', until: '2026-11-20' }, t, fmt)).toBe('callup.reason.injured · <2026-11-20>')
  })
  it('a declared absence with an end says "not available until"', () => {
    expect(reasonLabel({ code: 'absence', severity: 'hard', until: '2026-11-15' }, t, fmt)).toBe('callup.reason.absenceUntil:{"date":"<2026-11-15>"}')
  })
  it('a suspension says which match of how many', () => {
    expect(reasonLabel({ code: 'suspended', severity: 'hard', match: 2, total: 3 }, t, fmt)).toBe('callup.reason.suspendedMatch:{"match":"2","total":"3"}')
  })
  it('a suspension by period adds the last day', () => {
    expect(reasonLabel({ code: 'suspended', severity: 'hard', match: 1, total: 2, until: '2026-11-30' }, t, fmt)).toBe('callup.reason.suspendedMatch:{"match":"1","total":"2"} · <2026-11-30>')
  })
  it('a suspension without the count falls back to the plain text', () => {
    expect(reasonLabel({ code: 'suspended', severity: 'hard' }, t, fmt)).toBe('callup.reason.suspended')
  })
  it('a declared absence with no end has no date', () => {
    expect(reasonLabel({ code: 'absence', severity: 'hard' }, t, fmt)).toBe('callup.reason.absence')
    expect(reasonLabel({ code: 'absence', severity: 'hard', until: null }, t, fmt)).toBe('callup.reason.absence')
  })
})

describe('absenceNotice: the own staff row during a declared absence', () => {
  it('is null without an absence', () => {
    expect(absenceNotice({ absence: null })).toBeNull()
    expect(absenceNotice({})).toBeNull()
  })
  it('names the end, or none for until further notice', () => {
    expect(absenceNotice({ absence: { until: '2026-11-15' } })).toEqual({ key: 'callup.inAbsenceUntil', until: '2026-11-15' })
    expect(absenceNotice({ absence: { until: null } })).toEqual({ key: 'callup.inAbsence', until: null })
  })
})

describe('suspensionNotice: the own staff row on a covered match', () => {
  it('is null without a suspension', () => {
    expect(suspensionNotice({ suspension: null })).toBeNull()
    expect(suspensionNotice({})).toBeNull()
  })
  it('carries the match number, the count and the last day of a period', () => {
    expect(suspensionNotice({ suspension: { match: 1, total: 2, until: null } })).toEqual({ match: 1, total: 2, until: null })
    expect(suspensionNotice({ suspension: { match: 2, total: 2, until: '2026-11-30' } })).toEqual({ match: 2, total: 2, until: '2026-11-30' })
  })
})
