# StockFlow — Enterprise Inventory & Material Management System

![React](https://img.shields.io/badge/React-18.3-blue.svg?style=for-the-badge&logo=react)
![Vite](https://img.shields.io/badge/Vite-5.4-purple.svg?style=for-the-badge&logo=vite)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_4.0-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-2.45-3ECF8E.svg?style=for-the-badge&logo=supabase&logoColor=white)

StockFlow is a production-grade, modern inventory management web application designed for tracking stock, items, and inventory flow across corporate projects. It is built for **Forth Corporation Public Company Limited** to support complex project-based warehousing, material requests, approval workflows, and live analytical reporting.

---

## 🚀 Key Features

### 1. Project-Based Inventory Flow
*   **Logical Partitioning:** Stock balance is segmented by Project. Items have specific quantities assigned to active locations/projects.
*   **Terminology:** Aligned with corporate hierarchy. Visual tags identify destination projects (`Project Name` + `Project Code`) rather than ambiguous UUIDs.

### 2. POS-Style Material Withdrawal Terminal
*   **Cart System:** Modern POS interface for scanning and selecting materials for withdrawal requests.
*   **Parent-Child Relationships:** Group materials dynamically. Handles child components associated with parent assets.
*   **Double Deduction Prevention:** Transaction-safe inventory calculations preventing concurrent race conditions.

### 3. Smart Approval & Shortage Dispatch
*   **Audit Flow:** Requested Items ➔ Admin Review ➔ Stock Allocation ➔ Receipt/Dispatch.
*   **Shortage (Partial) Handling:** If inventory is insufficient, the system flags the shortage, records the deficit (`shortage_quantity`), and permits partial fulfillment via admin authorization.

### 4. Advanced Analytical Reports & History
*   **Live Metrics:** Dynamic dashboard reporting total receiving (Stock In), withdrawals, total balance, and active shortages.
*   **Visual Analytics:** Responsive charts (Recharts) summarizing project distributions and inventory status breakdowns.
*   **Material Withdrawal Document:** Exports beautiful PDF/A standard material withdrawal documents (ใบเบิกของ) and Excel sheets on demand.

### 5. Role-Based Access Control (RBAC)
*   **Roles:** Admin, Supervisor, Operator.
*   **Security:** Supabase Database custom security model with automated `handle_new_user` triggers, atomic profile mapping, and Row-Level Security (RLS).

---

## 🛠️ Technology Stack

| Category | Technology | Purpose |
| :--- | :--- | :--- |
| **Core Frontend** | React `18.3` + Vite `5.4` | Fast, optimized UI rendering and build tooling |
| **Styling & UI** | Tailwind CSS `4.0` | Utility-first styling for responsive layouts |
| | Radix UI + Framer Motion | Accessible headless components and fluid animations |
| | Lucide React | Modern, clean scalable iconography |
| **Data & Analytics**| TanStack Table + Recharts | Powerful data grids and interactive charting |
| **Backend & Auth** | Supabase `2.45` | PostgreSQL DB, Authentication, Realtime & RLS Policies |
| **Microservice** | Node.js + Express `4.19` | PDF Service & SMTP Mailer Backend (Port 3001) |
| | `@react-pdf/renderer` | Dynamic PDF Template Generator (Zero-latency client-side) |
| | Nodemailer | Transactional email delivery service |

---

## 📐 System Architecture Overview

```mermaid
graph TD
    User([User Agent]) <--> |React Router / UI| WebClient[StockFlow SPA - Vite/React]
    WebClient <--> |REST / Realtime / Auth| Supabase[Supabase cloud / PostgreSQL]
    WebClient <--> |Generate PDF & Email| PDFService[Express PDF Service - Port 3001]
    PDFService <--> |Send SMTP| SMTP[SMTP Relay Server]
    PDFService <--> |Fetch / Update| Supabase
```

### 📂 Directory Structure

```text
├── .agents/                 # AI Assistant customization logs, rules, and plugins
├── docs/                    # Architectural decisions, specifications, and plans
├── public/                  # Static assets (images, company logo, icons)
├── src/                     # React Single Page Application source code
│   ├── components/          # Reusable UI components (reports, history, auth, ui)
│   ├── contexts/            # React AuthContext and Theme providers
│   ├── lib/                 # Core client configuration (supabase client, pdf templates)
│   ├── pages/               # Routing pages (History, Withdrawals, Reports, Items, etc.)
│   └── main.jsx             # React SPA entry point
├── supabase/                # Supabase configuration and database schemas
│   └── migrations/          # Version-controlled database migrations (01 to 38)
└── package.json             # Core dependencies configuration
```

---

## ⚙️ Environment Variables Config

Create a `.env` file in the project root folder. Refer to `.env.example` for details:

```ini
# Public browser configuration
VITE_SUPABASE_URL=your-supabase-project-url
VITE_SUPABASE_ANON_KEY=your-supabase-anonymous-key

# Server-only Supabase credential
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# Server-only SMTP configuration for Notifications
SMTP_HOST=your-smtp-host
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your-smtp-username
SMTP_PASS=your-smtp-password
SMTP_SENDER_EMAIL=notification@yourcompany.com
SMTP_SENDER_NAME=StockFlow Notification
```

---

## 💻 Local Development Setup

Follow these steps to run the application locally:

### 1. Install Dependencies
Run from the root directory:
```bash
npm install
```

### 2. Run the Frontend Development Server
Start Vite development server:
```bash
npm run dev
```
*   The web interface will be available at `http://localhost:5173`.

### 3. Build for Production
To build the static single-page application:
```bash
npm run build
```
The compiled output is saved in the `/dist` directory.

---

## 🔒 Security & Database RLS Policies

*   **Auth State:** Managed securely via Supabase Auth.
*   **Row-Level Security (RLS):** Implemented on all PostgreSQL tables in Supabase (e.g., `profiles`, `withdrawal_orders`, `projects`, `items`). Access is restricted based on JWT roles (Admin, Supervisor, Operator).
*   **PDF Generation:** Generated 100% client-side in browser using `@react-pdf/renderer` for maximum privacy, zero network latency, and zero server infrastructure overhead. Refer to [`docs/pdf_generation_guide.html`](docs/pdf_generation_guide.html) for architecture details.

---

## 📄 License

Proprietary and Confidential.  
Copyright (c) 2026 **Forth Corporation Public Company Limited**. All rights reserved.  
Refer to the [LICENSE](LICENSE) file in this repository for full terms.
