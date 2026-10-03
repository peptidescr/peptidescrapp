import { describe, expect, it } from 'vitest'
import { createBackStack } from './backStack'

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
