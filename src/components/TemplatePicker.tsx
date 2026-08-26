import { useTranslation } from 'react-i18next'
import { getCompoundById } from '../content/compounds'
import { PROTOCOL_TEMPLATES, type ProtocolTemplate } from '../content/protocolTemplates'
import { formatDecimal, type Locale } from '../lib/units'

interface TemplatePickerProps {
  onSelectTemplate: (template: ProtocolTemplate) => void
  onSelectCustom: () => void
}

/** Shown before creating a new protocol: pick a starter template or go custom. */
export function TemplatePicker({ onSelectTemplate, onSelectCustom }: TemplatePickerProps) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language as Locale

  return (
    <div className="flex flex-col gap-4 px-4 pb-6 pt-4">
      <h1 className="text-xl font-semibold">{t('templates.pickerTitle')}</h1>

      <button
        type="button"
        onClick={onSelectCustom}
        className="min-h-11 rounded-2xl border-2 border-dashed border-brand-primary px-4 py-4 text-left"
      >
        <p className="font-medium text-brand-primary">{t('templates.custom')}</p>
        <p className="text-sm text-brand-muted">{t('templates.customDescription')}</p>
      </button>

      <div className="flex flex-col gap-3">
        {PROTOCOL_TEMPLATES.map((template) => {
          const compound = getCompoundById(template.compoundId)
          return (
            <button
              key={template.id}
              type="button"
              onClick={() => onSelectTemplate(template)}
              className="min-h-11 rounded-2xl border border-brand-border bg-brand-surface px-4 py-3 text-left"
            >
              <p className="font-medium text-brand-ink">{t(template.nameKey)}</p>
              <p className="text-sm text-brand-muted">
                {compound?.name} · {formatDecimal(template.doseAmount, locale, 2)} {template.doseUnit} ·{' '}
                {t(`schedule.${template.schedule.kind}`)}
              </p>
            </button>
          )
        })}
      </div>
    </div>
  )
}
