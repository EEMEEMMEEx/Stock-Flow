import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './App.css'
import { initVitePreloadErrorHandler } from './lib/chunkErrorRecovery'
import { initI18n } from './i18n/i18n'

// Listen for stale Vite chunks and auto-reload with sessionStorage anti-loop protection
initVitePreloadErrorHandler();

initI18n().then(() => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
