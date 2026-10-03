import { handleCatalogueRequest, toCatalogueBrand } from '../lib/catalogue.ts'

export default async (): Promise<Response> => handleCatalogueRequest(toCatalogueBrand(process.env.VITE_BRAND), fetch)

export const config = { path: '/api/catalogue' }
