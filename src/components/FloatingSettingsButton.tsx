import { Settings } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/**
 * A fixed, viewport-anchored button (not part of the scrolling page, not
 * part of the bottom tab bar) — stays in the same spot on screen while the
 * page content scrolls underneath it, at the client's explicit request.
 * Rendered once in App.tsx so it's present on every screen; App.tsx also
 * reserves top padding on the page content so nothing scrolls under it.
 */
export function FloatingSettingsButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t('nav.settings')}
      className="fixed right-4 top-[calc(env(safe-area-inset-top)+0.75rem)] z-30 flex size-11 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-lg"
    >
      <Settings className="size-5" />
    </button>
  )
}
