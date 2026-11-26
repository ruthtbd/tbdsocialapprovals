'use client'

// Reviewer landing — if signed in, lists the campaigns this reviewer is assigned to.
// If signed out, shows a magic-link form. Admins get an additional button to the admin console.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase, type Campaign } from '@/lib/supabase'

const PINK = '#f6a7d7'

export default function ReviewerHome() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState<{ email: string } | null>(null)
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let ignore = false
    async function load() {
      const { data: s } = await supabase.auth.getSession()
      if (ignore) return
      if (!s.session?.user?.email) { setLoading(false); return }
      const myEmail = s.session.user.email.toLowerCase()
      setUser({ email: myEmail })
      // Find reviewer rows for this email, then the campaigns they belong to
      const { data: revs } = await supabase.from('reviewers').select('campaign_id').ilike('email', myEmail)
      const ids = Array.from(new Set((revs || []).map(r => r.campaign_id)))
      if (ids.length) {
        const { data: camps } = await supabase.from('campaigns').select('*').in('id', ids).is('deleted_at', null).order('created_at', { ascending: false })
        setCampaigns(camps || [])
      }
      setLoading(false)
    }
    load()
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) load()
    })
    return () => { ignore = true; sub.subscription.unsubscribe() }
  }, [])

  async function sendLink(e: React.FormEvent) {
    e.preventDefault()
    setError(null); setSending(true)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: typeof window !== 'undefined' ? `${window.location.origin}/review` : undefined },
    })
    setSending(false)
    if (error) { setError(error.message); return }
    setSent(true)
  }

  async function signOut() {
    await supabase.auth.signOut()
    setUser(null); setCampaigns([])
    router.refresh()
  }

  if (loading) return <div className="min-h-screen p-10 text-sm" style={{ color: '#888' }}>Loading…</div>

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: '#fff', color: '#000' }}>
        <form onSubmit={sendLink} className="w-full max-w-sm space-y-5">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold" style={{ color: PINK }}>The Break Digital</h1>
            <p className="text-sm mt-1" style={{ color: '#666' }}>Sign in to review your content</p>
          </div>
          {sent ? (
            <div className="rounded-xl p-4 text-sm text-center" style={{ backgroundColor: `${PINK}18`, color: PINK }}>
              ✉ Check your email — we sent you a sign-in link.
            </div>
          ) : (
            <>
              <div>
                <label className="text-xs uppercase tracking-widest mb-2 block" style={{ color: '#666' }}>Your email</label>
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
                No password needed. We&apos;ll email you a one-time link.
              </p>
            </>
          )}
        </form>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-6 md:p-10" style={{ backgroundColor: '#fff', color: '#000' }}>
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: PINK }}>Your campaigns</h1>
            <p className="text-xs mt-1" style={{ color: '#666' }}>Signed in as {user.email}</p>
          </div>
          <button onClick={signOut} className="text-xs px-3 py-1.5 rounded-full" style={{ border: '1px solid rgba(0,0,0,0.1)', color: '#666' }}>Sign out</button>
        </div>

        {campaigns.length === 0 ? (
          <div className="rounded-2xl p-10 text-center text-sm" style={{ border: '1px dashed rgba(0,0,0,0.15)', color: '#888' }}>
            No campaigns assigned to <strong>{user.email}</strong> yet. Ask your account manager to add you.
          </div>
        ) : (
          <div className="space-y-3">
            {campaigns.map(c => (
              <Link key={c.id} href={`/review/campaign/${c.id}`}
                className="block rounded-2xl p-5 transition-colors hover:opacity-80"
                style={{ border: '1px solid rgba(0,0,0,0.1)' }}>
                <p className="font-semibold">{c.title}</p>
                {c.client_name && <p className="text-xs mt-1" style={{ color: '#888' }}>{c.client_name}</p>}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
