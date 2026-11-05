import { describe, expect, test } from 'bun:test'
import { assertId, isId } from '@/lib/ids'

describe('assertId', () => {
  test('accepts positive safe integers', () => {
    expect(assertId(1)).toBe(1)
    expect(assertId(42)).toBe(42)
    expect(assertId(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER)
  })

  test.each([
    ['a path-traversal string', '../jobs/quiet-check?x='],
    ['a numeric string', '1'],
    ['NaN', Number.NaN],
    ['zero', 0],
    ['a negative', -1],
    ['a decimal', 1.5],
    ['2**53', 2 ** 53],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['undefined', undefined],
  ])('rejects %s with a plain Error', (_label, value) => {
    // ids reach api.ts from .bind-ed Server Action args, which a crafted request controls
    expect(() => assertId(value as number)).toThrow(Error)
    expect(isId(value)).toBe(false)
  })
})
