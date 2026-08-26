import { liveQuery } from 'dexie'
import { useEffect, useState } from 'react'

/**
 * Minimal Dexie live-query binding for React. `dexie-react-hooks` isn't in
 * the approved stack and Dexie's own `liveQuery()` (already part of the
 * `dexie` package) is all this needs — no extra dependency.
 */
export function useLiveQuery<T>(querier: () => Promise<T> | T, deps: unknown[] = []): T | undefined {
  const [value, setValue] = useState<T | undefined>(undefined)

  useEffect(() => {
    const subscription = liveQuery(querier).subscribe({
      next: setValue,
      error: (err: unknown) => console.error('useLiveQuery error', err),
    })
    return () => subscription.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return value
}
