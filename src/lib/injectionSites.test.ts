import { describe, expect, it } from 'vitest'
import type { DoseLog } from './db'
import { isSiteId, lastUsedBySite, restEmphasis, rotationSites, SITES_BY_ROUTE, siteRest, suggestSite } from './injectionSites'

const now = new Date(2026, 9, 10, 12)
function log(site: DoseLog['site'], daysAgo: number, status: DoseLog['status'] = 'taken'): DoseLog {
  const at = new Date(now.getTime() - daysAgo * 86_400_000).toISOString()
  return { id: `${site}-${daysAgo}`, compoundId: 'bpc-157', administeredAt: at, status, site, createdAt: at, updatedAt: at }
}

describe('suggestSite', () => {
  const sites = SITES_BY_ROUTE.subcutaneous

  it('picks a never-used site first, in list order', () => {
    expect(suggestSite(sites, [])).toBe('abdomen-upper-left')
    expect(suggestSite(sites, [log('abdomen-upper-left', 1)])).toBe('abdomen-upper-right')
  })

  it('then the least recently used', () => {
    const logs = sites.map((site, i) => log(site, i + 1)) // the last site is the longest rested
    expect(suggestSite(sites, logs)).toBe('glute-right')
    expect(suggestSite(sites, [...logs, log('glute-right', 0)])).toBe('glute-left')
  })

  it('counts rest across every protocol, but only from taken doses', () => {
    const logs = sites.map((site) => log(site, 3))
    expect(suggestSite(['thigh-left', 'thigh-right'], [...logs, log('thigh-left', 0)])).toBe('thigh-right')
    expect(suggestSite(['thigh-left', 'thigh-right'], [...logs, log('thigh-right', 9, 'skipped'), log('thigh-left', 0)])).toBe('thigh-right')
  })

  it('has nothing to suggest without sites', () => {
    expect(suggestSite([], [])).toBeNull()
  })
})

describe('siteRest / lastUsedBySite', () => {
  it('reports whole days since last use, or null if never', () => {
    const logs = [log('arm-left', 4), log('arm-left', 1), log('thigh-left', 0)]
    expect(lastUsedBySite(logs).get('arm-left')).toEqual(new Date(now.getTime() - 86_400_000))
    expect(siteRest(['arm-left', 'thigh-left', 'glute-left'], logs, now)).toEqual([
      { site: 'arm-left', restDays: 1 },
      { site: 'thigh-left', restDays: 0 },
      { site: 'glute-left', restDays: null },
    ])
  })
})

describe('rotationSites', () => {
  it('keeps a protocol’s chosen sites in the route’s order, dropping ones the route doesn’t use', () => {
    expect(rotationSites('intramuscular', ['thigh-left', 'deltoid-right', 'abdomen-upper-left'])).toEqual([
      'deltoid-right',
      'thigh-left',
    ])
    expect(rotationSites('other', ['thigh-left'])).toEqual([])
  })

  it('recognises site ids', () => {
    expect(isSiteId('glute-left')).toBe(true)
    expect(isSiteId('knee')).toBe(false)
  })
})

describe('restEmphasis', () => {
  it('scales rest against the longest-rested site, with never-used above any used site', () => {
    const e = restEmphasis([
      { site: 'thigh-left', restDays: 0 },
      { site: 'thigh-right', restDays: 2 },
      { site: 'arm-left', restDays: 4 },
      { site: 'arm-right', restDays: null },
    ])
    expect([...e.values()]).toEqual([0, 0.4, 0.8, 1])
  })

  it('treats equal sites alike, including all used today or none used', () => {
    expect([...restEmphasis([{ site: 'glute-left', restDays: 3 }, { site: 'glute-right', restDays: 3 }]).values()]).toEqual([1, 1])
    expect([...restEmphasis([{ site: 'glute-left', restDays: 0 }, { site: 'glute-right', restDays: 0 }]).values()]).toEqual([1, 1])
    expect([...restEmphasis([{ site: 'glute-left', restDays: null }]).values()]).toEqual([1])
  })
})
