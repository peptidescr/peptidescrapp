/**
 * Signing in with the store's own customer account (Part B). USA Peptide Depot
 * keeps its accounts in Supabase, and its website signs in with email and
 * password there; the app does the same, with UPD's OK (2026-11-18), through
 * Supabase's official client. Creating an account and resetting a password stay
 * on UPD's website (its My Account page).
 *
 * The project's address and public key are given to this build in
 * VITE_UPD_SUPABASE_URL and VITE_UPD_SUPABASE_ANON_KEY (Netlify settings, never
 * a committed file). The public key is meant to ship inside apps; the
 * customer's password goes straight to Supabase and is never kept or seen here.
 *
 * The signed-in customer's token goes with their orders (UPD links the order to
 * the account, as its website does) and, once UPD ships it, to the rewards
 * endpoint. Until then a real account shows no points; the staging test account
 * (account.ts) still stands in for trying them.
 *
 * The client library is loaded only when someone signs in or a session was kept
 * on this phone, so the app's first load doesn't carry it.
 */
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { useSyncExternalStore } from 'react'
import { BRAND } from '@/brand'

const SUPABASE_URL: string = import.meta.env.VITE_UPD_SUPABASE_URL ?? ''
const SUPABASE_KEY: string = import.meta.env.VITE_UPD_SUPABASE_ANON_KEY ?? ''

/** Where the session is kept on the phone (Supabase's own format, under the app's name). */
const STORAGE_KEY = 'upd-store-auth'

/** Whether this build signs in with real store accounts: UPD, the store turned on, and the project given. */
export const STORE_SIGN_IN =
  BRAND.id === 'upd' && BRAND.features.store && /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(SUPABASE_URL) && SUPABASE_KEY.length > 20

/** UPD's My Account page: creating an account and resetting a password happen there. */
export const ACCOUNT_PAGE_URL = `${BRAND.store.url}/my-account`

export interface StoreCustomer {
  email: string
  /** The name on the account, when it has one. */
  name?: string
}

export type SignInResult = 'ok' | 'wrong' | 'unconfirmed' | 'busy' | 'offline' | 'failed'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The customer from a session's user (or the stored session's), or null. */
export function customerFrom(user: unknown): StoreCustomer | null {
  if (!isRecord(user) || typeof user.email !== 'string' || !user.email) return null
  const meta = isRecord(user.user_metadata) ? user.user_metadata : {}
  const first = typeof meta.first_name === 'string' ? meta.first_name : ''
  const last = typeof meta.last_name === 'string' ? meta.last_name : ''
  const candidates = [meta.full_name, meta.fullName, meta.name, `${first} ${last}`]
  const name = candidates.find((c): c is string => typeof c === 'string' && c.trim().length > 0)?.trim().slice(0, 80)
  return name ? { email: user.email, name } : { email: user.email }
}

/** Supabase's sign-in error, in the app's terms. */
export function signInResultFor(error: { code?: string; status?: number; name?: string } | null, online = true): SignInResult {
  if (!error) return 'ok'
  if (!online) return 'offline'
  if (error.code === 'email_not_confirmed') return 'unconfirmed'
  if (error.code === 'invalid_credentials' || error.status === 400) return 'wrong'
  if (error.code === 'over_request_rate_limit' || error.status === 429) return 'busy'
  if (error.name === 'AuthRetryableFetchError' || error.status === 0) return 'offline'
  return 'failed'
}

/** The customer kept on this phone, read without loading the library (so Settings shows them at once). */
function storedCustomer(): StoreCustomer | null {
  if (!STORE_SIGN_IN) return null
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    return isRecord(raw) ? customerFrom(raw.user) : null
  } catch {
    return null
  }
}

let customer: StoreCustomer | null | undefined
const listeners = new Set<() => void>()

function current(): StoreCustomer | null {
  if (customer === undefined) customer = storedCustomer()
  return customer
}

function setCustomer(next: StoreCustomer | null): void {
  const was = current()
  if (was?.email === next?.email && was?.name === next?.name) return
  customer = next
  for (const listener of listeners) listener()
}

let client: Promise<SupabaseClient> | null = null

function getClient(): Promise<SupabaseClient> {
  client ??= import('@supabase/supabase-js').then(({ createClient }) => {
    const c = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { storageKey: STORAGE_KEY, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    })
    c.auth.onAuthStateChange((_event, session: Session | null) => setCustomer(customerFrom(session?.user)))
    return c
  })
  return client
}

/**
 * When the app opens: if a session was kept, load the library so it refreshes the session (and notices one ended
 * elsewhere, such as a changed password).
 */
export function startStoreSession(): void {
  if (!STORE_SIGN_IN || !storedCustomer()) return
  void getClient()
    .then((c) => c.auth.getSession())
    .then(({ data }) => setCustomer(customerFrom(data.session?.user)))
    .catch(() => {
      // Offline: keep showing the stored customer; the library tries again later.
    })
}

export async function signInStore(email: string, password: string): Promise<SignInResult> {
  if (!STORE_SIGN_IN) return 'failed'
  try {
    const c = await getClient()
    const { data, error } = await c.auth.signInWithPassword({ email: email.trim(), password })
    const result = signInResultFor(error, navigator.onLine !== false)
    if (result === 'ok') setCustomer(customerFrom(data.user))
    return result
  } catch {
    return navigator.onLine === false ? 'offline' : 'failed'
  }
}

/** Signs out on this phone only (the website and other devices stay signed in). */
export async function signOutStoreCustomer(): Promise<void> {
  setCustomer(null)
  try {
    const c = await getClient()
    await c.auth.signOut({ scope: 'local' })
  } catch {
    // Couldn't reach Supabase: forget the session here anyway.
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // Storage unavailable: nothing kept.
    }
  }
}

/** The signed-in customer's access token, refreshed when needed; null when signed out or it can't be had. */
export async function storeAccessToken(): Promise<string | null> {
  if (!STORE_SIGN_IN || !current()) return null
  try {
    const c = await getClient()
    const { data } = await c.auth.getSession()
    return data.session?.access_token ?? null
  } catch {
    return null
  }
}

/** The customer signed in with their store account; null when signed out (and always on builds without sign-in). */
export function useStoreCustomer(): StoreCustomer | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    current,
  )
}
