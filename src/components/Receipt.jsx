import React, { forwardRef } from 'react';
import { format } from 'date-fns';
import logo from '../assets/logo.png';

const Receipt = forwardRef(({ transaction, cart, requesterName }, ref) => {
    const totalQuantity = cart.reduce((acc, item) => acc + item.cartQuantity, 0);
    const date = format(new Date(), 'dd/MM/yyyy HH:mm');

    const formattedDate = transaction?.created_at ? new Date(transaction.created_at) : new Date();
    const slipDate = format(formattedDate, 'yyyyMMdd');
    const slipTime = format(formattedDate, 'HHmmss');
    const slipNumber = `${slipDate}DO${slipTime}PA`;

    return (
        <div ref={ref} className="bg-white p-8 text-black flex flex-col relative" style={{ width: '210mm', minHeight: '297mm', margin: '0 auto', fontFamily: "'Kanit', sans-serif" }}>
            {/* Header */}
            <div className="flex justify-between items-start mb-6">
                <div className="w-40 h-16">
                    <img
                        src={logo}
                        alt="Forth Logo"
                        className="w-full h-full object-contain object-left-top"
                    />
                </div>
                <div className="text-right text-xs text-gray-600">
                    <strong className="text-gray-900 text-sm">Forth Corporation Public Co., Ltd.</strong><br />
                    1053/1 Phaholyothin Road, Phayathai, Bangkok 10400<br />
                    Tel: 02-265-6700 | Tax ID: 0107548000471
                </div>
            </div>

            {/* Title */}
            <div className="text-center border-b-2 border-[#0D33A6] pb-2 mb-6">
                <h1 className="text-2xl font-bold text-[#0D33A6]">ใบเบิกพัสดุ / WITHDRAWAL SLIP</h1>
            </div>

            {/* Info */}
            <table className="w-full mb-6 text-sm">
                <tbody>
                    <tr>
                        <td className="w-1/2 py-1"><strong>ผู้เบิก (Requester):</strong> {requesterName}</td>
                        <td className="w-1/2 py-1"><strong>เลขที่ใบเบิก (Slip No.):</strong> {slipNumber}</td>
                    </tr>
                    <tr>
                        <td className="py-1"><strong>หมายเหตุ (Note):</strong> -</td>
                        <td className="py-1"><strong>วันที่ (Date):</strong> {date}</td>
                    </tr>
                </tbody>
            </table>

            {/* Items */}
            <div className="flex-grow">
                <table className="w-full mb-6 text-sm border-collapse">
                    <thead>
                        <tr className="bg-gray-100">
                            <th className="border border-gray-300 px-2 py-2 w-[5%] text-center">#</th>
                            <th className="border border-gray-300 px-2 py-2 w-[55%] text-left">รายการ / Description</th>
                            <th className="border border-gray-300 px-2 py-2 w-[15%] text-center">จำนวน / Qty</th>
                            <th className="border border-gray-300 px-2 py-2 w-[25%] text-left">หมายเหตุ / Remark</th>
                        </tr>
                    </thead>
                    <tbody>
                        {cart.map((item, index) => (
                            <tr key={item.id}>
                                <td className="border border-gray-300 px-2 py-2 text-center">{index + 1}</td>
                                <td className="border border-gray-300 px-2 py-2">
                                    <div>{item.name}</div>
                                    <div className="text-xs text-gray-500">{item.sku}</div>
                                </td>
                                <td className="border border-gray-300 px-2 py-2 text-center">{item.cartQuantity}</td>
                                <td className="border border-gray-300 px-2 py-2"></td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr>
                            <td colSpan="2" className="border border-gray-300 px-2 py-2 text-right font-bold">รวมทั้งสิ้น</td>
                            <td className="border border-gray-300 px-2 py-2 text-center font-bold">{totalQuantity}</td>
                            <td className="border border-gray-300 px-2 py-2"></td>
                        </tr>
                    </tfoot>
                </table>
            </div>

            {/* Signatures & Footer locked to bottom */}
            <div className="mt-auto">
                <div className="flex justify-between px-10 mb-8">
                    <div className="text-center">
                        <div className="border-b border-dotted border-gray-400 w-48 mb-2"></div>
                        <div className="mb-1">( .......................................... )</div>
                        <div>ผู้เบิก</div>
                    </div>
                    <div className="text-center">
                        <div className="border-b border-dotted border-gray-400 w-48 mb-2"></div>
                        <div className="mb-1">( .......................................... )</div>
                        <div>ผู้นำส่ง/ผู้อนุมัติ</div>
                    </div>
                </div>

                <div className="pt-2 border-t border-gray-200 text-center text-xs text-gray-400">
                    เอกสารนี้สร้างโดยระบบ Stock-Flow Inventory System | พิมพ์เมื่อ: {date}
                </div>
            </div>
        </div>
    );
});

export default Receipt;
