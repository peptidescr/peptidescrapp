import { describe, expect, it } from 'vitest'
import { PCR_BRAND, UPD_BRAND } from './brands'
import { escapeHtml, ogLocale, robotsTxt, sitemapXml, structuredData } from './seo'

describe('robotsTxt', () => {
  it('allows the site, keeps crawlers off the functions, and points at the sitemap', () => {
    const robots = robotsTxt(UPD_BRAND, true)
    expect(robots).toContain('User-agent: *\nAllow: /\nDisallow: /api/\n')
    expect(robots).toContain('Sitemap: https://app.usapeptidedepot.com/sitemap.xml')
  })

  it('leaves a preview crawlable (so its noindex is seen) and offers no sitemap', () => {
    const robots = robotsTxt(PCR_BRAND, false)
    expect(robots).not.toMatch(/Disallow: \/\n/)
    expect(robots).not.toContain('Sitemap:')
  })
})

describe('sitemapXml', () => {
  it('lists the one page at the real address', () => {
    expect(sitemapXml(PCR_BRAND, '2026-10-07')).toContain(
      '<url><loc>https://app.peptidescostarica.net/</loc><lastmod>2026-10-07</lastmod></url>',
    )
  })
})

describe('structuredData', () => {
  it('describes the site and app, published by the brand’s store', () => {
    const data = JSON.parse(structuredData(UPD_BRAND))
    const [store, site, app] = data['@graph']
    expect(store).toMatchObject({ '@type': 'Organization', name: 'USA Peptide Depot', url: 'https://www.usapeptidedepot.com' })
    expect(site).toMatchObject({ '@type': 'WebSite', url: 'https://app.usapeptidedepot.com/', publisher: { '@id': store['@id'] } })
    expect(app).toMatchObject({ '@type': 'WebApplication', name: UPD_BRAND.headline, isAccessibleForFree: true })
    expect(JSON.parse(structuredData(PCR_BRAND))['@graph'][2].inLanguage).toEqual(['es-CR', 'en'])
  })

  it('cannot close its own <script> element', () => {
    expect(structuredData({ ...UPD_BRAND, description: '</script><b>' })).not.toContain('</script>')
  })
})

describe('share tags', () => {
  it('maps the default language to an Open Graph locale', () => {
    expect([ogLocale(UPD_BRAND), ogLocale(PCR_BRAND)]).toEqual(['en_US', 'es_CR'])
  })

  it('escapes values for HTML', () => {
    expect(escapeHtml('Tracker & "Calculator" <x>')).toBe('Tracker &amp; &quot;Calculator&quot; &lt;x&gt;')
  })
})
