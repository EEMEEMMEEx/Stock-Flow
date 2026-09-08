import { createContext } from 'react';

export const LanguageContext = createContext({
  lang: 'th',
  changeLanguage: () => {},
  t: (key) => key,
  languages: [
    { code: 'th', label: 'ไทย', flag: 'TH' },
    { code: 'en', label: 'English', flag: 'EN' },
  ],
  isThai: true,
  isEnglish: false,
});
