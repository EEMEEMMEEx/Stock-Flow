import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Play, 
  CheckCircle2, 
  ShoppingCart, 
  SlidersHorizontal, 
  CalendarClock, 
  PackageCheck, 
  FileEdit, 
  ArrowRight,
  ShieldCheck,
  Lock,
  FileText,
  AlertTriangle,
  Layers
} from 'lucide-react';
import { useLandingLanguage } from '../context/LandingLanguageContext';
import BaseStationTowerIcon from '../../components/icons/BaseStationTowerIcon';

export default function LiveSimulatorSection() {
  const { t } = useLandingLanguage();
  const [activeSim, setActiveSim] = useState('pos'); // 'pos' | 'stock' | 'duedate' | 'sitekits'
  const [simSuccessMsg, setSimSuccessMsg] = useState('');

  // 1. POS Simulator State
  const [posCart] = useState([
    { id: '1', name: 'Ubiquiti UniFi 6 Pro Access Point', sku: 'NET-U6-PRO', qty: 2, stock: 18 },
    { id: '2', name: 'Cat6 UTP Cable Roll (305m)', sku: 'CAB-CAT6-305', qty: 1, stock: 9 }
  ]);
  const [selectedProject, setSelectedProject] = useState('USO Net Phase 3');

  // 2. Stock Adjustment Simulator State
  const [stockItem] = useState({ name: 'MikroTik Cloud Router Switch 326', sku: 'NET-MT-326', current: 12 });
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
            <Play className="w-3.5 h-3.5" />
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
          <div className="p-6 sm:p-8 rounded-2xl bg-zinc-950 border border-zinc-800 shadow-xl">
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

            <AnimatePresence mode="wait">
              <motion.div
                key={activeSim}
                initial={{ opacity: 0, rotateX: -8, y: 10 }}
                animate={{ opacity: 1, rotateX: 0, y: 0 }}
                exit={{ opacity: 0, rotateX: 8, y: -10 }}
                transition={{ duration: 0.25 }}
                style={{ transformPerspective: 1200 }}
              >
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
                        <label htmlFor="sim-pos-project" className="text-xs text-zinc-400 font-medium">โครงการ:</label>
                        <select
                          id="sim-pos-project"
                          value={selectedProject}
                          onChange={(e) => setSelectedProject(e.target.value)}
                          className="bg-zinc-900 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-emerald-400 font-semibold focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none focus:outline-none cursor-pointer"
                        >
                          <option value="USO Net Phase 3">USO Net Phase 3 (สวทช.)</option>
                          <option value="DOPA Smart District">DOPA Smart District</option>
                          <option value="CCTV Highway Central">CCTV Highway Central</option>
                        </select>
                      </div>
                    </div>

                    {/* Cart Items + 3D Atomic Lock & Issue Voucher Stage */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
                      {/* Items Table */}
                      <div className="lg:col-span-7 space-y-2">
                        <span className="text-xs font-semibold text-zinc-300">รายการในตะกร้าเบิกจ่าย:</span>
                        {posCart.map((item) => (
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

                      {/* 3D Atomic Lock & Issue Voucher Stage */}
                      <div className="lg:col-span-5 relative flex items-center justify-center py-2">
                        {simSuccessMsg && (
                          <motion.div
                            aria-hidden="true"
                            initial={{ opacity: 0, scale: 0.92 }}
                            animate={{
                              opacity: [0.45, 0.95, 0.45],
                              scale: [0.97, 1.03, 0.97]
                            }}
                            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                            className="absolute inset-0 rounded-2xl border-2 border-emerald-400/60 shadow-[0_0_28px_rgba(16,185,129,0.35)] pointer-events-none"
                            style={{ transform: 'perspective(900px) rotateY(-8deg) rotateX(5deg)' }}
                          />
                        )}
                        <div
                          className={`relative w-full rounded-xl border p-4 transition-all duration-300 shadow-2xl ${
                            simSuccessMsg
                              ? 'bg-gradient-to-br from-zinc-900 via-emerald-950/40 to-zinc-900 border-emerald-400/70 shadow-emerald-500/20'
                              : 'bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950 border-white/10 shadow-black/60'
                          }`}
                          style={{ transform: 'perspective(900px) rotateY(-8deg) rotateX(5deg)' }}
                        >
                          <div className="flex items-center justify-between gap-2 pb-3 border-b border-white/10">
                            <div className="inline-flex items-center gap-1.5 text-[10px] font-mono text-emerald-400">
                              <Lock className={`w-3.5 h-3.5 ${simSuccessMsg ? 'animate-pulse' : ''}`} />
                              <span>SELECT ... FOR UPDATE</span>
                            </div>
                            <span
                              className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                                simSuccessMsg
                                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40'
                                  : 'bg-zinc-800/80 text-zinc-400 border-white/10'
                              }`}
                            >
                              {simSuccessMsg ? 'ROW LOCKED' : 'LOCK READY'}
                            </span>
                          </div>

                          <div className="py-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${
                                  simSuccessMsg
                                    ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300'
                                    : 'bg-zinc-800/80 border-white/10 text-zinc-400'
                                }`}>
                                  <FileText className="w-4 h-4" />
                                </div>
                                <div>
                                  <div className="text-[11px] font-mono font-bold text-white">DOC #WH-2026-089</div>
                                  <div className="text-[10px] text-zinc-400">Issue Voucher PDF</div>
                                </div>
                              </div>
                              <div className="text-right font-mono">
                                <div className="text-[10px] text-zinc-400">QTY</div>
                                <div className="text-xs font-bold text-emerald-400">
                                  {posCart.reduce((a, b) => a + b.qty, 0)} UNITS
                                </div>
                              </div>
                            </div>

                            <div className="p-2 rounded-lg bg-zinc-950/80 border border-white/5 flex items-center justify-between text-[10px] font-mono">
                              <span className="text-zinc-400 truncate max-w-[140px]">{selectedProject}</span>
                              <span className={simSuccessMsg ? 'text-emerald-400 font-bold' : 'text-zinc-500'}>
                                {simSuccessMsg ? 'COMMIT 32ms' : 'TXN STANDBY'}
                              </span>
                            </div>
                          </div>

                          <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[10px] font-mono">
                            <span className="text-zinc-400 flex items-center gap-1">
                              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                              <span>ATOMIC TXN</span>
                            </span>
                            <span className={simSuccessMsg ? 'text-emerald-300 font-semibold' : 'text-zinc-500'}>
                              {simSuccessMsg ? 'PDF ISSUED' : 'AWAITING DISPATCH'}
                            </span>
                          </div>
                        </div>
                      </div>
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
                          <label htmlFor="sim-stock-target" className="text-[11px] font-bold text-emerald-400 block">ยอดสต็อกใหม่</label>
                          <input
                            id="sim-stock-target"
                            type="number"
                            min="0"
                            value={newTargetStock}
                            onChange={(e) => setNewTargetStock(e.target.value)}
                            className="w-full bg-zinc-900 border border-white/10 rounded-lg px-2.5 py-1 text-sm font-bold font-mono text-white focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none focus:outline-none focus:border-emerald-400"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-zinc-900/40 border border-white/5 space-y-1">
                      <label htmlFor="sim-stock-reason" className="text-xs font-semibold text-zinc-300 flex items-center gap-1">
                        <FileEdit className="w-3.5 h-3.5 text-emerald-400" />
                        <span>เหตุผลในการปรับปรุงยอดสต็อก (Mandatory Reason) *</span>
                      </label>
                      <input
                        id="sim-stock-reason"
                        type="text"
                        value={adjustReason}
                        onChange={(e) => setAdjustReason(e.target.value)}
                        className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none focus:outline-none focus:border-emerald-400"
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
                      <label htmlFor="sim-due-date" className="text-xs font-semibold text-zinc-300 block">เลือกกำหนดส่งคืนใหม่ (New Due Date):</label>
                      <div className="flex flex-wrap gap-2">
                        <input
                          id="sim-due-date"
                          type="date"
                          value={selectedNewDueDate}
                          onChange={(e) => setSelectedNewDueDate(e.target.value)}
                          className="bg-zinc-900 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white font-mono flex-1 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setSelectedNewDueDate('2026-09-05')}
                          className="px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-mono text-zinc-200 border border-white/10 cursor-pointer"
                        >
                          +7 วัน
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedNewDueDate('2026-09-25')}
                          className="px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-mono text-zinc-200 border border-white/10 cursor-pointer"
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
                {activeSim === 'sitekits' && (() => {
                  const allBomReady = kitItems.every(
                    (item) => item.availableStock >= item.neededPerSite * targetSitesCount
                  );

                  return (
                    <div className="space-y-6">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/10">
                        <div>
                          <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            <PackageCheck className="w-5 h-5 text-blue-400" />
                            <span>Site Kits BOM Readiness Engine</span>
                          </h3>
                          <p className="text-xs text-zinc-400">คำนวณชุดติดตั้งไซต์งานและวิเคราะห์สต็อกที่เป็นคอขวด</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <label htmlFor="sim-site-count" className="text-xs text-zinc-400 font-medium">จำนวนไซต์งานที่ต้องการ:</label>
                          <input
                            id="sim-site-count"
                            type="number"
                            min="1"
                            max="10"
                            value={targetSitesCount}
                            onChange={(e) => setTargetSitesCount(Number(e.target.value) || 1)}
                            className="w-16 bg-zinc-900 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-blue-400 font-bold font-mono focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none focus:outline-none"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
                        {/* Left 7 columns: BOM item rows */}
                        <div className="lg:col-span-7 space-y-2">
                          <span className="text-xs font-semibold text-zinc-300">วิเคราะห์พัสดุตามสูตร BOM สำหรับ {targetSitesCount} ไซต์:</span>
                          {kitItems.map((item) => {
                            const totalNeeded = item.neededPerSite * targetSitesCount;
                            const isEnough = item.availableStock >= totalNeeded;
                            return (
                              <div
                                key={item.name}
                                className={`p-3 rounded-xl bg-zinc-900/60 border flex items-center justify-between gap-3 text-xs transition-colors ${
                                  isEnough ? 'border-white/5' : 'border-rose-500/40 bg-rose-950/15'
                                }`}
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

                        {/* Right 5 columns: Interactive 3D Exploded BOM Stack */}
                        <div className="lg:col-span-5">
                          <div
                            className={`rounded-2xl border p-4 relative overflow-hidden transition-all duration-300 ${
                              allBomReady
                                ? 'bg-zinc-900/70 border-emerald-500/30 shadow-[0_0_28px_rgba(16,185,129,0.12)]'
                                : 'bg-zinc-900/70 border-rose-500/35 shadow-[0_0_28px_rgba(244,63,94,0.15)]'
                            }`}
                          >
                            {/* Tower Header */}
                            <div className="flex items-center justify-between gap-2 pb-3 border-b border-white/10">
                              <div className="flex items-center gap-2">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${
                                  allBomReady
                                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                                    : 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                                }`}>
                                  <BaseStationTowerIcon className="w-5 h-5" />
                                </div>
                                <div>
                                  <div className="text-[10px] font-mono text-zinc-400 flex items-center gap-1">
                                    <Layers className="w-3 h-3" />
                                    <span>3D BOM STACK</span>
                                  </div>
                                  <div className="text-[11px] font-mono font-bold text-white">
                                    {targetSitesCount} {targetSitesCount === 1 ? 'SITE' : 'SITES'} TARGET
                                  </div>
                                </div>
                              </div>
                              <span
                                className={`inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                                  allBomReady
                                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                    : 'bg-rose-500/15 text-rose-300 border-rose-500/40 animate-pulse'
                                }`}
                              >
                                {!allBomReady && <AlertTriangle className="w-3 h-3" />}
                                <span>{allBomReady ? 'ASSEMBLY READY' : 'BOTTLENECK DETECTED'}</span>
                              </span>
                            </div>

                            {/* 3D Isometric Stage */}
                            <div
                              className="relative h-56 flex items-center justify-center select-none"
                              style={{ perspective: '900px' }}
                            >
                              {kitItems.map((item, idx) => {
                                const totalNeeded = item.neededPerSite * targetSitesCount;
                                const isEnough = item.availableStock >= totalNeeded;
                                const compressedY = (idx - 1) * 18;
                                const explodedY = (idx - 1) * 44 + (isEnough ? 0 : idx === 0 ? -10 : idx === 2 ? 12 : -4);
                                const targetY = allBomReady ? compressedY : explodedY;
                                const layerLabels = ['L1 · CORE SWITCH', 'L2 · OPTIC CAM x4', 'L3 · POLE ENCLOSURE'];

                                return (
                                  <motion.div
                                    key={item.name}
                                    initial={false}
                                    animate={{
                                      y: targetY,
                                      x: !isEnough ? 10 : 0,
                                      rotateX: 48,
                                      rotateZ: -28,
                                      scale: !isEnough ? 1.04 : 1
                                    }}
                                    transition={{ type: 'spring', stiffness: 220, damping: 20 }}
                                    style={{
                                      transformStyle: 'preserve-3d',
                                      zIndex: kitItems.length - idx
                                    }}
                                    className={`absolute w-44 px-3 py-2.5 rounded-xl border border-b-4 backdrop-blur-sm transition-colors ${
                                      isEnough
                                        ? 'bg-emerald-950/75 border-emerald-400/50 border-b-emerald-500/70 shadow-[0_10px_24px_rgba(16,185,129,0.2)]'
                                        : 'bg-rose-950/85 border-rose-500 border-b-rose-600 shadow-[0_10px_28px_rgba(244,63,94,0.35)]'
                                    }`}
                                  >
                                    {!isEnough && (
                                      <motion.div
                                        aria-hidden="true"
                                        animate={{ opacity: [0.3, 0.95, 0.3] }}
                                        transition={{ duration: 1.3, repeat: Infinity, ease: 'easeInOut' }}
                                        className="absolute -inset-1 rounded-xl border border-rose-500 pointer-events-none"
                                      />
                                    )}
                                    <div className="flex items-center justify-between gap-2 text-[10px] font-mono">
                                      <span className={`font-bold ${isEnough ? 'text-emerald-300' : 'text-rose-300'}`}>
                                        {layerLabels[idx] || `L${idx + 1}`}
                                      </span>
                                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                        isEnough
                                          ? 'bg-emerald-500/20 text-emerald-200'
                                          : 'bg-rose-500/30 text-rose-200'
                                      }`}>
                                        {item.availableStock}/{totalNeeded}
                                      </span>
                                    </div>
                                    <div className="mt-1 text-[10px] font-semibold text-white truncate">
                                      {item.name}
                                    </div>
                                  </motion.div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-white/10 text-xs">
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
                  );
                })()}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
