'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase, type Campaign } from '@/lib/supabase'

const PINK = '#f6a7d7'

type Theme = { bg: string; card: string; border: string; text: string; subtext: string; faint: string; inputBg: string }

function makeTheme(dark: boolean): Theme {
  return dark
    ? { bg: '#0a0a0a', card: '#111', border: 'rgba(255,255,255,0.1)', text: '#fff', subtext: 'rgba(255,255,255,0.5)', faint: 'rgba(255,255,255,0.25)', inputBg: 'rgba(255,255,255,0.06)' }
    : { bg: '#f4f4f4', card: '#fff', border: 'rgba(0,0,0,0.08)', text: '#0a0a0a', subtext: 'rgba(0,0,0,0.5)', faint: 'rgba(0,0,0,0.3)', inputBg: 'rgba(0,0,0,0.04)' }
}

function ThemeToggle({ dark, onToggle, border, subtext }: { dark: boolean; onToggle: () => void; border: string; subtext: string }) {
  return (
    <button onClick={onToggle}
      className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
      style={{ border: `1px solid ${border}` }}>
      {dark
        ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4" style={{ color: subtext }}><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
        : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4" style={{ color: subtext }}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
      }
    </button>
  )
}

export default function AdminPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [dark, setDark] = useState(() => {
    if (typeof window === 'undefined') return true
    return localStorage.getItem('adminDark') !== 'false'
  })

  const t = makeTheme(dark)

  function toggleDark() {
    const next = !dark
    setDark(next)
    localStorage.setItem('adminDark', String(next))
  }

  useEffect(() => { fetchCampaigns() }, [])

  async function fetchCampaigns() {
    const { data } = await supabase.from('campaigns').select('*').order('created_at', { ascending: false })
    setCampaigns(data || [])
    setLoading(false)
  }

  async function deleteCampaign(id: string) {
    if (!confirm('Delete this campaign and all its posts?')) return
    await supabase.from('campaigns').delete().eq('id', id)
    setCampaigns(c => c.filter(x => x.id !== id))
  }

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''

  return (
    <div className="min-h-screen transition-colors duration-200 p-6 md:p-10" style={{ backgroundColor: t.bg }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-10">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: PINK }}>Post Approval</h1>
          <p className="text-sm mt-1" style={{ color: t.subtext }}>Manage review campaigns</p>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle dark={dark} onToggle={toggleDark} border={t.border} subtext={t.subtext} />
          <Link href="/admin/new"
            className="px-5 py-2.5 rounded-full text-sm font-semibold text-black transition-opacity hover:opacity-80"
            style={{ backgroundColor: PINK }}>
            + New Campaign
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="text-sm" style={{ color: t.faint }}>Loading...</div>
      ) : campaigns.length === 0 ? (
        <div className="rounded-2xl p-12 text-center" style={{ border: `1px solid ${t.border}` }}>
          <p className="mb-4" style={{ color: t.subtext }}>No campaigns yet.</p>
          <Link href="/admin/new"
            className="inline-block px-5 py-2.5 rounded-full text-sm font-semibold text-black"
            style={{ backgroundColor: PINK }}>
            Create your first campaign
          </Link>
        </div>
      ) : (
        <div className="grid gap-3">
          {campaigns.map(c => (
            <div key={c.id}
              className="rounded-2xl p-5 flex items-center justify-between gap-4 transition-colors"
              style={{ backgroundColor: t.card, border: `1px solid ${t.border}` }}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="font-semibold truncate" style={{ color: t.text }}>{c.title}</h2>
                  {c.client_name && <span className="text-xs truncate" style={{ color: t.faint }}>{c.client_name}</span>}
                  {c.status === 'draft' ? (
                    <span className="text-xs px-2.5 py-0.5 rounded-full font-medium"
                      style={{ backgroundColor: t.inputBg, color: t.faint, border: `1px dashed ${t.border}` }}>
                      Draft
                    </span>
                  ) : (
                    <span className="text-xs px-2.5 py-0.5 rounded-full font-medium"
                      style={c.approved_at
                        ? { backgroundColor: '#f6a7d720', color: PINK }
                        : { backgroundColor: t.inputBg, color: t.subtext }}>
                      {c.approved_at ? '✓ Approved' : 'Pending'}
                    </span>
                  )}
                </div>
                <p className="text-xs mt-1" style={{ color: t.faint }}>
                  {new Date(c.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {c.status !== 'draft' && (
                  <button
                    onClick={() => { navigator.clipboard.writeText(`${baseUrl}/review/${c.token}`); alert('Review link copied!') }}
                    className="text-xs px-3 py-1.5 rounded-full transition-colors"
                    style={{ border: `1px solid ${t.border}`, color: t.subtext }}>
                    Copy link
                  </button>
                )}
                <Link href={`/admin/campaign/${c.id}`}
                  className="text-xs px-3 py-1.5 rounded-full transition-colors"
                  style={{ border: `1px solid ${PINK}60`, color: PINK }}>
                  View
                </Link>
                <button onClick={() => deleteCampaign(c.id)}
                  className="text-xs px-3 py-1.5 rounded-full transition-colors"
                  style={{ border: `1px solid ${t.border}`, color: t.faint }}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
