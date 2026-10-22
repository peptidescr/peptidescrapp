import { describe, expect, it } from 'vitest'
import { createBackStack } from './backStack'
import { HOME, isProtocolPicker, popPage, pushPage, replacePage, tabPage, trackPage, type Page } from './pages'

/**
 * A stand-in for the browser: a list of history entries, and a queue standing
 * in for both the microtask deferral and popstate's asynchrony. `flush` runs
 * everything queued, the way the browser would between events.
 */
function setup() {
  const queue: (() => void)[] = []
  let entries = 1 // the app's own entry
  let onPop: () => void = () => {}
  const history = {
    pushState() {
      entries += 1
    },
    back() {
      entries -= 1
      queue.push(() => onPop())
    },
  }
  const stack = createBackStack(history, (fn) => (onPop = fn), (fn) => queue.push(fn))
  const flush = () => {
    while (queue.length) queue.shift()!()
  }
  /** The person pressing the phone's or browser's back. */
  const systemBack = () => {
    entries -= 1
    onPop()
    flush()
  }
  return { stack, flush, systemBack, entries: () => entries }
}

describe('backStack', () => {
  it('adds one history entry while there is anything to go back from, and removes it after', () => {
    const { stack, flush, entries } = setup()
    const close = stack.pushLayer(() => {})
    stack.pushLayer(() => {})
    flush()
    expect(entries()).toBe(2)
    close()
    flush()
    expect(entries()).toBe(2)
    stack.back()
    flush()
    expect(entries()).toBe(1)
  })

  it('closes the newest layer before going back a page', () => {
    const { stack, flush, systemBack, entries } = setup()
    const order: string[] = []
    stack.setPageBack(() => order.push('page'))
    stack.pushLayer(() => order.push('sheet'))
    stack.pushLayer(() => order.push('dialog'))
    flush()
    systemBack()
    expect(order).toEqual(['dialog'])
    expect(entries()).toBe(2) // put back: there's more to go back from
    systemBack()
    systemBack()
    expect(order).toEqual(['dialog', 'sheet', 'page'])
  })

  it('lets system back leave the app once nothing is left', () => {
    const { stack, flush, systemBack, entries } = setup()
    // Going back lands on the first page, which has nothing before it.
    stack.setPageBack(() => stack.setPageBack(null))
    flush()
    systemBack()
    expect(entries()).toBe(1)
    expect(stack.back()).toBe(false)
  })

  it('ignores the popstate from taking its own entry off', () => {
    const { stack, flush, entries } = setup()
    let pages = 0
    stack.setPageBack(() => (pages += 1))
    flush()
    stack.setPageBack(null)
    flush()
    expect(pages).toBe(0)
    expect(entries()).toBe(1)
  })

  it('waits for its own back to land before adding the entry again', () => {
    const { stack, flush, entries } = setup()
    const close = stack.pushLayer(() => {})
    flush()
    close()
    // A new sheet opens straight after; flushing runs the pending back first.
    stack.pushLayer(() => {})
    flush()
    expect(entries()).toBe(2)
  })

  it('treats removing an already-closed layer as a no-op', () => {
    const { stack, flush, systemBack } = setup()
    let closed = 0
    const remove = stack.pushLayer(() => (closed += 1))
    flush()
    systemBack()
    remove()
    flush()
    expect(closed).toBe(1)
  })
})

/**
 * The back stack wired to the page model the way App.tsx wires them: a page
 * handler that pops the page list while there is a page to go back to, tab taps
 * and sub-pages that push, and segment switches that replace.
 */
describe('back through the pages (the app\'s real wiring)', () => {
  function app() {
    const base = setup()
    let pages: Page[] = [HOME]
    const sync = () =>
      base.stack.setPageBack(
        pages.length > 1
          ? () => {
              pages = popPage(pages)
              sync()
            }
          : null,
      )
    const act = (next: Page[]) => {
      pages = next
      sync()
      base.flush()
    }
    return {
      ...base,
      current: () => pages[pages.length - 1]!,
      depth: () => pages.length,
      go: (page: Page, leaving?: (p: Page) => boolean) => act(pushPage(pages, page, leaving)),
      swap: (page: Page) => act(replacePage(pages, page)),
      /** Back, then on past pages that `skipping` matches (what saving a new protocol does). */
      popSkipping: (skipping: (p: Page) => boolean) => act(popPage(pages, skipping)),
    }
  }

  it('Home -> Track -> three segments -> system back is Home, and the history entry is gone', () => {
    const a = app()
    a.go(tabPage('track')) // the Track tab opens on Today
    a.swap(trackPage('protocols'))
    a.swap(trackPage('history'))
    a.swap(trackPage('progress'))
    expect(a.depth()).toBe(2)
    expect(a.entries()).toBe(2)
    a.systemBack()
    expect(a.current()).toEqual(HOME)
    expect(a.entries()).toBe(1)
  })

  it('an open sheet closes first and leaves the segment where it was', () => {
    const a = app()
    a.go(tabPage('track', 'progress'))
    let closed = 0
    a.stack.pushLayer(() => (closed += 1)) // the weight sheet
    a.flush()
    a.systemBack()
    expect(closed).toBe(1)
    expect(a.current()).toEqual(trackPage('progress'))
    a.systemBack()
    expect(a.current()).toEqual(HOME)
  })

  it('a notification that opens Today lands there, and back goes to where the app was', () => {
    const a = app()
    a.go(tabPage('tools'))
    a.go(trackPage('today')) // pageForTarget('today')
    expect(a.current()).toEqual(trackPage('today'))
    a.systemBack()
    expect(a.current()).toEqual(tabPage('tools'))
  })

  it('walks back out of a protocol opened from a vial alert, to Home', () => {
    const a = app()
    a.go({ tab: 'track', segment: 'protocols', view: { kind: 'form', protocolId: 'p1' } })
    a.systemBack()
    expect(a.current()).toEqual(HOME)
  })

  it('saving a new protocol goes back past the template picker, to the list', () => {
    const a = app()
    a.go(trackPage('protocols'))
    a.go({ tab: 'track', segment: 'protocols', view: { kind: 'picker' } })
    a.go({ tab: 'track', segment: 'protocols', view: { kind: 'form' } })
    expect(a.depth()).toBe(4)
    a.popSkipping(isProtocolPicker)
    expect(a.current()).toEqual(trackPage('protocols'))
    expect(a.depth()).toBe(2)
  })

  it('"Reconstitute now" after saving a protocol leaves the finished form behind', () => {
    const a = app()
    a.go(trackPage('protocols'))
    a.go({ tab: 'track', segment: 'protocols', view: { kind: 'picker' } })
    a.go({ tab: 'track', segment: 'protocols', view: { kind: 'form' } })
    a.go({ tab: 'tools', tool: 'calculator', protocolId: 'p1' }, (p) => p.tab === 'track' && p.segment === 'protocols' && p.view.kind !== 'list')
    expect(a.depth()).toBe(3) // Home, the protocol list, the calculator
    a.systemBack()
    expect(a.current()).toEqual(trackPage('protocols'))
  })

  it('keeps the picker-skipping rule: cancelling a form returns to the picker', () => {
    const picker: Page = { tab: 'track', segment: 'protocols', view: { kind: 'picker' } }
    const form: Page = { tab: 'track', segment: 'protocols', view: { kind: 'form' } }
    expect(popPage([HOME, trackPage('protocols'), picker, form])).toEqual([HOME, trackPage('protocols'), picker])
    expect(popPage([HOME, trackPage('protocols'), picker, form], isProtocolPicker)).toEqual([HOME, trackPage('protocols')])
  })
})
