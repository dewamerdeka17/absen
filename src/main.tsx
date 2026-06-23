import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './LiveApp'
import './styles.css'
import './mobile-fixes.css'
import './login.css'
import './live.css'
import './native.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
