import { blobPaymentStore } from '../lib/blobStore.ts'
import { toCatalogueBrand } from '../lib/catalogue.ts'
import { handleStatusRequest } from '../lib/payments.ts'

/** Whether an order placed in the app has been paid; see netlify/lib/payments.ts. */
export default async (req: Request): Promise<Response> =>
  handleStatusRequest(req, toCatalogueBrand(process.env.VITE_BRAND), blobPaymentStore())

export const config = {
  path: '/api/order-status',
  rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ['ip', 'domain'] },
}
