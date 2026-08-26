export type Tab = 'home' | 'calculator' | 'protocols' | 'history' | 'settings'

interface TabBarProps {
  active: Tab
  onChange: (tab: Tab) => void
  labels: Record<Tab, string>
  navLabel: string
}

const TABS: Tab[] = ['home', 'calculator', 'protocols', 'history', 'settings']

/** Bottom tab nav — fixed, safe-area aware, 44px+ touch targets for one-handed use. */
export function TabBar({ active, onChange, labels, navLabel }: TabBarProps) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-10 flex gap-1 border-t border-brand-border bg-brand-surface px-1 pb-[env(safe-area-inset-bottom)]"
      aria-label={navLabel}
    >
      {TABS.map((tab) => {
        const isActive = tab === active
        return (
          <button
            key={tab}
            type="button"
            onClick={() => onChange(tab)}
            aria-current={isActive ? 'page' : undefined}
            className={`flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-2 font-medium ${
              isActive ? 'text-brand-primary' : 'text-brand-muted'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-brand-primary' : 'bg-transparent'}`}
              aria-hidden="true"
            />
            <span className="text-center text-[11px] leading-tight tracking-tight break-words">
              {labels[tab]}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
