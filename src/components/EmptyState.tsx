import type { ReactNode } from 'react'

interface EmptyStateProps {
  title: string
  body: string
  action?: ReactNode
}

/** Every screen needs one of these for its no-data state — always says what to do next. */
export function EmptyState({ title, body, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-brand-border px-6 py-10 text-center">
      <p className="text-base font-medium text-brand-ink">{title}</p>
      <p className="text-sm text-brand-muted">{body}</p>
      {action}
    </div>
  )
}
