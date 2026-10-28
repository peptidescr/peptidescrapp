/**
 * Applies the theme and says which one is showing. It was inline in App.tsx and
 * kept the resolved theme in state; the device's colour scheme is now read with
 * useSyncExternalStore instead, which needs no state set from an effect.
 *
 * While THEME_SWITCHING_ENABLED is false (src/lib/theme.ts) every mode resolves
 * to light and the system preference never matters.
 *
 * Deliberately does nothing while the stored mode is still unknown (Dexie's
 * first read hasn't resolved yet) rather than falling back to a guessed default
 * — that guess briefly overwrote index.html's correct pre-paint `data-theme`
 * with the wrong one before the real value arrived, producing a real flash.
 */
import { useEffect, useSyncExternalStore } from 'react'
import {
  applyTheme,
  prefersDarkColorScheme,
  resolveTheme,
  subscribeToSystemTheme,
  type ResolvedTheme,
} from './theme'
import type { ThemeMode } from './units'

const subscribe = (onChange: () => void) => subscribeToSystemTheme(() => onChange())

export function useTheme(mode: ThemeMode | undefined): ResolvedTheme | undefined {
  const prefersDark = useSyncExternalStore(subscribe, prefersDarkColorScheme, () => true)
  const resolved = mode === undefined ? undefined : resolveTheme(mode, prefersDark)
  useEffect(() => {
    if (resolved) applyTheme(resolved)
  }, [resolved])
  return resolved
}
