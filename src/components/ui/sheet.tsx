import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

/**
 * A bottom sheet for browsing/editing a list of things — distinct from
 * ui/dialog.tsx, which is sized for a short confirm or a compact form.
 *
 * The difference that matters is scroll: this one is height-capped with its
 * body scrolling independently and a grab handle at the top, which is the
 * pattern PeptIQ uses for their "daily history" view. Reusing Dialog for that
 * would either overflow the viewport or scroll the page behind it.
 *
 * Built on the same Radix Dialog primitive as ui/dialog.tsx, so it inherits
 * focus trapping, scroll locking, and Escape handling rather than
 * reimplementing them.
 */
export const Sheet = DialogPrimitive.Root
export const SheetTrigger = DialogPrimitive.Trigger
export const SheetClose = DialogPrimitive.Close

export function SheetContent({ className, children, ...props }: ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className={cn(
          'fixed inset-0 z-50 bg-black/60',
          'data-[state=open]:animate-in data-[state=open]:fade-in-0',
          'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
        )}
      />
      <DialogPrimitive.Content
        className={cn(
          'fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col rounded-t-3xl border-t border-border',
          'bg-popover text-popover-foreground shadow-lg',
          'pb-[env(safe-area-inset-bottom)]',
          'data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom',
          'data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom',
          className,
        )}
        {...props}
      >
        {/* Grab handle — purely affordance, so it's hidden from the a11y tree. */}
        <div aria-hidden className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-border" />
        {children}
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-lg p-1 text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <X className="size-5" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

export function SheetHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex shrink-0 flex-col gap-1 px-5 pb-3 pt-4', className)} {...props} />
}

export function SheetTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn('font-display text-xl font-semibold text-foreground', className)}
      {...props}
    />
  )
}

export function SheetDescription({ className, ...props }: ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn('text-sm text-muted-foreground', className)} {...props} />
}

/** The scrolling region. Everything long goes in here, not in SheetContent directly. */
export function SheetBody({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex-1 overflow-y-auto px-5 pb-5', className)} {...props} />
}
