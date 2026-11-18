import { useEffect, useState } from 'react'
import { earnForPaidOrder } from '../store/account'
import { fetchPaid, savePlacedOrder, type PlacedOrder } from './checkout'

/** What the customer paid for the order, in dollars; undefined when the store's total isn't in dollars or wasn't given. */
export function paidUsd(order: PlacedOrder): number | undefined {
  return order.totals?.currency === 'USD' ? order.totals.total : undefined
}

const POLL_MS = 5000
/** Past this, a payment page left open is abandoned; the store still emails a receipt if it went through. */
const GIVE_UP_MS = 30 * 60 * 1000

/**
 * Whether a card order has been paid, asking the server every few seconds
 * while the page is visible. Remembers a "paid" on the phone, so it's asked
 * for once. The first "paid" also earns the signed-in account its points
 * (the staging test account; once per order).
 */
export function useOrderPaid(order: PlacedOrder | null): boolean {
  // The order number heard to be paid, so a different order never inherits it.
  const [paidOrder, setPaidOrder] = useState<string | null>(null)

  useEffect(() => {
    // A card order with something to pay through: the store's link, or ChargX's form shown inside the app.
    if (!order || order.paid || order.paymentMethod !== 'card' || !(order.paymentUrl || order.embedUrl)) return
    const deadline = Date.parse(order.placedAt) + GIVE_UP_MS
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const check = async () => {
      if (stopped || Date.now() > deadline) return
      if (document.visibilityState === 'visible' && (await fetchPaid(order.orderNumber)) === true && !stopped) {
        savePlacedOrder({ ...order, paid: true })
        earnForPaidOrder(order.orderNumber, paidUsd(order))
        setPaidOrder(order.orderNumber)
        return
      }
      timer = setTimeout(() => void check(), POLL_MS)
    }
    void check()
    // Back from the payment page: ask straight away rather than at the next tick.
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || stopped) return
      clearTimeout(timer)
      void check()
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
