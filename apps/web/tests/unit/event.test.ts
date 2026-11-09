import { describe, expect, it } from 'vitest'
import { eventActions, eventFormIssue, eventPayload, formFromEvent, groupByDay, splitInstant, toInstant, type EventForm } from '../../app/utils/event'
import type { EventDto } from '../../app/types/api'

const form = (over: Partial<EventForm> = {}): EventForm => ({
  type: 'training', title: '', date: '2026-10-06', startTime: '18:00', endTime: '19:30',
  venueId: '', note: '', opponent: '', homeAway: '', competition: '', ...over,
})

const event = (over: Partial<EventDto> = {}): EventDto => ({
  id: 'e1', seasonId: 's1', teamId: 't1', type: 'training', title: null,
  start: '2026-10-06T16:00:00.000Z', end: '2026-10-06T17:30:00.000Z', venue: null, note: null,
  status: 'scheduled', opponent: null, homeAway: null, competition: null, seriesId: null, exception: false, ...over,
})

describe('toInstant and splitInstant', () => {
  it('round trip a local date and time', () => {
    const iso = toInstant('2026-10-06', '18:00')
    expect(iso).toMatch(/Z$/)
    expect(splitInstant(iso)).toEqual({ date: '2026-10-06', time: '18:00' })
  })
  it('an invalid date or time gives null', () => {
    expect(toInstant('', '18:00')).toBeNull()
    expect(toInstant('2026-10-06', '')).toBeNull()
    expect(toInstant('2026-13-40', '18:00')).toBeNull()
  })
})

describe('eventFormIssue', () => {
  it('a complete training is valid', () => expect(eventFormIssue(form())).toBeNull())
  it('without a date or a time the data is missing', () => {
    expect(eventFormIssue(form({ date: '' }))).toBe('dates_missing')
    expect(eventFormIssue(form({ endTime: '' }))).toBe('dates_missing')
  })
  it('the end must come after the start', () => {
    expect(eventFormIssue(form({ endTime: '18:00' }))).toBe('period')
    expect(eventFormIssue(form({ endTime: '17:00' }))).toBe('period')
  })
  it('a match needs the opponent and home or away', () => {
    expect(eventFormIssue(form({ type: 'match' }))).toBe('match_incomplete')
    expect(eventFormIssue(form({ type: 'match', opponent: 'Rivals' }))).toBe('match_incomplete')
    expect(eventFormIssue(form({ type: 'match', opponent: '  ', homeAway: 'home' }))).toBe('match_incomplete')
    expect(eventFormIssue(form({ type: 'match', opponent: 'Rivals', homeAway: 'home' }))).toBeNull()
  })
  it('the match fields are ignored for other types', () => {
    expect(eventFormIssue(form({ type: 'other', opponent: '', homeAway: '' }))).toBeNull()
  })
})

describe('eventActions', () => {
  it('a scheduled event can be edited, cancelled and postponed', () => {
    expect(eventActions('scheduled')).toEqual({ edit: true, cancel: true, postpone: true })
  })
  it('a postponed event can be edited and cancelled, not postponed again', () => {
    expect(eventActions('postponed')).toEqual({ edit: true, cancel: true, postpone: false })
  })
  it('cancelled and concluded events are final', () => {
    expect(eventActions('cancelled')).toEqual({ edit: false, cancel: false, postpone: false })
    expect(eventActions('concluded')).toEqual({ edit: false, cancel: false, postpone: false })
  })
})

describe('groupByDay', () => {
  it('groups by local day keeping the order', () => {
    const a = event({ id: 'a', start: '2026-10-06T16:00:00.000Z', end: '2026-10-06T17:00:00.000Z' })
    const b = event({ id: 'b', start: '2026-10-06T17:30:00.000Z', end: '2026-10-06T18:00:00.000Z' })
    const c = event({ id: 'c', start: '2026-10-13T16:00:00.000Z', end: '2026-10-13T17:00:00.000Z' })
    const groups = groupByDay([a, b, c])
    expect(groups.map(g => g.events.map(e => e.id))).toEqual([['a', 'b'], ['c']])
    expect(groups[0]!.day).toBe(splitInstant(a.start).date)
  })
  it('empty list gives no groups', () => expect(groupByDay([])).toEqual([]))
})

describe('eventPayload', () => {
  it('a training sends instants and nulls for what is empty, with no match fields', () => {
    const p = eventPayload(form({ title: ' Warm up ', note: '  ' }))
    expect(p).toEqual({
      type: 'training', start: toInstant('2026-10-06', '18:00'), end: toInstant('2026-10-06', '19:30'),
      title: 'Warm up', venueId: null, note: null,
    })
  })
  it('a match adds opponent, home or away and competition', () => {
    const p = eventPayload(form({ type: 'match', opponent: ' Rivals ', homeAway: 'away', competition: ' ', venueId: 'v1' }))
    expect(p).toMatchObject({ type: 'match', opponent: 'Rivals', homeAway: 'away', competition: null, venueId: 'v1' })
  })
  it('an event with invalid dates has no payload', () => expect(eventPayload(form({ date: '' }))).toBeNull())
})

describe('formFromEvent', () => {
  it('fills the form from an event and back gives the same payload', () => {
    const e = event({ type: 'match', title: 'Derby', venue: { id: 'v1', name: 'Stadium' }, opponent: { id: 'o1', name: 'Rivals' }, homeAway: 'home', competition: 'Cup', note: 'n' })
    const f = formFromEvent(e)
    expect(f).toMatchObject({ type: 'match', title: 'Derby', venueId: 'v1', opponent: 'Rivals', homeAway: 'home', competition: 'Cup', note: 'n' })
    expect(eventPayload(f)).toMatchObject({ start: e.start, end: e.end })
  })
  it('null fields become empty strings', () => {
    expect(formFromEvent(event())).toMatchObject({ title: '', venueId: '', note: '', opponent: '', homeAway: '', competition: '' })
  })
})
