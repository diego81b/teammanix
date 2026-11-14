import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(__dirname, '../../app')
const files = (d: string): string[] =>
  readdirSync(d).flatMap((f) => {
    const p = join(d, f)
    if (statSync(p).isDirectory()) return files(p)
    return p.endsWith('.vue') ? [p] : []
  })

// A section named by a heading that does not exist has no accessible name: the literal ids must match in the same file.
describe('aria-labelledby with a literal id', () => {
  const found = files(root).flatMap((f) => {
    const src = readFileSync(f, 'utf8')
    return [...src.matchAll(/(?<![:\w])aria-labelledby="([\w-]+)"/g)].map(m => ({
      file: f.slice(root.length + 1),
      id: m[1]!,
      defined: new RegExp(`(?<![:\\w-])id="${m[1]}"`).test(src),
    }))
  })

  it('finds the references in the sources (the test is not empty)', () => {
    expect(found.length).toBeGreaterThan(5)
  })
  it('every referenced id exists in the same file', () => {
    expect(found.filter(x => !x.defined).map(x => `${x.file}: ${x.id}`)).toEqual([])
  })
})
