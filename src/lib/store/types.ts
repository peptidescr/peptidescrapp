/**
 * The seam for Part B (store sign-in, Your usual + reorder, rewards, referrals,
 * the in-app Shop) and Part C (the USA Peptide Depot store connection).
 *
 * TYPES ONLY. Nothing here is implemented, imported by the app, or called, and
 * nothing talks to a network. Part B writes one adapter per store behind this
 * interface; the screens then ask for a StoreAdapter and never learn which
 * store they are talking to. It only matters once `BRAND.features.store` is on
 * (src/brand/index.ts), so with the flag off the app behaves as it always has.
 *
 * Tracking data (protocols, doses, vials, weights, check-ins) never goes
 * through this: it stays on the device. The adapter only carries the
 * customer's *store* account.
 *
 * TODO(Part B): the real shapes come from the stores' APIs. These are a sketch
 * of what the approved screens need (Home's points ring and tier line, Your
 * usual, the credit banner, Rewards' redeem and tier perks, Refer & earn), to
 * be corrected against the real responses.
 */

/** Money in whole minor units (cents), so there is never a float to round. */
export type Cents = number

export type Tier = 'bench' | 'lab' | 'institute'

export interface StoreProfile {
  id: string
  /** What the hero greets them by ("Dr. Morgan"). */
  displayName: string
  email: string
}

/** One line of the customer's usual order ("BPC-157 5mg · 5 vials · $191.25"). */
export interface UsualOrderLine {
  productId: string
  /** The store's product name. */
  name: string
  vialSize?: string
  quantity: number
  unitPrice: Cents
  imageUrl?: string
}

export interface UsualOrder {
  lines: UsualOrderLine[]
  /** Sum of the lines, before shipping and credit. */
  subtotal: Cents
  /** When they last ordered it (ISO date), for "Last ordered Sep 22". */
  lastOrderedAt?: string
  /** Points a reorder would earn, and any free add-on ("Free BAC water"). */
  pointsEarned?: number
  freeAddOn?: string
}

export interface LoyaltyStatus {
  points: number
  tier: Tier
  /** What the points are worth off the next order ("Worth $18"). */
  pointsValue: Cents
  /** The next tier and how far away it is; absent at the top tier. */
  next?: { tier: Tier; pointsNeeded: number; spendNeeded: Cents; perk: string }
  /** The tier thresholds, for the Bench -> Lab -> Institute track. */
  thresholds: Record<Tier, number>
  /** Store credit ready to use ("$45 credit ready to use"). */
  credit: Cents
}

export interface Reward {
  id: string
  title: string
  pointsCost: number
  /** Short badge text on the tile ("SHIP", "BAC", "$10"). */
  badge: string
  /** Redeemable now, or locked until more points are earned. */
  available: boolean
  pointsShort?: number
}

export interface ReferralInfo {
  code: string
  shareUrl: string
  /** What each side gets, and progress towards the next credit. */
  creditPerReferral: Cents
  referralsMade: number
  referralsToNextCredit: number
  history: { name: string; status: 'earned' | 'pending'; amount: Cents }[]
}

export interface CatalogueItem {
  productId: string
  name: string
  category?: string
  price: Cents
  vialSize?: string
  inStock: boolean
  imageUrl?: string
  url?: string
}

export interface CartLine {
  productId: string
  quantity: number
}

export interface Cart {
  lines: CartLine[]
  /** Reward or credit being applied at checkout. */
  rewardId?: string
}

/** Where to send the customer to pay: the store's own checkout, with the cart filled in. */
export interface CheckoutSession {
  url: string
}

export interface StoreAdapter {
  signIn(credentials: { email: string; password: string }): Promise<StoreProfile>
  signOut(): Promise<void>
  /** The signed-in customer, or null when signed out. */
  getProfile(): Promise<StoreProfile | null>
  getUsualOrder(): Promise<UsualOrder | null>
  getLoyalty(): Promise<LoyaltyStatus>
  getRewards(): Promise<Reward[]>
  redeem(rewardId: string): Promise<LoyaltyStatus>
  getReferral(): Promise<ReferralInfo>
  getCatalogue(): Promise<CatalogueItem[]>
  startCheckout(cart: Cart): Promise<CheckoutSession>
}
