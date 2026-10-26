/**
 * What search engines and link previews read, generated per brand at build
 * time (vite.config.ts): robots.txt, sitemap.xml, the JSON-LD structured
 * data and the share-tag values in index.html's head. Plain functions over
 * BrandConfig with nothing imported at runtime, like brands.ts, because
 * vite.config.ts runs them in Node.
 *
 * The app is one page at one address (all navigation happens inside it), so
 * the sitemap has a single entry. Everything points at BrandConfig.siteUrl,
 * never at the address a build happens to be served from, so the netlify.app
 * address and deploy previews never compete with the real one.
 */
import type { BrandConfig } from './brands.ts'

/** Open Graph locale for each app locale. */
const OG_LOCALE: Record<BrandConfig['defaultLocale'], string> = { en: 'en_US', 'es-CR': 'es_CR' }

export const SHARE_IMAGE = { path: '/og-image.jpg', width: 1200, height: 630 }

export function ogLocale(brand: BrandConfig): string {
  return OG_LOCALE[brand.defaultLocale]
}

/**
 * Production allows everything except the Netlify functions under /api/ (JSON
 * endpoints, not pages; crawling them only spends function calls). Anything
 * else (a deploy preview, a branch deploy) stays crawlable but carries a
 * noindex tag instead (see vite.config.ts), because a robots.txt block would
 * stop crawlers seeing that tag at all.
 */
export function robotsTxt(brand: BrandConfig, indexable: boolean): string {
  if (!indexable) return `# ${brand.title}\n# Not the production site: pages here are marked noindex.\nUser-agent: *\nAllow: /\n`
  return `# ${brand.title}\nUser-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${brand.siteUrl}/sitemap.xml\n`
}

/** `lastmod` is the build date, YYYY-MM-DD: each deploy changes the page. */
export function sitemapXml(brand: BrandConfig, lastmod: string): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    `  <url><loc>${brand.siteUrl}/</loc><lastmod>${lastmod}</lastmod></url>`,
    '</urlset>',
    '',
  ].join('\n')
}

/**
 * schema.org JSON-LD: the site, the app it is, and the store that publishes
 * both, so search engines connect the app to the brand's main site. No
 * ratings or offers: there are none to state truthfully. Safe to drop
 * straight into a <script> element (`<` is escaped).
 */
export function structuredData(brand: BrandConfig): string {
  const home = `${brand.siteUrl}/`
  const store = `${brand.store.url}/#organization`
  const data = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': store,
        name: brand.store.name,
        url: brand.store.url,
        logo: `${brand.siteUrl}/brand/icon-512.png`,
      },
      {
        '@type': 'WebSite',
        '@id': `${home}#website`,
        url: home,
        name: brand.appName,
        description: brand.description,
        inLanguage: brand.defaultLocale,
        publisher: { '@id': store },
      },
      {
        '@type': 'WebApplication',
        '@id': `${home}#app`,
        name: brand.headline,
        url: home,
        description: brand.description,
        applicationCategory: 'UtilitiesApplication',
        operatingSystem: 'Any',
        browserRequirements: 'Requires JavaScript',
        inLanguage: [...brand.locales],
        isAccessibleForFree: true,
        image: `${brand.siteUrl}${SHARE_IMAGE.path}`,
        publisher: { '@id': store },
      },
    ],
  }
  return JSON.stringify(data).replace(/</g, '\\u003c')
}

/** For values dropped into HTML text or attributes. */
export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
