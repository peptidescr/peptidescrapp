/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['brand/*.svg', 'brand/*.png'],
      manifest: {
        id: '/',
        name: 'Peptides CR',
        short_name: 'peptidescr',
        description: 'Registro de dosis y calculadora de reconstitución.',
        lang: 'es-CR',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#060b1a',
        theme_color: '#060b1a',
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
})
