import { toCatalogueBrand } from '../lib/catalogue.ts'
import { handleOrderRequest } from '../lib/checkout.ts'
import { environmentFromContext } from '../../src/lib/environment.ts'

/**
 * Guest checkout. Whether orders are taken follows the deploy environment (Netlify's `context.deploy.context`);
 * see netlify/lib/checkout.ts. Only the part of Netlify's Context used here is typed.
 */
export default async (req: Request, context: { deploy?: { context?: string } }): Promise<Response> =>
  handleOrderRequest(req, toCatalogueBrand(process.env.VITE_BRAND), process.env, environmentFromContext(context?.deploy?.context), fetch)

export const config = {
  path: '/api/orders',
  // Every order reaches the store's staff, so one visitor can't place more than a few a minute.
  rateLimit: { windowLimit: 5, windowSize: 60, aggregateBy: ['ip', 'domain'] },
}
