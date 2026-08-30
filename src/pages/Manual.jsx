import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  BookOpen, AlertTriangle, ShieldCheck, User, CheckCircle2, XCircle, 
  Search, Users, Shield, KeyRound, FolderKanban, ArrowDownToLine, 
  ArrowUpFromLine, History, FileText, Lock, Sparkles, ExternalLink,
  Package, Clock, RefreshCw, Layers, CheckSquare, ChevronRight,
  HelpCircle, SlidersHorizontal, ArrowLeftRight, Settings, Info,
  FileSpreadsheet, AlertCircle, BookmarkCheck, Zap
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const Manual = () => {
  const navigate = useNavigate();
  const { isAdmin, can, role } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeRoleFilter, setActiveRoleFilter] = useState('all'); // 'all' | 'staff' | 'supervisor' | 'admin' | 'checkouts' | 'inventory'

  const roleFilters = [
    { id: 'all', label: 'ทั้งหมด (All Sections)', icon: BookOpen },
    { id: 'staff', label: 'เจ้าหน้าที่ / ผู้ขอเบิก (Staff)', icon: User, color: 'text-blue-500' },
    { id: 'supervisor', label: 'หัวหน้างาน / ผู้อนุมัติ (Supervisor)', icon: ShieldCheck, color: 'text-emerald-500' },
    { id: 'admin', label: 'ผู้ดูแลระบบ (Admin & RBAC)', icon: Shield, color: 'text-purple-500' },
    { id: 'checkouts', label: 'ยืม-คืนอุปกรณ์ (Checkouts & Returns)', icon: ArrowLeftRight, color: 'text-amber-500' },
    { id: 'inventory', label: 'สต็อกและรับเข้า (Inventory & Stock-In)', icon: Package, color: 'text-cyan-500' },
  ];

  // Comprehensive documentation catalog
  const manualSections = [
    {
      id: 'sidebar-navigation',
      category: ['staff', 'supervisor', 'admin'],
      title: '1. สถาปัตยกรรมเมนูและระบบควบคุมการมองเห็น (Navigation & RBAC Visibility)',
      shortDesc: 'ภาพรวมโครงสร้างเมนูและการเปิด-ปิดการแสดงผลตามสิทธิ์การใช้งานจริง',
      icon: Layers,
      iconColor: 'text-primary',
      badgeColor: 'border-l-primary',
      path: '/dashboard',
      roles: ['STAFF', 'SUPERVISOR', 'ADMIN'],
      permissions: ['dashboard.view', 'projects.view', 'items.view'],
      whatItDoes: 'แถบเมนูด้านข้าง (Sidebar) และปุ่มคำสั่งในระบบ StockFlow เป็นแบบ Dynamic Context-Aware โดยเมนูจะแสดงขึ้นเฉพาะเมื่อบัญชีของคุณได้รับสิทธิ์ (Permission) ที่ตรงกับโมดูลนั้นๆ หากเมนูใดไม่ปรากฏแสดงว่าบทบาทของคุณไม่ได้รับสิทธิ์เข้าถึง',
      whoCanUse: 'ผู้ใช้งานทุกคนในระบบ โดยสิทธิ์การมองเห็นจะแปรผันตามบทบาทที่ได้รับมอบหมาย',
      steps: [
        'ตรวจสอบเมนูที่ได้รับอนุญาตในแถบด้านข้าง (Sidebar)',
        'เมื่อเลือกเมนู ระบบจะตรวจสอบสิทธิ์ซ้ำทั้งฝั่ง Frontend Router และ Database RLS',
        'หากต้องการเข้าถึงเมนูเพิ่มเติม กรุณาติดต่อ Administrator เพื่อขอรับสิทธิ์ในหน้าจัดการบทบาท (/roles)'
      ],
      proTips: 'ผู้ดูแลระบบสามารถปรับแต่งการเปิด-ปิดเมนูของแต่ละบทบาทได้ทันทีผ่านหน้า /roles โดยไม่ต้องแก้ไขโค้ดโปรแกรม',
      warnings: 'การเข้าถึง URL โดยตรงโดยไม่มีสิทธิ์จะถูกระบบรักษาความปลอดภัยปฏิเสธการเข้าถึง (403 Forbidden)'
    },
    {
      id: 'staff-requisition-pos',
      category: ['staff'],
      title: '2. การตรวจสอบสต็อกและขอเบิกจ่ายวัสดุ (Withdrawals POS Terminal)',
      shortDesc: 'ขั้นตอนการเลือกโครงการ ตรวจสอบยอดคงเหลือ และสร้างคำขอเบิกจ่ายผ่านตะกร้าสินค้า',
      icon: ArrowUpFromLine,
      iconColor: 'text-blue-500',
      badgeColor: 'border-l-blue-500',
      path: '/withdrawals',
      roles: ['STAFF', 'SUPERVISOR', 'ADMIN'],
      permissions: ['withdrawals.view', 'withdrawals.create'],
      whatItDoes: 'ระบบหน้าต่างขอเบิกจ่ายวัสดุแบบ POS Terminal ช่วยให้ผู้ปฏิบัติงานสามารถเลือกโครงการ ค้นหาวัสดุ ตรวจสอบยอดคงเหลือจริง และส่งคำขอเบิกจ่ายพร้อมกันหลายรายการในบิลเดียวได้อย่างสะดวกรวดเร็ว',
      whoCanUse: 'เจ้าหน้าที่ผู้ขอเบิก (Staff / Requester) และทุกบทบาทที่มีสิทธิ์ withdrawals.create',
      steps: [
        'ไปที่เมนู "เบิกจ่าย (Withdrawals)" แล้วเลือกโครงการเป้าหมายในแถบตัวเลือกโครงการ',
        'กดปุ่ม "+ สร้างคำขอเบิกจ่าย (POS)" เพื่อเปิดระบบตะกร้าสินค้า',
        'ค้นหาวัสดุที่ต้องการ ระบุจำนวน และกด "เพิ่มลงตะกร้า" (ระบบจะแจ้งเตือนหากจำนวนเกินสต็อกคงเหลือ)',
        'เลือกระบุสถานที่จัดเก็บ (Storage Location) และวัตถุประสงค์ในการนำไปใช้งาน',
        'ตรวจสอบความถูกต้องแล้วกด "ยืนยันและสรุปบิล (Submit Request)"'
      ],
      proTips: 'สามารถใช้งานระบบ Site Kits / BOM Requisition เพื่อดึงชุดวัสดุมาตรฐานของงานนั้นๆ ลงตะกร้าได้ในคลิกเดียวโดยไม่ต้องเลือกทีละรายการ',
      warnings: 'บิลขอเบิกจ่ายจะถูกตรวจสอบสต็อกแบบ All-or-Nothing ในขณะที่ผู้อนุมัติตรวจสอบ หากรายการใดรายการหนึ่งหมด บิลจะถูกปฏิเสธทั้งชุด'
    },
    {
      id: 'withdrawal-status-lifecycle',
      category: ['staff', 'supervisor'],
      title: '3. วงจรสถานะคำขอเบิกจ่าย (Withdrawal Status Lifecycle)',
      shortDesc: 'ทำความเข้าใจ 4 สถานะของคำขอเบิกจ่ายตั้งแต่เริ่มส่งคำขอจนถึงการตัดสต็อกสมบูรณ์',
      icon: Clock,
      iconColor: 'text-amber-500',
      badgeColor: 'border-l-amber-500',
      path: '/withdrawals',
      roles: ['STAFF', 'SUPERVISOR', 'ADMIN'],
      permissions: ['withdrawals.view'],
      whatItDoes: 'แสดงความคืบหน้าของคำขอเบิกจ่ายแต่ละบิลอย่างโปร่งใส เพื่อให้ผู้ขอเบิกและผู้อนุมัติติดตามสถานะได้อย่างแม่นยำ',
      whoCanUse: 'ผู้ขอเบิก ผู้อนุมัติ และผู้ดูแลระบบ',
      steps: [
        '1. รออนุมัติ (Pending): ส่งคำขอเข้าระบบแล้ว อยู่ระหว่างรอ Supervisor / Admin ตรวจสอบสต็อก',
        '2. อนุมัติแล้ว (Approved): คำขอผ่านการตรวจสอบแล้ว ผู้เบิกสามารถติดต่อรับวัสดุได้ที่คลังสินค้า',
        '3. ส่งมอบสำเร็จ (Completed): ผู้ขอเบิกได้รับวัสดุครบถ้วน ระบบตัดลดยอดสต็อกออกจากคลังสมบูรณ์',
        '4. ปฏิเสธ (Rejected): คำขอไม่ผ่านการอนุมัติ (เช่น สต็อกไม่พอ หรือข้อมูลไม่ถูกต้อง) พร้อมระบุเหตุผล'
      ],
      proTips: 'ผู้ขอเบิกสามารถเปิดดูประวัติและเหตุผลการปฏิเสธได้ในหน้ารายละเอียดบิลเพื่อนำไปปรับปรุงและส่งคำขอใหม่',
      warnings: 'ยอดสต็อกจะยังไม่ถูกตัดจำหน่ายจริงจนกว่าบิลจะได้รับการอนุมัติ (Approved) หรือบันทึกส่งมอบสำเร็จ (Completed)'
    },
    {
      id: 'checkouts-and-returns',
      category: ['staff', 'checkouts'],
      title: '4. การยืม-คืนเครื่องมือและอุปกรณ์ (Checkouts & Tools Borrowing)',
      shortDesc: 'การบันทึกขอยืมเครื่องมือ กำหนดวันส่งคืน การขอขยายเวลา และการรับคืนเข้าคลัง',
      icon: ArrowLeftRight,
      iconColor: 'text-amber-500',
      badgeColor: 'border-l-amber-500',
      path: '/checkouts',
      roles: ['STAFF', 'SUPERVISOR', 'ADMIN'],
      permissions: ['checkouts.view', 'checkouts.create', 'checkouts.return', 'checkouts.extend'],
      whatItDoes: 'บริหารจัดการเครื่องมือช่างและอุปกรณ์หมุนเวียน (Returnable Assets) ที่ต้องนำมาคืนเมื่อเสร็จสิ้นภารกิจ มีระบบนับถอยหลังวันครบกำหนดส่งคืน (Due Date) และระบบขอขยายเวลาส่งคืน',
      whoCanUse: 'ผู้ขอเบิกยืมเครื่องมือ และผู้ดูแลคลังที่ทำหน้าที่ตรวจรับอุปกรณ์คืน',
      steps: [
        'การยืม: ไปที่เมนู "ยืม-คืนอุปกรณ์ (Checkouts)" กด "+ บันทึกการยืมเครื่องมือ" ระบุผู้ยืม วันที่ต้องส่งคืน และหมายเลข Serial Number',
        'การตรวจสอบ: หน้าจอจะแสดงสถานะการยืม (กำลังยืม / ใกล้ครบกำหนด / เกินกำหนดส่งคืน - Overdue)',
        'การขอต่ออายุ (Extend Due Date): หากงานยังไม่เสร็จ ให้กดปุ่ม "ขอขยายเวลาส่งคืน" และระบุวันที่ใหม่พร้อมเหตุผล',
        'การคืนอุปกรณ์: เมื่อนำเครื่องมือมาคืน เจ้าหน้าที่คลังจะกด "บันทึกรับคืน (Return)" ตรวจสอบสภาพเครื่องมือ และกดยืนยันเพื่อนำยอดเครื่องมือกลับเข้าสต็อก'
      ],
      proTips: 'ระบบจะแสดง Badge สีแดงและแจ้งเตือนสำหรับรายการที่เกินกำหนดส่งคืน (Overdue) เพื่อให้ติดตามทรัพย์สินได้ทันท่วงที',
      warnings: 'การรับคืนอุปกรณ์จะต้องตรวจสอบสภาพความสมบูรณ์ของเครื่องมือก่อนกดยืนยันรับคืนเข้าสู่คลัง'
    },
    {
      id: 'supervisor-approval-workflow',
      category: ['supervisor'],
      title: '5. ขั้นตอนการพิจารณาและอนุมัติบิลเบิกจ่าย (Supervisor Approval Workflow)',
      shortDesc: 'แนวทางการตรวจสอบสต็อก การอนุมัติทั้งบิล และกฎ All-or-Nothing ป้องกันสต็อกติดลบ',
      icon: CheckCircle2,
      iconColor: 'text-emerald-500',
      badgeColor: 'border-l-emerald-500',
      path: '/withdrawals',
      roles: ['SUPERVISOR', 'ADMIN'],
      permissions: ['withdrawals.approve', 'withdrawals.reject'],
      whatItDoes: 'กระบวนการพิจารณาคำขอเบิกจ่ายอย่างปลอดภัย โดยระบบจะคำนวณยอดคงเหลือแบบ Real-time และบังคับใช้หลักการ All-or-Nothing Transaction เพื่อป้องกันข้อผิดพลาดทางบัญชีคลังสินค้า',
      whoCanUse: 'ผู้จัดการ หัวหน้างาน (Supervisor) และผู้ดูแลระบบ (Admin)',
      steps: [
        'ไปที่เมนู "เบิกจ่าย (Withdrawals)" และกรองเลือกสถานะ "รออนุมัติ (Pending)"',
        'กดเลือกบิลที่ต้องการพิจารณาเพื่อดูรายการวัสดุ จำนวนที่ขอเบิก และสต็อกที่พร้อมจ่าย',
        'หากสต็อกมีเพียงพอครบทุกรายการ ให้กดปุ่ม "อนุมัติคำขอ (Approve)"',
        'หากสต็อกไม่เพียงพอแม้แต่รายการเดียว ให้กดปุ่ม "ปฏิเสธคำขอ (Reject)" และระบุสาเหตุเพื่อให้ผู้เบิกทราบ'
      ],
      proTips: 'ระบบใช้ Row-Level Locking ในระดับ PostgreSQL ทำให้ผู้อนุมัติหลายคนสามารถทำงานพร้อมกันได้โดยไม่เกิดปัญหาสต็อกเบิกซ้ำซ้อน (Race Condition)',
      warnings: 'ระบบไม่อนุญาตให้อนุมัติเฉพาะบางรายการในบิล (Partial Approval) เพื่อรักษาความถูกต้องของเอกสารและการเบิกจ่าย'
    },
    {
      id: 'stock-in-inventory-management',
      category: ['supervisor', 'inventory'],
      title: '6. การรับเข้าสต็อกสินค้าและนำเข้าไฟล์ (Stock In & CSV Import)',
      shortDesc: 'การบันทึกรับเข้าวัสดุสู่คลังสินค้าแบบรายรายการ และการนำเข้าข้อมูลล็อตใหญ่ผ่านไฟล์ CSV/Excel',
      icon: ArrowDownToLine,
      iconColor: 'text-cyan-500',
      badgeColor: 'border-l-cyan-500',
      path: '/stock-in',
      roles: ['SUPERVISOR', 'ADMIN'],
      permissions: ['stock_in.view', 'stock_in.create'],
      whatItDoes: 'บันทึกการเติมสต็อกวัสดุและอุปกรณ์เข้าสู่โครงการ รองรับทั้งการคีย์รับเข้ารายชิ้น (Direct Receipt) และการอัปโหลดไฟล์ CSV/Excel ปริมาณมากเข้าสู่คลังสินค้าในครั้งเดียว',
      whoCanUse: 'เจ้าหน้าที่คลังสินค้า ผู้อนุมัติ (Supervisor) และผู้ดูแลระบบ (Admin)',
      steps: [
        'ไปที่เมนู "รับเข้า Stock (Stock In)" กดปุ่ม "+ บันทึกรับเข้าสต็อก"',
        'แบบรายรายการ (Direct Entry): เลือกสถานที่จัดเก็บ (Location) ค้นหาวัสดุ ระบุจำนวน และหมายเลขเอกสาร PO/ใบส่งของ',
        'แบบไฟล์ CSV: กดแท็บ "นำเข้าไฟล์ CSV/Excel" ดาวน์โหลด Template ตัวอย่าง กรอกข้อมูล และอัปโหลดไฟล์เข้าระบบ',
        'ตรวจสอบตารางพรีวิวความถูกต้องของรายการ และกดยืนยัน "บันทึกรับเข้าสต็อก"'
      ],
      proTips: 'ไฟล์ CSV ควรบันทึกด้วยการเข้ารหัส UTF-8 เพื่อให้รองรับชื่อวัสดุภาษาไทยได้อย่างสมบูรณ์',
      warnings: 'การรับเข้าสต็อกจะเพิ่มยอดคงเหลือทันที กรุณาตรวจสอบรหัส SKU และสถานที่จัดเก็บให้ถูกต้องก่อนกดยืนยัน'
    },
    {
      id: 'stock-adjustment-and-transfer',
      category: ['supervisor', 'inventory'],
      title: '7. การปรับปรุงยอดสต็อกและการโอนย้ายสถานที่จัดเก็บ (Stock Adjustment & Transfer)',
      shortDesc: 'การตรวจนับและปรับยอดสต็อกให้ตรงกับหน้างานจริง พร้อมบันทึกเหตุผลและโอนย้ายข้ามคลัง',
      icon: SlidersHorizontal,
      iconColor: 'text-indigo-500',
      badgeColor: 'border-l-indigo-500',
      path: '/items',
      roles: ['SUPERVISOR', 'ADMIN'],
      permissions: ['items.adjust_stock', 'items.transfer'],
      whatItDoes: 'เครื่องมือสำหรับงานตรวจนับสต็อกประจำงวด (Stock Audit) ให้สามารถปรับเพิ่มหรือลดยอดสต็อกเมื่อเกิดกรณีของชำรุด สูญหาย หรือนับยอดเกิน พร้อมทั้งระบบโอนย้ายวัสดุระหว่างสถานที่จัดเก็บหรือโครงการ',
      whoCanUse: 'Supervisor และ Administrator ที่ได้รับสิทธิ์ items.adjust_stock',
      steps: [
        'ไปที่เมนู "รายการวัสดุ (Items Master)" และค้นหาวัสดุที่ต้องการปรับยอด',
        'กดปุ่ม "ปรับปรุงสต็อก (Adjust Stock)"',
        'ระบุยอดคงเหลือจริงที่ตรวจนับได้ หรือเลือกประเภทการปรับ (เพิ่ม/ลด)',
        'ระบุสาเหตุการปรับยอด (เช่น ตรวจนับประจำปี, สินค้าชำรุดเสียหาย, ปรับปรุงยอดยกมา)',
        'กดยืนยันการปรับปรุง ระบบจะบันทึก Audit Log และอัปเดตยอดคงเหลือทันที'
      ],
      proTips: 'ทุกการปรับยอดสต็อกจะถูกบันทึกประวัติอย่างละเอียดในเมนู "ประวัติ (History)" พร้อมระบุชื่อผู้ดำเนินการและเหตุผล',
      warnings: 'การปรับลดยอดสต็อกจะส่งผลกระทบต่อรายงานต้นทุน ควรได้รับความเห็นชอบจากหัวหน้างานก่อนดำเนินการ'
    },
    {
      id: 'projects-and-items-master',
      category: ['admin'],
      title: '8. การจัดการโครงการและทะเบียนวัสดุ (Projects & Master Catalog)',
      shortDesc: 'การสร้างโครงการ กำหนดสถานที่จัดเก็บ (Locations) และการขึ้นทะเบียนรหัส SKU',
      icon: FolderKanban,
      iconColor: 'text-blue-600',
      badgeColor: 'border-l-blue-600',
      path: '/projects',
      roles: ['ADMIN'],
      permissions: ['projects.create', 'projects.update', 'items.create', 'items.update'],
      whatItDoes: 'ฐานข้อมูลหลักของระบบ (Master Data) สำหรับบริหารจัดการโครงสร้างโครงการ สถานที่จัดเก็บสินค้า และการขึ้นทะเบียนแคตตาล็อกวัสดุและอุปกรณ์ทั้งหมด',
      whoCanUse: 'ผู้ดูแลระบบ (Administrator)',
      steps: [
        'การสร้างโครงการ: ไปที่เมนู "โครงการ (Projects)" กด "+ เพิ่มโครงการใหม่" ระบุรหัสโครงการ ชื่อโครงการ และสถานที่จัดเก็บย่อย',
        'การระงับโครงการ: หากโครงการปิดตัวลง สามารถเปลี่ยนสถานะเป็น Inactive เพื่อไม่ให้มีการทำรายการใหม่ แต่ยังคงดูประวัติย้อนหลังได้',
        'การขึ้นทะเบียนวัสดุ: ไปที่เมนู "รายการวัสดุ (Items Master)" กด "+ เพิ่มรายการวัสดุ" กำหนดรหัส SKU, ชื่อ, หน่วยนับ, และหมวดหมู่'
      ],
      proTips: 'ควรกำหนดรหัสโครงการและรหัส SKU ให้มีรูปแบบมาตรฐาน (เช่น PRJ-001, MAT-ELC-001) เพื่อความสะดวกในการค้นหา',
      warnings: 'โครงการที่ถูกตั้งสถานะเป็น Inactive จะถูกซ่อนจากหน้าจอเบิกจ่ายและรับเข้าสต็อกโดยอัตโนมัติ'
    },
    {
      id: 'user-management-and-avatars',
      category: ['admin'],
      title: '9. การบริหารจัดการผู้ใช้งานและสิทธิ์โครงการ (User Management & Scopes)',
      shortDesc: 'การสร้างบัญชีผู้ใช้ กำหนดบทบาท แผนก สิทธิ์การเข้าถึงโครงการ และรูปโปรไฟล์ Cloudflare R2',
      icon: Users,
      iconColor: 'text-cyan-600',
      badgeColor: 'border-l-cyan-600',
      path: '/users',
      roles: ['ADMIN'],
      permissions: ['users.view', 'users.create', 'users.update', 'users.deactivate'],
      whatItDoes: 'ศูนย์กลางการบริหารบัญชีผู้ใช้งานระบบ StockFlow ควบคุมทั้งข้อมูลโปรไฟล์ แผนก/ตำแหน่งงาน สิทธิ์โครงการที่มองเห็น (Project Scopes) การบังคับเปลี่ยนรหัสผ่าน และรูปโปรไฟล์',
      whoCanUse: 'ผู้ดูแลระบบ (Administrator)',
      steps: [
        'ไปที่เมนู "จัดการผู้ใช้ (Users)" กด "+ เพิ่มผู้ใช้" หรือกดไอคอนดินสอเพื่อแก้ไขผู้ใช้เดิม',
        'TAB 1 (โปรไฟล์): กรอกชื่อ-นามสกุล, เบอร์โทร, แผนก/ฝ่าย, ตำแหน่งงาน, อัปโหลดรูปโปรไฟล์, และเลือก "บังคับเปลี่ยนรหัสผ่านในการเข้าสู่ระบบครั้งถัดไป"',
        'TAB 2 (บทบาทและสิทธิ์): เลือกบทบาทที่ต้องการมอบหมาย และเลือกสถานะบัญชี (ACTIVE / INACTIVE / SUSPENDED)',
        'TAB 3 (การเข้าถึงโครงการ): เลือกว่าต้องการให้ "เข้าถึงได้ทุกโครงการ (All Projects)" หรือ "เลือกเฉพาะโครงการที่ได้รับมอบหมาย (Selected Projects)"',
        'กด "บันทึกการแก้ไข" ข้อมูลจะถูกซิงค์ไปยังฐานข้อมูลและรีเฟรชตารางทันที'
      ],
      proTips: 'ระบบมีกลไก Last Admin Protection ป้องกันไม่ให้เผลอลดระดับหรือระงับบัญชี Administrator คนสุดท้ายของระบบ',
      warnings: 'สำหรับผู้ใช้ที่ลาออก ควรใช้วิธีเปลี่ยนสถานะเป็น INACTIVE แทนการลบบัญชี เพื่อรักษาความสมบูรณ์ของประวัติการเบิกจ่ายและ Audit Logs'
    },
    {
      id: 'dynamic-rbac-role-management',
      category: ['admin'],
      title: '10. ระบบจัดการบทบาทและสิทธิ์การใช้งานไดนามิก (Dynamic RBAC at /roles)',
      shortDesc: 'การสร้างบทบาทแบบกำหนดเอง ปรับแต่งสิทธิ์รายหมวดหมู่ และกำหนดธีมสีป้าย Badge',
      icon: Shield,
      iconColor: 'text-purple-600',
      badgeColor: 'border-l-purple-600',
      path: '/roles',
      roles: ['ADMIN'],
      permissions: ['roles.view', 'roles.create', 'roles.manage_permissions'],
      whatItDoes: 'ระบบบริหารสิทธิ์แบบ Role-Based Access Control ขั้นสูง ช่วยให้ Admin สามารถสร้างบทบาทใหม่ (เช่น WAREHOUSE_MANAGER, SITE_ENGINEER) และกำหนดสิทธิ์การทำงานได้ละเอียดถึง 36+ Permissions',
      whoCanUse: 'ผู้ดูแลระบบสูงสุด (Administrator)',
      steps: [
        'ไปที่เมนู "จัดการบทบาท (RBAC)" ที่หน้า `/roles`',
        'ดูสถิติจำนวนผู้ใช้และจำนวนสิทธิ์ของแต่ละบทบาทบน Role Cards',
        'กด "+ สร้างบทบาทใหม่" กำหนดรหัสบทบาท ชื่อ คำอธิบาย และเลือกสีป้าย Badge พร้อมพรีวิวสด',
        'กดปุ่ม "กำหนดสิทธิ์ (Manage Permissions)" บนการ์ดบทบาท เพื่อติ๊กเปิด-ปิดสิทธิ์การใช้งานรายฟังก์ชัน',
        'ระบบมี Permission Dependency Engine ที่จะช่วยเปิดสิทธิ์ที่เกี่ยวเนื่องให้อัตโนมัติ (เช่น เปิดสิทธิ์สร้างโครงการ จะเปิดสิทธิ์ดูโครงการให้อัตโนมัติ)',
        'กด "บันทึกสิทธิ์" สิทธิ์ใหม่จะมีผลบังคับใช้กับผู้ใช้งานในบทบาทนั้นทันที'
      ],
      proTips: 'บทบาทหลักของระบบ (ADMIN, STAFF, SUPERVISOR) ได้รับการปกป้องไม่ให้ถูกลบเพื่อความเสถียรของระบบ',
      warnings: 'การตัดสิทธิ์ของบทบาทจะมีผลทันทีต่อผู้ใช้งานที่กำลังล็อกอินอยู่ในระบบ'
    },
    {
      id: 'reports-and-audit-history',
      category: ['supervisor', 'admin'],
      title: '11. การออกรายงาน สรุปยอด และประวัติธุรกรรม (Reports & Audit Trail)',
      shortDesc: 'การสร้างรายงานสรุปยอดคงเหลือ รายงานประวัติเบิกจ่าย และการส่งออกไฟล์ Excel / PDF',
      icon: FileText,
      iconColor: 'text-rose-500',
      badgeColor: 'border-l-rose-500',
      path: '/reports',
      roles: ['SUPERVISOR', 'ADMIN'],
      permissions: ['reports.view', 'reports.export', 'history.view'],
      whatItDoes: 'ศูนย์รวมรายงานสรุปข้อมูลคลังสินค้า การเคลื่อนไหวของสต็อก ยอดการเบิกจ่ายตามโครงการ และบันทึกประวัติการกระทำของผู้ใช้งาน (Audit Logs) สามารถส่งออกเป็นไฟล์ Excel และ PDF ที่จัดรูปแบบสวยงามพร้อมพิมพ์',
      whoCanUse: 'Supervisor, Approver, ผู้บริหาร และ Administrator',
      steps: [
        'ไปที่เมนู "รายงาน (Reports)" เลือกประเภทรายงานที่ต้องการ (สรุปยอดสต็อกคงเหลือ / รายงานการเบิกจ่าย / รายงาน Site Kits)',
        'เลือกช่วงเวลา (Date Range) และเลือกโครงการที่ต้องการวิเคราะห์ข้อมูล',
        'กดปุ่ม "ส่งออก Excel (Export XLSX)" เพื่อนำข้อมูลไปคำนวณต่อในสเปรดชีต',
        'กดปุ่ม "พิมพ์รายงาน PDF (Export PDF)" เพื่อสร้างเอกสารรายงานทางการพร้อมหัวจดหมายและสรุปสถิติ'
      ],
      proTips: 'สามารถตรวจสอบความโปร่งใสของการทำงานย้อนหลังได้ทุกขั้นตอนที่เมนู "ประวัติ (History)" ซึ่งบันทึก IP, เวลา, และรายละเอียดการเปลี่ยนแปลง',
      warnings: 'การส่งออกรายงานปริมาณข้อมูลขนาดใหญ่ควรเลือกช่วงเวลาที่เฉพาะเจาะจงเพื่อความรวดเร็วในการประมวลผล'
    }
  ];

  // Filter sections based on search query and active role filter
  const filteredSections = useMemo(() => {
    return manualSections.filter((sec) => {
      const matchesFilter = activeRoleFilter === 'all' || sec.category.includes(activeRoleFilter);
      
      const query = searchQuery.toLowerCase().trim();
      if (!query) return matchesFilter;

      const matchesTitle = sec.title.toLowerCase().includes(query);
      const matchesDesc = sec.shortDesc.toLowerCase().includes(query) || sec.whatItDoes.toLowerCase().includes(query);
      const matchesSteps = sec.steps.some(step => step.toLowerCase().includes(query));
      const matchesRoles = sec.roles.some(r => r.toLowerCase().includes(query));
      const matchesPerms = sec.permissions.some(p => p.toLowerCase().includes(query));

      return matchesFilter && (matchesTitle || matchesDesc || matchesSteps || matchesRoles || matchesPerms);
    });
  }, [searchQuery, activeRoleFilter]);

  return (
    <div className="space-y-8 pb-20 max-w-6xl mx-auto">
      {/* Hero Header Section */}
      <div className="relative overflow-hidden p-6 sm:p-8 rounded-3xl neu-flat border-0 bg-gradient-to-br from-primary/10 via-background to-purple-500/10">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5" /> StockFlow System Knowledge Base
            </div>
            <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-foreground flex items-center gap-3">
              <BookOpen className="w-8 h-8 sm:w-10 h-10 text-primary shrink-0" />
              คู่มือการใช้งานระบบ StockFlow
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground max-w-2xl leading-relaxed">
              คู่มือมาตรฐานฉบับสมบูรณ์ อธิบายขั้นตอนการทำงานอย่างเป็นระบบ ครอบคลุมทุกบทบาทหน้าที่ (Staff, Supervisor, Admin) 
              และระบบควบคุมสิทธิ์ RBAC ตามการทำงานจริงของระบบ
            </p>
          </div>

          {/* Search Box */}
          <div className="w-full md:w-80 shrink-0">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="ค้นหาฟังก์ชัน, สิทธิ์, ขั้นตอน..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-11 neu-pressed bg-background/80 backdrop-blur-xs text-sm rounded-xl"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
                >
                  ล้างคำค้น
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Quick Role Navigation Bar */}
        <div className="mt-6 pt-5 border-t border-border/40 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground mr-1 flex items-center gap-1">
            <SlidersHorizontal className="w-3.5 h-3.5" /> กรองตามบทบาท:
          </span>
          {roleFilters.map((tab) => {
            const Icon = tab.icon;
            const isSelected = activeRoleFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveRoleFilter(tab.id)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  isSelected
                    ? 'neu-primary text-white shadow-md ring-2 ring-primary/30'
                    : 'neu-button text-muted-foreground hover:text-foreground bg-background/60'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-white' : tab.color || 'text-muted-foreground'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Role Responsibility Quick Summary Matrix */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Role 1: Staff */}
        <div className="p-4 rounded-2xl neu-flat-sm border-l-4 border-l-blue-500 bg-card/60 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-sm text-foreground flex items-center gap-2">
              <User className="w-4 h-4 text-blue-500" /> ผู้ขอเบิก (STAFF)
            </span>
            <span className="text-[10px] bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-bold px-2 py-0.5 rounded-full">
              Requester
            </span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            ตรวจสอบสต็อกโครงการ ขอเบิกวัสดุผ่าน POS ยืม-คืนเครื่องมือ ขอต่ออายุวันส่งคืน และติดตามสถานะบิล
          </p>
          <div className="flex flex-wrap gap-1 pt-1">
            <span className="text-[10px] bg-muted px-2 py-0.5 rounded font-mono">withdrawals.create</span>
            <span className="text-[10px] bg-muted px-2 py-0.5 rounded font-mono">checkouts.create</span>
          </div>
        </div>

        {/* Role 2: Supervisor */}
        <div className="p-4 rounded-2xl neu-flat-sm border-l-4 border-l-emerald-500 bg-card/60 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-sm text-foreground flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-500" /> ผู้อนุมัติ (SUPERVISOR)
            </span>
            <span className="text-[10px] bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold px-2 py-0.5 rounded-full">
              Approver
            </span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            พิจารณาอนุมัติ/ปฏิเสธคำขอเบิกจ่าย รับเข้าสต็อก ปรับปรุงยอดสต็อก และส่งออกรายงานสรุปยอดโครงการ
          </p>
          <div className="flex flex-wrap gap-1 pt-1">
            <span className="text-[10px] bg-muted px-2 py-0.5 rounded font-mono">withdrawals.approve</span>
            <span className="text-[10px] bg-muted px-2 py-0.5 rounded font-mono">stock_in.create</span>
          </div>
        </div>

        {/* Role 3: Admin */}
        <div className="p-4 rounded-2xl neu-flat-sm border-l-4 border-l-purple-500 bg-card/60 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-sm text-foreground flex items-center gap-2">
              <Shield className="w-4 h-4 text-purple-500" /> ผู้ดูแลระบบ (ADMIN)
            </span>
            <span className="text-[10px] bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 font-bold px-2 py-0.5 rounded-full">
              Administrator
            </span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            สิทธิ์สูงสุด จัดการโครงการ ทะเบียนวัสดุ บริหารผู้ใช้งาน สิทธิ์โครงการ และกำหนดบทบาทสิทธิ์ RBAC ที่ /roles
          </p>
          <div className="flex flex-wrap gap-1 pt-1">
            <span className="text-[10px] bg-muted px-2 py-0.5 rounded font-mono">roles.manage_permissions</span>
            <span className="text-[10px] bg-muted px-2 py-0.5 rounded font-mono">users.update</span>
          </div>
        </div>
      </div>

      {/* Result Counter & Search Status */}
      <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
        <span>
          แสดงผลคู่มือการใช้งาน: <strong className="text-foreground">{filteredSections.length}</strong> จากทั้งหมด {manualSections.length} หมวด
        </span>
        {searchQuery && (
          <span>
            ผลการค้นหาสำหรับ: "<span className="text-primary font-medium">{searchQuery}</span>"
          </span>
        )}
      </div>

      {/* Manual Content Cards List */}
      <div className="space-y-6">
        {filteredSections.length === 0 ? (
          <div className="p-12 text-center rounded-2xl neu-flat border-0 space-y-3">
            <HelpCircle className="w-12 h-12 text-muted-foreground mx-auto opacity-50" />
            <h3 className="text-base font-bold text-foreground">ไม่พบข้อมูลคู่มือที่ตรงกับคำค้นหา</h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              ลองค้นหาด้วยคำอื่น เช่น "เบิกจ่าย", "ยืม", "อนุมัติ", "CSV", "สิทธิ์", หรือ "โครงการ"
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => { setSearchQuery(''); setActiveRoleFilter('all'); }}
              className="text-xs neu-button mt-2"
            >
              แสดงคู่มือทั้งหมด
            </Button>
          </div>
        ) : (
          filteredSections.map((sec) => {
            const Icon = sec.icon;
            return (
              <Card 
                key={sec.id} 
                id={sec.id}
                className={`neu-flat border-0 border-l-4 ${sec.badgeColor} overflow-hidden transition-all duration-200 hover:shadow-lg`}
              >
                <CardHeader className="bg-muted/10 pb-4 border-b border-border/30">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-background flex items-center justify-center neu-pressed-sm shrink-0">
                        <Icon className={`w-5 h-5 ${sec.iconColor}`} />
                      </div>
                      <div>
                        <CardTitle className="text-base sm:text-lg font-bold text-foreground">
                          {sec.title}
                        </CardTitle>
                        <CardDescription className="text-xs text-muted-foreground mt-0.5">
                          {sec.shortDesc}
                        </CardDescription>
                      </div>
                    </div>

                    {/* Quick Jump Link to Live Feature Page */}
                    {sec.path && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(sec.path)}
                        className="text-xs h-8 px-3 neu-button shrink-0 self-start sm:self-auto flex items-center gap-1.5"
                      >
                        <span>เปิดหน้าการทำงานจริง</span>
                        <ExternalLink className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="p-5 sm:p-6 space-y-5 text-sm">
                  {/* 1. What it does & Who can use */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-xl neu-pressed-sm bg-white/40 dark:bg-black/20">
                    <div className="md:col-span-2 space-y-1.5">
                      <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        <Info className="w-3.5 h-3.5 text-primary" /> ฟังก์ชันนี้ทำหน้าที่อะไร (What it does)
                      </span>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {sec.whatItDoes}
                      </p>
                    </div>

                    <div className="space-y-1.5 border-t md:border-t-0 md:border-l border-border/40 pt-3 md:pt-0 md:pl-4">
                      <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-blue-500" /> ใครใช้งานได้บ้าง (Who can use)
                      </span>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {sec.whoCanUse}
                      </p>
                      <div className="flex flex-wrap gap-1 pt-1">
                        {sec.permissions.map((perm) => (
                          <span key={perm} className="text-[10px] bg-muted/80 text-muted-foreground px-1.5 py-0.5 rounded font-mono">
                            {perm}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* 2. Step-by-Step Instructions */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-amber-500" /> ขั้นตอนการใช้งานทีละสเต็ป (Step-by-Step Instructions)
                    </h4>
                    <div className="space-y-2">
                      {sec.steps.map((step, index) => (
                        <div 
                          key={index} 
                          className="flex items-start gap-3 p-2.5 rounded-lg bg-background/60 border border-border/40 text-xs text-foreground leading-relaxed"
                        >
                          <span className="w-5 h-5 rounded-full bg-primary/10 text-primary font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                            {index + 1}
                          </span>
                          <span className="flex-1">{step}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 3. Pro-Tips & Safety Warnings */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    {sec.proTips && (
                      <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-900 dark:text-emerald-200 text-xs space-y-1">
                        <span className="font-bold flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300">
                          <BookmarkCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> เคล็ดลับการใช้งาน (Pro-Tip)
                        </span>
                        <p className="text-[11px] leading-relaxed opacity-90">{sec.proTips}</p>
                      </div>
                    )}

                    {sec.warnings && (
                      <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-200 text-xs space-y-1">
                        <span className="font-bold flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" /> กฎความปลอดภัย / ข้อควรระวัง
                        </span>
                        <p className="text-[11px] leading-relaxed opacity-90">{sec.warnings}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Footer Support & System Info */}
      <div className="p-6 rounded-2xl neu-pressed-sm bg-muted/20 border border-border/40 text-center space-y-2">
        <h4 className="font-bold text-xs text-foreground flex items-center justify-center gap-1.5">
          <HelpCircle className="w-4 h-4 text-primary" /> ต้องการความช่วยเหลือเพิ่มเติมหรือแจ้งปัญหาการใช้งาน?
        </h4>
        <p className="text-xs text-muted-foreground max-w-lg mx-auto">
          หากพบปัญหาการคำนวณสต็อก สิทธิ์การเข้าถึงเมนู หรือต้องการสร้างบทบาทการทำงานเฉพาะด้าน 
          สามารถติดต่อทีมผู้ดูแลระบบ (System Administrator) ขององค์กรได้ทันที
        </p>
      </div>
    </div>
  );
};

export default Manual;
