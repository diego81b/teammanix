import type { CertificateStatus } from '../types/api'

/** Like the API: PDF, JPEG, PNG up to 5 MB. The API rechecks from the magic bytes. */
export const MAX_BYTE_FILE = 5 * 1024 * 1024
export const FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png']

/** The same codes as the API: the translation is already in `errori.codici`. */
export type FileError = 'INVALID_CERTIFICATE_FILE' | 'CERTIFICATE_FILE_TOO_BIG'

const days = (iso: string): number => {
  const [a, m, g] = iso.split('-').map(Number) as [number, number, number]
  return Date.UTC(a, m - 1, g) / 86_400_000
}

/** Days from today to expiry: negative if already expired, null without expiry. */
export const daysToExpiry = (expiry: string | null, today: string): number | null =>
  expiry ? days(expiry) - days(today) : null

export type VariantBadge = 'success' | 'warning' | 'error' | 'neutral'

export function variantCertificate(status: CertificateStatus): VariantBadge {
  switch (status) {
    case 'valid': return 'success'
    case 'expiring': return 'warning'
    case 'expired': return 'error'
    default: return 'neutral'
  }
}

/** Client-side check, only to give a clear error right away. */
export function checkFile(f: { type: string, size: number }): FileError | null {
  if (!FILE_TYPES.includes(f.type) || f.size === 0) return 'INVALID_CERTIFICATE_FILE'
  if (f.size > MAX_BYTE_FILE) return 'CERTIFICATE_FILE_TOO_BIG'
  return null
}

export const todayIso = (): string => new Date().toISOString().slice(0, 10)
