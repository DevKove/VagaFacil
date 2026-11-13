import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import './portal-title-adjustments.css';

// Detecta iPhone, iPad e iPadOS (que pode se identificar como macOS).
const isAppleMobile =
  /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
document.documentElement.classList.toggle('ios-device', isAppleMobile);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((error: unknown) => {
      console.error('Falha ao registrar o Service Worker:', error);
    });
  });
}
