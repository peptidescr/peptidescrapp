import { Check, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/ui/segmented'
import { SegmentedProgressTrack } from '@/components/ui/segmented-progress-track'
import { cn } from '@/lib/utils'
import { EmptyState } from '../components/EmptyState'
import { parseISO } from 'date-fns'
import { formatDate } from '../lib/dates'
import { formatPrice } from '../lib/shop/catalogue'
import { balanceUsd, signInTestAccount, TEST_SIGN_IN, useStoreAccount, type StoreAccount } from '../lib/store/account'
import { labMilestone, LOYALTY_RULES, REFERRAL_RULES } from '../lib/store/rules'
import { labProgress, labReferrals, pointsWorthUsd, referralsToLab, tierOf } from '../lib/store/loyaltyView'
import type { Locale } from '../lib/units'

type View = 'balance' | 'tiers'

/**
 * Points and tiers (Part B), under the Referral Model's rules: the hero with
 * the points and what they're worth, the Bench -> Lab track (25 referrals),
 * then what's available to spend and the tier perks. Points and credit are
 * spent on an order's confirmation, not here. Reached only when
 * BRAND.features.store is on; with it off there is no tab and src/lib/pages.ts
 * sends the page to Home, so production never shows this.
 */
export function RewardsScreen({ onOpenRefer }: { onOpenRefer: () => void }) {
  const { t } = useTranslation()
  const account = useStoreAccount()
  if (!account) {
    return (
      <div className="px-4 pb-6 pt-4">
        <h1 className="mb-4 font-display text-[1.375rem] font-bold leading-tight text-foreground">{t('rewards.title')}</h1>
        <EmptyState
          title={t('rewards.signedOutTitle')}
          body={t(TEST_SIGN_IN ? 'rewards.signedOutTestBody' : 'rewards.signedOutBody')}
          action={TEST_SIGN_IN ? <Button onClick={signInTestAccount}>{t('account.testSignIn')}</Button> : undefined}
        />
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
  const usd = (amount: number) => formatPrice({ currency: 'USD', amount }, locale)
  const toGo = referralsToLab(account)

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
          <Trans i18nKey="rewards.worth" values={{ amount: usd(pointsWorthUsd(account)) }} components={{ b: <b className="text-on-primary" /> }} />
        </p>

        <SegmentedProgressTrack
          className="mt-5"
          ariaLabel={t('rewards.trackLabel')}
          progress={tier === 'lab' ? 1 : labProgress(account)}
          stops={[
            { label: t('loyalty.tierName.bench'), detail: '0' },
            { label: t('loyalty.tierName.lab'), detail: t('rewards.trackLab', { count: labReferrals() }) },
          ]}
        />

        <p className="mt-3.5 rounded-xl bg-on-primary-tile px-3 py-2.5 text-sm">
          {tier === 'lab' ? (
            <Trans i18nKey="loyalty.labUntil" values={{ date: formatDate(parseISO(account.labUntil!)) }} components={{ b: <b /> }} />
          ) : (
            <Trans i18nKey="rewards.toLab" count={toGo} values={{ count: toGo }} components={{ b: <b /> }} />
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
                <dd className="font-semibold tabular-nums text-foreground">{usd(pointsWorthUsd(account))}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">{t('rewards.creditLine')}</dt>
                <dd className="font-semibold tabular-nums text-foreground">{usd(account.creditUsd)}</dd>
              </div>
              <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-border pt-3">
                <dt className="font-display font-bold text-foreground">{t('rewards.available')}</dt>
                <dd className="font-display text-[1.375rem] font-bold tabular-nums text-foreground">{usd(balanceUsd(account))}</dd>
              </div>
              <p className="text-[13px] leading-snug text-muted-foreground">{t('rewards.useAtCheckout')}</p>
            </dl>

            <section className="rounded-[1.125rem] bg-tint p-4">
              <h2 className="font-display text-[15px] font-bold text-foreground">{t('rewards.howYouEarn')}</h2>
              <ul className="mt-1">
                <li className="mt-2 flex items-start gap-2 text-[13.5px] text-foreground">
                  <Check aria-hidden strokeWidth={3} className="mt-0.5 size-3.5 shrink-0 text-primary" />
                  {t('rewards.earnPoints', { dollars: usd(LOYALTY_RULES.dollarsPerPoint), value: usd(LOYALTY_RULES.dollarsPerPointRedeemed) })}
                </li>
                <li className="mt-2 flex items-start gap-2 text-[13.5px] text-foreground">
                  <Check aria-hidden strokeWidth={3} className="mt-0.5 size-3.5 shrink-0 text-primary" />
                  {t('rewards.earnCredit', { credit: usd(REFERRAL_RULES.creditPerReferral), minimum: usd(REFERRAL_RULES.minimumFirstOrder) })}
                </li>
              </ul>
              <Button variant="ghost" size="sm" onClick={onOpenRefer} className="-ml-2 mt-2">
                {t('rewards.openRefer')}
                <ChevronRight />
              </Button>
            </section>
          </>
        ) : (
          <div className="flex flex-col gap-2.5">
            <TierCard
              name={t('loyalty.tierName.bench')}
              requirement={tier === 'bench' ? t('rewards.youAreHere') : t('rewards.everyone')}
              perks={[
                t('rewards.perkPoints', { dollars: usd(LOYALTY_RULES.dollarsPerPoint) }),
                t('rewards.perkPointValue', { value: usd(LOYALTY_RULES.dollarsPerPointRedeemed) }),
                t('rewards.perkReferral', { credit: usd(REFERRAL_RULES.creditPerReferral) }),
              ]}
              tone="bench"
            />
            <TierCard
              name={t('loyalty.tierName.lab')}
              requirement={tier === 'lab' ? t('rewards.youAreHere') : t('rewards.trackLab', { count: labReferrals() })}
              perks={[
                t('rewards.perkDiscount', { percent: labMilestone().tier.discountPercent }),
                t('rewards.perkFreeDelivery'),
                t('rewards.perkMonths', { count: labMilestone().tier.months }),
              ]}
              tone="lab"
            />
            <p className="px-1 pt-1 text-[13px] text-muted-foreground">{t('rewards.footnote', { count: labReferrals(), months: labMilestone().tier.months })}</p>
          </div>
        )}
      </section>
    </div>
  )
}

/** One tier's card: Bench outlined on white, Lab on the brand colour. */
function TierCard({ name, requirement, perks, tone }: { name: string; requirement: string; perks: string[]; tone: 'bench' | 'lab' }) {
  return (
    <section className={cn('rounded-[1.125rem] border p-4', tone === 'lab' ? 'border-primary bg-hero text-on-primary' : 'border-primary bg-card text-foreground')}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-[17px] font-bold">{name}</h2>
        <span className="text-xs opacity-80">{requirement}</span>
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
