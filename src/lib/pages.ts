/**
 * The app's pages and the history of them that back walks through.
 *
 * A page is a tab plus whatever sub-page it shows. The bottom bar has five tabs
 * (Home, Track, Shop, Rewards, Tools); Settings is a page too, reached from the
 * top bar rather than the tab bar. Track holds the four tracking views as
 * segments (Today, Protocols, History, Progress) and, inside Protocols and
 * History, the sub-pages: a protocol's form, the template picker, a dose being
 * edited. Tools holds the calculator, opened for a protocol or on its own.
 *
 * App keeps the list of pages visited (newest last) and renders the last one;
 * these are the pure rules for adding to and taking from that list.
 *
 * Tab-bar taps and sub-pages PUSH a page, so back returns to where you came
 * from. Switching segment inside Track REPLACES the top page instead
 * (replacePage), so back from History goes to the tab before Track, not through
 * the segments you flicked across.
 */
import type { ProtocolPrefill } from './userTemplates'

/** What the bottom bar offers. Shop and Rewards only appear when the store features are on. */
export type Tab = 'home' | 'track' | 'shop' | 'rewards' | 'tools'

export type TrackSegment = 'today' | 'protocols' | 'history' | 'progress'
export const TRACK_SEGMENTS: readonly TrackSegment[] = ['today', 'protocols', 'history', 'progress']

/** The tools Tools can hold. One for now; the screen is built to take more. */
export type ToolId = 'calculator'

export type ProtocolsView =
  | { kind: 'list' }
  | { kind: 'picker' }
  | { kind: 'form'; protocolId?: string; template?: ProtocolPrefill; compoundId?: string }

export type Page =
  | { tab: 'home' | 'shop' | 'rewards' | 'settings' }
  | { tab: 'track'; segment: 'today' | 'progress' }
  | { tab: 'track'; segment: 'protocols'; view: ProtocolsView }
  | { tab: 'track'; segment: 'history'; editLogId?: string }
  | { tab: 'tools'; tool: ToolId; protocolId?: string }

export const HOME: Page = { tab: 'home' }

/** Long enough for any real session; past it, the oldest pages are forgotten. */
export const MAX_PAGES = 50

/**
 * The tabs the bar shows, in order. Shop and Rewards belong to the store
 * connection (Part B), so a site without it (the default) shows three.
 */
export function visibleTabs(storeEnabled: boolean): Tab[] {
  return storeEnabled ? ['home', 'track', 'shop', 'rewards', 'tools'] : ['home', 'track', 'tools']
}

/** The page for a track segment, at its root (the protocol list, no dose being edited). */
export function trackPage(segment: TrackSegment): Page {
  if (segment === 'protocols') return { tab: 'track', segment, view: { kind: 'list' } }
  if (segment === 'history') return { tab: 'track', segment }
  return { tab: 'track', segment }
}

/**
 * The page a tab-bar tap opens. Track opens at `trackSegment` (the one it was
 * last left on, if the caller remembers it), Today otherwise.
 */
export function tabPage(tab: Tab | 'settings', trackSegment: TrackSegment = 'today'): Page {
  if (tab === 'track') return trackPage(trackSegment)
  if (tab === 'tools') return { tab, tool: 'calculator' }
  return { tab }
}

/** The tab a page belongs to, for highlighting the bar; Settings belongs to none. */
export function tabOf(page: Page): Tab | null {
  return page.tab === 'settings' ? null : page.tab
}

/** The segment a Track page is showing; null for any other page. */
export function segmentOf(page: Page): TrackSegment | null {
  return page.tab === 'track' ? page.segment : null
}

export function samePage(a: Page, b: Page): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * Where a page can be reached at all. Shop and Rewards are Part B: with the
 * store features off they have no tab, and a page for them (a stale link, a
 * forged message) falls back to Home rather than showing an empty screen.
 */
export function reachablePage(page: Page, storeEnabled: boolean): Page {
  if (!storeEnabled && (page.tab === 'shop' || page.tab === 'rewards')) return HOME
  return page
}

/**
 * Goes to `next`. `leaving` first drops pages off the top that shouldn't be
 * returned to — e.g. a protocol form that has just been saved — so back from
 * `next` skips them. Going to the page already showing adds nothing.
 */
export function pushPage(pages: readonly Page[], next: Page, leaving?: (page: Page) => boolean): Page[] {
  const kept = leaving ? dropWhile(pages, leaving) : [...pages]
  if (kept.length > 0 && samePage(kept[kept.length - 1]!, next)) return kept
  return [...kept, next].slice(-MAX_PAGES)
}

/** Swaps the page showing for `next`, without adding to the history (a segment switch). */
export function replacePage(pages: readonly Page[], next: Page): Page[] {
  if (pages.length === 0) return [next]
  if (samePage(pages[pages.length - 1]!, next)) return [...pages]
  return [...pages.slice(0, -1), next]
}

/**
 * Back one page, then on past any that `skipping` matches (the template picker,
 * once its form is done). Never drops the first page.
 */
export function popPage(pages: readonly Page[], skipping?: (page: Page) => boolean): Page[] {
  if (pages.length <= 1) return [...pages]
  const rest = pages.slice(0, -1)
  return skipping ? dropWhile(rest, skipping) : rest
}

function dropWhile(pages: readonly Page[], match: (page: Page) => boolean): Page[] {
  let end = pages.length
  while (end > 1 && match(pages[end - 1]!)) end -= 1
  return pages.slice(0, end)
}

export const isProtocolPicker = (page: Page) =>
  page.tab === 'track' && page.segment === 'protocols' && page.view.kind === 'picker'

/** The template picker or a protocol form: the steps of adding or editing a protocol. */
export const isProtocolFlow = (page: Page) =>
  page.tab === 'track' && page.segment === 'protocols' && page.view.kind !== 'list'

/**
 * A sub-page: something opened from a segment's list (a protocol's form, the
 * template picker, a dose being edited). Track's segment control is hidden on
 * these, as they have their own title and a back arrow.
 */
export function isSubPage(page: Page): boolean {
  if (page.tab !== 'track') return false
  if (page.segment === 'protocols') return page.view.kind !== 'list'
  if (page.segment === 'history') return page.editLogId !== undefined
  return false
}
