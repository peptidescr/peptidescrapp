/**
 * Injection-site rotation (Phase 2). A protocol can opt in to tracking where
 * each dose went; logging a taken dose then asks for the site, preselecting
 * the one that has rested longest, and the protocol card says which is next.
 *
 * Rest is counted across every protocol, not per protocol: it's the same
 * patch of skin whichever compound went into it. The rule is plain — least
 * recently used first, never-used before used — and makes no claim about how
 * long a site *should* rest; the app shows days, not a verdict.
 */
import { differenceInCalendarDays } from 'date-fns'
import type { DoseLog, Route } from './db'

export const SITE_IDS = [
  'abdomen-upper-left',
  'abdomen-upper-right',
  'abdomen-lower-left',
  'abdomen-lower-right',
  'thigh-left',
  'thigh-right',
  'arm-left',
  'arm-right',
  'glute-left',
  'glute-right',
  'deltoid-left',
  'deltoid-right',
] as const

export type SiteId = (typeof SITE_IDS)[number]

/** Which body-map view a site is drawn on. */
export const SITE_VIEW: Record<SiteId, 'front' | 'back'> = {
  'abdomen-upper-left': 'front',
  'abdomen-upper-right': 'front',
  'abdomen-lower-left': 'front',
  'abdomen-lower-right': 'front',
  'thigh-left': 'front',
  'thigh-right': 'front',
  'deltoid-left': 'front',
  'deltoid-right': 'front',
  // Subcutaneous upper-arm injections go into the back of the arm.
  'arm-left': 'back',
  'arm-right': 'back',
  'glute-left': 'back',
  'glute-right': 'back',
}

/**
 * The standard sites per route, in the fixed order ties are broken by. Thighs
 * and glutes appear under both: it's the same area of the body, so they share
 * rest tracking whichever way they were injected.
 */
export const SITES_BY_ROUTE: Record<Route, readonly SiteId[]> = {
  subcutaneous: [
    'abdomen-upper-left',
    'abdomen-upper-right',
    'abdomen-lower-left',
    'abdomen-lower-right',
    'thigh-left',
    'thigh-right',
    'arm-left',
    'arm-right',
    'glute-left',
    'glute-right',
  ],
  intramuscular: ['deltoid-left', 'deltoid-right', 'glute-left', 'glute-right', 'thigh-left', 'thigh-right'],
  other: [],
}

export function isSiteId(value: unknown): value is SiteId {
  return typeof value === 'string' && (SITE_IDS as readonly string[]).includes(value)
}

/** The sites a protocol rotates through: its own list, in the route's standard order, minus any that don't belong to the route. */
export function rotationSites(route: Route, chosen: readonly SiteId[]): SiteId[] {
  return SITES_BY_ROUTE[route].filter((site) => chosen.includes(site))
}

/** When each site was last used, from taken doses that recorded one. */
export function lastUsedBySite(doseLogs: readonly DoseLog[]): Map<SiteId, Date> {
  const last = new Map<SiteId, Date>()
  for (const log of doseLogs) {
    if (log.status !== 'taken' || !log.site) continue
    const at = new Date(log.administeredAt)
    const previous = last.get(log.site)
    if (!previous || at > previous) last.set(log.site, at)
  }
  return last
}

export interface SiteRest {
  site: SiteId
  /** Whole days since it was last used; null when it never has been. */
  restDays: number | null
}

export function siteRest(sites: readonly SiteId[], doseLogs: readonly DoseLog[], now: Date): SiteRest[] {
  const last = lastUsedBySite(doseLogs)
  return sites.map((site) => {
    const at = last.get(site)
    return { site, restDays: at ? Math.max(0, differenceInCalendarDays(now, at)) : null }
  })
}

/**
 * How rested each site is next to the others, from 0 (used most recently) to 1
 * (rested longest, or never used), so the body map can fade recently used
 * sites. Relative on purpose: it ranks the sites against each other and makes
 * no claim about how long a site should rest. Never-used counts as one day more
 * rested than the longest-rested used site; all equal means all 1.
 */
export function restEmphasis(rest: readonly SiteRest[]): Map<SiteId, number> {
  const used = rest.flatMap((r) => (r.restDays === null ? [] : [r.restDays]))
  const longest = Math.max(0, ...used)
  const top = used.length < rest.length ? longest + 1 : longest
  return new Map(rest.map(({ site, restDays }) => [site, top === 0 ? 1 : (restDays ?? top) / top]))
}

/** The site that has rested longest: never used first, then least recently used; ties go to the earlier site in the list. */
export function suggestSite(sites: readonly SiteId[], doseLogs: readonly DoseLog[]): SiteId | null {
  const last = lastUsedBySite(doseLogs)
  let best: SiteId | null = null
  let bestAt: number | null = null
  for (const site of sites) {
    const at = last.get(site)?.getTime() ?? null
    if (best === null || (bestAt !== null && (at === null || at < bestAt))) {
      best = site
      bestAt = at
    }
  }
  return best
}
