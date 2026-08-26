import { PenLine, Sparkles } from 'lucide-react'
import { motion } from 'motion/react'
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
        className="flex min-h-11 items-start gap-3 rounded-2xl border-2 border-dashed border-primary px-4 py-4 text-left"
      >
        <PenLine className="mt-0.5 size-5 shrink-0 text-primary" />
        <div>
          <p className="font-medium text-primary">{t('templates.custom')}</p>
          <p className="text-sm text-muted-foreground">{t('templates.customDescription')}</p>
        </div>
      </button>

      <div className="flex flex-col gap-3">
        {PROTOCOL_TEMPLATES.map((template, index) => {
          const compound = getCompoundById(template.compoundId)
          return (
            <motion.button
              key={template.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15, delay: index * 0.03 }}
              type="button"
              onClick={() => onSelectTemplate(template)}
              className="flex min-h-11 items-start gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-left shadow-sm"
            >
              <Sparkles className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
              <div>
                <p className="font-medium text-foreground">{t(template.nameKey)}</p>
                <p className="text-sm text-muted-foreground">
                  {compound?.name} · {formatDecimal(template.doseAmount, locale, 2)} {template.doseUnit} ·{' '}
                  {t(`schedule.${template.schedule.kind}`)}
                </p>
              </div>
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}
