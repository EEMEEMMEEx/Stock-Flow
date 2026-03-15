# Phantom Magnetar

## Overview
Phantom Magnetar is a modern Point of Sale (POS) and Inventory Management Dashboard built with **React 19**, **Vite**, and **Tailwind CSS**. It leverages **Supabase** for backend services (Authentication & Database) and **Zustand** for state management.

## Features
- **Dashboard**: Real-time analytics, sales overview, and business insights.
- **Product Management**: Catalog managing for inventory, pricing, and stock levels.
- **Point of Sale (POS)**: Efficient cart system and transaction processing.
- **Assets Tracking**: Manage business assets and equipment.
- **Authentication**: Secure login and protected routes via Supabase Auth.
- **Reporting**: Generate PDF reports for transactions and inventory.

## Tech Stack
- **Frontend**: React 19, Vite
- **Styling**: Tailwind CSS, Shadcn-like components (Lucide React)
- **State Management**: Zustand
- **Backend/Auth**: Supabase
- **Charts**: Recharts
- **PDF Generation**: jsPDF, autoTable

## Getting Started

### Prerequisites
- Node.js (v18 or higher recommended)
- npm or yarn
- A Supabase project

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd phantom-magnetar
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   Copy `.env.example` to `.env` and fill in your Supabase credentials:
   ```bash
   cp .env.example .env
   ```
   Edit `.env`:
   ```env
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. **Run Development Server**
   ```bash
   npm run dev
   ```

## Development
- `npm run dev`: Start dev server
- `npm run build`: Build for production
- `npm run lint`: Lint code
