import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Import translation files
import commonEn from '../locales/en/common.json';
import appsEn from '../locales/en/apps.json';
import settingsEn from '../locales/en/settings.json';
import installEn from '../locales/en/install.json';
import logsEn from '../locales/en/logs.json';

import commonJa from '../locales/ja/common.json';
import appsJa from '../locales/ja/apps.json';
import settingsJa from '../locales/ja/settings.json';
import installJa from '../locales/ja/install.json';
import logsJa from '../locales/ja/logs.json';

// Get saved language from localStorage, default to English
const getInitialLanguage = (): string => {
  try {
    return localStorage.getItem('language') || 'en';
  } catch {
    return 'en';
  }
};

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        common: commonEn,
        apps: appsEn,
        settings: settingsEn,
        install: installEn,
        logs: logsEn,
      },
      ja: {
        common: commonJa,
        apps: appsJa,
        settings: settingsJa,
        install: installJa,
        logs: logsJa,
      },
    },
    lng: getInitialLanguage(),
    fallbackLng: 'en',
    defaultNS: 'common',
    interpolation: {
      escapeValue: false, // React already escapes values
    },
  });

// Save language preference to localStorage when it changes
i18n.on('languageChanged', (lng) => {
  try {
    localStorage.setItem('language', lng);
  } catch (error) {
    console.error('Failed to save language preference:', error);
  }
});

export default i18n;
