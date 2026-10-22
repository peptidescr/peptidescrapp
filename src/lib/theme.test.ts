import { describe, expect, it } from 'vitest'
import { applyTheme, prefersDarkColorScheme, resolveTheme, subscribeToSystemTheme, THEME_SWITCHING_ENABLED } from './theme'

describe('resolveTheme with switching on (what a returning dark mode would use)', () => {
  it('resolves light mode to light regardless of device preference', () => {
    expect(resolveTheme('light', true, true)).toBe('light')
    expect(resolveTheme('light', false, true)).toBe('light')
  })

  it('resolves dark mode to dark regardless of device preference', () => {
    expect(resolveTheme('dark', true, true)).toBe('dark')
    expect(resolveTheme('dark', false, true)).toBe('dark')
  })

  it('resolves system mode by following the device preference', () => {
    expect(resolveTheme('system', true, true)).toBe('dark')
    expect(resolveTheme('system', false, true)).toBe('light')
  })
})

describe('resolveTheme with switching off (the light-only app)', () => {
  it('is off in this release', () => {
    expect(THEME_SWITCHING_ENABLED).toBe(false)
  })

  it('resolves every stored mode, on any device, to light', () => {
    for (const mode of ['light', 'dark', 'system'] as const) {
      expect(resolveTheme(mode, true, false)).toBe('light')
      expect(resolveTheme(mode, false, false)).toBe('light')
    }
  })

  it('uses the flag by default', () => {
    expect(resolveTheme('dark', true)).toBe('light')
    expect(resolveTheme('system', true)).toBe('light')
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
