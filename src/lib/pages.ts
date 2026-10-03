/**
 * The app's pages and the history of them that back walks through.
 *
 * A page is a tab plus whatever sub-page it shows: a protocol's form, the
 * template picker, a dose being edited, the calculator opened for a protocol.
 * App keeps the list of pages visited (newest last) and renders the last one;
 * these are the pure rules for adding to and taking from that list.
 */
import type { Tab } from '../components/TabBar'
import type { ProtocolPrefill } from './userTemplates'

export type ProtocolsView =
  | { kind: 'list' }
  | { kind: 'picker' }
  | { kind: 'form'; protocolId?: string; template?: ProtocolPrefill; compoundId?: string }

export type Page =
  | { tab: 'home' | 'progress' | 'settings' }
  | { tab: 'calculator'; protocolId?: string }
  | { tab: 'protocols'; view: ProtocolsView }
  | { tab: 'history'; editLogId?: string }

export const HOME: Page = { tab: 'home' }

/** Long enough for any real session; past it, the oldest pages are forgotten. */
export const MAX_PAGES = 50

/** The page a tab-bar tap opens. */
export function tabPage(tab: Tab): Page {
  if (tab === 'protocols') return { tab, view: { kind: 'list' } }
  return { tab }
}

export function samePage(a: Page, b: Page): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
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

export const isProtocolPicker = (page: Page) => page.tab === 'protocols' && page.view.kind === 'picker'

/** The template picker or a protocol form: the steps of adding or editing a protocol. */
export const isProtocolFlow = (page: Page) => page.tab === 'protocols' && page.view.kind !== 'list'
