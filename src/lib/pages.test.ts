import { describe, expect, it } from 'vitest'
import {
  HOME,
  isProtocolFlow,
  isProtocolPicker,
  isSubPage,
  MAX_PAGES,
  popPage,
  pushPage,
  reachablePage,
  replacePage,
  segmentOf,
  tabOf,
  tabPage,
  trackPage,
  visibleTabs,
  type Page,
} from './pages'

const list: Page = trackPage('protocols')
const picker: Page = { tab: 'track', segment: 'protocols', view: { kind: 'picker' } }
const form: Page = { tab: 'track', segment: 'protocols', view: { kind: 'form' } }
const calc: Page = { tab: 'tools', tool: 'calculator', protocolId: 'p1' }
const today: Page = trackPage('today')
const history: Page = trackPage('history')

describe('pushPage / popPage', () => {
  it('goes back to wherever you came from', () => {
    const edit: Page = { tab: 'track', segment: 'protocols', view: { kind: 'form', protocolId: 'p1' } }
    const fromHome = pushPage([HOME], edit)
    expect(popPage(fromHome)).toEqual([HOME])
    const viaHistory = pushPage(pushPage([HOME], history), edit)
    expect(popPage(viaHistory)).toEqual([HOME, history])
  })

  it('adds nothing when going to the page already showing', () => {
    expect(pushPage([HOME, list], trackPage('protocols'))).toEqual([HOME, list])
  })

  it('never goes back past the first page', () => {
    expect(popPage([HOME])).toEqual([HOME])
    expect(popPage([HOME, picker, form], () => true)).toEqual([HOME])
  })

  it('skips the template picker once a new protocol is saved', () => {
    expect(popPage([HOME, list, picker, form], isProtocolPicker)).toEqual([HOME, list])
    // Cancelling the form is ordinary back: to the picker, to choose again.
    expect(popPage([HOME, list, picker, form])).toEqual([HOME, list, picker])
  })

  it('leaves a finished protocol flow behind when moving on from it', () => {
    expect(pushPage([HOME, list, picker, form], calc, isProtocolFlow)).toEqual([HOME, list, calc])
  })

  it('forgets the oldest pages past the cap', () => {
    let pages: Page[] = [HOME]
    for (let i = 0; i < MAX_PAGES + 10; i++) pages = pushPage(pages, { tab: 'tools', tool: 'calculator', protocolId: String(i) })
    expect(pages).toHaveLength(MAX_PAGES)
    expect(pages.at(-1)).toEqual({ tab: 'tools', tool: 'calculator', protocolId: String(MAX_PAGES + 9) })
  })
})

describe('replacePage (switching segment inside Track)', () => {
  it('swaps the page showing without adding to the history', () => {
    expect(replacePage([HOME, today], history)).toEqual([HOME, history])
  })

  it('makes back from the new segment leave Track, not walk through the segments flicked across', () => {
    let pages: Page[] = pushPage([HOME], today) // Home -> Track tab (Today)
    pages = replacePage(pages, trackPage('protocols'))
    pages = replacePage(pages, history)
    pages = replacePage(pages, trackPage('progress'))
    expect(popPage(pages)).toEqual([HOME])
  })

  it('does nothing when the segment is already showing, and works on a single page', () => {
    expect(replacePage([HOME, today], trackPage('today'))).toEqual([HOME, today])
    expect(replacePage([HOME], today)).toEqual([today])
    expect(replacePage([], today)).toEqual([today])
  })

  it('does not touch the pages beneath', () => {
    const before: Page[] = [HOME, { tab: 'settings' }, today]
    expect(replacePage(before, history).slice(0, 2)).toEqual(before.slice(0, 2))
  })
})

describe('tabs and segments', () => {
  it('a tab-bar tap opens the tab at its root, Track on the segment it is given', () => {
    expect(tabPage('home')).toEqual(HOME)
    expect(tabPage('tools')).toEqual({ tab: 'tools', tool: 'calculator' })
    expect(tabPage('track')).toEqual({ tab: 'track', segment: 'today' })
    expect(tabPage('track', 'history')).toEqual({ tab: 'track', segment: 'history' })
    expect(tabPage('track', 'protocols')).toEqual({ tab: 'track', segment: 'protocols', view: { kind: 'list' } })
    expect(tabPage('settings')).toEqual({ tab: 'settings' })
  })

  it('knows which tab and segment a page belongs to', () => {
    expect(tabOf(HOME)).toBe('home')
    expect(tabOf(form)).toBe('track')
    expect(tabOf(calc)).toBe('tools')
    expect(tabOf({ tab: 'settings' })).toBeNull()
    expect(segmentOf(form)).toBe('protocols')
    expect(segmentOf(history)).toBe('history')
    expect(segmentOf(HOME)).toBeNull()
    expect(segmentOf(calc)).toBeNull()
  })

  it('treats the pages opened from a segment as sub-pages, and the segment roots as not', () => {
    expect(isSubPage(form)).toBe(true)
    expect(isSubPage(picker)).toBe(true)
    expect(isSubPage({ tab: 'track', segment: 'history', editLogId: 'l1' })).toBe(true)
    for (const page of [today, list, history, trackPage('progress'), HOME, calc]) expect(isSubPage(page)).toBe(false)
  })

  it('recognises the protocol flow only inside Track > Protocols', () => {
    expect(isProtocolFlow(form)).toBe(true)
    expect(isProtocolFlow(picker)).toBe(true)
    expect(isProtocolFlow(list)).toBe(false)
    expect(isProtocolFlow(history)).toBe(false)
    expect(isProtocolPicker(picker)).toBe(true)
    expect(isProtocolPicker(form)).toBe(false)
  })
})

describe('the store features (Shop and Rewards)', () => {
  it('shows three tabs in production and five when the store is on', () => {
    expect(visibleTabs(false)).toEqual(['home', 'track', 'tools'])
    expect(visibleTabs(true)).toEqual(['home', 'track', 'shop', 'rewards', 'tools'])
  })

  it('sends a page for Shop or Rewards to Home when the store is off, and leaves everything else alone', () => {
    expect(reachablePage({ tab: 'shop' }, false)).toEqual(HOME)
    expect(reachablePage({ tab: 'rewards' }, false)).toEqual(HOME)
    expect(reachablePage({ tab: 'shop' }, true)).toEqual({ tab: 'shop' })
    expect(reachablePage({ tab: 'rewards' }, true)).toEqual({ tab: 'rewards' })
    for (const page of [HOME, today, form, calc, { tab: 'settings' } as Page]) {
      expect(reachablePage(page, false)).toBe(page)
    }
  })
})
