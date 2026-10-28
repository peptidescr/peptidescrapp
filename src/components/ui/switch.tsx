import * as SwitchPrimitive from '@radix-ui/react-switch'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

/**
 * On = the brand colour. Off = a visible muted track (a plain border-coloured
 * one disappears on a white card). The thumb is the white card colour in both
 * states, with a hairline shadow so it reads on either track.
 *
 * The button itself is 44px tall (the touch-target floor) while the drawn track
 * is the usual 48x28: the track is a pseudo-element, so the target is bigger
 * than what you see.
 */
export function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'peer relative inline-flex h-11 w-14 shrink-0 items-center rounded-full outline-none',
        "before:absolute before:left-1 before:top-2 before:h-7 before:w-12 before:rounded-full before:transition-colors before:content-['']",
        'data-[state=checked]:before:bg-primary data-[state=unchecked]:before:bg-muted-foreground/40',
        'focus-visible:before:ring-2 focus-visible:before:ring-ring focus-visible:before:ring-offset-2 focus-visible:before:ring-offset-background',
        'disabled:cursor-not-allowed disabled:opacity-40',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none absolute left-1.5 top-1/2 block size-6 -translate-y-1/2 rounded-full bg-card shadow-sm transition-transform data-[state=checked]:translate-x-5" />
    </SwitchPrimitive.Root>
  )
}
