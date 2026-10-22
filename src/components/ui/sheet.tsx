import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useBackClosable } from '@/lib/useBackLayer'

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
/** Closes on back (the phone's, the browser's or the app bar's) while open; see useBackClosable. */
export function Sheet(props: ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root {...useBackClosable(props)} />
}
export const SheetTrigger = DialogPrimitive.Trigger
export const SheetClose = DialogPrimitive.Close

export function SheetContent({ className, children, ...props }: ComponentProps<typeof DialogPrimitive.Content>) {
  const { t } = useTranslation()
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className={cn(
          // Same scrim as dialog.tsx/alert-dialog.tsx: the brand's darkest tone.
          'fixed inset-0 z-50 bg-tier-dark/50',
          'data-[state=open]:animate-in data-[state=open]:fade-in-0',
          'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
        )}
      />
      <DialogPrimitive.Content
        className={cn(
          'fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col rounded-t-[1.75rem]',
          'bg-popover text-popover-foreground shadow-xl',
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
        <DialogPrimitive.Close className="absolute right-2 top-2 flex size-11 items-center justify-center rounded-full text-muted-foreground outline-none active:bg-secondary focus-visible:ring-2 focus-visible:ring-ring">
          <X className="size-5" />
          <span className="sr-only">{t('common.close')}</span>
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
