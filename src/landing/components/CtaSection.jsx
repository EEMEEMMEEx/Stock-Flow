import { ArrowUpRight, ShieldCheck, Zap, Lock } from 'lucide-react';
import { useLandingLanguage } from '../context/LandingLanguageContext';

export default function CtaSection() {
  const { t } = useLandingLanguage();

  return (
    <section className="relative py-28 bg-zinc-950 text-white overflow-hidden border-t border-zinc-800">
      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center flex flex-col items-center">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs font-mono font-medium mb-6 shadow-xs">
          <Zap className="w-3.5 h-3.5 text-emerald-400" />
          <span>{t.cta.badge}</span>
        </div>

        <h2 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white max-w-3xl leading-[1.1]">
          {t.cta.title}
        </h2>

        <p className="mt-6 text-zinc-400 text-base sm:text-lg max-w-xl leading-relaxed">
          {t.cta.subtitle}
        </p>

        <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-4 w-full sm:w-auto">
          <a
            href="https://stockflowth.online"
            className="w-full sm:w-auto flex items-center justify-center gap-2.5 px-8 py-4 rounded-xl font-bold text-sm text-zinc-950 bg-emerald-400 hover:bg-emerald-300 transition-colors shadow-md border border-emerald-300/40 cursor-pointer"
          >
            <span>{t.cta.button}</span>
            <ArrowUpRight className="w-4 h-4" strokeWidth={2.5} />
          </a>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-6 text-xs text-zinc-400 font-mono">
          <div className="flex items-center gap-1.5 bg-zinc-900/60 px-3 py-1 rounded-full border border-zinc-800">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>{t.cta.tenantBadge}</span>
          </div>
          <div className="flex items-center gap-1.5 bg-zinc-900/60 px-3 py-1 rounded-full border border-zinc-800">
            <Lock className="w-3.5 h-3.5 text-emerald-400" />
            <span>{t.cta.secureBadge}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
