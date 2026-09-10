import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import th from './locales/th';
import en from './locales/en';

export const LOCAL_STORAGE_KEY = 'stockflow.app.lang';

export const SUPPORTED_LANGUAGES = [
  { code: 'th', label: 'ไทย', flag: 'TH' },
  { code: 'en', label: 'English', flag: 'EN' },
];

export const getInitialLanguage = () => {
  try {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (saved && (saved === 'th' || saved === 'en')) {
      return saved;
    }
    if (typeof navigator !== 'undefined' && navigator.language) {
      const code = navigator.language.slice(0, 2).toLowerCase();
      if (code === 'th' || code === 'en') {
        return code;
      }
    }
  } catch (e) {
    console.warn('Could not read language from localStorage:', e);
  }
  return 'th';
};

i18n
  .use(initReactI18next)
  .init({
    resources: {
      th: { translation: th },
      en: { translation: en },
    },
    lng: getInitialLanguage(),
    fallbackLng: 'th',
    interpolation: {
      escapeValue: false, // React already escapes values
    },
    keySeparator: '.',
    nsSeparator: false,
    returnNull: false,
    returnEmptyString: false,
  });

export default i18n;
