'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { parsePlatforms, fetchPostsWithAssets, type Campaign, type PostWithAssets, type PostAsset } from '@/lib/supabase'
import { supabase } from '@/lib/supabase'

const PLATFORMS = ['Instagram', 'TikTok', 'Facebook', 'LinkedIn', 'Twitter/X', 'YouTube', 'Other']
const PINK = '#f6a7d7'

type NewAsset = { id: string; file: File; preview: string; fileType: 'image' | 'video' }

type EditState = {
  postId: string
  caption: string
  platforms: string[]
  scheduledDate: string
  existingAssets: PostAsset[]
  newAssets: NewAsset[]
  saving: boolean
}

function EditModal({ state, campaignId, onSave, onClose }: {
  state: EditState
  campaignId: string
  onSave: (updated: PostWithAssets) => void
  onClose: () => void
}) {
  const [caption, setCaption] = useState(state.caption)
  const [platforms, setPlatforms] = useState(state.platforms)
  const [scheduledDate, setScheduledDate] = useState(state.scheduledDate)
  const [existingAssets, setExistingAssets] = useState(state.existingAssets)
  const [newAssets, setNewAssets] = useState<NewAsset[]>([])
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function togglePlatform(p: string) {
    setPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])
  }

  function addFiles(files: FileList | null) {
    if (!files) return
    const added: NewAsset[] = Array.from(files)
      .filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'))
      .map(f => ({
        id: Math.random().toString(36).slice(2),
        file: f,
        preview: URL.createObjectURL(f),
        fileType: f.type.startsWith('video/') ? 'video' : 'image',
      }))
    setNewAssets(prev => [...prev, ...added])
  }

  function removeExisting(assetId: string) {
    setExistingAssets(prev => prev.filter(a => a.id !== assetId))
  }

  function removeNew(assetId: string) {
    setNewAssets(prev => prev.filter(a => a.id !== assetId))
  }

  const totalAssets = existingAssets.length + newAssets.length

  async function handleSave() {
    setSaving(true)

    // Update post fields
    await supabase.from('posts').update({
      caption: caption || null,
      platform: platforms.length > 0 ? JSON.stringify(platforms) : null,
      scheduled_date: scheduledDate || null,
      status: 'pending',
      feedback: null,
    }).eq('id', state.postId)

    // Delete removed existing assets
    const removedIds = state.existingAssets.filter(a => !existingAssets.find(e => e.id === a.id)).map(a => a.id)
    if (removedIds.length) {
      await supabase.from('post_assets').delete().in('id', removedIds)
    }

    // Upload new assets
    const nextPosition = existingAssets.length
    for (let i = 0; i < newAssets.length; i++) {
      const asset = newAssets[i]
      const ext = asset.file.name.split('.').pop()
      const path = `${campaignId}/${state.postId}/${asset.id}.${ext}`
      const { error } = await supabase.storage.from('posts').upload(path, asset.file, { cacheControl: '3600', upsert: false })
      if (error) continue
      const { data: { publicUrl } } = supabase.storage.from('posts').getPublicUrl(path)
      await supabase.from('post_assets').insert({
        post_id: state.postId,
        file_url: publicUrl,
        file_type: asset.fileType,
        position: nextPosition + i,
      })
    }

    // Reload updated post
    const { data: updatedPost } = await supabase.from('posts').select('*').eq('id', state.postId).single()
    const { data: updatedAssets } = await supabase.from('post_assets').select('*').eq('post_id', state.postId).order('position')
    if (updatedPost) {
      onSave({ ...updatedPost, assets: updatedAssets || [] })
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-lg rounded-3xl overflow-hidden max-h-[90vh] flex flex-col"
        style={{ backgroundColor: '#0d0d0d', border: '1px solid rgba(255,255,255,0.1)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="font-semibold text-white">Edit post</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors text-xl leading-none">✕</button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-6 space-y-5">

          {/* Assets */}
          <div>
            <p className="text-xs text-white/30 uppercase tracking-widest mb-2">Assets</p>
            <div className="flex gap-2 flex-wrap">
              {existingAssets.map((a, i) => (
                <div key={a.id} className="relative w-16 h-16 rounded-lg overflow-hidden bg-white/5 shrink-0">
                  {a.file_type === 'video'
                    ? <video src={a.file_url} className="w-full h-full object-cover" muted />
                    // eslint-disable-next-line @next/next/no-img-element
                    : <img src={a.file_url} alt="" className="w-full h-full object-cover" />
                  }
                  {i === 0 && totalAssets > 1 && (
                    <span className="absolute bottom-0 left-0 right-0 text-center text-white text-[9px] bg-black/60 py-0.5">cover</span>
                  )}
                  <button onClick={() => removeExisting(a.id)}
                    className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 flex items-center justify-center text-white/80 hover:text-white text-[10px]">
                    ✕
                  </button>
                </div>
              ))}
              {newAssets.map(a => (
                <div key={a.id} className="relative w-16 h-16 rounded-lg overflow-hidden bg-white/5 shrink-0">
                  {a.fileType === 'video'
                    ? <video src={a.preview} className="w-full h-full object-cover" muted />
                    // eslint-disable-next-line @next/next/no-img-element
                    : <img src={a.preview} alt="" className="w-full h-full object-cover" />
                  }
                  <div className="absolute top-0.5 left-0.5 w-3 h-3 rounded-full" style={{ backgroundColor: PINK }} />
                  <button onClick={() => removeNew(a.id)}
                    className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 flex items-center justify-center text-white/80 hover:text-white text-[10px]">
                    ✕
                  </button>
                </div>
              ))}
              {totalAssets < 5 && (
                <button onClick={() => fileRef.current?.click()}
                  className="w-16 h-16 rounded-lg border border-dashed flex items-center justify-center shrink-0 transition-colors"
                  style={{ borderColor: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.3)' }}>
                  <span className="text-xl leading-none">+</span>
                </button>
              )}
              <input ref={fileRef} type="file" multiple accept="image/*,video/*" className="hidden"
                onChange={e => addFiles(e.target.files)} />
            </div>
            {newAssets.length > 0 && (
              <p className="text-xs mt-2" style={{ color: PINK }}>· {newAssets.length} new file{newAssets.length !== 1 ? 's' : ''} to upload</p>
            )}
          </div>

          {/* Scheduled date */}
          <div>
            <p className="text-xs text-white/30 uppercase tracking-widest mb-2">Scheduled date</p>
            <input type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#f6a7d7] transition-colors"
              style={{ colorScheme: 'dark' }} />
          </div>

          {/* Platforms */}
          <div>
            <p className="text-xs text-white/30 uppercase tracking-widest mb-2">Platforms</p>
            <div className="flex flex-wrap gap-1.5">
              {PLATFORMS.map(p => (
                <button key={p} type="button" onClick={() => togglePlatform(p)}
                  className="text-xs px-3 py-1 rounded-full border transition-all"
                  style={platforms.includes(p)
                    ? { backgroundColor: PINK, borderColor: PINK, color: '#000' }
                    : { backgroundColor: 'transparent', borderColor: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.4)' }
                  }>{p}</button>
              ))}
            </div>
          </div>

          {/* Caption */}
          <div>
            <p className="text-xs text-white/30 uppercase tracking-widest mb-2">Caption</p>
            <textarea value={caption} onChange={e => setCaption(e.target.value)}
              placeholder="Caption (optional)" rows={4}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-[#f6a7d7] transition-colors resize-none" />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 flex gap-3">
          <button onClick={onClose} disabled={saving}
            className="flex-1 py-2.5 rounded-full text-sm font-medium transition-colors disabled:opacity-40"
            style={{ border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.5)' }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving || totalAssets === 0}
            className="flex-1 py-2.5 rounded-full text-sm font-semibold text-black transition-opacity hover:opacity-80 disabled:opacity-40"
            style={{ backgroundColor: PINK }}>
            {saving ? 'Saving...' : 'Save & reset for review'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [posts, setPosts] = useState<PostWithAssets[]>([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [editingPost, setEditingPost] = useState<EditState | null>(null)

  useEffect(() => {
    if (!id) return
    supabase.from('campaigns').select('*').eq('id', id).single()
      .then(async ({ data: c }) => {
        setCampaign(c)
        if (c) {
          const enriched = await fetchPostsWithAssets(c.id)
          setPosts(enriched)
        }
        setLoading(false)
      })
  }, [id])

  function copyLink() {
    if (!campaign) return
    const url = `${window.location.origin}/review/${campaign.token}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function publishCampaign() {
    if (!campaign) return
    setPublishing(true)
    await supabase.from('campaigns').update({ status: 'active' }).eq('id', campaign.id)
    setCampaign(c => c ? { ...c, status: 'active' } : c)
    setPublishing(false)
  }

  async function resetPostToPending(postId: string) {
    await supabase.from('posts').update({ status: 'pending', feedback: null }).eq('id', postId)
    setPosts(p => p.map(x => x.id === postId ? { ...x, status: 'pending', feedback: null } : x))
  }

  async function resetAllChanges() {
    const ids = posts.filter(p => p.status === 'changes_requested').map(p => p.id)
    if (!ids.length) return
    await supabase.from('posts').update({ status: 'pending', feedback: null }).in('id', ids)
    setPosts(p => p.map(x => ids.includes(x.id) ? { ...x, status: 'pending', feedback: null } : x))
  }

  function openEdit(post: PostWithAssets) {
    setEditingPost({
      postId: post.id,
      caption: post.caption || '',
      platforms: parsePlatforms(post.platform),
      scheduledDate: post.scheduled_date || '',
      existingAssets: [...post.assets],
      newAssets: [],
      saving: false,
    })
  }

  const approved = posts.filter(p => p.status === 'approved').length
  const changes = posts.filter(p => p.status === 'changes_requested').length
  const pending = posts.filter(p => p.status === 'pending').length

  if (loading) return <div className="min-h-screen bg-black p-10 text-white/40 text-sm">Loading...</div>
  if (!campaign) return <div className="min-h-screen bg-black p-10 text-white/40 text-sm">Campaign not found.</div>

  return (
    <div className="min-h-screen bg-black p-6 md:p-10">
      {editingPost && campaign && (
        <EditModal
          state={editingPost}
          campaignId={campaign.id}
          onSave={updated => {
            setPosts(p => p.map(x => x.id === updated.id ? updated : x))
            setEditingPost(null)
          }}
          onClose={() => setEditingPost(null)}
        />
      )}

      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-4 mb-2">
          <Link href="/admin" className="text-white/40 hover:text-white transition-colors text-sm">← Back</Link>
        </div>

        <div className="flex items-start justify-between gap-4 mb-8 flex-wrap">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white">{campaign.title}</h1>
              {campaign.status === 'draft' && (
                <span className="text-xs px-2.5 py-0.5 rounded-full font-medium"
                  style={{ backgroundColor: '#ffffff10', color: '#ffffff40', border: '1px dashed rgba(255,255,255,0.2)' }}>
                  Draft
                </span>
              )}
            </div>
            {campaign.client_name && <p className="text-white/40 text-sm mt-1">{campaign.client_name}</p>}
          </div>
          <div className="flex gap-2 flex-wrap">
            {campaign.status === 'draft' ? (
              <button onClick={publishCampaign} disabled={publishing}
                className="px-5 py-2.5 rounded-full text-sm font-semibold text-black transition-all disabled:opacity-50"
                style={{ backgroundColor: PINK }}>
                {publishing ? 'Publishing...' : '↑ Publish campaign'}
              </button>
            ) : (
              <button onClick={copyLink} className="px-5 py-2.5 rounded-full text-sm font-semibold text-black transition-all"
                style={{ backgroundColor: copied ? '#ffffff' : PINK }}>
                {copied ? '✓ Copied!' : 'Copy client link'}
              </button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { label: 'Pending', count: pending, color: '#ffffff40' },
            { label: 'Approved', count: approved, color: PINK },
            { label: 'Changes', count: changes, color: '#ff6b6b' },
          ].map(s => (
            <div key={s.label} className="border border-white/10 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold" style={{ color: s.color }}>{s.count}</div>
              <div className="text-xs text-white/30 mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        {changes > 0 && (
          <div className="flex justify-end mb-6">
            <button onClick={resetAllChanges}
              className="text-xs px-4 py-2 rounded-full border transition-colors"
              style={{ borderColor: '#ff6b6b40', color: '#ff6b6b99' }}
              onMouseOver={e => (e.currentTarget.style.color = '#ff6b6b')}
              onMouseOut={e => (e.currentTarget.style.color = '#ff6b6b99')}>
              ↺ Reset all changes for re-review
            </button>
          </div>
        )}

        {/* Posts */}
        <div className="space-y-4">
          {posts.map(post => {
            const cover = post.assets[0]
            const isCarousel = post.assets.length > 1
            return (
              <div key={post.id} className="border border-white/10 rounded-2xl p-4 flex gap-4"
                style={post.status === 'changes_requested' ? { borderColor: '#ff6b6b30' } : {}}>
                {/* Thumbnail */}
                <div className="w-24 h-24 rounded-xl overflow-hidden bg-white/5 shrink-0 relative">
                  {cover ? (
                    cover.file_type === 'video'
                      ? <video src={cover.file_url} className="w-full h-full object-cover" muted />
                      // eslint-disable-next-line @next/next/no-img-element
                      : <img src={cover.file_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white/20 text-xs">no file</div>
                  )}
                  {isCarousel && (
                    <div className="absolute bottom-1 right-1 bg-black/60 rounded px-1 py-0.5 text-white text-[9px] font-medium">
                      1/{post.assets.length}
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    {isCarousel && (
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: '#f6a7d715', color: PINK }}>
                        Carousel · {post.assets.length}
                      </span>
                    )}
                    {parsePlatforms(post.platform).map(p => (
                      <span key={p} className="text-xs text-white/40 border border-white/10 rounded-full px-2 py-0.5">{p}</span>
                    ))}
                    <span className="text-xs px-2.5 py-0.5 rounded-full font-medium"
                      style={
                        post.status === 'approved' ? { backgroundColor: '#f6a7d720', color: PINK }
                        : post.status === 'changes_requested' ? { backgroundColor: '#ff6b6b20', color: '#ff6b6b' }
                        : { backgroundColor: '#ffffff15', color: '#ffffff60' }
                      }>
                      {post.status === 'approved' ? '✓ Approved' : post.status === 'changes_requested' ? '⚡ Changes' : '· Pending'}
                    </span>
                  </div>
                  {post.scheduled_date && (
                    <p className="text-xs mb-1" style={{ color: PINK }}>
                      📅 {new Date(post.scheduled_date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  )}
                  {post.caption && (
                    <p className="text-sm text-white/60 leading-relaxed line-clamp-2">{post.caption}</p>
                  )}
                  {post.feedback && (
                    <p className="text-xs text-red-300/80 mt-1 italic">"{post.feedback}"</p>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 mt-2 flex-wrap">
                    <button onClick={() => openEdit(post)}
                      className="text-xs px-3 py-1 rounded-full border transition-colors"
                      style={{ borderColor: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.4)' }}
                      onMouseOver={e => (e.currentTarget.style.color = '#fff')}
                      onMouseOut={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.4)')}>
                      ✎ Edit
                    </button>
                    {post.status === 'changes_requested' && (
                      <button onClick={() => resetPostToPending(post.id)}
                        className="text-xs px-3 py-1 rounded-full border transition-colors"
                        style={{ borderColor: '#ff6b6b30', color: '#ff6b6b80' }}
                        onMouseOver={e => (e.currentTarget.style.color = '#ff6b6b')}
                        onMouseOut={e => (e.currentTarget.style.color = '#ff6b6b80')}>
                        ↺ Reset only
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Client link */}
        {campaign.status === 'active' && (
          <div className="mt-8 border border-white/10 rounded-2xl p-5">
            <p className="text-xs uppercase tracking-widest text-white/30 mb-2">Client review link</p>
            <p className="text-sm font-mono text-white/60 break-all">
              {typeof window !== 'undefined' ? window.location.origin : ''}/review/{campaign.token}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
