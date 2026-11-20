import { afterEach, describe, expect, it, vi } from 'vitest'
import { currentReferral, refFromSearch } from './referral'

afterEach(() => vi.unstubAllGlobals())

describe('referral codes', () => {
  it('reads a ?ref= code as UPD\'s website does (4–32 letters, digits, dashes)', () => {
    expect(refFromSearch('?ref=jane20')).toBe('JANE20')
    expect(refFromSearch('?utm_source=x&ref=AB-12')).toBe('AB-12')
    expect(refFromSearch('?ref=abc')).toBeUndefined()
    expect(refFromSearch('?ref=<script>')).toBeUndefined()
    expect(refFromSearch('')).toBeUndefined()
  })

  it('keeps a code for 30 days', () => {
    const data = new Map<string, string>([['store-referral-v1', JSON.stringify({ code: 'JANE20', at: 1000 })]])
    vi.stubGlobal('localStorage', { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) })
    expect(currentReferral(1000 + 29 * 86_400_000)).toBe('JANE20')
    expect(currentReferral(1000 + 31 * 86_400_000)).toBeUndefined()
  })
})
