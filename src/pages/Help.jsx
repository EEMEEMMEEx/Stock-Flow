import React, { useState } from 'react';
import { HelpCircle, Book, Mail, Phone, ChevronDown, ChevronUp, Search, Package, ShoppingCart, RotateCcw, QrCode, LayoutDashboard, ScanBarcode, X } from 'lucide-react';

// GuideModal component defined outside Help to prevent recreation on every render
const GuideModal = ({ guide, onClose }) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
        <div className="relative glass-premium w-full max-w-3xl max-h-[85vh] overflow-hidden scale-in">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-white/10">
                <div className="flex items-center gap-3">
                    <div className={`p-2 bg-${guide.color}-500/20 rounded-lg`}>
                        <guide.icon className={`text-${guide.color}-400`} size={24} />
                    </div>
                    <h2 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>{guide.title}</h2>
                </div>
                <button
                    onClick={onClose}
                    className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                >
                    <X size={20} />
                </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto max-h-[calc(85vh-100px)] custom-scrollbar space-y-6">
                {guide.sections.map((section, index) => (
                    <div key={index} className="bg-white/5 rounded-xl p-5">
                        <h3 className="font-bold text-white mb-3 flex items-center gap-2">
                            <span className="w-6 h-6 bg-gradient-to-br from-[#1C6CB4] to-[#5ca0dc] rounded-lg flex items-center justify-center text-xs font-bold">
                                {index + 1}
                            </span>
                            {section.title.replace(/^\d+\.\s*/, '')}
                        </h3>
                        <p className="text-gray-400 whitespace-pre-line leading-relaxed">
                            {section.content}
                        </p>
                    </div>
                ))}
            </div>
        </div>
    </div>
);

