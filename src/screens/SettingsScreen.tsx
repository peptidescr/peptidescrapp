import { useTranslation } from 'react-i18next'

export function SettingsScreen() {
  const { t } = useTranslation()
  return (
    <div className="px-4 pb-6 pt-4">
      <h1 className="mb-4 text-xl font-semibold">{t('nav.settings')}</h1>
    </div>
  )
}
