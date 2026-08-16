import React, { createContext, useContext, useState, useEffect } from 'react';
import { SUPPORTED_LANGUAGES, landingTranslations } from '@/lib/landing-translations';

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

  const t = landingTranslations[lang] || landingTranslations.th;

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
