import { Toaster as Sonner, type ToasterProps } from 'sonner'

/** Mounted once at the app root; call `toast(...)` from 'sonner' anywhere to show one. */
export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      position="top-center"
      toastOptions={{
        classNames: {
          toast:
            'rounded-2xl! border! border-border! bg-popover! text-popover-foreground! shadow-lg! font-sans!',
          description: 'text-muted-foreground!',
          actionButton: 'bg-primary! text-primary-foreground!',
          cancelButton: 'bg-muted! text-muted-foreground!',
        },
      }}
      {...props}
    />
  )
}
