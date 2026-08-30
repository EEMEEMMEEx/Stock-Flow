import React, { createContext, useContext, useState, useEffect } from 'react';
import { SUPPORTED_LANGUAGES, landingTranslations } from '../data/landing-translations';

const LandingLanguageContext = createContext(null);

export const LandingLanguageProvider = ({ children }) => {
  const [lang, setLang] = useState(() => {
    try {
      const saved = localStorage.getItem('stockflow.landing.lang');
      if (saved && landingTranslations[saved]) {
        return saved;
      }
      // Auto-detect browser language if available
      const browserLang = navigator.language?.slice(0, 2)?.toLowerCase();
      if (browserLang && landingTranslations[browserLang]) {
        return browserLang;
      }
    } catch (e) {
      console.error('Failed to read landing language', e);
    }
    return 'th'; // Default to Thai (TH)
  });

  const changeLanguage = (newLang) => {
    if (landingTranslations[newLang]) {
      setLang(newLang);
      try {
        localStorage.setItem('stockflow.landing.lang', newLang);
      } catch (e) {
        console.error('Failed to save landing language', e);
      }
    }
  };

  const rawT = landingTranslations[lang] || landingTranslations.th;
  const fallbackT = landingTranslations.th;

  // Safe recursive fallback proxy so any missing translation key gracefully resolves to Thai fallback
  const createSafeProxy = (current, fallback) => {
    return new Proxy(current || {}, {
      get(obj, prop) {
        if (prop in obj && obj[prop] !== undefined) {
          if (typeof obj[prop] === 'object' && obj[prop] !== null && !Array.isArray(obj[prop])) {
            return createSafeProxy(obj[prop], fallback?.[prop] || {});
          }
          return obj[prop];
        }
        if (fallback && prop in fallback && fallback[prop] !== undefined) {
          if (typeof fallback[prop] === 'object' && fallback[prop] !== null && !Array.isArray(fallback[prop])) {
            return createSafeProxy(fallback[prop], {});
          }
          return fallback[prop];
        }
        return '';
      }
    });
  };

  const t = createSafeProxy(rawT, fallbackT);

  return (
    <LandingLanguageContext.Provider value={{ lang, setLang: changeLanguage, t, supportedLanguages: SUPPORTED_LANGUAGES }}>
      {children}
    </LandingLanguageContext.Provider>
  );
};

export const useLandingLanguage = () => {
  const context = useContext(LandingLanguageContext);
  if (!context) {
    throw new Error('useLandingLanguage must be used within a LandingLanguageProvider');
  }
  return context;
};
