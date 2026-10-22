import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/**
 * The approved card: white, 16px radius, a very soft shadow. It carries no
 * padding by default because several callers are lists that run their rows to
 * the card's edge (`divide-y`); pass `padded` for the usual 16px of padding, or
 * use CardContent.
 */
export function Card({ className, padded = false, ...props }: HTMLAttributes<HTMLDivElement> & { padded?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-border/60 bg-card text-card-foreground shadow-card',
        padded && 'p-4',
        className,
      )}
      {...props}
    />
  )
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1.5 p-4 pb-0', className)} {...props} />
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn('text-sm font-semibold text-muted-foreground', className)}
      {...props}
    />
  )
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-3 p-4', className)} {...props} />
}
