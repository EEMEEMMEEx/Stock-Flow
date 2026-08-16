import React, { useState, useRef, useEffect } from 'react';
import { Globe, ChevronDown, Check } from 'lucide-react';
import { useLandingLanguage } from '@/contexts/LandingLanguageContext';

export default function LanguageSwitcher({ className = '' }) {
  const { lang, setLang, supportedLanguages } = useLandingLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const activeLang = supportedLanguages.find((l) => l.code === lang) || supportedLanguages[0];

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={dropdownRef} className={`relative inline-block text-left ${className}`}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-900/80 hover:bg-zinc-800 border border-white/10 text-xs font-medium text-zinc-300 hover:text-white transition-all backdrop-blur-md focus:outline-none focus:ring-1 focus:ring-emerald-400"
        aria-label="Change language"
      >
        <Globe className="w-3.5 h-3.5 text-emerald-400" strokeWidth={1.75} />
        <span className="font-semibold uppercase tracking-wider font-mono text-[11px]">
          {activeLang.code}
        </span>
        <span className="text-zinc-400 text-xs hidden sm:inline-block">({activeLang.label})</span>
        <ChevronDown className={`w-3 h-3 text-zinc-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-zinc-950/95 border border-white/10 shadow-2xl shadow-black/80 backdrop-blur-2xl py-2 z-50 animate-in fade-in zoom-in-95 duration-150">
          <div className="px-3 py-1.5 border-b border-white/5 mb-1 flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-400">
              Select Language / ພາສາ
            </span>
            <span className="text-[10px] font-mono text-emerald-400">i18n</span>
          </div>

          <div className="max-h-72 overflow-y-auto py-1 scrollbar-thin scrollbar-thumb-zinc-700">
            {supportedLanguages.map((item) => {
              const isSelected = item.code === lang;
              return (
                <button
                  key={item.code}
                  onClick={() => {
                    setLang(item.code);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left transition-colors ${
                    isSelected
                      ? 'bg-emerald-500/10 text-emerald-300 font-semibold'
                      : 'text-zinc-300 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    {/* SVG Badge */}
                    <span className={`w-7 h-5 rounded flex items-center justify-center font-mono text-[10px] uppercase font-bold border ${
                      isSelected
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                        : 'bg-zinc-900 text-zinc-400 border-white/5'
                    }`}>
                      {item.code}
                    </span>
                    <div className="flex flex-col">
                      <span className="font-medium text-xs leading-none">{item.label}</span>
                      <span className="text-[10px] text-zinc-400 leading-none mt-1">{item.name}</span>
                    </div>
                  </div>

                  {isSelected && (
                    <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" strokeWidth={2.5} />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
