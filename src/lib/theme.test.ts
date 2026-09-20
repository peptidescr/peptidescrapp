import { describe, expect, it } from 'vitest'
import { applyTheme, prefersDarkColorScheme, resolveTheme, subscribeToSystemTheme } from './theme'

describe('resolveTheme', () => {
  it('resolves light mode to light regardless of device preference', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('light', false)).toBe('light')
  })

  it('resolves dark mode to dark regardless of device preference', () => {
    expect(resolveTheme('dark', true)).toBe('dark')
    expect(resolveTheme('dark', false)).toBe('dark')
  })

  it('resolves system mode by following the device preference', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })
})

describe('prefersDarkColorScheme', () => {
  it('defaults to true when there is no window/matchMedia (this test env has none)', () => {
    expect(prefersDarkColorScheme()).toBe(true)
  })
})

describe('DOM-touching functions without a DOM', () => {
  it('applyTheme no-ops instead of throwing when document is undefined', () => {
    expect(() => applyTheme('light')).not.toThrow()
  })

  it('subscribeToSystemTheme returns a no-op unsubscribe when window is undefined', () => {
    const unsubscribe = subscribeToSystemTheme(() => {})
    expect(() => unsubscribe()).not.toThrow()
  })
})
