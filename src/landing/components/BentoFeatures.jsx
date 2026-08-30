import React from 'react';
import { motion } from 'framer-motion';
import { 
  ShoppingCart, 
  Database, 
  UserCheck, 
  RotateCcw, 
  FileText, 
  CheckCircle2, 
  Lock, 
  Layers, 
  Sparkles,
  ArrowRight,
  Cloud,
  PackageCheck,
  SlidersHorizontal,
  CalendarClock
} from 'lucide-react';
import SpotlightCard from '@/components/reactbits/SpotlightCard';
import { useLandingLanguage } from '../context/LandingLanguageContext';

export default function BentoFeatures() {
  const { t } = useLandingLanguage();

  return (
    <section id="features" className="py-24 bg-zinc-950 text-white relative overflow-hidden">
      {/* Background Subtle Ambient Glows */}
      <div className="pointer-events-none absolute top-1/3 left-10 w-96 h-96 bg-emerald-500/10 rounded-full blur-[140px]" />
      <div className="pointer-events-none absolute bottom-10 right-10 w-96 h-96 bg-teal-500/10 rounded-full blur-[140px]" />
      <div className="pointer-events-none absolute top-2/3 right-1/4 w-80 h-80 bg-cyan-500/10 rounded-full blur-[120px]" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono font-medium mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            <span>{t.features.badge}</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white">
            {t.features.title}
          </h2>
          <p className="mt-4 text-zinc-400 text-base leading-relaxed">
            {t.features.subtitle}
          </p>
        </div>

        {/* 8-Card Bento Grid Layout */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: POS-Style Rapid Withdrawal (Span 2 on desktop) */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="md:col-span-2"
          >
            <SpotlightCard
              spotlightColor="rgba(16, 185, 129, 0.18)"
              className="h-full p-6 sm:p-8 flex flex-col justify-between"
            >
              <div>
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-6 shadow-inner">
                  <ShoppingCart className="w-6 h-6" strokeWidth={1.75} />
                </div>
                <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">
                  {t.features.posTitle}
                </h3>
                <p className="text-zinc-400 text-sm leading-relaxed max-w-xl">
                  {t.features.posDesc}
                </p>
              </div>

              {/* Visual Mini POS Card */}
              <div className="mt-6 pt-6 border-t border-white/10 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-xl bg-zinc-950/60 border border-white/5">
                  <div className="text-[11px] font-mono text-zinc-400">{t.features.posFeature1Title}</div>
                  <div className="text-xs font-semibold text-white mt-1">{t.features.posFeature1Desc}</div>
                </div>
                <div className="p-3 rounded-xl bg-zinc-950/60 border border-white/5">
                  <div className="text-[11px] font-mono text-zinc-400">{t.features.posFeature2Title}</div>
                  <div className="text-xs font-semibold text-white mt-1">{t.features.posFeature2Desc}</div>
                </div>
                <div className="p-3 rounded-xl bg-zinc-950/60 border border-white/5">
                  <div className="text-[11px] font-mono text-zinc-400">{t.features.posFeature3Title}</div>
                  <div className="text-xs font-semibold text-emerald-400 mt-1">{t.features.posFeature3Desc}</div>
                </div>
              </div>
            </SpotlightCard>
          </motion.div>

          {/* Card 2: Atomic Row-Locking & Concurrency */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <SpotlightCard
              spotlightColor="rgba(6, 182, 212, 0.18)"
              className="h-full p-6 sm:p-8 flex flex-col justify-between"
            >
              <div>
                <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 mb-6 shadow-inner">
                  <Database className="w-6 h-6" strokeWidth={1.75} />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">
                  {t.features.atomicTitle}
                </h3>
                <p className="text-zinc-400 text-sm leading-relaxed">
                  {t.features.atomicDesc}
                </p>
              </div>

              <div className="mt-6 pt-6 border-t border-white/10">
                <div className="flex items-center gap-2 text-xs font-mono text-cyan-400">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{t.features.atomicBadge}</span>
                </div>
              </div>
            </SpotlightCard>
          </motion.div>

          {/* Card 3: Current Stock Adjustment & Audit Trail (New in v1.3.0) */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.15 }}
          >
            <SpotlightCard
              spotlightColor="rgba(16, 185, 129, 0.18)"
              className="h-full p-6 sm:p-8 flex flex-col justify-between"
            >
              <div>
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-6 shadow-inner">
                  <SlidersHorizontal className="w-6 h-6" strokeWidth={1.75} />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">
                  {t.features.stockAdjustTitle || 'Current Stock Adjustment'}
                </h3>
                <p className="text-zinc-400 text-sm leading-relaxed">
                  {t.features.stockAdjustDesc || 'Direct stock quantity adjustments with global settings toggle, mandatory reason requirement, and audit history.'}
                </p>
              </div>

              <div className="mt-6 pt-6 border-t border-white/10">
                <div className="flex items-center gap-2 text-xs font-mono text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{t.features.stockAdjustBadge || 'Audit Trail & Safety'}</span>
                </div>
              </div>
            </SpotlightCard>
          </motion.div>

          {/* Card 4: Equipment Loans & Return Due Date Extension (New in v1.2.0) */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <SpotlightCard
              spotlightColor="rgba(245, 158, 11, 0.18)"
              className="h-full p-6 sm:p-8 flex flex-col justify-between"
            >
              <div>
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-6 shadow-inner">
                  <CalendarClock className="w-6 h-6" strokeWidth={1.75} />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">
                  {t.features.extendDueDateTitle || 'Return Due Date Extension'}
                </h3>
                <p className="text-zinc-400 text-sm leading-relaxed">
                  {t.features.extendDueDateDesc || 'Extend expected return dates for active loan orders with real-time Overdue-to-Active recalculation.'}
                </p>
              </div>

              <div className="mt-6 pt-6 border-t border-white/10">
                <div className="flex items-center gap-2 text-xs font-mono text-amber-400">
                  <RotateCcw className="w-4 h-4" />
                  <span>{t.features.extendDueDateBadge || 'Realtime Recalculation'}</span>
                </div>
              </div>
            </SpotlightCard>
          </motion.div>

          {/* Card 5: Site Installation Kits (BOM) */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.25 }}
          >
            <SpotlightCard
              spotlightColor="rgba(59, 130, 246, 0.18)"
              className="h-full p-6 sm:p-8 flex flex-col justify-between"
            >
              <div>
                <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 mb-6 shadow-inner">
                  <PackageCheck className="w-6 h-6" strokeWidth={1.75} />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">
                  {t.features.siteKitsTitle}
                </h3>
                <p className="text-zinc-400 text-sm leading-relaxed">
                  {t.features.siteKitsDesc}
                </p>
              </div>

              <div className="mt-6 pt-6 border-t border-white/10">
                <div className="flex items-center gap-2 text-xs font-mono text-blue-400">
                  <Layers className="w-4 h-4" />
                  <span>{t.features.siteKitsBadge}</span>
                </div>
              </div>
            </SpotlightCard>
          </motion.div>

          {/* Card 6: Cloudflare R2 Object Storage */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <SpotlightCard
              spotlightColor="rgba(249, 115, 22, 0.18)"
              className="h-full p-6 sm:p-8 flex flex-col justify-between"
            >
              <div>
                <div className="w-12 h-12 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400 mb-6 shadow-inner">
                  <Cloud className="w-6 h-6" strokeWidth={1.75} />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">
                  {t.features.r2Title}
                </h3>
                <p className="text-zinc-400 text-sm leading-relaxed">
                  {t.features.r2Desc}
                </p>
              </div>

              <div className="mt-6 pt-6 border-t border-white/10">
                <div className="flex items-center gap-2 text-xs font-mono text-orange-400">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{t.features.r2Badge}</span>
                </div>
              </div>
            </SpotlightCard>
          </motion.div>

          {/* Card 7: Granular RBAC & Role Permissions */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.35 }}
          >
            <SpotlightCard
              spotlightColor="rgba(16, 185, 129, 0.18)"
              className="h-full p-6 sm:p-8 flex flex-col justify-between"
            >
              <div>
                <div className="w-12 h-12 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 mb-6 shadow-inner">
                  <UserCheck className="w-6 h-6" strokeWidth={1.75} />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">
                  {t.features.rbacTitle}
                </h3>
                <p className="text-zinc-400 text-sm leading-relaxed">
                  {t.features.rbacDesc}
                </p>
              </div>

              <div className="mt-6 pt-6 border-t border-white/10">
                <div className="flex items-center gap-2 text-xs font-mono text-teal-400">
                  <Lock className="w-4 h-4" />
                  <span>{t.features.rbacBadge}</span>
                </div>
              </div>
            </SpotlightCard>
          </motion.div>

          {/* Card 8: Automated PDF Issue Vouchers (Span 2 or 3 on desktop) */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="md:col-span-2"
          >
            <SpotlightCard
              spotlightColor="rgba(16, 185, 129, 0.15)"
              className="h-full p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-6"
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 flex-shrink-0 shadow-inner">
                  <FileText className="w-6 h-6" strokeWidth={1.75} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white mb-1">
                    {t.features.pdfTitle}
                  </h3>
                  <p className="text-zinc-400 text-sm leading-relaxed max-w-xl">
                    {t.features.pdfDesc}
                  </p>
                </div>
              </div>

              <div className="flex-shrink-0">
                <a
                  href="/login"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-white text-xs font-semibold transition-all hover:scale-105"
                >
                  <span>{t.features.pdfCta}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-emerald-400" />
                </a>
              </div>
            </SpotlightCard>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
