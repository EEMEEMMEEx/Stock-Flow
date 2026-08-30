import React, { useState } from 'react';
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
  SlidersHorizontal,
  CalendarClock,
  PackageCheck,
  TrendingUp,
  Sparkles
} from 'lucide-react';
import Squares from '@/components/reactbits/Squares';
import DecryptedText from '@/components/reactbits/DecryptedText';
import ShinyText from '@/components/reactbits/ShinyText';
import Magnet from '@/components/reactbits/Magnet';
import TiltedCard from '@/components/reactbits/TiltedCard';
import { useLandingLanguage } from '../context/LandingLanguageContext';

export default function HeroSection() {
  const { t, lang } = useLandingLanguage();
  const [activeTab, setActiveTab] = useState('pos'); // 'pos' | 'stock' | 'duedate' | 'sitekits'

  // Interactive local states for mockup simulations
  const mockStockQty = 14;
  const [mockNewStockQty, setMockNewStockQty] = useState('20');
  const [mockStockReason, setMockStockReason] = useState('ตรวจนับสต็อกประจำงวด');
  const [mockDueDate, setMockDueDate] = useState('2026-09-15');

  return (
    <section className="relative min-h-[94dvh] flex flex-col justify-center items-center pt-28 pb-16 px-4 sm:px-6 lg:px-8 overflow-hidden bg-zinc-950 text-white">
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
      <div className="pointer-events-none absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[650px] h-[380px] bg-gradient-to-tr from-emerald-500/20 via-teal-500/15 to-cyan-500/10 rounded-full blur-[130px] z-0" />
      <div className="pointer-events-none absolute top-1/2 right-10 w-[320px] h-[320px] bg-cyan-500/10 rounded-full blur-[100px] z-0" />
      <div className="pointer-events-none absolute bottom-10 left-10 w-[300px] h-[300px] bg-emerald-600/10 rounded-full blur-[110px] z-0" />

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
              href="/login"
              className="flex items-center gap-2.5 px-6 py-3.5 rounded-xl font-semibold text-sm text-zinc-950 bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-400 hover:from-emerald-300 hover:to-teal-200 transition-all duration-200 shadow-xl shadow-emerald-500/25 hover:shadow-emerald-500/40 hover:scale-[1.02] active:scale-[0.98] border border-emerald-300/40"
            >
              <span>{t.hero.launchCta}</span>
              <ArrowUpRight className="w-4 h-4" strokeWidth={2.5} />
            </a>
          </Magnet>

          <a
            href="#simulator"
            className="flex items-center gap-2 px-5 py-3.5 rounded-xl font-medium text-sm text-zinc-300 bg-zinc-900/80 hover:bg-zinc-800 border border-white/10 hover:border-emerald-500/30 transition-all duration-200 backdrop-blur-sm shadow-sm"
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
          <div className="flex items-center gap-1.5 bg-zinc-900/40 px-3 py-1 rounded-full border border-white/5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" strokeWidth={2} />
            <span>{t.hero.badgeZeroRace}</span>
          </div>
          <div className="flex items-center gap-1.5 bg-zinc-900/40 px-3 py-1 rounded-full border border-white/5">
            <Zap className="w-3.5 h-3.5 text-cyan-400" strokeWidth={2} />
            <span>{t.hero.badgeAtomic}</span>
          </div>
          <div className="flex items-center gap-1.5 bg-zinc-900/40 px-3 py-1 rounded-full border border-white/5">
            <FileText className="w-3.5 h-3.5 text-emerald-400" strokeWidth={2} />
            <span>{t.hero.badgePdf}</span>
          </div>
        </motion.div>
      </div>

      {/* Interactive UI Mockup Showcase with 4 Tabs & TiltedCard */}
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, delay: 0.4 }}
        className="relative z-10 mt-12 w-full max-w-5xl mx-auto px-2"
      >
        <TiltedCard maxTilt={5} className="w-full">
          <div className="w-full bg-zinc-950/95 border border-white/15 rounded-2xl p-4 sm:p-6 shadow-2xl backdrop-blur-2xl">
            {/* Window header with Tab Switcher */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-4 border-b border-white/10">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500/80" />
                <div className="w-3 h-3 rounded-full bg-amber-500/80" />
                <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
                <span className="ml-2 text-xs font-mono text-zinc-400">
                  stockflow-terminal://{activeTab}
                </span>
              </div>

              {/* Mockup Interactive Navigation Tabs */}
              <div className="flex items-center gap-1 bg-zinc-900/80 p-1 rounded-xl border border-white/10 overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setActiveTab('pos')}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                    activeTab === 'pos' 
                      ? 'bg-emerald-500 text-zinc-950 font-semibold shadow-xs' 
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <span>{t.hero.tabPos || '🛒 POS Dispatch'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('stock')}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                    activeTab === 'stock' 
                      ? 'bg-emerald-500 text-zinc-950 font-semibold shadow-xs' 
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <span>{t.hero.tabStockAdjust || '📦 Stock Adjust'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('duedate')}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                    activeTab === 'duedate' 
                      ? 'bg-emerald-500 text-zinc-950 font-semibold shadow-xs' 
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <span>{t.hero.tabDueDate || '⏱️ Extend Due Date'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('sitekits')}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                    activeTab === 'sitekits' 
                      ? 'bg-emerald-500 text-zinc-950 font-semibold shadow-xs' 
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <span>{t.hero.tabSiteKits || '📋 Site Kits BOM'}</span>
                </button>
              </div>
            </div>

            {/* Tab 1: POS-Style Rapid Dispatch */}
            {activeTab === 'pos' && (
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 animate-in fade-in duration-200">
                {/* Left Column: Quick Search & Material Catalog */}
                <div className="md:col-span-7 flex flex-col gap-3">
                  <div className="flex items-center gap-2 bg-zinc-900/80 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-zinc-400">
                    <ScanBarcode className="w-4 h-4 text-emerald-400" strokeWidth={2} />
                    <span className="text-zinc-400 font-mono">{t.hero.mockupSearchPlaceholder}</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div className="p-3 rounded-xl bg-zinc-900/50 border border-white/10 hover:border-emerald-500/30 transition-colors">
                      <div className="flex items-start justify-between">
                        <span className="text-xs font-medium text-white">Cisco Catalyst 9200L</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                          {t.hero.mockupInStock}: 14
                        </span>
                      </div>
                      <span className="text-[11px] text-zinc-400 mt-1 block font-mono">SKU: NET-CS-9200</span>
                      <div className="mt-2.5 flex items-center justify-between text-[11px]">
                        <span className="text-zinc-400">Project: DOPA Q1</span>
                        <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-medium">
                          {t.hero.mockupAddPos}
                        </span>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-zinc-900/50 border border-white/10 hover:border-emerald-500/30 transition-colors">
                      <div className="flex items-start justify-between">
                        <span className="text-xs font-medium text-white">Hikvision IP PTZ 4K</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                          {t.hero.mockupInStock}: 28
                        </span>
                      </div>
                      <span className="text-[11px] text-zinc-400 mt-1 block font-mono">SKU: CAM-HK-4K</span>
                      <div className="mt-2.5 flex items-center justify-between text-[11px]">
                        <span className="text-zinc-400">Project: USO Phase 3</span>
                        <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-medium">
                          {t.hero.mockupAddPos}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-zinc-900/30 border border-white/5 flex items-center justify-between text-xs text-zinc-400 font-mono">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{t.hero.mockupLedgerSynced}</span>
                    </div>
                    <span className="text-emerald-400 font-bold">{t.hero.mockupLatency}: 28ms</span>
                  </div>
                </div>

                {/* Right Column: Checkout Cart */}
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
                        <span className="text-zinc-300">Hikvision IP PTZ Camera</span>
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

                    <a
                      href="/login"
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-emerald-400 text-zinc-950 font-bold text-xs shadow-lg shadow-emerald-500/20 hover:bg-emerald-300 transition-colors"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>{t.hero.mockupConfirmPrint}</span>
                    </a>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: Current Stock Adjustment & Audit Trail (New in v1.3.0) */}
            {activeTab === 'stock' && (
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 animate-in fade-in duration-200">
                <div className="md:col-span-7 bg-zinc-900/50 border border-white/10 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <SlidersHorizontal className="w-4 h-4 text-emerald-400" />
                      <span>Edit Master Item / ปรับยอดสต็อกคงเหลือปัจจุบัน</span>
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                      SETTING: ENABLED
                    </span>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="p-2.5 rounded-xl bg-zinc-950/60 border border-white/5">
                      <span className="text-zinc-400 text-[11px] block">รายการวัสดุ (Item Catalog)</span>
                      <span className="font-bold text-white">Fortinet FortiGate 60F Security Gateway</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="p-2.5 rounded-xl bg-zinc-950/60 border border-white/5">
                        <span className="text-zinc-400 text-[10px]">สต็อกเดิม (Current Stock)</span>
                        <div className="text-sm font-mono font-bold text-zinc-300">{mockStockQty} ชิ้น</div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-emerald-950/30 border border-emerald-500/30">
                        <span className="text-emerald-300 text-[10px] font-bold">ยอดใหม่ (New Stock)</span>
                        <input
                          type="number"
                          value={mockNewStockQty}
                          onChange={(e) => setMockNewStockQty(e.target.value)}
                          className="w-full bg-zinc-900 border border-white/10 rounded px-2 py-0.5 text-xs font-mono font-bold text-white focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-zinc-950/60 border border-white/5 space-y-1">
                      <span className="text-[10px] text-zinc-400 font-bold flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-amber-400" />
                        <span>เหตุผลในการปรับปรุงยอดสต็อก (Mandatory Reason) *</span>
                      </span>
                      <input
                        type="text"
                        value={mockStockReason}
                        onChange={(e) => setMockStockReason(e.target.value)}
                        className="w-full bg-zinc-900 border border-white/10 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="md:col-span-5 bg-zinc-900/60 border border-white/10 rounded-xl p-4 flex flex-col justify-between">
                  <div>
                    <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5 pb-2 mb-2 border-b border-white/10">
                      <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Audit Trail Preview</span>
                    </span>
                    <div className="space-y-2 text-xs font-mono">
                      <div className="flex justify-between py-1 border-b border-white/5">
                        <span className="text-zinc-400">Previous Qty:</span>
                        <span className="text-zinc-200">{mockStockQty}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-white/5">
                        <span className="text-zinc-400">New Target Qty:</span>
                        <span className="text-emerald-400 font-bold">{mockNewStockQty}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-white/5">
                        <span className="text-zinc-400">Difference (Delta):</span>
                        <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                          +{Number(mockNewStockQty || 0) - mockStockQty} Units
                        </span>
                      </div>
                      <div className="text-[11px] text-zinc-400 pt-1 font-sans">
                        RPC: <code className="text-emerald-300 font-mono">adjust_item_current_stock()</code>
                      </div>
                    </div>
                  </div>

                  <a
                    href="/login"
                    className="w-full mt-3 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-emerald-400 text-zinc-950 font-bold text-xs shadow-lg shadow-emerald-500/20 hover:bg-emerald-300 transition-colors"
                  >
                    <span>บันทึก & อัปเดต Ledger</span>
                  </a>
                </div>
              </div>
            )}

            {/* Tab 3: Return Due Date Extension (New in v1.2.0) */}
            {activeTab === 'duedate' && (
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 animate-in fade-in duration-200">
                <div className="md:col-span-7 bg-zinc-900/50 border border-white/10 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <CalendarClock className="w-4 h-4 text-amber-400" />
                      <span>Active Loan / ขยายกำหนดวันส่งคืนเครื่องมือ</span>
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                      RECALCULATED: NORMAL
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-zinc-950/60 border border-white/5 space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-zinc-400">อุปกรณ์ที่ยืม:</span>
                      <span className="text-white font-semibold">Fluke DSX-8000 CableAnalyzer</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-400">ผู้ยืม:</span>
                      <span className="text-zinc-300">นายสมศักดิ์ วิศวกรโครงการ</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-400">กำหนดคืนเดิม:</span>
                      <span className="text-rose-400 font-mono font-bold">2026-08-28 (Overdue)</span>
                    </div>
                  </div>

                  <div className="space-y-1 text-xs">
                    <label className="text-[11px] font-semibold text-zinc-300">เลือกกำหนดส่งคืนใหม่ (New Due Date):</label>
                    <div className="flex gap-2">
                      <input
                        type="date"
                        value={mockDueDate}
                        onChange={(e) => setMockDueDate(e.target.value)}
                        className="bg-zinc-900 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white font-mono flex-1 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setMockDueDate('2026-09-30')}
                        className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-[11px] font-mono text-zinc-200 border border-white/10"
                      >
                        +30 วัน
                      </button>
                    </div>
                  </div>
                </div>

                <div className="md:col-span-5 bg-zinc-900/60 border border-white/10 rounded-xl p-4 flex flex-col justify-between">
                  <div>
                    <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5 pb-2 mb-2 border-b border-white/10">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Extension Log Tracked</span>
                    </span>
                    <div className="space-y-2 text-xs font-mono">
                      <div className="p-2 rounded-lg bg-emerald-950/20 border border-emerald-500/20 text-emerald-300 text-[11px]">
                        ✓ สถานะจะเปลี่ยนจาก <span className="text-rose-400">Overdue</span> กลับเป็น <span className="text-emerald-400">Active</span> โดยอัตโนมัติ
                      </div>
                      <div className="text-[11px] text-zinc-400 pt-1 font-sans">
                        บันทึกลงตาราง <code className="text-emerald-300 font-mono">checkout_extension_logs</code> และ Audit Trail
                      </div>
                    </div>
                  </div>

                  <a
                    href="/login"
                    className="w-full mt-3 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-emerald-400 text-zinc-950 font-bold text-xs shadow-lg shadow-emerald-500/20 hover:bg-emerald-300 transition-colors"
                  >
                    <span>ยืนยันขยายกำหนดวันส่งคืน</span>
                  </a>
                </div>
              </div>
            )}

            {/* Tab 4: Site Installation Kits (BOM) */}
            {activeTab === 'sitekits' && (
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 animate-in fade-in duration-200">
                <div className="md:col-span-7 bg-zinc-900/50 border border-white/10 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <PackageCheck className="w-4 h-4 text-blue-400" />
                      <span>Site Kits BOM / ชุดติดตั้งไซต์งานสำเร็จรูป</span>
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-bold">
                      READY FOR 4 SITES
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between items-center p-2 rounded-lg bg-zinc-950/60 border border-white/5 font-mono">
                      <span>1. Cisco Switch (1 per site)</span>
                      <span className="text-emerald-400 font-bold">In Stock: 14 pcs (✓)</span>
                    </div>
                    <div className="flex justify-between items-center p-2 rounded-lg bg-zinc-950/60 border border-white/5 font-mono">
                      <span>2. IP PTZ Camera (4 per site)</span>
                      <span className="text-emerald-400 font-bold">In Stock: 28 pcs (✓)</span>
                    </div>
                    <div className="flex justify-between items-center p-2 rounded-lg bg-zinc-950/60 border border-white/5 font-mono">
                      <span>3. Cat6 Patch Cord (10 per site)</span>
                      <span className="text-amber-400 font-bold">In Stock: 42 pcs (Bottleneck)</span>
                    </div>
                  </div>
                </div>

                <div className="md:col-span-5 bg-zinc-900/60 border border-white/10 rounded-xl p-4 flex flex-col justify-between">
                  <div>
                    <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5 pb-2 mb-2 border-b border-white/10">
                      <Boxes className="w-3.5 h-3.5 text-blue-400" />
                      <span>BOM Dispatch Engine</span>
                    </span>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      คำนวณความพร้อมของชุดติดตั้งตามสูตร BOM อัตโนมัติ พร้อมตรวจจับพัสดุที่เป็นคอขวด (Bottleneck) ก่อนเบิกจริง
                    </p>
                  </div>

                  <a
                    href="/login"
                    className="w-full mt-3 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-emerald-400 text-zinc-950 font-bold text-xs shadow-lg shadow-emerald-500/20 hover:bg-emerald-300 transition-colors"
                  >
                    <span>สร้างชุดเบิกไซต์งาน</span>
                  </a>
                </div>
              </div>
            )}
          </div>
        </TiltedCard>
      </motion.div>
    </section>
  );
}
