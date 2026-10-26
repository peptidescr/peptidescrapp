import { BRAND } from '../brand'

/**
 * The splash shown while the app loads its settings. index.html carries the
 * same markup inside #root (for search engines and link previews, which read
 * the HTML without running the app), so the hand-over from the static page to
 * React shows one steady splash. Keep the two the same. In the build's default
 * language on purpose: so is the static copy it takes over from.
 */
export function BootSplash() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <img src="/brand/icon-192.png" alt={BRAND.store.name} width={72} height={72} className="size-18 rounded-2xl" />
      <h1 className="max-w-sm font-display text-xl font-bold leading-snug text-foreground">{BRAND.headline}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">{BRAND.description}</p>
    </main>
  )
}
