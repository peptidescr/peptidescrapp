import { handleCatalogueRequest, toCatalogueBrand } from '../lib/catalogue.ts'
import { checkoutSettings } from '../lib/checkout.ts'

export default async (): Promise<Response> => {
  const brand = toCatalogueBrand(process.env.VITE_BRAND)
  const settings = checkoutSettings(brand, process.env)
  // The partner key only once it has passed checkoutSettings' sandbox check.
  return handleCatalogueRequest(brand, fetch, new Date(), {
    pcrPartnerKey: settings.ok && settings.brand === 'pcr' ? settings.partnerKey : undefined,
    checkout: settings.ok,
  })
}

export const config = { path: '/api/catalogue' }
