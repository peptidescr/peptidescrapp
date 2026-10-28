import { Award, Calculator, ClipboardList, Home, ShoppingBag, type LucideIcon } from 'lucide-react'
import type { ComponentType, SVGProps } from 'react'
import { cn } from '@/lib/utils'
import type { Tab } from '../lib/pages'

interface TabBarProps {
  /** The tabs to show, in order (see visibleTabs in src/lib/pages.ts). */
  tabs: readonly Tab[]
  /** The tab the current page belongs to; null on a page that has none (Settings). */
  active: Tab | null
  onChange: (tab: Tab) => void
  labels: Record<Tab, string>
  navLabel: string
}

type IconProps = SVGProps<SVGSVGElement>

/*
 * lucide's icons are outline-only, and the active tab shows a FILLED one, so the
 * filled versions are drawn here: the same silhouettes as the outline icons, as
 * solid shapes with their details cut out in the bar's own colour (stroke-card).
 */
const FILLED: Record<Tab, ComponentType<IconProps>> = {
  home: (props) => (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M12 2.6 2.7 10.1a1 1 0 0 0-.4.8V20a1.4 1.4 0 0 0 1.4 1.4H9v-6.2h6v6.2h5.3a1.4 1.4 0 0 0 1.4-1.4v-9.1a1 1 0 0 0-.4-.8L12 2.6z" />
    </svg>
  ),
  track: (props) => (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M8.5 2.8h7a1 1 0 0 1 1 1V5h1.8A2.2 2.2 0 0 1 20.5 7.2v12.6a2.2 2.2 0 0 1-2.2 2.2H5.7a2.2 2.2 0 0 1-2.2-2.2V7.2A2.2 2.2 0 0 1 5.7 5h1.8V3.8a1 1 0 0 1 1-1z" />
      <g className="stroke-card" strokeWidth="1.7" strokeLinecap="round">
        <path d="M8 11h.01M8 15h.01M11.5 11h4.5M11.5 15h4.5" />
      </g>
    </svg>
  ),
  shop: (props) => (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M5.4 7.2h13.2a1 1 0 0 1 1 .9l1.2 11.2a2 2 0 0 1-2 2.2H5.2a2 2 0 0 1-2-2.2L4.4 8.1a1 1 0 0 1 1-.9z" />
      <path d="M8.6 9.6V7a3.4 3.4 0 0 1 6.8 0v2.6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  ),
  rewards: (props) => (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <circle cx="12" cy="8.8" r="6.2" />
      <path d="M8.2 13.9 6.8 21.6a.6.6 0 0 0 .9.6L12 19.5l4.3 2.7a.6.6 0 0 0 .9-.6l-1.4-7.7a7.6 7.6 0 0 1-7.6 0z" />
    </svg>
  ),
  tools: (props) => (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M7 2.5h10A2.5 2.5 0 0 1 19.5 5v14a2.5 2.5 0 0 1-2.5 2.5H7A2.5 2.5 0 0 1 4.5 19V5A2.5 2.5 0 0 1 7 2.5z" />
      <rect x="7.2" y="5.2" width="9.6" height="3.6" rx="0.8" className="fill-card" />
      <g className="stroke-card" strokeWidth="2" strokeLinecap="round">
        <path d="M8 12.2h.01M12 12.2h.01M16 12.2h.01M8 15.4h.01M12 15.4h.01M16 15.4h.01M8 18.4h.01M12 18.4h.01M16 18.4h.01" />
      </g>
    </svg>
  ),
}

const OUTLINE: Record<Tab, LucideIcon> = {
  home: Home,
  track: ClipboardList,
  shop: ShoppingBag,
  rewards: Award,
  tools: Calculator,
}

/**
 * Bottom tab nav: white, an outline icon above a label; the active tab is the
 * brand colour with a filled icon. Fixed, safe-area aware, 44px+ touch targets
 * for one-handed use. Equal-width tabs, so it reads right with 3 (production)
 * and with 5 (store features on).
 *
 * Settings isn't a tab at all — it lives in the top bar (AppBar.tsx, and in the
 * Home hero) — so it has no entry here, and `active` is null on that page.
 */
export function TabBar({ tabs, active, onChange, labels, navLabel }: TabBarProps) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 flex border-t border-border/60 bg-card px-1 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_-8px_rgb(0_0_0/0.12)]"
      aria-label={navLabel}
    >
      {tabs.map((tab) => {
        const isActive = tab === active
        const Filled = FILLED[tab]
        const Outline = OUTLINE[tab]
        return (
          <button
            key={tab}
            type="button"
            onClick={() => onChange(tab)}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 py-2 outline-none transition-colors focus-visible:bg-secondary',
              isActive ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            {isActive ? <Filled className="size-6" /> : <Outline className="size-6" strokeWidth={1.75} />}
            <span className={cn('max-w-full truncate px-0.5 text-[11px] leading-tight', isActive ? 'font-bold' : 'font-medium')}>
              {labels[tab]}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
