/// <reference types="vitest/config" />
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { getBrand, type BrandConfig } from './src/brand/brands.ts'

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

/** Fills index.html's %BRAND_*% placeholders. */
function brandHtml(brand: BrandConfig): Plugin {
  const values: Record<string, string> = {
    '%BRAND_LANG%': brand.defaultLocale,
    '%BRAND_TITLE%': brand.appName,
    '%BRAND_SHORT_NAME%': brand.shortName,
    '%BRAND_DESCRIPTION%': brand.description,
    '%BRAND_THEME_DARK%': brand.themeColors.dark,
    '%BRAND_THEME_LIGHT%': brand.themeColors.light,
  }
  return {
    name: 'brand-html',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => html.replace(/%BRAND_[A-Z_]+%/g, (key) => values[key] ?? key),
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const brand = getBrand(resolveBrandId(mode))

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
      brandHtml(brand),
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
