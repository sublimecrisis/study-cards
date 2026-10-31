import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'
import { startSync } from './sync'

startSync()

// Ask the browser not to evict our database under storage pressure.
navigator.storage?.persist?.().catch(() => {})

// Installed iPhone apps can hang on to an old version for a long time. Check for a
// new version on launch, whenever the app comes back to the screen, and hourly;
// a found update installs and reloads automatically (registerType: autoUpdate).
registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    if (!reg) return
    const check = () => void reg.update().catch(() => {})
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check())
    setInterval(check, 60 * 60_000)
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
