import React, { useState, useEffect } from 'react';
import { ArrowUpRight, ShieldCheck, Layers, Cpu, Compass, Menu, X } from 'lucide-react';
import LanguageSwitcher from './LanguageSwitcher';
import { useLandingLanguage } from '@/contexts/LandingLanguageContext';

export default function LandingNavbar() {
  const { t } = useLandingLanguage();
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { label: t.nav.features, href: '#features', icon: Layers },
    { label: t.nav.workflows, href: '#workflows', icon: Compass },
    { label: t.nav.architecture, href: '#architecture', icon: Cpu },
    { label: t.nav.security, href: '#security', icon: ShieldCheck },
  ];

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled
          ? 'bg-zinc-950/80 backdrop-blur-xl border-b border-white/10 shadow-lg shadow-black/40 py-3.5'
          : 'bg-transparent py-5'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
        {/* Brand Logo with Strict SVG */}
        <a href="#" className="flex items-center gap-3 group shrink-0">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center shadow-lg shadow-emerald-500/20 ring-1 ring-white/20 group-hover:scale-105 transition-transform duration-200">
            <svg
              className="w-5 h-5 text-white"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
              <path d="m3.3 7 8.7 5 8.7-5" />
              <path d="M12 22V12" />
              <path d="m16 14 3 3-3 3" />
            </svg>
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg tracking-tight text-white font-sans">
                Stock<span className="text-emerald-400">-Flow</span>
              </span>
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                v1.0
              </span>
            </div>
            <span className="text-[11px] text-zinc-400 -mt-0.5 tracking-wide">
              Inventory & Material OS
            </span>
          </div>
        </a>

        {/* Desktop Navigation */}
        <nav className="hidden lg:flex items-center gap-1 bg-zinc-900/60 border border-white/10 rounded-full px-4 py-1.5 backdrop-blur-md">
          {navLinks.map((link) => {
            const Icon = link.icon;
            return (
              <a
                key={link.label}
                href={link.href}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:text-white rounded-full transition-colors duration-150 hover:bg-white/5"
              >
                <Icon className="w-3.5 h-3.5 text-emerald-400" strokeWidth={1.75} />
                {link.label}
              </a>
            );
          })}
        </nav>

        {/* Actions: Multi-language Switcher & CTA Launch Web App button */}
        <div className="hidden sm:flex items-center gap-3">
          <LanguageSwitcher />

          <a
            href="https://stock-flow-pi-coral.vercel.app"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-zinc-950 bg-emerald-400 hover:bg-emerald-300 transition-all duration-200 shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 hover:scale-[1.02] active:scale-[0.98]"
          >
            <span>{t.nav.launchApp}</span>
            <ArrowUpRight className="w-4 h-4" strokeWidth={2.2} />
          </a>
        </div>

        {/* Mobile menu toggle and compact language switcher */}
        <div className="flex sm:hidden items-center gap-2">
          <LanguageSwitcher />
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-lg bg-zinc-900 border border-white/10 text-zinc-400 hover:text-white"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? (
              <X className="w-5 h-5" strokeWidth={2} />
            ) : (
              <Menu className="w-5 h-5" strokeWidth={2} />
            )}
          </button>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div className="lg:hidden px-4 pt-3 pb-6 bg-zinc-950/95 border-b border-white/10 backdrop-blur-2xl">
          <div className="flex flex-col gap-2">
            {navLinks.map((link) => {
              const Icon = link.icon;
              return (
                <a
                  key={link.label}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-zinc-200 hover:bg-white/5"
                >
                  <Icon className="w-4 h-4 text-emerald-400" strokeWidth={2} />
                  {link.label}
                </a>
              );
            })}
            <div className="pt-2 border-t border-white/10 mt-1 flex flex-col gap-2">
              <a
                href="https://stock-flow-pi-coral.vercel.app"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-zinc-950 bg-emerald-400 hover:bg-emerald-300"
              >
                <span>{t.nav.launchApp}</span>
                <ArrowUpRight className="w-4 h-4" strokeWidth={2.2} />
              </a>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
