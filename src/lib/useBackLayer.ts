import { useCallback, useEffect, useRef, useState } from 'react'
import { backStack } from './backStack'

/**
 * While `open`, back (the on-screen arrow, the phone's or the browser's) calls
 * `close` instead of going back a page. Layers opened later sit on top, so a
 * dialog over a sheet closes first.
 */
export function useBackLayer(open: boolean, close: () => void) {
  const closeRef = useRef(close)
  useEffect(() => {
    closeRef.current = close
  })
  useEffect(() => {
    if (!open) return
    return backStack.pushLayer(() => closeRef.current())
  }, [open])
}

interface OpenProps {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
}

/**
 * For the Radix dialog roots in components/ui: makes any dialog or sheet close
 * on back, whether its open state is controlled or, with a Trigger, its own.
 */
export function useBackClosable<P extends OpenProps>(props: P): P {
  const { open: controlledOpen, defaultOpen, onOpenChange } = props
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen ?? false)
  const controlled = controlledOpen !== undefined
  const open = controlled ? controlledOpen : uncontrolledOpen
  const setOpen = useCallback(
    (next: boolean) => {
      if (!controlled) setUncontrolledOpen(next)
      onOpenChange?.(next)
    },
    [controlled, onOpenChange],
  )
  useBackLayer(open, () => setOpen(false))
  return { ...props, open, defaultOpen: undefined, onOpenChange: setOpen }
}
