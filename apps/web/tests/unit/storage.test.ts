// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pendingInvitation, internalPath } from '../../app/utils/pending-invitation'
import { eLanguage, languageOfBrowser, languageSaved, saveLanguage } from '../../app/utils/language'

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

const blockStorage = () => {
  const boom = () => { throw new Error('blocked') }
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(boom)
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(boom)
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(boom)
}

describe('percorsoInterno (anti open redirect)', () => {
  it.each(['/', '/events', '/events?x=1#a'])('accepts %s', (p) => {
    expect(internalPath(p)).toBe(p)
  })
  it.each([['//evil.com'], ['https://evil.com'], ['javascript:alert(1)'], ['events'], [''], [undefined], [null], [42], [['/a']]])(
    'rifiuta %j',
    (v) => {
      expect(internalPath(v)).toBeNull()
    },
  )
})

describe('pendingInvitation', () => {
  it('saves, reads and clears', () => {
    expect(pendingInvitation.read()).toBeNull()
    pendingInvitation.save('tok')
    expect(pendingInvitation.read()).toBe('tok')
    pendingInvitation.remove()
    expect(pendingInvitation.read()).toBeNull()
  })

  it('without storage it does not throw', () => {
    blockStorage()
    expect(pendingInvitation.read()).toBeNull()
    expect(() => pendingInvitation.save('x')).not.toThrow()
    expect(() => pendingInvitation.remove()).not.toThrow()
  })
})

describe('language', () => {
  it('isLanguage recognizes only it, en, fr', () => {
    expect(['it', 'en', 'fr'].every(eLanguage)).toBe(true)
    for (const v of ['de', 'IT', '', null, undefined, 1]) expect(eLanguage(v)).toBe(false)
  })

  it('saves and rereads the choice', () => {
    expect(languageSaved()).toBeNull()
    saveLanguage('fr')
    expect(languageSaved()).toBe('fr')
  })

  it('ignores an invalid saved value', () => {
    localStorage.setItem('tm-language', 'klingon')
    expect(languageSaved()).toBeNull()
  })

  it('without storage it does not throw', () => {
    blockStorage()
    expect(languageSaved()).toBeNull()
    expect(() => saveLanguage('en')).not.toThrow()
  })

  describe('languageOfBrowser', () => {
    const set = (l: string[]) => vi.spyOn(navigator, 'languages', 'get').mockReturnValue(l)
    it('takes the first supported language, ignoring the region', () => {
      set(['de-DE', 'fr-SN', 'en'])
      expect(languageOfBrowser()).toBe('fr')
    })
    it('null if none is supported', () => {
      set(['de', 'es'])
      expect(languageOfBrowser()).toBeNull()
    })
  })
})
