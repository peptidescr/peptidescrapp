import { MapPin } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { BodyMap } from './BodyMap'
import { db, type Protocol } from '../lib/db'
import { rotationSites, siteRest, suggestSite, type SiteId } from '../lib/injectionSites'
import { restText } from '../lib/siteText'
import { useLiveQuery } from '../lib/useLiveQuery'

/**
 * Asked when a taken dose is logged for a protocol that tracks injection
 * sites. The site rested longest is preselected, so the usual case is one more
 * tap; any other site is one tap away on the body map, front and back shown
 * together. The card above the button names the chosen site and its rest;
 * both stay pinned below the map.
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
  const rest = siteRest(sites, takenLogs ?? [], new Date())
  const selectedRest = rest.find((r) => r.site === selected)
  const anyUsed = rest.some((r) => r.restDays !== null)

  return (
    <Sheet open onOpenChange={(open) => !open && onCancel()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t('sites.pickTitle')}</SheetTitle>
          <SheetDescription>{t('sites.pickBody')}</SheetDescription>
        </SheetHeader>
        <SheetBody className="flex flex-col gap-2 pb-2">
          <BodyMap rest={rest} selected={selected} suggested={suggested} onSelect={setChosen} />
          {anyUsed && <p className="text-center text-xs text-muted-foreground">{t('sites.fadedHint')}</p>}
        </SheetBody>

        {/* Pinned under the map, so on a short screen the map scrolls but the choice and the button stay in view. */}
        <div className="flex shrink-0 flex-col gap-3 px-5 pb-5 pt-2">
          {selected && selectedRest && (
            <div aria-live="polite" className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
                <MapPin className="size-4" aria-hidden />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-sm font-semibold text-foreground">{t(`sites.${selected}`)}</span>
                <span className="text-xs text-muted-foreground">
                  {selected === suggested ? `${t('sites.suggestedLong')} · ` : ''}
                  {restText(selectedRest.restDays, t)}
                </span>
              </span>
            </div>
          )}

          <Button disabled={!selected} onClick={() => selected && onConfirm(selected)}>
            {t('sites.confirm')}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
