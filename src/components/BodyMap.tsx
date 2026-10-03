import { useId, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { restEmphasis, SITE_VIEW, type SiteId, type SiteRest } from '../lib/injectionSites'
import { restText } from '../lib/siteText'

/**
 * Front and back body figures side by side with the injection sites on them,
 * so any site is one tap away with no view switch. Drawn as a mirror: the
 * body's left is on the left of the screen in both views, the way you see
 * yourself in a mirror (front) or over your shoulder (back), so "left thigh"
 * is always on the left. L/R marks say so.
 *
 * Only the sites a protocol rotates through are drawn, and a view with none is
 * left out. Recently used sites are faded relative to the rest (restEmphasis),
 * so the well-rested ones stand out. Each site's tap area is larger than its
 * drawn zone, filling the space around it up to the next site.
 */

/**
 * The right half of the outline, top of the head round to the crotch, in a
 * coordinate space centred on x = 0 (y runs 5 → 294). The left half is its
 * mirror, and the whole loop is smoothed as a Catmull-Rom spline; a third
 * value of 1 marks a corner (the armpit).
 */
const HALF_OUTLINE: readonly (readonly [number, number, 1?])[] = [
  [0, 5], [7.5, 6.5], [11.8, 13], [13, 22], [12, 31], [10, 37.5], [8.6, 42],
  [8.8, 47], [12, 51.5], [19, 54.5], [26, 57],
  [32, 60], [35.5, 65], [37.5, 73],
  [38.5, 88], [39.5, 104], [40.3, 116], [40.6, 127], [39.8, 139], [38.2, 150],
  [38.6, 160], [37.2, 168], [34.2, 172.5], [31.3, 169.5], [30.6, 161], [30.6, 151],
  [31, 140], [30.5, 128], [29.5, 116], [28, 102], [26.8, 88], [25.5, 80, 1],
  [24.5, 88], [23.5, 100], [21, 112], [22.5, 128], [25.5, 142], [26, 152],
  [25.5, 168], [24, 185], [21.5, 203], [19, 216], [18.8, 228], [19.2, 240],
  [16.5, 258], [12.5, 274], [11.5, 282], [13.5, 289], [12, 293], [7, 293.5], [5.5, 290],
  [5.8, 280], [5, 262], [4.6, 242], [4.8, 228], [4.5, 218], [3.5, 200], [2, 178], [1.2, 160], [0, 154],
]

function outlinePath(half: typeof HALF_OUTLINE): string {
  const loop = [...half, ...half.slice(1, -1).reverse().map(([x, y, corner]) => [-x, y, corner] as const)]
  const n = loop.length
  const tangents = loop.map(([, , corner], i) => {
    if (corner) return [0, 0]
    const [ax, ay] = loop[(i - 1 + n) % n]!
    const [bx, by] = loop[(i + 1) % n]!
    return [(bx - ax) / 6, (by - ay) / 6]
  })
  const r = (v: number) => Math.round(v * 100) / 100
  let d = `M${loop[0]![0]} ${loop[0]![1]}`
  for (let i = 0; i < n; i++) {
    const [px, py] = loop[i]!
    const [qx, qy] = loop[(i + 1) % n]!
    const [tpx, tpy] = tangents[i]!
    const [tqx, tqy] = tangents[(i + 1) % n]!
    d += `C${r(px + tpx!)} ${r(py + tpy!)} ${r(qx - tqx!)} ${r(qy - tqy!)} ${r(qx)} ${r(qy)}`
  }
  return `${d}Z`
}

const OUTLINE = outlinePath(HALF_OUTLINE)

/** The figure is cropped below the calves, the lowest site being the thighs, so it can be drawn larger. */
const VIEW_BOX = '-46 0 92 252'
const FADE_FROM = 222

type ZoneBase = 'abdomen-upper' | 'abdomen-lower' | 'thigh' | 'arm' | 'glute' | 'deltoid'

type Shape =
  | { kind: 'rect'; x: number; y: number; w: number; h: number }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number }

/** Each site's right-hand zone and tap area ([x, y, w, h]); the left one is the mirror. */
const ZONES: Record<ZoneBase, { shape: Shape; hit: readonly [number, number, number, number] }> = {
  // Clear of the navel, at (0, 118).
  'abdomen-upper': { shape: { kind: 'rect', x: 3, y: 101, w: 11, h: 14 }, hit: [0, 94, 22, 24] },
  'abdomen-lower': { shape: { kind: 'rect', x: 3, y: 121, w: 12, h: 15 }, hit: [0, 118, 23, 26] },
  thigh: { shape: { kind: 'ellipse', cx: 14, cy: 182, rx: 6.5, ry: 15 }, hit: [1, 158, 26, 54] },
  deltoid: { shape: { kind: 'ellipse', cx: 32.5, cy: 71, rx: 4.5, ry: 7 }, hit: [24, 56, 20, 32] },
  arm: { shape: { kind: 'ellipse', cx: 33.5, cy: 96, rx: 4.5, ry: 10 }, hit: [25, 80, 20, 36] },
  glute: { shape: { kind: 'ellipse', cx: 13, cy: 148, rx: 8.5, ry: 9 }, hit: [0, 132, 28, 32] },
}

