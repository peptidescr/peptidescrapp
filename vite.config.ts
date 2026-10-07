/// <reference types="vitest/config" />
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { getBrand, type BrandConfig } from './src/brand/brands.ts'
import { escapeHtml, ogLocale, robotsTxt, SHARE_IMAGE, sitemapXml, structuredData } from './src/brand/seo.ts'

/**
 * Which brand to build (see src/brand/brands.ts). VITE_BRAND wins — that's
 * how each Netlify site picks its own — then `--mode pcr` / `--mode upd`
 * (the npm dev:/build: scripts), then 'upd'. Unknown values throw, so a typo
 * in a site's env fails the deploy instead of shipping the wrong brand.
 */
function resolveBrandId(mode: string): string {
  const fromEnv = loadEnv(mode, process.cwd(), '').VITE_BRAND
  if (fromEnv) return fromEnv
  if (mode === 'pcr' || mode === 'upd') return mode
  return 'upd'
}

/**
 * Files every brand ships (public/shared, i.e. the service worker's
 * notification script), served at the site root alongside the brand's own
 * public/<brand> folder — Vite only supports one publicDir, and these must
 * not be duplicated per brand.
 */
function sharedPublicFiles(): Plugin {
  const dir = fileURLToPath(new URL('./public/shared', import.meta.url))
  const files = readdirSync(dir)
  return {
    name: 'shared-public-files',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = req.url?.split('?')[0]?.slice(1)
        if (!name || !files.includes(name)) return next()
        res.setHeader('Content-Type', 'text/javascript')
        res.end(readFileSync(`${dir}/${name}`))
      })
    },
    generateBundle() {
      for (const name of files) {
        this.emitFile({ type: 'asset', fileName: name, source: readFileSync(`${dir}/${name}`) })
      }
    },
  }
}

/**
 * Whether this build is the live site search engines should index. Netlify
 * sets CONTEXT on every build: 'production' for the live site, otherwise a
 * deploy preview or branch deploy. A local build (no CONTEXT) is treated as
 * production, so `npm run build` output matches what ships.
 */
function isIndexable(): boolean {
  const context = process.env.CONTEXT
  return context === undefined || context === 'production'
}

/**
 * Fills index.html's %BRAND_*% placeholders, HTML-escaped (the titles contain
 * "&"), except the JSON-LD block, which seo.ts makes script-safe itself. A
 * build that isn't the live site also gets a noindex tag.
 */
function brandHtml(brand: BrandConfig, indexable: boolean): Plugin {
  const text: Record<string, string> = {
    '%BRAND_LANG%': brand.defaultLocale,
    '%BRAND_TITLE%': brand.title,
    '%BRAND_HEADLINE%': brand.headline,
    '%BRAND_APP_NAME%': brand.appName,
    '%BRAND_STORE_NAME%': brand.store.name,
    '%BRAND_SHORT_NAME%': brand.shortName,
    '%BRAND_DESCRIPTION%': brand.description,
    '%BRAND_SITE_URL%': brand.siteUrl,
    '%BRAND_OG_LOCALE%': ogLocale(brand),
    '%BRAND_SHARE_IMAGE%': `${brand.siteUrl}${SHARE_IMAGE.path}`,
    '%BRAND_SHARE_IMAGE_WIDTH%': String(SHARE_IMAGE.width),
    '%BRAND_SHARE_IMAGE_HEIGHT%': String(SHARE_IMAGE.height),
    '%BRAND_THEME_DARK%': brand.themeColors.dark,
    '%BRAND_THEME_LIGHT%': brand.themeColors.light,
  }
  const raw: Record<string, string> = { '%BRAND_JSON_LD%': structuredData(brand) }
  return {
    name: 'brand-html',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => ({
        html: html.replace(/%BRAND_[A-Z_]+%/g, (key) =>
          key in raw ? raw[key]! : key in text ? escapeHtml(text[key]!) : key,
        ),
        tags: indexable ? [] : [{ tag: 'meta', attrs: { name: 'robots', content: 'noindex' }, injectTo: 'head' }],
      }),
    },
  }
}

/**
 * robots.txt and sitemap.xml, generated from the brand (see seo.ts) rather
 * than kept as files, because each brand has its own address. Served by the
 * dev server too, so they can be checked locally.
 */
function seoFiles(brand: BrandConfig, indexable: boolean): Plugin {
  const files = (): Record<string, { type: string; body: string }> => ({
    'robots.txt': { type: 'text/plain', body: robotsTxt(brand, indexable) },
    'sitemap.xml': { type: 'application/xml', body: sitemapXml(brand, new Date().toISOString().slice(0, 10)) },
  })
  return {
    name: 'seo-files',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const file = files()[req.url?.split('?')[0]?.slice(1) ?? '']
        if (!file) return next()
        res.setHeader('Content-Type', `${file.type}; charset=utf-8`)
        res.end(file.body)
      })
    },
    generateBundle() {
      for (const [fileName, { body }] of Object.entries(files())) {
        this.emitFile({ type: 'asset', fileName, source: body })
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const brand = getBrand(resolveBrandId(mode))
  const indexable = isIndexable()

  return {
    publicDir: `public/${brand.id}`,
    define: {
      'import.meta.env.VITE_BRAND': JSON.stringify(brand.id),
    },
    resolve: {
      alias: {
        '@brand-styles': fileURLToPath(new URL(`./src/brand/${brand.id}`, import.meta.url)),
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    plugins: [
      react(),
      tailwindcss(),
      sharedPublicFiles(),
      brandHtml(brand, indexable),
      seoFiles(brand, indexable),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['brand/*.svg', 'brand/*.png'],
        manifest: {
          id: '/',
          name: brand.appName,
          short_name: brand.shortName,
          description: brand.description,
          lang: brand.defaultLocale,
          start_url: '/',
          scope: '/',
          display: 'standalone',
          background_color: brand.themeColors.dark,
          theme_color: brand.themeColors.dark,
          icons: [
            { src: '/brand/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            // Same logo with extra margin, so Android's circular/squircle mask can't clip it.
            {
              src: '/brand/icon-maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          // App shell + local assets only — no network calls after load.
          globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
          navigateFallback: '/index.html',
          // The push API endpoints must never be answered with the app shell.
          navigateFallbackDenylist: [/^\/api\//],
          importScripts: ['/sw-notifications.js'],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
    ],
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts', 'netlify/**/*.test.ts'],
    },
  }
})
