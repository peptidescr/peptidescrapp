import { Toaster as Sonner, type ToasterProps } from 'sonner'

/** Mounted once at the app root; call `toast(...)` from 'sonner' anywhere to show one. */
export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      position="top-center"
      toastOptions={{
        classNames: {
          toast:
            'rounded-2xl! border! border-border/60! bg-popover! text-popover-foreground! shadow-card! font-sans!',
          description: 'text-muted-foreground!',
          actionButton: 'bg-primary! text-primary-foreground! rounded-lg!',
          cancelButton: 'bg-muted! text-muted-foreground! rounded-lg!',
        },
      }}
      {...props}
    />
  )
}
