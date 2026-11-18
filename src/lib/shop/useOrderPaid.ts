import { useEffect, useState } from 'react'
import { earnForPaidOrder } from '../store/account'
import { fetchPaid, loadPlacedOrder, savePlacedOrder, type PlacedOrder } from './checkout'

const POLL_MS = 5000
/** Asked every few seconds for this long after the order is placed: the usual time it takes to pay. */
const POLL_WINDOW_MS = 30 * 60 * 1000
/** After that, still asked once each time the app is opened or comes back, up to this age, so a late payment shows. */
const CHECK_ON_OPEN_MS = 7 * 24 * 60 * 60 * 1000

/** What the customer paid for the order, in dollars; undefined when the store's total isn't in dollars or wasn't given. */
export function paidUsd(order: PlacedOrder): number | undefined {
  return order.totals?.currency === 'USD' ? order.totals.total : undefined
}

/**
 * How an order's payment should be checked now: 'poll' (every few seconds, the first 30 minutes), 'once' (a single
 * question when the app opens or comes back, up to 7 days), or null (paid, not a card order with a payment link,
 * or too old).
 */
export function paidCheck(order: PlacedOrder | null, now: number): 'poll' | 'once' | null {
  if (!order || order.paid || order.paymentMethod !== 'card' || !(order.paymentUrl || order.embedUrl)) return null
  const age = now - Date.parse(order.placedAt)
  if (Number.isNaN(age)) return null
  if (age <= POLL_WINDOW_MS) return 'poll'
  return age <= CHECK_ON_OPEN_MS ? 'once' : null
}

/**
 * Records a "paid": on the order kept on the phone (only if it's still the last order, so a newer one is never
 * overwritten), and the signed-in account's points for it (the staging test account; once per order).
 */
function markPaid(order: PlacedOrder): void {
  const saved = loadPlacedOrder()
  if (saved?.orderNumber === order.orderNumber) savePlacedOrder({ ...saved, paid: true })
  earnForPaidOrder(order.orderNumber, paidUsd(order))
}

/**
 * Asks once whether the last order was paid, if it's still waiting (App calls this when the app opens and each time
 * it comes back), so a payment made late or in another tab shows as Paid wherever the order appears next.
 */
export async function checkLastOrderPaid(fetchFn: typeof fetch = fetch): Promise<void> {
  const order = loadPlacedOrder()
  if (!order || !paidCheck(order, Date.now()) || document.visibilityState !== 'visible') return
  if ((await fetchPaid(order.orderNumber, fetchFn)) === true) markPaid(order)
}

/**
 * Whether a card order has been paid: asked every few seconds for the first 30 minutes while the page is visible,
 * and again each time the page comes back into view (up to 7 days). Remembers a "paid" on the phone, so it's asked
 * for once. The first "paid" also earns the signed-in account its points (the staging test account; once per order).
 */
export function useOrderPaid(order: PlacedOrder | null): boolean {
  // The order number heard to be paid, so a different order never inherits it.
  const [paidOrder, setPaidOrder] = useState<string | null>(null)

  useEffect(() => {
    const mode = paidCheck(order, Date.now())
    if (!order || !mode) return
    const pollUntil = Date.parse(order.placedAt) + POLL_WINDOW_MS
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const check = async (poll: boolean) => {
      if (stopped) return
      if (document.visibilityState === 'visible' && (await fetchPaid(order.orderNumber)) === true && !stopped) {
        markPaid(order)
        setPaidOrder(order.orderNumber)
        return
      }
      if (poll && !stopped && Date.now() <= pollUntil) timer = setTimeout(() => void check(true), POLL_MS)
    }
    void check(mode === 'poll')
    // Back from the payment page (or the app reopened): ask straight away rather than at the next tick.
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || stopped) return
      clearTimeout(timer)
      void check(Date.now() <= pollUntil)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stopped = true
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [order])

  return order !== null && (order.paid === true || paidOrder === order.orderNumber)
}
