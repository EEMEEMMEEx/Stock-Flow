import { createClient } from '@supabase/supabase-js'

const rawUrl = import.meta.env.VITE_SUPABASE_URL
const rawAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!rawUrl || !rawAnonKey) {
  console.warn('[StockFlow] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment variables. Using placeholder client.')
}

const supabaseUrl = rawUrl && rawUrl.trim() !== '' ? rawUrl : 'https://placeholder-project.supabase.co'
const supabaseAnonKey = rawAnonKey && rawAnonKey.trim() !== '' ? rawAnonKey : 'placeholder-anon-key'

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey
)


