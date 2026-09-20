import * as SwitchPrimitive from '@radix-ui/react-switch'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'peer inline-flex h-7 w-12 shrink-0 items-center rounded-full border border-transparent outline-none transition-colors data-[state=checked]:bg-primary data-[state=unchecked]:bg-input focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          // bg-foreground rather than a literal white: in dark mode
          // foreground is near-white (matches the previous look), but in
          // light mode it's dark ink — which is what actually keeps the
          // thumb visible against the light-grey unchecked track, where a
          // literal white thumb nearly disappeared. The checked track is
          // always the saturated primary blue, so primary-foreground (always
          // white) reads fine there in both themes.
          'pointer-events-none block size-6 rounded-full shadow-sm ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=checked]:bg-primary-foreground data-[state=unchecked]:translate-x-0.5 data-[state=unchecked]:bg-foreground',
        )}
      />
    </SwitchPrimitive.Root>
  )
}
