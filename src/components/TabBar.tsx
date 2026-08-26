export type Tab = 'home' | 'calculator' | 'protocols' | 'history' | 'settings'

interface TabBarProps {
  active: Tab
  onChange: (tab: Tab) => void
  labels: Record<Tab, string>
}

const TABS: Tab[] = ['home', 'calculator', 'protocols', 'history', 'settings']

/** Bottom tab nav — fixed, safe-area aware, 44px+ touch targets for one-handed use. */
export function TabBar({ active, onChange, labels }: TabBarProps) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-10 flex border-t border-brand-border bg-brand-surface pb-[env(safe-area-inset-bottom)]"
      aria-label="Navegación principal"
    >
      {TABS.map((tab) => {
        const isActive = tab === active
        return (
          <button
            key={tab}
            type="button"
            onClick={() => onChange(tab)}
            aria-current={isActive ? 'page' : undefined}
            className={`flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs font-medium ${
              isActive ? 'text-brand-primary' : 'text-brand-muted'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-brand-primary' : 'bg-transparent'}`}
              aria-hidden="true"
            />
            {labels[tab]}
          </button>
        )
      })}
    </nav>
  )
}
