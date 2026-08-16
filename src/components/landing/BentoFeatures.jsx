import React from 'react';
import { motion } from 'framer-motion';
import { 
  ShoppingCart, 
  Database, 
  UserCheck, 
  RotateCcw, 
  FileSpreadsheet, 
  FileText, 
  CheckCircle2, 
  Lock, 
  Layers, 
  Sparkles,
  ArrowRight
} from 'lucide-react';
import SpotlightCard from '../reactbits/SpotlightCard';

export default function BentoFeatures() {
  return (
    <section id="features" className="py-24 bg-zinc-950 text-white relative overflow-hidden">
      {/* Background Subtle Glows */}
      <div className="pointer-events-none absolute top-1/3 left-10 w-96 h-96 bg-emerald-500/10 rounded-full blur-[140px]" />
      <div className="pointer-events-none absolute bottom-10 right-10 w-96 h-96 bg-teal-500/10 rounded-full blur-[140px]" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono font-medium mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            <span>CORE ARCHITECTURE & MODULES</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white">
            Built for High-Precision Operations.
          </h2>
          <p className="mt-4 text-zinc-400 text-base leading-relaxed">
            ครอบคลุมทุกวงจรการเคลื่อนย้ายพัสดุและครุภัณฑ์ ตั้งแต่รับเข้าคลัง ตรวจสอบ สิทธิ์ผู้ใช้ ไปจนถึงการเบิกจ่ายด้วยระบบ POS
          </p>
        </div>

        {/* 6-Card Bento Grid */}
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
                  POS-Style Rapid Withdrawal
                </h3>
                <p className="text-zinc-400 text-sm leading-relaxed max-w-xl">
                  ระบบตะกร้าเบิกจ่ายสินค้าด่วนแบบ Point-of-Sale รองรับการค้นหาด่วน สแกน Barcode/SKU ระบุโครงการผู้ขอเบิก และตัดยอดสต็อกทันทีในคลิกเดียว
                </p>
              </div>

              {/* Visual Mini POS Card */}
              <div className="mt-6 pt-6 border-t border-white/10 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-xl bg-zinc-950/60 border border-white/5">
                  <div className="text-[11px] font-mono text-zinc-400">Scan & Search</div>
                  <div className="text-xs font-semibold text-white mt-1">Instant SKU Finder</div>
                </div>
                <div className="p-3 rounded-xl bg-zinc-950/60 border border-white/5">
                  <div className="text-[11px] font-mono text-zinc-400">Cart Allocation</div>
                  <div className="text-xs font-semibold text-white mt-1">Multi-Project Target</div>
                </div>
                <div className="p-3 rounded-xl bg-zinc-950/60 border border-white/5">
                  <div className="text-[11px] font-mono text-zinc-400">Dispatch Speed</div>
                  <div className="text-xs font-semibold text-emerald-400 mt-1">&lt; 1-Second Tx</div>
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
                  100% Atomic Transactions
                </h3>
                <p className="text-zinc-400 text-sm leading-relaxed">
                  ตัดปัญหาเรื่องสต็อกติดลบหรือ Race Conditions ด้วย PostgreSQL Database Functions (`SELECT FOR UPDATE`) จัดการความปลอดภัยระดับ Data Layer
                </p>
              </div>

              <div className="mt-6 pt-6 border-t border-white/10">
                <div className="flex items-center gap-2 text-xs font-mono text-cyan-400">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>ACID Compliant Engine</span>
                </div>
              </div>
            </SpotlightCard>
          </motion.div>

          {/* Card 3: Granular RBAC & Role Permissions */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <SpotlightCard
              spotlightColor="rgba(168, 85, 247, 0.18)"
              className="h-full p-6 sm:p-8 flex flex-col justify-between"
            >
              <div>
                <div className="w-12 h-12 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 mb-6 shadow-inner">
                  <UserCheck className="w-6 h-6" strokeWidth={1.75} />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">
                  Granular RBAC Matrix
                </h3>
                <p className="text-zinc-400 text-sm leading-relaxed">
                  กำหนดสิทธิ์ละเอียดแยกตามรายหน้าและฟังก์ชัน (View, Manage, Approve) พร้อมระบบเชิญสมาชิกทาง Email และ Self-service Profile
                </p>
              </div>

              <div className="mt-6 pt-6 border-t border-white/10">
                <div className="flex items-center gap-2 text-xs font-mono text-teal-400">
                  <Lock className="w-4 h-4" />
                  <span>Module-Level Security</span>
                </div>
              </div>
            </SpotlightCard>
          </motion.div>

          {/* Card 4: Material Checkout & Borrow Return Lifecycle */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <SpotlightCard
              spotlightColor="rgba(245, 158, 11, 0.18)"
              className="h-full p-6 sm:p-8 flex flex-col justify-between"
            >
              <div>
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-6 shadow-inner">
                  <RotateCcw className="w-6 h-6" strokeWidth={1.75} />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">
                  Material Checkout & Return
                </h3>
                <p className="text-zinc-400 text-sm leading-relaxed">
                  ติดตามสถานะการยืม-คืนอุปกรณ์ ครุภัณฑ์ พร้อมตรวจสอบสภาพพัสดุ และระบบแจ้งเตือนรายการที่ครบกำหนดหรือค้างคืน
                </p>
              </div>

              <div className="mt-6 pt-6 border-t border-white/10">
                <div className="flex items-center gap-2 text-xs font-mono text-amber-400">
                  <Layers className="w-4 h-4" />
                  <span>Full Asset Lifecycle</span>
                </div>
              </div>
            </SpotlightCard>
          </motion.div>

          {/* Card 5: Batch CSV & Excel Validation Engine */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.4 }}
          >
            <SpotlightCard
              spotlightColor="rgba(16, 185, 129, 0.18)"
              className="h-full p-6 sm:p-8 flex flex-col justify-between"
            >
              <div>
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-6 shadow-inner">
                  <FileSpreadsheet className="w-6 h-6" strokeWidth={1.75} />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">
                  Batch Stock-In Engine
                </h3>
                <p className="text-zinc-400 text-sm leading-relaxed">
                  นำเข้าข้อมูลสินค้าล็อตใหญ่ด้วยแม่แบบ CSV/Excel ที่มีระบบตรวจสอบข้อผิดพลาด คัดกรองข้อมูล และบันทึก Serial Number อัตโนมัติ
                </p>
              </div>

              <div className="mt-6 pt-6 border-t border-white/10">
                <div className="flex items-center gap-2 text-xs font-mono text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Canonical Data Mapping</span>
                </div>
              </div>
            </SpotlightCard>
          </motion.div>

          {/* Card 6: Automated PDF Issue Vouchers (Span 3 / Full Width on bottom or standard) */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="md:col-span-3"
          >
            <SpotlightCard
              spotlightColor="rgba(16, 185, 129, 0.15)"
              className="p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-6"
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 flex-shrink-0 shadow-inner">
                  <FileText className="w-6 h-6" strokeWidth={1.75} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white mb-1">
                    Automated Issue Vouchers & PDF Engine
                  </h3>
                  <p className="text-zinc-400 text-sm leading-relaxed max-w-2xl">
                    สร้างใบเบิกพัสดุและใบสำคัญรับ-ส่งของในรูปแบบ PDF ตามแบบฟอร์มมาตรฐานของหน่วยงาน พร้อมระบบรันเลขที่เอกสาร วันที่ และช่องลงนามโดยอัตโนมัติ
                  </p>
                </div>
              </div>

              <div className="flex-shrink-0">
                <a
                  href="https://stock-flow-pi-coral.vercel.app"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-white/10 text-white text-xs font-semibold transition-all hover:scale-105"
                >
                  <span>Test in Live App</span>
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
