import { ChevronRight, UserPlus } from 'lucide-react'
import { Trans, useTranslation } from 'react-i18next'
import { InfoRowCard } from '@/components/ui/info-row-card'
import { ProgressRing } from '@/components/ui/progress-ring'
import type { StoreAccount } from '../../lib/store/account'
import { labByReferrals, nextMilestone, nextTier, nextTierProgress, perksLine, tierOf } from '../../lib/store/loyaltyView'
import { TIER_RULES } from '../../lib/store/rules'
import { formatPrice } from '../../lib/shop/catalogue'
import { parseISO } from 'date-fns'
import { formatDate } from '../../lib/dates'
import type { Locale } from '../../lib/units'

/**
 * The points card of the approved Home screen, under the points proposal's
 * rules: the points balance in the middle of a ring that fills towards the
 * next tier (Lab at $1,500 a year or 25 referrals, Institute at $5,000), the
 * tier badge, what's left to reach it, and what it unlocks. Opens Rewards.
 * Shown only for a signed-in customer (see src/lib/store/account.ts).
 */
export function PointsCard({ account, onOpen }: { account: StoreAccount; onOpen: () => void }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language as Locale
  const tier = tierOf(account)
  const progress = nextTierProgress(account)
  const next = nextTier(account)
  const usd = (amount: number) => formatPrice({ currency: 'USD', amount: Math.ceil(amount) }, locale)
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-4 rounded-2xl bg-card p-4 text-left shadow-card outline-none active:bg-secondary focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ProgressRing
        value={progress}
        size={84}
        strokeWidth={9}
        label={
          next
            ? t('loyalty.ringLabelNext', { points: account.points.toLocaleString(locale), percent: Math.round(progress * 100), tier: t(`loyalty.tierName.${next.tier}`) })
            : t('loyalty.ringLabelTop', { points: account.points.toLocaleString(locale) })
        }
      >
        <span className="font-display text-xl font-bold leading-none tabular-nums text-foreground">{account.points.toLocaleString(locale)}</span>
        <span className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">{t('loyalty.ringCaption')}</span>
      </ProgressRing>
      <span className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
        <span className="rounded-full bg-tint px-2 py-1 text-[11px] font-bold uppercase leading-none tracking-[0.1em] text-primary">
          {t('loyalty.tierBadge', { tier: t(`loyalty.tierName.${tier}`) })}
        </span>
        <span className="text-[15px] font-semibold leading-snug text-foreground">
          {!next ? (
            <Trans i18nKey="loyalty.topTier" components={{ b: <b /> }} />
          ) : next.tier === 'lab' ? (
            <Trans
              i18nKey="loyalty.toLab"
              count={next.referralsToGo}
              values={{ amount: usd(next.spendToGo), count: next.referralsToGo }}
              components={{ b: <b /> }}
            />
          ) : (
            <Trans i18nKey="loyalty.toTier" values={{ amount: usd(next.spendToGo), tier: t(`loyalty.tierName.${next.tier}`) }} components={{ b: <b /> }} />
          )}
        </span>
        <span className="text-[12.5px] leading-snug text-muted-foreground">
          {tier === 'lab' && labByReferrals(account) && account.spend12moUsd < TIER_RULES.lab.spendUsd
            ? t('loyalty.labUntilShort', { date: formatDate(parseISO(account.labUntil!)) })
            : next
              ? t('loyalty.unlocks', { perks: perksLine(next.tier, t) })
              : perksLine(tier, t)}
        </span>
      </span>
      <ChevronRight aria-hidden className="size-[18px] shrink-0 text-muted-foreground" />
    </button>
  )
}

/** "$60 credit ready to use / Refer 2 more labs to unlock $25 extra": the tinted banner under Your usual. Opens Refer & earn. */
export function CreditBanner({ account, onOpen }: { account: StoreAccount; onOpen: () => void }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language as Locale
  if (account.creditUsd <= 0) return null
  const next = nextMilestone(account)
  const subtitle = !next
    ? undefined
    : next.bonusUsd
      ? t('loyalty.creditMore', { count: next.remaining, amount: formatPrice({ currency: 'USD', amount: next.bonusUsd }, locale) })
      : next.grantsLab
        ? t('loyalty.labMore', { count: next.remaining })
        : undefined
  return (
    <InfoRowCard
      tone="tint"
      iconTone="primary"
      icon={UserPlus}
      title={t('loyalty.creditReady', { amount: formatPrice({ currency: 'USD', amount: account.creditUsd }, locale) })}
      subtitle={subtitle}
      onClick={onOpen}
    />
  )
}
