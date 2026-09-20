import { Check, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * PeptIQ's signature selection row, rebuilt: an icon in a tinted circular
 * badge, a bold label with a grey explanatory line under it, and a
 * radio/checkbox indicator on the right. It's the single component that makes
 * their onboarding read as considered rather than utilitarian, because every
 * choice gets a sentence explaining what picking it actually means.
 *
 * Rendered as a real <button> with aria-pressed rather than a styled div, so
 * it's keyboard-reachable and announced correctly — the previous ad-hoc
 * pickers in this app were colour-only, which told a screen-reader user
 * nothing about what was selected.
 */
export function OptionCard({
  label,
  description,
  icon: Icon,
  selected,
  multi = false,
  onSelect,
  className,
}: {
  label: string
  description?: string
  icon?: LucideIcon
  selected: boolean
  /** Multi-select renders a square check; single-select renders a radio dot. */
  multi?: boolean
  onSelect: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'flex min-h-11 w-full items-center gap-3 rounded-2xl border p-4 text-left transition-colors',
        selected ? 'border-primary bg-accent' : 'border-border bg-card',
        className,
      )}
    >
      {Icon && (
        <span
          className={cn(
            // Selected renders as a solid fill (not just a stronger tint of
            // the same accent used for the whole selected card behind it) —
            // a translucent primary/20 badge on top of the equally-tinted
            // bg-accent card collapsed to nearly the same colour in light
            // mode. A solid vs. soft-tint contrast holds at any palette.
            'flex size-10 shrink-0 items-center justify-center rounded-full transition-colors',
            selected ? 'bg-primary' : 'bg-accent',
          )}
        >
          <Icon className={cn('size-5', selected ? 'text-primary-foreground' : 'text-primary')} />
        </span>
      )}

      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-semibold text-foreground">{label}</span>
        {description && <span className="text-sm text-muted-foreground">{description}</span>}
      </span>

      <span
        aria-hidden
        className={cn(
          'flex size-6 shrink-0 items-center justify-center border-2 transition-colors',
          multi ? 'rounded-md' : 'rounded-full',
          selected ? 'border-primary bg-primary' : 'border-border',
        )}
      >
        {selected &&
          (multi ? (
            <Check className="size-4 text-primary-foreground" />
          ) : (
            <span className="size-2 rounded-full bg-primary-foreground" />
          ))}
      </span>
    </button>
  )
}
