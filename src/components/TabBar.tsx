import { Calculator, ClipboardList, History, Home, Settings } from 'lucide-react'
import { motion } from 'motion/react'
import type { ComponentType } from 'react'

export type Tab = 'home' | 'calculator' | 'protocols' | 'history' | 'settings'

interface TabBarProps {
  active: Tab
  onChange: (tab: Tab) => void
  labels: Record<Tab, string>
  navLabel: string
}

const TABS: Tab[] = ['home', 'calculator', 'protocols', 'history', 'settings']

const ICONS: Record<Tab, ComponentType<{ className?: string }>> = {
  home: Home,
  calculator: Calculator,
  protocols: ClipboardList,
  history: History,
  settings: Settings,
}

/**
 * Settings gets an icon-only slot here rather than a labelled tab like the
 * other four — mirrors PeptIQ, which keeps Settings as a plain icon in the
 * nav bar (there, a distinct floating button; here, a lighter-weight slot
 * set off with a divider) instead of a fifth equal-weight tab.
 */
const ICON_ONLY_TABS = new Set<Tab>(['settings'])

/** Bottom tab nav — fixed, safe-area aware, 44px+ touch targets for one-handed use. */
export function TabBar({ active, onChange, labels, navLabel }: TabBarProps) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-10 flex items-stretch gap-1 border-t border-border bg-card px-1 pb-[env(safe-area-inset-bottom)]"
      aria-label={navLabel}
    >
      {TABS.map((tab) => {
        const isActive = tab === active
        const isIconOnly = ICON_ONLY_TABS.has(tab)
        const Icon = ICONS[tab]
        return (
          <button
            key={tab}
            type="button"
            onClick={() => onChange(tab)}
            aria-current={isActive ? 'page' : undefined}
            aria-label={isIconOnly ? labels[tab] : undefined}
            className={`relative flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 py-2 font-medium ${
              isIconOnly ? 'flex-none w-16 border-l border-border' : 'flex-1'
            } ${isActive ? 'text-primary' : 'text-muted-foreground'}`}
          >
            {isActive && (
              <motion.span
                layoutId="tab-indicator"
                className="absolute top-0 h-0.5 w-8 rounded-full bg-primary"
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
              />
            )}
            <Icon className="size-5" />
            {!isIconOnly && (
              <span className="text-center text-[11px] leading-tight tracking-tight break-words">
                {labels[tab]}
              </span>
            )}
          </button>
        )
      })}
    </nav>
  )
}
