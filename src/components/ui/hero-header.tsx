import { Bell, ChevronLeft, Moon, Settings, Sun } from 'lucide-react'
import type { ReactNode } from 'react'
import { BRAND } from '@/brand'
import type { ResolvedTheme } from '@/lib/theme'
import { cn } from '@/lib/utils'

/** A round translucent button on the brand-coloured band: back, theme, bell, settings. 44px, per the touch-target floor. */
function HeroIconButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="relative flex size-11 shrink-0 items-center justify-center rounded-full bg-on-primary-tile text-on-primary outline-none transition-colors active:bg-on-primary/25 focus-visible:ring-2 focus-visible:ring-on-primary"
    >
      {children}
    </button>
  )
}

export interface HeroHeaderProps {
  /** The small line ("Good afternoon,"). */
  greeting?: string
  /** The large bold line under it. */
  title?: ReactNode
  /** Shows a back button before the logo. */
  onBack?: () => void
  backLabel?: string
  /** Shows the bell. `hasUnread` draws its dot. */
  onOpenNotifications?: () => void
  notificationLabel?: string
  hasUnread?: boolean
  /** Shows the settings gear next to the bell. */
  onOpenSettings?: () => void
  settingsLabel?: string
  /** Shows the light/dark quick toggle first in the row, as the app bar does on every other page. */
  onToggleTheme?: () => void
  /** Which theme is showing, so the toggle can show the sun or the moon. */
  resolvedTheme?: ResolvedTheme
  themeLabel?: string
  /** More content on the band, below the greeting. */
  children?: ReactNode
  className?: string
}

/**
 * The brand-coloured band at the top of Home (and, in Part B, Rewards): large
 * rounded bottom corners, the brand's logo on the left, round translucent icon
 * buttons on the right, and a greeting over a large bold line.
 *
 * It leaves room at the bottom for the first card to overlap its edge: put that
 * card in a <HeroOverlap> right after the header (the approved Home screen has
 * the points card straddling the band).
 */
export function HeroHeader({
  greeting,
  title,
  onBack,
  backLabel,
  onOpenNotifications,
  notificationLabel,
  hasUnread = false,
  onOpenSettings,
  settingsLabel,
  onToggleTheme,
  resolvedTheme,
  themeLabel,
  children,
  className,
}: HeroHeaderProps) {
  const ThemeIcon = resolvedTheme === 'light' ? Sun : Moon
  return (
    <header
      className={cn('rounded-b-[2rem] bg-hero pb-14 text-on-primary', className)}
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="px-4">
        <div className="flex items-center gap-2 pt-4">
          {onBack && (
            <HeroIconButton label={backLabel ?? ''} onClick={onBack}>
              <ChevronLeft className="size-6" />
            </HeroIconButton>
          )}
          {/* The logo gives way first: with the back arrow and four buttons on a 320px phone,
              UPD's wide wordmark would otherwise push the row off the screen. */}
          <img
            src={BRAND.heroLogo.src}
            alt={BRAND.appName}
            width={BRAND.heroLogo.width}
            height={BRAND.heroLogo.height}
            className="min-w-0 shrink rounded-lg object-contain object-left"
            style={{ width: BRAND.heroLogo.width, height: BRAND.heroLogo.height }}
          />
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {onToggleTheme && (
              <HeroIconButton label={themeLabel ?? ''} onClick={onToggleTheme}>
                <ThemeIcon className="size-5" />
              </HeroIconButton>
            )}
            {onOpenNotifications && (
              <HeroIconButton label={notificationLabel ?? ''} onClick={onOpenNotifications}>
                <Bell className="size-5" />
                {hasUnread && (
                  <span aria-hidden className="absolute right-2.5 top-2.5 size-2.5 rounded-full bg-attention ring-2 ring-primary" />
                )}
              </HeroIconButton>
            )}
            {onOpenSettings && (
              <HeroIconButton label={settingsLabel ?? ''} onClick={onOpenSettings}>
                <Settings className="size-5" />
              </HeroIconButton>
            )}
          </div>
        </div>

        {(greeting || title) && (
          <div className="mt-3">
            {greeting && <p className="text-[13px] font-medium text-on-primary-muted">{greeting}</p>}
            {title && <h1 className="font-display text-[1.375rem] font-bold leading-tight">{title}</h1>}
          </div>
        )}
        {children}
      </div>
    </header>
  )
}

/** Pulls its content up over the bottom edge of the HeroHeader above it. */
export function HeroOverlap({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('relative -mt-10 px-4', className)}>{children}</div>
}
