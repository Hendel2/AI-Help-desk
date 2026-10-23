import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from '@/App'

import '@fontsource-variable/plus-jakarta-sans'
import '@fontsource-variable/space-grotesk'
import '@/index.css'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element "#root" not found in index.html.')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
