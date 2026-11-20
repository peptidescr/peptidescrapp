import { ChevronRight, UserPlus } from 'lucide-react'
import { Trans, useTranslation } from 'react-i18next'
import { InfoRowCard } from '@/components/ui/info-row-card'
import { ProgressRing } from '@/components/ui/progress-ring'
import type { StoreAccount, TierStatus } from '../../lib/store/account'
import { currentTierRule, nextMilestone, nextTierProgress, perksLine, tierFromReferrals, tierName } from '../../lib/store/loyaltyView'
import { tierRule, type StoreRules } from '../../lib/store/rules'
import { formatPrice } from '../../lib/shop/catalogue'
import { parseISO } from 'date-fns'
import { formatDate } from '../../lib/dates'
import type { Locale } from '../../lib/units'

/**
 * The points card of the approved Home screen: the points balance in the
 * middle of a ring that fills towards the next tier, the tier badge, what's
 * left to reach it, and what it unlocks; all from the store's numbers. Opens
 * Rewards. Shown only for a signed-in customer whose store has rewards on.
 */
export function PointsCard({ account, onOpen }: { account: StoreAccount; onOpen: () => void }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language as Locale
  const progress = nextTierProgress(account)
  const { next } = account.tier
  const name = (tier: string) => tierName(tier, account.rules, t)
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
            ? t('loyalty.ringLabelNext', { points: account.points.toLocaleString(locale), percent: Math.round(progress * 100), tier: name(next.tier) })
            : t('loyalty.ringLabelTop', { points: account.points.toLocaleString(locale), tier: name(account.tier.current) })
        }
      >
        <span className="font-display text-xl font-bold leading-none tabular-nums text-foreground">{account.points.toLocaleString(locale)}</span>
        <span className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">{t('loyalty.ringCaption')}</span>
      </ProgressRing>
      <span className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
        <span className="rounded-full bg-tint px-2 py-1 text-[11px] font-bold uppercase leading-none tracking-[0.1em] text-primary">
          {t('loyalty.tierBadge', { tier: name(account.tier.current) })}
        </span>
        <span className="text-[15px] font-semibold leading-snug text-foreground">
          <NextTierLine tier={account.tier} rules={account.rules} locale={locale} />
        </span>
        <span className="text-[12.5px] leading-snug text-muted-foreground">
          {tierFromReferrals(account)
            ? t('loyalty.tierUntilShort', { tier: name(account.tier.current), date: formatDate(parseISO(account.tier.until!)) })
            : next
              ? t('loyalty.unlocks', { perks: perksLine(tierRule(account.rules, next.tier), t) })
              : perksLine(currentTierRule(account), t)}
        </span>
      </span>
      <ChevronRight aria-hidden className="size-[18px] shrink-0 text-muted-foreground" />
    </button>
  )
}

/**
 * "$600 more to Lab, or 22 referrals" / "$3,500 more to Institute" / "Institute, the top tier": what the store
 * says is left to the next tier. `long` is Rewards' fuller wording ("… more in 12 months …").
 */
export function NextTierLine({ tier, rules, locale, long = false }: { tier: TierStatus; rules: StoreRules; locale: Locale; long?: boolean }) {
  const { t } = useTranslation()
  const usd = (amount: number) => formatPrice({ currency: 'USD', amount: Math.ceil(amount) }, locale)
  const b = { b: <b /> }
  const next = tier.next
  if (!next) return <Trans i18nKey="loyalty.topTier" values={{ tier: tierName(tier.current, rules, t) }} components={b} />
  const values = {
    tier: tierName(next.tier, rules, t),
    amount: next.spendToGoUsd !== undefined ? usd(next.spendToGoUsd) : '',
    count: next.referralsToGo ?? 0,
    months: rules.tierWindowMonths,
  }
  const prefix = long ? 'rewards' : 'loyalty'
  if (next.spendToGoUsd !== undefined && next.referralsToGo !== undefined) {
    return <Trans i18nKey={`${prefix}.toTierOr`} count={next.referralsToGo} values={values} components={b} />
  }
  if (next.spendToGoUsd !== undefined) return <Trans i18nKey={`${prefix}.toTier`} values={values} components={b} />
  if (next.referralsToGo !== undefined) return <Trans i18nKey="loyalty.toTierReferrals" count={next.referralsToGo} values={values} components={b} />
  return <Trans i18nKey="loyalty.nextTier" values={values} components={b} />
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
      : next.grantsTier
        ? t('loyalty.tierMore', { count: next.remaining, tier: tierName(next.grantsTier, account.rules, t) })
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
