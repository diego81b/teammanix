import { describe, expect, it } from 'vitest'
import { checkFile, daysToExpiry, dueText, MAX_BYTE_FILE, variantCertificate } from '../../app/utils/certificate'

describe('daysToExpiry', () => {
  it('without expiry it is null', () => expect(daysToExpiry(null, '2026-11-06')).toBeNull())
  it('counts calendar days', () => expect(daysToExpiry('2026-11-16', '2026-11-06')).toBe(10))
  it('on the same day it is 0', () => expect(daysToExpiry('2026-11-06', '2026-11-06')).toBe(0))
  it('after expiry it is negative', () => expect(daysToExpiry('2026-11-01', '2026-11-06')).toBe(-5))
})

describe('variantCertificate', () => {
  it.each([
    ['valid', 'success'],
    ['expiring', 'warning'],
    ['expired', 'error'],
    ['missing', 'neutral'],
  ] as const)('%s usa %s', (status, v) => expect(variantCertificate(status)).toBe(v))
})

describe('dueText', () => {
  it.each([
    [-5, { key: 'expiredAgo', count: 5 }],
    [-1, { key: 'expiredYesterday', count: 1 }],
    [0, { key: 'today', count: 0 }],
    [1, { key: 'tomorrow', count: 1 }],
    [20, { key: 'inDays', count: 20 }],
  ] as const)('%s days left reads %j', (daysLeft, text) => expect(dueText(daysLeft)).toEqual(text))
})

describe('checkFile', () => {
  const f = (type: string, size: number) => ({ type, size })
  it.each(['application/pdf', 'image/jpeg', 'image/png'])('accepts %s', (t) => expect(checkFile(f(t, 1000))).toBeNull())
  it('rejects other types', () => expect(checkFile(f('text/plain', 10))).toBe('INVALID_CERTIFICATE_FILE'))
  it('rejects over 5 MB', () => expect(checkFile(f('application/pdf', MAX_BYTE_FILE + 1))).toBe('CERTIFICATE_FILE_TOO_BIG'))
  it('accepts exactly 5 MB', () => expect(checkFile(f('application/pdf', MAX_BYTE_FILE))).toBeNull())
  it('rejects empty files', () => expect(checkFile(f('application/pdf', 0))).toBe('INVALID_CERTIFICATE_FILE'))
})
