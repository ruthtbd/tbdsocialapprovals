'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase, type Campaign } from '@/lib/supabase'

export default function AdminPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchCampaigns()
  }, [])

  async function fetchCampaigns() {
    const { data } = await supabase
      .from('campaigns')
      .select('*')
      .order('created_at', { ascending: false })
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
    <div className="min-h-screen bg-black p-6 md:p-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-10">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: '#f6a7d7' }}>
            Post Approval
          </h1>
          <p className="text-white/50 text-sm mt-1">Manage review campaigns</p>
        </div>
        <Link
          href="/admin/new"
          className="px-5 py-2.5 rounded-full text-sm font-semibold text-black transition-opacity hover:opacity-80"
          style={{ backgroundColor: '#f6a7d7' }}
        >
          + New Campaign
        </Link>
      </div>

      {loading ? (
        <div className="text-white/40 text-sm">Loading...</div>
      ) : campaigns.length === 0 ? (
        <div className="border border-white/10 rounded-2xl p-12 text-center">
          <p className="text-white/40 mb-4">No campaigns yet.</p>
          <Link
            href="/admin/new"
            className="inline-block px-5 py-2.5 rounded-full text-sm font-semibold text-black"
            style={{ backgroundColor: '#f6a7d7' }}
          >
            Create your first campaign
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {campaigns.map(c => (
            <div
              key={c.id}
              className="border border-white/10 rounded-2xl p-5 flex items-center justify-between gap-4 hover:border-white/20 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="font-semibold text-white truncate">{c.title}</h2>
                  {c.client_name && (
                    <span className="text-xs text-white/40 truncate">{c.client_name}</span>
                  )}
                  {c.status === 'draft' ? (
                    <span className="text-xs px-2.5 py-0.5 rounded-full font-medium"
                      style={{ backgroundColor: '#ffffff10', color: '#ffffff40', border: '1px dashed rgba(255,255,255,0.2)' }}>
                      Draft
                    </span>
                  ) : (
                    <span
                      className="text-xs px-2.5 py-0.5 rounded-full font-medium"
                      style={
                        c.approved_at
                          ? { backgroundColor: '#f6a7d720', color: '#f6a7d7' }
                          : { backgroundColor: '#ffffff15', color: '#ffffff80' }
                      }
                    >
                      {c.approved_at ? '✓ Approved' : 'Pending'}
                    </span>
                  )}
                </div>
                <p className="text-white/30 text-xs mt-1">
                  {new Date(c.created_at).toLocaleDateString('en-AU', {
                    day: 'numeric', month: 'short', year: 'numeric'
                  })}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {c.status !== 'draft' && (
                  <button
                    onClick={() => {
                      const url = `${baseUrl}/review/${c.token}`
                      navigator.clipboard.writeText(url)
                      alert('Review link copied!')
                    }}
                    className="text-xs px-3 py-1.5 rounded-full border border-white/20 text-white/60 hover:border-white/40 hover:text-white transition-colors"
                  >
                    Copy link
                  </button>
                )}
                <Link
                  href={`/admin/campaign/${c.id}`}
                  className="text-xs px-3 py-1.5 rounded-full border transition-colors"
                  style={{ borderColor: '#f6a7d760', color: '#f6a7d7' }}
                >
                  View
                </Link>
                <button
                  onClick={() => deleteCampaign(c.id)}
                  className="text-xs px-3 py-1.5 rounded-full border border-white/10 text-white/30 hover:border-red-900 hover:text-red-400 transition-colors"
                >
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
