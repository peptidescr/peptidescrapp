import type { ComponentType, ReactNode } from 'react'

interface EmptyStateProps {
  title: string
  body: string
  icon?: ComponentType<{ className?: string }>
  action?: ReactNode
}

/** Every screen needs one of these for its no-data state — always says what to do next. */
export function EmptyState({ title, body, icon: Icon, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border px-6 py-10 text-center">
      {Icon && <Icon className="size-8 text-muted-foreground" />}
      <p className="text-base font-medium text-foreground">{title}</p>
      <p className="text-sm text-muted-foreground">{body}</p>
      {action}
    </div>
  )
}
