/// <reference types="vitest/config" />
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv, type Connect, type Plugin } from 'vite'
import { environmentFromContext } from './src/lib/environment.ts'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { getBrand, type BrandConfig } from './src/brand/brands.ts'
import { handleCatalogueRequest, toCatalogueBrand, type CatalogueResponse } from './netlify/lib/catalogue.ts'
import { handleOrderRequest } from './netlify/lib/checkout.ts'
import { MOCK_CHECKOUT_ENV, mockPaymentFormHtml, mockStore } from './netlify/lib/mockStore.ts'
import { handleStatusRequest } from './netlify/lib/payments.ts'
import { handleRewardsRequest } from './netlify/lib/rewards.ts'
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
 * Serves /api/catalogue from `vite` and `vite preview` with the same handler
 * the Netlify function wraps (netlify/functions/catalogue.ts), so the store
 * sync can be exercised locally against the real store.
 */
/** Local mock mode only: the saved sample product list, every product orderable, with made-up prices. */
function mockCatalogue(brand: 'pcr' | 'upd'): CatalogueResponse {
  const file = fileURLToPath(new URL(`./src/lib/fixtures/store-products-${brand}.json`, import.meta.url))
  const raw = JSON.parse(readFileSync(file, 'utf8')) as { name: string; slug: string; inStock: boolean; category?: string }[]
  const products = raw.slice(0, 24).map((p, i) => {
    const usd = 40 + (i % 8) * 15
    return {
      ...p,
      inStock: true,
      orderRef: p.slug,
      price: { currency: 'USD' as const, amount: usd },
      ...(brand === 'pcr' ? { altPrice: { currency: 'CRC' as const, amount: usd * 505 } } : {}),
    }
  })
  return { version: 1, brand, fetchedAt: new Date().toISOString(), products, checkout: true } as CatalogueResponse
}

function catalogueApi(brand: BrandConfig): Plugin {
  const mock = process.env.STORE_CHECKOUT_MOCK === '1'
  const catalogueBrand = toCatalogueBrand(brand.id)
  const serve = ({ middlewares }: { middlewares: Connect.Server }) => {
    middlewares.use('/api/catalogue', (_req, res) => {
      void handleCatalogueRequest(catalogueBrand, fetch).then(async (response) => {
        if (mock && !response.ok) {
          // The store's real list is unavailable (Peptides CR's, November 2026): sample products from the test
          // fixtures with made-up prices, so the Shop can still be clicked through locally.
          res.setHeader('Content-Type', 'application/json')
          return res.end(JSON.stringify(mockCatalogue(catalogueBrand)))
        }
        res.statusCode = response.status
        response.headers.forEach((value, key) => res.setHeader(key, value))
        if (!mock || !response.ok) return res.end(Buffer.from(await response.arrayBuffer()))
        // Mock checkout: every product orderable, by whatever id the public feed gives.
        const body = (await response.json()) as CatalogueResponse
        for (const p of body.products) p.orderRef ??= p.id ?? p.slug
        body.checkout = true
        res.removeHeader('content-length')
        res.end(JSON.stringify(body))
      })
    })
    if (!mock) return
    // STORE_CHECKOUT_MOCK=1 only: orders go to a pretend store (netlify/lib/mockStore.ts), never a real one.
    const store = mockStore(catalogueBrand)
    const toRequest = async (req: Connect.IncomingMessage): Promise<Request> => {
      const chunks: Buffer[] = []
      for await (const chunk of req) chunks.push(chunk as Buffer)
      const headers = new Headers()
      for (const [key, value] of Object.entries(req.headers)) if (typeof value === 'string') headers.set(key, value)
      const body = req.method === 'POST' ? Buffer.concat(chunks).toString('utf8') : undefined
      return new Request(`http://${req.headers.host}${req.originalUrl ?? req.url}`, { method: req.method, headers, body })
    }
    const send = async (res: import('node:http').ServerResponse, response: Response) => {
      res.statusCode = response.status
      response.headers.forEach((value, key) => res.setHeader(key, value))
      res.end(Buffer.from(await response.arrayBuffer()))
    }
    middlewares.use('/api/orders', (req, res) => {
      // The pretend payment form is served from this same local server.
      const env = { ...MOCK_CHECKOUT_ENV, MOCK_PAYMENT_FORM_ORIGIN: `http://${req.headers.host}` }
      void toRequest(req)
        .then((request) => handleOrderRequest(request, catalogueBrand, env, 'development', store.fetchFn))
        .then((response) => send(res, response))
    })
    middlewares.use('/mock-pay.html', (req, res) => {
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.end(mockPaymentFormHtml(new URL(req.originalUrl ?? req.url ?? '/', 'http://localhost').searchParams))
    })
    middlewares.use('/api/rewards', (req, res) => {
      void toRequest(req)
        .then((request) => handleRewardsRequest(request, catalogueBrand, store.fetchFn))
        .then((response) => send(res, response))
    })
    middlewares.use('/api/order-status', (req, res) => {
      void toRequest(req)
        .then((request) => handleStatusRequest(request, catalogueBrand, store.payments))
        .then((response) => send(res, response))
    })
  }
  return { name: 'catalogue-api', configureServer: serve, configurePreviewServer: serve }
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
 * pay-return.html: where ChargX sends the customer after paying or cancelling.
 * Inside the app's payment sheet it tells the app the result and the sheet
 * closes; opened full-screen it goes back to the app. A tiny static page, not
 * the app itself, so the app never boots inside its own payment frame.
 */
function payReturnPage(brand: BrandConfig): Plugin {
  const es = brand.defaultLocale === 'es-CR'
  const html = `<!doctype html><html lang="${es ? 'es' : 'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(brand.appName)}</title>
<style>body{font-family:system-ui,sans-serif;margin:0;padding:32px 20px;text-align:center;background:${brand.themeColors.light};color:#17231d}a{color:inherit;font-weight:700}</style></head>
<body><p>${es ? 'Volviendo a la app…' : 'Returning to the app…'}</p><p><a href="/">${es ? 'Volver a la app' : 'Back to the app'}</a></p>
<script>(function(){var p=new URLSearchParams(location.search);var msg={type:'peptidescr-pay-return',result:p.get('result')==='success'?'success':'cancel',order:(p.get('order')||'').replace(/[^A-Za-z0-9-]/g,'')};
if(window.parent&&window.parent!==window){window.parent.postMessage(msg,location.origin)}else{location.replace('/?payment='+msg.result)}})()</script></body></html>`
  return {
    name: 'pay-return-page',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] !== '/pay-return.html') return next()
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        res.end(html)
      })
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'pay-return.html', source: html })
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
  // From Netlify's deploy context, never a variable (src/lib/environment.ts). The app reads it as VITE_APP_ENV:
  // e.g. the test account (src/lib/store/account.ts) is never in a live-site build.
  const environment = environmentFromContext(process.env.CONTEXT)

  return {
    publicDir: `public/${brand.id}`,
    define: {
      'import.meta.env.VITE_BRAND': JSON.stringify(brand.id),
      'import.meta.env.VITE_APP_ENV': JSON.stringify(environment),
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
      catalogueApi(brand),
      brandHtml(brand, indexable),
      seoFiles(brand, indexable),
      payReturnPage(brand),
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
          // A manifest has one colour, not one per scheme, so the launch splash and
          // title bar use the light page background; the page itself switches on load.
          background_color: brand.themeColors.light,
          theme_color: brand.themeColors.light,
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
          // The payment return page is its own static file, never the app (see payReturnPage).
          navigateFallbackDenylist: [/^\/api\//, /^\/pay-return\.html/, /^\/mock-pay\.html/],
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
