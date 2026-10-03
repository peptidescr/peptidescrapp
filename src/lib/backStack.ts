/**
 * Back navigation, in one place. The on-screen back arrow, Android's back
 * button or gesture, and the browser's back arrow all land here and do the
 * same thing: close the topmost open sheet or dialog if there is one,
 * otherwise go back one page.
 *
 * Two kinds of thing can be gone back from:
 *   - layers: open sheets, dialogs and the report, most recent on top. Each
 *     registers itself while open (useBackLayer) and is closed by back.
 *   - pages: App's page history. App registers one handler while there is a
 *     previous page to return to (setPageBack).
 *
 * The browser only ever sees one extra history entry (the "sentinel"), pushed
 * while there is anything to go back from. System back pops it, which arrives
 * here as popstate; one step is taken and, if more remain, the sentinel is put
 * back. When nothing is left the sentinel is taken off again, so the next
 * system back leaves the app as it would have before. The page's URL never
 * changes, so this needs nothing from the server or the service worker.
 *
 * Built around an injected history so the logic is testable without a
 * browser; the app uses the one instance at the bottom.
 */

const SENTINEL_KEY = 'appBack'

export interface HistoryLike {
  pushState(data: unknown, unused: string): void
  back(): void
}

export interface BackStack {
  /** Registers something closable; returns the function that unregisters it. */
  pushLayer(close: () => void): () => void
  /** The page-level back step, or null on the first page. */
  setPageBack(handler: (() => void) | null): void
  /** One step back, as the on-screen arrow does. False if there was nothing to go back from. */
  back(): boolean
}

export function createBackStack(
  history: HistoryLike,
  listen: (onPop: () => void) => void,
  defer: (fn: () => void) => void = queueMicrotask,
): BackStack {
  const layers: { id: number; close: () => void }[] = []
  let pageBack: (() => void) | null = null
  let nextId = 1
  let sentinel = false
  // Set while our own history.back() (taking the sentinel off) is on its way,
  // so its popstate isn't read as the person pressing back.
  let ownBackPending = false
  let syncQueued = false

  // Changes come in bursts (a sheet closes as the next opens, a page change
  // re-registers the page handler), so the history is reconciled once after.
  function scheduleSync() {
    if (syncQueued) return
    syncQueued = true
    defer(() => {
      syncQueued = false
      if (ownBackPending) return
      const wanted = layers.length > 0 || pageBack !== null
      if (wanted && !sentinel) {
        history.pushState({ [SENTINEL_KEY]: true }, '')
        sentinel = true
      } else if (!wanted && sentinel) {
        sentinel = false
        ownBackPending = true
        history.back()
      }
    })
  }

  function step(): boolean {
    const top = layers.pop()
    if (top) {
      top.close()
      return true
    }
    if (pageBack) {
      pageBack()
      return true
    }
    return false
  }

  listen(() => {
    if (ownBackPending) {
      ownBackPending = false
      scheduleSync()
      return
    }
    // The browser has already left the sentinel entry.
    sentinel = false
    step()
    scheduleSync()
  })

  return {
    pushLayer(close) {
      const id = nextId++
      layers.push({ id, close })
      scheduleSync()
      return () => {
        const index = layers.findIndex((layer) => layer.id === id)
        if (index === -1) return
        layers.splice(index, 1)
        scheduleSync()
      }
    },
    setPageBack(handler) {
      pageBack = handler
      scheduleSync()
    },
    back() {
      const stepped = step()
      scheduleSync()
      return stepped
    },
  }
}

export const backStack: BackStack =
  typeof window === 'undefined'
    ? createBackStack({ pushState() {}, back() {} }, () => {})
    : createBackStack(window.history, (onPop) => window.addEventListener('popstate', onPop))
