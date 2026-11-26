'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// Middleware already enforces that /admin/* requires an admin session, so this layout
// only handles the signed-in chrome (email pill + sign out). It doesn't block render.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const isLogin = pathname === '/admin/login'
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user?.email ?? null)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setEmail(session?.user?.email ?? null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
    router.replace('/admin/login')
  }

  return (
    <>
      {email && !isLogin && (
        <div className="fixed top-3 right-3 z-50 flex items-center gap-2 text-xs rounded-full px-3 py-1.5"
          style={{ backgroundColor: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.1)' }}>
          <span style={{ color: '#666' }}>{email}</span>
          <button onClick={signOut} className="font-medium" style={{ color: '#f6a7d7' }}>Sign out</button>
        </div>
      )}
      {children}
    </>
  )
}
