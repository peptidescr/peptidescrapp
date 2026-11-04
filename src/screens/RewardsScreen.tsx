import { Check } from 'lucide-react'
import { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/ui/segmented'
import { SegmentedProgressTrack } from '@/components/ui/segmented-progress-track'
import { cn } from '@/lib/utils'
import { EmptyState } from '../components/EmptyState'
import { formatPrice } from '../lib/shop/catalogue'
import { redeemReward, useStoreAccount, type StoreAccount, type TierInfo } from '../lib/store/account'
import { pointsShort, rewardState, trackProgress } from '../lib/store/loyaltyView'
import type { Locale } from '../lib/units'

type View = 'redeem' | 'tiers'

/**
 * Points and tiers (Part B): the hero with the balance and the Bench -> Lab ->
 * Institute track, then Redeem and Tier perks. Reached only when
 * BRAND.features.store is on; with it off there is no tab and src/lib/pages.ts
 * sends the page to Home, so production never shows this.
 *
 * It draws a StoreAccount (src/lib/store/account.ts). There are no customer
 * accounts yet, so for everyone but a review build's sample account it says so.
 */
export function RewardsScreen() {
  const { t } = useTranslation()
  const account = useStoreAccount()
  if (!account) {
    return (
      <div className="px-4 pb-6 pt-4">
        <h1 className="mb-4 font-display text-[1.375rem] font-bold leading-tight text-foreground">{t('rewards.title')}</h1>
        <EmptyState title={t('rewards.signedOutTitle')} body={t('rewards.signedOutBody')} />
      </div>
    )
  }
  return <RewardsView account={account} />
}

function RewardsView({ account }: { account: StoreAccount }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language as Locale
  const [view, setView] = useState<View>('redeem')
  const tierName = (id: string) => t(`loyalty.tierName.${id}`)
  const usd = (amount: number) => formatPrice({ currency: 'USD', amount }, locale)

  return (
    <div className="pb-6">
      <header
        className="rounded-b-[2rem] bg-hero px-[1.125rem] pb-6 text-on-primary"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1.125rem)' }}
      >
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-display text-[1.375rem] font-bold leading-tight">{t('rewards.title')}</h1>
          <span className="rounded-full bg-on-primary-tile px-2.5 py-1.5 text-[11px] font-bold uppercase leading-none tracking-[0.12em]">
            {t('loyalty.tierBadge', { tier: tierName(account.tier) })}
          </span>
        </div>

        <div className="mt-5 flex items-baseline gap-2">
          <span className="font-display text-[3.25rem] font-bold leading-none tracking-tight tabular-nums">{account.points.toLocaleString(locale)}</span>
          <span className="text-[15px] text-on-primary-muted">{t('rewards.points')}</span>
        </div>
        <p className="mt-1 text-sm text-on-primary-muted">
          <Trans i18nKey="rewards.worth" values={{ amount: usd(account.worthUsd) }} components={{ b: <b className="text-on-primary" /> }} />
        </p>

        <SegmentedProgressTrack
          className="mt-5"
          ariaLabel={t('rewards.trackLabel')}
          progress={trackProgress(account)}
          stops={account.tiers.map((tier) => ({ label: tierName(tier.id), detail: tier.minPoints.toLocaleString(locale) }))}
        />

        {account.next && (
          <p className="mt-3.5 rounded-xl bg-on-primary-tile px-3 py-2.5 text-sm">
            <Trans
              i18nKey="rewards.toNext"
              values={{ points: account.next.pointsToGo.toLocaleString(locale), amount: usd(account.next.aboutOrdersUsd), tier: tierName(account.next.id) }}
              components={{ b: <b /> }}
            />
          </p>
        )}
      </header>

      <section className="mx-4 mt-5 flex flex-col gap-3.5">
        <Segmented
          value={view}
          onChange={setView}
          ariaLabel={t('rewards.tabsLabel')}
          options={[
            { value: 'redeem', label: t('rewards.tabRedeem') },
            { value: 'tiers', label: t('rewards.tabTiers') },
          ]}
        />

        {view === 'redeem' ? (
          <ul className="flex flex-col gap-2.5">
            {account.rewards.map((reward) => {
              const state = rewardState(account, reward)
              const name = t(`rewards.name.${reward.id}`, { defaultValue: reward.id })
              const short = pointsShort(account, reward)
              return (
                // A locked reward is quieter through its colours, not by fading the row: opacity would drop its text below readable contrast.
                <li key={reward.id} className="flex items-center gap-3.5 rounded-[1.125rem] border border-border/60 bg-card p-3.5">
                  <span
                    aria-hidden
                    className={cn(
                      'flex size-[2.875rem] shrink-0 items-center justify-center rounded-[0.875rem] text-[15px] font-bold',
                      state === 'locked' ? 'bg-tint text-muted-foreground' : 'bg-primary text-primary-foreground',
                    )}
                  >
                    {reward.short}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className={cn('text-[15px] font-semibold leading-snug', state === 'locked' ? 'text-muted-foreground' : 'text-foreground')}>{name}</span>
                    <span className="text-[13px] text-muted-foreground">
                      {state === 'locked'
                        ? t('rewards.costNeed', { points: reward.cost.toLocaleString(locale), need: short.toLocaleString(locale) })
                        : t('rewards.cost', { points: reward.cost.toLocaleString(locale) })}
                    </span>
                  </span>
                  <Button
                    size="compact"
                    variant={state === 'available' ? 'attention' : 'locked'}
                    disabled={state !== 'available'}
                    aria-label={state === 'available' ? t('rewards.redeemLabel', { reward: name }) : undefined}
                    className={cn('shrink-0', state === 'redeemed' && 'bg-positive-lt text-positive')}
                    onClick={() => {
                      if (redeemReward(reward.id)) toast.success(t('rewards.addedToast', { reward: name }))
                    }}
                  >
                    {state === 'redeemed' ? t('rewards.added') : state === 'available' ? t('rewards.redeem') : t('rewards.locked')}
                  </Button>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="flex flex-col gap-2.5">
            {account.tiers.map((tier) => (
              <TierCard key={tier.id} tier={tier} current={tier.id === account.tier} name={tierName(tier.id)} />
            ))}
            <p className="px-1 pt-1 text-[13px] text-muted-foreground">{t('rewards.footnote')}</p>
          </div>
        )}
      </section>
    </div>
  )
}

/** One tier's card: the current tier outlined on white, Lab on the brand colour, Institute on the darkest. */
function TierCard({ tier, current, name }: { tier: TierInfo; current: boolean; name: string }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language as Locale
  const style =
    tier.id === 'institute'
      ? 'border-tier-dark bg-tier-dark text-on-primary'
      : tier.id === 'lab'
        ? 'border-primary bg-hero text-on-primary'
        : 'border-primary bg-card text-foreground'
  return (
    <section className={cn('rounded-[1.125rem] border p-4', style)} aria-current={current || undefined}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-[17px] font-bold">{name}</h2>
        <span className="text-xs opacity-80">{current ? t('rewards.youAreHere') : t('rewards.tierFrom', { points: tier.minPoints.toLocaleString(locale) })}</span>
      </div>
      <ul className="mt-1">
        {tier.perks.map((perk) => (
          <li key={perk} className="mt-2 flex items-center gap-2 text-[13.5px]">
            <Check aria-hidden strokeWidth={3} className="size-3.5 shrink-0" />
            {t(`loyalty.perk.${perk}`, { defaultValue: perk })}
          </li>
        ))}
      </ul>
    </section>
  )
}
