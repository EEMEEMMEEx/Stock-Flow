import { createClient } from '@supabase/supabase-js'

const rawUrl = typeof import.meta !== 'undefined' && import.meta.env 
  ? import.meta.env.VITE_SUPABASE_URL 
  : globalThis.process?.env?.VITE_SUPABASE_URL
// Publishable keys are the current recommended browser credential. Keep the
// legacy anon-key fallback so existing deployments continue to work.
const rawAnonKey = typeof import.meta !== 'undefined' && import.meta.env 
  ? (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY)
  : (globalThis.process?.env?.VITE_SUPABASE_PUBLISHABLE_KEY || globalThis.process?.env?.VITE_SUPABASE_ANON_KEY)

if (!rawUrl || !rawAnonKey) {
  console.warn('[StockFlow] Missing VITE_SUPABASE_URL and a publishable or anon key. Using placeholder client.')
}

const supabaseUrl = rawUrl && rawUrl.trim() !== '' ? rawUrl : 'https://placeholder-project.supabase.co'
const supabaseAnonKey = rawAnonKey && rawAnonKey.trim() !== '' ? rawAnonKey : 'placeholder-anon-key'

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE'])
const NOTIFICATION_SOURCE_TABLES = new Set([
  'withdrawal_orders',
  'withdrawal_items',
  'checkout_orders',
  'checkout_items',
  'checkout_return_logs',
  'stock_in_orders',
  'stock_in_items',
  'stock_balance'
])
const READ_ONLY_RPC_PREFIXES = [
  'get_',
  'search_',
  'admin_get_',
  'has_permission',
  'is_super_admin',
  'mark_notification',
  'mark_all_notification'
]
const IGNORED_RPCS = new Set([
  'upsert_push_subscription',
  'remove_push_subscription'
])

/**
 * Determine whether a successful Supabase REST call may have produced recipient notifications.
 */
export function shouldTriggerWebPushAfterSupabaseRequest(input, init) {
  const method = String(
    init?.method || (typeof Request !== 'undefined' && input instanceof Request ? input.method : 'GET')
  ).toUpperCase()
  if (!MUTATING_METHODS.has(method)) return false

  const rawUrlValue = typeof input === 'string'
    ? input
    : (input && typeof input === 'object' && 'url' in input ? String(input.url) : '')
  if (!rawUrlValue) return false

  let pathname = ''
  try {
    pathname = new URL(rawUrlValue, 'https://placeholder.local').pathname
  } catch {
    return false
  }

  const restMatch = pathname.match(/\/rest\/v1\/(.+)$/)
  if (!restMatch) return false

  const resourcePath = restMatch[1].toLowerCase()
  if (resourcePath.startsWith('rpc/')) {
    const rpcName = resourcePath.slice(4).split('/')[0]
    if (!rpcName || IGNORED_RPCS.has(rpcName)) return false
    return !READ_ONLY_RPC_PREFIXES.some((prefix) => rpcName.startsWith(prefix))
  }

  const tableName = resourcePath.split('/')[0]
  return NOTIFICATION_SOURCE_TABLES.has(tableName)
}

/**
 * Wrap Supabase fetch so successful notification-producing browser writes dispatch background Web Push.
 */
export function createDispatchAwareFetch({ baseFetch, onMutationSuccess } = {}) {
  return async (input, init) => {
    const fetchImpl = baseFetch || globalThis.fetch
    const response = await fetchImpl(input, init)

    if (response?.ok && shouldTriggerWebPushAfterSupabaseRequest(input, init)) {
      if (typeof onMutationSuccess === 'function') {
        Promise.resolve().then(() => onMutationSuccess()).catch(() => {})
      } else if (typeof window !== 'undefined') {
        // Lazy dynamic import breaks ESM cycle with pushNotifications -> supabase
        import('./pushNotifications')
          .then((mod) => mod.triggerPendingWebPushDispatch())
          .catch(() => {})
      }
    }

    return response
  }
}

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce'
    },
    global: {
      fetch: createDispatchAwareFetch()
    }
  }
)
