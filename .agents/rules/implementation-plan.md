---
trigger: always_on
---

# Rules

> เป้าหมาย: ให้ AI Agent ทำงานแบบ **Minimal Change, Evidence-First, Plan → Execute → Verify** ไม่เดา API/Schema คุม Scope และสื่อสารกับผู้ใช้เป็นภาษาไทยอย่างสม่ำเสมอ

---

## 0. Rule Precedence

เมื่อกฎขัดกัน ให้ใช้ลำดับนี้:

1. **Safety / Security**
2. **Explicit User Instructions**
3. **Repository / Workspace Rules**
4. **Task-Specific Requirements**
5. **Global Rules**
6. **Optimization / Convenience**

หลักการ:
- ห้ามละเมิด Safety / Security
- ห้ามขยาย Scope เกินคำขอ
- หากผู้ใช้สั่ง Execute ทันที ให้เริ่มได้โดยไม่ต้องรอ Approval เพิ่ม
- งานหลายไฟล์/หลายระบบต้องสรุป Plan ก่อนลงมือ
- หาก Tool / MCP / CLI ใช้ไม่ได้ ให้ใช้วิธีที่เหมาะสมที่สุดแทนและแจ้งข้อจำกัดที่มีผลต่อความถูกต้อง

---

## 1. Language Policy

### 1.1 Thai Required

คำอธิบายสำหรับผู้ใช้ต้องเป็น **ภาษาไทยเป็นหลัก** เช่น:

- Summary
- Plan / Implementation Plan
- Walkthrough
- Review / Code Review
- Debugging / Error Explanation
- Recommendation
- Migration Guide
- TODO / Next Steps
- Verification Result
- Root Cause / Risk / Change Summary
- Architecture / Security / Performance Explanation

ตัวอย่าง:

```text
สรุป:
ปัญหาเกิดจาก stock validation ถูกตรวจเฉพาะ frontend ทำให้ยังเกิด race condition ได้

แนวทางแก้ไข:
ย้าย validation และ stock deduction ไปทำใน Supabase RPC transaction เดียวกัน
```

### 1.2 English Allowed

ใช้ภาษาอังกฤษได้สำหรับ:

- Source code
- Variable / Function / Class / Type / Component names
- API / SDK / Framework / Library / Package
- Database schema / Table / Column / RPC / Trigger
- CLI / Git / Shell commands
- File paths
- Environment variables / config keys
- HTTP methods / status codes
- Original error messages / logs / stack traces
- Technical keywords ที่แปลแล้วอาจคลาดเคลื่อน

ตัวอย่าง:

```text
ปัญหาอยู่ใน `process_stock_out()` เพราะไม่มี `SELECT ... FOR UPDATE`
ก่อนตรวจสอบ `available_stock`
```

### 1.3 Original Errors

คง Original Error ไว้ตามเดิม แล้วเพิ่มคำอธิบายภาษาไทยเมื่อจำเป็น:

```text
Error:
Insufficient stock: Available 0, Requested 100

คำอธิบาย:
ระบบปฏิเสธรายการเพราะ Stock คงเหลือ 0 แต่มีการขอเบิก 100 หน่วย
```

### 1.4 Final Language Check

ก่อนตอบ:
- คำอธิบายทั่วไปเป็นภาษาไทย
- Identifier / code / path / command ไม่ถูกแปล
- Original error ไม่ถูกดัดแปลง
- Error ภาษาอังกฤษมีคำอธิบายไทยเมื่อจำเป็น

---

## 2. Implementation Plan Policy

ต้องสร้าง Implementation Plan ก่อนงานที่มีผลกระทบสำคัญ เช่น:

- แก้หลายไฟล์
- Refactor โครงสร้าง
- เปลี่ยน Workflow / Business Logic หลัก
- Database Schema / Migration
- RPC / Function / Trigger
- Authentication / Authorization / RLS
- API Contract
- Security / Transaction / Concurrency
- Deployment / Breaking Change
- ผู้ใช้ร้องขอ Plan โดยตรง

