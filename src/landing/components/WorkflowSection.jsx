import { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  PackagePlus, 
  Warehouse, 
  ShoppingCart, 
  FileCheck2, 
  Layers,
  CheckCircle2
} from 'lucide-react';
import { useLandingLanguage } from '../context/LandingLanguageContext';

const PIPELINE_NODES = [
  { cx: 125, label: 'Stock-In', step: '01' },
  { cx: 375, label: 'R2 & Warehouse', step: '02' },
  { cx: 625, label: 'Atomic POS Lock', step: '03' },
  { cx: 875, label: 'PDF Voucher', step: '04' },
];

export default function WorkflowSection() {
  const { t } = useLandingLanguage();
  const [activeStep, setActiveStep] = useState(null);

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
    <section id="workflows" className="py-24 bg-zinc-950/90 border-t border-white/10 text-white relative overflow-hidden">
      {/* Background ambient lighting */}
      <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[300px] bg-emerald-500/10 rounded-full blur-[140px]" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono font-medium mb-3">
            <Layers className="w-3.5 h-3.5" />
            <span>{t.workflows.badge}</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
            {t.workflows.title}
          </h2>
          <p className="mt-4 text-zinc-400 text-base leading-relaxed">
            {t.workflows.subtitle}
          </p>
        </div>

        {/* Interactive 3D Isometric Pipeline Conduit (Desktop) */}
        <div className="hidden lg:block mb-10">
          <svg
            viewBox="0 0 1000 80"
            className="w-full h-20 overflow-visible select-none"
            role="img"
            aria-label="Stock-In to R2 & Warehouse to Atomic POS Lock to PDF Voucher pipeline"
          >
            <defs>
              <linearGradient id="conduitTrackGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="rgba(16, 185, 129, 0.25)" />
                <stop offset="50%" stopColor="rgba(52, 211, 153, 0.55)" />
                <stop offset="100%" stopColor="rgba(16, 185, 129, 0.25)" />
              </linearGradient>
              <linearGradient id="conduitPulseGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="rgba(16, 185, 129, 0)" />
                <stop offset="50%" stopColor="#34d399" />
                <stop offset="100%" stopColor="rgba(16, 185, 129, 0)" />
              </linearGradient>
              <filter id="emeraldGlow" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="3.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Isometric dual-rail conduit casing */}
            <path
              d="M 125 25 L 875 25 M 125 35 L 875 35"
              stroke="rgba(255, 255, 255, 0.08)"
              strokeWidth="1"
              fill="none"
            />
            <path
              d="M 125 30 L 875 30"
              stroke="url(#conduitTrackGrad)"
              strokeWidth="2.5"
              strokeLinecap="round"
              fill="none"
            />

            {/* Animated glowing emerald energy stream */}
            <motion.path
              d="M 125 30 L 875 30"
              stroke="url(#conduitPulseGrad)"
              strokeWidth="4"
              strokeLinecap="round"
              fill="none"
              filter="url(#emeraldGlow)"
              strokeDasharray="130 620"
              animate={{ strokeDashoffset: [750, 0] }}
              transition={{ duration: 2.8, repeat: Infinity, ease: 'linear' }}
            />

            {/* Animated glowing energy orbs moving Step 01 -> Step 04 */}
            <motion.circle
              cy={30}
              r={4.5}
              fill="#6ee7b7"
              filter="url(#emeraldGlow)"
              animate={{
                cx: [125, 375, 625, 875],
                opacity: [0, 1, 1, 0],
                scale: [0.85, 1.15, 1.15, 0.85],
              }}
              transition={{ duration: 2.8, repeat: Infinity, ease: 'linear' }}
            />
            <motion.circle
              cy={30}
              r={3.5}
              fill="#10b981"
              filter="url(#emeraldGlow)"
              animate={{
                cx: [125, 375, 625, 875],
                opacity: [0, 0.9, 0.9, 0],
              }}
              transition={{ duration: 2.8, repeat: Infinity, ease: 'linear', delay: 1.4 }}
            />

            {/* 4 Isometric 3D Cube/Diamond Nodes */}
            {PIPELINE_NODES.map((node, index) => {
              const isActive = activeStep === index;
              const cy = 30;
              return (
                <g
                  key={node.step}
                  className="cursor-pointer focus:outline-none"
                  tabIndex={0}
                  role="button"
                  aria-label={`Step ${node.step}: ${node.label}`}
                  onMouseEnter={() => setActiveStep(index)}
                  onMouseLeave={() => setActiveStep(null)}
                  onFocus={() => setActiveStep(index)}
                  onBlur={() => setActiveStep(null)}
                  onClick={() => setActiveStep(isActive ? null : index)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setActiveStep(isActive ? null : index);
                    }
                  }}
                >
                  {/* Ambient node halo */}
                  <motion.circle
                    cx={node.cx}
                    cy={cy}
                    r={22}
                    fill={isActive ? 'rgba(16, 185, 129, 0.22)' : 'rgba(16, 185, 129, 0.08)'}
                    animate={{
                      scale: isActive ? 1.18 : [1, 1.08, 1],
                      opacity: isActive ? 1 : [0.55, 0.9, 0.55],
                    }}
                    transition={{
                      duration: isActive ? 0.2 : 2.4,
                      repeat: isActive ? 0 : Infinity,
                      delay: index * 0.35,
                    }}
                  />

                  {/* Isometric 3D Cube: Top Diamond */}
                  <polygon
                    points={`${node.cx},${cy - 16} ${node.cx + 16},${cy - 7} ${node.cx},${cy + 2} ${node.cx - 16},${cy - 7}`}
                    fill={isActive ? '#34d399' : '#10b981'}
                    fillOpacity={isActive ? 0.95 : 0.78}
                    stroke="#a7f3d0"
                    strokeWidth={isActive ? 1.4 : 0.9}
                  />
                  {/* Isometric 3D Cube: Left Face */}
                  <polygon
                    points={`${node.cx - 16},${cy - 7} ${node.cx},${cy + 2} ${node.cx},${cy + 16} ${node.cx - 16},${cy + 7}`}
                    fill={isActive ? '#059669' : '#18181b'}
                    stroke={isActive ? '#6ee7b7' : 'rgba(16, 185, 129, 0.45)'}
                    strokeWidth="0.9"
                  />
                  {/* Isometric 3D Cube: Right Face */}
                  <polygon
                    points={`${node.cx + 16},${cy - 7} ${node.cx},${cy + 2} ${node.cx},${cy + 16} ${node.cx + 16},${cy + 7}`}
                    fill={isActive ? '#047857' : '#09090b'}
                    stroke={isActive ? '#6ee7b7' : 'rgba(16, 185, 129, 0.35)'}
                    strokeWidth="0.9"
                  />

                  {/* Node Label */}
                  <text
                    x={node.cx}
                    y={69}
                    textAnchor="middle"
                    fill={isActive ? '#6ee7b7' : '#a1a1aa'}
                    fontSize="11"
                    fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
                    fontWeight={isActive ? '700' : '600'}
                  >
                    {node.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* 4-Step Pipeline Flow */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 relative">
          {steps.map((item, index) => {
            const Icon = item.icon;
            const isHighlighted = activeStep === index;
            return (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="h-full"
              >
                <motion.div
                  animate={
                    isHighlighted
                      ? { y: -8, rotateX: 6, rotateY: -6, scale: 1.02 }
                      : { y: 0, rotateX: 0, rotateY: 0, scale: 1 }
                  }
                  whileHover={{ y: -8, rotateX: 6, rotateY: -6, scale: 1.02 }}
                  transition={{ type: 'spring', stiffness: 280, damping: 22 }}
                  style={{ transformPerspective: 1000, transformStyle: 'preserve-3d' }}
                  onMouseEnter={() => setActiveStep(index)}
                  onMouseLeave={() => setActiveStep(null)}
                  className={`relative h-full rounded-2xl bg-zinc-900/55 border border-white/10 border-b-4 border-b-emerald-500/30 p-6 flex flex-col justify-between hover:border-emerald-500/40 hover:border-b-emerald-400/70 hover:bg-zinc-900/85 transition-colors duration-300 group shadow-lg hover:shadow-emerald-500/15 ${
                    isHighlighted ? 'border-emerald-500/50 border-b-emerald-400/80 bg-zinc-900/85 shadow-emerald-500/20' : ''
                  }`}
                >
                  <div style={{ transformStyle: 'preserve-3d' }}>
                    <div
                      className="flex items-center justify-between mb-5"
                      style={{ transform: 'translateZ(26px)' }}
                    >
                      <div className="w-11 h-11 rounded-xl bg-zinc-800/95 border border-white/15 border-b-2 border-b-emerald-500/40 flex items-center justify-center text-emerald-400 group-hover:bg-emerald-500/20 group-hover:border-emerald-500/50 group-hover:-translate-y-0.5 transition-all duration-300 shadow-lg shadow-black/40">
                        <Icon className="w-5 h-5" strokeWidth={1.75} />
                      </div>
                      <span className="font-mono text-xs font-bold text-zinc-300 tracking-wider px-2.5 py-1 rounded-lg bg-zinc-950/80 border border-white/10 border-b-2 border-b-emerald-500/30 shadow-md">
                        STEP {item.step}
                      </span>
                    </div>

                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold mb-2.5 inline-block">
                      {item.tag}
                    </span>

                    <h3 className="text-base font-bold text-white mb-2">{item.title}</h3>
                    <p className="text-zinc-400 text-xs leading-relaxed">{item.description}</p>
                  </div>

                  <div className="mt-6 pt-4 border-t border-white/5 flex items-center gap-1.5 text-[11px] font-mono text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{t.workflows.stepVerified}</span>
                  </div>
                </motion.div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
