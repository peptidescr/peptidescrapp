import { BRAND } from '../brand'
import { useStoreAccount } from '../lib/store/account'
import { CreditBanner } from './shop/LoyaltyCards'
import { YourUsual } from './shop/YourUsual'

/**
 * The places on Home reserved for the store connection (Part B): Your usual with
 * its Reorder button, then the credit banner. (The points ring card above them
 * straddles the hero's edge, so HomeScreen places it.) They sit in the approved
 * layout before the vial alerts and the calculator shortcut.
 *
 * Rendered only when BRAND.features.store is on: with the flag off (the
 * default) this contributes nothing at all, not even a placeholder. Your usual
 * needs no account (it remembers this phone's last order); the credit banner
 * needs one, and until the stores have accounts only the sample account of a
 * review build shows it (src/lib/store/account.ts).
 */
export function HomeCommerceSlots({ onOpenRefer }: { onOpenRefer: () => void }) {
  const account = useStoreAccount()
  if (!BRAND.features.store) return null
  return (
    <>
      <YourUsual />
      {account && <CreditBanner account={account} onOpen={onOpenRefer} />}
    </>
  )
}
