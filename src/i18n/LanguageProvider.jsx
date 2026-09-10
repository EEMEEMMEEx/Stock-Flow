import { useState, useEffect, useCallback, useMemo } from 'react';
import { I18nextProvider } from 'react-i18next';
import i18n, { LOCAL_STORAGE_KEY, SUPPORTED_LANGUAGES } from './i18n';
import { LanguageContext } from './LanguageContext';

export const LanguageProvider = ({ children }) => {
  const [lang, setLang] = useState(i18n.language || 'th');

  useEffect(() => {
    const handleLanguageChanged = (newLang) => {
      setLang(newLang);
    };

    i18n.on('languageChanged', handleLanguageChanged);
    return () => {
      i18n.off('languageChanged', handleLanguageChanged);
    };
  }, []);

  const changeLanguage = useCallback((newLang) => {
    if (newLang && (newLang === 'th' || newLang === 'en')) {
      i18n.changeLanguage(newLang);
      setLang(newLang);
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, newLang);
        window.dispatchEvent(new CustomEvent('app-language-change', { detail: { lang: newLang } }));
      } catch (e) {
        console.warn('Could not save language to localStorage:', e);
      }
    }
  }, []);

  /**
   * Unified translate function powered by i18next
   * Supports:
   * 1. t('key')
   * 2. t('key', 'Default fallback text')
   * 3. t('key', { name: 'John' })
   * 4. t('key', { count: 5 }, 'Fallback text')
   */
  const t = useCallback(
    (key, paramsOrDefault, defaultVal) => {
      if (!key || typeof key !== 'string') return '';

      let options = {};
      if (paramsOrDefault && typeof paramsOrDefault === 'object') {
        options = { ...paramsOrDefault };
        if (typeof defaultVal === 'string') {
          options.defaultValue = defaultVal;
        }
      } else if (typeof paramsOrDefault === 'string') {
        options.defaultValue = paramsOrDefault;
      }

      const translated = i18n.t(key, options);
      // If i18next returned the key because it is missing, and fallback was provided, use fallback
      if (translated === key && options.defaultValue) {
        return options.defaultValue;
      }

      return translated;
    },
    []
  );

  const contextValue = useMemo(
    () => ({
      lang,
      changeLanguage,
      t,
      languages: SUPPORTED_LANGUAGES,
      isThai: lang === 'th',
      isEnglish: lang === 'en',
      i18n,
    }),
    [lang, changeLanguage, t]
  );

  return (
    <I18nextProvider i18n={i18n}>
      <LanguageContext.Provider value={contextValue}>
        {children}
      </LanguageContext.Provider>
    </I18nextProvider>
  );
};

export default LanguageProvider;
