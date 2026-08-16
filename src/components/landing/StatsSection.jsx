import React from 'react';
import { motion } from 'framer-motion';
import { Zap, ShieldCheck, Database, Lock } from 'lucide-react';
import ShinyText from '../reactbits/ShinyText';

export default function StatsSection() {
  const stats = [
    {
      value: '< 100ms',
      label: 'POS Transaction Speed',
      description: 'เบิกจ่ายและหักสต็อกได้รวดเร็วทันทีผ่านระบบ Web POS Terminal',
      icon: Zap,
      accent: 'emerald',
    },
    {
      value: '100%',
      label: 'Atomic Consistency',
      description: 'ตัดสต็อกแบบ Row-locking ในระดับ Database ไร้ข้อผิดพลาด',
      icon: Database,
      accent: 'cyan',
    },
    {
      value: 'Zero-Risk',
      label: 'Race-Condition Prevention',
      description: 'สต็อกไม่มีวันติดลบแม้มีคำขอเบิกพร้อมกันหลายจุด',
      icon: ShieldCheck,
      accent: 'emerald',
    },
    {
      value: '12+ Types',
      label: 'Granular RBAC Matrix',
      description: 'ควบคุมสิทธิ์รายโมดูล พร้อมระบบ Self-service Profile และ Email Invite',
      icon: Lock,
      accent: 'teal',
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
