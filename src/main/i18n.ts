import i18n from 'i18next';
import * as fs from 'fs';
import * as path from 'path';

// Translation files paths
const getTranslationPath = (lang: string, namespace: string): string => {
  // In development, read from src/locales
  // In production, read from dist (bundled by esbuild)
  if (process.env.NODE_ENV === 'development') {
    return path.join(__dirname, '../../src/locales', lang, `${namespace}.json`);
  }
  return path.join(__dirname, '../locales', lang, `${namespace}.json`);
};

// Load translation files
const loadTranslations = (lang: string) => {
  const namespaces = ['common', 'apps', 'settings', 'install', 'logs'];
  const resources: Record<string, any> = {};

  for (const ns of namespaces) {
    try {
      const filePath = getTranslationPath(lang, ns);
      const content = fs.readFileSync(filePath, 'utf-8');
      resources[ns] = JSON.parse(content);
    } catch (error) {
      console.warn(`Failed to load translation file for ${lang}/${ns}:`, error);
      resources[ns] = {};
    }
  }

  return resources;
};

// Initialize i18next for main process
i18n.init({
  lng: 'en', // Default language
  fallbackLng: 'en',
  defaultNS: 'common',
  resources: {
    en: loadTranslations('en'),
    ja: loadTranslations('ja'),
  },
  interpolation: {
    escapeValue: false,
  },
});

// Function to change language from renderer process
export const changeLanguage = (lng: string) => {
  i18n.changeLanguage(lng);
};

// Export i18n instance
export default i18n;
