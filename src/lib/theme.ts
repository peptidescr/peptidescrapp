/**
 * Theme resolution and application — kept as pure, DOM-light logic separate
 * from React so `resolveTheme` (the part with actual branching logic) is
 * unit-testable under this repo's `environment: 'node'` vitest config: there
 * is no jsdom, so `window`/`document` don't exist in tests at all.
 * `applyTheme`/`subscribeToSystemTheme` are the only functions here that
 * touch the DOM, and both no-op safely when it's absent.
 *
 * Concrete resolved themes are always 'light' | 'dark' — 'system' is a mode,
 * resolved to one of the two before it ever reaches `data-theme`. See
 * tokens.css: the CSS is two static `:root` blocks, no media query, so JS
 * always hands it a concrete answer.
 */
import type { ThemeMode } from './units'

export type ResolvedTheme = 'light' | 'dark'

/**
 * Pre-paint cache key (localStorage). Holds only the *resolved* theme
 * ('light' | 'dark'), never the raw mode — index.html's inline script reads
 * this synchronously, before any module script runs, to set `data-theme` on
 * <html> before first paint (Dexie's `Settings.theme`, the real source of
 * truth, loads asynchronously and would otherwise paint once with the wrong
 * theme first). Written on every `applyTheme` call.
 *
 * NOTE: the key string is duplicated as a literal in index.html's inline
 * script, which can't import this module. Keep the two in sync by hand if
 * this ever changes. Also re-synced by backup.ts after a settings-replacing
 * import, since that can change `theme` outside of `applyTheme`.
 */
export const THEME_STORAGE_KEY = 'peptidescr:theme'

// Mirrors tokens.css's --brand-surface-2 (the page background) for each
// theme — used only for the <meta name="theme-color"> browser-chrome color,
// which can't read a CSS custom property. Keep in sync with tokens.css by
// hand if the palette changes.
const LIGHT_THEME_COLOR = '#f0f5fa'
const DARK_THEME_COLOR = '#060b1a'

/** True if the device prefers dark, or if matchMedia isn't available (this app defaults dark-first). */
export function prefersDarkColorScheme(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

/**
 * Mode → concrete theme. `prefersDark` is injectable (rather than read
 * internally every call) so this stays a pure function for testing.
 */
export function resolveTheme(mode: ThemeMode, prefersDark: boolean = prefersDarkColorScheme()): ResolvedTheme {
  if (mode === 'light') return 'light'
  if (mode === 'dark') return 'dark'
  return prefersDark ? 'dark' : 'light'
}

/**
 * Sets `data-theme` on <html>, updates the theme-color meta tag, and mirrors
 * the resolved value to the localStorage pre-paint cache. Safe to call with
 * no DOM (SSR/tests) — it silently does nothing.
 */
export function applyTheme(theme: ResolvedTheme): void {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-theme', theme)

  const meta = document.querySelector('meta[name="theme-color"]')
  meta?.setAttribute('content', theme === 'light' ? LIGHT_THEME_COLOR : DARK_THEME_COLOR)

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Best-effort pre-paint cache only (private browsing / quota can throw)
    // — must never break the real theme application above.
  }
}

/**
 * Calls `onChange` whenever the device's own color-scheme preference flips,
 * so 'system' mode can follow it live while the app stays open. Returns an
 * unsubscribe function; no-ops (returning a no-op unsubscribe) where
 * matchMedia isn't available.
 */
export function subscribeToSystemTheme(onChange: (prefersDark: boolean) => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
  const mql = window.matchMedia('(prefers-color-scheme: dark)')
  const listener = (e: MediaQueryListEvent) => onChange(e.matches)
  mql.addEventListener('change', listener)
  return () => mql.removeEventListener('change', listener)
}
