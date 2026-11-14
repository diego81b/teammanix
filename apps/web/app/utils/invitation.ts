import type { Language, InvitationRole, InvitationStatus, ScopeType } from '../types/api'

export interface InvitationFields {
  email: string
  role: InvitationRole
  scope: ScopeType
  sectionId: string
  teamId: string
  record: 'existing' | 'new'
  personId: string
  name: string
  language: Language
}

export interface InvitationError { field: keyof InvitationFields, key: string }

export interface InvitationBody {
  email: string
  role: InvitationRole
  language: Language
  scope?: ScopeType
  sectionId?: string
  teamId?: string
  personId?: string
  name?: string
}

/** The section scope exists only in a club that has sections: without them there is nothing to choose. */
export function scopeOptions(hasSections: boolean): ScopeType[] {
  return hasSections ? ['club', 'section', 'team'] : ['club', 'team']
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Only the manager chooses the scope; staff and player need a record. The admin is always club-scope. */
export function validateInvitation(c: InvitationFields): InvitationError[] {
  const err: InvitationError[] = []
  if (!EMAIL.test(c.email.trim())) err.push({ field: 'email', key: 'validation.email' })
  if (c.role === 'manager') {
    if (c.scope === 'section' && !c.sectionId) err.push({ field: 'sectionId', key: 'invitation.destinationRequired' })
    if (c.scope === 'team' && !c.teamId) err.push({ field: 'teamId', key: 'invitation.destinationRequired' })
  }
  if (c.role === 'staff' || c.role === 'player') {
    if (c.record === 'existing' && !c.personId) err.push({ field: 'personId', key: 'invitation.recordRequired' })
    const name = c.name.trim().length
    if (c.record === 'new' && (name < 1 || name > 100)) err.push({ field: 'name', key: 'validation.length' })
  }
  return err
}

/** Request body: the API rejects fields unrelated to the role. */
export function invitationData(c: InvitationFields): InvitationBody {
  const base = { email: c.email.trim(), role: c.role, language: c.language }
  if (c.role === 'admin') return base
  if (c.role === 'manager') {
    return {
      ...base,
      scope: c.scope,
      ...(c.scope === 'section' ? { sectionId: c.sectionId } : {}),
      ...(c.scope === 'team' ? { teamId: c.teamId } : {}),
    }
  }
  return { ...base, ...(c.record === 'existing' ? { personId: c.personId } : { name: c.name.trim() }) }
}

/** The API leaves `inviato` even after expiry: here we tell them apart. */
export function invitationStatus(i: { status: InvitationStatus, expiresAt: string }, now: Date = new Date()): InvitationStatus {
  return i.status === 'sent' && new Date(i.expiresAt).getTime() < now.getTime() ? 'expired' : i.status
}
