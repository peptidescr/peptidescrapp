import { toCatalogueBrand } from '../lib/catalogue.ts'
import { handleOrderRequest } from '../lib/checkout.ts'

/** Guest checkout. Off unless the site's environment turns it on; see netlify/lib/checkout.ts. */
export default async (req: Request): Promise<Response> =>
  handleOrderRequest(req, toCatalogueBrand(process.env.VITE_BRAND), process.env, fetch)

export const config = {
  path: '/api/orders',
  // Every order reaches the store's staff, so one visitor can't place more than a few a minute.
  rateLimit: { windowLimit: 5, windowSize: 60, aggregateBy: ['ip', 'domain'] },
}
