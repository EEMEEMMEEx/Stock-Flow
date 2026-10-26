# Agent Operating Manual (1 หน้า)

เอกสารนี้เป็น “คู่มืออ้างอิงเร็วเฉพาะโปรเจกต์” สำหรับ AI Agent และผู้พัฒนาใน **Stock-Flow (stock-flow-app)** กำหนดสแต็ก, เวิร์กโฟลว์ และมาตรฐานทางวิศวกรรมเฉพาะ repo ควบคู่กับ Global Rules

## CRITICAL SAFETY RULES (Repo-Specific)

### ขอบเขตงาน (Workspace Path Restriction)
- ทำงาน **เฉพาะภายใน workspace ของ repo นี้** (`Stock-Flow-app/`) เท่านั้น
- **ห้าม** อ่าน/เขียน/ลบ/รันคำสั่งที่กระทบ path **นอก repo** (เช่น drive root `C:\`, `D:\`, `/home/`, หรือโปรเจกต์อื่น) เว้นแต่ผู้ใช้สั่งชัดเจน
- ใช้ absolute path ได้ **เมื่อชี้ไปที่ไฟล์ภายใน workspace เท่านั้น**

### โปรโตคอลก่อนลบไฟล์ (Deletion Protocol)
ก่อนลบไฟล์หรือโฟลเดอร์ **ใดๆ** ภายใน repo ต้องได้รับยืนยันชัดเจน:
1. แสดง **path ที่แน่นอน** ที่จะลบ
2. อธิบาย **สิ่งที่จะหายไป** และ **เหตุผล**
3. รอการยืนยันจากผู้ใช้ (เช่น `YES, DELETE <path>`) — หากไม่ชัดเจนให้ยกเลิกทันที

### Git & Destructive Actions
- ปฏิบัติตาม Global Rules §2/§8: ห้าม force push ไปยัง `main`/`master`, ห้าม `git reset --hard`, `git clean -fdx`, หรือ `--amend` commit ที่ push แล้ว
- คำสั่งล้างฐานข้อมูลหรือคำสั่งทำลายโครงสร้าง ต้องได้รับการยืนยันอย่างชัดเจนก่อนรันเสมอ

---

## MUST READ (Project Skills & Knowledge Base)
- **Deep Engineering & Parallel Rigor (pstack / Poteto Mode)**: `.agents/skills/pstack/SKILL.md` (Go deep first, 23 playbooks, 20 foundational principles, anti-slop, verifiable units)
- **Codebase Standards**: `.agents/skills/clean-code/SKILL.md` (clean, direct, pragmatic code)
- **Database & Supabase Concurrency**: `.agents/skills/database-design/SKILL.md` (Atomic RPCs, `SELECT ... FOR UPDATE`, RLS)
- **Frontend Design & UI/UX**: `.agents/skills/frontend-design/SKILL.md`, `.agents/skills/tailwind-patterns/SKILL.md`
- **Verification & Validation**: `.agents/skills/verify-changes/SKILL.md`, `.agents/skills/lint-and-validate/SKILL.md`
- **Systematic Debugging**: `.agents/skills/systematic-debugging/SKILL.md` (Evidence-first, reproducible trace)
- **Email & SMTP**: `.agents/skills/gmail-smtp/SKILL.md` (HTML email templates, deliverability, Nodemailer)
- **Terse Output & Token Efficiency**: `.agents/skills/caveman/SKILL.md` (Caveman voice — ตอบสั้นกระชับ ตัดน้ำ ตัดคำทักทาย รักษารายละเอียดทางเทคนิคและโค้ด 100% ประหยัด token)

---

## Mandatory Engineering Workflow (pstack / Poteto Mode)
AI Agent ทุกตัว **ต้องเรียกใช้และปฏิบัติตามข้อกำหนดของ skill `pstack` (`.agents/skills/pstack/SKILL.md`) อย่างเคร่งครัด** ในทุกงานที่ไม่ใช่งานตอบคำถามทั่วไป:
- **จับคู่งานกับ 1 ใน 23 Playbooks เสมอ**: คัดลอกขั้นตอนของ Playbook ที่ตรงกับงาน (เช่น `investigation`, `bug-fix`, `feature`, `refactoring`, `prototype`, `shipping`, `babysit`, `orchestrate`) มาไว้ใน Todo List ของงานเป็นลำดับแรก
- **Non-negotiable Triggers (เงื่อนไขบังคับใช้)**:
  - **งานสถาปัตยกรรม / ตัดสินใจเชิงโครงสร้าง / ความไม่แน่ใจ**: เรียกใช้ `how` / `architect` ทำ parallel design exploration ก่อนลงมือ
  - **พบทางแยก ("ควรเลือกแบบไหน", "จะทำยังไงดี")**: หากเป็นข้อเท็จจริงที่พิสูจน์ได้ด้วย runtime ให้ทำ prototype ทดสอบจริงก่อน ห้ามถามผู้ใช้โดยไม่จำเป็น
  - **ก่อนเขียนโค้ดทุกครั้ง**: ระบุ Data Shape ให้ชัดเจน และจัดโครงสร้างโดเมนตาม `principle-model-the-domain`
  - **โค้ดที่ข้ามขอบเขตฟังก์ชัน / โมดูล**: ใช้ `architect` วางโครงสร้างก่อน implement
  - **การขนานงาน (Parallel Fan-out)**: ใช้ `swarm` (coverage / gauntlet) และ `arena` (bakeoff)
  - **ดีไซน์ที่มีข้อถกเถียง**: ผ่านการตรวจสอบแบบ adversarial review ด้วย `interrogate` ก่อนส่งมอบ
  - **คำอธิบาย / ข้อความสรุป**: ใช้ `unslop` ตอบกระชับ ประโยคบอกเล่าสั้น ตรงประเด็น ไม่มีน้ำ เน้นมุมมอง consumer และ maintainer
  - **ก่อน review โค้ด**: ตัดคอมเมนต์บรรยายขั้นตอนออก เหลือเฉพาะ *why* ตาม `no-comments`
  - **การวัด Performance / Benchmark**: ผ่าน `benchmark-checklist` และอธิบายตัวเลขตาม `principle-explain-the-number`
  - **การส่งมอบและ merge**: ปฏิบัติตาม `babysit` และ `shipping` (Green CI ยังไม่พอ ต้องมี contiguous verified run)
  - **งานระยะยาว / Autonomous Run**: บันทึก Decision Trail ตลอดทางด้วย `show-me-your-work`
- **Principle Citation**: ระบุชื่อ Principle ของ pstack ที่ชี้นำการตัดสินใจในคำตอบเสมอ (เช่น `Laziness Protocol`, `Prove It Works`, `Fix Root Causes`, `Model the Domain`)

---

## Skill Usage Policy

### Mandatory Rule
Before starting any task, check the skill list below. If the task meets a skill's trigger conditions, you **MUST** invoke that skill and follow its instructions. Do not skip a matching skill because the task seems simple.

### Conflict Resolution & Priority Rule
If multiple skills match a task, invoke all that apply. If their instructions conflict, **project rules in `AGENTS.md` and explicit user instructions take priority over skill content**.

### Safety Constraints Subordination
Skills are strictly subordinate to safety constraints: a skill may **never** override user confirmation requirements, secret-handling rules, or destructive-action restrictions.

### Installed Skills Registry (All 68 Skills)

| Skill Name | Path | When to Invoke (Documented Trigger from SKILL.md) |
|---|---|---|
| `api-patterns` | `.agents/skills/api-patterns/SKILL.md` | When designing REST/GraphQL/tRPC APIs, defining response formats, versioning, pagination, or API authentication. NOT for UI/frontend work. |
| `app-builder` | `.agents/skills/app-builder/SKILL.md` | When creating a new full-stack application from scratch, selecting tech stack, or scaffolding project structure. Use with /create workflow. |
| `architecture` | `.agents/skills/architecture/SKILL.md` | When making architectural decisions, evaluating trade-offs, writing ADRs, or analyzing system design. NOT for direct code implementation. |
| `backend-api-pro` | `.agents/skills/backend-api-pro/SKILL.md` | Pragmatic backend API development guidelines for Node.js, Express, and database design. |
| `brainstorming` | `.agents/skills/brainstorming/SKILL.md` | When exploring options before implementation, clarifying requirements, or when the user needs creative problem-solving. Use with /brainstorm workflow. |
| `caveman` | `.agents/skills/caveman/SKILL.md` | Use for /caveman, 'caveman mode', 'talk like caveman', 'be brief', 'less tokens'. Stays on until 'stop caveman' or 'normal mode'. |
| `clean-code` | `.agents/skills/clean-code/SKILL.md` | Always active for ALL code writing. Enforces concise, direct coding standards, testing pyramid, and performance best practices. |
| `code-review` | `.agents/skills/code-review/SKILL.md` | Use when the user wants to review a branch, a PR, work-in-progress changes, or asks to 'review since X'.' |
| `codebase-design` | `.agents/skills/codebase-design/SKILL.md` | Use when the user wants to design or improve a module's interface, find deepening opportunities, decide where a seam goes, make code more testable or AI-navigable, or when another skill needs the deep-module vocabulary. |
| `coordinator-mode` | `.agents/skills/coordinator-mode/SKILL.md` | When the user needs multi-agent coordination, parallel task execution, complex multi-domain work, or when /coordinate or /orchestrate is invoked. NOT for single-domain tasks. |
| `database-design` | `.agents/skills/database-design/SKILL.md` | When designing database schemas, choosing ORMs, planning migrations, or optimizing queries. When working with Prisma, Drizzle, or SQL files. |
| `db-safety` | `.agents/skills/db-safety/SKILL.md` | Trigger on /db-safety or when the user mentions reset, drop, truncate, migrate, seed clear, or database wipe. |
| `debug-mantra` | `.agents/skills/debug-mantra/SKILL.md` | Trigger on /debug-mantra and proactively whenever debugging starts — user reports a bug, says something is broken/throwing/failing, asks to debug/diagnose/investigate, or pastes a stack trace or error log. |
| `design-spec` | `.agents/skills/design-spec/SKILL.md` | BEFORE writing any UI code (web or mobile). Read when creating or updating a project's DESIGN.md, defining design tokens, or when a UI task needs a design source-of-truth. Pair with frontend-design (web aesthetics) or mobile-design (mobile). |
| `diagnosing-superpowers` | `.agents/skills/diagnosing-superpowers/SKILL.md` | Use when a superpowers session went wrong and your human partner wants to know why — repeated work, ignored plans, stumbles, poor results, a skill that didn't fire, 'it took too long', 'why is it so expensive', 'what is it doing' — or wants to build a bug report for the superpowers maintainers, for the current session or a past one identified by id or path, on any harness. |
| `dispatching-parallel-agents` | `.agents/skills/dispatching-parallel-agents/SKILL.md` | Use when facing 2+ independent tasks that can be worked on without shared state or sequential dependencies |
| `documentation-templates` | `.agents/skills/documentation-templates/SKILL.md` | When writing README files, API documentation, code comments, or generating AI-friendly documentation. |
| `executing-plans` | `.agents/skills/executing-plans/SKILL.md` | Use when executing an implementation plan in the current session as the implementer yourself — your human partner chose inline execution, or no subagent tool is available |
| `finishing-a-development-branch` | `.agents/skills/finishing-a-development-branch/SKILL.md` | Use when implementation is complete, all tests pass, and you need to decide how to integrate the work |
| `frontend-architecture` | `.agents/skills/frontend-architecture/SKILL.md` | When structuring a frontend codebase or reviewing how frontend code is organized — where logic, API calls, state, types, and validation should live; component vs hook/composable boundaries; Next.js server/client split; Vue Composition API. NOT for visual design (use frontend-design) and NOT for React/Next performance rules (use nextjs-react-expert). |
| `frontend-design` | `.agents/skills/frontend-design/SKILL.md` | When designing or building web UI — components, layouts, color, typography, landing pages, or redesigns. NOT for mobile apps (use mobile-design). |
| `gmail-smtp` | `.agents/skills/gmail-smtp/SKILL.md` | Use when setting up Gmail SMTP, troubleshooting email delivery failures, fixing Microsoft 365/Corporate Inbox rejections, or resolving Spam/Phishing/Quarantine issues. |
| `grill-me` | `.agents/skills/grill-me/SKILL.md` | A relentless interview to sharpen a plan or design. |
| `grill-with-docs` | `.agents/skills/grill-with-docs/SKILL.md` | A relentless interview to sharpen a plan or design, which also creates docs (ADR's and glossary) as we go. |
| `grilling` | `.agents/skills/grilling/SKILL.md` | Trigger on /grill, 'grill this plan', 'stress-test this design' — NOT for PR/diff review (scrutinize), debugging (debug-mantra), or post-fix RCA. |
| `implement` | `.agents/skills/implement/SKILL.md` | 'Implement a piece of work based on a spec or set of tickets.' |
| `intelligent-routing` | `.agents/skills/intelligent-routing/SKILL.md` | Always active. Automatically selects the best specialist agent for each user request without explicit user mentions. |
| `lint-and-validate` | `.agents/skills/lint-and-validate/SKILL.md` | When running linters, type checkers, or code formatters. After any code change that needs quality validation. |
| `memory-system` | `.agents/skills/memory-system/SKILL.md` | When the user says 'remember this', 'save this for later', 'don't forget', or when starting a new session and needing to recall past context. Also when /remember workflow is invoked. |
| `nestjs-best-practices` | `.agents/skills/nestjs-best-practices/SKILL.md` | NestJS best practices and architecture patterns for building production-ready applications. This skill should be used when writing, reviewing, or refactoring NestJS code to ensure proper patterns for modules, dependency injection, security, and performance. |
| `nodejs-best-practices` | `.agents/skills/nodejs-best-practices/SKILL.md` | When building Node.js backends, selecting frameworks (Express/Fastify/NestJS), or implementing async patterns. |
| `plan-writing` | `.agents/skills/plan-writing/SKILL.md` | When creating structured task plans, breaking down features into tasks, or defining verification criteria. Use with /plan workflow. |
| `post-mortem` | `.agents/skills/post-mortem/SKILL.md` | Trigger when the user asks for post-mortem, RCA, root cause writeup, or to document/close out a fixed bug. For UI / NextAuth / unwrapApiData / page-level RCA, prefer frontend/.agents/skills/post-mortem. |
| `pstack` | `.agents/skills/pstack/SKILL.md` | Mandatory entry point for any non-trivial task, architectural decision, code boundary crossing, debugging, refactoring, benchmark, or multi-step execution per pstack specifications. |
| `receiving-code-review` | `.agents/skills/receiving-code-review/SKILL.md` | Use when receiving code review feedback, before implementing suggestions, especially if feedback seems unclear or technically questionable - requires technical rigor and verification, not performative agreement or blind implementation |
| `replica-architect` | `.agents/skills/replica-architect/SKILL.md` | Use when the user says 'plan the clone', 'what stack should I use', 'design the database', 'write the schema', 'plan the API', 'architecture for my version of X', or after /replica-recon finishes. |
| `replica-backend` | `.agents/skills/replica-backend/SKILL.md` | Use when the user says 'add login', 'set up auth', 'wire up the database', 'add payments', 'connect Stripe', 'add Google Calendar', 'send emails', 'backend for my clone', or when /replica-build is running on fake data. |
| `replica-brand` | `.agents/skills/replica-brand/SKILL.md` | Use when the user says 'name my app', 'rebrand the clone', 'make it mine', 'pick a name and colours', 'logo brief', 'brand voice', 'check for leftovers', or after /replica-entrepreneur. Always runs before /replica-launch. |
| `replica-build` | `.agents/skills/replica-build/SKILL.md` | Use when the user says 'build the clone', 'build screen S07', 'start building', 'rebuild this screen', 'implement the booking page', or after /replica-design. |
| `replica-deploy` | `.agents/skills/replica-deploy/SKILL.md` | Use when the user says 'deploy it', 'ship it', 'put it live', 'connect my domain', 'go to production', 'publish the app', or after /replica-launch. |
| `replica-design` | `.agents/skills/replica-design/SKILL.md` | Use when the user says 'match the design', 'rebuild the design system', 'get the colours and fonts', 'make it look like X', 'design tokens for my clone', or after /replica-architect. |
| `replica-diff` | `.agents/skills/replica-diff/SKILL.md` | Use when the user says 'how close is my clone', 'compare it to the original', 'what's missing', 'parity check', 'diff the screens', 'is it ready', or after /replica-test. |
| `replica-entrepreneur` | `.agents/skills/replica-entrepreneur/SKILL.md` | Use when the user says 'what do people hate about X', 'read the reviews', 'how do I make mine better', 'find the gap', 'what features are missing', 'how do I position this', 'make it sellable', or after /replica-diff. |
| `replica-launch` | `.agents/skills/replica-launch/SKILL.md` | Use when the user says 'landing page', 'pricing', 'how much should I charge', 'App Store listing', 'store screenshots', 'launch plan', 'Product Hunt', or after /replica-brand. |
| `replica-recon` | `.agents/skills/replica-recon/SKILL.md` | Use when the user says 'clone this app', 'reverse engineer X', 'how does X work', 'map out X', 'what screens does X have', 'I want to build my own version of X', 'copy this app', or pastes an app's URL or App Store link and wants to rebuild it. |
| `replica-test` | `.agents/skills/replica-test/SKILL.md` | Use when the user says 'test my clone', 'find bugs', 'QA this', 'click through everything', 'write e2e tests', 'does it work', or after /replica-build or /replica-backend. |
| `requesting-code-review` | `.agents/skills/requesting-code-review/SKILL.md` | Use when completing tasks, implementing major features, or before merging to verify work meets requirements |
| `scrutinize` | `.agents/skills/scrutinize/SKILL.md` | Trigger on /scrutinize or when the user asks to review/audit/sanity-check a plan, PR, diff, or design — NOT for active debugging (debug-mantra) or interactive pre-implementation Q&A (grilling). |
| `subagent-driven-development` | `.agents/skills/subagent-driven-development/SKILL.md` | Use when executing implementation plans with independent tasks in the current session |
| `superpowers-brainstorming` | `.agents/skills/superpowers-brainstorming/SKILL.md` | 'You MUST use this before any creative work - creating features, building components, adding functionality, modifying behavior, or planning anything new, in software or out of it (a talk, a business, a renovation).' |
| `superpowers-systematic-debugging` | `.agents/skills/superpowers-systematic-debugging/SKILL.md` | Use when encountering any bug, test failure, or unexpected behavior, before proposing fixes |
| `systematic-debugging` | `.agents/skills/systematic-debugging/SKILL.md` | When debugging complex issues, performing root cause analysis, or using evidence-based problem solving. Use with /debug workflow. |
| `tailwind-patterns` | `.agents/skills/tailwind-patterns/SKILL.md` | When using Tailwind CSS v4, implementing design tokens, container queries, or modern CSS patterns with Tailwind. |
| `test-driven-development` | `.agents/skills/test-driven-development/SKILL.md` | Use when implementing any feature or bugfix, before writing implementation code |
| `testing-patterns` | `.agents/skills/testing-patterns/SKILL.md` | When writing unit tests, integration tests, choosing testing frameworks, or implementing mocking strategies. |
| `to-spec` | `.agents/skills/to-spec/SKILL.md` | 'Turn the current conversation into a spec and publish it to the project issue tracker: no interview, just synthesis of what you've already discussed.' |
| `to-tickets` | `.agents/skills/to-tickets/SKILL.md` | Break a plan, spec, or the current conversation into a set of tracer-bullet tickets, each declaring its blocking edges, published to the configured tracker (edges as text in one file per ticket locally, or native blocking links on a real tracker). |
| `ultracave` | `.agents/skills/ultracave/SKILL.md` | Invoke only with /ultracave or /caveman ultra. Stays on until 'stop caveman' or 'normal mode'. |
| `using-git-worktrees` | `.agents/skills/using-git-worktrees/SKILL.md` | Use when starting feature work that needs isolation from current workspace or before executing implementation plans - ensures an isolated workspace exists via native tools or git worktree fallback |
| `using-superpowers` | `.agents/skills/using-superpowers/SKILL.md` | Use when starting any conversation - establishes how to find and use skills, requiring skill invocation before ANY response including clarifying questions |
| `verification-before-completion` | `.agents/skills/verification-before-completion/SKILL.md` | Use when about to claim work is complete, fixed, or passing, before committing or creating PRs - requires running verification commands and confirming output before making any success claims; evidence before assertions always |
| `verify-changes` | `.agents/skills/verify-changes/SKILL.md` | After writing code, completing a feature, or fixing a bug. When the user says 'does this work?', 'test this', 'verify', or when /verify workflow is invoked. NOT for writing new code — for proving existing code works. |
| `wayfinder` | `.agents/skills/wayfinder/SKILL.md` | Plan a huge chunk of work (more than one agent session can hold) as a shared map of decision tickets on your issue tracker, and resolve them one at a time until the way to the destination is clear. |
| `webapp-testing` | `.agents/skills/webapp-testing/SKILL.md` | When writing E2E tests with Playwright, performing deep web app audits, or testing user flows. Use with /test workflow. |
| `writing-plans` | `.agents/skills/writing-plans/SKILL.md` | Use when you have a spec or requirements for a multi-step task, before touching code |
| `writing-skills` | `.agents/skills/writing-skills/SKILL.md` | Use when creating new skills, editing existing skills, or verifying skills work before deployment |
| `xerj-code` | `.agents/skills/xerj-code/SKILL.md` | Use when starting a task in an unfamiliar API, porting an algorithm, or when you have already looped twice on the same error. |
| `xerj-security-audit` | `.agents/skills/xerj-security-audit/SKILL.md` | Use when the user wants to security-review PHP (or other-language) code with a provable 'we enumerated every dangerous call' guarantee, or asks to run the WordPress-style sink census / audit. Drives an index-once, query-read-reason loop; proves zero gaps against grep; enriches findings into a queryable ledger. |

---

## Security Gate (Repo Credentials & RPC Security)
- **Project Named Secrets**: ห้าม hardcode หรือเปิดเผย `SUPABASE_SERVICE_ROLE_KEY`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, Database Connection String ใช้ `.env` เท่านั้น (ในเอกสาร/คอมเมนต์ให้ใส่ `***`)
- **Supabase RPC Security**: ทุกฟังก์ชัน PL/pgSQL ต้องกำหนด `SECURITY DEFINER`, `SET search_path = public, auth, pg_temp` และตรวจสอบสิทธิ์ผู้เรียกผ่าน `auth.uid()` หรือ `has_permission()` เสมอ

---

## Definition of Done — Frontend (UI/UX)
- **Component Primitives**:
  - ใช้ component จาก `@/components/ui/*` (Radix UI + Tailwind CSS v4 ตาม `components.json`) ก่อน custom markup เสมอ
  - โมดอลและไดอะล็อกใช้ `Dialog` / `AlertDialog` ของ `@/components/ui/*` พร้อม backdrop overlay ที่ถูกต้อง
- **Styling Standard**:
  - Tailwind CSS v4 (`src/App.css`) รองรับทั้ง Dark Mode และ Light Mode
  - หน้า Landing Page ใช้ kinetic components จาก Reactbits (`Squares`, `SpotlightCard`, `DecryptedText`) ควบคู่กับ Framer Motion
- **Iconography**:
  - ใช้ Vector SVG ผ่าน `lucide-react` เท่านั้น
- **Accessibility & Interaction**:
  - Focus states ชัดเจน, Color contrast ≥ 4.5:1
  - ฟอร์มทุกตัวต้องมี Label, Icon-only buttons ต้องมี `aria-label`
  - Touch targets ≥ 44x44px, clickable elements มี `cursor-pointer`
  - ปุ่มและฟอร์มต้อง disable สถานะระหว่าง async/submitting เพื่อป้องกัน double-click
  - Error feedback แสดงใกล้จุดที่ผิดพลาด และมี toast แจ้งเตือน (`react-hot-toast`)
- **Responsive**: รองรับ Mobile (375px), Tablet (768px), Desktop (1024px/1440px) ห้ามมี horizontal overflow
- **Internationalization (i18n)**:
  - ทุกข้อความบน UI ต้องผ่าน `useTranslation()` จาก `src/i18n` รองรับทั้งไทย (`th`) และอังกฤษ (`en`)
  - ตรวจสอบความสอดคล้องของคำแปลด้วย `npm run check:i18n` เมื่อเพิ่มคีย์ภาษาใหม่

---

## Definition of Done — Backend & Database (Supabase / RPC)
- **Inventory Concurrency & Atomicity**:
  - การเคลื่อนย้ายสต็อกทุกประเภท (Withdrawal, Checkout, Return, Stock In, Transfer, Adjustment) **ต้องทำงานผ่าน PostgreSQL RPC ภายใน Database Transaction เดียวกัน**
  - บังคับใช้ `SELECT ... FOR UPDATE` ล็อกแถวข้อมูลใน `stock_balance` เพื่อป้องกัน Concurrency Race Condition ก่อนตรวจสอบและตัดสต็อกจริง
- **Data Integrity & Migrations**:
  - จัดการโครงสร้างข้อมูลผ่านไฟล์ migration ใน `supabase/migrations/` ตามลำดับตัวเลข/timestamp
  - ทุกตารางใน `public` schema ต้องเปิดใช้งาน RLS (`ENABLE ROW LEVEL SECURITY`) พร้อมกำหนด Policies ให้รัดกุม
- **Object Storage (Cloudflare R2)**:
  - การอัปโหลดไฟล์/รูปภาพต้องอัปโหลดตรงไปยัง Cloudflare R2 ผ่าน S3 Presigned URLs (`/api/r2-upload-url`)
  - ห้ามจัดเก็บไฟล์ Binary หรือ Base64 ขนาดใหญ่ลงในตาราง PostgreSQL

---

## Changelog & Version Management
- **Authoritative Version**: อ้างอิงจาก `package.json` (`version`) ช่องทางเดียว ทุกหน้าจอและส่วนแสดงผลต้องอ่านค่าจากนี้ (ปฏิบัติตาม SemVer ใน Global Rules §10)
- **Changelog Entry**: บันทึกรายละเอียดลงบนสุดของ [`CHANGELOG.md`](CHANGELOG.md) ตามฟอร์แมต:
  ```markdown
  ## [YYYY-MM-DD HH:mm] - vX.Y.Z
  - **Files Modified:** `file1.jsx`, `file2.sql`
  - **Changes:**
    - สรุปรายละเอียดการแก้ไขและเหตุผล
  ```

---

## ข้อมูลระบบ เอกสาร และคำสั่งสำคัญ
- **Production URL**: [https://stockflowth.online](https://stockflowth.online)
- **Landing Page**: [https://eemeemmeex.github.io/Stock-Flow/](https://eemeemmeex.github.io/Stock-Flow/)
- **Project Wiki**: [https://github.com/EEMEEMMEEx/Stock-Flow/wiki](https://github.com/EEMEEMMEEx/Stock-Flow/wiki)
- **เอกสารสำคัญในโปรเจกต์**:
  - สถาปัตยกรรมและคำศัพท์: [`README.md`](README.md), [`CONTEXT.md`](CONTEXT.md)
  - แผนงานและข้อกำหนด: โฟลเดอร์ [`docs/`](docs/)
  - นโยบายความปลอดภัย: [`SECURITY.md`](SECURITY.md)
  - UI Primitives Config: [`components.json`](components.json)
- **คำสั่งสำคัญ (Verification Commands)**:
  - `npm run dev`: รัน Local Development Server (Vite)
  - `npm run build`: ทดสอบ Build และตรวจจับ Syntax/Bundle Error
  - `npm run lint`: ตรวจสอบ Code Quality ด้วย ESLint
  - `npm run check:i18n`: ตรวจสอบความครบถ้วนของคีย์ภาษา (Thai & English Parity)
  - `npm run db:backup`: สำรองข้อมูลฐานข้อมูล Supabase ทั้งหมด

