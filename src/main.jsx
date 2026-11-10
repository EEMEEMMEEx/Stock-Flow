import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './App.css'
import { initVitePreloadErrorHandler } from './lib/chunkErrorRecovery'

// Listen for stale Vite chunks and auto-reload with sessionStorage anti-loop protection
initVitePreloadErrorHandler();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