งานเล็ก เช่น typo, label, CSS เล็กน้อย หรือ isolated one-line fix ไม่จำเป็นต้องสร้าง Plan เว้นแต่ผู้ใช้สั่ง

---

## 3. Implementation Plan Storage

เมื่อ Agent สร้าง Implementation Plan สำหรับ Project:

1. ตรวจ Project Root
2. ตรวจว่ามี `/docs` หรือไม่
3. ถ้าไม่มี ให้สร้าง `/docs`
4. บันทึก Plan ลง `/docs`
5. จากนั้นจึง Execute

ไม่ต้องถามผู้ใช้เพื่อขออนุญาตสร้าง `/docs`

Default path:

```text
/docs/implementation_plan.md
```

หากมีหลาย Plan ให้ใช้ชื่อเฉพาะ Feature แบบ kebab-case:

```text
/docs/stock-out-approval-implementation-plan.md
/docs/auth-refactor-implementation-plan.md
```

ห้าม overwrite ไฟล์เดิมแบบ blind:
- ถ้าไม่มี → Create
- ถ้ามี → Read ก่อน
- Task เดียวกัน → Update
- คนละ Task → Create new file

---

## 4. Implementation Plan Content

ควรมีเท่าที่เกี่ยวข้อง:

```markdown
# Implementation Plan

## Goal
## Current Behavior
## Target Behavior
## Scope
## Proposed Changes
## Files to Modify
## Database / API / RPC Changes
## Risks
## Backward Compatibility
## Verification Plan
## Rollback Plan
```

หัวข้อที่ไม่เกี่ยวข้องสามารถตัดออกได้

---

## 5. Evidence-First

ห้ามเดา:
- File path
- API / Function signature
- Database table / column
- RPC parameter
- Environment variable
- Package API
- Component interface

ก่อนระบุว่าจะเปลี่ยนอะไร ต้อง Inspect Repository / Workspace / Schema / Docs เมื่อทำได้

ใช้หลัก:

```text
Inspect → Confirm → Change
```

ไม่ใช่:

```text
Assume → Change → Hope
```

---

## 6. Required Workflow

สำหรับงานขนาดกลางถึงใหญ่:

```text
Inspect
→ Understand
→ Create / Update Plan
→ Ensure /docs exists
→ Save Plan
→ Execute
→ Verify
→ Review
→ Report in Thai
```

ห้ามเขียน Plan ย้อนหลังหลัง Implement เสร็จ เว้นแต่ Emergency Fix หรือผู้ใช้สั่งแก้ทันที

หาก Implementation จริงเปลี่ยนจาก Plan ต้อง Update Plan ให้ตรงกับของจริง

สถานะที่ใช้ได้:

```text
[ ] Pending
[x] Completed
[-] Removed
[!] Blocked
```

---

## 7. Minimal Change

เลือกการเปลี่ยนแปลงที่เล็กที่สุดซึ่งแก้ Root Cause ได้

ห้าม:
- Rewrite ระบบโดยไม่จำเป็น
- สร้าง abstraction ใหม่เกินเหตุ
- เพิ่ม dependency โดยไม่จำเป็น
- เปลี่ยน public API โดยไม่จำเป็น
- Rename หลายไฟล์/หลาย function นอก Scope
- เปลี่ยน Database Schema ถ้า Logic เดิมแก้ได้

---

## 8. Preserve Existing Behavior

ถ้าผู้ใช้ไม่ได้สั่งเปลี่ยน Behavior ต้องรักษา:

- Public APIs
- Function signatures
- Inputs / Outputs
- Existing workflow
- Business rules
- Validation
- Error handling
- Integrations
- Database compatibility

Refactor ต้องไม่เปลี่ยน Functional Behavior โดยไม่ตั้งใจ

---

## 9. Error Handling

เมื่อพบ Error:

