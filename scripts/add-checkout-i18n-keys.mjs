import fs from 'fs';
import path from 'path';

const thPath = path.resolve('src/i18n/locales/th.js');
const enPath = path.resolve('src/i18n/locales/en.js');

const newKeysTh = {
  pendingTab: "รออนุมัติ",
  pendingTitle: "คำขอยืมที่รออนุมัติ (Pending Requisitions)",
  pendingAdminSubtitle: "ตรวจสอบคำขอและกดยืนยันจ่ายอุปกรณ์เพื่อตัดสต็อกจริง",
  pendingStaffSubtitle: "ติดตามสถานะคำขอยืมพัสดุของคุณที่รอเจ้าหน้าที่ตรวจสอบ",
  allProjects: "ทุกโครงการ/คลัง",
  searchPendingPlaceholder: "ค้นหาคำขอ, ชื่อผู้ยืม, โครงการ...",
  noPendingRequisitions: "ไม่มีคำขอยืมพัสดุที่รออนุมัติ",
  noMatchingPending: "ไม่พบคำขอยืมที่ตรงกับเงื่อนไขการค้นหา",
  allCaughtUp: "คำขอยืมทั้งหมดได้รับการตรวจสอบและจัดการเรียบร้อยแล้ว",
  requestedDate: "วันที่ยื่นขอ",
  itemsList: "รายการวัสดุ",
  moreItems: "รายการเพิ่มเติม",
  detailsBtn: "รายละเอียด",
  rejectBtn: "ปฏิเสธ",
  approveAndDispenseBtn: "อนุมัติจ่ายของ",
  waitingApproval: "รอเจ้าหน้าที่ตรวจสอบ",
  approveModalTitle: "อนุมัติและจ่ายพัสดุ",
  approveModalDesc: "ตรวจสอบรายการอุปกรณ์และยอดสต็อกคงเหลือ เมื่อยืนยันระบบจะตัดยอดสต็อกจริงและเปลี่ยนสถานะเป็นใช้งานอยู่",
  requisitionItems: "รายการพัสดุที่ขอยืม",
  totalUnits: "รวมทั้งสิ้น",
  approvalNoteLabel: "บันทึกเจ้าหน้าที่ผู้จ่ายพัสดุ (ถ้ามี)",
  approvalNotePlaceholder: "ระบุบันทึกเพิ่มเติม เช่น ตรวจสอบสภาพสมบูรณ์ พร้อมแบตเตอรี่สำรอง...",
  approveDeductionNotice: "ระบบจะทำการตัดยอดสต็อกคงเหลือจริง และบันทึกชื่อคุณเป็นเจ้าหน้าที่ผู้จ่ายพัสดุ",
  confirmApproveBtn: "ยืนยันอนุมัติและจ่ายของ",
  rejectModalTitle: "ปฏิเสธคำขอยืมพัสดุ",
  rejectModalDesc: "ระบุเหตุผลในการปฏิเสธคำขอยืม ข้อมูลนี้จะถูกบันทึกและแจ้งเตือนไปยังผู้ขอยืม",
  rejectionReasonLabel: "เหตุผลในการปฏิเสธ",
  rejectionReasonPlaceholder: "ระบุเหตุผล เช่น สต็อกไม่เพียงพอ, วัสดุอยู่ระหว่างซ่อมบำรุง, ข้อมูลไม่ครบถ้วน...",
  rejectNotice: "เมื่อปฏิเสธแล้ว คำขอจะถูกเปลี่ยนสถานะเป็น Rejected และไม่สามารถย้อนกลับได้",
  confirmRejectBtn: "ยืนยันปฏิเสธคำขอ",
  pendingApprovalNotice: "คำขอยืมพัสดุนี้อยู่ระหว่างรอเจ้าหน้าที่ตรวจสอบและอนุมัติจ่ายของ",
  pendingStockNotice: "สต็อกคงเหลือจะถูกตัดเมื่อเจ้าหน้าที่คลังตรวจสอบและยืนยันจ่ายพัสดุ",
  rejectedNotice: "คำขอนี้ถูกปฏิเสธ",
  rejectedAt: "ปฏิเสธเมื่อ",
  statusPending: "รอตรวจสอบ",
  statusRejected: "ถูกปฏิเสธ",
  approvedBy: "ผู้อนุมัติ/จ่าย",
  approveSuccess: "อนุมัติคำขอและจ่ายอุปกรณ์สำเร็จเรียบร้อย",
  approveFailed: "เกิดข้อผิดพลาดในการอนุมัติคำขอ",
  rejectSuccess: "ปฏิเสธคำขอยืมเรียบร้อยแล้ว",
  rejectFailed: "เกิดข้อผิดพลาดในการปฏิเสธคำขอ",
  orderNumber: "เลขที่คำขอ",
  itemsCount: "จำนวนรายการ",
  itemsUnit: "รายการ",
  project: "โครงการ/คลัง",
  indefiniteBorrow: "ไม่กำหนดวันคืน",
  units: "หน่วย",
  viewDetail: "ดูรายละเอียด"
};

