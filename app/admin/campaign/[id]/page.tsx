'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { parsePlatforms, fetchPostsWithAssets, type Campaign, type PostWithAssets, type PostAsset } from '@/lib/supabase'
import { supabase } from '@/lib/supabase'

const PLATFORMS = ['Instagram', 'TikTok', 'Facebook', 'LinkedIn', 'Twitter/X', 'YouTube', 'Other']
const PINK = '#f6a7d7'

type NewAsset = { id: string; file: File; preview: string; fileType: 'image' | 'video'; thumbnailDataUrl?: string }
type EditState = {
  postId: string
  caption: string
  platforms: string[]
  scheduledDate: string
  existingAssets: PostAsset[]
  newAssets: NewAsset[]
  saving: boolean
}
type GridPlatform = 'Instagram' | 'TikTok'
type PageTab = 'posts' | 'grid'

// ─── Video thumbnail modal — large scrubber with live video preview ────────────

function ThumbnailPickerModal({ src, currentThumb, onCapture, onClose }: {
  src: string
  currentThumb?: string | null
  onCapture: (dataUrl: string) => void
  onClose: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const blobUrlRef = useRef<string>('')
  const [blobSrc, setBlobSrc] = useState('')
  const [loading, setLoading] = useState(true)
  const [duration, setDuration] = useState(0)
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [captured, setCaptured] = useState<string | null>(currentThumb || null)
  const [canCapture, setCanCapture] = useState(false)
  const [captureError, setCaptureError] = useState<string | null>(null)
  const [captureSuccess, setCaptureSuccess] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        if (src.startsWith('blob:') || src.startsWith('data:')) {
          if (!cancelled) { setBlobSrc(src); setLoading(false) }
          return
        }
        const resp = await fetch(src)
        const blob = await resp.blob()
        const url = URL.createObjectURL(blob)
        blobUrlRef.current = url
        if (!cancelled) { setBlobSrc(url); setLoading(false) }
      } catch {
        if (!cancelled) { setBlobSrc(src); setLoading(false) }
      }
    }
    load()
    return () => {
      cancelled = true
      if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = '' }
    }
  }, [src])

  function seekTo(t: number) {
    if (videoRef.current) videoRef.current.currentTime = t
    setTime(t)
  }

  function togglePlay() {
    if (!videoRef.current) return
    if (playing) { videoRef.current.pause(); setPlaying(false) }
    else { videoRef.current.play(); setPlaying(true) }
  }

  async function capture() {
    setCaptureError(null)
    setCaptureSuccess(false)
    const v = videoRef.current; const c = canvasRef.current
    if (!v) { setCaptureError('No video ref'); return }
    if (!c) { setCaptureError('No canvas ref'); return }
    if (!canCapture) { setCaptureError('Not ready yet — wait for video to load'); return }

    v.pause(); setPlaying(false)

    // Always force a fresh seek so we get a guaranteed decoded frame, even on recapture
    const targetTime = v.currentTime
    v.currentTime = targetTime
    await new Promise<void>(res => {
      const h = () => { v.removeEventListener('seeked', h); res() }
      v.addEventListener('seeked', h)
    })

    if (!v.videoWidth || !v.videoHeight) { setCaptureError('Video dimensions unknown — try scrubbing first'); return }
    try {
      c.width = v.videoWidth
      c.height = v.videoHeight
      const ctx = c.getContext('2d')
      if (!ctx) { setCaptureError('Canvas context unavailable'); return }
      ctx.drawImage(v, 0, 0)
      const dataUrl = c.toDataURL('image/jpeg', 0.92)
      setCaptured(dataUrl)
      onCapture(dataUrl)
      setCaptureSuccess(true)
      setTimeout(() => setCaptureSuccess(false), 1500)
    } catch (e) {
      setCaptureError(`Canvas error: ${e}`)
    }
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string
      setCaptured(dataUrl)
      onCapture(dataUrl)
      setCaptureError(null)
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.95)', backdropFilter: 'blur(8px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-2xl rounded-2xl overflow-hidden"
        style={{ backgroundColor: '#0a0a0a', border: '1px solid rgba(255,255,255,0.12)' }}>

        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10">
          <h3 className="text-sm font-semibold text-white">Pick thumbnail</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors text-xl leading-none">✕</button>
        </div>

        {/* Video — this IS the live preview, no canvas lag */}
        <div className="relative bg-black cursor-pointer" onClick={togglePlay}>
            {loading || !blobSrc ? (
            <div className="w-full h-48 flex items-center justify-center">
              <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: PINK, borderTopColor: 'transparent' }} />
            </div>
          ) : (
            <video
              ref={videoRef}
              src={blobSrc}
              playsInline
              preload="auto"
              className="w-full max-h-[55vh] object-contain"
              onLoadedData={() => setCanCapture(true)}
              onLoadedMetadata={e => setDuration((e.target as HTMLVideoElement).duration)}
              onTimeUpdate={e => setTime((e.target as HTMLVideoElement).currentTime)}
              onEnded={() => setPlaying(false)}
            />
          )}
          {!loading && blobSrc && (
            <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
              <div className="w-14 h-14 rounded-full flex items-center justify-center"
                style={{ backgroundColor: 'rgba(246,167,215,0.2)', border: `2px solid ${PINK}` }}>
                {playing
                  ? <svg viewBox="0 0 24 24" fill={PINK} className="w-6 h-6"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                  : <svg viewBox="0 0 24 24" fill={PINK} className="w-6 h-6 ml-1"><path d="M8 5v14l11-7z"/></svg>
                }
              </div>
            </div>
          )}
        </div>

        {/* Scrubber + capture */}
        <div className="p-5 space-y-4">
          <input
            type="range" min={0} max={duration || 1} step={0.01} value={time}
            onChange={e => seekTo(parseFloat(e.target.value))}
            disabled={loading || !canCapture}
            className="w-full cursor-pointer disabled:opacity-30"
            style={{ accentColor: PINK }}
          />
          {captureError && (
            <p className="text-xs px-3 py-1.5 rounded-lg" style={{ backgroundColor: '#ff6b6b15', color: '#ff6b6b' }}>
              {captureError}
            </p>
          )}
          <div className="flex items-center gap-3 flex-wrap">
            {captured && (
              <div className="flex items-center gap-2 shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={captured} alt="" className="w-14 h-10 rounded-lg object-cover"
                  style={{ outline: `2px solid ${PINK}`, outlineOffset: '1px' }} />
                <span className="text-xs" style={{ color: PINK }}>Thumbnail set</span>
              </div>
            )}
            <div className="ml-auto flex gap-2 flex-wrap">
              {captured && (
                <button onClick={() => { onCapture(captured); onClose() }}
                  className="px-4 py-2 rounded-full text-sm font-semibold text-black"
                  style={{ backgroundColor: PINK }}>
                  Done
                </button>
              )}
              <button onClick={capture} disabled={!canCapture}
                className="px-4 py-2 rounded-full text-sm font-medium transition-all disabled:opacity-40"
                style={{ border: `1px solid ${PINK}`, color: captureSuccess ? '#000' : PINK, backgroundColor: captureSuccess ? PINK : 'transparent' }}>
                {captureSuccess ? '✓ Captured!' : captured ? 'Recapture' : 'Capture frame'}
              </button>
              <button onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 rounded-full text-sm font-medium transition-colors"
                style={{ border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.5)' }}>
                Upload image
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
            </div>
          </div>
        </div>

        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  )
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────

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
  const [thumbEdits, setThumbEdits] = useState<Record<string, string>>({}) // assetId → new dataUrl
  const [thumbPickerAsset, setThumbPickerAsset] = useState<{ id: string; src: string; current?: string | null } | null>(null)
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

  const totalAssets = existingAssets.length + newAssets.length

  async function handleSave() {
    setSaving(true)
    await supabase.from('posts').update({
      caption: caption || null,
      platform: platforms.length > 0 ? JSON.stringify(platforms) : null,
      scheduled_date: scheduledDate || null,
      status: 'pending',
      feedback: null,
    }).eq('id', state.postId)

    const removedIds = state.existingAssets.filter(a => !existingAssets.find(e => e.id === a.id)).map(a => a.id)
    if (removedIds.length) await supabase.from('post_assets').delete().in('id', removedIds)

    // Save updated thumbnails for existing assets
    for (const [assetId, dataUrl] of Object.entries(thumbEdits)) {
      const asset = existingAssets.find(a => a.id === assetId)
      if (!asset) continue
      const blob = await (await fetch(dataUrl)).blob()
      const thumbPath = `${campaignId}/${state.postId}/${assetId}_thumb.jpg`
      await supabase.storage.from('posts').upload(thumbPath, blob, { contentType: 'image/jpeg', cacheControl: '3600', upsert: true })
      const thumbUrl = supabase.storage.from('posts').getPublicUrl(thumbPath).data.publicUrl
      await supabase.from('post_assets').update({ thumbnail_url: thumbUrl }).eq('id', assetId)
    }

    const nextPosition = existingAssets.length
    for (let i = 0; i < newAssets.length; i++) {
      const asset = newAssets[i]
      const ext = asset.file.name.split('.').pop()
      const path = `${campaignId}/${state.postId}/${asset.id}.${ext}`
      const { error } = await supabase.storage.from('posts').upload(path, asset.file, { cacheControl: '3600', upsert: false })
      if (error) continue
      const { data: { publicUrl } } = supabase.storage.from('posts').getPublicUrl(path)

      let thumbnailUrl: string | null = null
      if (asset.fileType === 'video' && asset.thumbnailDataUrl) {
        const blob = await (await fetch(asset.thumbnailDataUrl)).blob()
        const thumbPath = `${campaignId}/${state.postId}/${asset.id}_thumb.jpg`
        const { error: te } = await supabase.storage.from('posts').upload(thumbPath, blob, { contentType: 'image/jpeg', cacheControl: '3600' })
        if (!te) thumbnailUrl = supabase.storage.from('posts').getPublicUrl(thumbPath).data.publicUrl
      }

      await supabase.from('post_assets').insert({
        post_id: state.postId, file_url: publicUrl, file_type: asset.fileType,
        thumbnail_url: thumbnailUrl, position: nextPosition + i,
      })
    }

    const { data: updatedPost } = await supabase.from('posts').select('*').eq('id', state.postId).single()
    const { data: updatedAssets } = await supabase.from('post_assets').select('*').eq('post_id', state.postId).order('position')
    if (updatedPost) onSave({ ...updatedPost, assets: updatedAssets || [] })
    setSaving(false)
  }

  return (
    <>
    {thumbPickerAsset && (
      <ThumbnailPickerModal
        src={thumbPickerAsset.src}
        currentThumb={thumbPickerAsset.current}
        onCapture={dataUrl => {
          const id = thumbPickerAsset.id
          // Check if it's an existing or new asset
          if (existingAssets.find(a => a.id === id)) {
            setThumbEdits(prev => ({ ...prev, [id]: dataUrl }))
          } else {
            setNewAssets(prev => prev.map(a => a.id === id ? { ...a, thumbnailDataUrl: dataUrl } : a))
          }
        }}
        onClose={() => setThumbPickerAsset(null)}
      />
    )}
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-lg rounded-3xl overflow-hidden max-h-[90vh] flex flex-col"
        style={{ backgroundColor: '#0d0d0d', border: '1px solid rgba(255,255,255,0.1)' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="font-semibold text-white">Edit post</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors text-xl leading-none">✕</button>
        </div>
        <div className="overflow-y-auto p-6 space-y-5">
          <div>
            <p className="text-xs text-white/30 uppercase tracking-widest mb-2">Assets</p>
            <div className="flex gap-3 flex-wrap">
              {existingAssets.map((a, i) => (
                <div key={a.id} className="shrink-0">
                  <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-white/5">
                    {a.file_type === 'video'
                      ? (thumbEdits[a.id] || a.thumbnail_url)
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={thumbEdits[a.id] || a.thumbnail_url!} alt="" className="w-full h-full object-cover" />
                        : <video src={a.file_url} className="w-full h-full object-cover" muted preload="metadata" />
                      // eslint-disable-next-line @next/next/no-img-element
                      : <img src={a.file_url} alt="" className="w-full h-full object-cover" />
                    }
                    {i === 0 && totalAssets > 1 && (
                      <span className="absolute bottom-0 left-0 right-0 text-center text-white text-[9px] bg-black/60 py-0.5">cover</span>
                    )}
                    <button onClick={() => setExistingAssets(prev => prev.filter(x => x.id !== a.id))}
                      className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 flex items-center justify-center text-white/80 hover:text-white text-[10px]">✕</button>
                  </div>
                  {a.file_type === 'video' && (
                    <button onClick={() => setThumbPickerAsset({ id: a.id, src: a.file_url, current: thumbEdits[a.id] || a.thumbnail_url })}
                      className="mt-1 w-16 text-[10px] py-0.5 rounded text-center transition-colors"
                      style={thumbEdits[a.id] ? { color: PINK } : { color: 'rgba(255,255,255,0.35)' }}>
                      {thumbEdits[a.id] ? '✓ thumb' : '+ thumb'}
                    </button>
                  )}
                </div>
              ))}
              {newAssets.map(a => (
                <div key={a.id} className="shrink-0">
                  <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-white/5">
                    {a.fileType === 'video'
                      ? a.thumbnailDataUrl
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={a.thumbnailDataUrl} alt="" className="w-full h-full object-cover" />
                        : <video src={a.preview} className="w-full h-full object-cover" muted preload="metadata" />
                      // eslint-disable-next-line @next/next/no-img-element
                      : <img src={a.preview} alt="" className="w-full h-full object-cover" />
                    }
                    <div className="absolute top-0.5 left-0.5 w-3 h-3 rounded-full" style={{ backgroundColor: PINK }} />
                    <button onClick={() => setNewAssets(prev => prev.filter(x => x.id !== a.id))}
                      className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 flex items-center justify-center text-white/80 hover:text-white text-[10px]">✕</button>
                  </div>
                  {a.fileType === 'video' && (
                    <button onClick={() => setThumbPickerAsset({ id: a.id, src: a.preview, current: a.thumbnailDataUrl })}
                      className="mt-1 w-16 text-[10px] py-0.5 rounded text-center transition-colors"
                      style={a.thumbnailDataUrl ? { color: PINK } : { color: 'rgba(255,255,255,0.35)' }}>
                      {a.thumbnailDataUrl ? '✓ thumb' : '+ thumb'}
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button onClick={() => fileRef.current?.click()}
              className="mt-3 text-xs px-3 py-1.5 rounded-full border transition-colors"
              style={{ borderColor: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.4)' }}>
              + Add asset
            </button>
            <input ref={fileRef} type="file" multiple accept="image/*,video/*" className="hidden"
              onChange={e => addFiles(e.target.files)} />
            {newAssets.length > 0 && <p className="text-xs mt-2" style={{ color: PINK }}>· {newAssets.length} new file{newAssets.length !== 1 ? 's' : ''} to upload</p>}
          </div>
          <div>
            <p className="text-xs text-white/30 uppercase tracking-widest mb-2">Scheduled date</p>
            <input type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#f6a7d7] transition-colors"
              style={{ colorScheme: 'dark' }} />
          </div>
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
          <div>
            <p className="text-xs text-white/30 uppercase tracking-widest mb-2">Caption</p>
            <textarea value={caption} onChange={e => setCaption(e.target.value)}
              placeholder="Caption (optional)" rows={4}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-[#f6a7d7] transition-colors resize-none" />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-white/10 flex gap-3">
          <button onClick={onClose} disabled={saving}
            className="flex-1 py-2.5 rounded-full text-sm font-medium disabled:opacity-40"
            style={{ border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.5)' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving || totalAssets === 0}
            className="flex-1 py-2.5 rounded-full text-sm font-semibold text-black transition-opacity hover:opacity-80 disabled:opacity-40"
            style={{ backgroundColor: PINK }}>
            {saving ? 'Saving...' : 'Save & reset for review'}
          </button>
        </div>
      </div>
    </div>
    </>
  )
}

// ─── Drag-and-drop Grid ───────────────────────────────────────────────────────

function AdminGrid({ posts, onUpdate }: { posts: PostWithAssets[]; onUpdate: (posts: PostWithAssets[]) => void }) {
  const [platform, setPlatform] = useState<GridPlatform>('Instagram')
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [overIdx, setOverIdx] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const filtered = [...posts]
    .filter(p => parsePlatforms(p.platform).includes(platform))
    .sort((a, b) => {
      if (!a.scheduled_date && !b.scheduled_date) return 0
      if (!a.scheduled_date) return 1
      if (!b.scheduled_date) return -1
      return new Date(b.scheduled_date).getTime() - new Date(a.scheduled_date).getTime()
    })

  async function handleDrop(fromIdx: number, toIdx: number) {
    if (fromIdx === toIdx) return

    // Dates stay in their slots — posts move between them
    const dates = filtered.map(p => p.scheduled_date)
    const reordered = [...filtered]
    const [moved] = reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, moved)
    const updates = reordered.map((p, i) => ({ id: p.id, date: dates[i] ?? null }))

    setSaving(true)
    await Promise.all(updates.map(u =>
      supabase.from('posts').update({ scheduled_date: u.date }).eq('id', u.id)
    ))
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)

    onUpdate(posts.map(p => {
      const u = updates.find(x => x.id === p.id)
      return u ? { ...p, scheduled_date: u.date } : p
    }))
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {(['Instagram', 'TikTok'] as GridPlatform[]).map(p => (
            <button key={p} onClick={() => setPlatform(p)}
              className="px-4 py-1.5 rounded-full text-xs font-medium transition-all"
              style={platform === p
                ? { backgroundColor: PINK, color: '#000' }
                : { border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)' }}>
              {p}
            </button>
          ))}
        </div>
        <span className="text-xs" style={{ color: saving ? 'rgba(255,255,255,0.4)' : saved ? PINK : 'transparent' }}>
          {saving ? 'Saving...' : '✓ Dates updated'}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="py-16 text-center rounded-2xl border border-dashed border-white/10">
          <p className="text-white/30 text-sm">No posts assigned to {platform}</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1">
          {filtered.map((post, i) => {
            const cover = post.assets[0]
            const isDragging = dragIdx === i
            const isOver = overIdx === i && dragIdx !== null && dragIdx !== i
            return (
              <div key={post.id}
                draggable
                onDragStart={() => { setDragIdx(i); setOverIdx(null) }}
                onDragOver={e => { e.preventDefault(); setOverIdx(i) }}
                onDragLeave={() => setOverIdx(null)}
                onDrop={() => { handleDrop(dragIdx!, i); setDragIdx(null); setOverIdx(null) }}
                onDragEnd={() => { setDragIdx(null); setOverIdx(null) }}
                className="relative cursor-grab active:cursor-grabbing"
                style={{ opacity: isDragging ? 0.35 : 1, transition: 'opacity 0.15s' }}>
                <div className="aspect-[3/4] overflow-hidden rounded-sm relative"
                  style={{
                    backgroundColor: '#111',
                    outline: isOver ? `2px solid ${PINK}` : '2px solid transparent',
                    outlineOffset: '2px',
                    transition: 'outline 0.1s',
                  }}>
                  {cover ? (
                    cover.file_type === 'video'
                      // eslint-disable-next-line @next/next/no-img-element
                      ? cover.thumbnail_url ? <img src={cover.thumbnail_url} alt="" className="w-full h-full object-cover" /> : <video src={cover.file_url} className="w-full h-full object-cover" muted playsInline preload="metadata" />
                      // eslint-disable-next-line @next/next/no-img-element
                      : <img src={cover.file_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white/20">?</div>
                  )}
                  {/* Status dot */}
                  <div className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full shadow"
                    style={{ backgroundColor: post.status === 'approved' ? PINK : (post.status === 'changes_requested' || post.status === 'rejected') ? '#ff6b6b' : 'rgba(255,255,255,0.4)' }} />
                  {/* Drag hint */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
                    style={{ backgroundColor: 'rgba(0,0,0,0.25)' }}>
                    <span className="text-white/70 text-lg select-none">⠿</span>
                  </div>
                </div>
                {post.scheduled_date && (
                  <p className="text-center mt-1 text-xs text-white/30">
                    {new Date(post.scheduled_date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
      <p className="text-xs text-center text-white/20">Drag to reorder — dates shift automatically</p>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [posts, setPosts] = useState<PostWithAssets[]>([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [editingPost, setEditingPost] = useState<EditState | null>(null)
  const [pageTab, setPageTab] = useState<PageTab>('posts')

  useEffect(() => {
    if (!id) return
    supabase.from('campaigns').select('*').eq('id', id).single()
      .then(async ({ data: c }) => {
        setCampaign(c)
        if (c) setPosts(await fetchPostsWithAssets(c.id))
        setLoading(false)
      })
  }, [id])

  function copyLink() {
    if (!campaign) return
    navigator.clipboard.writeText(`${window.location.origin}/review/${campaign.token}`)
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
    const ids = posts.filter(p => p.status === 'changes_requested' || p.status === 'rejected').map(p => p.id)
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
  const rejected = posts.filter(p => p.status === 'rejected').length
  const pending = posts.filter(p => p.status === 'pending').length

  if (loading) return <div className="min-h-screen bg-black p-10 text-white/40 text-sm">Loading...</div>
  if (!campaign) return <div className="min-h-screen bg-black p-10 text-white/40 text-sm">Campaign not found.</div>

  return (
    <div className="min-h-screen bg-black p-6 md:p-10">
      {editingPost && campaign && (
        <EditModal state={editingPost} campaignId={campaign.id}
          onSave={updated => { setPosts(p => p.map(x => x.id === updated.id ? updated : x)); setEditingPost(null) }}
          onClose={() => setEditingPost(null)} />
      )}

      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-4 mb-2">
          <Link href="/admin" className="text-white/40 hover:text-white transition-colors text-sm">← Back</Link>
        </div>

        {/* Header */}
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
              <>
                <button onClick={async () => {
                  await supabase.from('campaigns').update({ status: 'draft' }).eq('id', campaign.id)
                  setCampaign(c => c ? { ...c, status: 'draft' } : c)
                }}
                  className="px-4 py-2.5 rounded-full text-sm font-medium transition-colors"
                  style={{ border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.4)' }}
                  onMouseOver={e => (e.currentTarget.style.color = '#fff')}
                  onMouseOut={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.4)')}>
                  ↓ Move to draft
                </button>
                <button onClick={copyLink}
                  className="px-5 py-2.5 rounded-full text-sm font-semibold text-black transition-all"
                  style={{ backgroundColor: copied ? '#ffffff' : PINK }}>
                  {copied ? '✓ Copied!' : 'Copy client link'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          {[
            { label: 'Pending', count: pending, color: '#ffffff40' },
            { label: 'Approved', count: approved, color: PINK },
            { label: 'Changes', count: changes, color: '#ff6b6b' },
            { label: 'Rejected', count: rejected, color: '#ff6b6b' },
          ].map(s => (
            <div key={s.label} className="border border-white/10 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold" style={{ color: s.color }}>{s.count}</div>
              <div className="text-xs text-white/30 mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        {(changes > 0 || rejected > 0) && (
          <div className="flex justify-end mb-4">
            <button onClick={resetAllChanges}
              className="text-xs px-4 py-2 rounded-full border transition-colors"
              style={{ borderColor: '#ff6b6b40', color: '#ff6b6b99' }}
              onMouseOver={e => (e.currentTarget.style.color = '#ff6b6b')}
              onMouseOut={e => (e.currentTarget.style.color = '#ff6b6b99')}>
              ↺ Reset all for re-review
            </button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-6">
          {(['posts', 'grid'] as PageTab[]).map(t => (
            <button key={t} onClick={() => setPageTab(t)}
              className="px-4 py-1.5 rounded-full text-xs font-medium transition-all"
              style={pageTab === t ? { backgroundColor: PINK, color: '#000' } : { color: 'rgba(255,255,255,0.4)' }}>
              {t === 'posts' ? 'Posts' : 'Grid'}
            </button>
          ))}
        </div>

        {/* Posts list */}
        {pageTab === 'posts' && (
          <div className="space-y-4">
            {posts.map(post => {
              const cover = post.assets[0]
              const isCarousel = post.assets.length > 1
              return (
                <div key={post.id} className="border border-white/10 rounded-2xl p-4 flex gap-4"
                  style={(post.status === 'changes_requested' || post.status === 'rejected') ? { borderColor: '#ff6b6b30' } : {}}>
                  <div className="w-24 h-24 rounded-xl overflow-hidden bg-white/5 shrink-0 relative">
                    {cover ? (
                      cover.file_type === 'video'
                        ? cover.thumbnail_url
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={cover.thumbnail_url} alt="" className="w-full h-full object-cover" />
                          : <video src={cover.file_url} className="w-full h-full object-cover" muted preload="metadata" />
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
                          : post.status === 'rejected' ? { backgroundColor: '#ff3b3b20', color: '#ff6b6b' }
                          : { backgroundColor: '#ffffff15', color: '#ffffff60' }
                        }>
                        {post.status === 'approved' ? '✓ Approved' : post.status === 'changes_requested' ? '⚡ Changes' : post.status === 'rejected' ? '✕ Rejected' : '· Pending'}
                      </span>
                    </div>
                    {post.scheduled_date && (
                      <p className="text-xs mb-1" style={{ color: PINK }}>
                        📅 {new Date(post.scheduled_date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    )}
                    {post.caption && <p className="text-sm text-white/60 leading-relaxed line-clamp-2">{post.caption}</p>}
                    {(post.status === 'changes_requested' || post.status === 'rejected') && (
                      <div className="mt-2 rounded-lg px-3 py-2 text-xs" style={{ backgroundColor: '#ff6b6b12', border: '1px solid #ff6b6b25' }}>
                        <span style={{ color: '#ff6b6b80' }}>Client note: </span>
                        <span style={{ color: '#ff9999' }}>{post.feedback || <em style={{ opacity: 0.5 }}>No note left</em>}</span>
                      </div>
                    )}
                    <div className="flex gap-2 mt-2 flex-wrap">
                      <button onClick={() => openEdit(post)}
                        className="text-xs px-3 py-1 rounded-full border transition-colors"
                        style={{ borderColor: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.4)' }}
                        onMouseOver={e => (e.currentTarget.style.color = '#fff')}
                        onMouseOut={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.4)')}>
                        ✎ Edit
                      </button>
                      {(post.status === 'changes_requested' || post.status === 'rejected') && (
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
        )}

        {/* Grid tab */}
        {pageTab === 'grid' && (
          <AdminGrid posts={posts} onUpdate={setPosts} />
        )}

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
