/**
 * Request signing and webhook verification for the stores' order APIs (Part B).
 * Nothing calls these yet; they're here, tested, ahead of guest checkout.
 *
 * Secrets come in as arguments, read by the caller from the site's environment
 * (`requireSecret`), never from the app: both stores say a secret that reaches
 * a phone or a browser is compromised.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

/** A secret from the site's environment, or an error that names the variable but never shows a value. */
export function requireSecret(name: string, env: Record<string, string | undefined> = process.env): string {
  const value = env[name]
  if (!value) throw new Error(`Missing environment variable ${name}`)
  return value
}

/**
 * Peptides Costa Rica's partner signature: HMAC-SHA256 of the exact body being
 * sent, keyed with the signing secret, lower-case hex. Sign the string that goes
 * on the wire; serialising the object again afterwards would change it.
 */
export function signPartnerBody(rawBody: string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
}

/** Constant-time comparison of two hex strings (false when they differ in length). */
function sameHex(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex')
  const right = Buffer.from(b, 'hex')
  return left.length > 0 && left.length === right.length && a.length === left.length * 2 && timingSafeEqual(left, right)
}

export interface WebhookCheck {
  ok: boolean
  /** Why it was refused, for the function's own log (never sent back to the caller). */
  reason?: 'missing-headers' | 'stale' | 'bad-signature'
}

/** How far a webhook's timestamp may be from our clock: replays older than this are refused. */
export const WEBHOOK_TOLERANCE_SECONDS = 5 * 60

/**
 * ChargX's webhook signature, as USA Peptide Depot documents it: headers
 * Webhook-Id, Webhook-Timestamp and Webhook-Signature; the signature is
 * HMAC-SHA256 of `timestamp + "." + raw body`, hex, prefixed `v1=`. The header
 * may carry several (during a secret rotation), separated by spaces or commas;
 * one match is enough. Verify the body exactly as it arrived.
 *
 * Peptides CR points to the ChargX documentation for the same thing; this
 * assumes it's the same scheme, to be checked against a real sandbox event.
 */
export function verifyChargxWebhook(
  headers: Headers,
  rawBody: string,
  secret: string,
  now: Date = new Date(),
): WebhookCheck {
  const id = headers.get('webhook-id')
  const timestamp = headers.get('webhook-timestamp')
  const signatureHeader = headers.get('webhook-signature')
  if (!id || !timestamp || !signatureHeader) return { ok: false, reason: 'missing-headers' }

  const seconds = Number(timestamp)
  if (!/^\d{1,12}$/.test(timestamp) || Math.abs(now.getTime() / 1000 - seconds) > WEBHOOK_TOLERANCE_SECONDS) {
    return { ok: false, reason: 'stale' }
  }

  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`, 'utf8').digest('hex')
  const offered = signatureHeader
    .split(/[\s,]+/)
    .filter((part) => part.startsWith('v1='))
    .map((part) => part.slice(3).toLowerCase())
  return offered.some((hex) => sameHex(hex, expected)) ? { ok: true } : { ok: false, reason: 'bad-signature' }
}
