'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const PINK = '#f6a7d7'

function LoginInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const nextPath = searchParams.get('next') || '/admin'
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notAdmin, setNotAdmin] = useState(false)

  // If already signed in, skip the form
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user
      if (!user) return
      const isAdmin = (user.app_metadata as { is_admin?: boolean } | undefined)?.is_admin === true
      if (isAdmin) router.replace(nextPath.startsWith('/admin') ? nextPath : '/admin')
      else setNotAdmin(true)
    })
  }, [router, nextPath])

  async function sendLink(e: React.FormEvent) {
    e.preventDefault()
    setError(null); setSending(true)
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    // shouldCreateUser: false — admins must be created in Supabase first; this stops self-signup
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: `${origin}/admin/login`,
        shouldCreateUser: false,
      },
    })
    setSending(false)
    if (error) { setError(error.message); return }
    setSent(true)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: '#fff', color: '#000' }}>
      <form onSubmit={sendLink} className="w-full max-w-sm space-y-5">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold" style={{ color: PINK }}>Post Approval</h1>
          <p className="text-sm mt-1" style={{ color: '#666' }}>Admin sign-in</p>
        </div>

        {notAdmin ? (
          <div className="rounded-xl p-4 text-sm text-center space-y-3" style={{ backgroundColor: '#ff6b6b15', color: '#ff6b6b' }}>
            <p>You&apos;re signed in but your account isn&apos;t an admin.</p>
            <button type="button" onClick={async () => { await supabase.auth.signOut(); setNotAdmin(false) }}
              className="text-xs underline">Sign out and try a different email</button>
          </div>
        ) : sent ? (
          <div className="rounded-xl p-4 text-sm text-center" style={{ backgroundColor: `${PINK}18`, color: PINK }}>
            ✉ Check your email — we sent you a one-time sign-in link.
          </div>
        ) : (
          <>
            <div>
              <label className="text-xs uppercase tracking-widest mb-2 block" style={{ color: '#666' }}>Email</label>
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email"
                className="w-full rounded-xl px-4 py-3 focus:outline-none"
                style={{ backgroundColor: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.1)' }} />
            </div>
            {error && <p className="text-sm text-center" style={{ color: '#ef4444' }}>{error}</p>}
            <button type="submit" disabled={sending || !email}
              className="w-full py-3 rounded-full font-semibold text-black transition-opacity hover:opacity-80 disabled:opacity-40"
              style={{ backgroundColor: PINK }}>
              {sending ? 'Sending…' : 'Email me a link'}
            </button>
            <p className="text-xs text-center" style={{ color: '#888' }}>
              Admin accounts are created in Supabase by Ruth.
            </p>
          </>
        )}
      </form>
    </div>
  )
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen p-10 text-sm" style={{ color: '#888' }}>Loading…</div>}>
      <LoginInner />
    </Suspense>
  )
}
