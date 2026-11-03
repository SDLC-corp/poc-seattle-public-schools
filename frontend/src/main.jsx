import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import App from './App.jsx'
import AuthProvider from './auth/AuthProvider'
import M365Provider from './auth/M365Provider'
import { initAuth } from './auth/msalConfig'

// Finish a Microsoft sign-in redirect (if any) before the first render
initAuth().finally(() => {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <BrowserRouter>
        <AuthProvider>
          <M365Provider>
            <App />
          </M365Provider>
        </AuthProvider>
      </BrowserRouter>
    </StrictMode>,
  )
})
