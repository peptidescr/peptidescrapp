import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './i18n'
import './index.css'
import App from './App.tsx'
import { startCustomCompoundSync } from './lib/customCompounds'
import { startStoreCompoundSync } from './lib/storeCatalogue'

startCustomCompoundSync()
startStoreCompoundSync()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