function zoneOf(site: SiteId) {
  const zone = ZONES[site.slice(0, site.lastIndexOf('-')) as ZoneBase]
  const mirror = site.endsWith('-left')
  const flipX = (x: number, w = 0) => (mirror ? -x - w : x)
  const [hx, hy, hw, hh] = zone.hit
  const s = zone.shape
  return {
    hit: { x: flipX(hx, hw), y: hy, width: hw, height: hh },
    shape:
      s.kind === 'rect'
        ? ({ kind: 'rect', x: flipX(s.x, s.w), y: s.y, w: s.w, h: s.h } as const)
        : ({ kind: 'ellipse', cx: flipX(s.cx), cy: s.cy, rx: s.rx, ry: s.ry } as const),
  }
}

export function BodyMap({
  rest,
  selected,
  suggested,
  onSelect,
}: {
  /** The protocol's rotation sites with their rest, in the route's order. */
  rest: readonly SiteRest[]
  selected: SiteId | null
  suggested: SiteId | null
  onSelect: (site: SiteId) => void
}) {
  const { t } = useTranslation()
  const emphasis = restEmphasis(rest)
  const views = (['front', 'back'] as const).filter((view) => rest.some(({ site }) => SITE_VIEW[site] === view))

  return (
    <div className="flex shrink-0 justify-center gap-4">
      {views.map((view) => (
        <Figure
          key={view}
          view={view}
          rest={rest.filter(({ site }) => SITE_VIEW[site] === view)}
          emphasis={emphasis}
          selected={selected}
          suggested={suggested}
          onSelect={onSelect}
          label={(site, restDays) =>
            [t(`sites.${site}`), site === suggested ? t('sites.suggested') : null, restText(restDays, t)].filter(Boolean).join(', ')
          }
        />
      ))}
    </div>
  )
}

function Figure({
  view,
  rest,
  emphasis,
  selected,
  suggested,
  onSelect,
  label,
}: {
  view: 'front' | 'back'
  rest: readonly SiteRest[]
  emphasis: Map<SiteId, number>
  selected: SiteId | null
  suggested: SiteId | null
  onSelect: (site: SiteId) => void
  label: (site: SiteId, restDays: number | null) => string
}) {
  const { t } = useTranslation()
  const fadeId = useId()

  function onKey(e: KeyboardEvent, site: SiteId) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect(site)
    }
  }

  return (
    <figure className="flex w-[min(8.5rem,40vw,22dvh)] flex-col gap-1">
      <figcaption className="text-center text-xs font-semibold text-muted-foreground">
        {view === 'front' ? t('sites.frontView') : t('sites.backView')}
      </figcaption>
      <svg viewBox={VIEW_BOX} role="group" aria-label={view === 'front' ? t('sites.frontView') : t('sites.backView')} className="h-auto w-full">
        <defs>
          {/* Fades the legs out where the crop cuts them. */}
          <linearGradient id={`${fadeId}-g`} x1="0" y1={FADE_FROM} x2="0" y2="252" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="white" />
            <stop offset="1" stopColor="white" stopOpacity="0" />
          </linearGradient>
          <mask id={`${fadeId}-m`} maskUnits="userSpaceOnUse" x="-46" y="0" width="92" height="252">
            <rect x="-46" y="0" width="92" height="252" fill={`url(#${fadeId}-g)`} />
          </mask>
        </defs>

        {/* The figure itself: neutral, so the sites read as the only thing on it. */}
        <g mask={`url(#${fadeId}-m)`} aria-hidden>
          <path d={OUTLINE} className="fill-muted-foreground/[0.13] stroke-muted-foreground/35" strokeWidth={0.8} />
          {view === 'front' ? (
            <circle cx={0} cy={118} r={0.9} className="fill-muted-foreground/40" />
          ) : (
            <path
              d="M0 52V128M0 140V153M2 165Q11 168 21 162M-2 165Q-11 168-21 162"
              className="fill-none stroke-muted-foreground/25"
              strokeWidth={0.7}
              strokeLinecap="round"
            />
          )}
        </g>

        <g className="fill-muted-foreground text-[8px] font-semibold" aria-hidden>
          <text x={-21} y={25} textAnchor="end">
            {t('sites.leftShort')}
          </text>
          <text x={21} y={25}>
            {t('sites.rightShort')}
          </text>
        </g>

        {rest.map(({ site, restDays }) => {
          const { hit, shape } = zoneOf(site)
          const isSelected = site === selected
          const e = emphasis.get(site) ?? 1
          const zoneProps = {
            className: 'fill-primary stroke-primary transition-[fill-opacity,stroke-opacity] duration-150',
            fillOpacity: isSelected ? 1 : 0.06 + 0.6 * e,
            strokeOpacity: isSelected ? 0.35 : 0.2 + 0.7 * e,
            // A wide, faint stroke painted under the fill is the selected halo.
            strokeWidth: isSelected ? 5 : 0.8,
            paintOrder: 'stroke',
            strokeDasharray: site === suggested && !isSelected ? '2 1.5' : undefined,
          }
          return (
            <g
              key={site}
              role="button"
              tabIndex={0}
              aria-label={label(site, restDays)}
              aria-pressed={isSelected}
              className="group cursor-pointer outline-none"
              onClick={() => onSelect(site)}
              onKeyDown={(e) => onKey(e, site)}
            >
              {/* The tap area, outlined only for keyboard focus. */}
              <rect {...hit} rx={4} strokeWidth={1} className="fill-transparent stroke-transparent group-focus-visible:stroke-ring" />
              {shape.kind === 'rect' ? (
                <rect {...zoneProps} x={shape.x} y={shape.y} width={shape.w} height={shape.h} rx={3.5} />
              ) : (
                <ellipse {...zoneProps} cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} />
              )}
            </g>
          )
        })}
      </svg>
    </figure>
  )
}
