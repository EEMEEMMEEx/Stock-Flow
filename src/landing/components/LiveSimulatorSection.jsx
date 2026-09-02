import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Play, 
  CheckCircle2, 
  ShoppingCart, 
  SlidersHorizontal, 
  CalendarClock, 
  PackageCheck, 
  Sparkles, 
  ArrowRight,
  ShieldCheck
} from 'lucide-react';
import SpotlightCard from '@/components/reactbits/SpotlightCard';
import { useLandingLanguage } from '../context/LandingLanguageContext';

export default function LiveSimulatorSection() {
  const { t } = useLandingLanguage();
  const [activeSim, setActiveSim] = useState('pos'); // 'pos' | 'stock' | 'duedate' | 'sitekits'
  const [simSuccessMsg, setSimSuccessMsg] = useState('');

  // 1. POS Simulator State
  const [posCart, setPosCart] = useState([
    { id: '1', name: 'Ubiquiti UniFi 6 Pro Access Point', sku: 'NET-U6-PRO', qty: 2, stock: 18 },
    { id: '2', name: 'Cat6 UTP Cable Roll (305m)', sku: 'CAB-CAT6-305', qty: 1, stock: 9 }
  ]);
  const [selectedProject, setSelectedProject] = useState('USO Net Phase 3');

  // 2. Stock Adjustment Simulator State
  const [stockItem, setStockItem] = useState({ name: 'MikroTik Cloud Router Switch 326', sku: 'NET-MT-326', current: 12 });
  const [newTargetStock, setNewTargetStock] = useState('18');
  const [adjustReason, setAdjustReason] = useState('ตรวจนับสต็อกประจำไตรมาส Q3/2026');

  // 3. Due Date Extension Simulator State
  const [loanStatus, setLoanStatus] = useState('OVERDUE');
  const [currentDueDate, setCurrentDueDate] = useState('2026-08-25');
  const [selectedNewDueDate, setSelectedNewDueDate] = useState('2026-09-20');

  // 4. Site Kits Simulator State
  const [targetSitesCount, setTargetSitesCount] = useState(3);
  const kitItems = [
    { name: 'Cisco Industrial Switch', neededPerSite: 1, availableStock: 8 },
    { name: 'Hikvision 4K IP Camera', neededPerSite: 4, availableStock: 16 },
    { name: 'Outdoor Pole Enclosure Box', neededPerSite: 1, availableStock: 3 }
  ];

  const handleSimulateAction = (type) => {
    if (type === 'pos') {
      setSimSuccessMsg(`✓ จำลองการตัดสต็อกสำเร็จ: ทำรายการ ${posCart.reduce((a, b) => a + b.qty, 0)} ชิ้น สำหรับโครงการ ${selectedProject} (PostgreSQL Row Lock สำเร็จใน 32ms)`);
    } else if (type === 'stock') {
      const diff = Number(newTargetStock) - stockItem.current;
      setSimSuccessMsg(`✓ บันทึกการปรับยอดสต็อกสำเร็จ: ${stockItem.current} ➔ ${newTargetStock} (${diff > 0 ? `+${diff}` : diff} ชิ้น) | บันทึกประวัติและ Audit Trail เรียบร้อย`);
    } else if (type === 'duedate') {
      setLoanStatus('NORMAL');
      setCurrentDueDate(selectedNewDueDate);
      setSimSuccessMsg(`✓ ขยายกำหนดวันส่งคืนสำเร็จเป็น ${selectedNewDueDate}: สถานะพัสดุเปลี่ยนจาก Overdue เป็น Active โดยอัตโนมัติ`);
    }
    setTimeout(() => {
      setSimSuccessMsg('');
    }, 6000);
  };

  return (
    <section id="simulator" className="py-24 bg-zinc-950/90 border-t border-white/10 text-white relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono font-medium mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            <span>{t.simulator.badge || 'INTERACTIVE LIVE PLAYGROUND'}</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
            {t.simulator.title || 'สัมผัสประสบการณ์การทำงานจริงได้ทันที'}
          </h2>
          <p className="mt-4 text-zinc-400 text-base leading-relaxed">
            {t.simulator.subtitle || 'ทดลองจำลองระบบการทำงานหลักของ StockFlow ทั้งระบบเบิกจ่ายด่วน POS, การปรับยอดสต็อก และการขยายเวลากำหนดคืน'}
          </p>

          {/* Simulator Navigation Buttons */}
          <div className="mt-8 inline-flex p-1 rounded-2xl bg-zinc-900 border border-white/10 flex-wrap justify-center gap-1">
            <button
              type="button"
              onClick={() => setActiveSim('pos')}
              className={`px-4 py-2 rounded-xl text-xs font-medium transition-all flex items-center gap-2 ${
                activeSim === 'pos'
                  ? 'bg-emerald-500 text-zinc-950 font-bold shadow-lg shadow-emerald-500/20'
                  : 'text-zinc-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <ShoppingCart className="w-4 h-4" />
              <span>{t.simulator.tabPos || 'POS Withdrawal'}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSim('stock')}
              className={`px-4 py-2 rounded-xl text-xs font-medium transition-all flex items-center gap-2 ${
                activeSim === 'stock'
                  ? 'bg-emerald-500 text-zinc-950 font-bold shadow-lg shadow-emerald-500/20'
                  : 'text-zinc-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span>{t.simulator.tabStockAdjust || 'Stock Adjustment'}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSim('duedate')}
              className={`px-4 py-2 rounded-xl text-xs font-medium transition-all flex items-center gap-2 ${
                activeSim === 'duedate'
                  ? 'bg-emerald-500 text-zinc-950 font-bold shadow-lg shadow-emerald-500/20'
                  : 'text-zinc-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <CalendarClock className="w-4 h-4" />
              <span>{t.simulator.tabDueDate || 'Due Date Extension'}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSim('sitekits')}
              className={`px-4 py-2 rounded-xl text-xs font-medium transition-all flex items-center gap-2 ${
                activeSim === 'sitekits'
                  ? 'bg-emerald-500 text-zinc-950 font-bold shadow-lg shadow-emerald-500/20'
                  : 'text-zinc-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <PackageCheck className="w-4 h-4" />
              <span>{t.simulator.tabSiteKits || 'BOM Kit Readiness'}</span>
            </button>
          </div>
        </div>

        {/* Live Simulator Content Card */}
        <div className="max-w-4xl mx-auto">
          <SpotlightCard
            spotlightColor="rgba(16, 185, 129, 0.15)"
            className="p-6 sm:p-8 rounded-3xl bg-zinc-950/90 border border-white/15 backdrop-blur-xl shadow-2xl"
          >
            {/* Feedback Alert Banner */}
            {simSuccessMsg && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6 p-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-3"
              >
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <span>{simSuccessMsg}</span>
              </motion.div>
            )}

            {/* Sim 1: POS Rapid Withdrawal */}
            {activeSim === 'pos' && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-white/10">
                  <div>
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      <ShoppingCart className="w-5 h-5 text-emerald-400" />
                      <span>POS Rapid Dispatch Terminal</span>
                    </h3>
                    <p className="text-xs text-zinc-400">จำลองการเลือกรายการเบิกจ่ายและทดสอบ Row-Locking</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-400 font-medium">โครงการ:</span>
                    <select
                      value={selectedProject}
                      onChange={(e) => setSelectedProject(e.target.value)}
                      className="bg-zinc-900 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-emerald-400 font-semibold focus:outline-none"
                    >
                      <option value="USO Net Phase 3">USO Net Phase 3 (สวทช.)</option>
                      <option value="DOPA Smart District">DOPA Smart District</option>
                      <option value="CCTV Highway Central">CCTV Highway Central</option>
                    </select>
                  </div>
                </div>

                {/* Items Table */}
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-zinc-300">รายการในตะกร้าเบิกจ่าย:</span>
                  {posCart.map((item, idx) => (
                    <div
                      key={item.id}
                      className="p-3 rounded-xl bg-zinc-900/60 border border-white/5 flex items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <div className="font-semibold text-white">{item.name}</div>
                        <div className="text-[11px] text-zinc-400 font-mono">SKU: {item.sku} · สต็อกคงเหลือ: {item.stock} ชิ้น</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 bg-zinc-950 px-2 py-1 rounded-lg border border-white/10 font-mono font-bold">
                          <span>x {item.qty}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Action buttons */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-white/10">
                  <div className="flex items-center gap-2 text-xs font-mono text-emerald-400">
                    <ShieldCheck className="w-4 h-4" />
                    <span>PostgreSQL Isolation: `SELECT FOR UPDATE` Ready</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSimulateAction('pos')}
                    className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-zinc-950 font-bold text-xs shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer"
                  >
                    <Play className="w-4 h-4" />
                    <span>จำลองการเบิกจ่าย & ออกใบเบิก PDF</span>
                  </button>
                </div>
              </div>
            )}

            {/* Sim 2: Current Stock Adjustment (v1.3.0) */}
            {activeSim === 'stock' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between pb-4 border-b border-white/10">
                  <div>
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      <SlidersHorizontal className="w-5 h-5 text-emerald-400" />
                      <span>Current Stock Adjustment Simulator</span>
                    </h3>
                    <p className="text-xs text-zinc-400">จำลองการปรับยอดสต็อกคงเหลือพร้อมบันทึก Audit Log</p>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                    v1.3.0 FEATURE
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-zinc-900/60 border border-white/5 space-y-1">
                    <span className="text-[11px] text-zinc-400">รายการวัสดุ Master</span>
                    <div className="text-sm font-bold text-white">{stockItem.name}</div>
                    <div className="text-xs font-mono text-zinc-400">SKU: {stockItem.sku}</div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-4 rounded-xl bg-zinc-900/60 border border-white/5">
                      <span className="text-[11px] text-zinc-400">ยอดสต็อกเดิม</span>
                      <div className="text-xl font-bold font-mono text-zinc-300">{stockItem.current} ชิ้น</div>
                    </div>
                    <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/30 space-y-1">
                      <span className="text-[11px] font-bold text-emerald-400">ยอดสต็อกใหม่</span>
                      <input
                        type="number"
                        min="0"
                        value={newTargetStock}
                        onChange={(e) => setNewTargetStock(e.target.value)}
                        className="w-full bg-zinc-900 border border-white/10 rounded-lg px-2.5 py-1 text-sm font-bold font-mono text-white focus:outline-none focus:border-emerald-400"
                      />
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-zinc-900/40 border border-white/5 space-y-1">
                  <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>เหตุผลในการปรับปรุงยอดสต็อก (Mandatory Reason) *</span>
                  </label>
                  <input
                    type="text"
                    value={adjustReason}
                    onChange={(e) => setAdjustReason(e.target.value)}
                    className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-emerald-400"
                  />
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-white/10">
                  <div className="text-xs font-mono text-zinc-400">
                    ผลต่างสต็อก: <span className="text-emerald-400 font-bold">+{Number(newTargetStock || 0) - stockItem.current} ชิ้น</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSimulateAction('stock')}
                    className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-zinc-950 font-bold text-xs shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer"
                  >
                    <Play className="w-4 h-4" />
                    <span>บันทึกปรับยอดสต็อก & Audit Log</span>
                  </button>
                </div>
              </div>
            )}

            {/* Sim 3: Return Due Date Extension (v1.2.0) */}
            {activeSim === 'duedate' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between pb-4 border-b border-white/10">
                  <div>
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      <CalendarClock className="w-5 h-5 text-amber-400" />
                      <span>Return Due Date Extension Simulator</span>
                    </h3>
                    <p className="text-xs text-zinc-400">จำลองการขยายกำหนดวันส่งคืนพัสดุและคำนวณสถานะ Realtime</p>
                  </div>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                    loanStatus === 'OVERDUE'
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  }`}>
                    STATUS: {loanStatus}
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-zinc-900/60 border border-white/5 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-zinc-400">เครื่องมือที่ยืม:</span>
                    <span className="text-white font-bold">Fluke DSX-8000 CableAnalyzer Set</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">ผู้ยืม:</span>
                    <span className="text-zinc-200">นายสมศักดิ์ นิลรัตน์ (วิศวกรโครงข่าย)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">กำหนดคืนเดิม:</span>
                    <span className="text-rose-400 font-mono font-bold">{currentDueDate} ({loanStatus === 'OVERDUE' ? 'เกินกำหนดแล้ว' : 'ปกติ'})</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-zinc-300">เลือกกำหนดส่งคืนใหม่ (New Due Date):</label>
                  <div className="flex flex-wrap gap-2">
                    <input
                      type="date"
                      value={selectedNewDueDate}
                      onChange={(e) => setSelectedNewDueDate(e.target.value)}
                      className="bg-zinc-900 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white font-mono flex-1 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setSelectedNewDueDate('2026-09-05')}
                      className="px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-mono text-zinc-200 border border-white/10"
                    >
                      +7 วัน
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedNewDueDate('2026-09-25')}
                      className="px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-mono text-zinc-200 border border-white/10"
                    >
                      +30 วัน
                    </button>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-white/10">
                  <div className="text-xs font-mono text-emerald-400">
                    Auto-recalculation: Overdue ➔ Active
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSimulateAction('duedate')}
                    className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-zinc-950 font-bold text-xs shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer"
                  >
                    <Play className="w-4 h-4" />
                    <span>บันทึกการขยายเวลาคืน</span>
                  </button>
                </div>
              </div>
            )}

            {/* Sim 4: Site Kits BOM Readiness */}
            {activeSim === 'sitekits' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between pb-4 border-b border-white/10">
                  <div>
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      <PackageCheck className="w-5 h-5 text-blue-400" />
                      <span>Site Kits BOM Readiness Engine</span>
                    </h3>
                    <p className="text-xs text-zinc-400">คำนวณชุดติดตั้งไซต์งานและวิเคราะห์สต็อกที่เป็นคอขวด</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-400 font-medium">จำนวนไซต์งานที่ต้องการ:</span>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={targetSitesCount}
                      onChange={(e) => setTargetSitesCount(Number(e.target.value) || 1)}
                      className="w-16 bg-zinc-900 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-blue-400 font-bold font-mono focus:outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="text-xs font-semibold text-zinc-300">วิเคราะห์พัสดุตามสูตร BOM สำหรับ {targetSitesCount} ไซต์:</span>
                  {kitItems.map((item) => {
                    const totalNeeded = item.neededPerSite * targetSitesCount;
                    const isEnough = item.availableStock >= totalNeeded;
                    return (
                      <div
                        key={item.name}
                        className="p-3 rounded-xl bg-zinc-900/60 border border-white/5 flex items-center justify-between gap-3 text-xs"
                      >
                        <div>
                          <div className="font-semibold text-white">{item.name}</div>
                          <div className="text-[11px] text-zinc-400">สูตร: {item.neededPerSite} ชิ้น/ไซต์ · ต้องการรวม: <span className="text-white font-mono font-bold">{totalNeeded}</span> ชิ้น</div>
                        </div>
                        <div className="text-right font-mono">
                          <span className="text-[11px] text-zinc-400 block">คงเหลือ: {item.availableStock} ชิ้น</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                            isEnough 
                              ? 'bg-emerald-500/20 text-emerald-300' 
                              : 'bg-rose-500/20 text-rose-300'
                          }`}>
                            {isEnough ? '✓ สต็อกพร้อม' : '✕ สต็อกไม่พอ'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-white/10 text-xs">
                  <div className="text-zinc-400">
                    สต็อกปัจจุบันสามารถประกอบชุดติดตั้งได้สูงสุด: <span className="text-emerald-400 font-bold font-mono">3 ไซต์</span>
                  </div>
                  <a
                    href="https://stockflowth.online"
                    className="px-5 py-2 rounded-xl bg-blue-500 hover:bg-blue-400 text-white font-semibold text-xs shadow-lg shadow-blue-500/20 transition-all flex items-center gap-1.5"
                  >
                    <span>สร้างชุดเบิกไซต์งานจริง</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            )}
          </SpotlightCard>
        </div>
      </div>
    </section>
  );
}
