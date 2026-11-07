/** Sport profiles: the API sends only codes, the texts are in the frontend (`sport.<codice>`, `posizione.<codice>`). */

export interface PositionOption {
  label: string
  value: string
}

/** Options for the select: profile order (goalkeeper before the others), text in the current language. */
export function positionOptions(positions: readonly string[], translate: (key: string) => string): PositionOption[] {
  return positions.map(p => ({ label: translate(`position.${p}`), value: p }))
}

/** Text of a saved position. A value that is not a known code (old data) is shown as is. */
export function labelPosition(
  position: string | null,
  exists: (key: string) => boolean,
  translate: (key: string) => string,
): string | null {
  if (position === null) return null
  return exists(`position.${position}`) ? translate(`position.${position}`) : position
}

/** Profiles in alphabetical order of the translated name. */
export function sortProfiles<T extends { code: string }>(profiles: readonly T[], translate: (key: string) => string, language: string): T[] {
  return [...profiles].sort((a, b) => translate(`sport.${a.code}`).localeCompare(translate(`sport.${b.code}`), language))
}
