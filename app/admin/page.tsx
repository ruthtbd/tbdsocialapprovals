'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase, type Campaign, type Post } from '@/lib/supabase'

const PINK = '#f6a7d7'

type Theme = { bg: string; card: string; border: string; text: string; subtext: string; faint: string; inputBg: string }

const THEME: Theme = { bg: '#fff', card: '#fff', border: 'rgba(0,0,0,0.1)', text: '#000', subtext: '#000', faint: '#000', inputBg: 'rgba(0,0,0,0.04)' }

type PostRow = Pick<Post, 'id' | 'campaign_id' | 'status' | 'scheduled_at' | 'scheduled_date' | 'caption' | 'internal_approved_at'>
type ExpandedKey = 'unapproved' | 'unscheduled' | 'overdue' | null

export default function AdminPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [posts, setPosts] = useState<PostRow[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<ExpandedKey>(null)
  const [showTrash, setShowTrash] = useState(false)
  const [trash, setTrash] = useState<Campaign[]>([])
  const [trashedPosts, setTrashedPosts] = useState<(PostRow & { deleted_at: string | null })[]>([])

  const t = THEME

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    const [{ data: camps }, { data: ps }] = await Promise.all([
      supabase.from('campaigns').select('*').is('deleted_at', null).order('created_at', { ascending: false }),
      supabase.from('posts').select('id, campaign_id, status, scheduled_at, scheduled_date, caption, deleted_at, internal_approved_at').is('deleted_at', null),
    ])
    setCampaigns(camps || [])
    setPosts(ps || [])
    setLoading(false)
  }

  async function fetchTrash() {
    // Trashed campaigns, plus individually trashed posts (where the campaign is still live).
    // Posts under a trashed campaign are shown through their campaign row, so we only list orphan
    // trashed posts to avoid double-counting.
    const [{ data: trashCamps }, { data: deadPosts }] = await Promise.all([
      supabase.from('campaigns').select('*').not('deleted_at', 'is', null).order('deleted_at', { ascending: false }),
      supabase.from('posts').select('id, campaign_id, status, scheduled_at, scheduled_date, caption, deleted_at, internal_approved_at').not('deleted_at', 'is', null).order('deleted_at', { ascending: false }),
    ])
    setTrash(trashCamps || [])
    const trashedCampaignIds = new Set((trashCamps || []).map(c => c.id))
    setTrashedPosts((deadPosts || []).filter(p => !trashedCampaignIds.has(p.campaign_id)))
  }

  async function restorePost(id: string) {
    await supabase.from('posts').update({ deleted_at: null }).eq('id', id)
    setTrashedPosts(p => p.filter(x => x.id !== id))
    fetchAll()
  }

  async function permanentlyDeletePost(post: PostRow) {
    if (!confirm('Permanently delete this post AND its files? This cannot be undone.')) return
    try { await deleteStorageFolder(`${post.campaign_id}/${post.id}`) }
    catch (e) { console.warn('storage cleanup failed (continuing):', e) }
    await supabase.from('posts').delete().eq('id', post.id)
    setTrashedPosts(p => p.filter(x => x.id !== post.id))
  }

  // Stats — computed across all posts in all campaigns (drafts included so nothing is missed)
  const todayIso = new Date().toISOString().slice(0, 10)
  const unapproved = posts.filter(p => p.status === null || p.status === 'changes_requested')
  const unscheduled = posts.filter(p => p.status === 'approved' && !p.scheduled_at)
  const overdue = posts.filter(p => p.scheduled_date && p.scheduled_date < todayIso && !p.scheduled_at && p.status !== 'rejected')
  const campaignById = new Map(campaigns.map(c => [c.id, c]))

  function postLabel(p: PostRow) {
    const camp = campaignById.get(p.campaign_id)
    const title = (p.caption || '').slice(0, 60).replace(/\n/g, ' ').trim() || '(no caption)'
    return {
      campaignName: camp?.title || 'Unknown campaign',
      clientName: camp?.client_name || null,
      title,
      campaignId: p.campaign_id,
      postId: p.id,
    }
  }

  async function deleteCampaign(id: string) {
    if (!confirm('Move this campaign to trash? You can restore it within 30 days.')) return
    // Soft delete — set deleted_at; data stays in the DB so the captions and assets survive
    await supabase.from('campaigns').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    setCampaigns(c => c.filter(x => x.id !== id))
  }

  async function restoreCampaign(id: string) {
    await supabase.from('campaigns').update({ deleted_at: null }).eq('id', id)
    setTrash(c => c.filter(x => x.id !== id))
    fetchAll()
  }

  async function permanentlyDeleteCampaign(id: string) {
    if (!confirm('Permanently delete this campaign AND all its files? This cannot be undone.')) return
    // Wipe the storage folder for this campaign first — recursively list and remove every file.
    // Supabase storage doesn't have a "delete folder" primitive, so we walk the tree.
    try {
      await deleteStorageFolder(`${id}`)
    } catch (e) {
      console.warn('storage cleanup failed (continuing with DB delete):', e)
    }
    await supabase.from('campaigns').delete().eq('id', id)
    setTrash(c => c.filter(x => x.id !== id))
  }

  // Recursively remove every file under a Supabase storage path.
  async function deleteStorageFolder(path: string) {
    const { data: entries } = await supabase.storage.from('posts').list(path, { limit: 1000 })
    if (!entries) return
    const files = entries.filter(e => e.id !== null).map(e => `${path}/${e.name}`)
    const folders = entries.filter(e => e.id === null)
    if (files.length) await supabase.storage.from('posts').remove(files)
    for (const f of folders) await deleteStorageFolder(`${path}/${f.name}`)
  }

  const [purging, setPurging] = useState(false)
  // Find files in the posts bucket that have no matching live post_asset row and remove them.
  // Failed/retried uploads (which timestamp each filename) leave orphans behind, and those
  // are usually the bulk of "storage is full but I deleted everything" surprises.
  async function purgeOrphanFiles() {
    if (!confirm('Find and delete every storage file that has no matching post record? Cannot be undone.')) return
    setPurging(true)
    try {
      // 1. Collect every file_url and thumbnail_url that's still referenced by an active asset.
      const { data: assets } = await supabase.from('post_assets').select('file_url, thumbnail_url')
      const keep = new Set<string>()
      ;(assets || []).forEach(a => {
        if (a.file_url) keep.add(extractStoragePath(a.file_url))
        if (a.thumbnail_url) keep.add(extractStoragePath(a.thumbnail_url))
      })

      // 2. Walk the bucket: every file path that isn't in `keep` is orphaned.
      const all: string[] = []
      await collectFiles('', all)
      const orphans = all.filter(p => !keep.has(p))

      if (!orphans.length) {
        alert(`Nothing to clean — ${all.length} files in storage, all accounted for.`)
        return
      }
      if (!confirm(`Found ${orphans.length} orphan file${orphans.length === 1 ? '' : 's'} (out of ${all.length} total). Delete them now?`)) return

      // Supabase remove takes max 1000 paths per call — chunk it.
      for (let i = 0; i < orphans.length; i += 1000) {
        await supabase.storage.from('posts').remove(orphans.slice(i, i + 1000))
      }
      alert(`Deleted ${orphans.length} orphan file${orphans.length === 1 ? '' : 's'}.`)
    } finally {
      setPurging(false)
    }
  }

  // Storage URLs look like .../storage/v1/object/public/posts/<path>. We want just <path>.
  function extractStoragePath(url: string) {
    const marker = '/storage/v1/object/public/posts/'
    const i = url.indexOf(marker)
    if (i === -1) return url
    return url.slice(i + marker.length).split('?')[0]
  }

  // Recursive listing of every file under a prefix in the posts bucket.
  // Paginates in pages of 1000 so nothing is skipped when a folder has thousands of files.
  async function collectFiles(prefix: string, out: string[]) {
    let offset = 0
    const pageSize = 1000
    // Keep pulling pages until Supabase returns fewer than pageSize entries.
    while (true) {
      const { data: entries } = await supabase.storage.from('posts').list(prefix, { limit: pageSize, offset })
      if (!entries || entries.length === 0) break
      for (const e of entries) {
        const path = prefix ? `${prefix}/${e.name}` : e.name
        if (e.id === null) await collectFiles(path, out)
        else out.push(path)
      }
      if (entries.length < pageSize) break
      offset += pageSize
    }
  }

  // Permanently delete every soft-deleted post (and its files) across all campaigns.
  async function purgeTrashedPosts() {
    if (!confirm('Permanently delete the files for every trashed post? This cannot be undone.')) return
    setPurging(true)
    try {
      const { data: dead } = await supabase
        .from('posts')
        .select('id, campaign_id')
        .not('deleted_at', 'is', null)
      const list = dead || []
      for (const p of list) {
        try { await deleteStorageFolder(`${p.campaign_id}/${p.id}`) }
        catch (e) { console.warn('storage cleanup failed for', p.id, e) }
      }
      if (list.length) await supabase.from('posts').delete().in('id', list.map(p => p.id))
      alert(`Cleared ${list.length} trashed post${list.length === 1 ? '' : 's'} and their files.`)
    } finally {
      setPurging(false)
    }
  }

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''

  return (
    <div className="min-h-screen transition-colors duration-200 p-6 md:p-10" style={{ backgroundColor: t.bg, color: t.text }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-10">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: PINK }}>Post Approval</h1>
          <p className="text-sm mt-1" style={{ color: t.subtext }}>Manage review campaigns</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={purgeTrashedPosts} disabled={purging}
            className="text-xs px-3 py-1.5 rounded-full transition-colors disabled:opacity-50"
            style={{ border: `1px solid ${t.border}`, color: t.subtext }}>
            {purging ? 'Clearing…' : 'Clear trashed'}
          </button>
          <button onClick={purgeOrphanFiles} disabled={purging}
            className="text-xs px-3 py-1.5 rounded-full transition-colors disabled:opacity-50"
            style={{ border: `1px solid ${t.border}`, color: t.subtext }}>
            {purging ? '…' : 'Clear orphans'}
          </button>
          <button onClick={() => { if (!showTrash) fetchTrash(); setShowTrash(s => !s) }}
            className="text-xs px-3 py-1.5 rounded-full transition-colors"
            style={{ border: `1px solid ${t.border}`, color: t.subtext }}>
            {showTrash ? 'Back' : '🗑 Trash'}
          </button>
          <Link href="/admin/new"
            className="px-5 py-2.5 rounded-full text-sm font-semibold text-black transition-opacity hover:opacity-80"
            style={{ backgroundColor: PINK }}>
            + New Campaign
          </Link>
        </div>
      </div>

      {showTrash ? (
        <div className="space-y-8">
          <div>
            <h2 className="text-lg font-semibold mb-3" style={{ color: t.text }}>Trash</h2>
            <p className="text-xs mb-4" style={{ color: t.faint }}>Restore within 30 days. Captions, posts, and files are all preserved.</p>
          </div>

          {/* Trashed campaigns */}
          <div>
            <p className="text-xs uppercase tracking-widest mb-3" style={{ color: t.faint }}>Campaigns ({trash.length})</p>
            {trash.length === 0 ? (
              <div className="rounded-2xl p-6 text-center text-xs" style={{ border: `1px dashed ${t.border}`, color: t.faint }}>No trashed campaigns.</div>
            ) : (
              <div className="grid gap-3">
                {trash.map(c => (
                  <div key={c.id} className="rounded-2xl p-4 flex items-center justify-between gap-4"
                    style={{ backgroundColor: t.card, border: `1px solid ${t.border}` }}>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate" style={{ color: t.text }}>{c.title}</p>
                      <p className="text-xs mt-0.5" style={{ color: t.faint }}>
                        {c.client_name ? `${c.client_name} · ` : ''}deleted {c.deleted_at ? new Date(c.deleted_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => restoreCampaign(c.id)}
                        className="text-xs px-3 py-1.5 rounded-full font-medium"
                        style={{ backgroundColor: `${PINK}20`, color: PINK, border: `1px solid ${PINK}40` }}>
                        Restore
                      </button>
                      <button onClick={() => permanentlyDeleteCampaign(c.id)}
                        className="text-xs px-3 py-1.5 rounded-full"
                        style={{ border: `1px solid ${t.border}`, color: t.faint }}>
                        Delete forever
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Individually trashed posts (where the campaign is still live) */}
          <div>
            <p className="text-xs uppercase tracking-widest mb-3" style={{ color: t.faint }}>Posts ({trashedPosts.length})</p>
            {trashedPosts.length === 0 ? (
              <div className="rounded-2xl p-6 text-center text-xs" style={{ border: `1px dashed ${t.border}`, color: t.faint }}>No trashed posts.</div>
            ) : (
              <div className="grid gap-2">
                {trashedPosts.map(p => {
                  const camp = campaignById.get(p.campaign_id)
                  const title = (p.caption || '').slice(0, 80).replace(/\n/g, ' ').trim() || '(no caption)'
                  return (
                    <div key={p.id} className="rounded-2xl p-3 flex items-center justify-between gap-3"
                      style={{ backgroundColor: t.card, border: `1px solid ${t.border}` }}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: t.text }}>{title}</p>
                        <p className="text-xs mt-0.5" style={{ color: t.faint }}>
                          {camp?.client_name ? `${camp.client_name} · ` : ''}{camp?.title || 'Unknown campaign'} · deleted {p.deleted_at ? new Date(p.deleted_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => restorePost(p.id)}
                          className="text-xs px-3 py-1.5 rounded-full font-medium"
                          style={{ backgroundColor: `${PINK}20`, color: PINK, border: `1px solid ${PINK}40` }}>
                          Restore
                        </button>
                        <button onClick={() => permanentlyDeletePost(p)}
                          className="text-xs px-3 py-1.5 rounded-full"
                          style={{ border: `1px solid ${t.border}`, color: t.faint }}>
                          Delete forever
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      ) : (<>
      {/* Dashboard stats */}
      {!loading && campaigns.length > 0 && (
        <div className="mb-10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            {([
              { key: 'unapproved' as const, label: 'Awaiting approval', count: unapproved.length, items: unapproved, color: '#f59e0b', hint: 'Drafts + changes requested' },
              { key: 'unscheduled' as const, label: 'Approved, not posted', count: unscheduled.length, items: unscheduled, color: PINK, hint: 'Ready to post' },
              { key: 'overdue' as const, label: 'Overdue', count: overdue.length, items: overdue, color: '#ef4444', hint: 'Scheduled date passed, not posted' },
            ]).map(card => {
              const active = expanded === card.key
              return (
                <button key={card.key}
                  onClick={() => setExpanded(active ? null : card.key)}
                  className="text-left rounded-2xl p-5 transition-all"
                  style={{
                    border: `1px solid ${active ? card.color : t.border}`,
                    backgroundColor: active ? `${card.color}10` : t.card,
                  }}>
                  <p className="text-xs uppercase tracking-widest font-medium" style={{ color: t.faint }}>{card.label}</p>
                  <p className="text-3xl font-bold mt-2" style={{ color: card.color }}>{card.count}</p>
                  <p className="text-xs mt-1.5" style={{ color: t.faint }}>{card.hint}</p>
                  {card.count > 0 && (
                    <p className="text-xs mt-3 font-medium" style={{ color: card.color }}>
                      {active ? 'Hide' : 'Show'} details →
                    </p>
                  )}
                </button>
              )
            })}
          </div>

          {expanded && (
            <div className="rounded-2xl p-4 max-h-80 overflow-y-auto" style={{ border: `1px solid ${t.border}`, backgroundColor: t.inputBg }}>
              {(expanded === 'unapproved' ? unapproved : expanded === 'unscheduled' ? unscheduled : overdue).length === 0 ? (
                <p className="text-sm text-center py-4" style={{ color: t.faint }}>Nothing here — nice.</p>
              ) : (
                <div className="space-y-1.5">
                  {(expanded === 'unapproved' ? unapproved : expanded === 'unscheduled' ? unscheduled : overdue).map(p => {
                    const info = postLabel(p)
                    const scheduledLabel = p.scheduled_date
                      ? new Date(p.scheduled_date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
                      : null
                    return (
                      <Link key={p.id}
                        href={`/admin/campaign/${info.campaignId}#post-${info.postId}`}
                        className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 transition-colors hover:opacity-80"
                        style={{ backgroundColor: t.card, border: `1px solid ${t.border}` }}>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium truncate" style={{ color: t.text }}>{info.title}</p>
                          <p className="text-xs mt-0.5" style={{ color: t.faint }}>
                            {info.clientName ? `${info.clientName} · ` : ''}{info.campaignName}{scheduledLabel ? ` · 📅 ${scheduledLabel}` : ''}
                          </p>
                        </div>
                        <span className="text-xs shrink-0" style={{ color: t.faint }}>Open →</span>
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

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
                  {c.status === 'draft' && (
                    <span className="text-xs px-2.5 py-0.5 rounded-full font-medium"
                      style={{ backgroundColor: t.inputBg, color: t.faint, border: `1px dashed ${t.border}` }}>
                      Draft
                    </span>
                  )}
                  {c.status !== 'draft' && c.approved_at && (
                    <span className="text-xs px-2.5 py-0.5 rounded-full font-medium"
                      style={{ backgroundColor: '#f6a7d720', color: PINK }}>
                      ✓ Approved
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
                    onClick={() => { navigator.clipboard.writeText(`${baseUrl}/review`); alert('Sign-in link copied! Approvers sign in with their email.') }}
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
      </>)}
    </div>
  )
}
