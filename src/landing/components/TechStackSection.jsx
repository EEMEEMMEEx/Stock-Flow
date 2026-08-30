import React from 'react';
import { motion } from 'framer-motion';
import { 
  Code2, 
  Database, 
  Cpu, 
  Mail, 
  FileText, 
  Server, 
  Cloud 
} from 'lucide-react';
import { useLandingLanguage } from '../context/LandingLanguageContext';

export default function TechStackSection() {
  const { t } = useLandingLanguage();

  const stackItems = [
    {
      title: 'React 18 & Vite',
      description: 'Ultra-fast Single Page Application with optimized bundle splitting and instant hydration',
      icon: Code2,
      category: 'Frontend Core',
    },
    {
      title: 'Tailwind CSS v4 & Motion',
      description: 'High-performance modern utility styling with Framer Motion spring physics',
      icon: Cpu,
      category: 'Design System',
    },
    {
      title: 'Supabase & PostgreSQL',
      description: 'ACID-compliant relational database with Row Level Security (RLS) and stored RPCs',
      icon: Database,
      category: 'Database & Auth',
    },
    {
      title: 'Cloudflare R2 Object Storage',
      description: 'Zero-egress asset storage with global CDN caching & presigned browser S3 direct upload',
      icon: Cloud,
      category: 'Cloud Storage',
    },
    {
      title: 'Vercel Serverless Email Engine',
      description: 'Dedicated serverless endpoints for secure transactional email invitations',
      icon: Mail,
      category: 'Backend Microservice',
    },
    {
      title: 'jsPDF & AutoTable Engine',
      description: 'Client-side high-fidelity PDF issue voucher and material receipt generator',
      icon: FileText,
      category: 'Document Automation',
    },
  ];

  return (
    <section id="architecture" className="py-24 bg-zinc-950 text-white relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div id="security" className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono font-medium mb-3">
            <Server className="w-3.5 h-3.5" />
            <span>{t.tech.badge}</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
            {t.tech.title}
          </h2>
          <p className="mt-4 text-zinc-400 text-base leading-relaxed">
            {t.tech.subtitle}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {stackItems.map((item, index) => {
            const Icon = item.icon;
            return (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.45, delay: index * 0.08 }}
                className="p-6 rounded-2xl bg-zinc-900/40 border border-white/10 hover:border-emerald-500/30 transition-all duration-300"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 rounded-xl bg-zinc-800/80 border border-white/10 flex items-center justify-center text-emerald-400">
                    <Icon className="w-5 h-5" strokeWidth={1.75} />
                  </div>
                  <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider bg-zinc-800/40 px-2 py-0.5 rounded">
                    {item.category}
                  </span>
                </div>
                <h3 className="text-base font-bold text-white mb-2">{item.title}</h3>
                <p className="text-zinc-400 text-xs leading-relaxed">{item.description}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
