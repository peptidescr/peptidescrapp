import { BRAND } from '../brand'
import { YourUsual } from './shop/YourUsual'

/**
 * The places on Home reserved for the store connection (Part B): the points
 * ring card (a ProgressRing and the next tier), Your usual with its Reorder
 * button, and the credit banner. They sit in the approved layout between the
 * Next dose card and the calculator shortcut.
 *
 * Rendered only when BRAND.features.store is on: with the flag off (the
 * default) this contributes nothing at all, not even a placeholder. Your usual
 * is built (it needs no account: it remembers this phone's last order); the
 * points ring and the credit banner wait for the stores' accounts.
 */
export function HomeCommerceSlots() {
  if (!BRAND.features.store) return null
  return (
    <>
      {/* TODO(Part B, accounts): the points ring card, and the credit banner. */}
      <YourUsual />
    </>
  )
}
