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
   * SSOT translate function powered by i18next
   * Supports:
   * 1. t('page.section.element')
   * 2. t('key', { count: 5 })
   * 3. t('key', 'Default English fallback', { count: 5 })
   */
  const t = useCallback(
    (key, paramsOrOptions, maybeOptions) => {
      if (!key || typeof key !== 'string') return '';
      let options = {};
      if (typeof paramsOrOptions === 'string') {
        // Handle 3-arg call: t(key, fallbackString, optionsObject)
        if (maybeOptions && typeof maybeOptions === 'object') {
          options = { ...maybeOptions, defaultValue: paramsOrOptions };
        } else {
          options = { defaultValue: paramsOrOptions };
        }
      } else if (paramsOrOptions && typeof paramsOrOptions === 'object') {
        // Handle 2-arg call: t(key, optionsObject)
        options = { ...paramsOrOptions };
      }
      return i18n.t(key, options);
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
