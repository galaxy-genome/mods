import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { bootEditor } from './store/editor'

void bootEditor({ search: location.search })
// ?fresh and ?samples act once; a reload must not empty storage again.
const query = new URLSearchParams(location.search)
if (query.has('fresh') || query.has('samples')) {
  query.delete('fresh'); query.delete('samples')
  history.replaceState(history.state, '', location.pathname + (query.size ? `?${query}` : '') + location.hash)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`))
}
