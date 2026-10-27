import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { requireSecret, signPartnerBody, verifyChargxWebhook, WEBHOOK_TOLERANCE_SECONDS } from './signing.ts'

// Made-up test values; no real key appears anywhere in the repo.
const SECRET = 'test-secret-not-a-real-key'

describe('signPartnerBody', () => {
  it('is HMAC-SHA256 of the exact body, lower-case hex', () => {
    const body = JSON.stringify({ contact_method: 'whatsapp', contact_value: '+50688887777' })
    // Worked out independently of the code under test.
    const expected = createHmac('sha256', SECRET).update(body).digest('hex')
    expect(signPartnerBody(body, SECRET)).toBe(expected)
    expect(signPartnerBody(body, SECRET)).toMatch(/^[0-9a-f]{64}$/)
  })

  it('changes when the body is serialised differently, which is why the sent string is what gets signed', () => {
    const a = '{"a":1,"b":2}'
    const b = '{"b":2,"a":1}'
    expect(signPartnerBody(a, SECRET)).not.toBe(signPartnerBody(b, SECRET))
  })
})

describe('verifyChargxWebhook', () => {
  const now = new Date('2026-10-27T12:00:00Z')
  const timestamp = String(Math.floor(now.getTime() / 1000))
  const body = '{"type":"payment.succeeded","data":{"amount":30000}}'
  const sign = (ts: string, raw: string, secret = SECRET) => 'v1=' + createHmac('sha256', secret).update(`${ts}.${raw}`).digest('hex')
  const headers = (signature: string, ts = timestamp) =>
    new Headers({ 'Webhook-Id': 'evt_1', 'Webhook-Timestamp': ts, 'Webhook-Signature': signature })

  it('accepts a correctly signed, recent event', () => {
    expect(verifyChargxWebhook(headers(sign(timestamp, body)), body, SECRET, now)).toEqual({ ok: true })
  })

  it('accepts one good signature among several (a secret being rotated)', () => {
    const signature = `v1=${'0'.repeat(64)} ${sign(timestamp, body)}`
    expect(verifyChargxWebhook(headers(signature), body, SECRET, now).ok).toBe(true)
  })

  it('refuses a body that was changed, even by re-serialising it', () => {
    const reserialised = JSON.stringify(JSON.parse(body), null, 1)
    expect(verifyChargxWebhook(headers(sign(timestamp, body)), reserialised, SECRET, now)).toEqual({ ok: false, reason: 'bad-signature' })
  })

  it('refuses the wrong secret, a missing prefix and garbage', () => {
    expect(verifyChargxWebhook(headers(sign(timestamp, body, 'other')), body, SECRET, now).ok).toBe(false)
    expect(verifyChargxWebhook(headers(sign(timestamp, body).slice(3)), body, SECRET, now).ok).toBe(false)
    expect(verifyChargxWebhook(headers('v1=zz'), body, SECRET, now).ok).toBe(false)
  })

  it('refuses an old or future timestamp, so a captured event cannot be replayed', () => {
    const old = String(Number(timestamp) - WEBHOOK_TOLERANCE_SECONDS - 1)
    expect(verifyChargxWebhook(headers(sign(old, body), old), body, SECRET, now)).toEqual({ ok: false, reason: 'stale' })
    const future = String(Number(timestamp) + WEBHOOK_TOLERANCE_SECONDS + 1)
    expect(verifyChargxWebhook(headers(sign(future, body), future), body, SECRET, now).ok).toBe(false)
  })

  it('refuses an event with a header missing', () => {
    const noId = new Headers({ 'Webhook-Timestamp': timestamp, 'Webhook-Signature': sign(timestamp, body) })
    expect(verifyChargxWebhook(noId, body, SECRET, now)).toEqual({ ok: false, reason: 'missing-headers' })
  })
})

describe('requireSecret', () => {
  it('returns the value, or names the missing variable without showing any value', () => {
    expect(requireSecret('PCR_SIGNING_SECRET', { PCR_SIGNING_SECRET: 'x' })).toBe('x')
    expect(() => requireSecret('PCR_SIGNING_SECRET', {})).toThrow('Missing environment variable PCR_SIGNING_SECRET')
  })
})
