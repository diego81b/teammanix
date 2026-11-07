/**
 * Data of the platform operator, used by Terms, Privacy and DPA.
 * A null field appears in the text as a highlighted "[da completare]": it must be filled in before opening to other users.
 */
export interface Operator {
  legalName: string | null
  headquarters: string | null
  vatNumber: string | null
  emailPrivacy: string | null
  /** Hosting provider and server location (EU). */
  hosting: string | null
  /** Court competent for disputes. */
  jurisdiction: string | null
}

export const operator: Operator = {
  legalName: null,
  headquarters: null,
  vatNumber: null,
  emailPrivacy: null,
  hosting: null,
  jurisdiction: null,
}

export const LABELS_OPERATOR: Record<keyof Operator, string> = {
  legalName: 'ragione sociale',
  headquarters: 'sede legale',
  vatNumber: 'partita IVA',
  emailPrivacy: 'email per le richieste privacy',
  hosting: 'provider di hosting e sede dei server',
  jurisdiction: 'foro competente',
}

/** Proposed timings, to be confirmed with legal counsel. Used in the texts and in the DPA. */
export const TIMES = {
  /** Days after a club is closed during which the admin can still export the data. */
  graceClosureDays: 30,
}
