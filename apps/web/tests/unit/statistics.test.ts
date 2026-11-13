import { describe, expect, it } from 'vitest'
import { statisticsFigures } from '../../app/utils/statistics'
import type { StatisticsRow, StatisticsTotals } from '../../app/types/api'

const row: StatisticsRow = {
  enrollmentId: 'e1',
  name: 'Ada',
  surname: 'Rossi',
  disabled: false,
  present: 5,
  late: 1,
  absentExcused: 2,
  absent: 1,
  injured: 3,
  attended: 6,
  rate: 6 / 9,
  absenceDays: 12,
  suspendedMatches: 2,
}

describe('statisticsFigures', () => {
  it('lists the figures in the order of the screen, the attendance rate as a whole percentage', () => {
    expect(statisticsFigures(row)).toEqual([
      { key: 'present', value: '5' },
      { key: 'late', value: '1' },
      { key: 'absentExcused', value: '2' },
      { key: 'absent', value: '1' },
      { key: 'rate', value: '67%' },
      { key: 'absenceDays', value: '12' },
      { key: 'suspendedMatches', value: '2' },
      { key: 'injured', value: '3' },
    ])
  })

  it('shows a dash for the rate when nobody available was recorded', () => {
    expect(statisticsFigures({ ...row, rate: null }).find(f => f.key === 'rate')?.value).toBe('—')
  })

  it('has no date and no cause in the injury figure: a plain count', () => {
    const injured = statisticsFigures(row).find(f => f.key === 'injured')
    expect(injured).toEqual({ key: 'injured', value: '3' })
  })
})

describe('statisticsFigures on the totals', () => {
  it('reads the totals of the team the same way', () => {
    const totals: StatisticsTotals = { present: 9, late: 0, absentExcused: 1, absent: 0, injured: 0, attended: 9, rate: 0.9, absenceDays: 0, suspendedMatches: 0 }
    expect(statisticsFigures(totals).map(f => f.value)).toEqual(['9', '0', '1', '0', '90%', '0', '0', '0'])
  })
})
