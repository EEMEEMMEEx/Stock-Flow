import { createContext, useContext } from 'react';

export const LandingLanguageContext = createContext(null);

export const useLandingLanguage = () => {
  const context = useContext(LandingLanguageContext);
  if (!context) {
    throw new Error('useLandingLanguage must be used within a LandingLanguageProvider');
  }
  return context;
};
