import type { StatisticsTotals } from '../types/api'
import { percent } from './attendance'

export type FigureKey = 'present' | 'late' | 'absentExcused' | 'absent' | 'rate' | 'absenceDays' | 'suspendedMatches' | 'injured'

export interface Figure {
  key: FigureKey
  value: string
}

/**
 * The figures of a row or of the team totals, in the order of the screen. The attendance rate is a whole percentage,
 * or a dash when nobody available was recorded. The injury figure is a plain count: the API sends no date and no cause.
 */
export function statisticsFigures(r: StatisticsTotals): Figure[] {
  const rate = percent(r.rate)
  return [
    { key: 'present', value: String(r.present) },
    { key: 'late', value: String(r.late) },
    { key: 'absentExcused', value: String(r.absentExcused) },
    { key: 'absent', value: String(r.absent) },
    { key: 'rate', value: rate === null ? '—' : `${rate}%` },
    { key: 'absenceDays', value: String(r.absenceDays) },
    { key: 'suspendedMatches', value: String(r.suspendedMatches) },
    { key: 'injured', value: String(r.injured) },
  ]
}
