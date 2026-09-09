import { createClient } from '@supabase/supabase-js'

const rawUrl = import.meta.env.VITE_SUPABASE_URL
// Publishable keys are the current recommended browser credential. Keep the
// legacy anon-key fallback so existing deployments continue to work.
const rawAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY

if (!rawUrl || !rawAnonKey) {
  console.warn('[StockFlow] Missing VITE_SUPABASE_URL and a publishable or anon key. Using placeholder client.')
}

const supabaseUrl = rawUrl && rawUrl.trim() !== '' ? rawUrl : 'https://placeholder-project.supabase.co'
const supabaseAnonKey = rawAnonKey && rawAnonKey.trim() !== '' ? rawAnonKey : 'placeholder-anon-key'

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce'
    }
  }
)


