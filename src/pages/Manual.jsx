import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  BookOpen, AlertTriangle, ShieldCheck, User, CheckCircle2, XCircle, 
  FileSpreadsheet, PlusCircle, Search, Users, Shield, KeyRound, 
  FolderKanban, ArrowDownToLine, ArrowUpFromLine, History, FileText, 
  Camera, Lock, CheckSquare, Layers, Sparkles
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const Manual = () => {
  const { isAdmin, can } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all'); // 'all' | 'staff' | 'supervisor' | 'admin'

  const categories = [
    { id: 'all', label: 'คู่มือทั้งหมด' },
    { id: 'staff', label: 'สำหรับผู้เบิก (Staff)' },
    { id: 'supervisor', label: 'สำหรับผู้อนุมัติ (Supervisor)' },
    { id: 'admin', label: 'สำหรับผู้ดูแลระบบ (Admin / RBAC)' },
  ];

  return (
    <div className="space-y-6 pb-16 max-w-6xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2 text-primary">
            <BookOpen className="w-8 h-8 text-primary" />
            คู่มือการใช้งานระบบ StockFlow (System User Manual)
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            คำแนะนำขั้นตอนการใช้งานระบบสต็อก การขอเบิกจ่าย การอนุมัติ การบริหารจัดการผู้ใช้ และระบบสิทธิ์ RBAC
          </p>
        </div>

        {/* Search Input */}
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="ค้นหาเรื่องในคู่มือ..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 neu-pressed bg-transparent text-sm"
          />
        </div>
      </div>

      {/* Category Filter Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-border/60 pb-3">
        {categories.map((cat) => (
          <Button
            key={cat.id}
            type="button"
            variant={activeCategory === cat.id ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveCategory(cat.id)}
            className={`text-xs font-semibold rounded-full px-4 h-8 transition-all ${
              activeCategory === cat.id
                ? 'neu-primary shadow-md'
                : 'neu-button text-muted-foreground hover:text-foreground'
            }`}
          >
            {cat.label}
          </Button>
        ))}
      </div>

      {/* Manual Content Grid */}
      <div className="space-y-8">
        
        {/* SECTION 1: System Structure & Navigation */}
        {(activeCategory === 'all' || activeCategory === 'staff') && (
          <Card className="neu-flat border-0 border-l-4 border-l-primary overflow-hidden">
            <CardHeader className="bg-primary/5 pb-4">
              <CardTitle className="text-lg font-bold flex items-center gap-2 text-primary">
                <Layers className="w-5 h-5" />
                1. โครงสร้างเมนูการใช้งานระบบ (Sidebar Navigation & Navigation Visibility)
              </CardTitle>
              <CardDescription className="text-xs">
                เมนูคำสั่งที่ปรากฏในแถบด้านข้าง (Sidebar) จะถูกควบคุมตามสิทธิ์การใช้งาน (Permissions) ของแต่ละบัญชี
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4 space-y-4 text-sm">
              <p className="text-muted-foreground leading-relaxed">
                ระบบ StockFlow ใช้การซ่อน/แสดงเมนูและปุ่มการทำงานแบบไดนามิก หากคุณไม่เห็นบางเมนู แสดงว่าบัญชีของคุณไม่มีสิทธิ์เข้าถึงในส่วนนั้น
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                <div className="p-3 rounded-xl neu-pressed-sm bg-white/40 dark:bg-black/20 text-xs space-y-1">
                  <div className="font-semibold flex items-center gap-1.5 text-foreground">
                    <BookOpen className="w-4 h-4 text-primary" /> Dashboard
                  </div>
                  <p className="text-muted-foreground text-[11px]">ภาพรวมสถิติ คลังสต็อก คำขอเบิกจ่าย และกราฟสรุป</p>
                  <code className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">dashboard.view</code>
                </div>

                <div className="p-3 rounded-xl neu-pressed-sm bg-white/40 dark:bg-black/20 text-xs space-y-1">
                  <div className="font-semibold flex items-center gap-1.5 text-foreground">
                    <FolderKanban className="w-4 h-4 text-blue-600" /> โครงการ (Projects)
                  </div>
                  <p className="text-muted-foreground text-[11px]">จัดการรายชื่อและรายละเอียดโครงการก่อสร้าง/หน่วยงาน</p>
                  <code className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">projects.view</code>
                </div>

                <div className="p-3 rounded-xl neu-pressed-sm bg-white/40 dark:bg-black/20 text-xs space-y-1">
                  <div className="font-semibold flex items-center gap-1.5 text-foreground">
                    <Layers className="w-4 h-4 text-purple-600" /> รายการวัสดุ (Items Master)
                  </div>
                  <p className="text-muted-foreground text-[11px]">ทะเบียนวัสดุ รหัส SKU และยอดสต็อกคงเหลือแต่ละโครงการ</p>
                  <code className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">items.view</code>
                </div>

                <div className="p-3 rounded-xl neu-pressed-sm bg-white/40 dark:bg-black/20 text-xs space-y-1">
                  <div className="font-semibold flex items-center gap-1.5 text-foreground">
                    <ArrowDownToLine className="w-4 h-4 text-emerald-600" /> รับเข้า Stock (Stock In)
                  </div>
                  <p className="text-muted-foreground text-[11px]">นำเข้าวัสดุสู่คลังสินค้าแบบรายรายการ หรือผ่านไฟล์ CSV</p>
                  <code className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">stock_in.view</code>
                </div>

                <div className="p-3 rounded-xl neu-pressed-sm bg-white/40 dark:bg-black/20 text-xs space-y-1">
                  <div className="font-semibold flex items-center gap-1.5 text-foreground">
                    <ArrowUpFromLine className="w-4 h-4 text-amber-600" /> เบิกจ่าย (Withdrawals)
                  </div>
                  <p className="text-muted-foreground text-[11px]">สร้างคำขอเบิกจ่าย ตะกร้าสินค้า POS และตรวจสอบบิล</p>
                  <code className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">withdrawals.view</code>
                </div>

                <div className="p-3 rounded-xl neu-pressed-sm bg-white/40 dark:bg-black/20 text-xs space-y-1">
                  <div className="font-semibold flex items-center gap-1.5 text-foreground">
                    <History className="w-4 h-4 text-indigo-600" /> ประวัติ (History)
                  </div>
                  <p className="text-muted-foreground text-[11px]">ตรวจสอบประวัติธุรกรรมสต็อกและการเบิกจ่ายย้อนหลัง</p>
                  <code className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">history.view</code>
                </div>

                <div className="p-3 rounded-xl neu-pressed-sm bg-white/40 dark:bg-black/20 text-xs space-y-1">
                  <div className="font-semibold flex items-center gap-1.5 text-foreground">
                    <FileText className="w-4 h-4 text-rose-600" /> รายงาน (Reports)
                  </div>
                  <p className="text-muted-foreground text-[11px]">ออกรายงานสรุปยอด และส่งออกไฟล์ Excel/PDF</p>
                  <code className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">reports.view</code>
                </div>

                <div className="p-3 rounded-xl neu-pressed-sm bg-white/40 dark:bg-black/20 text-xs space-y-1">
                  <div className="font-semibold flex items-center gap-1.5 text-foreground">
                    <Users className="w-4 h-4 text-cyan-600" /> จัดการผู้ใช้ (Users)
                  </div>
                  <p className="text-muted-foreground text-[11px]">บริหารจัดการบัญชีผู้ใช้งาน สิทธิ์โครงการ และรหัสผ่าน</p>
                  <code className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">users.view</code>
                </div>

                <div className="p-3 rounded-xl neu-pressed-sm bg-white/40 dark:bg-black/20 text-xs space-y-1">
                  <div className="font-semibold flex items-center gap-1.5 text-foreground">
                    <Shield className="w-4 h-4 text-purple-600 font-bold" /> จัดการสิทธิ์ (RBAC)
                  </div>
                  <p className="text-muted-foreground text-[11px]">สร้างบทบาท กำหนดสีป้าย และปรับแต่งแคตตาล็อกสิทธิ์</p>
                  <code className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">roles.view</code>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* SECTION 2: Staff / Requester Workflow */}
        {(activeCategory === 'all' || activeCategory === 'staff') && (
          <Card className="neu-flat border-0 border-l-4 border-l-blue-500 overflow-hidden">
            <CardHeader className="bg-blue-500/5 pb-4">
              <CardTitle className="text-lg font-bold flex items-center gap-2 text-blue-600">
                <User className="w-5 h-5" />
                2. ขั้นตอนสำหรับเจ้าหน้าที่ / ผู้ขอเบิก (STAFF / REQUESTER)
              </CardTitle>
              <CardDescription className="text-xs">
                คำแนะนำสำหรับการตรวจสอบสต็อกและการสร้างบิลขอเบิกจ่ายวัสดุอุปกรณ์
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4 space-y-5 text-sm">
              <div className="space-y-2">
                <h3 className="font-bold text-foreground border-b border-border pb-1">2.1 การตรวจสอบสต็อกคงเหลือและการเลือกโครงการ</h3>
                <ul className="list-disc list-inside text-xs text-muted-foreground space-y-1.5 ml-1">
                  <li>ไปที่เมนู <strong className="text-foreground">เบิกจ่าย (Withdrawals)</strong> หรือ <strong className="text-foreground">รายการวัสดุ (Items Master)</strong></li>
                  <li>เลือกโครงการที่คุณต้องการเบิกวัสดุ (ระบบจะแสดงเฉพาะโครงการที่คุณได้รับสิทธิ์ใน <strong className="text-foreground font-semibold">Project Access</strong> เท่านั้น)</li>
                  <li>ตรวจสอบรายการวัสดุ และจำนวนคงเหลือที่พร้อมเบิก (Available Stock)</li>
                </ul>
              </div>

              <div className="space-y-2">
                <h3 className="font-bold text-foreground border-b border-border pb-1">2.2 การสร้างบิลขอเบิกจ่ายด้วยระบบ POS Terminal</h3>
                <ul className="list-disc list-inside text-xs text-muted-foreground space-y-1.5 ml-1">
                  <li>กดปุ่ม <strong className="text-primary font-semibold">+ สร้างคำขอเบิกจ่าย (POS)</strong> เพื่อเปิดระบบตะกร้าสินค้า</li>
                  <li>เลือกวัสดุที่ต้องการลงตะกร้า ปรับเพิ่ม/ลดจำนวนชิ้นตามความจำเป็น</li>
                  <li>กดปุ่ม <strong className="text-primary font-semibold">"ยืนยันและสรุปบิล" (Checkout)</strong></li>
                  <li>เลือกระบุสถานที่จัดเก็บ (Location) และวัตถุประสงค์ในการนำไปใช้งาน จากนั้นกดยืนยันส่งคำขอ</li>
                </ul>
              </div>

              <div className="space-y-2">
                <h3 className="font-bold text-foreground border-b border-border pb-1">2.3 วงจรสถานะของคำขอเบิก (Withdrawal Status Lifecycle)</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-xs pt-1">
                  <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300">
                    <span className="font-bold block">1. รออนุมัติ (Pending)</span>
                    <span className="text-[11px]">ส่งคำขอแล้ว อยู่ระหว่างรอ Supervisor/Admin ตรวจสอบสต็อก</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-800 dark:text-blue-300">
                    <span className="font-bold block">2. อนุมัติแล้ว (Approved)</span>
                    <span className="text-[11px]">คำขอผ่านการอนุมัติแล้ว สามารถติดต่อขอรับวัสดุได้</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-800 dark:text-red-300">
                    <span className="font-bold block">3. ปฏิเสธ (Rejected)</span>
                    <span className="text-[11px]">บิลถูกยกเลิก (มักเกิดจากวัสดุในคลังมีไม่พอสำหรับทั้งบิล)</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300">
                    <span className="font-bold block">4. ส่งมอบสำเร็จ (Completed)</span>
                    <span className="text-[11px]">ได้รับวัสดุเรียบร้อยแล้ว ยอดสต็อกถูกตัดจำหน่ายสมบูรณ์</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* SECTION 3: Withdrawal Rules & All-or-Nothing Approval */}
        {(activeCategory === 'all' || activeCategory === 'staff' || activeCategory === 'supervisor') && (
          <Card className="neu-flat border-0 border-l-4 border-l-amber-500 overflow-hidden">
            <CardHeader className="bg-amber-500/5 pb-4">
              <CardTitle className="text-lg font-bold flex items-center gap-2 text-amber-700 dark:text-amber-400">
                <AlertTriangle className="w-5 h-5" />
                3. กฎความปลอดภัยการอนุมัติแบบ All-or-Nothing และ Race Condition Protection
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-3 text-sm">
              <p className="text-muted-foreground leading-relaxed">
                เพื่อความถูกต้องสมบูรณ์ของบัญชีคลังสินค้า ระบบ StockFlow บังคับใช้หลักการอนุมัติแบบ <strong className="text-foreground">Transaction เดียวกันทั้งบิล (All-or-Nothing Approval)</strong>:
              </p>
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs space-y-2">
                <p className="font-semibold">
                  * หากคำขอเบิกจ่ายประกอบด้วยวัสดุหลายรายการ ทุกรายการในบิลนั้นจะต้องมีสต็อกคงเหลือเพียงพอในขณะที่อนุมัติพร้อมกันทั้งหมด
                </p>
                <p>
                  หากวัสดุรายการใดรายการหนึ่งมีไม่เพียงพอ ระบบจะไม่ยอมให้อนุมัติเฉพาะบางชิ้น (Prevent Partial Deduction) ผู้อนุมัติจำเป็นต้องกด <span className="font-bold text-red-600">"ปฏิเสธ" (Reject)</span> ทั้งบิล และให้ผู้เบิกทำรายการเบิกเข้ามาใหม่เฉพาะรายการที่มีสินค้า
                </p>
                <p className="text-[11px] opacity-90">
                  * ระบบมีการตรวจสอบสต็อกซ้ำแบบ Atomic Transaction ในระดับฐานข้อมูล เพื่อป้องกันปัญหาคำขอซ้อนทับ (Race Condition) และยอดสต็อกติดลบ
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* SECTION 4: Supervisor & Admin Guide */}
        {(activeCategory === 'all' || activeCategory === 'supervisor' || activeCategory === 'admin') && (
          <Card className="neu-flat border-0 border-l-4 border-l-purple-500 overflow-hidden">
            <CardHeader className="bg-purple-500/5 pb-4">
              <CardTitle className="text-lg font-bold flex items-center gap-2 text-purple-600">
                <ShieldCheck className="w-5 h-5" />
                4. สำหรับผู้อนุมัติและผู้ดูแลระบบ (SUPERVISOR & ADMINISTRATOR)
              </CardTitle>
              <CardDescription className="text-xs">
                การรับเข้าสต็อก การพิจารณาอนุมัติบิล และการออกรายงาน
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4 space-y-5 text-sm">
              <div className="space-y-2">
                <h3 className="font-bold text-foreground border-b border-border pb-1">4.1 การรับเข้า Stock (Stock In Workflow)</h3>
                <ul className="list-disc list-inside text-xs text-muted-foreground space-y-1.5 ml-1">
                  <li>ไปที่เมนู <strong className="text-foreground">รับเข้า Stock</strong> กดปุ่ม <strong className="text-primary font-semibold">+ บันทึกรับเข้าสต็อก</strong></li>
                  <li><strong className="text-foreground font-semibold">Direct Receipt:</strong> เลือกสถานที่จัดเก็บ (Location) กรอกรหัส SKU ชื่อวัสดุ จำนวน และ Serial/Part Number โดยตรง</li>
                  <li><strong className="text-foreground font-semibold">CSV Import:</strong> อัปโหลดไฟล์ Excel/CSV (UTF-8 Encoding) ปริมาณมากเข้าสู่คลังโครงการได้ในครั้งเดียว</li>
                </ul>
              </div>

              <div className="space-y-2">
                <h3 className="font-bold text-foreground border-b border-border pb-1">4.2 การพิจารณาและอนุมัติบิลเบิกจ่าย</h3>
                <ul className="list-disc list-inside text-xs text-muted-foreground space-y-1.5 ml-1">
                  <li>ไปที่เมนู <strong className="text-foreground">เบิกจ่าย (Withdrawals)</strong> กดเลือกบิลที่อยู่ในสถานะ <span className="text-amber-500 font-semibold">รออนุมัติ</span></li>
                  <li>ตรวจสอบรายการและจำนวนที่ขอเบิก หากสต็อกพร้อม ให้กดปุ่ม <span className="text-emerald-600 font-semibold flex items-center gap-1 inline-flex"><CheckCircle2 className="w-3.5 h-3.5"/> "อนุมัติคำขอ"</span></li>
                  <li>หากสต็อกไม่เพียงพอ ให้กดปุ่ม <span className="text-red-500 font-semibold flex items-center gap-1 inline-flex"><XCircle className="w-3.5 h-3.5"/> "ปฏิเสธคำขอ"</span> พร้อมระบุสาเหตุ</li>
                </ul>
              </div>

              <div className="space-y-2">
                <h3 className="font-bold text-foreground border-b border-border pb-1">4.3 การจัดการโครงการและทะเบียนวัสดุ (Projects & Items Master)</h3>
                <ul className="list-disc list-inside text-xs text-muted-foreground space-y-1.5 ml-1">
                  <li><strong className="text-foreground">โครงการ:</strong> สามารถเพิ่ม แก้ไข หรือเปลี่ยนสถานะเป็น Inactive (โครงการที่ Inactive จะไม่สามารถทำรายการรับเข้าหรือเบิกจ่ายได้)</li>
                  <li><strong className="text-foreground">รายการวัสดุ Master:</strong> แสดงยอดรวมคลังสินค้า ยอดคงเหลือ และตำแหน่งจัดเก็บแยกตามสถานที่จัดเก็บ (Location) (`[Project Code] — [Project Name]`)</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        )}

        {/* SECTION 5: Admin User Management & Profile Avatar */}
        {(activeCategory === 'all' || activeCategory === 'admin') && (
          <Card className="neu-flat border-0 border-l-4 border-l-cyan-500 overflow-hidden">
            <CardHeader className="bg-cyan-500/5 pb-4">
              <CardTitle className="text-lg font-bold flex items-center gap-2 text-cyan-600">
                <Users className="w-5 h-5" />
                5. การจัดการผู้ใช้งานและรูปโปรไฟล์ (User Management & Profile Upload)
              </CardTitle>
              <CardDescription className="text-xs">
                การบริหารจัดการบัญชีผู้ใช้ สิทธิ์การเข้าถึงโครงการ และคอมโพเนนต์อัปโหลดรูปโปรไฟล์
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4 space-y-5 text-sm">
              <div className="space-y-2">
                <h3 className="font-bold text-foreground border-b border-border pb-1">5.1 ขั้นตอนการสร้างและแก้ไขผู้ใช้งาน</h3>
                <ul className="list-disc list-inside text-xs text-muted-foreground space-y-1.5 ml-1">
                  <li>ไปที่เมนู <strong className="text-foreground">จัดการผู้ใช้ (User Management)</strong> กดปุ่ม <strong className="text-primary font-semibold">+ เพิ่มผู้ใช้งานใหม่</strong></li>
                  <li>กรอกข้อมูลบัญชี: อีเมล, รหัสผ่าน (มีระบบสุ่มรหัสผ่านอัตโนมัติ), ชื่อ-นามสกุล, เบอร์โทรศัพท์ และตำแหน่งงาน</li>
                  <li><strong className="text-foreground font-semibold">การจัดการรูปโปรไฟล์ (Profile Avatar Upload):</strong>
                    <ul className="list-circle list-inside ml-4 mt-1 space-y-1 text-muted-foreground">
                      <li>กดปุ่ม <span className="text-primary font-medium">"อัปโหลดรูปโปรไฟล์"</span> เพื่อเลือกไฟล์ภาพจากเครื่อง (รองรับไฟล์ JPG, PNG และ WebP)</li>
                      <li>ระบบจะแสดงตัวอย่างภาพขนาด 56x56 พิกเซลทันที (Immediate Local Preview)</li>
                      <li>หากไม่มีการเลือกรูปภาพ ระบบจะดึงตัวอักษรแรกของชื่อ (Initial Avatar) มาแสดงผลโดยอัตโนมัติ</li>
                      <li>รูปภาพจะถูกจัดเก็บเข้าสู่ Cloudflare R2 Object Storage (`avatars` folder) โดยอัตโนมัติเมื่อกดบันทึก</li>
                    </ul>
                  </li>
                  <li>ระบุบทบาท (Role) และสถานะบัญชี (Active / Inactive)</li>
                </ul>
              </div>

              <div className="space-y-2">
                <h3 className="font-bold text-foreground border-b border-border pb-1">5.2 การกำหนดสิทธิ์โครงการ (Project Access Scope)</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-xl neu-pressed-sm bg-blue-500/10 border border-blue-500/20">
                    <span className="font-bold text-blue-700 dark:text-blue-300 block mb-1">1. เข้าถึงได้ทุกโครงการ (All Projects)</span>
                    <p className="text-muted-foreground text-[11px]">ผู้ใช้สามารถมองเห็นสต็อกและทำรายการเบิกจ่ายได้กับทุกโครงการในระบบ (เหมาะสำหรับ Admin / คลังสินค้ากลาง)</p>
                  </div>
                  <div className="p-3 rounded-xl neu-pressed-sm bg-purple-500/10 border border-purple-500/20">
                    <span className="font-bold text-purple-700 dark:text-purple-300 block mb-1">2. เลือกเฉพาะโครงการ (Selected Projects Only)</span>
                    <p className="text-muted-foreground text-[11px]">ผู้ใช้จะมองเห็นสต็อกและทำรายการได้เฉพาะโครงการที่ถูกติ๊กเลือกไว้เท่านั้น (จำกัดขอบเขตข้อมูลทั้งฝั่ง UI และ Server-side)</p>
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-500/10 border border-slate-500/20 text-xs text-muted-foreground space-y-1">
                <span className="font-semibold text-foreground block">* ข้อแนะนำการระงับบัญชี (Active vs Inactive Account):</span>
                <p>
                  สำหรับผู้ใช้ที่มีประวัติการทำรายการเบิกจ่ายในอดีต <strong className="text-foreground">ควรเปลี่ยนสถานะเป็น Inactive แทนการลบบัญชี</strong> เพื่อรักษาความถูกต้องของประวัติธุรกรรมสต็อกและ Audit Log ย้อนหลัง (บัญชี Inactive จะไม่สามารถเข้าสู่ระบบหรือทำรายการได้ แต่ข้อมูลประวัติเดิมจะไม่สูญหาย)
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* SECTION 6: Dynamic RBAC & Role Management */}
        {(activeCategory === 'all' || activeCategory === 'admin') && (
          <Card className="neu-flat border-0 border-l-4 border-l-purple-600 overflow-hidden">
            <CardHeader className="bg-purple-600/5 pb-4">
              <CardTitle className="text-lg font-bold flex items-center gap-2 text-purple-600">
                <Shield className="w-5 h-5" />
                6. ระบบจัดการบทบาทและสิทธิ์ใช้งาน (Dynamic RBAC System)
              </CardTitle>
              <CardDescription className="text-xs">
                การสร้างบทบาทแบบกำหนดเอง การเปิด-ปิดสิทธิ์แยกตามหมวดหมู่ และเงื่อนไขความปลอดภัย
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4 space-y-5 text-sm">
              <div className="p-4 rounded-xl neu-pressed-sm bg-white/40 dark:bg-black/20 space-y-3">
                <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-500" />
                  แนวคิดหลักของระบบสิทธิ์ (Core Concepts)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <div className="p-2.5 rounded-lg bg-purple-500/10 border border-purple-500/30">
                    <strong className="text-purple-700 dark:text-purple-300 block mb-1">1. บทบาท (Role)</strong>
                    <span>คือกลุ่มของสิทธิ์ผู้ใช้ เช่น `STAFF`, `SUPERVISOR`, `ADMIN` หรือบทบาทที่สร้างขึ้นเอง</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/30">
                    <strong className="text-blue-700 dark:text-blue-300 block mb-1">2. สิทธิ์ (Permission)</strong>
                    <span>คือการกระทำเฉพาะเจาะจงที่ทำได้ เช่น `projects.view`, `withdrawals.approve`, `users.create`</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                    <strong className="text-emerald-700 dark:text-emerald-300 block mb-1">3. ขอบเขตโครงการ (Project Access)</strong>
                    <span>คือขอบเขตพื้นที่โครงการที่ผู้ใช้สามารถเข้าถึงข้อมูลและดำเนินรายการได้</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="font-bold text-foreground border-b border-border pb-1">6.1 การจัดการบทบาทในหน้า Role Management (`/roles`)</h3>
                <ul className="list-disc list-inside text-xs text-muted-foreground space-y-1.5 ml-1">
                  <li><strong className="text-foreground">Role Cards Grid:</strong> แสดงการ์ดบทบาททั้งหมด พร้อมธีมสีป้าย (Badge Theme), รหัสบทบาท (Role Code), จำนวนผู้ใช้ (`ผู้ใช้: X`), และจำนวนสิทธิ์ (`สิทธิ์: Y`)</li>
                  <li><strong className="text-foreground">+ เพิ่มบทบาท (Add Role):</strong> สามารถสร้างบทบาทใหม่ กำหนดรหัส (เช่น `WAREHOUSE_MANAGER`) ชื่อบทบาท คำอธิบาย และเลือกสีป้าย Badge พร้อมตัวอย่างพรีวิวสด</li>
                  <li><strong className="text-purple-600 font-semibold">กำหนดสิทธิ์ (Permissions Configuration):</strong> เปิดโมดอลสิทธิ์เพื่อติ๊กเปิด-ปิดสิทธิ์การใช้งานรายหมวดหมู่ (มีระบบ <strong className="text-foreground">Permission Dependency Engine</strong> ช่วยเปิดสิทธิ์ที่เกี่ยวเนื่องให้อัตโนมัติ เช่น เปิด `projects.create` จะเปิด `projects.view` ให้ทันที)</li>
                </ul>
              </div>

              <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/30 text-xs text-purple-900 dark:text-purple-200 space-y-1">
                <span className="font-semibold block flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-purple-600" />
                  นโยบายความปลอดภัยของระบบบทบาท (System Role Protection & Last Admin Safeguard):
                </span>
                <ul className="list-disc list-inside space-y-1 text-[11px] opacity-90 pl-1">
                  <li>บทบาทหลักของระบบ (`ADMIN`, `STAFF`, `SUPERVISOR`) ถูกล็อกไม่ให้ลบได้เพื่อป้องกันโครงสร้างระบบเสียหาย</li>
                  <li>บทบาทที่สร้างขึ้นเอง หากยังมีผู้ใช้งานผูกอยู่ ระบบจะไม่ยินยอมให้ลบ เพื่อป้องกันผู้ใช้หลุดจากระบบ</li>
                  <li>ระบบมีกลไกป้องกันการปลดสิทธิ์ Admin หรือปิดใช้งานบัญชี Admin คนสุดท้าย (Last Admin Safeguard) ทั้งฝั่ง Frontend และ Database Triggers</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        )}

        {/* SECTION 7: Admin Security Notes */}
        {(activeCategory === 'all' || activeCategory === 'admin') && (
          <Card className="neu-flat border-0 border-l-4 border-l-red-500 overflow-hidden">
            <CardHeader className="bg-red-500/5 pb-4">
              <CardTitle className="text-lg font-bold flex items-center gap-2 text-red-600">
                <AlertTriangle className="w-5 h-5 text-red-600" />
                7. ข้อควรระวังและแนวทางความปลอดภัยสำหรับผู้ดูแลระบบ (Admin Security Notes)
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-3 text-xs text-muted-foreground">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-red-500/5 border border-red-500/20 space-y-1">
                  <span className="font-bold text-red-600 block">1. หลักการกำหนดสิทธิ์เท่าที่จำเป็น (Least Privilege):</span>
                  <p>ไม่ควรมอบบทบาท ADMINISTRATOR หรือสิทธิ์ระดับสูงให้แก่ผู้ใช้ทั่วไป หากต้องการให้ปฏิบัติงานเฉพาะส่วน ให้สร้าง Custom Role หรือกำหนดสิทธิ์รายหมวดหมู่แทน</p>
                </div>

                <div className="p-3 rounded-xl bg-red-500/5 border border-red-500/20 space-y-1">
                  <span className="font-bold text-red-600 block">2. การเลือกใช้วิธี Deactivate แทนการลบบัญชี:</span>
                  <p>หลีกเลี่ยงการลบบัญชีผู้ใช้ที่มีประวัติทำรายการในคลังสินค้า ให้ใช้วิธีเปลี่ยนสถานะเป็น INACTIVE เพื่อคงความสมบูรณ์ของประวัติและ Audit Trail</p>
                </div>

                <div className="p-3 rounded-xl bg-red-500/5 border border-red-500/20 space-y-1">
                  <span className="font-bold text-red-600 block">3. การตรวจสอบ Project Access เสมอ:</span>
                  <p>ทุกครั้งที่สร้างหรือแก้ไขผู้ใช้ ให้ตรวจสอบให้แน่ใจว่าเลือกสิทธิ์โครงการ (All Projects หรือ Selected Projects) ได้ถูกต้องตรงกับไซต์งานจริงของผู้ใช้</p>
                </div>

                <div className="p-3 rounded-xl bg-red-500/5 border border-red-500/20 space-y-1">
                  <span className="font-bold text-red-600 block">4. การรักษาความปลอดภัยรหัสผ่าน:</span>
                  <p>เมื่อใช้วิธีสุ่มรหัสผ่านชั่วคราวให้ผู้ใช้ใหม่ ให้กำชับให้ผู้ใช้เข้าเปลี่ยนรหัสผ่านทันทีหลังเข้าสู่ระบบครั้งแรก และห้ามแชร์รหัสผ่านร่วมกัน</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

      </div>
    </div>
  );
};

export default Manual;
