import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[StockFlow] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment variables. Please add them in Vercel Project Settings.')
}

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey
)

