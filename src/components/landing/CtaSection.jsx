import React from 'react';
import { motion } from 'framer-motion';
import { ArrowUpRight, ShieldCheck, Zap, Lock } from 'lucide-react';
import Squares from '../reactbits/Squares';
import Magnet from '../reactbits/Magnet';
import ShinyText from '../reactbits/ShinyText';

export default function CtaSection() {
  return (
    <section className="relative py-24 bg-zinc-950 text-white overflow-hidden border-t border-white/10">
      {/* Background Interactive Squares */}
      <div className="absolute inset-0 z-0 opacity-30">
        <Squares
          direction="up"
          speed={0.4}
          squareSize={40}
          borderColor="rgba(255, 255, 255, 0.06)"
          hoverFillColor="rgba(16, 185, 129, 0.2)"
        />
      </div>

      {/* Ambient Glow */}
      <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] bg-emerald-500/15 rounded-full blur-[120px] z-0" />

      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center flex flex-col items-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono font-medium mb-6">
          <Zap className="w-3.5 h-3.5" />
          <ShinyText text="INSTANT PRODUCTION ACCESS" speed={3} />
        </div>

        <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white max-w-2xl leading-tight">
          Ready to Elevate Your Material & Inventory Flow?
        </h2>

        <p className="mt-6 text-zinc-400 text-base sm:text-lg max-w-xl leading-relaxed">
          เริ่มต้นจัดการคลังพัสดุ เบิกจ่ายด้วย POS และควบคุมสต็อกแบบ Atomic Transaction ได้ทันทีผ่านเว็บแอปพลิเคชัน Stock-Flow
        </p>

        <div className="mt-8 flex flex-col sm:flex-row items-center gap-4">
          <Magnet padding={40} magnetStrength={3}>
            <a
              href="https://stock-flow-pi-coral.vercel.app"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-8 py-4 rounded-xl font-bold text-sm text-zinc-950 bg-gradient-to-r from-emerald-400 to-teal-400 hover:from-emerald-300 hover:to-teal-300 transition-all duration-200 shadow-2xl shadow-emerald-500/30 hover:shadow-emerald-500/50 hover:scale-[1.03] active:scale-[0.98]"
            >
              <span>Launch Stock-Flow App</span>
              <ArrowUpRight className="w-4 h-4" strokeWidth={2.5} />
            </a>
          </Magnet>
        </div>

        <div className="mt-8 flex items-center justify-center gap-6 text-xs text-zinc-400 font-mono">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Multi-Tenant Ready</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-emerald-400" />
            <span>Secure Authentication</span>
          </div>
        </div>
      </div>
    </section>
  );
}
