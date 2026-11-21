import { handleCatalogueRequest, toCatalogueBrand } from '../lib/catalogue.ts'
import { checkoutSettings } from '../lib/checkout.ts'
import { environmentFromContext } from '../../src/lib/environment.ts'

/** Only the part of Netlify's Context used here is typed: the deploy environment decides whether orders are taken. */
export default async (_req: Request, context: { deploy?: { context?: string } }): Promise<Response> => {
  const brand = toCatalogueBrand(process.env.VITE_BRAND)
  const settings = checkoutSettings(brand, process.env, environmentFromContext(context?.deploy?.context))
  // The partner key only once it has passed checkoutSettings' sandbox check.
  return handleCatalogueRequest(brand, fetch, new Date(), {
    pcrPartnerKey: settings.ok && settings.brand === 'pcr' ? settings.partnerKey : undefined,
    checkout: settings.ok,
  })
}

export const config = { path: '/api/catalogue' }
