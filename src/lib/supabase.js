import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[StockFlow] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment variables. Please add them in Vercel Project Settings.')
}

export const supabase = createClient(
  supabaseUrl || 'https://fhzvrgyjarmqnacamkop.supabase.co',
  supabaseAnonKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZoenZyZ3lqYXJtcW5hY2Fta29wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzMDk5MTUsImV4cCI6MjA5MTg4NTkxNX0.bPC-m0bSIkWpKtQDkGipl8iVpqnvkDXkm5j4ti8956Y'
)

