import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
// Tipografías servidas desde el propio sitio (la CSP no permite Google Fonts).
import '@fontsource-variable/inter'
import '@fontsource-variable/source-serif-4'
import '@/index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
