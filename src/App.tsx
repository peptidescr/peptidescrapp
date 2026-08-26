import { useTranslation } from 'react-i18next'

// Screens, navigation, and PWA install/update wiring land in later build steps.
// This is the step-1 shell: confirms Tailwind, tokens, and i18n are wired end to end.
function App() {
  const { t } = useTranslation()

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-2 bg-brand-surface-2 px-4 text-center">
      <h1 className="text-2xl font-semibold text-brand-primary">{t('app.name')}</h1>
      <p className="text-brand-muted">{t('common.loading')}</p>
    </div>
  )
}

export default App
