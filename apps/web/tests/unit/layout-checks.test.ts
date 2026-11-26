import { describe, expect, it } from 'vitest'
import { blockGaps, centeredInRemaining, fillsRemaining, horizontalOverflow, sameEdges, touchViolations } from '../../e2e/layout-checks'

const sidebar = { x: 0, width: 248 }

describe('horizontalOverflow', () => {
  it('is true only when scrollWidth exceeds clientWidth', () => {
    expect(horizontalOverflow(390, 390)).toBe(false)
    expect(horizontalOverflow(391, 390)).toBe(true)
    expect(horizontalOverflow(380, 390)).toBe(false)
  })
})

describe('centeredInRemaining', () => {
  it('accepts equal gaps within 1px and rejects a 2px difference', () => {
    // 1920 wide: the 1280px box centered in the 1672px after the sidebar leaves 196px on both sides
    expect(centeredInRemaining(sidebar, { x: 444, width: 1280 }, 1920)).toBe(true)
    expect(centeredInRemaining(sidebar, { x: 444.5, width: 1280 }, 1920)).toBe(true)
    expect(centeredInRemaining(sidebar, { x: 445, width: 1280 }, 1920)).toBe(false)
    expect(centeredInRemaining(sidebar, { x: 248, width: 1280 }, 1920)).toBe(false)
  })
})

describe('fillsRemaining', () => {
  it('passes only when the content spans the sidebar edge to the viewport edge', () => {
    expect(fillsRemaining(sidebar, { x: 248, width: 1192 }, 1440)).toBe(true)
    expect(fillsRemaining(sidebar, { x: 248, width: 1100 }, 1440)).toBe(false)
    expect(fillsRemaining(sidebar, { x: 300, width: 1140 }, 1440)).toBe(false)
  })
})

describe('blockGaps', () => {
  it('returns consecutive vertical distances in order and nothing for fewer than two blocks', () => {
    expect(blockGaps([{ y: 0, height: 40 }, { y: 64, height: 100 }, { y: 188, height: 20 }])).toEqual([24, 24])
    expect(blockGaps([{ y: 0, height: 40 }, { y: 72, height: 10 }, { y: 100, height: 5 }])).toEqual([32, 18])
    expect(blockGaps([{ y: 0, height: 40 }])).toEqual([])
    expect(blockGaps([])).toEqual([])
  })
})

describe('touchViolations', () => {
  it('flags short buttons and icon-only buttons narrower than 44px', () => {
    const ok = { width: 120, height: 44 }
    const short = { width: 120, height: 43 }
    const narrowIcon = { width: 36, height: 44, iconOnly: true }
    const wideIcon = { width: 44, height: 44, iconOnly: true }
    const narrowText = { width: 36, height: 44 }
    expect(touchViolations([ok, short, narrowIcon, wideIcon, narrowText])).toEqual([short, narrowIcon])
    expect(touchViolations([ok, wideIcon])).toEqual([])
  })
})

describe('sameEdges', () => {
  it('compares left and right edges within tolerance', () => {
    expect(sameEdges({ x: 444, width: 1280 }, { x: 444, width: 1280 })).toBe(true)
    expect(sameEdges({ x: 444, width: 1280 }, { x: 445, width: 1279 })).toBe(true)
    // inset of 12px on each side, as p-3 would cause
    expect(sameEdges({ x: 444, width: 1280 }, { x: 456, width: 1256 })).toBe(false)
    // same left edge, different right edge
    expect(sameEdges({ x: 444, width: 1280 }, { x: 444, width: 1200 })).toBe(false)
  })
})
