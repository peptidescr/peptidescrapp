import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/ui/segmented'
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { BodyMap } from './BodyMap'
import { db, type Protocol } from '../lib/db'
import { rotationSites, SITE_VIEW, siteRest, suggestSite, type SiteId } from '../lib/injectionSites'
import { restText } from '../lib/siteText'
import { useLiveQuery } from '../lib/useLiveQuery'

/**
 * Asked when a taken dose is logged for a protocol that tracks injection
 * sites. The site rested longest is preselected, so the usual case is one more
 * tap; any other site is one tap away on the map or the list.
 *
 * Mounted only while open, so each opening starts from a fresh suggestion.
 */
export function SitePickerSheet({
  protocol,
  onCancel,
  onConfirm,
}: {
  protocol: Protocol
  onCancel: () => void
  onConfirm: (site: SiteId) => void
}) {
  const { t } = useTranslation()
  const takenLogs = useLiveQuery(() => db.doseLogs.where('status').equals('taken').toArray(), [])
  const sites = rotationSites(protocol.route, protocol.siteTracking?.sites ?? [])
  const suggested = takenLogs ? suggestSite(sites, takenLogs) : null
  const [chosen, setChosen] = useState<SiteId | null>(null)
  const selected = chosen ?? suggested
  const [viewChoice, setViewChoice] = useState<'front' | 'back' | null>(null)
  const view = viewChoice ?? (selected ? SITE_VIEW[selected] : 'front')
  const hasBothViews = sites.some((s) => SITE_VIEW[s] === 'front') && sites.some((s) => SITE_VIEW[s] === 'back')
  const rest = siteRest(sites, takenLogs ?? [], new Date())

  function choose(site: SiteId) {
    setChosen(site)
    setViewChoice(SITE_VIEW[site])
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onCancel()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t('sites.pickTitle')}</SheetTitle>
          <SheetDescription>{t('sites.pickBody')}</SheetDescription>
        </SheetHeader>
        <SheetBody className="flex flex-col gap-4">
          {hasBothViews && (
            <Segmented
              value={view}
              onChange={setViewChoice}
              options={[
                { value: 'front', label: t('sites.frontView') },
                { value: 'back', label: t('sites.backView') },
              ]}
            />
          )}
          <BodyMap view={view} sites={sites} selected={selected} suggested={suggested} onSelect={choose} />

          <ul className="flex flex-col gap-1.5" aria-label={t('sites.listLabel')}>
            {rest.map(({ site, restDays }) => {
              const isSelected = site === selected
              return (
                <li key={site}>
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => choose(site)}
                    className={cn(
                      'flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left text-sm',
                      isSelected ? 'border-primary bg-accent text-primary' : 'border-border text-foreground',
                    )}
                  >
                    <span className="min-w-0">
                      {t(`sites.${site}`)}
                      {/* A real space, not just margin, so it isn't read as one word. */}
                      {site === suggested && (
                        <>
                          {' '}
                          <span className="ml-1 text-xs font-semibold text-primary">{t('sites.suggested')}</span>
                        </>
                      )}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{restText(restDays, t)}</span>
                  </button>
                </li>
              )
            })}
          </ul>

          <Button disabled={!selected} onClick={() => selected && onConfirm(selected)}>
            {selected ? t('sites.logAt', { site: t(`sites.${selected}`) }) : t('home.logTaken')}
          </Button>
        </SheetBody>
      </SheetContent>
    </Sheet>
  )
}
