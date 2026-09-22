import { Moon, Settings, Sun } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ResolvedTheme } from '../lib/theme'

/** Height of the bar below the safe-area inset. App.tsx reserves exactly this much above the page. */
export const APP_BAR_HEIGHT = '3.5rem'

const ICON_BUTTON =
  'flex size-11 items-center justify-center rounded-full text-muted-foreground transition-colors active:bg-accent active:text-foreground'

/**
 * The one persistent piece of chrome, rendered once in App.tsx: the brand mark
 * on the left, the two global actions on the right. It replaces two separate
 * floating circles that used to sit over the page content and forced every
 * screen to reserve a blank band above its own header — and it means the logo
 * appears once, in the same place on every screen, instead of being repeated
 * in each screen's title row.
 *
 * `showActions` is false on Settings itself: the full Light/Dark/System control
 * is on screen there, and a Settings button on the Settings screen goes nowhere.
 *
 * The theme button is a plain two-way flip (never the three-way control, which
 * stays in Settings) and its icon reflects the *resolved* theme — under
 * 'system' that is whichever of light/dark is actually showing, and tapping
 * always flips away from it. App.tsx owns the handler, so this and Settings'
 * own control stay in sync through Dexie's live query.
 */
export function AppBar({
  showActions,
  resolvedTheme,
  onToggleTheme,
  onOpenSettings,
}: {
  showActions: boolean
  resolvedTheme: ResolvedTheme
  onToggleTheme: () => void
  onOpenSettings: () => void
}) {
  const { t } = useTranslation()
  const ThemeIcon = resolvedTheme === 'light' ? Sun : Moon

  return (
    <header
      className="fixed inset-x-0 top-0 z-30 bg-background/80 backdrop-blur-md"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="flex items-center justify-between px-4" style={{ height: APP_BAR_HEIGHT }}>
        <img src="/brand/icon-192.png" alt="USA Peptide Depot" className="size-8 rounded-[10px]" />
        {showActions && (
          <div className="-mr-3 flex items-center">
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={t('settings.appearance.quickToggle')}
              className={ICON_BUTTON}
            >
              <ThemeIcon className="size-5" />
            </button>
            <button type="button" onClick={onOpenSettings} aria-label={t('nav.settings')} className={ICON_BUTTON}>
              <Settings className="size-5" />
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
