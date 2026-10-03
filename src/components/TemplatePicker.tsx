import { ChevronRight, PenLine, Search, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { compareAlphabetical, getCompoundById } from '../content/compounds'
import { PROTOCOL_TEMPLATES } from '../content/protocolTemplates'
import { scheduleSummary } from '../lib/cycleText'
import { db, type UserTemplate } from '../lib/db'
import { formatDecimal, type Locale } from '../lib/units'
import { useLiveQuery } from '../lib/useLiveQuery'
import {
  deleteUserTemplate,
  prefillFromBuiltIn,
  prefillFromUserTemplate,
  type ProtocolPrefill,
} from '../lib/userTemplates'

interface TemplatePickerProps {
  onSelectTemplate: (template: ProtocolPrefill) => void
  onSelectCustom: () => void
}

/** Text the search matches for a template: its name, its compound's names and category. */
function haystackFor(name: string, compoundId: string): string {
  const compound = getCompoundById(compoundId)
  // The compound's other names too: the store may call it something else ("GLP-1" for Retatrutide).
  return `${name} ${compound?.name ?? ''} ${compound?.aliases?.join(' ') ?? ''} ${compound?.category ?? ''}`.toLowerCase()
}

/**
 * Shown before creating a new protocol: the user's own saved templates, then
 * the built-in starter templates, or go custom. Either kind becomes a
 * ProtocolPrefill, so the form has one way in.
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
  const [confirmDelete, setConfirmDelete] = useState<UserTemplate | null>(null)
  const userTemplates = useLiveQuery(() => db.userTemplates.toArray(), [])

  const categories = useMemo(() => {
    const seen = new Set<string>()
    for (const compoundId of [...PROTOCOL_TEMPLATES, ...(userTemplates ?? [])].map((tpl) => tpl.compoundId)) {
      const c = getCompoundById(compoundId)?.category
      if (c) seen.add(c)
    }
    return [...seen].sort(compareAlphabetical)
  }, [userTemplates])

  const needle = query.trim().toLowerCase()
  const matches = (name: string, compoundId: string) =>
    (!category || getCompoundById(compoundId)?.category === category) && (!needle || haystackFor(name, compoundId).includes(needle))

  // A couple of dozen templates at most: filtering on every render costs nothing.
  const mine = (userTemplates ?? [])
    .filter((tpl) => matches(tpl.name, tpl.compoundId))
    .sort((a, b) => compareAlphabetical(a.name, b.name))
  const builtIn = PROTOCOL_TEMPLATES.filter((tpl) => matches(t(tpl.nameKey), tpl.compoundId)).sort((a, b) =>
    compareAlphabetical(t(a.nameKey), t(b.nameKey)),
  )
  const total = mine.length + builtIn.length

  function summary(compoundId: string, doseAmount: number, doseUnit: string, schedule: ProtocolPrefill['schedule'], stepped: boolean) {
    const compound = getCompoundById(compoundId)
    return `${compound?.name ?? ''} · ${formatDecimal(doseAmount, locale, 2)} ${doseUnit}${stepped ? ` ${t('templates.stepped')}` : ''} · ${scheduleSummary(schedule, t)}`
  }

  async function handleDelete(template: UserTemplate) {
    setConfirmDelete(null)
    await deleteUserTemplate(template.id)
    toast.success(t('templates.deleted'))
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={onSelectCustom}
        className="flex min-h-11 items-start gap-3 rounded-2xl bg-accent px-4 py-4 text-left"
      >
        <PenLine className="mt-0.5 size-5 shrink-0 text-primary" />
        <div>
          <p className="font-semibold text-primary">{t('templates.custom')}</p>
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

      <p className="text-xs text-muted-foreground">{t('templates.resultCount', { count: total })}</p>

      {mine.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-muted-foreground">{t('templates.mine')}</h3>
          <Card className="divide-y divide-border overflow-hidden">
            {mine.map((template) => (
              <div key={template.id} className="flex items-center">
                <button
                  type="button"
                  onClick={() => onSelectTemplate(prefillFromUserTemplate(template))}
                  className="flex min-h-14 min-w-0 flex-1 items-center gap-3 py-3 pl-4 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-foreground">{template.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {summary(template.compoundId, template.doseAmount, template.doseUnit, template.schedule, !!template.titration)}
                    </p>
                  </div>
                </button>
                <button
                  type="button"
                  aria-label={t('templates.deleteLabel', { name: template.name })}
                  onClick={() => setConfirmDelete(template)}
                  className="flex size-11 shrink-0 items-center justify-center text-muted-foreground"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </Card>
        </section>
      )}

      {builtIn.length > 0 && (
        <section className="flex flex-col gap-2">
          {mine.length > 0 && <h3 className="text-sm font-semibold text-muted-foreground">{t('templates.builtIn')}</h3>}
          <Card className="divide-y divide-border overflow-hidden">
            {builtIn.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => onSelectTemplate(prefillFromBuiltIn(template, t))}
                className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-foreground">{t(template.nameKey)}</p>
                  <p className="text-sm text-muted-foreground">
                    {summary(template.compoundId, template.doseAmount, template.doseUnit, template.schedule, false)}
                  </p>
                </div>
                <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </Card>
        </section>
      )}

      {total === 0 && (
        <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          {t('templates.noResults')}
        </p>
      )}

      <AlertDialog open={confirmDelete !== null} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('templates.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('templates.deleteBody', { name: confirmDelete?.name ?? '' })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => confirmDelete && void handleDelete(confirmDelete)}>
              {t('common.delete')}
            </AlertDialogAction>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
