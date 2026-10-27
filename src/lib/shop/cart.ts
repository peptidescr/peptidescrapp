/**
 * The Shop's cart (guest checkout, Part B phase B1): product references and
 * quantities, nothing else. Names, prices and stock always come from the
 * current catalogue, so a cart kept overnight shows today's prices; the store
 * prices the order itself either way.
 *
 * Kept in localStorage so it survives a reload. It's a convenience, not a
 * record: when storage is unavailable the cart simply lasts the visit.
 */
import { useSyncExternalStore } from 'react'
import type { ShopPrice, ShopProduct } from './catalogue'

export interface CartLine {
  ref: string
  qty: number
}

/** The stores' limits: 50 lines an order, 1–100 of each. */
export const MAX_CART_LINES = 50
export const MAX_LINE_QTY = 100

const STORAGE_KEY = 'shop-cart-v1'

function load(): CartLine[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    if (!Array.isArray(raw)) return []
    return raw
      .filter(
        (l): l is CartLine =>
          typeof l === 'object' && l !== null && typeof l.ref === 'string' && Number.isInteger(l.qty) && l.qty >= 1 && l.qty <= MAX_LINE_QTY,
      )
      .slice(0, MAX_CART_LINES)
  } catch {
    return []
  }
}

let lines: CartLine[] | null = null
const listeners = new Set<() => void>()

function current(): CartLine[] {
  lines ??= load()
  return lines
}

function save(next: CartLine[]): void {
  lines = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Storage unavailable: the cart lasts this visit only.
  }
  for (const listener of listeners) listener()
}

/** Adds `qty` of a product (up to the per-line limit). False when the cart is already full. */
export function addToCart(ref: string, qty = 1): boolean {
  const cart = current()
  const existing = cart.find((l) => l.ref === ref)
  if (existing) {
    save(cart.map((l) => (l.ref === ref ? { ref, qty: Math.min(MAX_LINE_QTY, l.qty + qty) } : l)))
    return true
  }
  if (cart.length >= MAX_CART_LINES) return false
  save([...cart, { ref, qty: Math.min(MAX_LINE_QTY, Math.max(1, qty)) }])
  return true
}

/** Sets a line's quantity; 0 removes it. */
export function setCartQuantity(ref: string, qty: number): void {
  const cart = current()
  save(qty <= 0 ? cart.filter((l) => l.ref !== ref) : cart.map((l) => (l.ref === ref ? { ref, qty: Math.min(MAX_LINE_QTY, qty) } : l)))
}

export function clearCart(): void {
  save([])
}

export function useCart(): CartLine[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    current,
  )
}

export interface CartView {
  /** Lines whose product is in the catalogue, orderable and in stock, with that product. */
  lines: { line: CartLine; product: ShopProduct }[]
  /** Lines that can't be ordered now (gone from the store, or out of stock). */
  unavailable: { line: CartLine; product?: ShopProduct }[]
  /** Units across the orderable lines. */
  count: number
  /** Shelf price of the orderable lines; absent when any lacks a price or currencies differ. */
  subtotal?: ShopPrice
}

/** The cart against the current catalogue. */
export function viewCart(cart: readonly CartLine[], products: readonly ShopProduct[]): CartView {
  const byRef = new Map(products.filter((p) => p.orderRef).map((p) => [p.orderRef!, p]))
  const view: CartView = { lines: [], unavailable: [], count: 0 }
  let priced = true
  let total = 0
  let currency: ShopPrice['currency'] | undefined
  for (const line of cart) {
    const product = byRef.get(line.ref)
    if (!product || !product.inStock) {
      view.unavailable.push({ line, product })
      continue
    }
    view.lines.push({ line, product })
    view.count += line.qty
    if (!product.price || (currency && product.price.currency !== currency)) priced = false
    else {
      currency = product.price.currency
      total += product.price.amount * line.qty
    }
  }
  if (priced && currency && view.lines.length > 0) view.subtotal = { currency, amount: Math.round(total * 100) / 100 }
  return view
}
