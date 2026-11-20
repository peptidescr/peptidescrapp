/**
 * Creating a USA Peptide Depot account and asking for a password reset, inside
 * the app (the developer's choice, 20 November 2026), as UPD's developer set it
 * up: both forms carry a Cloudflare Turnstile token (action "signup" or
 * "recover"; one token per try) and go straight from the browser to UPD, which
 * allows app.usapeptidedepot.com to call them.
 *
 *   POST /api/customer/auth/register  { email, password, fullName, phone, marketingOptIn, turnstileToken }
 *   POST /api/customer/auth/recover   { email, turnstileToken }
 *
 * After signing up the customer confirms by the emailed link, then signs in.
 * The checks mirror UPD's website (its My Account page): a full name, a valid
 * email, a password of 12 or more typed twice, and the age and research-use
 * confirmation; the phone and the marketing opt-in are optional. UPD's own
 * message is shown when it refuses (UPD's site is English only).
 *
 * The Turnstile site key comes in VITE_UPD_TURNSTILE_SITE_KEY (public; set in
 * Netlify). Without it the app keeps opening UPD's My Account page for both.
 */
import { BRAND } from '@/brand'
import { STORE_SIGN_IN } from './session'

export const TURNSTILE_SITE_KEY: string = String(import.meta.env.VITE_UPD_TURNSTILE_SITE_KEY ?? '').trim()

/** Whether this build creates accounts and resets passwords in the app (else on UPD's website). */
export const IN_APP_ACCOUNT_FORMS = STORE_SIGN_IN && /^[0-3]x[A-Za-z0-9_-]{10,}$/.test(TURNSTILE_SITE_KEY)

/** UPD's website asks for at least this many characters. */
export const MIN_PASSWORD = 12

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface SignUpInput {
  fullName: string
  email: string
  phone: string
  password: string
  confirm: string
  /** "I confirm that I am at least 21 … laboratory research" (required, as on the website; not sent). */
  ack: boolean
  /** "Email me product and research updates" (optional). */
  marketingOptIn: boolean
}

export type SignUpField = 'fullName' | 'email' | 'password' | 'confirm' | 'ack'

/** The first thing to fix, in the form's order; null when it can be sent. */
export function signUpProblem(input: SignUpInput): SignUpField | null {
  if (input.fullName.trim().length < 2) return 'fullName'
  if (!EMAIL.test(input.email.trim())) return 'email'
  if (input.password.length < MIN_PASSWORD) return 'password'
  if (input.password !== input.confirm) return 'confirm'
  if (!input.ack) return 'ack'
  return null
}

export function validEmail(email: string): boolean {
  return EMAIL.test(email.trim())
}

export type FormResult = { ok: true; message?: string } | { ok: false; message?: string; offline?: boolean }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** UPD's message, trimmed and capped; undefined when there's none. */
function messageFrom(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 300) : undefined
}

async function post(path: string, body: Record<string, unknown>, fetchFn: typeof fetch): Promise<FormResult> {
  let response: Response
  try {
    response = await fetchFn(`${BRAND.store.url}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    return { ok: false, offline: true }
  }
  const json: unknown = await response.json().catch(() => null)
  if (!response.ok) return { ok: false, message: isRecord(json) ? messageFrom(json.message) ?? messageFrom(json.error) : undefined }
  const data = isRecord(json) && isRecord(json.data) ? json.data : {}
  return { ok: true, message: messageFrom(data.message) }
}

export function registerStoreAccount(input: SignUpInput, turnstileToken: string, fetchFn: typeof fetch = fetch): Promise<FormResult> {
  return post(
    '/api/customer/auth/register',
    {
      email: input.email.trim(),
      password: input.password,
      fullName: input.fullName.trim(),
      phone: input.phone.trim(),
      marketingOptIn: input.marketingOptIn,
      turnstileToken,
    },
    fetchFn,
  )
}

export function recoverStorePassword(email: string, turnstileToken: string, fetchFn: typeof fetch = fetch): Promise<FormResult> {
  return post('/api/customer/auth/recover', { email: email.trim(), turnstileToken }, fetchFn)
}
