import fs from 'fs';

const enManual = {
  title: "StockFlow User Manual",
  subtitle: "Comprehensive system guide detailing workflows across all roles (Staff, Supervisor, Admin) and dynamic RBAC access control.",
  searchPlaceholder: "Search functions, permissions, steps...",
  filterByRole: "Filter by Role:",
  allSections: "All Sections",
  clearSearch: "Clear search",
  goToModule: "Open Live Page",
  badgeKnowledgeBase: "StockFlow System Knowledge Base",
  showingDocs: "Showing documentation: {{count}} of {{total}} sections",
  searchResultsFor: "Search results for: \"{{query}}\"",
  noDocsFound: "No documentation found matching your search query",
  noDocsHint: "Try searching for terms like \"withdrawals\", \"borrow\", \"approve\", \"CSV\", \"permissions\", or \"projects\"",
  showAllDocs: "Show all documentation",
  whatItDoes: "What it does",
  whoCanUse: "Who can use",
  instructionsTitle: "Step-by-Step Instructions",
  proTipTitle: "Pro-Tip",
  warningsTitle: "Safety Rules / Warnings",
  helpTitle: "Need additional help or want to report an issue?",
  helpDesc: "If you encounter stock calculation issues, menu access errors, or require a specialized custom role, contact your organization System Administrator.",
  roles: {
    staff: "Staff / Requisition",
    supervisor: "Supervisor / Approver",
    admin: "Administrator & RBAC",
    checkouts: "Checkouts & Returns",
    inventory: "Inventory & Stock-In"
  },
  roleMatrix: {
    staffTitle: "Requisition Staff (STAFF)",
    staffBadge: "Requester",
    staffDesc: "Check project inventory, create withdrawal orders via POS, borrow and return tools, request due date extensions, and track order status.",
    supervisorTitle: "Approver (SUPERVISOR)",
    supervisorBadge: "Approver",
    supervisorDesc: "Review and approve/reject withdrawal requests, record stock receipts, adjust inventory balances, and export project summary reports.",
    adminTitle: "System Administrator (ADMIN)",
    adminBadge: "Administrator",
    adminDesc: "Full administrative authority: manage projects, item catalog, user accounts, project access scopes, and configure dynamic RBAC at /roles."
  },
  sections: {
    sidebarNav: {
      title: "1. Navigation & RBAC Visibility",
      shortDesc: "Overview of menu layout and permission-based dynamic visibility.",
      whatItDoes: "The sidebar and action buttons in StockFlow are dynamic and context-aware. Menus appear only when your account is granted permissions corresponding to each specific module. If a menu is hidden, your assigned role does not currently have access.",
      whoCanUse: "All system users. Menu visibility varies depending on assigned role and permissions.",
      steps: [
        "Check authorized navigation items in the sidebar.",
        "Upon selecting a page, access is validated across both the frontend router and database Row-Level Security (RLS).",
        "To request additional menu access, contact a System Administrator to update your role permissions at /roles."
      ],
      proTips: "Administrators can customize menu permissions for each role dynamically via /roles without updating application code.",
      warnings: "Directly navigating to unauthorized URLs will be blocked by system security (403 Forbidden)."
    },
    staffRequisitionPos: {
      title: "2. Stock Checking & Withdrawal POS Terminal",
      shortDesc: "Select project, check available balances, and submit requisitions via the POS cart.",
      whatItDoes: "The POS Terminal interface allows operators to select projects, search for materials, verify actual available stock, and submit multi-item requisition orders seamlessly in a single transaction.",
      whoCanUse: "Requisition staff (Staff / Requester) and all roles granted withdrawals.create permission.",
      steps: [
        "Navigate to \"Withdrawals\" and select the destination project from the selector.",
        "Click \"+ New Request (POS)\" to open the POS shopping cart terminal.",
        "Search for items, enter required quantities, and click \"Add to Cart\" (alerts will trigger if quantity exceeds available stock).",
        "Select the storage location and specify purpose or usage notes.",
        "Review line items and click \"Submit Request\" to finalize."
      ],
      proTips: "Use the Site Kits / BOM Requisition feature to add standardized project kits to the cart in a single click.",
      warnings: "Requisition orders are verified atomically on an All-or-Nothing basis during approval. If any item is out of stock, the entire order is rejected."
    },
    withdrawalStatusLifecycle: {
      title: "3. Withdrawal Status Lifecycle",
      shortDesc: "Understanding the 4 lifecycle stages from order submission to final stock deduction.",
      whatItDoes: "Provides transparent tracking of requisition order progress so requesters and supervisors can monitor status with precision.",
      whoCanUse: "Requesters, Approvers, and Administrators.",
      steps: [
        "1. Pending: Order submitted, awaiting supervisor or admin review and stock availability check.",
        "2. Approved: Order approved; requester can pick up materials at the designated warehouse.",
        "3. Completed: Materials successfully issued; stock balances are deducted from inventory.",
        "4. Rejected: Order rejected (e.g. insufficient stock or invalid requisition details) with reason provided."
      ],
      proTips: "Requesters can inspect rejection reasons and audit logs in the order details view to correct and resubmit.",
      warnings: "Physical stock is not deducted from inventory until the order is approved and marked as completed."
    },
    checkoutsAndReturns: {
      title: "4. Checkouts & Equipment Borrowing",
      shortDesc: "Record tool checkouts, schedule due dates, request extensions, and process returns.",
      whatItDoes: "Manages circulating tools and returnable assets required for temporary field tasks. Features automated due-date countdowns, overdue tracking, and return date extensions.",
      whoCanUse: "Staff borrowing equipment and warehouse staff processing returns.",
      steps: [
        "Borrowing: Go to \"Checkouts\", click \"+ Borrow Tool\", select borrower, expected return date, and item serial number.",
        "Monitoring: View active checkout status (Active, Due Soon, or Overdue).",
        "Extension (Extend Due Date): If additional time is needed, click \"Extend Due Date\", choose a new date, and provide a reason.",
        "Returns: When equipment is returned, warehouse staff click \"Return\", inspect condition, and confirm to restore item to stock."
      ],
      proTips: "Overdue items are highlighted with red status badges for rapid equipment tracking and recovery.",
      warnings: "Inspect tool physical condition and operational status thoroughly before confirming return into inventory."
    },
    supervisorApprovalWorkflow: {
      title: "5. Supervisor Approval Workflow",
      shortDesc: "Stock validation guidelines, full-order approvals, and the All-or-Nothing principle.",
      whatItDoes: "Ensures safe and consistent approval processing by calculating real-time inventory balances and enforcing All-or-Nothing atomic transactions to eliminate inventory discrepancies.",
      whoCanUse: "Supervisors, Approvers, and Administrators.",
      steps: [
        "Navigate to \"Withdrawals\" and filter by \"Pending\" status.",
        "Click an order to review requested items, quantities, and current available stock.",
        "If all items have sufficient available stock, click \"Approve\".",
        "If even one item is insufficient, click \"Reject\" and provide an explanatory note for the requester."
      ],
      proTips: "The system uses PostgreSQL row-level locking so multiple approvers can process orders simultaneously without race conditions.",
      warnings: "Partial approvals for individual items in an order are disabled to maintain accounting and requisition integrity."
    },
    stockInInventoryManagement: {
      title: "6. Stock In & CSV Import",
      shortDesc: "Direct stock receipts entry and bulk imports via CSV/Excel spreadsheets.",
      whatItDoes: "Records replenishment of materials and equipment into projects. Supports both single-entry direct receipts and bulk file uploads in a single operation.",
      whoCanUse: "Warehouse personnel, Supervisors, and Administrators.",
      steps: [
        "Navigate to \"Stock Receipts\" and click \"+ Receive Stock\" or \"Import CSV\".",
        "Direct Entry: Select storage location, select items, enter quantities, and record PO or delivery note numbers.",
        "CSV Import: Click \"Import CSV\", download the template, populate records, and upload the file.",
        "Review preview table for accurate quantities and click \"Confirm Stock Receipt\"."
      ],
      proTips: "Ensure CSV files are saved in UTF-8 encoding (or UTF-8 BOM) for flawless parsing.",
      warnings: "Recording stock in increments available balances immediately. Verify SKU codes and locations before confirming."
    },
    stockAdjustmentAndTransfer: {
      title: "7. Stock Adjustment & Transfer",
      shortDesc: "Physical inventory cycle counting, stock adjustments, and cross-warehouse transfers.",
      whatItDoes: "Designed for periodic inventory audits and cycle counts. Allows operators to adjust stock balances up or down due to damage, shrinkage, or audit discrepancies, as well as transfer materials between projects and locations.",
      whoCanUse: "Supervisors and Administrators granted items.adjust_stock permission.",
      steps: [
        "Navigate to \"Items Master\" and locate the item to adjust.",
        "Click \"Adjust Stock\".",
        "Enter the actual counted quantity or choose adjustment direction (Increase / Decrease).",
        "Specify the reason for adjustment (e.g. Annual Cycle Count, Damaged Goods, Initial Balance Import).",
        "Confirm the adjustment. The system logs an audit entry and updates the balance immediately."
      ],
      proTips: "All stock adjustments are logged in detail in \"History\" with timestamps, operator identity, and reasons.",
      warnings: "Negative adjustments directly affect inventory valuation. Supervisor approval is recommended before submitting."
    },
    projectsAndItemsMaster: {
      title: "8. Projects & Master Catalog",
      shortDesc: "Create projects, configure storage locations, and register SKU catalog items.",
      whatItDoes: "Master Data repository for managing project structures, physical warehouse locations, and catalog registrations for all materials and equipment.",
      whoCanUse: "System Administrators.",
      steps: [
        "Creating Projects: Go to \"Projects\", click \"+ Add Project\", specify project code, name, and sub-locations.",
        "Deactivating Projects: When a project concludes, change its status to Inactive to prevent new transactions while preserving audit history.",
        "Registering Items: Go to \"Items Master\", click \"+ Add Item\", specify SKU, name, unit of measure, and category."
      ],
      proTips: "Standardize project codes and SKU patterns (e.g. PRJ-001, MAT-ELC-001) for optimal search and filtering performance.",
      warnings: "Inactive projects are automatically hidden from withdrawal and stock-in forms."
    },
    userManagementAndAvatars: {
      title: "9. User Management & Scopes",
      shortDesc: "Create user accounts, assign roles, define project access scopes, and manage R2 profile avatars.",
      whatItDoes: "Centralized administration for user accounts, profile details, departments, project scopes, forced password resets, and Cloudflare R2 avatars.",
      whoCanUse: "System Administrators.",
      steps: [
        "Go to \"Users\", click \"+ Add User\" or click the pencil icon to edit an existing user.",
        "Profile Tab: Enter full name, phone number, department, position, upload avatar, and toggle \"Force password change on next login\".",
        "Role & Status Tab: Select the user role and account status (ACTIVE, INACTIVE, or SUSPENDED).",
        "Project Access Tab: Choose \"All Projects\" or \"Selected Projects\" to restrict project visibility.",
        "Click \"Save Changes\". Updates sync to the database and refresh the table instantly."
      ],
      proTips: "The system includes Last Admin Protection to prevent accidental deactivation or demotion of the final administrator.",
      warnings: "When employees leave, set their account status to INACTIVE instead of deleting to preserve historical audit logs."
    },
    dynamicRbacRoleManagement: {
      title: "10. Dynamic RBAC at /roles",
      shortDesc: "Create custom roles, configure granular permissions, and customize badge color themes.",
      whatItDoes: "Advanced Role-Based Access Control system enabling Administrators to create custom roles and configure permissions across 36+ granular security rights.",
      whoCanUse: "System Administrators.",
      steps: [
        "Navigate to \"Roles & Permissions\" at `/roles`.",
        "Inspect user counts and permission allocations on role summary cards.",
        "Click \"+ Create New Role\", specify role code, display name, description, and badge color with live preview.",
        "Click \"Manage Permissions\" on any role card to toggle functional permissions.",
        "The Permission Dependency Engine automatically activates prerequisite permissions (e.g. enabling project creation auto-enables project viewing).",
        "Click \"Save Permissions\". Changes take effect immediately for all users assigned to that role."
      ],
      proTips: "Default system roles (ADMIN, STAFF, SUPERVISOR) are protected from deletion to maintain system stability.",
      warnings: "Revoking permissions takes effect immediately for active sessions assigned to that role."
    },
    reportsAndAuditHistory: {
      title: "11. Reports & Audit Trail",
      shortDesc: "Generate inventory summaries, requisition reports, and export to Excel / PDF.",
      whatItDoes: "Reporting hub for inventory balances, stock movements, project requisition history, and user audit logs. Supports export to formatted Excel spreadsheets and print-ready PDF documents.",
      whoCanUse: "Supervisors, Approvers, Executives, and Administrators.",
      steps: [
        "Navigate to \"Reports\" and choose the desired report type (Stock Balance / Withdrawal History / Site Kits Report).",
        "Select date range and filter by project.",
        "Click \"Export Excel (XLSX)\" for spreadsheet analysis.",
        "Click \"Print PDF Report\" to generate an official formatted document with letterhead and statistical summaries."
      ],
      proTips: "Inspect audit trail details at any time in \"History\", which records IP addresses, timestamps, and change diffs.",
      warnings: "When exporting large datasets, select specific date ranges to optimize report generation speed."
    }
  }
};

