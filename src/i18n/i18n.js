import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

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

const detectorOptions = {
  order: ['localStorage', 'navigator', 'htmlTag'],
  lookupLocalStorage: LOCAL_STORAGE_KEY,
  caches: ['localStorage'],
  checkWhitelist: true,
};

const loadLocaleData = async (lng) => {
  const validLng = lng === 'en' ? 'en' : 'th';
  const mod = validLng === 'en' ? await import('./locales/en') : await import('./locales/th');
  return mod.default;
};

export const ensureLocaleLoaded = async (lng) => {
  const validLng = lng === 'en' ? 'en' : 'th';
  if (!i18n.hasResourceBundle(validLng, 'translation')) {
    const data = await loadLocaleData(validLng);
    i18n.addResourceBundle(validLng, 'translation', data, true, true);
  }
};

let initPromise = null;

export const initI18n = () => {
  if (!initPromise) {
    const initialLng = getInitialLanguage();
    initPromise = (async () => {
      const initialData = await loadLocaleData(initialLng);
      await i18n
        .use(LanguageDetector)
        .use(initReactI18next)
        .init({
          resources: {
            [initialLng]: { translation: initialData },
          },
          detection: detectorOptions,
          supportedLngs: ['th', 'en'],
          lng: initialLng,
          fallbackLng: 'en',
          interpolation: {
            escapeValue: false, // React already escapes values
          },
          keySeparator: '.',
          nsSeparator: false,
          returnNull: false,
          returnEmptyString: false,
        });
    })();
  }
  return initPromise;
};

// Synchronize document <html lang="..."> and data-lang attribute on change
const syncHtmlLanguage = (lng) => {
  if (typeof document !== 'undefined') {
    const validLng = lng === 'en' ? 'en' : 'th';
    document.documentElement.lang = validLng;
    document.documentElement.setAttribute('data-lang', validLng);
  }
};

syncHtmlLanguage(i18n.language || getInitialLanguage());

i18n.on('languageChanged', (lng) => {
  syncHtmlLanguage(lng);
});

export default i18n;
