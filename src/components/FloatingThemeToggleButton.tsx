import { Moon, Sun } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ResolvedTheme } from '../lib/theme'

/**
 * A quick two-way light/dark toggle, rendered next to
 * FloatingSettingsButton inside App.tsx's shared fixed positioning wrapper.
 * Deliberately NOT the three-way Light/Dark/System control — that stays in
 * Settings' Appearance section (see SettingsScreen.tsx). Tapping here always
 * sets an explicit light/dark choice (moving off 'system' if that was
 * active), through the same `updateSettings({ theme })` + `applyTheme` path
 * Settings' own control uses (App.tsx owns the handler), so the two stay in
 * sync automatically via Dexie's live query — no extra plumbing needed.
 *
 * The icon reflects the current *resolved* theme, not the stored mode —
 * under 'system' it shows whichever of light/dark is actually on screen
 * right now, and tapping always flips away from that.
 */
export function FloatingThemeToggleButton({
  resolvedTheme,
  onToggle,
}: {
  resolvedTheme: ResolvedTheme
  onToggle: () => void
}) {
  const { t } = useTranslation()
  const Icon = resolvedTheme === 'light' ? Sun : Moon
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={t('settings.appearance.quickToggle')}
      className="flex size-11 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-lg"
    >
      <Icon className="size-5" />
    </button>
  )
}
