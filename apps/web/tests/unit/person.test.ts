import { describe, expect, it } from 'vitest'
import { personData, validatePerson, type PersonFields } from '../../app/utils/person'

const empty = (o: Partial<PersonFields> = {}): PersonFields => ({ name: '', surname: '', birthDate: '', email: '', phone: '', ...o })

describe('validatePerson', () => {
  it('name is required', () => {
    expect(validatePerson(empty({ email: 'a@b.it' }))).toContainEqual({ field: 'name', key: 'validation.length' })
  })
  it('at least one contact is required', () => {
    expect(validatePerson(empty({ name: 'Mario' }))).toContainEqual({ field: 'email', key: 'person.contactRequired' })
  })
  it('phone alone is enough', () => expect(validatePerson(empty({ name: 'Mario', phone: '3331234567' }))).toEqual([]))
  it('email alone is enough', () => expect(validatePerson(empty({ name: 'Mario', email: 'm@x.it' }))).toEqual([]))
  it('invalid email', () => {
    expect(validatePerson(empty({ name: 'Mario', email: 'boh' }))).toContainEqual({ field: 'email', key: 'validation.email' })
  })
  it('phone too short', () => {
    expect(validatePerson(empty({ name: 'Mario', phone: '123' }))).toContainEqual({ field: 'phone', key: 'person.phoneNotValid' })
  })
  it('future or nonexistent birth date', () => {
    expect(validatePerson(empty({ name: 'M', email: 'a@b.it', birthDate: '2999-01-01' }), '2026-11-06')).toContainEqual({ field: 'birthDate', key: 'person.birthDateNotValid' })
    expect(validatePerson(empty({ name: 'M', email: 'a@b.it', birthDate: '2026-02-30' }), '2026-11-06')).toContainEqual({ field: 'birthDate', key: 'person.birthDateNotValid' })
  })
  it('valid birth date', () => {
    expect(validatePerson(empty({ name: 'M', email: 'a@b.it', birthDate: '2010-05-01' }), '2026-11-06')).toEqual([])
  })
})

describe('personData', () => {
  it('drops empty fields and spaces', () => {
    expect(personData(empty({ name: ' Mario ', email: ' M@X.it ' }))).toEqual({ name: 'Mario', email: 'M@X.it' })
  })
  it('keeps all filled fields', () => {
    expect(personData({ name: 'A', surname: 'B', birthDate: '2010-05-01', email: 'a@b.it', phone: '3331234567' })).toEqual({
      name: 'A', surname: 'B', birthDate: '2010-05-01', email: 'a@b.it', phone: '3331234567',
    })
  })
})
