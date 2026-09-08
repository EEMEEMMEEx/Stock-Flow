import { useState, useCallback, useMemo } from 'react';
import { LanguageContext } from './LanguageContext';
import en from './locales/en';
import th from './locales/th';

const LOCAL_STORAGE_KEY = 'stockflow.app.lang';

const translations = {
  en,
  th,
};

const SUPPORTED_LANGUAGES = [
  { code: 'th', label: 'ไทย', flag: 'TH' },
  { code: 'en', label: 'English', flag: 'EN' },
];

/**
 * Resolves a dot-notation key (e.g. 'nav.dashboard') within an object
 */
function resolvePath(obj, path) {
  if (!obj || !path) return undefined;
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

/**
 * Interpolates variables in a string e.g. "Hello {name}" or "Hello {{name}}"
 */
function interpolate(template, params) {
  if (typeof template !== 'string' || !params || typeof params !== 'object') {
    return template;
  }
  return template.replace(/\{\{?(\w+)\}?\}/g, (match, key) => {
    return params[key] !== undefined ? params[key] : match;
  });
}

export const LanguageProvider = ({ children }) => {
  const [lang, setLang] = useState(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved && translations[saved]) {
        return saved;
      }
      // Detect browser language if supported
      if (typeof navigator !== 'undefined' && navigator.language) {
        const code = navigator.language.slice(0, 2).toLowerCase();
        if (translations[code]) {
          return code;
        }
      }
    } catch (e) {
      console.warn('Could not read language from localStorage:', e);
    }
    return 'th'; // Default to Thai
  });

  const changeLanguage = useCallback((newLang) => {
    if (translations[newLang]) {
      setLang(newLang);
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, newLang);
        // Dispatch custom event for non-react listeners if needed
        window.dispatchEvent(new CustomEvent('app-language-change', { detail: { lang: newLang } }));
      } catch (e) {
        console.warn('Could not save language to localStorage:', e);
      }
    }
  }, []);

  /**
   * Translate function supporting dot-notation, fallback language, and parameter interpolation
   */
  const t = useCallback(
    (key, paramsOrDefault, defaultVal) => {
      if (!key || typeof key !== 'string') return '';

      let params = null;
      let fallbackText = '';

      if (paramsOrDefault && typeof paramsOrDefault === 'object') {
        params = paramsOrDefault;
        fallbackText = typeof defaultVal === 'string' ? defaultVal : '';
      } else if (typeof paramsOrDefault === 'string') {
        fallbackText = paramsOrDefault;
      }

      const activeDict = translations[lang] || translations.th;
      const fallbackDict = lang === 'th' ? translations.en : translations.th;

      let value = resolvePath(activeDict, key);

      // Fallback to alternate dictionary if missing in active
      if (value === undefined || value === null) {
        value = resolvePath(fallbackDict, key);
      }

      // If still missing, fallback to supplied fallback text, or return the key itself
      if (value === undefined || value === null) {
        return fallbackText || key;
      }

      if (typeof value === 'string' && params) {
        return interpolate(value, params);
      }

      return value;
    },
    [lang]
  );

  const contextValue = useMemo(
    () => ({
      lang,
      changeLanguage,
      t,
      languages: SUPPORTED_LANGUAGES,
      isThai: lang === 'th',
      isEnglish: lang === 'en',
    }),
    [lang, changeLanguage, t]
  );

  return <LanguageContext.Provider value={contextValue}>{children}</LanguageContext.Provider>;
};
