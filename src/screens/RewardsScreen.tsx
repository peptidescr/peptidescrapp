import { useTranslation } from 'react-i18next'

/**
 * Points and tiers (Part B): the Redeem / Tier perks screens. Reached only when
 * BRAND.features.store is on — with it off there is no tab and
 * src/lib/pages.ts sends the page to Home — so production never shows this.
 *
 * TODO(Part B): the hero with the points and tier track (ProgressRing,
 * SegmentedProgressTrack), the rewards list and the tier cards.
 */
export function RewardsScreen() {
  const { t } = useTranslation()
  return (
    <div className="px-4 pb-6 pt-2">
      <h1 className="font-display text-[1.375rem] font-bold leading-tight text-foreground">{t('nav.rewards')}</h1>
    </div>
  )
}
