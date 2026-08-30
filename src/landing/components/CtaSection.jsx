import { ArrowUpRight, ShieldCheck, Zap, Lock } from 'lucide-react';
import Squares from '@/components/reactbits/Squares';
import Magnet from '@/components/reactbits/Magnet';
import ShinyText from '@/components/reactbits/ShinyText';
import { useLandingLanguage } from '../context/LandingLanguageContext';

export default function CtaSection() {
  const { t } = useLandingLanguage();

  return (
    <section className="relative py-28 bg-zinc-950 text-white overflow-hidden border-t border-white/10">
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

      {/* Ambient Radial Glow */}
      <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-gradient-to-r from-emerald-500/20 via-teal-500/15 to-cyan-500/10 rounded-full blur-[140px] z-0" />

      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center flex flex-col items-center">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-xs font-mono font-medium mb-6 shadow-md">
          <Zap className="w-3.5 h-3.5" />
          <ShinyText text={t.cta.badge} speed={3} />
        </div>

        <h2 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white max-w-3xl leading-[1.1]">
          {t.cta.title}
        </h2>

        <p className="mt-6 text-zinc-400 text-base sm:text-lg max-w-xl leading-relaxed">
          {t.cta.subtitle}
        </p>

        <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-4 w-full sm:w-auto">
          <Magnet padding={40} magnetStrength={3}>
            <a
              href="/login"
              className="w-full sm:w-auto flex items-center justify-center gap-2.5 px-8 py-4 rounded-xl font-bold text-sm text-zinc-950 bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-400 hover:from-emerald-300 hover:to-teal-200 transition-all duration-200 shadow-2xl shadow-emerald-500/30 hover:shadow-emerald-500/50 hover:scale-[1.03] active:scale-[0.98] border border-emerald-300/40"
            >
              <span>{t.cta.button}</span>
              <ArrowUpRight className="w-4 h-4" strokeWidth={2.5} />
            </a>
          </Magnet>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-6 text-xs text-zinc-400 font-mono">
          <div className="flex items-center gap-1.5 bg-zinc-900/40 px-3 py-1 rounded-full border border-white/5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>{t.cta.tenantBadge}</span>
          </div>
          <div className="flex items-center gap-1.5 bg-zinc-900/40 px-3 py-1 rounded-full border border-white/5">
            <Lock className="w-3.5 h-3.5 text-emerald-400" />
            <span>{t.cta.secureBadge}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
