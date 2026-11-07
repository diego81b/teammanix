import { describe, expect, it } from 'vitest'
import { invitationData, invitationStatus, validateInvitation, type InvitationFields } from '../../app/utils/invitation'

const base = (o: Partial<InvitationFields> = {}): InvitationFields => ({
  email: 'a@b.it',
  role: 'admin',
  scope: 'club',
  activityId: '',
  teamId: '',
  record: 'new',
  personId: '',
  name: '',
  language: 'it',
  ...o,
})

describe('validateInvitation', () => {
  it('admin with a valid email passes', () => expect(validateInvitation(base())).toEqual([]))
  it('invalid email', () => {
    expect(validateInvitation(base({ email: 'boh' }))).toContainEqual({ field: 'email', key: 'validation.email' })
  })
  it('activity manager without activity', () => {
    expect(validateInvitation(base({ role: 'manager', scope: 'activity' }))).toContainEqual({ field: 'activityId', key: 'invitation.destinationRequired' })
  })
  it('team manager without team', () => {
    expect(validateInvitation(base({ role: 'manager', scope: 'team' }))).toContainEqual({ field: 'teamId', key: 'invitation.destinationRequired' })
  })
  it('club manager needs no destination', () => {
    expect(validateInvitation(base({ role: 'manager', scope: 'club' }))).toEqual([])
  })
  it('staff with a new record needs the name', () => {
    expect(validateInvitation(base({ role: 'staff', record: 'new' }))).toContainEqual({ field: 'name', key: 'validation.length' })
  })
  it('player with an existing record needs the person', () => {
    expect(validateInvitation(base({ role: 'player', record: 'existing' }))).toContainEqual({ field: 'personId', key: 'invitation.recordRequired' })
  })
  it('player with a new record and name passes', () => {
    expect(validateInvitation(base({ role: 'player', name: 'Luca' }))).toEqual([])
  })
  it('admin ignores scope and record', () => {
    expect(validateInvitation(base({ role: 'admin', scope: 'team', record: 'existing' }))).toEqual([])
  })
})

describe('invitationData', () => {
  it('admin: only email, role and language', () => {
    expect(invitationData(base({ email: ' a@b.it ', scope: 'team', teamId: 's1', name: 'x' }))).toEqual({ email: 'a@b.it', role: 'admin', language: 'it' })
  })
  it('activity manager', () => {
    expect(invitationData(base({ role: 'manager', scope: 'activity', activityId: 'a1', teamId: 's1' }))).toEqual({
      email: 'a@b.it', role: 'manager', language: 'it', scope: 'activity', activityId: 'a1',
    })
  })
  it('team manager', () => {
    expect(invitationData(base({ role: 'manager', scope: 'team', teamId: 's1', activityId: 'a1' }))).toEqual({
      email: 'a@b.it', role: 'manager', language: 'it', scope: 'team', teamId: 's1',
    })
  })
  it('club manager: no destination', () => {
    expect(invitationData(base({ role: 'manager', activityId: 'a1' }))).toEqual({ email: 'a@b.it', role: 'manager', language: 'it', scope: 'club' })
  })
  it('staff with a new record', () => {
    expect(invitationData(base({ role: 'staff', name: ' Luca ', personId: 'p1', language: 'en' }))).toEqual({ email: 'a@b.it', role: 'staff', language: 'en', name: 'Luca' })
  })
  it('player with an existing record', () => {
    expect(invitationData(base({ role: 'player', record: 'existing', personId: 'p1', name: 'x' }))).toEqual({ email: 'a@b.it', role: 'player', language: 'it', personId: 'p1' })
  })
})

describe('invitationStatus', () => {
  const now = new Date('2026-11-06T10:00:00Z')
  it('sent with a future expiry stays sent', () => {
    expect(invitationStatus({ status: 'sent', expiresAt: '2026-11-10T10:00:00Z' }, now)).toBe('sent')
  })
  it('sent with a past expiry becomes expired', () => {
    expect(invitationStatus({ status: 'sent', expiresAt: '2026-11-01T10:00:00Z' }, now)).toBe('expired')
  })
  it('accepted and revoked do not change', () => {
    expect(invitationStatus({ status: 'accepted', expiresAt: '2026-11-01T10:00:00Z' }, now)).toBe('accepted')
    expect(invitationStatus({ status: 'revoked', expiresAt: '2026-11-01T10:00:00Z' }, now)).toBe('revoked')
  })
})
