/**
 * The brand this build was made for — see ./brands.ts for what a brand is
 * and how one is picked. vite.config.ts always `define`s VITE_BRAND, so
 * this is a compile-time constant.
 */
import { PCR_BRAND, UPD_BRAND, type BrandConfig } from './brands'

export type { BrandId, BrandLocale } from './brands'

export interface BrandContact {
  website: { href: string; label: string }
  /** Shown as plain text under the logo. */
  address?: string
  /** wa.me link target, digits only (country code first). */
  whatsapp?: string
  phones: { href: string; label: string }[]
  email: string
}

export interface Brand extends BrandConfig {
  contact: BrandContact
}

/*
 * A literal VITE_BRAND ternary with each brand's data inline in its own
 * branch (not two named consts picked between): once VITE_BRAND is
 * substituted, the bundler deletes the dead branch outright, so neither
 * build carries the other brand's name or contact details.
 *
 * Peptides CR's contact card is restored as it was before the September
 * 2026 rebrand (commit 53c0889). Confirm with the client that the CR
 * WhatsApp/phone and the Jacó · San José address are still current before
 * launching that site.
 */
export const BRAND: Brand =
  import.meta.env.VITE_BRAND === 'pcr'
    ? {
        ...PCR_BRAND,
        contact: {
          website: { href: 'https://peptidescostarica.net', label: 'peptidescostarica.net' },
          address: 'Jacó · San José, Costa Rica',
          whatsapp: '50684046973',
          phones: [
            { href: 'tel:+50684046973', label: 'CR +506 8404-6973' },
            { href: 'tel:+18314715559', label: 'US +1 (831) 471-5559' },
          ],
          email: 'info@peptidescostarica.net',
        },
      }
    : {
        ...UPD_BRAND,
        contact: {
          website: { href: 'https://www.usapeptidedepot.com', label: 'usapeptidedepot.com' },
          phones: [{ href: 'tel:+18314715559', label: '+1 (831) 471-5559' }],
          email: 'info@usapeptidedepot.com',
        },
      }