const thManual = {
  title: "คู่มือการใช้งานระบบ StockFlow",
  subtitle: "แนวทางการทำงานแบบครบวงจรสำหรับทุกบทบาท (Staff, Supervisor, Admin) และระบบกำหนดสิทธิ์ RBAC แบบไดนามิก",
  searchPlaceholder: "ค้นหาฟังก์ชัน สิทธิ์การใช้งาน ขั้นตอนการทำงาน...",
  filterByRole: "กรองตามบทบาท:",
  allSections: "ทุกส่วนของคู่มือ",
  clearSearch: "ล้างการค้นหา",
  goToModule: "ไปยังหน้าการทำงาน",
  badgeKnowledgeBase: "ศูนย์รวมองค์ความรู้ระบบ StockFlow",
  showingDocs: "แสดงคู่มือ: {{count}} จากทั้งหมด {{total}} ส่วน",
  searchResultsFor: "ผลการค้นหาสำหรับ: \"{{query}}\"",
  noDocsFound: "ไม่พบคู่มือที่ตรงกับคำค้นหาของคุณ",
  noDocsHint: "ลองค้นหาด้วยคำค้นหา เช่น \"withdrawals\", \"borrow\", \"approve\", \"CSV\", \"permissions\" หรือ \"projects\"",
  showAllDocs: "แสดงคู่มือทั้งหมด",
  whatItDoes: "การทำงานและหน้าที่",
  whoCanUse: "ผู้มีสิทธิ์ใช้งาน",
  instructionsTitle: "ขั้นตอนการปฏิบัติงานทีละขั้นตอน",
  proTipTitle: "ข้อแนะนำเพิ่มเติม (Pro-Tip)",
  warningsTitle: "กฎความปลอดภัยและข้อควรระวัง",
  helpTitle: "ต้องการความช่วยเหลือเพิ่มเติม หรือต้องการรายงานปัญหา?",
  helpDesc: "หากคุณพบปัญหาการคำนวณยอดสต็อก, ปัญหาการเข้าถึงเมนู, หรือต้องการสร้างบทบาทพิเศษเฉพาะทาง กรุณาติดต่อผู้ดูแลระบบ (System Administrator) ขององค์กร",
  roles: {
    staff: "เจ้าหน้าที่ / ขอเบิก (Staff)",
    supervisor: "หัวหน้างาน / ผู้อนุมัติ (Supervisor)",
    admin: "ผู้ดูแลระบบ (Administrator)",
    checkouts: "ยืม-คืนอุปกรณ์ (Checkouts)",
    inventory: "คลังสินค้าและรับเข้า (Inventory)"
  },
  roleMatrix: {
    staffTitle: "เจ้าหน้าที่เบิกจ่ายพัสดุ (STAFF)",
    staffBadge: "ผู้ขอเบิก",
    staffDesc: "ตรวจสอบพัสดุในโครงการ สร้างรายการขอเบิกผ่านระบบ POS ยืมและคืนอุปกรณ์ ขอขยายกำหนดเวลา และติดตามสถานะคำขอเบิกจ่าย",
    supervisorTitle: "หัวหน้างานและผู้อนุมัติ (SUPERVISOR)",
    supervisorBadge: "ผู้อนุมัติ",
    supervisorDesc: "ตรวจสอบและอนุมัติ/ปฏิเสธคำขอเบิกพัสดุ บันทึกการรับพัสดุเข้าคลัง ปรับปรุงยอดสต็อก และส่งออกรายงานสรุปโครงการ",
    adminTitle: "ผู้ดูแลระบบสูงสุด (ADMIN)",
    adminBadge: "ผู้ดูแลระบบ",
    adminDesc: "สิทธิ์การดูแลระบบเต็มรูปแบบ: จัดการโครงการ ทะเบียนพัสดุ บัญชีผู้ใช้งาน ขอบเขตการเข้าถึงโครงการ และตั้งค่าสิทธิ์ RBAC ผ่าน /roles"
  },
  sections: {
    sidebarNav: {
      title: "1. การนำทางและสิทธิ์การมองเห็นเมนู (RBAC Visibility)",
      shortDesc: "ภาพรวมของเลย์เอาต์เมนูและระบบแสดงผลตามสิทธิ์การใช้งานแบบไดนามิก",
      whatItDoes: "แถบเมนูด้านข้างและปุ่มดำเนินการใน StockFlow ถูกออกแบบให้ปรับเปลี่ยนตามบริบทและสิทธิ์ของผู้ใช้โดยอัตโนมัติ เมนูจะปรากฏเฉพาะเมื่อบัญชีของคุณได้รับสิทธิ์ที่ตรงกับแต่ละโมดูล หากเมนูใดไม่แสดงขึ้น แสดงว่าบทบาทปัจจุบันของคุณยังไม่ได้รับสิทธิ์เข้าใช้งาน",
      whoCanUse: "ผู้ใช้งานทุกคนในระบบ โดยการมองเห็นเมนูจะแตกต่างกันไปตามบทบาทและสิทธิ์ที่ได้รับมอบหมาย",
      steps: [
        "ตรวจสอบรายการเมนูที่ได้รับอนุญาตในแถบด้านข้าง (Sidebar)",
        "เมื่อคลิกเลือกหน้า ระบบจะตรวจสอบสิทธิ์ทั้งฝั่ง Router และ Row-Level Security (RLS) ของฐานข้อมูลทันที",
        "หากต้องการขอสิทธิ์เข้าใช้งานเมนูเพิ่มเติม ให้ติดต่อผู้ดูแลระบบเพื่อปรับปรุงสิทธิ์บทบาทที่หน้า /roles"
      ],
      proTips: "ผู้ดูแลระบบสามารถปรับแต่งสิทธิ์การเข้าถึงเมนูของแต่ละบทบาทได้ทันทีผ่านหน้า /roles โดยไม่ต้องแก้ไขโค้ดของแอปพลิเคชัน",
      warnings: "การพิมพ์ URL ที่ไม่ได้รับอนุญาตโดยตรงจะถูกระบบความปลอดภัยบล็อกทันที (403 Forbidden)"
    },
    staffRequisitionPos: {
      title: "2. การตรวจสอบสต็อกและระบบขอเบิกแบบ POS",
      shortDesc: "เลือกโครงการ ตรวจสอบยอดคงเหลือจริง และส่งใบขอเบิกผ่านระบบตะกร้าสินค้า POS",
      whatItDoes: "ระบบ POS Terminal ช่วยให้เจ้าหน้าที่หน้างานสามารถเลือกโครงการ ค้นหาวัสดุอุปกรณ์ ตรวจสอบยอดสต็อกคงเหลือจริง และส่งคำขอเบิกวัสดุหลายรายการพร้อมกันในธุรกรรมเดียวได้อย่างสะดวกและรวดเร็ว",
      whoCanUse: "เจ้าหน้าที่เบิกจ่าย (Staff / Requester) และทุกบทบาทที่ได้รับสิทธิ์ withdrawals.create",
      steps: [
        "ไปที่เมนู \"ขอเบิกพัสดุ\" และเลือกโครงการปลายทางจากตัวเลือกโครงการ",
        "คลิกปุ่ม \"+ สร้างคำขอเบิก (POS)\" เพื่อเปิดระบบตะกร้าสินค้าขอเบิก",
        "ค้นหาพัสดุ ระบุจำนวนที่ต้องการ และคลิก \"เพิ่มลงตะกร้า\" (ระบบจะแจ้งเตือนทันทีหากจำนวนที่ขอเกินกว่าสต็อกคงเหลือ)",
        "เลือกสถานที่จัดเก็บปลายทาง และระบุวัตถุประสงค์หรือหมายเหตุการใช้งาน",
        "ตรวจสอบรายการพัสดุทั้งหมด แล้วคลิก \"ยืนยันการส่งคำขอเบิก\" เพื่อส่งคำขอเข้าระบบ"
      ],
      proTips: "สามารถใช้ฟังก์ชัน ชุดอุปกรณ์หน้างาน (Site Kits / BOM) เพื่อเพิ่มวัสดุมาตรฐานทั้งชุดลงในตะกร้าได้ในคลิกเดียว",
      warnings: "คำขอเบิกจะได้รับการตรวจสอบยอดสต็อกแบบ All-or-Nothing ในขั้นตอนการอนุมัติ หากมีพัสดุรายการใดรายการหนึ่งไม่เพียงพอ คำขอเบิกทั้งใบจะไม่สามารถอนุมัติได้"
    },
    withdrawalStatusLifecycle: {
      title: "3. วงจรและลำดับสถานะคำขอเบิก (Lifecycle)",
      shortDesc: "ทำความเข้าใจ 4 ขั้นตอนของสถานะคำขอเบิก ตั้งแต่การส่งคำขอไปจนถึงการตัดยอดสต็อกจริง",
      whatItDoes: "ให้ความโปร่งใสในการติดตามความคืบหน้าของคำขอเบิกพัสดุ เพื่อให้ผู้ขอเบิกและหัวหน้างานสามารถตรวจสอบสถานะได้อย่างแม่นยำทุกขั้นตอน",
      whoCanUse: "ผู้ขอเบิก, ผู้อนุมัติ และผู้ดูแลระบบ",
      steps: [
        "1. รอดำเนินการ (Pending): ส่งคำขอเข้าระบบแล้ว อยู่ระหว่างรอหัวหน้างานหรือผู้ดูแลระบบตรวจสอบความพร้อมของสต็อก",
        "2. อนุมัติแล้ว (Approved): คำขอได้รับการอนุมัติ ผู้ขอเบิกสามารถมารับพัสดุ ณ คลังจัดเก็บที่ระบุได้",
        "3. เสร็จสมบูรณ์ (Completed): จ่ายพัสดุเรียบร้อยแล้ว ยอดสต็อกจะถูกตัดออกจากระบบคลังสินค้าอย่างเป็นทางการ",
        "4. ปฏิเสธ (Rejected): คำขอถูกปฏิเสธ (เช่น สต็อกไม่เพียงพอ หรือข้อมูลไม่ถูกต้อง) พร้อมระบุเหตุผลประกอบ"
      ],
      proTips: "ผู้ขอเบิกสามารถตรวจสอบเหตุผลการปฏิเสธและประวัติการตรวจสอบได้ในหน้ารายละเอียดคำขอ เพื่อแก้ไขและส่งใหม่ได้ทันที",
      warnings: "ยอดสต็อกทางกายภาพจะยังไม่ถูกตัดออกจากคลังจนกว่าคำขอจะได้รับการอนุมัติและทำรายการสำเร็จครบถ้วน"
    },
    checkoutsAndReturns: {
      title: "4. การยืม-คืนอุปกรณ์และเครื่องมือช่าง",
      shortDesc: "บันทึกการยืมเครื่องมือ กำหนดวันส่งคืน ขอขยายเวลา และตรวจสอบสภาพเพื่อรับคืนเข้าคลัง",
      whatItDoes: "ระบบบริหารจัดการเครื่องมือหมุนเวียนและอุปกรณ์ที่ต้องส่งคืนสำหรับงานภาคสนาม มีระบบนับถอยหลังวันครบกำหนด การติดตามอุปกรณ์เกินกำหนดส่ง และการขยายเวลาส่งคืน",
      whoCanUse: "เจ้าหน้าที่ผู้ขอยืมอุปกรณ์ และเจ้าหน้าที่คลังที่ทำหน้าที่ตรวจรับคืน",
      steps: [
        "การยืมอุปกรณ์: ไปที่เมนู \"ยืม-คืนอุปกรณ์\" คลิก \"+ ยืมเครื่องมือ\" เลือกผู้ยืม กำหนดวันส่งคืน และระบุ Serial Number ของอุปกรณ์",
        "การติดตามสถานะ: ดูสถานะการยืมที่กำลังใช้งาน (ใช้งานอยู่, ใกล้ครบกำหนด, หรือ เกินกำหนดส่ง)",
        "การขอขยายเวลา (Extend): หากต้องการใช้งานต่อ ให้คลิก \"ขยายกำหนดเวลา\" เลือกวันใหม่พร้อมระบุเหตุผลความจำเป็น",
        "การคืนอุปกรณ์: เมื่อนำอุปกรณ์มาคืน เจ้าหน้าที่คลังคลิก \"ส่งคืน\" ตรวจสอบสภาพการทำงาน และกดยืนยันเพื่อนำกลับเข้าสู่สต็อก"
      ],
      proTips: "อุปกรณ์ที่เกินกำหนดส่งจะแสดงแถบสถานะสีแดงอย่างชัดเจน เพื่อความรวดเร็วในการติดตามและทวงคืน",
      warnings: "ควรตรวจสอบสภาพทางกายภาพและการทำงานของเครื่องมืออย่างละเอียดก่อนกดยืนยันรับคืนเข้าสู่สต็อก"
    },
    supervisorApprovalWorkflow: {
      title: "5. ขั้นตอนการอนุมัติสำหรับหัวหน้างาน (Supervisor)",
      shortDesc: "แนวทางการตรวจสอบสต็อก การอนุมัติทั้งคำขอ และหลักการ All-or-Nothing",
      whatItDoes: "ช่วยให้กระบวนการอนุมัติคำขอเบิกเป็นไปอย่างปลอดภัยและแม่นยำ โดยคำนวณยอดคงเหลือแบบ Real-time และใช้ระบบ All-or-Nothing เพื่อป้องกันยอดสต็อกผิดพลาด",
      whoCanUse: "หัวหน้างาน, ผู้อนุมัติ และผู้ดูแลระบบ",
      steps: [
        "ไปที่เมนู \"ขอเบิกพัสดุ\" และกรองดูเฉพาะรายการที่อยู่ในสถานะ \"รอดำเนินการ\" (Pending)",
        "คลิกที่รายการคำขอเพื่อตรวจสอบรายการพัสดุ จำนวนที่ขอ และยอดคงเหลือในคลังปัจจุบัน",
        "หากพัสดุทุกรายการมีสต็อกเพียงพอ ให้คลิกปุ่ม \"อนุมัติ\"",
        "หากมีพัสดุแม้แต่รายการเดียวที่สต็อกไม่พอ ให้คลิกปุ่ม \"ปฏิเสธ\" พร้อมพิมพ์เหตุผลชี้แจงแก่ผู้ขอเบิก"
      ],
      proTips: "ระบบใช้เทคโนโลยี Row-level Locking ของฐานข้อมูล ทำให้ผู้อนุมัติหลายคนสามารถทำงานพร้อมกันได้โดยไม่เกิดปัญหาแย่งสต็อก (Race Condition)",
      warnings: "ระบบปิดการอนุมัติพัสดุเพียงบางส่วนในคำขอ (Partial Approval) เพื่อรักษาความถูกต้องทางบัญชีและการควบคุมพัสดุ"
    },
    stockInInventoryManagement: {
      title: "6. การรับพัสดุเข้าคลังและการนำเข้าไฟล์ CSV",
      shortDesc: "บันทึกการรับเข้าพัสดุแบบรายครั้ง และการนำเข้าข้อมูลจำนวนมากผ่านไฟล์ CSV / Excel",
      whatItDoes: "บันทึกการเติมสต็อกวัสดุและอุปกรณ์เข้าสู่โครงการ รองรับทั้งการคีย์รับเข้าทีละรายการ และการอัปโหลดไฟล์ข้อมูลจำนวนมากในขั้นตอนเดียว",
      whoCanUse: "เจ้าหน้าที่คลังสินค้า, หัวหน้างาน และผู้ดูแลระบบ",
      steps: [
        "ไปที่เมนู \"รับเข้าพัสดุ\" แล้วเลือก \"+ รับเข้าพัสดุ\" หรือ \"นำเข้าไฟล์ CSV\"",
        "การบันทึกโดยตรง: เลือกสถานที่จัดเก็บ เลือกรายการพัสดุ ระบุจำนวน และบันทึกเลขที่ PO หรือใบส่งของ",
        "การนำเข้าผ่าน CSV: คลิก \"นำเข้า CSV\" ดาวน์โหลดแบบฟอร์ม กรอกข้อมูลพัสดุ แล้วอัปโหลดไฟล์เข้าระบบ",
        "ตรวจสอบตารางพรีวิวความถูกต้องของจำนวนพัสดุ แล้วคลิก \"ยืนยันการรับเข้าสต็อก\""
      ],
      proTips: "ตรวจสอบให้แน่ใจว่าไฟล์ CSV บันทึกด้วยรูปแบบการเข้ารหัส UTF-8 (หรือ UTF-8 BOM) เพื่อป้องกันปัญหาตัวอักษรภาษาไทยแสดงผลผิดพลาด",
      warnings: "การบันทึกรับเข้าจะเพิ่มยอดคงเหลือในระบบทันที กรุณาตรวจสอบรหัส SKU และสถานที่จัดเก็บให้ถูกต้องก่อนยืนยัน"
    },
    stockAdjustmentAndTransfer: {
      title: "7. การปรับปรุงยอดสต็อกและการโอนย้ายคลัง",
      shortDesc: "การตรวจนับสต็อกประจำงวด การปรับยอดเพิ่ม/ลด และการโอนย้ายพัสดุข้ามสถานที่จัดเก็บ",
      whatItDoes: "ออกแบบมาสำหรับการตรวจนับสต็อก (Cycle Count) ช่วยให้ผู้ดูแลสามารถปรับเพิ่มหรือลดยอดสต็อกเนื่องจากชำรุด สูญหาย หรือผลการนับจริงไม่ตรง ตลอดจนโอนย้ายพัสดุระหว่างโครงการ",
      whoCanUse: "หัวหน้างานและผู้ดูแลระบบที่ได้รับสิทธิ์ items.adjust_stock",
      steps: [
        "ไปที่เมนู \"รายการพัสดุ\" และค้นหารายการพัสดุที่ต้องการปรับยอด",
        "คลิกปุ่ม \"ปรับปรุงสต็อก\"",
        "ระบุยอดที่นับได้จริง หรือเลือกทิศทางการปรับปรุง (เพิ่มยอด / ลดยอด)",
        "ระบุเหตุผลประกอบการปรับปรุงยอด (เช่น การตรวจนับประจำปี, สินค้าชำรุด, หรือการปรับยอดยกมาเริ่มต้น)",
        "กดยืนยันการปรับปรุง ระบบจะบันทึกประวัติการตรวจสอบ (Audit Log) และอัปเดตยอดคงเหลือทันที"
      ],
      proTips: "การปรับปรุงยอดสต็อกทุกครั้งจะถูกบันทึกประวัติอย่างละเอียดในเมนู \"ประวัติธุรกรรม\" พร้อมเวลา ชื่อผู้ทำรายการ และเหตุผล",
      warnings: "การปรับลดยอดสต็อกส่งผลกระทบต่อมูลค่าสินค้าคงคลังโดยตรง แนะนำให้ได้รับการอนุมัติจากหัวหน้างานก่อนดำเนินการ"
    },
    projectsAndItemsMaster: {
      title: "8. การจัดการโครงการและทะเบียนพัสดุหลัก",
      shortDesc: "สร้างโครงการ กำหนดคลังจัดเก็บย่อย และลงทะเบียนรหัสพัสดุ (SKU) เข้าสู่ระบบ",
      whatItDoes: "แหล่งจัดเก็บข้อมูลหลัก (Master Data) สำหรับบริหารจัดการโครงสร้างโครงการ คลังพัสดุทางกายภาพ และการลงทะเบียนแคตตาล็อกวัสดุและอุปกรณ์ทั้งหมด",
      whoCanUse: "ผู้ดูแลระบบ (Administrator)",
      steps: [
        "การสร้างโครงการ: ไปที่เมนู \"โครงการ\" คลิก \"+ สร้างโครงการใหม่\" ระบุรหัสโครงการ ชื่อ และสถานที่จัดเก็บย่อย",
        "การปิดการใช้งานโครงการ: เมื่อโครงการสิ้นสุด ให้เปลี่ยนสถานะเป็น Inactive เพื่อป้องกันการทำธุรกรรมใหม่โดยยังคงรักษาประวัติไว้ครบถ้วน",
        "การลงทะเบียนพัสดุ: ไปที่เมนู \"รายการพัสดุ\" คลิก \"+ เพิ่มพัสดุใหม่\" ระบุรหัส SKU ชื่อ หน่วยนับ และหมวดหมู่"
      ],
      proTips: "ควรกำหนดรูปแบบรหัสโครงการและรหัส SKU ให้เป็นมาตรฐานเดียวกัน (เช่น PRJ-001, MAT-ELC-001) เพื่อความสะดวกรวดเร็วในการค้นหา",
      warnings: "โครงการที่ถูกตั้งสถานะเป็น Inactive จะถูกซ่อนออกจากแบบฟอร์มขอเบิกและแบบฟอร์มรับเข้าพัสดุโดยอัตโนมัติ"
    },
    userManagementAndAvatars: {
      title: "9. การจัดการผู้ใช้และขอบเขตสิทธิ์โครงการ",
      shortDesc: "สร้างบัญชีผู้ใช้ มอบหมายบทบาท กำหนดสิทธิ์เข้าถึงโครงการ และจัดการรูปโปรไฟล์ผ่าน R2",
      whatItDoes: "ศูนย์กลางการบริหารจัดการบัญชีผู้ใช้งาน ข้อมูลโปรไฟล์ แผนกงาน ขอบเขตการเข้าถึงโครงการ การบังคับเปลี่ยนรหัสผ่าน และรูปประจำตัวผ่าน Cloudflare R2",
      whoCanUse: "ผู้ดูแลระบบ (Administrator)",
      steps: [
        "ไปที่เมนู \"จัดการผู้ใช้\" คลิก \"+ เพิ่มผู้ใช้ใหม่\" หรือคลิกไอคอนรูปดินสอเพื่อแก้ไขผู้ใช้เดิม",
        "แท็บข้อมูลทั่วไป: กรอกชื่อ-นามสกุล เบอร์โทรศัพท์ แผนก ตำแหน่ง อัปโหลดรูปภาพ และเลือกบังคับเปลี่ยนรหัสผ่านเมื่อเข้าสู่ระบบครั้งแรก",
        "แท็บบทบาทและสถานะ: เลือกบทบาทของผู้ใช้ และสถานะบัญชี (ACTIVE, INACTIVE หรือ SUSPENDED)",
        "แท็บสิทธิ์เข้าถึงโครงการ: เลือก \"ทุกโครงการ\" หรือ \"เฉพาะโครงการที่เลือก\" เพื่อจำกัดการมองเห็นข้อมูลโครงการ",
        "คลิก \"บันทึกข้อมูล\" ข้อมูลจะถูกซิงค์ไปยังฐานข้อมูลและอัปเดตตารางแสดงผลทันที"
      ],
      proTips: "ระบบมีกลไก Last Admin Protection ป้องกันไม่ให้ปิดการใช้งานหรือลดระดับสิทธิ์ของผู้ดูแลระบบคนสุดท้ายโดยไม่ได้ตั้งใจ",
      warnings: "เมื่อพนักงานลาออก ให้เปลี่ยนสถานะบัญชีเป็น INACTIVE แทนการลบบัญชี เพื่อรักษาประวัติการทำธุรกรรมย้อนหลังไว้ครบถ้วน"
    },
    dynamicRbacRoleManagement: {
      title: "10. ระบบกำหนดสิทธิ์ไดนามิก (Dynamic RBAC) ที่ /roles",
      shortDesc: "สร้างบทบาทใหม่ กำหนดสิทธิ์การทำงานอย่างละเอียด และเลือกธีมสีป้ายบทบาท",
      whatItDoes: "ระบบควบคุมการเข้าถึงตามบทบาท (RBAC) ขั้นสูง ช่วยให้ผู้ดูแลระบบสามารถสร้างบทบาทใหม่ และกำหนดสิทธิ์การใช้งานได้อย่างละเอียดมากกว่า 36 รายการ",
      whoCanUse: "ผู้ดูแลระบบ (Administrator)",
      steps: [
        "ไปที่เมนู \"บทบาทและสิทธิ์\" ที่หน้า `/roles`",
        "ตรวจสอบจำนวนผู้ใช้และสิทธิ์ที่จัดสรรไว้ในแต่ละการ์ดบทบาท",
        "คลิก \"+ สร้างบทบาทใหม่\" ระบุรหัสบทบาท ชื่อที่แสดง คำอธิบาย และเลือกสีป้ายกำกับพร้อมดูตัวอย่างแบบสด",
        "คลิก \"จัดการสิทธิ์\" บนการ์ดบทบาทใดก็ได้เพื่อเปิด-ปิดสิทธิ์การทำงานแต่ละด้าน",
        "ระบบ Permission Dependency Engine จะเปิดสิทธิ์ที่จำเป็นเบื้องต้นให้อัตโนมัติ (เช่น การเปิดสิทธิ์สร้างโครงการ จะเปิดสิทธิ์ดูโครงการให้โดยอัตโนมัติ)",
        "คลิก \"บันทึกสิทธิ์\" การเปลี่ยนแปลงจะมีผลต่อผู้ใช้งานทุกคนในบทบาทนั้นทันที"
      ],
      proTips: "บทบาทเริ่มต้นของระบบ (ADMIN, STAFF, SUPERVISOR) ได้รับการป้องกันไม่ให้ลบ เพื่อรักษาเสถียรภาพของระบบ",
      warnings: "การยกเลิกสิทธิ์จะมีผลทันทีต่อผู้ใช้งานที่กำลังล็อกอินอยู่ในบทบาทนั้น"
    },
    reportsAndAuditHistory: {
      title: "11. รายงานสรุปและประวัติการตรวจสอบ (Audit Trail)",
      shortDesc: "สร้างรายงานสรุปพัสดุคงเหลือ รายงานการเบิกจ่าย และส่งออกเป็นไฟล์ Excel / PDF",
      whatItDoes: "ศูนย์รวมรายงานสำหรับตรวจสอบยอดพัสดุคงเหลือ การเคลื่อนไหวของสต็อก ประวัติการขอเบิกประจำโครงการ และประวัติการใช้งานของผู้ใช้ รองรับการส่งออกเป็นไฟล์ Excel และเอกสาร PDF ที่พร้อมพิมพ์",
      whoCanUse: "หัวหน้างาน, ผู้อนุมัติ, ผู้บริหาร และผู้ดูแลระบบ",
      steps: [
        "ไปที่เมนู \"รายงาน\" และเลือกประเภทรายงานที่ต้องการ (ยอดคงเหลือ / ประวัติการขอเบิก / รายงานชุด Site Kit)",
        "เลือกช่วงวันที่และกรองข้อมูลตามโครงการที่ต้องการ",
        "คลิก \"ส่งออก Excel (XLSX)\" สำหรับนำข้อมูลไปวิเคราะห์ต่อในตารางคำนวณ",
        "คลิก \"พิมพ์รายงาน PDF\" เพื่อสร้างเอกสารทางการที่จัดรูปแบบสวยงามพร้อมหัวจดหมายและตารางสถิติสรุป"
      ],
      proTips: "สามารถตรวจสอบประวัติธุรกรรมโดยละเอียดได้ตลอดเวลาในเมนู \"ประวัติธุรกรรม\" ซึ่งจะบันทึกทั้ง IP Address เวลา และข้อมูลที่มีการเปลี่ยนแปลง",
      warnings: "เมื่อต้องการส่งออกข้อมูลปริมาณมาก ควรเลือกช่วงวันที่ให้เจาะจง เพื่อความรวดเร็วในการประมวลผลรายงาน"
    }
  }
};

// Merge into en.js and th.js
const enPath = './src/i18n/locales/en.js';
const thPath = './src/i18n/locales/th.js';

let enContent = fs.readFileSync(enPath, 'utf8');
let thContent = fs.readFileSync(thPath, 'utf8');

// Replace the "manual": { ... } object in en.js
const enManualRegex = /"manual":\s*\{[\s\S]*?\n\s*\},/g;
enContent = enContent.replace(enManualRegex, `"manual": ${JSON.stringify(enManual, null, 2)},`);

// Replace the "manual": { ... } object in th.js
const thManualRegex = /"manual":\s*\{[\s\S]*?\n\s*\},/g;
thContent = thContent.replace(thManualRegex, `"manual": ${JSON.stringify(thManual, null, 2)},`);

fs.writeFileSync(enPath, enContent, 'utf8');
fs.writeFileSync(thPath, thContent, 'utf8');
console.log('Successfully updated en.js and th.js with full manual translations!');