const newKeysEn = {
  pendingTab: "Pending",
  pendingTitle: "Pending Checkout Requisitions",
  pendingAdminSubtitle: "Review requisitions and approve to dispense equipment and deduct stock",
  pendingStaffSubtitle: "Track the status of your checkout requisitions awaiting staff review",
  allProjects: "All Projects/Warehouses",
  searchPendingPlaceholder: "Search orders, borrowers, projects...",
  noPendingRequisitions: "No pending checkout requisitions",
  noMatchingPending: "No requisitions match your search criteria",
  allCaughtUp: "All checkout requisitions have been processed",
  requestedDate: "Requested Date",
  itemsList: "Items List",
  moreItems: "more item(s)",
  detailsBtn: "Details",
  rejectBtn: "Reject",
  approveAndDispenseBtn: "Approve & Dispense",
  waitingApproval: "Awaiting staff review",
  approveModalTitle: "Approve & Dispense Equipment",
  approveModalDesc: "Verify requested items and stock balances. Approval will deduct inventory balances and mark order as active.",
  requisitionItems: "Requested Items",
  totalUnits: "Total",
  approvalNoteLabel: "Dispensing Officer Notes (Optional)",
  approvalNotePlaceholder: "e.g., Verified equipment condition, includes spare battery...",
  approveDeductionNotice: "System will deduct inventory stock balance and record you as the dispensing officer.",
  confirmApproveBtn: "Confirm Approval & Dispense",
  rejectModalTitle: "Reject Checkout Requisition",
  rejectModalDesc: "Specify the reason for rejection. This will be recorded and notified to the borrower.",
  rejectionReasonLabel: "Rejection Reason",
  rejectionReasonPlaceholder: "e.g., Insufficient stock balance, equipment under maintenance, incomplete details...",
  rejectNotice: "Once rejected, this requisition status will be marked as Rejected and cannot be undone.",
  confirmRejectBtn: "Confirm Rejection",
  pendingApprovalNotice: "This checkout requisition is currently pending review and dispensing approval.",
  pendingStockNotice: "Stock balance will be deducted once the warehouse officer reviews and confirms dispensing.",
  rejectedNotice: "This requisition was rejected",
  rejectedAt: "Rejected At",
  statusPending: "Pending Review",
  statusRejected: "Rejected",
  approvedBy: "Approved By",
  approveSuccess: "Requisition approved and equipment dispensed successfully",
  approveFailed: "Failed to approve checkout requisition",
  rejectSuccess: "Checkout requisition rejected successfully",
  rejectFailed: "Failed to reject checkout requisition",
  orderNumber: "Order Number",
  itemsCount: "Number of Items",
  itemsUnit: "items",
  project: "Project/Warehouse",
  indefiniteBorrow: "Indefinite Return",
  units: "units",
  viewDetail: "View Details"
};

function injectKeys(filePath, targetMarker, newKeys) {
  let content = fs.readFileSync(filePath, 'utf8');
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  
  // Build injection string
  const lines = Object.entries(newKeys).map(([k, v]) => {
    return `    "${k}": ${JSON.stringify(v)},`;
  });
  
  const searchPattern = `    "confirmIndefiniteLoan": ${targetMarker}`;
  if (!content.includes(searchPattern)) {
    throw new Error(`Target marker not found in ${filePath}: ${searchPattern}`);
  }
  
  const replacement = `    "confirmIndefiniteLoan": ${targetMarker},${eol}${lines.join(eol).replace(/,$/, '')}`;
  // Note: the last item shouldn't have a trailing comma if followed by closing brace, or it can if JS object allows it.
  // In JS objects, trailing commas are allowed.
  const replacementWithComma = `    "confirmIndefiniteLoan": ${targetMarker},${eol}${lines.join(eol)}`;
  
  const updatedContent = content.replace(searchPattern, replacementWithComma);
  fs.writeFileSync(filePath, updatedContent, 'utf8');
  console.log(`Updated ${filePath}`);
}

injectKeys(thPath, '"ยืนยันการยืมแบบไม่มีกำหนด"', newKeysTh);
injectKeys(enPath, '"Confirm Indefinite Loan"', newKeysEn);
