# Playwright E2E Smoke Tests

ทดสอบหน้าหลักของ Stock-Flow ผ่าน Playwright โดยจำลอง (mock) Supabase Auth/REST/RPC และ `/api/*` ทั้งหมด ไม่แตะข้อมูลจริง

## คำสั่งรันทดสอบ

```bash
# ติดตั้ง Chromium (ครั้งแรกหรือเมื่อยังไม่มี browser)
npx playwright install chromium

# รัน E2E ทั้งหมด (ต้องไม่รันพร้อม dev server ที่พอร์ตอื่นชนกัน)
npx playwright test
```
