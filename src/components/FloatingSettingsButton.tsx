import { Settings } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/**
 * A viewport-anchored button (not part of the scrolling page, not part of
 * the bottom tab bar) — stays in the same spot on screen while the page
 * content scrolls underneath it, at the client's explicit request. Rendered
 * once in App.tsx so it's present on every screen; App.tsx also reserves top
 * padding on the page content so nothing scrolls under it.
 *
 * Deliberately NOT `fixed` itself — App.tsx renders this alongside
 * FloatingThemeToggleButton inside one shared `fixed` flex wrapper, so the
 * two read as a matched pair with a single positioning owner instead of two
 * buttons independently computing their own right offset.
 */
export function FloatingSettingsButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t('nav.settings')}
      className="flex size-11 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-lg"
    >
      <Settings className="size-5" />
    </button>
  )
}
