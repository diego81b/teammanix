import { validatePeriod } from './season'
import { todayIso } from './certificate'

export interface PersonFields {
  name: string
  surname: string
  birthDate: string
  email: string
  phone: string
}

export interface FieldError { field: keyof PersonFields, key: string }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Rules for a record created by an admin (like the API): name, at least one contact, real and non-future birth date. */
export function validatePerson(c: PersonFields, today: string = todayIso()): FieldError[] {
  const err: FieldError[] = []
  const name = c.name.trim().length
  if (name < 1 || name > 100) err.push({ field: 'name', key: 'validation.length' })
  const email = c.email.trim()
  const tel = c.phone.trim()
  if (!email && !tel) err.push({ field: 'email', key: 'person.contactRequired' })
  if (email && !EMAIL.test(email)) err.push({ field: 'email', key: 'validation.email' })
  if (tel && (tel.length < 5 || tel.length > 30)) err.push({ field: 'phone', key: 'person.phoneNotValid' })
  if (c.birthDate && (!validatePeriod(c.birthDate, c.birthDate) || c.birthDate > today || c.birthDate < '1900-01-01')) {
    err.push({ field: 'birthDate', key: 'person.birthDateNotValid' })
  }
  return err
}

/** Request body: only the filled fields, without surrounding spaces. */
export function personData(c: PersonFields): { name: string, surname?: string, birthDate?: string, email?: string, phone?: string } {
  const clean = (v: string) => v.trim() || undefined
  return {
    name: c.name.trim(),
    ...(clean(c.surname) ? { surname: clean(c.surname) } : {}),
    ...(clean(c.birthDate) ? { birthDate: clean(c.birthDate) } : {}),
    ...(clean(c.email) ? { email: clean(c.email) } : {}),
    ...(clean(c.phone) ? { phone: clean(c.phone) } : {}),
  }
}

/** The export of a disabled person (art. 15 and 20): named by id, so no name ends up in downloads or history. */
export function exportFile(personId: string, data: unknown): { name: string, type: string, text: string } {
  return { name: `person-${personId}.json`, type: 'application/json', text: JSON.stringify(data, null, 2) }
}
