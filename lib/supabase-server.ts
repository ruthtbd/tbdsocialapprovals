// Server-side Supabase client — reads the auth cookie set by @supabase/ssr
// so middleware and server components know who's signed in.
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch { /* called from a server component where setting is disallowed — fine, middleware handles refresh */ }
        },
      },
    }
  )
}

export function isAdminFromAppMetadata(user: { app_metadata?: Record<string, unknown> } | null | undefined): boolean {
  if (!user?.app_metadata) return false
  return (user.app_metadata as { is_admin?: boolean }).is_admin === true
}
