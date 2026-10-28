import { BRAND } from '../brand'

/**
 * The places on Home reserved for the store connection (Part B): the points
 * ring card (a ProgressRing and the next tier), Your usual with its Reorder
 * button, and the credit banner. They sit in the approved layout between the
 * Next dose card and the calculator shortcut.
 *
 * Rendered only when BRAND.features.store is on, and empty until Part B fills
 * them: with the flag off (the default) this contributes nothing at all, not
 * even a placeholder.
 */
export function HomeCommerceSlots() {
  if (!BRAND.features.store) return null
  return (
    <>
      {/* TODO(Part B): the points ring card, Your usual + Reorder, and the credit banner. */}
    </>
  )
}
