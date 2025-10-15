import React from 'react';
import { createRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { App } from './App';
import i18n from '../i18n';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element not found');
}

// Sync initial language to main process
window.electronAPI.changeLanguage(i18n.language);

const root = createRoot(container);
root.render(
  <React.StrictMode>
    <I18nextProvider i18n={i18n}>
      <App />
    </I18nextProvider>
  </React.StrictMode>
);
