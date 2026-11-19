import { Check, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/ui/segmented'
import { SegmentedProgressTrack, segmentedProgress } from '@/components/ui/segmented-progress-track'
import { cn } from '@/lib/utils'
import { StoreSignedOut } from '../components/shop/StoreSignIn'
import { parseISO } from 'date-fns'
import { formatDate } from '../lib/dates'
import { formatPrice } from '../lib/shop/catalogue'
import { balanceUsd, useStoreAccount, type StoreAccount } from '../lib/store/account'
import { LOYALTY_RULES, REFERRAL_RULES, TIER_RULES, TIERS, TIER_WINDOW_MONTHS, labMilestone } from '../lib/store/rules'
import { fixedRewards, labByReferrals, nextTier, pointsToRedeem, pointsWorthUsd, tierOf, tierThresholds } from '../lib/store/loyaltyView'
import type { Tier } from '../lib/store/types'
import type { Locale } from '../lib/units'

type View = 'balance' | 'tiers'

/**
 * Points and tiers (Part B), under the points proposal's rules: the hero with
 * the points and what they're worth, the Bench -> Lab -> Institute track on the
 * last 12 months' spend, then what's available to spend, the fixed rewards and
 * the tier perks. Points and credit are spent on an order's confirmation, not
 * here. Reached only when BRAND.features.store is on; with it off there is no
 * tab and src/lib/pages.ts sends the page to Home, so production never shows
 * this.
 */
export function RewardsScreen({ onOpenRefer }: { onOpenRefer: () => void }) {
  const { t } = useTranslation()
  const account = useStoreAccount()
  if (!account) {
    return (
      <div className="px-4 pb-6 pt-4">
        <h1 className="mb-4 font-display text-[1.375rem] font-bold leading-tight text-foreground">{t('rewards.title')}</h1>
        <StoreSignedOut />
      </div>
    )
  }
  return <RewardsView account={account} onOpenRefer={onOpenRefer} />
}

function RewardsView({ account, onOpenRefer }: { account: StoreAccount; onOpenRefer: () => void }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language as Locale
  const [view, setView] = useState<View>('balance')
  const tier = tierOf(account)
  const next = nextTier(account)
  const usd = (amount: number) => formatPrice({ currency: 'USD', amount }, locale)
  const wholeUsd = (amount: number) => formatPrice({ currency: 'USD', amount: Math.ceil(amount) }, locale)
  const short = pointsToRedeem(account)
  const referralLab = tier === 'lab' && labByReferrals(account) && account.spend12moUsd < TIER_RULES.lab.spendUsd
  // A referral Lab fills the track to Lab's stop even when the spend is lower.
  const trackValue = referralLab ? Math.max(account.spend12moUsd, TIER_RULES.lab.spendUsd) : account.spend12moUsd

  return (
    <div className="pb-6">
      <header
        className="rounded-b-[2rem] bg-hero px-[1.125rem] pb-6 text-on-primary"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1.125rem)' }}
      >
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-display text-[1.375rem] font-bold leading-tight">{t('rewards.title')}</h1>
          <span className="rounded-full bg-on-primary-tile px-2.5 py-1.5 text-[11px] font-bold uppercase leading-none tracking-[0.12em]">
            {t('loyalty.tierBadge', { tier: t(`loyalty.tierName.${tier}`) })}
          </span>
        </div>

        <div className="mt-5 flex items-baseline gap-2">
          <span className="font-display text-[3.25rem] font-bold leading-none tracking-tight tabular-nums">{account.points.toLocaleString(locale)}</span>
          <span className="text-[15px] text-on-primary-muted">{t('rewards.points', { count: account.points })}</span>
        </div>
        <p className="mt-1 text-sm text-on-primary-muted">
          {short > 0 ? (
            <Trans
              i18nKey="rewards.worthLocked"
              values={{ amount: usd(pointsWorthUsd(account)), count: short, minimum: LOYALTY_RULES.minimumRedeem }}
              components={{ b: <b className="text-on-primary" /> }}
            />
          ) : (
            <Trans i18nKey="rewards.worth" values={{ amount: usd(pointsWorthUsd(account)) }} components={{ b: <b className="text-on-primary" /> }} />
          )}
        </p>

        <SegmentedProgressTrack
          className="mt-5"
          ariaLabel={t('rewards.trackLabel', { months: TIER_WINDOW_MONTHS })}
          progress={segmentedProgress(trackValue, tierThresholds())}
          stops={TIERS.map((s) => ({ label: t(`loyalty.tierName.${s}`), detail: wholeUsd(TIER_RULES[s].spendUsd) }))}
        />

        <p className="mt-3.5 rounded-xl bg-on-primary-tile px-3 py-2.5 text-sm">
          {referralLab ? (
            <Trans i18nKey="loyalty.labUntil" values={{ date: formatDate(parseISO(account.labUntil!)) }} components={{ b: <b /> }} />
          ) : !next ? (
            <Trans i18nKey="loyalty.topTier" components={{ b: <b /> }} />
          ) : next.tier === 'lab' ? (
            <Trans
              i18nKey="rewards.toLab"
              count={next.referralsToGo}
              values={{ amount: wholeUsd(next.spendToGo), count: next.referralsToGo, months: TIER_WINDOW_MONTHS }}
              components={{ b: <b /> }}
            />
          ) : (
            <Trans
              i18nKey="rewards.toTier"
              values={{ amount: wholeUsd(next.spendToGo), tier: t(`loyalty.tierName.${next.tier}`), months: TIER_WINDOW_MONTHS }}
              components={{ b: <b /> }}
            />
          )}
        </p>
      </header>

      <section className="mx-4 mt-5 flex flex-col gap-3.5">
        <Segmented
          value={view}
          onChange={setView}
          ariaLabel={t('rewards.tabsLabel')}
          options={[
            { value: 'balance', label: t('rewards.tabBalance') },
            { value: 'tiers', label: t('rewards.tabTiers') },
          ]}
        />

        {view === 'balance' ? (
          <>
            <dl className="flex flex-col gap-2 rounded-[1.125rem] border border-border/60 bg-card p-4 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">{t('rewards.pointsLine', { count: account.points, points: account.points.toLocaleString(locale) })}</dt>
                <dd className={cn('font-semibold tabular-nums', short > 0 ? 'text-muted-foreground' : 'text-foreground')}>{usd(pointsWorthUsd(account))}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">{t('rewards.creditLine')}</dt>
                <dd className="font-semibold tabular-nums text-foreground">{usd(account.creditUsd)}</dd>
              </div>
              <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-border pt-3">
                <dt className="font-display font-bold text-foreground">{t('rewards.available')}</dt>
                <dd className="font-display text-[1.375rem] font-bold tabular-nums text-foreground">{usd(balanceUsd(account))}</dd>
              </div>
              <p className="text-[13px] leading-snug text-muted-foreground">
                {short > 0 ? t('rewards.pointsFrom', { minimum: LOYALTY_RULES.minimumRedeem }) : t('rewards.useAtCheckout')}
              </p>
            </dl>

            <section className="rounded-[1.125rem] border border-border/60 bg-card p-4">
              <h2 className="font-display text-[15px] font-bold text-foreground">{t('rewards.fixedTitle')}</h2>
              <ul className="mt-1 divide-y divide-border/60">
                {fixedRewards(account).map(({ reward, pointsShort }) => (
                  <li key={reward.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground">{t(`rewards.fixed.${reward.id}`)}</p>
                      <p className="text-[12.5px] text-muted-foreground">{t('rewards.fixedCost', { count: reward.points, points: reward.points.toLocaleString(locale) })}</p>
                    </div>
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-2.5 py-1 text-xs font-bold leading-none',
                        pointsShort === 0 ? 'bg-positive-lt text-positive' : 'bg-tint text-muted-foreground',
                      )}
                    >
                      {pointsShort === 0 ? t('rewards.fixedReady') : t('rewards.fixedShort', { count: pointsShort, points: pointsShort.toLocaleString(locale) })}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-[12.5px] leading-snug text-muted-foreground">{t('rewards.fixedNote')}</p>
            </section>

            <section className="rounded-[1.125rem] bg-tint p-4">
              <h2 className="font-display text-[15px] font-bold text-foreground">{t('rewards.howYouEarn')}</h2>
              <ul className="mt-1">
                {[
                  t('rewards.earnPoints', { dollars: usd(1 / LOYALTY_RULES.pointsPerDollar), value: usd(HUNDRED_POINTS_USD) }),
                  t('rewards.earnRedeem', { minimum: LOYALTY_RULES.minimumRedeem }),
                  t('rewards.earnCredit', { credit: usd(REFERRAL_RULES.creditPerReferral), minimum: usd(REFERRAL_RULES.minimumFirstOrder) }),
                ].map((line) => (
                  <li key={line} className="mt-2 flex items-start gap-2 text-[13.5px] text-foreground">
                    <Check aria-hidden strokeWidth={3} className="mt-0.5 size-3.5 shrink-0 text-primary" />
                    {line}
                  </li>
                ))}
              </ul>
              <Button variant="ghost" size="sm" onClick={onOpenRefer} className="-ml-2 mt-2">
                {t('rewards.openRefer')}
                <ChevronRight />
              </Button>
            </section>
          </>
        ) : (
          <div className="flex flex-col gap-2.5">
            {TIERS.map((s) => (
              <TierCard
                key={s}
                name={t(`loyalty.tierName.${s}`)}
                requirement={s === tier ? t('rewards.youAreHere') : requirement(s, wholeUsd, t)}
                perks={tierPerks(s, t, usd)}
                tone={s === 'bench' ? 'bench' : 'lab'}
              />
            ))}
            <p className="px-1 pt-1 text-[13px] text-muted-foreground">
              {t('rewards.footnote', { months: TIER_WINDOW_MONTHS, count: labMilestone().referrals, labMonths: labMilestone().tier.months })}
            </p>
          </div>
        )}
      </section>
    </div>
  )
}

type T = (key: string, options?: Record<string, unknown>) => string

/** What 100 points are worth ($3), rounded so float error never shows. */
const HUNDRED_POINTS_USD = Math.round(LOYALTY_RULES.pointValueUsd * 100 * 100) / 100

/** How a tier is reached: "Everyone starts here", "$1,500 a year or 25 referrals", "$5,000 a year". */
function requirement(tier: Tier, usd: (n: number) => string, t: T): string {
  const rule = TIER_RULES[tier]
  if (rule.spendUsd === 0) return t('rewards.everyone')
  return rule.referrals !== undefined
    ? t('rewards.reachSpendOrReferrals', { amount: usd(rule.spendUsd), count: rule.referrals })
    : t('rewards.reachSpend', { amount: usd(rule.spendUsd) })
}

/** A tier's perks, one per line. */
function tierPerks(tier: Tier, t: T, usd: (n: number) => string): string[] {
  const rule = TIER_RULES[tier]
  if (tier === 'bench') {
    return [
      t('rewards.perkPoints', { dollars: usd(1 / LOYALTY_RULES.pointsPerDollar) }),
      t('rewards.perkPointValue', { value: usd(HUNDRED_POINTS_USD) }),
      t('rewards.perkReferral', { credit: usd(REFERRAL_RULES.creditPerReferral) }),
    ]
  }
  return [
    t('rewards.perkDiscount', { percent: rule.discountPercent }),
    ...(rule.freeDelivery ? [t('rewards.perkFreeDelivery')] : []),
    ...(rule.pointsMultiplier !== 1 ? [t('rewards.perkMultiplier', { times: rule.pointsMultiplier })] : []),
    ...(rule.earlyAccess ? [t('rewards.perkEarlyAccess')] : []),
  ]
}

/** One tier's card: Bench outlined on white, Lab and Institute on the brand colour. */
function TierCard({ name, requirement, perks, tone }: { name: string; requirement: string; perks: string[]; tone: 'bench' | 'lab' }) {
  return (
    <section className={cn('rounded-[1.125rem] border p-4', tone === 'lab' ? 'border-primary bg-hero text-on-primary' : 'border-primary bg-card text-foreground')}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-[17px] font-bold">{name}</h2>
        <span className="text-right text-xs opacity-80">{requirement}</span>
      </div>
      <ul className="mt-1">
        {perks.map((perk) => (
          <li key={perk} className="mt-2 flex items-center gap-2 text-[13.5px]">
            <Check aria-hidden strokeWidth={3} className="size-3.5 shrink-0" />
            {perk}
          </li>
        ))}
      </ul>
    </section>
  )
}
