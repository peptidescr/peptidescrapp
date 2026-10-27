/**
 * A pretend store for clicking through checkout on a local dev server
 * (vite.config.ts serves it only when STORE_CHECKOUT_MOCK=1). It answers the
 * order request the way the stores' docs say they would, without any network:
 * nothing here can reach PCR, UPD or ChargX. Never imported by a Netlify function.
 *
 * Orders it "places" count as paid a few seconds later, so the app's
 * waiting-for-payment state can be seen to finish.
 */
import type { CatalogueBrand, FetchLike } from './catalogue.ts'
import type { PaymentStore } from './payments.ts'

/** Fake values that pass checkoutSettings' checks; not keys for anything. */
export const MOCK_CHECKOUT_ENV = {
  STORE_CHECKOUT: 'sandbox',
  PCR_PARTNER_KEY: 'pk_sandbox_local-mock-not-a-key',
  PCR_SIGNING_SECRET: 'local-mock-not-a-secret',
  UPD_LIVE_ORDERS_OK: 'true',
}

const PAID_AFTER_MS = 8000

export function mockStore(brand: CatalogueBrand): { fetchFn: FetchLike; payments: PaymentStore } {
  const placedAt = new Map<string, number>()
  let next = 1000

  const fetchFn: FetchLike = async (_url, init) => {
    const body = JSON.parse(init?.body ?? '{}') as Record<string, unknown>
    const orderNumber = `${brand === 'pcr' ? 'PTR' : 'USP'}-MOCK${++next}`
    // A customer named "Refuse" is refused, to see the store's message shown.
    const name = brand === 'pcr' ? (body.customer as { name?: string } | undefined)?.name : body.fullName
    if (name === 'Refuse') {
      return Response.json(
        brand === 'pcr' ? { ok: false, error: 'Uno de los productos ya no está disponible.' } : { error: 'One of the products is no longer available.' },
        { status: 400 },
      )
    }
    placedAt.set(orderNumber, Date.now())
    if (brand === 'pcr') {
      const card = body.payment_method === 'card'
      return Response.json({
        ok: true,
        orderNumber,
        status: card ? 'Pending - Card' : 'Pending - WhatsApp',
        totals: { currency: 'USD', goods: 300, discount: 0, shipping: 0, total: 300 },
        ...(card ? { paymentUrl: `https://catalog.peptidescostarica.net/pay-card/${orderNumber}` } : {}),
      })
    }
    return Response.json({
      order: { orderNumber, status: 'pending', subtotal: 90, shippingTotal: 0, grandTotal: 90, paymentUrl: `https://www.usapeptidedepot.com/pay/${orderNumber}` },
    })
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