const Help = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const [openFaq, setOpenFaq] = useState(null);
    const [selectedGuide, setSelectedGuide] = useState(null);

    const faqs = [
        {
            id: 1,
            question: 'วิธีการเบิกจ่ายสินค้า',
            answer: '1. ไปที่หน้า "อุปกรณ์" เลือกสินค้าที่ต้องการ\n2. กดปุ่ม "เพิ่มลงตะกร้า"\n3. ไปที่ตะกร้า กรอกข้อมูลผู้เบิก\n4. กดปุ่ม "ยืนยันการเบิก"'
        },
        {
            id: 2,
            question: 'วิธีการรับคืนครุภัณฑ์',
            answer: '1. ไปที่หน้า "รับคืน"\n2. ค้นหาครุภัณฑ์ที่ต้องการรับคืน\n3. กดปุ่ม "รับคืน" และยืนยัน\n4. ระบบจะอัปเดตสถานะเป็น "พร้อมใช้งาน"'
        },
        {
            id: 3,
            question: 'การสแกน QR Code',
            answer: '1. ไปที่หน้า "สแกน"\n2. เลือกโหมด "ค้นหา" หรือ "ใส่ตะกร้า"\n3. กดเปิดกล้องและอนุญาตการเข้าถึง\n4. เล็ง QR Code ให้อยู่ในกรอบ'
        },
        {
            id: 4,
            question: 'การดูประวัติการเบิก',
            answer: 'ไปที่หน้า "ประวัติการเบิก" เพื่อดูรายการเบิกจ่ายทั้งหมด สามารถกรองตามวันที่หรือค้นหาตามชื่อผู้เบิกได้'
        },
        {
            id: 5,
            question: 'การเปลี่ยนรหัสผ่าน',
            answer: '1. กดที่รูปโปรไฟล์มุมขวาบน\n2. เลือก "ตั้งค่า"\n3. กด "เปลี่ยนรหัสผ่าน"\n4. กรอกรหัสผ่านใหม่และยืนยัน'
        }
    ];

    const guides = [
        {
            id: 'basic',
            title: 'คู่มือการใช้งานเบื้องต้น',
            icon: LayoutDashboard,
            color: 'blue',
            sections: [
                {
                    title: '1. แดชบอร์ด',
                    content: 'หน้าแดชบอร์ดแสดงข้อมูลภาพรวมของระบบ\n• จำนวนอุปกรณ์ทั้งหมด\n• แจ้งเตือนสินค้าใกล้หมด\n• กราฟแสดงแนวโน้มการเบิกจ่าย\n• สัดส่วนหมวดหมู่สินค้า'
                },
                {
                    title: '2. เมนูหลัก',
                    content: '• แดชบอร์ด - ดูภาพรวมระบบ\n• อุปกรณ์ - รายการสินค้าทั้งหมด\n• ครุภัณฑ์ - จัดการสินทรัพย์\n• รับคืน - รับคืนครุภัณฑ์\n• สแกน - สแกน QR Code\n• ประวัติการเบิก - ดูประวัติย้อนหลัง'
                },
                {
                    title: '3. การเข้าสู่ระบบ',
                    content: '1. เปิดเว็บไซต์ระบบ\n2. กรอกอีเมลและรหัสผ่าน\n3. กดปุ่ม "เข้าสู่ระบบ"\n4. หากลืมรหัสผ่าน สามารถติดต่อผู้ดูแลระบบ'
                }
            ]
        },
        {
            id: 'inventory',
            title: 'การจัดการสินค้าคงคลัง',
            icon: Package,
            color: 'green',
            sections: [
                {
                    title: '1. ดูรายการสินค้า',
                    content: '• ไปที่เมนู "อุปกรณ์"\n• ใช้ช่องค้นหาเพื่อหาสินค้า\n• กรองตามหมวดหมู่หรือสถานที่\n• คลิกที่สินค้าเพื่อดูรายละเอียด'
                },
                {
                    title: '2. เพิ่มสินค้าใหม่',
                    content: '1. กดปุ่ม "เพิ่มสินค้า"\n2. กรอกข้อมูล: ชื่อ, SKU, หมวดหมู่\n3. ระบุจำนวนและ Min Threshold\n4. อัปโหลดรูปภาพ (ถ้ามี)\n5. กดบันทึก'
                },
                {
                    title: '3. แก้ไขจำนวนสินค้า',
                    content: '1. คลิกที่สินค้าที่ต้องการแก้ไข\n2. กดปุ่ม "แก้ไข"\n3. ปรับจำนวนตามต้องการ\n4. กดบันทึกการเปลี่ยนแปลง'
                },
                {
                    title: '4. การแจ้งเตือนสินค้าใกล้หมด',
                    content: '• ระบบจะแจ้งเตือนอัตโนมัติ\n• เมื่อจำนวนต่ำกว่า Min Threshold\n• แสดงใน Notification bell\n• และในหน้า Dashboard'
                }
            ]
        },
        {
            id: 'checkout',
            title: 'การเบิกจ่ายสินค้า',
            icon: ShoppingCart,
            color: 'purple',
            sections: [
                {
                    title: '1. เลือกสินค้า',
                    content: '1. ไปที่หน้า "อุปกรณ์"\n2. ค้นหาสินค้าที่ต้องการ\n3. กดปุ่ม "เพิ่มลงตะกร้า"\n4. สามารถเลือกหลายรายการได้'
                },
                {
                    title: '2. ตรวจสอบตะกร้า',
                    content: '1. คลิกไอคอนตะกร้าที่มุมขวาบน\n2. ตรวจสอบรายการและจำนวน\n3. ปรับจำนวนตามต้องการ\n4. ลบรายการที่ไม่ต้องการ'
                },
                {
                    title: '3. กรอกข้อมูลและยืนยัน',
                    content: '1. กรอกชื่อผู้เบิก\n2. กรอกชื่อผู้ส่งของ\n3. ระบุสถานที่ส่งของ\n4. เลือก Serial Number (ถ้ามี)\n5. กดปุ่ม "ยืนยันการเบิก"'
                },
                {
                    title: '4. พิมพ์ใบเบิก',
                    content: '• หลังยืนยันสำเร็จ ระบบจะสร้างใบเบิก\n• สามารถดาวน์โหลดเป็น PDF\n• หรือพิมพ์ออกมาได้ทันที'
                }
            ]
        },
        {
            id: 'return',
            title: 'การรับคืนครุภัณฑ์',
            icon: RotateCcw,
            color: 'orange',
            sections: [
                {
                    title: '1. ค้นหาครุภัณฑ์',
                    content: '1. ไปที่หน้า "รับคืน"\n2. ใช้ช่องค้นหา Serial Number\n3. หรือค้นหาจากชื่อผู้ยืม\n4. หรือสแกน QR Code'
                },
                {
                    title: '2. ดำเนินการรับคืน',
                    content: '1. ตรวจสอบข้อมูลครุภัณฑ์\n2. ตรวจสอบสภาพสินค้า\n3. กดปุ่ม "รับคืน"\n4. ยืนยันการรับคืน'
                },
                {
                    title: '3. ตรวจสอบสถานะ',
                    content: '• สถานะจะเปลี่ยนเป็น "พร้อมใช้งาน"\n• สินค้าจะกลับเข้าคลัง\n• บันทึกประวัติการรับคืน'
                }
            ]
        },
        {
            id: 'scan',
            title: 'การใช้งาน QR Scanner',
            icon: QrCode,
            color: 'cyan',
            sections: [
                {
                    title: '1. เปิดหน้าสแกน',
                    content: '1. ไปที่เมนู "สแกน"\n2. เลือกโหมดการทำงาน:\n   • ค้นหา - ดูข้อมูลสินค้า\n   • ใส่ตะกร้า - เพิ่มลงตะกร้าทันที'
                },
                {
                    title: '2. อนุญาตกล้อง',
                    content: '1. กดปุ่ม "เปิดกล้อง"\n2. อนุญาตเข้าถึงกล้อง\n3. หากถูกบล็อก ให้ไปตั้งค่า Browser\n4. อนุญาต Camera Permission'
                },
                {
                    title: '3. สแกน QR Code',
                    content: '1. เล็ง QR Code ให้อยู่ในกรอบ\n2. รอระบบอ่านค่า\n3. ผลลัพธ์จะแสดงอัตโนมัติ\n4. ดำเนินการตามโหมดที่เลือก'
                }
            ]
        },
        {
            id: 'assets',
            title: 'การจัดการครุภัณฑ์',
            icon: ScanBarcode,
            color: 'pink',
            sections: [
                {
                    title: '1. ดูรายการครุภัณฑ์',
                    content: '• ไปที่เมนู "ครุภัณฑ์"\n• ใช้ช่องค้นหา Serial Number\n• กรองตามสถานะ: พร้อมใช้งาน, กำลังใช้งาน'
                },
                {
                    title: '2. เพิ่มครุภัณฑ์ใหม่',
                    content: '1. กดปุ่ม "เพิ่มครุภัณฑ์"\n2. เลือกสินค้าที่เกี่ยวข้อง\n3. กรอก Serial Number\n4. กดบันทึก'
                },
                {
                    title: '3. นำเข้าจาก CSV',
                    content: '1. กดปุ่ม "นำเข้า CSV"\n2. เลือกไฟล์ CSV\n3. ระบบจะจับคู่ Serial กับสินค้า\n4. ตรวจสอบและยืนยัน'
                },
                {
                    title: '4. สถานะครุภัณฑ์',
                    content: '• in_stock - พร้อมใช้งาน\n• in_use - กำลังใช้งาน\n• maintenance - ซ่อมบำรุง\n• retired - ปลดระวาง'
                }
            ]
        }
    ];

    const filteredFaqs = faqs.filter(faq =>
        faq.question.toLowerCase().includes(searchTerm.toLowerCase()) ||
        faq.answer.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            {/* Guide Modal */}
            {selectedGuide && (
                <GuideModal
                    guide={guides.find(g => g.id === selectedGuide)}
                    onClose={() => setSelectedGuide(null)}
                />
            )}

            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="p-3 bg-green-500/20 rounded-xl">
                    <HelpCircle className="text-green-400" size={28} />
                </div>
                <h1 className="text-3xl font-bold" style={{ color: "var(--text-primary)" }}>ช่วยเหลือ</h1>
            </div>

            {/* Search */}
            <div className="glass-premium p-4">
                <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="ค้นหาคำถามที่พบบ่อย..."
                        className="glass-input pl-12"
                    />
                </div>
            </div>

            {/* Quick Guides */}
            <div className="glass-premium p-6">
                <h3 className="text-lg font-bold mb-4" style={{ color: "var(--text-primary)" }}>คู่มือการใช้งาน</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {guides.map((guide) => (
                        <button
                            key={guide.id}
                            onClick={() => setSelectedGuide(guide.id)}
                            className="p-4 bg-white/5 rounded-xl hover:bg-white/10 transition-all duration-300 flex items-center gap-3 group text-left"
                        >
                            <div className={`p-3 bg-${guide.color}-500/20 rounded-xl group-hover:scale-110 transition-transform`}>
                                <guide.icon className={`text-${guide.color}-400`} size={24} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <span className="text-white text-sm font-medium block">{guide.title}</span>
                                <span className="text-gray-500 text-xs">{guide.sections.length} หัวข้อ</span>
                            </div>
                            <ChevronDown className="text-gray-500 group-hover:text-white transition-colors rotate-[-90deg]" size={16} />
                        </button>
                    ))}
                </div>
            </div>

            {/* FAQs */}
            <div className="glass-premium p-6">
                <h3 className=" " style={{ color: "var(--text-primary)" }}>คำถามที่พบบ่อย</h3>
                <div className="space-y-3">
                    {filteredFaqs.map((faq) => (
                        <div
                            key={faq.id}
                            className="bg-white/5 rounded-xl overflow-hidden transition-all duration-300"
                        >
                            <button
                                onClick={() => setOpenFaq(openFaq === faq.id ? null : faq.id)}
                                className="w-full p-4 flex items-center justify-between text-left hover:bg-white/5 transition-colors"
                            >
                                <span className="font-medium" style={{ color: "var(--text-primary)" }}>{faq.question}</span>
                                {openFaq === faq.id ? (
                                    <ChevronUp className="text-gray-400" size={20} />
                                ) : (
                                    <ChevronDown className="text-gray-400" size={20} />
                                )}
                            </button>
                            {openFaq === faq.id && (
                                <div className="px-4 pb-4 text-gray-400 whitespace-pre-line">
                                    {faq.answer}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div >

            {/* Contact */}
            < div className="glass-premium p-6" >
                <h3 className=" " style={{ color: "var(--text-primary)" }}>ติดต่อเรา</h3>
                < div className="grid grid-cols-1 md:grid-cols-2 gap-4" >
                    <div className="flex items-center gap-4 p-4 bg-white/5 rounded-xl">
                        <div className="p-3 bg-[#1C6CB4]/20 rounded-xl">
                            <Mail className="text-[#5ca0dc]" size={24} />
                        </div>
                        <div>
                            <p className="text-sm text-gray-400">อีเมล</p>
                            <a href="mailto:watchara.m@forth.co.th" className="text-white hover:text-[#5ca0dc] transition-colors">
                                watchara.m@forth.co.th
                            </a>
                        </div>
                    </div>
                    <div className="flex items-center gap-4 p-4 bg-white/5 rounded-xl">
                        <div className="p-3 bg-green-500/20 rounded-xl">
                            <Phone className="text-green-400" size={24} />
                        </div>
                        <div>
                            <p className="text-sm text-gray-400">โทรศัพท์</p>
                            <div className="flex flex-col">
                                <a href="tel:+66614046389" className="text-white hover:text-green-400 transition-colors">
                                    061-404-6389
                                </a>
                                <a href="tel:+66863631845" className="text-white hover:text-green-400 transition-colors">
                                    086-363-1845
                                </a>
                            </div>
                        </div>
                    </div>
                </div >
            </div >
        </div >
    );
};

export default Help;
