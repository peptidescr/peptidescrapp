import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Segmented } from '@/components/ui/segmented'
import { isSubPage, TRACK_SEGMENTS, type Page, type TrackSegment } from '../lib/pages'

/**
 * The Track tab: everything the old tracking tabs did, as four segments under
 * one control — Today, Protocols, History and Progress. This is only the frame
 * (the title and the segment control); the segment's own screen is passed in.
 *
 * The control is shown on each segment's main page and hidden on the pages
 * opened from one (a protocol's form, the template picker, a dose being
 * edited): those have their own title and a back arrow, and a segment switch
 * in the middle of an edit would silently abandon it.
 */
export function TrackScreen({
  page,
  onSelectSegment,
  children,
}: {
  page: Extract<Page, { tab: 'track' }>
  onSelectSegment: (segment: TrackSegment) => void
  children: ReactNode
}) {
  const { t } = useTranslation()
  const labels: Record<TrackSegment, string> = {
    today: t('track.today'),
    protocols: t('nav.protocols'),
    history: t('nav.history'),
    progress: t('nav.progress'),
  }

  return (
    // Only the header is padded here: each segment's screen carries its own padding.
    <div className="flex flex-col gap-5 pt-2">
      {!isSubPage(page) && (
        <div className="flex flex-col gap-4 px-4">
          <h1 className="font-display text-[1.375rem] font-bold leading-tight text-foreground">{t('nav.track')}</h1>
          <Segmented
            ariaLabel={t('track.ariaLabel')}
            compact
            value={page.segment}
            onChange={onSelectSegment}
            options={TRACK_SEGMENTS.map((segment) => ({ value: segment, label: labels[segment] }))}
          />
        </div>
      )}
      {children}
    </div>
  )
}
