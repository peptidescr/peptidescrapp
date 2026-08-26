import { useTranslation } from 'react-i18next'
import { EmptyState } from '../components/EmptyState'

export function HomeScreen() {
  const { t } = useTranslation()
  return (
    <div className="px-4 pb-6 pt-4">
      <h1 className="mb-4 text-xl font-semibold">{t('nav.home')}</h1>
      <EmptyState title={t('common.loading')} body={t('common.loading')} />
    </div>
  )
}
