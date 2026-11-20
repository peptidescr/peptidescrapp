/**
 * GET /api/rewards — the signed-in USA Peptide Depot customer's rewards
 * (points, credit, tier, referrals, fixed rewards, history and every rule),
 * read from UPD's `GET /api/customer/rewards` with the customer's own Supabase
 * token, as UPD's developer documented it (19 November 2026).
 *
 * Why through here: UPD's server doesn't allow calls from other sites (its
 * preflight answers without Access-Control-Allow-Origin), so the browser can't
 * ask it directly. This passes the token on and the answer back, nothing else.
 * Reading rewards changes nothing on UPD's side, so it isn't behind the checkout
 * switches; it needs a token, which only a signed-in customer has.
 *
 * The token is never logged or kept. On the first answers, the field NAMES (never
 * the values) are logged, so the reader in src/lib/store/storeRewards.ts can be
 * checked against what UPD really sends.
 */
import type { CatalogueBrand, FetchLike } from './catalogue.ts'
import { customerToken } from './checkout.ts'

export const UPD_REWARDS_URL = 'https://www.usapeptidedepot.com/api/customer/rewards'
const TIMEOUT_MS = 10_000
const MAX_ANSWER_CHARS = 200_000

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The field names of a JSON value, nested ("tier.next.tier", "history[].points"), never its values. */
export function fieldNames(value: unknown, prefix = '', depth = 0, out: Set<string> = new Set()): string[] {
  if (depth > 4) return [...out]
  if (Array.isArray(value)) {
    if (value.length > 0) fieldNames(value[0], `${prefix}[]`, depth + 1, out)
  } else if (isRecord(value)) {
    for (const [key, v] of Object.entries(value).slice(0, 60)) {
      const name = prefix ? `${prefix}.${key}` : key
      out.add(name)
      fieldNames(v, name, depth + 1, out)
    }
  }
  return [...out]
}

let loggedShape = false

function reply(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

export async function handleRewardsRequest(req: Request, brand: CatalogueBrand, fetchFn: FetchLike): Promise<Response> {
  if (req.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET' } })
  // Only UPD has store accounts.
  if (brand !== 'upd') return reply({ error: 'no-accounts' }, 404)
  const token = customerToken(req.headers.get('authorization'))
  if (!token) return reply({ error: 'unauthorized' }, 401)

  let response: Response
  try {
    response = await fetchFn(UPD_REWARDS_URL, {
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (err) {
    console.error('rewards: upd request failed:', err instanceof Error ? err.name : 'error')
    return reply({ error: 'unreachable' }, 502)
  }
  // A token UPD doesn't accept (expired or signed out elsewhere): the app refreshes the session and asks again.
  if (response.status === 401) return reply({ error: 'unauthorized' }, 401)
  if (!response.ok) {
    console.error(`rewards: upd answered ${response.status}`)
    return reply({ error: 'unavailable' }, 502)
  }
  const text = await response.text()
  let body: unknown
  try {
    body = text.length <= MAX_ANSWER_CHARS ? JSON.parse(text) : null
  } catch {
    body = null
  }
  if (!isRecord(body)) {
    console.error('rewards: upd answered something that is not a JSON object')
    return reply({ error: 'unavailable' }, 502)
  }
  if (!loggedShape) {
    loggedShape = true
    console.log(`rewards: upd answer fields: ${fieldNames(body).join(', ')}`)
  }
  return reply(body, 200)
}
