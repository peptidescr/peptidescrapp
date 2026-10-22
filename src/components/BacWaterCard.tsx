import { BRAND } from '../brand'

/**
 * "Need more BAC water? Add": the calculator's offer to put the diluent in the
 * customer's next store order (Part B). It sits under the preset rows and
 * shows only when BRAND.features.store is on; with the flag off (the default)
 * it renders nothing at all.
 *
 * TODO(Part B): the card itself, fed by the store catalogue's BAC water product
 * and added to the cart through the StoreAdapter (src/lib/store/).
 */
export function BacWaterCard() {
  if (!BRAND.features.store) return null
  return null
}
