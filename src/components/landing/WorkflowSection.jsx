import React from 'react';
import { motion } from 'framer-motion';
import { 
  PackagePlus, 
  Warehouse, 
  ShoppingCart, 
  FileCheck2, 
  Sparkles,
  CheckCircle2
} from 'lucide-react';
import { useLandingLanguage } from '@/contexts/LandingLanguageContext';

export default function WorkflowSection() {
  const { t } = useLandingLanguage();

  const steps = [
    {
      step: '01',
      title: t.workflows.step1Title,
      description: t.workflows.step1Desc,
      icon: PackagePlus,
      tag: t.workflows.step1Tag,
    },
    {
      step: '02',
      title: t.workflows.step2Title,
      description: t.workflows.step2Desc,
      icon: Warehouse,
      tag: t.workflows.step2Tag,
    },
    {
      step: '03',
      title: t.workflows.step3Title,
      description: t.workflows.step3Desc,
      icon: ShoppingCart,
      tag: t.workflows.step3Tag,
    },
    {
      step: '04',
      title: t.workflows.step4Title,
      description: t.workflows.step4Desc,
      icon: FileCheck2,
      tag: t.workflows.step4Tag,
    },
  ];

  return (
    <section id="workflows" className="py-24 bg-zinc-950/90 border-t border-white/10 text-white relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono font-medium mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            <span>{t.workflows.badge}</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
            {t.workflows.title}
          </h2>
          <p className="mt-4 text-zinc-400 text-base leading-relaxed">
            {t.workflows.subtitle}
          </p>
        </div>

        {/* 4-Step Pipeline Flow */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 relative">
          {steps.map((item, index) => {
            const Icon = item.icon;
            return (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.12 }}
                className="relative rounded-2xl bg-zinc-900/50 border border-white/10 p-6 flex flex-col justify-between hover:border-emerald-500/30 transition-all duration-300 group"
              >
                <div>
                  <div className="flex items-center justify-between mb-5">
                    <div className="w-10 h-10 rounded-xl bg-zinc-800 border border-white/10 flex items-center justify-center text-emerald-400 group-hover:bg-emerald-500/10 group-hover:border-emerald-500/30 transition-colors">
                      <Icon className="w-5 h-5" strokeWidth={1.75} />
                    </div>
                    <span className="font-mono text-xs font-bold text-zinc-400 tracking-wider">
                      STEP {item.step}
                    </span>
                  </div>

                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold mb-2 inline-block">
                    {item.tag}
                  </span>

                  <h3 className="text-lg font-bold text-white mb-2">{item.title}</h3>
                  <p className="text-zinc-400 text-xs leading-relaxed">{item.description}</p>
                </div>

                <div className="mt-6 pt-4 border-t border-white/5 flex items-center gap-1 text-[11px] font-mono text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{t.workflows.stepVerified}</span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
