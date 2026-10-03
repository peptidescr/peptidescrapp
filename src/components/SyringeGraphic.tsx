import { useTranslation } from 'react-i18next'
import { layoutSyringe } from '../lib/syringe'
import { formatSyringeUnits, type Locale, type SyringeType } from '../lib/units'

/**
 * A to-scale picture of the draw: the barrel for this syringe type, its
 * graduations, and the plunger pulled back to the reading — so the number
 * can be checked against the syringe in hand. Geometry lives in
 * src/lib/syringe.ts; this only draws it.
 *
 * Colours come from theme tokens only, so it matches either brand in either
 * theme. `tone="hero"` is for the calculator's dark brand-art result panel,
 * where everything else is white-on-colour too.
 */
export function SyringeGraphic({
  drawUnits,
  syringeType,
  tone = 'surface',
  className = '',
}: {
  drawUnits: number
  syringeType: SyringeType
  tone?: 'surface' | 'hero'
  className?: string
}) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language as Locale
  const layout = layoutSyringe(syringeType, drawUnits)

  // Barrel spans x 40..276 in a 320-wide viewBox; needle to the left, plunger rod to the right.
  const barrelStart = 40
  const barrelLength = 236
  const barrelTop = 14
  const barrelHeight = 26
  const midY = barrelTop + barrelHeight / 2
  const xFor = (units: number) => barrelStart + (units / layout.capacityUnits) * barrelLength
  const fillEnd = barrelStart + layout.fillFraction * barrelLength

  const c =
    tone === 'hero'
      ? {
          outline: 'stroke-white/75',
          liquid: 'fill-white/35',
          tick: 'stroke-white/60',
          label: 'fill-white/70',
          plunger: 'fill-white/85',
          rod: 'stroke-white/75',
          marker: 'stroke-white',
        }
      : {
          outline: 'stroke-foreground/60',
          liquid: 'fill-primary/35',
          tick: 'stroke-muted-foreground',
          label: 'fill-muted-foreground',
          plunger: 'fill-foreground/70',
          rod: 'stroke-foreground/60',
          marker: 'stroke-primary',
        }

  const units = formatSyringeUnits(drawUnits, locale)

  return (
    <figure className={`flex flex-col gap-1 ${className}`}>
      <svg
        viewBox="0 0 320 64"
        role="img"
        aria-label={t('syringe.aria', { units, capacity: layout.capacityUnits, syringeType })}
        className="h-auto w-full"
      >
        {/* Needle and hub */}
        <line x1={4} y1={midY} x2={30} y2={midY} strokeWidth={1.5} className={c.rod} />
        <rect
          x={30}
          y={midY - 5}
          width={10}
          height={10}
          rx={1.5}
          strokeWidth={1.5}
          className={`fill-none ${c.outline}`}
        />

        {/* Liquid, from the needle end up to the reading */}
        {layout.fillFraction > 0 && (
          <rect
            x={barrelStart}
            y={barrelTop}
            width={fillEnd - barrelStart}
            height={barrelHeight}
            className={c.liquid}
          />
        )}

        {/* Graduations along the top edge, major ones numbered underneath */}
        {layout.ticks.map((tick) => (
          <line
            key={tick.units}
            x1={xFor(tick.units)}
            x2={xFor(tick.units)}
            y1={barrelTop}
            y2={barrelTop + (tick.major ? 10 : 5)}
            strokeWidth={tick.major ? 1.2 : 0.8}
            className={c.tick}
          />
        ))}
        {layout.ticks
          .filter((tick) => tick.major)
          .map((tick) => (
            <text
              key={tick.units}
              x={xFor(tick.units)}
              y={56}
              textAnchor="middle"
              fontSize={8.5}
              className={c.label}
            >
              {tick.units}
            </text>
          ))}

        {/* Barrel outline, drawn over the liquid so its edge stays crisp */}
        <rect
          x={barrelStart}
          y={barrelTop}
          width={barrelLength}
          height={barrelHeight}
          rx={3}
          strokeWidth={1.5}
          className={`fill-none ${c.outline}`}
        />

        {/* Plunger: stopper at the reading, rod out past the barrel, thumb press */}
        <rect
          x={fillEnd}
          y={barrelTop + 1}
          width={5}
          height={barrelHeight - 2}
          rx={1}
          className={c.plunger}
        />
        <line x1={fillEnd + 5} y1={midY} x2={302} y2={midY} strokeWidth={2} className={c.rod} />
        <rect
          x={302}
          y={barrelTop - 2}
          width={5}
          height={barrelHeight + 4}
          rx={1.5}
          className={c.plunger}
        />

        {/* The reading itself */}
        <line
          x1={fillEnd}
          x2={fillEnd}
          y1={barrelTop - 4}
          y2={barrelTop + barrelHeight + 4}
          strokeWidth={2}
          className={c.marker}
        />
      </svg>
      {layout.overflow && (
        <figcaption
          className={`text-xs ${tone === 'hero' ? 'text-white/80' : 'text-muted-foreground'}`}
        >
          {t('syringe.overflow', { capacity: layout.capacityUnits })}
        </figcaption>
      )}
    </figure>
  )
}
