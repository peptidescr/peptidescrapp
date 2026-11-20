import { toCatalogueBrand } from '../lib/catalogue.ts'
import { handleRewardsRequest } from '../lib/rewards.ts'

/** The signed-in UPD customer's rewards, read from UPD with their token; see netlify/lib/rewards.ts. */
export default async (req: Request): Promise<Response> => handleRewardsRequest(req, toCatalogueBrand(process.env.VITE_BRAND), fetch)

export const config = {
  path: '/api/rewards',
  rateLimit: { windowLimit: 30, windowSize: 60, aggregateBy: ['ip', 'domain'] },
}
