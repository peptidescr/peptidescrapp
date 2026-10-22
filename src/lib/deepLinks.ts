/**
 * Where a tap on a notification lands. The service worker
 * (public/shared/sw-notifications.js) can't import app code, so it only names a
 * target — in the URL when it has to open the app (`/?open=today`), or in a
 * message when the app is already open — and this maps the name to a page.
 *
 *   today  → Track > Today   a dose reminder: the cards to log it on
 *   home   → Home            a vial reminder: Home carries the vial alerts
 *
 * An unknown name is ignored (null), so a stale or forged link just opens the
 * app where it was.
 */
import { HOME, trackPage, type Page } from './pages'

export const OPEN_PARAM = 'open'

/**
 * Where tapping a reminder with this tag should go (the name pageForTarget
 * understands): a vial reminder to Home, which carries the vial alerts, a dose
 * reminder to Track > Today. The test notification goes nowhere in particular.
 * public/shared/sw-notifications.js holds a plain-JS copy of this rule for
 * closed-app pushes (tags 'vial|...' and '<protocolId>|<time>').
 */
export function targetForReminderTag(tag: string): string | undefined {
  if (tag === 'peptidescr-test') return undefined
  if (tag.startsWith('vial|') || tag.startsWith('vial-alert|')) return 'home'
  return 'today'
}

export function pageForTarget(target: string | null | undefined): Page | null {
  switch (target) {
    case 'today':
      return trackPage('today')
    case 'home':
      return HOME
    default:
      return null
  }
}

/**
 * Reads `?open=<target>` off a URL's query string and returns the query string
 * without it, so the app can tidy the address bar once it has acted on it and a
 * reload doesn't repeat the jump. Other parameters are left alone.
 */
export function takeOpenTarget(search: string): { target: string | null; remaining: string } {
  const params = new URLSearchParams(search)
  const target = params.get(OPEN_PARAM)
  params.delete(OPEN_PARAM)
  const rest = params.toString()
  return { target, remaining: rest ? `?${rest}` : '' }
}
