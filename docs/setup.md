# Setup Guide

This guide provides detailed instructions on how to set up the necessary backend services for Phantom Magnetar.

## Supabase Setup

Phantom Magnetar uses [Supabase](https://supabase.com/) for authentication and database services.

1.  **Create a Supabase Project**
    - Go to [database.new](https://database.new) and create a new project.

2.  **Get Credentials**
    - In your project dashboard, go to **Settings** > **API**.
    - Copy the `Project URL` (URL) and `anon` `public` key (Key).

3.  **Environment Variables**
    - Create a `.env` file in the root directory (or copy from `.env.example`).
    - Add your credentials:
      ```env
      VITE_SUPABASE_URL=https://your-project-ref.supabase.co
      VITE_SUPABASE_ANON_KEY=your-anon-key
      ```

4.  **Database Schema**
    - **Inventory Table**:
      - Create a table named `products`.
      - Columns: `id` (uuid, pk), `name` (text), `price` (numeric), `stock` (int), `category` (text), `image_url` (text).
    - **Transactions Table**:
      - Create a table named `transactions`.
      - Columns: `id` (uuid, pk), `total` (numeric), `items` (jsonb), `created_at` (timestamp).
    - **Assets Table**:
      - Create a table named `assets`.
      - Columns: `id` (uuid, pk), `name` (text), `value` (numeric), `status` (text).

## Authentication

- Enable **Email/Password** provider in Supabase Authentication settings.
- Initial user sign-up can be done via the client-side code if the signup route is enabled, or manually added in the Supabase dashboard.

## Deployment

To deploy to Vercel or Netlify:
1.  Connect your repository.
2.  Add the `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as build environment variables.
3.  Deploy!
