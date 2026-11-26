// Geometry of the layout sweep as pure functions over plain measurements, so a sweep bug cannot turn into a false green.
export interface Box { x: number, y: number, width: number, height: number }
export interface Target { width: number, height: number, iconOnly?: boolean }
type Span = Pick<Box, 'x' | 'width'>

const right = (s: Span) => s.x + s.width

/** AC-5: a page wider than the viewport scrolls sideways. A page exactly as wide does not. */
export function horizontalOverflow(scrollWidth: number, clientWidth: number): boolean {
  return scrollWidth > clientWidth
}

/** AC-1: the content leaves the same space (within tol) after the sidebar and before the viewport edge. */
export function centeredInRemaining(sidebar: Span, content: Span, clientWidth: number, tol = 1): boolean {
  const before = content.x - right(sidebar)
  const after = clientWidth - right(content)
  return Math.abs(before - after) <= tol
}

/** AC-2: the content starts at the sidebar edge and ends at the viewport edge. */
export function fillsRemaining(sidebar: Span, content: Span, clientWidth: number, tol = 1): boolean {
  return Math.abs(content.x - right(sidebar)) <= tol && Math.abs(right(content) - clientWidth) <= tol
}

/** AC-8: vertical distance between each block and the next, in the order given. */
export function blockGaps(blocks: Array<Pick<Box, 'y' | 'height'>>): number[] {
  return blocks.slice(1).map((b, i) => b.y - (blocks[i]!.y + blocks[i]!.height))
}

/** AC-6: targets shorter than min, and icon-only targets narrower than min. */
export function touchViolations<T extends Target>(targets: T[], min = 44): T[] {
  return targets.filter(t => t.height < min || (t.iconOnly === true && t.width < min))
}

/** AC-13: two boxes share left and right edges. */
export function sameEdges(a: Span, b: Span, tol = 1): boolean {
  return Math.abs(a.x - b.x) <= tol && Math.abs(right(a) - right(b)) <= tol
}
