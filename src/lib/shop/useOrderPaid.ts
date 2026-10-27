import { useEffect, useState } from 'react'
import { fetchPaid, savePlacedOrder, type PlacedOrder } from './checkout'

const POLL_MS = 5000
/** Past this, a payment page left open is abandoned; the store still emails a receipt if it went through. */
const GIVE_UP_MS = 30 * 60 * 1000

/**
 * Whether a card order has been paid, asking the server every few seconds
 * while the page is visible. Remembers a "paid" on the phone, so it's asked
 * for once.
 */
export function useOrderPaid(order: PlacedOrder | null): boolean {
  // The order number heard to be paid, so a different order never inherits it.
  const [paidOrder, setPaidOrder] = useState<string | null>(null)

  useEffect(() => {
    if (!order || order.paid || order.paymentMethod !== 'card' || !order.paymentUrl) return
    const deadline = Date.parse(order.placedAt) + GIVE_UP_MS
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const check = async () => {
      if (stopped || Date.now() > deadline) return
      if (document.visibilityState === 'visible' && (await fetchPaid(order.orderNumber)) === true && !stopped) {
        savePlacedOrder({ ...order, paid: true })
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
