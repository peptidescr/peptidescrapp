import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { SITE_VIEW, type SiteId } from '../lib/injectionSites'

/**
 * A simple body outline with the injection sites drawn on it, front or back.
 * Drawn as a mirror: the body's left is on the left of the screen in both
 * views, the way you see yourself in a mirror (front) or over your shoulder
 * (back), so "left thigh" is always on the left. L/R marks say so.
 *
 * Only the sites a protocol rotates through are drawn. They are focusable and
 * labelled, but the list under the map in SitePickerSheet is the primary way
 * to pick — its rows are full-size touch targets; the map is for seeing where
 * a site is.
 */

type Shape =
  | { kind: 'rect'; x: number; y: number; w: number; h: number }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number }

const SHAPES: Record<SiteId, Shape> = {
  'deltoid-left': { kind: 'ellipse', cx: 46, cy: 84, rx: 15, ry: 15 },
  'deltoid-right': { kind: 'ellipse', cx: 154, cy: 84, rx: 15, ry: 15 },
  'abdomen-upper-left': { kind: 'rect', x: 72, y: 126, w: 27, h: 30 },
  'abdomen-upper-right': { kind: 'rect', x: 101, y: 126, w: 27, h: 30 },
  'abdomen-lower-left': { kind: 'rect', x: 72, y: 160, w: 27, h: 30 },
  'abdomen-lower-right': { kind: 'rect', x: 101, y: 160, w: 27, h: 30 },
  'thigh-left': { kind: 'rect', x: 64, y: 232, w: 30, h: 54 },
  'thigh-right': { kind: 'rect', x: 106, y: 232, w: 30, h: 54 },
  'arm-left': { kind: 'rect', x: 29, y: 102, w: 22, h: 52 },
  'arm-right': { kind: 'rect', x: 149, y: 102, w: 22, h: 52 },
  'glute-left': { kind: 'ellipse', cx: 81, cy: 214, rx: 20, ry: 19 },
  'glute-right': { kind: 'ellipse', cx: 119, cy: 214, rx: 20, ry: 19 },
}

export function BodyMap({
  view,
  sites,
  selected,
  suggested,
  onSelect,
}: {
  view: 'front' | 'back'
  sites: readonly SiteId[]
  selected: SiteId | null
  suggested: SiteId | null
  onSelect: (site: SiteId) => void
}) {
  const { t } = useTranslation()
  const shown = sites.filter((site) => SITE_VIEW[site] === view)

  function onKey(e: KeyboardEvent, site: SiteId) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect(site)
    }
  }

  return (
    <svg
      viewBox="0 0 200 360"
      role="group"
      aria-label={view === 'front' ? t('sites.frontView') : t('sites.backView')}
      // shrink-0: in a scrolling sheet with a long site list, a flex column would
      // otherwise squash the map to nothing.
      className="mx-auto h-auto w-full max-w-[15rem] shrink-0"
    >
      {/* The figure itself: neutral, so the sites read as the only thing on it. */}
      <g className="fill-muted-foreground/15 stroke-muted-foreground/40" strokeWidth={1.5}>
        <circle cx={100} cy={32} r={22} />
        <rect x={90} y={50} width={20} height={16} rx={6} />
        <rect x={58} y={64} width={84} height={150} rx={28} />
        <rect x={28} y={70} width={26} height={140} rx={13} />
        <rect x={146} y={70} width={26} height={140} rx={13} />
        <rect x={62} y={200} width={36} height={150} rx={17} />
        <rect x={102} y={200} width={36} height={150} rx={17} />
        {view === 'front' && <circle cx={100} cy={158} r={2.5} className="fill-muted-foreground/50 stroke-none" />}
      </g>

      {shown.map((site) => {
        const shape = SHAPES[site]
        const isSelected = site === selected
        const className = cn(
          'cursor-pointer outline-none transition-colors focus-visible:stroke-ring',
          isSelected ? 'fill-primary stroke-primary' : 'fill-primary/20 stroke-primary/60 hover:fill-primary/35',
        )
        const label = `${t(`sites.${site}`)}${site === suggested ? ` · ${t('sites.suggested')}` : ''}`
        const common = {
          role: 'button',
          tabIndex: 0,
          'aria-label': label,
          'aria-pressed': isSelected,
          className,
          strokeWidth: isSelected ? 2.5 : 1.5,
          onClick: () => onSelect(site),
          onKeyDown: (e: KeyboardEvent) => onKey(e, site),
        }
        return shape.kind === 'rect' ? (
          <rect key={site} {...common} x={shape.x} y={shape.y} width={shape.w} height={shape.h} rx={9} />
        ) : (
          <ellipse key={site} {...common} cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} />
        )
      })}

      <g className="fill-muted-foreground text-[11px] font-semibold" aria-hidden>
        <text x={14} y={352}>
          {t('sites.leftShort')}
        </text>
        <text x={178} y={352}>
          {t('sites.rightShort')}
        </text>
      </g>
    </svg>
  )
}
