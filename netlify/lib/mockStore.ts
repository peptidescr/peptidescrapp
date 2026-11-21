/**
 * A pretend store for clicking through checkout on a local dev server
 * (vite.config.ts serves it only when STORE_CHECKOUT_MOCK=1). It answers the
 * order request the way the stores do (UPD in the shape its own website reads),
 * and ChargX's payment request with a pretend form on the same local server,
 * without any network: nothing here can reach PCR, UPD or ChargX. Never
 * imported by a Netlify function.
 *
 * Orders it "places" count as paid a few seconds later, so the app's
 * waiting-for-payment state can be seen to finish.
 */
import type { CatalogueBrand, FetchLike } from './catalogue.ts'
import type { PaymentStore } from './payments.ts'
import { SAMPLE_REWARDS } from '../../src/lib/store/rewardsSample.ts'

/** Fake values that pass checkoutSettings' checks in the 'development' environment; not keys for anything. */
export const MOCK_CHECKOUT_ENV = {
  PCR_PARTNER_KEY: 'pk_sandbox_local-mock-not-a-key',
  PCR_SIGNING_SECRET: 'local-mock-not-a-secret',
  CHARGX_PUBLISHABLE_KEY: 'local-mock-not-a-key',
}

/** A pretend ChargX payment form (served by vite.config.ts in mock mode): Pay or Cancel, then the return page. */
export function mockPaymentFormHtml(search: URLSearchParams): string {
  const safe = (value: string | null) => (value && /^http:\/\/(127\.0\.0\.1|localhost):\d+\//.test(value) ? value : '/')
  const success = safe(search.get('success'))
  const cancel = safe(search.get('cancel'))
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pretend payment</title>
<style>body{font-family:system-ui,sans-serif;margin:0;padding:24px;background:#f6f6f6;color:#222}a{display:block;margin-top:12px;padding:14px;border-radius:12px;text-align:center;text-decoration:none;font-weight:700}
.pay{background:#1f4233;color:#fff}.cancel{background:#fff;color:#1f4233;border:1px solid #1f4233}</style></head>
<body><h1>Pretend payment form</h1><p>Local testing only: no card, no money. Order ${(search.get('external_order_id') ?? '').replace(/[^A-Za-z0-9-]/g, '')}</p>
<a class="pay" href="${success}">Pay (test)</a><a class="cancel" href="${cancel}">Cancel</a></body></html>`
}

const PAID_AFTER_MS = 8000

export function mockStore(brand: CatalogueBrand): { fetchFn: FetchLike; payments: PaymentStore } {
  const placedAt = new Map<string, number>()
  let next = 1000

  const fetchFn: FetchLike = async (url, init) => {
    // A token whose first part is "expired" is refused, to try the app's refresh-and-retry.
    const token = init?.headers?.Authorization?.replace(/^Bearer /, '')
    if (token?.startsWith('expired.') && url.startsWith('https://www.usapeptidedepot.com/')) {
      return Response.json({ error: 'Your session has expired. Sign in again.' }, { status: 401 })
    }
    // UPD's rewards: its developer's sample reply (20 November 2026).
    if (url === 'https://www.usapeptidedepot.com/api/customer/rewards') {
      if (!token) return Response.json({ error: 'That session is not valid. Sign in again.' }, { status: 401 })
      return Response.json(SAMPLE_REWARDS)
    }
    // ChargX's payment request: a pretend form on the same local server, which returns to the app's return page.
    if (url.startsWith('https://api.chargx.io/')) {
      const request = JSON.parse(init?.body ?? '{}') as { success_url?: string; cancel_url?: string }
      const origin = new URL(request.success_url ?? 'http://127.0.0.1/').origin
      const form = new URL('/mock-pay.html', origin)
      form.searchParams.set('success', request.success_url ?? '')
      form.searchParams.set('cancel', request.cancel_url ?? '')
      return Response.json({ payment_request: { id: 'mock', checkout_url: form.toString(), isProduction: false } })
    }
    // Peptides CR's payment page, asked where it forwards: it doesn't, so it opens full-screen.
    if (init?.method === 'GET') return new Response('', { status: 200 })
    const body = JSON.parse(init?.body ?? '{}') as Record<string, unknown>
    const orderNumber = `${brand === 'pcr' ? 'PTR' : 'USP'}-MOCK${++next}`
    // A customer named "Refuse" is refused, to see the store's message shown.
    const name = brand === 'pcr' ? (body.customer as { name?: string } | undefined)?.name : body.fullName
    if (name === 'Refuse') {
      return Response.json(
        brand === 'pcr'
          ? { ok: false, error: 'Uno de los productos ya no está disponible.' }
          : { error: 'bad_request', message: 'Order rejected.', fields: { items: 'One of the products is no longer available.' } },
        { status: 400 },
      )
    }
    placedAt.set(orderNumber, Date.now())
    if (brand === 'pcr') {
      const card = body.payment_method === 'card'
      const discount = typeof body.discount_usd === 'number' ? Math.min(body.discount_usd, 300) : 0
      return Response.json({
        ok: true,
        orderNumber,
        status: card ? 'Pending - Card' : 'Pending - WhatsApp',
        totals: { currency: 'USD', goods: 300, discount, shipping: 0, total: Math.round((300 - discount) * 100) / 100 },
        ...(card ? { paymentUrl: `https://catalog.peptidescostarica.net/pay-card/${orderNumber}` } : {}),
      })
    }
    // The shape UPD's own website reads; no payment link (the app starts the ChargX payment itself). The
    // discount is applied the way the stores are assumed to (DISCOUNT_FIELD), so the totals match the app's.
    // A promo code: "BAD" is refused with the store's message (as UPD's website shows it); any other takes 10% off.
    if (body.promoCode === 'BAD') {
      return Response.json({ error: 'bad_request', message: 'Order rejected.', fields: { promoCode: 'That promo code is not valid.' } }, { status: 400 })
    }
    const promo = typeof body.promoCode === 'string' ? 9 : 0
    // Spending rewards (signed in), in the shape of UPD's sample reply: credit first, then points at 3¢, only up
    // to what the order needs; more than the balance is refused as UPD does (no order is created).
    const redeem = token && typeof body.redeem === 'object' && body.redeem !== null ? (body.redeem as { points?: number; creditUsd?: number; rewards?: string[] }) : undefined
    const sample = SAMPLE_REWARDS.data
    const rewardIds = (redeem?.rewards ?? []).filter((id) => sample.rewards.some((r) => r.id === id))
    const rewardPoints = rewardIds.reduce((sum, id) => sum + (sample.rewards.find((r) => r.id === id)?.points ?? 0), 0)
    if ((redeem?.points ?? 0) + rewardPoints > sample.points.balance || (redeem?.creditUsd ?? 0) > sample.storeCreditUsd) {
      return Response.json({ error: 'bad_request', message: 'Order rejected.', fields: { redeem: 'Not enough points for that.' } }, { status: 400 })
    }
    let left = 90 - promo
    const creditUsd = Math.min(redeem?.creditUsd ?? 0, left)
    left -= creditUsd
    const points = Math.min(redeem?.points ?? 0, Math.ceil(left / 0.03))
    const pointsValue = Math.min(left, Math.round(points * 0.03 * 100) / 100)
    left = Math.round((left - pointsValue) * 100) / 100
    const rewards = redeem ? { tierDiscount: 0, freeDeliveryBy: null, rewards: rewardIds, rewardPoints, points, pointsValue, creditUsd } : null
    const balance = typeof body.discountUsd === 'number' ? Math.min(body.discountUsd, left) : 0
    const discount = Math.round((90 - left + balance) * 100) / 100
    const grandTotal = Math.round((90 - discount) * 100) / 100
    return Response.json(
      {
        data: {
          // UPD leaves `payment` out when nothing is left to pay.
          ...(grandTotal > 0 ? { payment: { token: 'mock', expiresInSeconds: 1800 } } : {}),
          order: {
            orderNumber,
            status: 'pending',
            subtotal: 90,
            discountTotal: discount,
            shippingTotal: 0,
            grandTotal,
            currency: 'USD',
            promoCode: typeof body.promoCode === 'string' ? body.promoCode : null,
            rewards,
          },
        },
      },
      { status: 201 },
    )
  }

  const payments: PaymentStore = {
    get: async (orderNumber) => {
      const at = placedAt.get(orderNumber)
      return at !== undefined && Date.now() - at > PAID_AFTER_MS ? { paidAt: new Date().toISOString(), eventId: 'mock' } : null
    },
    set: async () => {},
  }
  return { fetchFn, payments }
}
