import { Check, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/ui/segmented'
import { SegmentedProgressTrack, segmentedProgress } from '@/components/ui/segmented-progress-track'
import { cn } from '@/lib/utils'
import { NextTierLine } from '../components/shop/LoyaltyCards'
import { StoreSignedOut } from '../components/shop/StoreSignIn'
import { parseISO } from 'date-fns'
import { formatDate } from '../lib/dates'
import { formatPrice } from '../lib/shop/catalogue'
import { useStoreAccount, type StoreAccount } from '../lib/store/account'
import { hundredPointsUsd, tierMilestone, type TierRule } from '../lib/store/rules'
import { HISTORY_REASONS } from '../lib/store/storeRewards'
import { fixedRewards, pointsToRedeem, spendableUsd, tierFromReferrals, tierName, tierThresholds, trackSpend } from '../lib/store/loyaltyView'
import type { Locale } from '../lib/units'

type View = 'balance' | 'tiers'

/**
 * Points and tiers (Part B): the hero with the points and what they're worth,
 * the tier track on the last 12 months' spend, then what's available to spend,
 * the fixed rewards, recent changes and the tier perks; every number from the
 * store. Points and credit are spent on an order's confirmation, not here.
 * Reached only when BRAND.features.store is on; with it off there is no tab and
 * src/lib/pages.ts sends the page to Home, so production never shows this.
 */
export function RewardsScreen({ onOpenRefer }: { onOpenRefer: () => void }) {
  const { t } = useTranslation()
  const account = useStoreAccount()
  if (!account?.enabled) {
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
  const { rules } = account
  const usd = (amount: number) => formatPrice({ currency: 'USD', amount }, locale)
  const wholeUsd = (amount: number) => formatPrice({ currency: 'USD', amount: Math.ceil(amount) }, locale)
  const name = (tier: string) => tierName(tier, rules, t)
  const short = pointsToRedeem(account)
  const referralTier = tierFromReferrals(account)
  const referral = rules.referral
  const shortDate = (iso: string) => new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(new Date(`${iso.slice(0, 10)}T12:00:00`))

  return (
    <div className="pb-6">
      <header
        className="rounded-b-[2rem] bg-hero px-[1.125rem] pb-6 text-on-primary"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1.125rem)' }}
      >
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-display text-[1.375rem] font-bold leading-tight">{t('rewards.title')}</h1>
          <span className="rounded-full bg-on-primary-tile px-2.5 py-1.5 text-[11px] font-bold uppercase leading-none tracking-[0.12em]">
            {t('loyalty.tierBadge', { tier: name(account.tier.current) })}
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
              count={short}
              values={{ amount: usd(account.pointsValueUsd), count: short, minimum: rules.minimumRedeem }}
              components={{ b: <b className="text-on-primary" /> }}
            />
          ) : (
            <Trans i18nKey="rewards.worth" values={{ amount: usd(account.pointsValueUsd) }} components={{ b: <b className="text-on-primary" /> }} />
          )}
        </p>

        {rules.tiers.length > 1 && (
          <SegmentedProgressTrack
            className="mt-5"
            ariaLabel={t('rewards.trackLabel', { months: rules.tierWindowMonths })}
            progress={segmentedProgress(trackSpend(account), tierThresholds(rules))}
            stops={rules.tiers.map((s) => ({ label: name(s.tier), detail: wholeUsd(s.spendUsd) }))}
          />
        )}

        <p className="mt-3.5 rounded-xl bg-on-primary-tile px-3 py-2.5 text-sm">
          {referralTier ? (
            <Trans i18nKey="loyalty.tierUntil" values={{ tier: name(account.tier.current), date: formatDate(parseISO(account.tier.until!)) }} components={{ b: <b /> }} />
          ) : (
            <NextTierLine tier={account.tier} rules={rules} locale={locale} long />
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
                <dd className={cn('font-semibold tabular-nums', short > 0 ? 'text-muted-foreground' : 'text-foreground')}>{usd(account.pointsValueUsd)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">{t('rewards.creditLine')}</dt>
                <dd className="font-semibold tabular-nums text-foreground">{usd(account.creditUsd)}</dd>
              </div>
              <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-border pt-3">
                <dt className="font-display font-bold text-foreground">{t('rewards.available')}</dt>
                <dd className="font-display text-[1.375rem] font-bold tabular-nums text-foreground">{usd(spendableUsd(account))}</dd>
              </div>
              <p className="text-[13px] leading-snug text-muted-foreground">
                {short > 0 ? t('rewards.pointsFrom', { minimum: rules.minimumRedeem }) : t('rewards.useAtCheckout')}
              </p>
            </dl>

            {account.rewards.length > 0 && (
              <section className="rounded-[1.125rem] border border-border/60 bg-card p-4">
                <h2 className="font-display text-[15px] font-bold text-foreground">{t('rewards.fixedTitle')}</h2>
                <ul className="mt-1 divide-y divide-border/60">
                  {fixedRewards(account).map(({ reward, pointsShort }) => (
                    <li key={reward.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground">{t(`rewards.fixed.${reward.id}`, { defaultValue: reward.name ?? reward.id })}</p>
                        <p className="text-[12.5px] text-muted-foreground">{t('rewards.fixedCost', { count: reward.points, points: reward.points.toLocaleString(locale) })}</p>
                      </div>
                      <span
                        className={cn(
                          'shrink-0 rounded-full px-2.5 py-1 text-xs font-bold leading-none',
                          pointsShort === 0 && reward.available !== false ? 'bg-positive-lt text-positive' : 'bg-tint text-muted-foreground',
                        )}
                      >
                        {reward.available === false
                          ? t('rewards.fixedUnavailable')
                          : pointsShort === 0
                            ? t('rewards.fixedReady')
                            : t('rewards.fixedShort', { count: pointsShort, points: pointsShort.toLocaleString(locale) })}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-[12.5px] leading-snug text-muted-foreground">{t('rewards.fixedNote')}</p>
              </section>
            )}

            {account.history.length > 0 && (
              <section className="rounded-[1.125rem] border border-border/60 bg-card p-4">
                <h2 className="font-display text-[15px] font-bold text-foreground">{t('rewards.historyTitle')}</h2>
                <ul className="mt-1 divide-y divide-border/60">
                  {account.history.slice(0, 10).map((h, i) => (
                    <li key={`${h.at}-${i}`} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <div className="min-w-0">
                        <p className="truncate text-foreground">{historyReason(h.reason, t)}</p>
                        <p className="truncate text-[12.5px] text-muted-foreground">{h.note ? `${shortDate(h.at)} · ${h.note}` : shortDate(h.at)}</p>
                      </div>
                      <span className="shrink-0 text-right text-[13px] font-semibold tabular-nums">
                        {h.points !== undefined && h.points !== 0 && (
                          <span className={cn('block', h.points > 0 ? 'text-positive' : 'text-muted-foreground')}>
                            {t('rewards.historyPoints', { count: Math.abs(h.points), sign: h.points > 0 ? '+' : '−', points: Math.abs(h.points).toLocaleString(locale) })}
                          </span>
                        )}
                        {h.creditUsd !== undefined && h.creditUsd !== 0 && (
                          <span className={cn('block', h.creditUsd > 0 ? 'text-positive' : 'text-muted-foreground')}>
                            {`${h.creditUsd > 0 ? '+' : '−'}${usd(Math.abs(h.creditUsd))}`}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="rounded-[1.125rem] bg-tint p-4">
              <h2 className="font-display text-[15px] font-bold text-foreground">{t('rewards.howYouEarn')}</h2>
              <ul className="mt-1">
                {[
                  t('rewards.earnPoints', { dollars: usd(1 / rules.pointsPerDollar), value: usd(hundredPointsUsd(rules)) }),
                  t('rewards.earnRedeem', { minimum: rules.minimumRedeem }),
                  ...(referral
                    ? [
                        referral.minimumFirstOrderUsd !== undefined
                          ? t('rewards.earnCredit', { credit: usd(referral.creditPerReferralUsd), minimum: usd(referral.minimumFirstOrderUsd) })
                          : t('rewards.earnCreditAny', { credit: usd(referral.creditPerReferralUsd) }),
                      ]
                    : []),
                ].map((line) => (
                  <li key={line} className="mt-2 flex items-start gap-2 text-[13.5px] text-foreground">
                    <Check aria-hidden strokeWidth={3} className="mt-0.5 size-3.5 shrink-0 text-primary" />
                    {line}
                  </li>
                ))}
              </ul>
              {referral && (
                <Button variant="ghost" size="sm" onClick={onOpenRefer} className="-ml-2 mt-2">
                  {t('rewards.openRefer')}
                  <ChevronRight />
                </Button>
              )}
            </section>
          </>
        ) : (
          <div className="flex flex-col gap-2.5">
            {rules.tiers.map((rule, i) => (
              <TierCard
                key={rule.tier}
                name={name(rule.tier)}
                requirement={rule.tier === account.tier.current ? t('rewards.youAreHere') : requirement(rule, wholeUsd, t)}
                perks={tierPerks(rule, i === 0, account, usd, t)}
                tone={i === 0 ? 'bench' : 'lab'}
              />
            ))}
            <p className="px-1 pt-1 text-[13px] text-muted-foreground">{footnote(account, t)}</p>
          </div>
        )}
      </section>
    </div>
  )
}

type T = (key: string, options?: Record<string, unknown>) => string

/** A history line's title from UPD's reason code ("Points for an order", "Referral credit"…); others: "Change". */
function historyReason(reason: string | undefined, t: T): string {
  return reason && (HISTORY_REASONS as readonly string[]).includes(reason) ? t(`rewards.historyReason.${reason}`) : t('rewards.historyChange')
}

/** How a tier is reached: "Everyone starts here", "$1,500 a year or 25 referrals", "$5,000 a year". */
function requirement(rule: TierRule, usd: (n: number) => string, t: T): string {
  if (rule.spendUsd === 0 && rule.referrals === undefined) return t('rewards.everyone')
  return rule.referrals !== undefined
    ? t('rewards.reachSpendOrReferrals', { amount: usd(rule.spendUsd), count: rule.referrals })
    : t('rewards.reachSpend', { amount: usd(rule.spendUsd) })
}

/** A tier's perks, one per line; the first tier lists how points and referrals work. */
function tierPerks(rule: TierRule, first: boolean, account: StoreAccount, usd: (n: number) => string, t: T): string[] {
  const { rules } = account
  const perks = [
    ...(rule.discountPercent > 0 ? [t('rewards.perkDiscount', { percent: rule.discountPercent })] : []),
    ...(rule.freeDelivery ? [t('rewards.perkFreeDelivery')] : []),
    ...(rule.pointsMultiplier !== 1 ? [t('rewards.perkMultiplier', { times: rule.pointsMultiplier })] : []),
    ...(rule.earlyAccess ? [t('rewards.perkEarlyAccess')] : []),
  ]
  if (!first) return perks
  return [
    t('rewards.perkPoints', { dollars: usd(1 / rules.pointsPerDollar) }),
    t('rewards.perkPointValue', { value: usd(hundredPointsUsd(rules)) }),
    ...(rules.referral ? [t('rewards.perkReferral', { credit: usd(rules.referral.creditPerReferralUsd) })] : []),
    ...perks,
  ]
}

/** "Tiers follow what you spent over the last 12 months. Lab also comes with 25 referrals, for 12 months. …" */
function footnote(account: StoreAccount, t: T): string {
  const milestone = account.rules.referral ? tierMilestone(account.rules.referral) : undefined
  const byReferrals = milestone?.tier
    ? t('rewards.footnoteReferrals', {
        tier: tierName(milestone.tier, account.rules, t),
        count: milestone.referrals,
        months: milestone.months ?? account.rules.tierWindowMonths,
      })
    : ''
  const countsFrom = account.rules.countsFrom ? t('rewards.footnoteCountsFrom', { date: formatDate(parseISO(account.rules.countsFrom)) }) : ''
  return [t('rewards.footnote', { months: account.rules.tierWindowMonths }), countsFrom, byReferrals, t('rewards.footnoteStack')].filter(Boolean).join(' ')
}

/** One tier's card: the first outlined on white, the others on the brand colour. */
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