1. เก็บ Original Error
2. หา Root Cause
3. แยก Symptom ออกจาก Cause
4. ตรวจ Code Path ที่เกี่ยวข้อง
5. แก้ Root Cause
6. ห้าม suppress error เพื่อให้ดูเหมือนผ่าน
7. Verify หลังแก้

หลีกเลี่ยง:

```javascript
try {
  ...
} catch {
  // ignore
}
```

เว้นแต่เป็น Requirement ที่ยืนยันแล้ว

---

## 10. Database Safety

งานที่เกี่ยวข้องกับ Stock, Balance, Payment, Approval, Reservation, Inventory หรือ Concurrent Update ต้องพิจารณา:

- Transaction / Atomicity
- Row locking
- Race condition
- Double execution
- Idempotency
- Constraints / Unique / Foreign Key
- Rollback behavior

Critical validation ต้องอยู่ฝั่ง Database / Server ด้วย ไม่พึ่ง frontend อย่างเดียว

---

## 11. Security

ก่อนแก้ Authentication / Authorization ให้ตรวจ:

- Auth boundary
- Roles / Permissions
- RLS
- Secrets / Environment variables
- Service role usage
- Client-side exposure
- Input validation
- Privilege escalation

ห้าม:
- ย้าย privileged secret ไป frontend
- ปิด Security Control เพื่อให้ error หาย

---

## 12. Verification

ห้ามถือว่างานเสร็จเพียงเพราะ compile ผ่าน

เลือกตรวจให้เหมาะกับงาน เช่น:

- Build
- Type Check
- Lint
- Unit / Integration Test
- Database / Migration Test
- Runtime / Browser / API Test
- Regression Test

ต้องตรวจทั้ง:
- Expected Success Case
- Relevant Failure / Edge Cases

ห้าม claim ว่า “ผ่าน” หากไม่ได้ทดสอบจริง

---

## 13. Final Report

หลัง Implement ให้รายงานเป็นภาษาไทยอย่างน้อย:

- สรุปการเปลี่ยนแปลง
- ไฟล์ที่แก้
- สิ่งที่ตรวจสอบแล้ว
- Verification Result
- ข้อจำกัด / สิ่งที่ยังไม่ได้ทดสอบ
- TODO / Next Steps ถ้ามี

ห้ามตอบแค่:

```text
Done.
Fixed.
Should work.
```

โดยไม่มีหลักฐาน

---

## 14. TODO / Next Steps

TODO ต้องเป็นสิ่งที่ยังต้องทำจริง และไม่ขยาย Scope เกินคำขอ

แยกได้เป็น:

```text
Required
Optional Improvement
Future Enhancement
```

---

## 15. Final Quality Gate

ก่อนตอบ Final:

### Scope
- แก้เฉพาะที่ผู้ใช้ขอ
- ไม่มี unrelated refactor

### Code
- ไม่มี dead code / debug code ใหม่
- ไม่มี duplicate logic โดยไม่จำเป็น

### Database
- Migration ปลอดภัย
- ไม่มี destructive change ที่ไม่ได้แจ้ง
- ตรวจ Transaction / Concurrency เมื่อเกี่ยวข้อง

### Documentation
- ถ้าสร้าง Implementation Plan ต้องอยู่ใน `/docs`
- ถ้าไม่มี `/docs` ต้องสร้าง
- Plan ต้องตรงกับ Implementation ล่าสุด

### Verification
- รันการตรวจที่เกี่ยวข้องเมื่อทำได้
- ไม่ claim ผลที่ไม่ได้ทดสอบ

### Language
- คำอธิบายเป็นภาษาไทย
- Technical identifiers คงอังกฤษ
- Original errors คงเดิม
- เพิ่มคำอธิบายไทยเมื่อจำเป็น

---

## Core Principle

```text
Evidence First
→ Plan
→ Save to /docs
→ Execute Minimal Change
→ Verify
→ Report in Thai
```