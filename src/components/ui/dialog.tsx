import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { forwardRef, type ComponentProps, type ComponentPropsWithoutRef, type ElementRef } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useBackClosable } from '@/lib/useBackLayer'

/** Closes on back (the phone's, the browser's or the app bar's) while open; see useBackClosable. */
export function Dialog(props: ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root {...useBackClosable(props)} />
}
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

/** forwardRef: Radix's Portal/Presence hand it a ref, and React 18 warns for a plain function component. */
export const DialogOverlay = forwardRef<ElementRef<typeof DialogPrimitive.Overlay>, ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>>(
  function DialogOverlay({ className, ...props }, ref) {
    return (
      <DialogPrimitive.Overlay
        ref={ref}
        className={cn(
          'fixed inset-0 z-50 bg-tier-dark/50 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
          className,
        )}
        {...props}
      />
    )
  },
)

export function DialogContent({
  className,
  children,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content>) {
  const { t } = useTranslation()
  return (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content
        className={cn(
          'fixed inset-x-4 bottom-4 z-50 flex flex-col gap-4 rounded-3xl bg-popover p-5 text-popover-foreground shadow-xl data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-4 data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom-4 data-[state=closed]:fade-out-0 sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-sm sm:-translate-x-1/2 sm:-translate-y-1/2',
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute right-2 top-2 flex size-11 items-center justify-center rounded-full text-muted-foreground outline-none active:bg-secondary focus-visible:ring-2 focus-visible:ring-ring">
          <X className="size-5" />
          <span className="sr-only">{t('common.close')}</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

export function DialogHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1.5', className)} {...props} />
}

export function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn('font-display text-lg font-semibold text-foreground', className)} {...props} />
}

export function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn('text-sm text-muted-foreground', className)} {...props} />
}

export function DialogFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-2', className)} {...props} />
}
