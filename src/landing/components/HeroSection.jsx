import React from 'react';
import { motion } from 'framer-motion';
import { 
  ArrowUpRight, 
  ChevronDown, 
  CheckCircle2, 
  ScanBarcode, 
  FileText, 
  ShieldCheck, 
  Zap, 
  Boxes, 
  Layers, 
  TrendingUp, 
  UserCheck 
} from 'lucide-react';
import Squares from '@/components/reactbits/Squares';
import DecryptedText from '@/components/reactbits/DecryptedText';
import ShinyText from '@/components/reactbits/ShinyText';
import Magnet from '@/components/reactbits/Magnet';
import TiltedCard from '@/components/reactbits/TiltedCard';
import { useLandingLanguage } from '../context/LandingLanguageContext';

export default function HeroSection() {
  const { t, lang } = useLandingLanguage();

  return (
    <section className="relative min-h-[92dvh] flex flex-col justify-center items-center pt-28 pb-16 px-4 sm:px-6 lg:px-8 overflow-hidden bg-zinc-950 text-white">
      {/* Background Interactive Squares Grid */}
      <div className="absolute inset-0 z-0 opacity-40">
        <Squares
          direction="diagonal"
          speed={0.3}
          squareSize={48}
          borderColor="rgba(255, 255, 255, 0.05)"
          hoverFillColor="rgba(16, 185, 129, 0.12)"
        />
      </div>

      {/* Radial Gradient Ambient Lighting */}
      <div className="pointer-events-none absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-gradient-to-tr from-emerald-500/20 to-teal-500/10 rounded-full blur-[120px] z-0" />
      <div className="pointer-events-none absolute top-1/2 right-10 w-[300px] h-[300px] bg-cyan-500/10 rounded-full blur-[100px] z-0" />

      <div className="relative z-10 max-w-5xl mx-auto text-center flex flex-col items-center">
        {/* Top Status & Announcement Pill */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-zinc-900/80 border border-emerald-500/30 backdrop-blur-md mb-6 shadow-lg shadow-emerald-500/5"
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <ShinyText
            text={t.hero.pill}
            speed={3.5}
            className="text-[11px] font-mono uppercase tracking-widest font-semibold text-emerald-300"
          />
        </motion.div>

        {/* Main Display Headline with Decrypted Text */}
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1 }}
          className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white max-w-4xl leading-[1.08]"
        >
          <span>{t.hero.headlinePrefix}</span>
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400">
            <DecryptedText
              key={lang}
              text={t.hero.headlineDynamic}
              speed={45}
              maxIterations={14}
              animateOn="view"
              className="inline-block"
            />
          </span>
        </motion.h1>

        {/* Value Proposition Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="mt-6 text-base sm:text-lg text-zinc-400 max-w-2xl font-normal leading-relaxed"
        >
          {t.hero.subtitle}
        </motion.p>

        {/* Dual High-Conversion Call To Actions */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.3 }}
          className="mt-8 flex flex-wrap items-center justify-center gap-4"
        >
          <Magnet padding={40} magnetStrength={3}>
            <a
              href="https://stockflowth.online"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 px-6 py-3.5 rounded-xl font-semibold text-sm text-zinc-950 bg-gradient-to-r from-emerald-400 to-teal-400 hover:from-emerald-300 hover:to-teal-300 transition-all duration-200 shadow-xl shadow-emerald-500/25 hover:shadow-emerald-500/40 hover:scale-[1.02] active:scale-[0.98]"
            >
              <span>{t.hero.launchCta}</span>
              <ArrowUpRight className="w-4 h-4" strokeWidth={2.5} />
            </a>
          </Magnet>

          <a
            href="#features"
            className="flex items-center gap-2 px-5 py-3.5 rounded-xl font-medium text-sm text-zinc-300 bg-zinc-900/80 hover:bg-zinc-800 border border-white/10 hover:border-white/20 transition-all duration-200 backdrop-blur-sm"
          >
            <span>{t.hero.exploreCta}</span>
            <ChevronDown className="w-4 h-4 text-emerald-400" strokeWidth={2} />
          </a>
        </motion.div>

        {/* Trust Badges Minimal Row */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.45 }}
          className="mt-8 flex flex-wrap items-center justify-center gap-6 text-xs text-zinc-400 font-mono"
        >
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" strokeWidth={2} />
            <span>{t.hero.badgeZeroRace}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-cyan-400" strokeWidth={2} />
            <span>{t.hero.badgeAtomic}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-emerald-400" strokeWidth={2} />
            <span>{t.hero.badgePdf}</span>
          </div>
        </motion.div>
      </div>

      {/* Interactive UI Mockup Showcase with TiltedCard */}
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, delay: 0.4 }}
        className="relative z-10 mt-14 w-full max-w-5xl mx-auto px-2"
      >
        <TiltedCard maxTilt={6} className="w-full">
          <div className="w-full bg-zinc-950/90 border border-white/15 rounded-2xl p-4 sm:p-6 shadow-2xl backdrop-blur-2xl">
            {/* Window header */}
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-white/10">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500/80" />
                <div className="w-3 h-3 rounded-full bg-amber-500/80" />
                <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
                <span className="ml-2 text-xs font-mono text-zinc-400">
                  {t.hero.mockupTitle}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                  {t.hero.mockupAtomicStatus}
                </span>
              </div>
            </div>

            {/* Mockup Body: Split POS interface */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              {/* Left Column: Quick Search & Material Catalog */}
              <div className="md:col-span-7 flex flex-col gap-3">
                {/* Search Bar */}
                <div className="flex items-center gap-2 bg-zinc-900/80 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-zinc-400">
                  <ScanBarcode className="w-4 h-4 text-emerald-400" strokeWidth={2} />
                  <span className="text-zinc-500 font-mono">{t.hero.mockupSearchPlaceholder}</span>
                </div>

                {/* Material Catalog Items */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="p-3 rounded-xl bg-zinc-900/50 border border-white/10 hover:border-emerald-500/30 transition-colors">
                    <div className="flex items-start justify-between">
                      <span className="text-xs font-medium text-white">Cisco Catalyst 9200L</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                        {t.hero.mockupInStock}: 14
                      </span>
                    </div>
                    <span className="text-[11px] text-zinc-400 mt-1 block">SKU: NET-CS-9200</span>
                    <div className="mt-2.5 flex items-center justify-between text-[11px]">
                      <span className="text-zinc-400">Lot: DOPA-2026-Q1</span>
                      <button className="px-2 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-medium transition-colors">
                        {t.hero.mockupAddPos}
                      </button>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-zinc-900/50 border border-white/10 hover:border-emerald-500/30 transition-colors">
                    <div className="flex items-start justify-between">
                      <span className="text-xs font-medium text-white">Hikvision IP PTZ Camera</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                        {t.hero.mockupInStock}: 28
                      </span>
                    </div>
                    <span className="text-[11px] text-zinc-400 mt-1 block">SKU: CAM-HK-4K</span>
                    <div className="mt-2.5 flex items-center justify-between text-[11px]">
                      <span className="text-zinc-400">Lot: USO-2026-MAIN</span>
                      <button className="px-2 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-medium transition-colors">
                        {t.hero.mockupAddPos}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Audit & Transaction Realtime Bar */}
                <div className="p-3 rounded-xl bg-zinc-900/30 border border-white/5 flex items-center justify-between text-xs text-zinc-400 font-mono">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{t.hero.mockupLedgerSynced}</span>
                  </div>
                  <span className="text-emerald-400">{t.hero.mockupLatency}: 28ms</span>
                </div>
              </div>

              {/* Right Column: Checkout Cart & Instant Voucher Generation */}
              <div className="md:col-span-5 bg-zinc-900/60 border border-white/10 rounded-xl p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10">
                    <span className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-1.5">
                      <Boxes className="w-3.5 h-3.5 text-emerald-400" />
                      {t.hero.mockupCartTitle} (2 Items)
                    </span>
                    <span className="text-[11px] font-mono text-zinc-400">TX #9842</span>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between items-center py-1 border-b border-white/5">
                      <span className="text-zinc-300">Cisco Catalyst 9200L</span>
                      <span className="font-mono text-emerald-400 font-semibold">x 2 {t.hero.mockupUnits}</span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-white/5">
                      <span className="text-zinc-300">Hikvision IP Camera</span>
                      <span className="font-mono text-emerald-400 font-semibold">x 4 {t.hero.mockupUnits}</span>
                    </div>
                  </div>

                  <div className="mt-3 p-2 rounded-lg bg-zinc-950/60 border border-white/5 text-[11px] text-zinc-400 space-y-1">
                    <div className="flex justify-between">
                      <span>{t.hero.mockupProject}:</span>
                      <span className="text-zinc-200 font-medium">USO Phase 3 / DOPA</span>
                    </div>
                    <div className="flex justify-between">
                      <span>{t.hero.mockupRequester}:</span>
                      <span className="text-zinc-200 font-medium">Engineer S. Watchara</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-white/10 flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-white">
                    <span>{t.hero.mockupValidation}:</span>
                    <span className="text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {t.hero.mockupLocksAcquired}
                    </span>
                  </div>

                  <button className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-emerald-500 text-zinc-950 font-semibold text-xs shadow-lg shadow-emerald-500/20">
                    <FileText className="w-3.5 h-3.5" />
                    <span>{t.hero.mockupConfirmPrint}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </TiltedCard>
      </motion.div>
    </section>
  );
}
