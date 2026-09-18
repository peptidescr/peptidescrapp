import { PenLine, Search, Sparkles } from 'lucide-react'
import { motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { getCompoundById } from '../content/compounds'
import { PROTOCOL_TEMPLATES, type ProtocolTemplate } from '../content/protocolTemplates'
import { formatDecimal, type Locale } from '../lib/units'

interface TemplatePickerProps {
  onSelectTemplate: (template: ProtocolTemplate) => void
  onSelectCustom: () => void
}

/**
 * Shown before creating a new protocol: pick a starter template or go custom.
 *
 * Categories aren't stored on the templates themselves — they're read off the
 * template's compound, which already carries one. That keeps a single source
 * of truth: adding a compound to a new category makes its templates filterable
 * with no second list to remember to update.
 */
export function TemplatePicker({ onSelectTemplate, onSelectCustom }: TemplatePickerProps) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language as Locale
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string | null>(null)

  const categories = useMemo(() => {
    const seen = new Set<string>()
    for (const template of PROTOCOL_TEMPLATES) {
      const c = getCompoundById(template.compoundId)?.category
      if (c) seen.add(c)
    }
    return [...seen].sort((a, b) => a.localeCompare(b))
  }, [])

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return PROTOCOL_TEMPLATES.filter((template) => {
      const compound = getCompoundById(template.compoundId)
      if (category && compound?.category !== category) return false
      if (!needle) return true
      // Match the translated name too, so searching "sueño" finds the sleep
      // template in Spanish rather than only matching the English compound id.
      const haystack = `${t(template.nameKey)} ${compound?.name ?? ''} ${compound?.category ?? ''}`.toLowerCase()
      return haystack.includes(needle)
    })
  }, [query, category, t])

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={onSelectCustom}
        className="flex min-h-11 items-start gap-3 rounded-2xl border-2 border-dashed border-primary px-4 py-4 text-left"
      >
        <PenLine className="mt-0.5 size-5 shrink-0 text-primary" />
        <div>
          <p className="font-medium text-primary">{t('templates.custom')}</p>
          <p className="text-sm text-muted-foreground">{t('templates.customDescription')}</p>
        </div>
      </button>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('templates.searchPlaceholder')}
          className="pl-10"
        />
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <FilterChip label={t('templates.filterAll')} active={category === null} onClick={() => setCategory(null)} />
        {categories.map((c) => (
          <FilterChip key={c} label={c} active={category === c} onClick={() => setCategory(c)} />
        ))}
      </div>

      <p className="text-xs text-muted-foreground">{t('templates.resultCount', { count: results.length })}</p>

      <div className="flex flex-col gap-3">
        {results.map((template, index) => {
          const compound = getCompoundById(template.compoundId)
          return (
            <motion.button
              key={template.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15, delay: Math.min(index, 6) * 0.03 }}
              type="button"
              onClick={() => onSelectTemplate(template)}
              className="flex min-h-11 items-start gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-left shadow-sm"
            >
              <Sparkles className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="font-medium text-foreground">{t(template.nameKey)}</p>
                <p className="text-sm text-muted-foreground">
                  {compound?.name} · {formatDecimal(template.doseAmount, locale, 2)} {template.doseUnit} ·{' '}
                  {t(`schedule.${template.schedule.kind}`)}
                </p>
              </div>
            </motion.button>
          )
        })}

        {results.length === 0 && (
          <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            {t('templates.noResults')}
          </p>
        )}
      </div>
    </div>
  )
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-9 shrink-0 whitespace-nowrap rounded-full border px-3 text-sm transition-colors ${
        active ? 'border-primary bg-accent text-primary' : 'border-border text-muted-foreground'
      }`}
    >
      {label}
    </button>
  )
}
