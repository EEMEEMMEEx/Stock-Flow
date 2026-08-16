import React from 'react';
import { motion } from 'framer-motion';
import { Zap, ShieldCheck, Database, Lock } from 'lucide-react';
import ShinyText from '../reactbits/ShinyText';
import { useLandingLanguage } from '@/contexts/LandingLanguageContext';

export default function StatsSection() {
  const { t } = useLandingLanguage();

  const stats = [
    {
      value: t.stats.stat1Value,
      label: t.stats.stat1Label,
      description: t.stats.stat1Desc,
      icon: Zap,
    },
    {
      value: t.stats.stat2Value,
      label: t.stats.stat2Label,
      description: t.stats.stat2Desc,
      icon: Database,
    },
    {
      value: t.stats.stat3Value,
      label: t.stats.stat3Label,
      description: t.stats.stat3Desc,
      icon: ShieldCheck,
    },
    {
      value: t.stats.stat4Value,
      label: t.stats.stat4Label,
      description: t.stats.stat4Desc,
      icon: Lock,
    },
  ];

  return (
    <section className="relative py-14 bg-zinc-950/80 border-y border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="p-5 rounded-2xl bg-zinc-900/40 border border-white/5 backdrop-blur-sm flex flex-col justify-between"
              >
                <div>
                  <div className="w-9 h-9 rounded-xl bg-zinc-800/80 border border-white/10 flex items-center justify-center mb-4 text-emerald-400">
                    <Icon className="w-4 h-4" strokeWidth={2} />
                  </div>
                  <div className="text-2xl sm:text-3xl font-extrabold tracking-tight font-mono text-white mb-1">
                    <ShinyText text={stat.value} speed={4} shimmerColor="#34d399" />
                  </div>
                  <div className="text-sm font-semibold text-zinc-200">{stat.label}</div>
                </div>
                <div className="mt-3 text-xs text-zinc-400 leading-relaxed">
                  {stat.description}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
