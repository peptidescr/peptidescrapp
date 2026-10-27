import { blobPaymentStore } from '../lib/blobStore.ts'
import { toCatalogueBrand } from '../lib/catalogue.ts'
import { handleWebhookRequest } from '../lib/payments.ts'

/** ChargX's payment events for this site's store. Needs CHARGX_WEBHOOK_SECRET; see netlify/lib/payments.ts. */
export default async (req: Request): Promise<Response> =>
  handleWebhookRequest(req, toCatalogueBrand(process.env.VITE_BRAND), process.env.CHARGX_WEBHOOK_SECRET, blobPaymentStore())

export const config = { path: '/api/chargx-webhook' }
