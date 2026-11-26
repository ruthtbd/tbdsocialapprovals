'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { parsePlatforms, fetchPostsWithAssets, generateToken, computeAggregateStatus, type Campaign, type PostWithAssets, type PostAsset, type Reviewer, type PostReview, type PostStatus } from '@/lib/supabase'
import { supabase } from '@/lib/supabase'

const PLATFORMS = ['Instagram', 'TikTok', 'Facebook', 'LinkedIn', 'Twitter/X', 'YouTube', 'Other']
const PINK = '#f6a7d7'

type Theme = { bg: string; card: string; border: string; text: string; subtext: string; faint: string; inputBg: string; mediaBg: string }

const THEME: Theme = { bg: '#fff', card: '#fff', border: 'rgba(0,0,0,0.1)', text: '#000', subtext: '#000', faint: '#000', inputBg: 'rgba(0,0,0,0.04)', mediaBg: '#fff' }

type NewAsset = { id: string; file: File; preview: string; fileType: 'image' | 'video'; thumbnailDataUrl?: string }
type EditState = {
  postId: string
  isNew?: boolean
  newPostPosition?: number
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
    else {
      // play() returns a promise that rejects if the video unmounts or is interrupted —
      // swallow the "play() was interrupted" noise so it doesn't break the upload flow
      videoRef.current.play().then(() => setPlaying(true)).catch(() => {})
    }
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
        style={{ backgroundColor: '#fff', border: '1px solid rgba(0,0,0,0.1)' }}>

        <div className="flex items-center justify-between px-5 py-3.5 border-b border-black/10">
          <h3 className="text-sm font-semibold text-black">Pick thumbnail</h3>
          <button onClick={onClose} className="text-black/40 hover:text-black transition-colors text-xl leading-none">✕</button>
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
                style={{ border: '1px solid rgba(0,0,0,0.15)', color: 'rgba(0,0,0,0.5)' }}>
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

// ─── Crop / Reposition Modal ──────────────────────────────────────────────────

function CropModal({ src, isVideo, frameAspect, initialX, initialY, onSave, onClose }: {
  src: string
  isVideo: boolean
  frameAspect: number // width / height ratio of first image
  initialX: number
  initialY: number
  onSave: (x: number, y: number) => void
  onClose: () => void
}) {
  const [x, setX] = useState(initialX)
  const [y, setY] = useState(initialY)
  const dragRef = useRef<{ startX: number; startY: number; startCropX: number; startCropY: number } | null>(null)
  const frameRef = useRef<HTMLDivElement>(null)

  function onPointerDown(e: React.PointerEvent) {
    if (!frameRef.current) return
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    dragRef.current = { startX: e.clientX, startY: e.clientY, startCropX: x, startCropY: y }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragRef.current || !frameRef.current) return
    const rect = frameRef.current.getBoundingClientRect()
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    // Drag direction is inverted: moving mouse right reveals more of the LEFT side of image
    // (object-position 0% = left edge of image at left edge of frame)
    // So drag right = decrease X. Range of X is 0-100 and corresponds to ~full image width.
    const nextX = Math.min(100, Math.max(0, dragRef.current.startCropX - (dx / rect.width) * 100))
    const nextY = Math.min(100, Math.max(0, dragRef.current.startCropY - (dy / rect.height) * 100))
    setX(nextX)
    setY(nextY)
  }

  function onPointerUp() {
    dragRef.current = null
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden flex flex-col max-h-[90vh]"
        style={{ backgroundColor: '#fff', border: '1px solid rgba(0,0,0,0.1)' }}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-black/10 shrink-0">
          <h3 className="text-sm font-semibold text-black">Reposition · drag to move</h3>
          <button onClick={onClose} className="text-black/40 hover:text-black transition-colors text-xl leading-none">✕</button>
        </div>

        <div className="p-4 overflow-y-auto">
          <div ref={frameRef}
            className="relative mx-auto overflow-hidden rounded-xl select-none touch-none"
            style={{ aspectRatio: frameAspect, maxHeight: '55vh', maxWidth: '100%', width: frameAspect > 1 ? '100%' : 'auto', backgroundColor: '#f3f3f3', cursor: 'grab' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}>
            {isVideo
              ? <video src={src} className="w-full h-full object-cover pointer-events-none" style={{ objectPosition: `${x}% ${y}%` }} muted preload="metadata" />
              // eslint-disable-next-line @next/next/no-img-element
              : <img src={src} alt="" className="w-full h-full object-cover pointer-events-none" style={{ objectPosition: `${x}% ${y}%` }} />
            }
          </div>

          <div className="flex items-center gap-2 mt-3 text-xs" style={{ color: 'rgba(0,0,0,0.5)' }}>
            <span>X: {Math.round(x)}%</span>
            <span>Y: {Math.round(y)}%</span>
            <button onClick={() => { setX(50); setY(50) }} className="ml-auto px-2.5 py-1 rounded-full border text-[11px]" style={{ borderColor: 'rgba(0,0,0,0.15)' }}>
              Reset to center
            </button>
          </div>
        </div>

        <div className="px-4 py-3 border-t border-black/10 flex gap-2 shrink-0">
          <button onClick={onClose} className="flex-1 py-2 rounded-full text-sm font-medium"
            style={{ border: '1px solid rgba(0,0,0,0.15)', color: 'rgba(0,0,0,0.5)' }}>Cancel</button>
          <button onClick={() => { onSave(x, y); onClose() }}
            className="flex-1 py-2 rounded-full text-sm font-semibold text-black"
            style={{ backgroundColor: PINK }}>Save</button>
        </div>
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
  type AssetItem =
    | { kind: 'existing'; data: PostAsset }
    | { kind: 'new'; data: NewAsset }

  const [caption, setCaption] = useState(state.caption)
  const [platforms, setPlatforms] = useState(state.platforms)
  const [scheduledDate, setScheduledDate] = useState(state.scheduledDate)
  const [assets, setAssets] = useState<AssetItem[]>(
    state.existingAssets.map(a => ({ kind: 'existing' as const, data: a }))
  )
  const [thumbEdits, setThumbEdits] = useState<Record<string, string>>({}) // assetId → new dataUrl
  const [thumbPickerAsset, setThumbPickerAsset] = useState<{ id: string; src: string; current?: string | null } | null>(null)
  const [cropEdits, setCropEdits] = useState<Record<string, { x: number; y: number }>>({}) // assetId → crop
  const [cropAsset, setCropAsset] = useState<{ id: string; src: string; isVideo: boolean; x: number; y: number } | null>(null)
  const [firstAssetAspect, setFirstAssetAspect] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploadErrors, setUploadErrors] = useState<string[]>([])
  const [assetDragIdx, setAssetDragIdx] = useState<number | null>(null)
  const [assetOverIdx, setAssetOverIdx] = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Detect first asset's aspect ratio whenever it changes (used by CropModal frame)
  useEffect(() => {
    const first = assets[0]
    if (!first) { setFirstAssetAspect(null); return }
    const src = first.kind === 'existing'
      ? (first.data.file_type === 'video' ? (thumbEdits[first.data.id] || first.data.thumbnail_url || first.data.file_url) : first.data.file_url)
      : (first.data.fileType === 'video' ? (first.data.thumbnailDataUrl || first.data.preview) : first.data.preview)
    if (!src) return
    const img = new Image()
    img.onload = () => setFirstAssetAspect(img.naturalWidth / img.naturalHeight)
    img.src = src
  }, [assets, thumbEdits])

  function reorderAssets(fromIdx: number, toIdx: number) {
    if (fromIdx === toIdx) return
    setAssets(prev => {
      const next = [...prev]
      const [moved] = next.splice(fromIdx, 1)
      next.splice(toIdx, 0, moved)
      return next
    })
  }

  function removeAsset(itemId: string) {
    setAssets(prev => prev.filter(a => a.data.id !== itemId))
  }

  function togglePlatform(p: string) {
    setPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])
  }

  function addFiles(files: FileList | null) {
    if (!files) return
    const added: AssetItem[] = Array.from(files)
      .filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'))
      .map(f => ({
        kind: 'new' as const,
        data: {
          id: Math.random().toString(36).slice(2),
          file: f,
          preview: URL.createObjectURL(f),
          fileType: f.type.startsWith('video/') ? 'video' : 'image',
        },
      }))
    setAssets(prev => [...prev, ...added])
  }

  function updateNewAssetThumb(itemId: string, dataUrl: string) {
    setAssets(prev => prev.map(a =>
      a.kind === 'new' && a.data.id === itemId
        ? { ...a, data: { ...a.data, thumbnailDataUrl: dataUrl } }
        : a
    ))
  }

  const totalAssets = assets.length
  const newAssetsCount = assets.filter(a => a.kind === 'new').length

  async function handleSave() {
    setSaving(true)

    let postId = state.postId

    if (state.isNew) {
      // INSERT new post
      const { data: newPost, error } = await supabase.from('posts').insert({
        campaign_id: campaignId,
        caption: caption || null,
        platform: platforms.length > 0 ? JSON.stringify(platforms) : null,
        scheduled_date: scheduledDate || null,
        position: state.newPostPosition ?? 0,
        status: null,
        feedback: null,
      }).select().single()
      if (error || !newPost) {
        setSaving(false)
        alert(`Could not save new post — ${error?.message || 'unknown error'}.\n\nIf this mentions a missing column, run the latest migration in supabase-schema.sql.`)
        return
      }
      postId = newPost.id
    } else {
      // UPDATE existing post — edits reset review state
      await supabase.from('posts').update({
        caption: caption || null,
        platform: platforms.length > 0 ? JSON.stringify(platforms) : null,
        scheduled_date: scheduledDate || null,
        status: null,
        feedback: null,
      }).eq('id', postId)

      const keptExistingIds = new Set(assets.filter(a => a.kind === 'existing').map(a => a.data.id))
      const removedIds = state.existingAssets.filter(a => !keptExistingIds.has(a.id)).map(a => a.id)

      // Compute position updates for existing assets — only persist where the position actually changed
      const positionUpdates = assets
        .map((a, i) => ({ kind: a.kind, id: a.data.id, position: i, original: a.kind === 'existing' ? (a.data as PostAsset).position : -1 }))
        .filter(u => u.kind === 'existing' && u.original !== u.position)

      // Crop updates — only persist for EXISTING assets (new asset crops go into the insert)
      const existingIds = new Set(assets.filter(a => a.kind === 'existing').map(a => a.data.id))
      const cropUpdates = Object.entries(cropEdits)
        .filter(([assetId]) => existingIds.has(assetId))
        .map(([assetId, { x, y }]) => ({ assetId, x, y }))

      // Run deletion + thumbnail uploads + position updates + crop updates in parallel
      await Promise.all([
        removedIds.length ? supabase.from('post_assets').delete().in('id', removedIds) : Promise.resolve(),
        ...positionUpdates.map(u =>
          supabase.from('post_assets').update({ position: u.position }).eq('id', u.id)
        ),
        ...cropUpdates.map(u =>
          supabase.from('post_assets').update({ crop_x: u.x, crop_y: u.y }).eq('id', u.assetId)
        ),
        ...Object.entries(thumbEdits).map(async ([assetId, dataUrl]) => {
          const blob = await (await fetch(dataUrl)).blob()
          const thumbPath = `${campaignId}/${postId}/${assetId}_thumb.jpg`
          await supabase.storage.from('posts').upload(thumbPath, blob, { contentType: 'image/jpeg', cacheControl: '2592000', upsert: true })
          const thumbUrl = supabase.storage.from('posts').getPublicUrl(thumbPath).data.publicUrl
          await supabase.from('post_assets').update({ thumbnail_url: thumbUrl }).eq('id', assetId)
        }),
      ])
    }

    // Upload new assets — position comes from their index in the unified `assets` array
    const newAssetEntries = assets
      .map((a, i) => ({ item: a, position: i }))
      .filter(x => x.item.kind === 'new') as { item: { kind: 'new'; data: NewAsset }; position: number }[]

    const errors: string[] = []

    await Promise.all(newAssetEntries.map(async ({ item, position }) => {
      const asset = item.data
      const sizeMB = (asset.file.size / 1024 / 1024).toFixed(1)
      const ext = asset.file.name.split('.').pop()
      // Use a timestamp suffix so each upload attempt gets a fresh path — sidesteps any "already exists" collision
      const path = `${campaignId}/${postId}/${asset.id}_${Date.now()}.${ext}`
      try {
        const { error } = await supabase.storage.from('posts').upload(path, asset.file, { contentType: asset.file.type, cacheControl: '2592000', upsert: true })
        if (error) {
          console.error('Upload failed for', asset.file.name, error)
          errors.push(`${asset.file.name} (${sizeMB} MB): ${error.message}`)
          return
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error('Upload threw for', asset.file.name, e)
        errors.push(`${asset.file.name} (${sizeMB} MB): ${msg}`)
        return
      }

      const { data: { publicUrl } } = supabase.storage.from('posts').getPublicUrl(path)

      let thumbnailUrl: string | null = null
      if (asset.fileType === 'video' && asset.thumbnailDataUrl) {
        const blob = await (await fetch(asset.thumbnailDataUrl)).blob()
        const thumbPath = `${campaignId}/${postId}/${asset.id}_thumb.jpg`
        const { error: te } = await supabase.storage.from('posts').upload(thumbPath, blob, { contentType: 'image/jpeg', cacheControl: '2592000', upsert: true })
        if (te) {
          console.warn('Thumbnail upload failed (continuing with no thumbnail):', te)
          errors.push(`${asset.file.name} thumbnail: ${te.message}`)
        } else {
          thumbnailUrl = supabase.storage.from('posts').getPublicUrl(thumbPath).data.publicUrl
        }
      }

      const crop = cropEdits[asset.id]
      const { error: insertError } = await supabase.from('post_assets').insert({
        post_id: postId, file_url: publicUrl, file_type: asset.fileType,
        thumbnail_url: thumbnailUrl, position,
        // Only include crop fields if the user explicitly set a position
        ...(crop ? { crop_x: crop.x, crop_y: crop.y } : {}),
      })
      if (insertError) {
        console.error('post_assets insert failed:', insertError)
        errors.push(`${asset.file.name}: DB insert failed — ${insertError.message}`)
      }
    }))

    if (errors.length > 0) {
      setUploadErrors(errors)
      setSaving(false)
      return
    }

    // Fetch updated post + assets in parallel
    const [{ data: updatedPost }, { data: updatedAssets }] = await Promise.all([
      supabase.from('posts').select('*').eq('id', postId).single(),
      supabase.from('post_assets').select('*').eq('post_id', postId).order('position'),
    ])
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
          const item = assets.find(a => a.data.id === id)
          if (item?.kind === 'existing') {
            setThumbEdits(prev => ({ ...prev, [id]: dataUrl }))
          } else if (item?.kind === 'new') {
            updateNewAssetThumb(id, dataUrl)
          }
        }}
        onClose={() => setThumbPickerAsset(null)}
      />
    )}
    {cropAsset && firstAssetAspect && (
      <CropModal
        src={cropAsset.src}
        isVideo={cropAsset.isVideo}
        frameAspect={firstAssetAspect}
        initialX={cropAsset.x}
        initialY={cropAsset.y}
        onSave={(x, y) => setCropEdits(prev => ({ ...prev, [cropAsset.id]: { x, y } }))}
        onClose={() => setCropAsset(null)}
      />
    )}
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-lg rounded-3xl overflow-hidden max-h-[90vh] flex flex-col"
        style={{ backgroundColor: '#fff', border: '1px solid rgba(0,0,0,0.1)' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/10">
          <h2 className="font-semibold text-black">{state.isNew ? 'Add post' : 'Edit post'}</h2>
          <button onClick={onClose} className="text-black/40 hover:text-black transition-colors text-xl leading-none">✕</button>
        </div>
        <div className="overflow-y-auto p-6 space-y-5">
          <div>
            <p className="text-xs text-black/40 uppercase tracking-widest mb-2">
              Assets {assets.length > 1 && <span className="normal-case tracking-normal">· drag to reorder</span>}
            </p>
            <div className="flex gap-3 flex-wrap">
              {assets.map((item, i) => {
                const isDragging = assetDragIdx === i
                const isOver = assetOverIdx === i && assetDragIdx !== null && assetDragIdx !== i
                const isExisting = item.kind === 'existing'
                const id = item.data.id
                const fileType = isExisting ? (item.data as PostAsset).file_type : (item.data as NewAsset).fileType
                const previewUrl = isExisting
                  ? (fileType === 'video' ? (thumbEdits[id] || (item.data as PostAsset).thumbnail_url) : (item.data as PostAsset).file_url)
                  : (fileType === 'video' ? (item.data as NewAsset).thumbnailDataUrl : (item.data as NewAsset).preview)
                const videoSrc = isExisting ? (item.data as PostAsset).file_url : (item.data as NewAsset).preview
                const hasThumb = isExisting ? !!thumbEdits[id] : !!(item.data as NewAsset).thumbnailDataUrl
                return (
                <div key={id} className="shrink-0 transition-all"
                  draggable={assets.length > 1}
                  onDragStart={() => { setAssetDragIdx(i); setAssetOverIdx(null) }}
                  onDragOver={e => { e.preventDefault(); setAssetOverIdx(i) }}
                  onDragLeave={() => setAssetOverIdx(null)}
                  onDrop={() => { if (assetDragIdx !== null) reorderAssets(assetDragIdx, i); setAssetDragIdx(null); setAssetOverIdx(null) }}
                  onDragEnd={() => { setAssetDragIdx(null); setAssetOverIdx(null) }}
                  style={{ opacity: isDragging ? 0.4 : 1, cursor: assets.length > 1 ? 'grab' : 'default' }}>
                  <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-black/5"
                    style={isOver ? { outline: `2px solid ${PINK}`, outlineOffset: '2px' } : undefined}>
                    {(() => {
                      const cropEdit = cropEdits[id]
                      const cropX = cropEdit?.x ?? (isExisting ? ((item.data as PostAsset).crop_x ?? 50) : 50)
                      const cropY = cropEdit?.y ?? (isExisting ? ((item.data as PostAsset).crop_y ?? 50) : 50)
                      const objectPosition = `${cropX}% ${cropY}%`
                      if (fileType === 'video' && !previewUrl) {
                        return <video src={videoSrc} className="w-full h-full object-cover pointer-events-none" style={{ objectPosition }} muted preload="metadata" />
                      }
                      // eslint-disable-next-line @next/next/no-img-element
                      return <img src={previewUrl as string} alt="" className="w-full h-full object-cover pointer-events-none" style={{ objectPosition }} />
                    })()}
                    {!isExisting && (
                      <div className="absolute top-0.5 left-0.5 w-3 h-3 rounded-full pointer-events-none" style={{ backgroundColor: PINK }} />
                    )}
                    {i === 0 && assets.length > 1 && (
                      <span className="absolute bottom-0 left-0 right-0 text-center text-white text-[9px] bg-black/60 py-0.5 pointer-events-none">cover</span>
                    )}
                    <button onClick={() => removeAsset(id)}
                      className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 flex items-center justify-center text-white/80 hover:text-white text-[10px]">✕</button>
                  </div>
                  <div className="mt-1 flex flex-col gap-0.5 w-16">
                    {fileType === 'video' && (
                      <button onClick={() => setThumbPickerAsset({
                        id,
                        src: videoSrc,
                        current: isExisting ? (thumbEdits[id] || (item.data as PostAsset).thumbnail_url) : (item.data as NewAsset).thumbnailDataUrl,
                      })}
                        className="text-[10px] py-0.5 rounded text-center transition-colors"
                        style={hasThumb ? { color: PINK } : { color: 'rgba(0,0,0,0.35)' }}>
                        {hasThumb ? '✓ thumb' : '+ thumb'}
                      </button>
                    )}
                    {i > 0 && assets.length > 1 && (
                      <button onClick={() => {
                        const cropEdit = cropEdits[id]
                        const currentX = cropEdit?.x ?? (isExisting ? ((item.data as PostAsset).crop_x ?? 50) : 50)
                        const currentY = cropEdit?.y ?? (isExisting ? ((item.data as PostAsset).crop_y ?? 50) : 50)
                        // For video without thumbnail, fall back to video src (CropModal will use <video>)
                        const cropSrc = fileType === 'video'
                          ? (previewUrl as string) || videoSrc
                          : (previewUrl as string)
                        setCropAsset({ id, src: cropSrc, isVideo: fileType === 'video' && !previewUrl, x: currentX, y: currentY })
                      }}
                        className="text-[10px] py-0.5 rounded text-center transition-colors"
                        style={cropEdits[id] ? { color: PINK } : { color: 'rgba(0,0,0,0.35)' }}>
                        {cropEdits[id] ? '✓ position' : '📐 position'}
                      </button>
                    )}
                  </div>
                </div>
                )
              })}
            </div>
            <button onClick={() => fileRef.current?.click()}
              className="mt-3 text-xs px-3 py-1.5 rounded-full border transition-colors"
              style={{ borderColor: 'rgba(0,0,0,0.15)', color: 'rgba(0,0,0,0.4)' }}>
              + Add asset
            </button>
            <input ref={fileRef} type="file" multiple accept="image/*,video/*" className="hidden"
              onChange={e => addFiles(e.target.files)} />
            {newAssetsCount > 0 && <p className="text-xs mt-2" style={{ color: PINK }}>· {newAssetsCount} new file{newAssetsCount !== 1 ? 's' : ''} to upload</p>}
          </div>
          <div>
            <p className="text-xs text-black/40 uppercase tracking-widest mb-2">Scheduled date</p>
            <input type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)}
              className="w-full bg-black/5 border border-black/10 rounded-xl px-4 py-2.5 text-sm text-black focus:outline-none focus:border-[#f6a7d7] transition-colors"
              style={{ colorScheme: 'light' }} />
          </div>
          <div>
            <p className="text-xs text-black/40 uppercase tracking-widest mb-2">Platforms</p>
            <div className="flex flex-wrap gap-1.5">
              {PLATFORMS.map(p => (
                <button key={p} type="button" onClick={() => togglePlatform(p)}
                  className="text-xs px-3 py-1 rounded-full border transition-all"
                  style={platforms.includes(p)
                    ? { backgroundColor: PINK, borderColor: PINK, color: '#000' }
                    : { backgroundColor: 'transparent', borderColor: 'rgba(0,0,0,0.15)', color: 'rgba(0,0,0,0.4)' }
                  }>{p}</button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs text-black/40 uppercase tracking-widest mb-2">Caption</p>
            <textarea value={caption} onChange={e => setCaption(e.target.value)}
              placeholder="Caption (optional)" rows={4}
              className="w-full bg-black/5 border border-black/10 rounded-xl px-4 py-2.5 text-sm text-black placeholder-black/20 focus:outline-none focus:border-[#f6a7d7] transition-colors resize-none" />
          </div>
        </div>
        {uploadErrors.length > 0 && (
          <div className="mx-6 mb-3 rounded-xl p-3 text-xs" style={{ backgroundColor: '#ff6b6b10', border: '1px solid #ff6b6b40' }}>
            <p className="font-semibold mb-1" style={{ color: '#ff6b6b' }}>Upload failed — post not saved</p>
            {uploadErrors.map((e, i) => (
              <p key={i} className="mt-1" style={{ color: '#ff6b6b' }}>• {e}</p>
            ))}
            <p className="mt-2 text-[11px]" style={{ color: 'rgba(0,0,0,0.5)' }}>
              Common causes: Supabase Storage bucket size limit (Settings → Storage → posts bucket → edit max file size), missing upload permissions, or a flaky network. Fix and click Save again.
            </p>
          </div>
        )}
        <div className="px-6 py-4 border-t border-black/10 flex gap-3">
          <button onClick={onClose} disabled={saving}
            className="flex-1 py-2.5 rounded-full text-sm font-medium disabled:opacity-40"
            style={{ border: '1px solid rgba(0,0,0,0.15)', color: 'rgba(0,0,0,0.5)' }}>Cancel</button>
          <button onClick={() => { setUploadErrors([]); handleSave() }} disabled={saving || totalAssets === 0}
            className="flex-1 py-2.5 rounded-full text-sm font-semibold text-black transition-opacity hover:opacity-80 disabled:opacity-40"
            style={{ backgroundColor: PINK }}>
            {saving ? 'Saving...' : uploadErrors.length > 0 ? 'Retry save' : state.isNew ? 'Add post' : 'Save & reset for review'}
          </button>
        </div>
      </div>
    </div>
    </>
  )
}

// ─── Drag-and-drop Grid ───────────────────────────────────────────────────────

function AdminGrid({ posts, theme, onUpdate }: { posts: PostWithAssets[]; theme: Theme; onUpdate: (posts: PostWithAssets[]) => void }) {
  const [platform, setPlatform] = useState<GridPlatform>('Instagram')
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [overIdx, setOverIdx] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const filtered = [...posts]
    .filter(p => {
      const platforms = parsePlatforms(p.platform)
      return platforms.length === 0 || platforms.includes(platform)
    })
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
                : { border: `1px solid ${theme.border}`, color: theme.faint }}>
              {p}
            </button>
          ))}
        </div>
        <span className="text-xs" style={{ color: saving ? theme.faint : saved ? PINK : 'transparent' }}>
          {saving ? 'Saving...' : '✓ Dates updated'}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="py-16 text-center rounded-2xl" style={{ border: `1px dashed ${theme.border}` }}>
          <p className="text-sm" style={{ color: theme.subtext }}>No posts assigned to {platform}</p>
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
                    backgroundColor: theme.mediaBg,
                    outline: isOver ? `2px solid ${PINK}` : '2px solid transparent',
                    outlineOffset: '2px',
                    transition: 'outline 0.1s',
                  }}>
                  {cover ? (
                    cover.file_type === 'video'
                      // eslint-disable-next-line @next/next/no-img-element
                      ? cover.thumbnail_url
                        ? <img src={cover.thumbnail_url} alt="" className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center" style={{ color: theme.faint }}>🎥</div>
                      // eslint-disable-next-line @next/next/no-img-element
                      : <img src={cover.file_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-sm" style={{ color: theme.faint }}>?</div>
                  )}
                  {/* Status dot */}
                  <div className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full shadow"
                    style={{ backgroundColor: post.status === 'approved' ? PINK : (post.status === 'changes_requested' || post.status === 'rejected') ? '#ff6b6b' : 'rgba(180,180,180,0.6)' }} />
                  {/* Drag hint */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
                    style={{ backgroundColor: 'rgba(0,0,0,0.25)' }}>
                    <span className="text-white/70 text-lg select-none">⠿</span>
                  </div>
                </div>
                {post.scheduled_date && (
                  <p className="text-center mt-1 text-xs" style={{ color: theme.faint }}>
                    {new Date(post.scheduled_date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                  </p>
                )}
              </div>
            )
          })}
          {/* Pad to at least 9 cells */}
          {Array.from({ length: Math.max(0, 9 - filtered.length) }).map((_, i) => (
            <div key={`pad-${i}`}>
              <div className="aspect-[3/4] rounded-sm" style={{ backgroundColor: theme.mediaBg, opacity: 0.3 }} />
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-center" style={{ color: theme.faint }}>Drag to reorder — dates shift automatically</p>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [posts, setPosts] = useState<PostWithAssets[]>([])
  const [reviewers, setReviewers] = useState<Reviewer[]>([])
  const [postReviews, setPostReviews] = useState<PostReview[]>([])
  const [newReviewerName, setNewReviewerName] = useState('')
  const [addingReviewer, setAddingReviewer] = useState(false)
  const [copiedReviewer, setCopiedReviewer] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [copiedSchedule, setCopiedSchedule] = useState(false)
  const [copiedPending, setCopiedPending] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [editingPost, setEditingPost] = useState<EditState | null>(null)
  const [pageTab, setPageTab] = useState<PageTab>('posts')
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  function toggleSelect(id: string) {
    setSelectedIds(s => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function deleteSelected() {
    if (!selectedIds.size) return
    if (!confirm(`Move ${selectedIds.size} post${selectedIds.size === 1 ? '' : 's'} to trash? Captions and files are preserved.`)) return
    const ids = [...selectedIds]
    setPosts(p => p.filter(x => !selectedIds.has(x.id)))
    setSelectedIds(new Set())
    setSelectMode(false)
    await supabase.from('posts').update({ deleted_at: new Date().toISOString() }).in('id', ids)
  }
  const t = THEME

  useEffect(() => {
    if (!id) return
    supabase.from('campaigns').select('*').eq('id', id).single()
      .then(async ({ data: c }) => {
        setCampaign(c)
        if (c) setPosts(await fetchPostsWithAssets(c.id))
        setLoading(false)
      })
  }, [id])

  // Reviewer loading is completely separate — any failure here is silently ignored
  useEffect(() => {
    if (!id) return
    ;(async () => {
      try {
        const { data: revs } = await supabase.from('reviewers').select('*').eq('campaign_id', id).order('created_at')
        if (revs) setReviewers(revs)
      } catch { /* table may not exist yet */ }
    })()
  }, [id])

  useEffect(() => {
    if (!posts.length) return
    ;(async () => {
      try {
        const { data: reviews } = await supabase.from('post_reviews').select('*').in('post_id', posts.map(p => p.id))
        if (reviews) setPostReviews(reviews)
      } catch { /* table may not exist yet */ }
    })()
  }, [posts.length]) // eslint-disable-line react-hooks/exhaustive-deps

  async function addReviewer() {
    if (!newReviewerName.trim() || !campaign) return
    const email = newReviewerName.trim().toLowerCase()
    // Basic email check — approvers sign in by email, so this needs to be a valid address
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      alert('Please enter a valid email address.')
      return
    }
    setAddingReviewer(true)
    const token = generateToken()
    const { data, error } = await supabase.from('reviewers').insert({
      campaign_id: campaign.id,
      name: email.split('@')[0],
      email,
      token,
    }).select().single()
    setAddingReviewer(false)
    if (error) {
      alert(`Could not add approver — ${error.message}.\n\nIf this says "email column not found", run the latest migration in supabase-schema.sql.`)
      return
    }
    if (data) setReviewers(r => [...r, data])
    setNewReviewerName('')
  }

  async function removeReviewer(reviewerId: string) {
    await supabase.from('reviewers').delete().eq('id', reviewerId)
    setReviewers(r => r.filter(x => x.id !== reviewerId))
    setPostReviews(pr => pr.filter(x => x.reviewer_id !== reviewerId))
  }

  function copyReviewerLink(token: string, reviewerId: string) {
    navigator.clipboard.writeText(`${window.location.origin}/review/${token}`)
    setCopiedReviewer(reviewerId)
    setTimeout(() => setCopiedReviewer(null), 2000)
  }

  function getReviewerChips(postId: string): { name: string; status: PostStatus | null }[] {
    return reviewers.map(rev => {
      const review = postReviews.find(r => r.post_id === postId && r.reviewer_id === rev.id)
      return { name: rev.name, status: review?.status ?? null }
    })
  }

  function copyLink() {
    // The "review link" is now the universal sign-in page. Each approver signs in by email
    // and sees the campaigns they've been added to.
    navigator.clipboard.writeText(`${window.location.origin}/review`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function copyScheduleLink() {
    if (!campaign) return
    navigator.clipboard.writeText(`${window.location.origin}/schedule/${campaign.token}`)
    setCopiedSchedule(true)
    setTimeout(() => setCopiedSchedule(false), 2000)
  }

  function copyPendingLink() {
    if (!campaign) return
    navigator.clipboard.writeText(`${window.location.origin}/review/${campaign.token}?pending=1`)
    setCopiedPending(true)
    setTimeout(() => setCopiedPending(false), 2000)
  }

  async function publishCampaign() {
    if (!campaign) return
    setPublishing(true)
    await supabase.from('campaigns').update({ status: 'active' }).eq('id', campaign.id)
    setCampaign(c => c ? { ...c, status: 'active' } : c)
    setPublishing(false)
  }

  async function resetPostToPending(postId: string) {
    await supabase.from('posts').update({ status: null, feedback: null }).eq('id', postId)
    setPosts(p => p.map(x => x.id === postId ? { ...x, status: null, feedback: null } : x))
  }

  async function toggleInternalApproval(postId: string) {
    const post = posts.find(p => p.id === postId)
    if (!post) return
    const next = post.internal_approved_at ? null : new Date().toISOString()
    let nextBy: string | null = null
    if (next) {
      const { data } = await supabase.auth.getUser()
      nextBy = data.user?.email || null
    }
    setPosts(p => p.map(x => x.id === postId ? { ...x, internal_approved_at: next, internal_approved_by: nextBy } : x))
    const { error } = await supabase.from('posts').update({ internal_approved_at: next, internal_approved_by: nextBy }).eq('id', postId)
    if (error) {
      setPosts(p => p.map(x => x.id === postId ? { ...x, internal_approved_at: post.internal_approved_at, internal_approved_by: post.internal_approved_by } : x))
      alert(`Could not toggle internal approval — ${error.message}.\n\nIf this says "internal_approved_at column not found", run the migration.`)
    }
  }

  async function toggleScheduled(postId: string) {
    const post = posts.find(p => p.id === postId)
    if (!post) return
    const prev = post.scheduled_at
    const next = prev ? null : new Date().toISOString()
    setPosts(p => p.map(x => x.id === postId ? { ...x, scheduled_at: next } : x))
    const { error } = await supabase.from('posts').update({ scheduled_at: next }).eq('id', postId)
    if (error) {
      // Roll back the optimistic UI change and surface the issue
      setPosts(p => p.map(x => x.id === postId ? { ...x, scheduled_at: prev } : x))
      alert(`Could not save scheduled state — ${error.message}.\n\nIf this says "scheduled_at column not found", run the migration in supabase-schema.sql.`)
    }
  }

  // Trigger a browser download for every asset on this post.
  // Fetches each file as a blob and saves via an anchor — reliable across all browsers, no popup blockers.
  async function downloadPostFiles(post: PostWithAssets) {
    const safeTitle = ((post.caption || 'post').slice(0, 40).replace(/[^a-z0-9-_]+/gi, '_') || 'post')
    for (let i = 0; i < post.assets.length; i++) {
      const a = post.assets[i]
      const ext = (a.file_url.split('?')[0].split('.').pop() || (a.file_type === 'video' ? 'mp4' : 'jpg')).toLowerCase()
      const filename = post.assets.length > 1 ? `${safeTitle}_${i + 1}.${ext}` : `${safeTitle}.${ext}`
      try {
        const res = await fetch(a.file_url)
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = filename
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        // Release memory after a moment
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      } catch (e) {
        console.error('Download failed for', filename, e)
      }
    }
  }

  async function deletePost(postId: string) {
    if (!campaign) return
    if (!confirm('Move this post to trash? Captions and files are preserved — restore from the campaign trash.')) return

    // Soft delete — keep the row and its files so nothing is irrecoverably lost
    setPosts(p => p.filter(x => x.id !== postId))
    await supabase.from('posts').update({ deleted_at: new Date().toISOString() }).eq('id', postId)
  }

  async function resetAllChanges() {
    const ids = posts.filter(p => p.status === 'changes_requested' || p.status === 'rejected').map(p => p.id)
    if (!ids.length) return
    await supabase.from('posts').update({ status: null, feedback: null }).in('id', ids)
    setPosts(p => p.map(x => ids.includes(x.id) ? { ...x, status: null, feedback: null } : x))
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

  function openAddPost() {
    setEditingPost({
      postId: '',
      isNew: true,
      newPostPosition: posts.length,
      caption: '',
      platforms: [],
      scheduledDate: '',
      existingAssets: [],
      newAssets: [],
      saving: false,
    })
  }

  const approved = posts.filter(p => p.status === 'approved').length
  const changes = posts.filter(p => p.status === 'changes_requested').length
  const rejected = posts.filter(p => p.status === 'rejected').length

  if (loading) return (
    <div className="min-h-screen p-10 text-sm transition-colors" style={{ backgroundColor: t.bg, color: t.faint }}>
      Loading...
    </div>
  )
  if (!campaign) return (
    <div className="min-h-screen p-10 text-sm transition-colors" style={{ backgroundColor: t.bg, color: t.faint }}>
      Campaign not found.
    </div>
  )

  return (
    <div className="min-h-screen transition-colors duration-200 p-6 md:p-10" style={{ backgroundColor: t.bg, color: t.text }}>
      {editingPost && campaign && (
        <EditModal state={editingPost} campaignId={campaign.id}
          onSave={updated => {
            setPosts(p => {
              const exists = p.some(x => x.id === updated.id)
              return exists ? p.map(x => x.id === updated.id ? updated : x) : [...p, updated]
            })
            setEditingPost(null)
          }}
          onClose={() => setEditingPost(null)} />
      )}

      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between gap-4 mb-2">
          <Link href="/admin"
            className="text-sm transition-colors"
            style={{ color: t.faint }}
            onMouseOver={e => (e.currentTarget.style.color = t.text)}
            onMouseOut={e => (e.currentTarget.style.color = t.faint)}>
            ← Back
          </Link>
        </div>

        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-8 flex-wrap">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold" style={{ color: t.text }}>{campaign.title}</h1>
              {campaign.status === 'draft' && (
                <span className="text-xs px-2.5 py-0.5 rounded-full font-medium"
                  style={{ backgroundColor: t.inputBg, color: t.faint, border: `1px dashed ${t.border}` }}>
                  Draft
                </span>
              )}
            </div>
            {campaign.client_name && <p className="text-sm mt-1" style={{ color: t.faint }}>{campaign.client_name}</p>}
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
                  style={{ border: `1px solid ${t.border}`, color: t.subtext }}
                  onMouseOver={e => (e.currentTarget.style.color = t.text)}
                  onMouseOut={e => (e.currentTarget.style.color = t.subtext)}>
                  ↓ Move to draft
                </button>
                <button onClick={copyLink}
                  className="px-5 py-2.5 rounded-full text-sm font-semibold text-black transition-all"
                  style={{ backgroundColor: copied ? '#ffffff' : PINK }}>
                  {copied ? '✓ Copied!' : 'Copy sign-in link'}
                </button>
                <button onClick={copyScheduleLink}
                  className="px-4 py-2.5 rounded-full text-sm font-medium transition-colors"
                  style={{ border: `1px solid ${t.border}`, color: copiedSchedule ? PINK : t.subtext }}>
                  {copiedSchedule ? '✓ Copied!' : '📅 Copy schedule link'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { label: 'Approved', count: approved, color: PINK },
            { label: 'Changes', count: changes, color: '#ff6b6b' },
            { label: 'Rejected', count: rejected, color: '#ff6b6b' },
          ].map(s => (
            <div key={s.label} className="rounded-xl p-4 text-center" style={{ border: `1px solid ${t.border}`, backgroundColor: t.card }}>
              <div className="text-2xl font-bold" style={{ color: s.color }}>{s.count}</div>
              <div className="text-xs mt-1" style={{ color: t.faint }}>{s.label}</div>
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

        {/* Approvers panel — each row is a client who signs in with their email at /review */}
        <div className="rounded-2xl p-5 mb-6" style={{ border: `1px solid ${t.border}` }}>
          <p className="text-xs uppercase tracking-widest mb-1" style={{ color: t.faint }}>Approvers</p>
          <p className="text-xs mb-4" style={{ color: t.faint }}>
            Each person signs in at <code>/review</code> with their email. A post is only fully approved once <strong>every</strong> approver below approves it.
          </p>
          {reviewers.length > 0 && (
            <div className="space-y-2 mb-4">
              {reviewers.map(rev => {
                const done = postReviews.filter(r => r.reviewer_id === rev.id && r.status === 'approved').length
                return (
                  <div key={rev.id} className="flex items-center gap-3 rounded-xl px-4 py-3"
                    style={{ backgroundColor: t.inputBg, border: `1px solid ${t.border}` }}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: t.text }}>{rev.name || rev.email}</p>
                      <p className="text-xs mt-0.5 truncate" style={{ color: t.faint }}>
                        {rev.email ? `${rev.email} · ` : ''}{done}/{posts.length} approved
                      </p>
                    </div>
                    <button onClick={() => removeReviewer(rev.id)}
                      className="shrink-0 text-xs w-7 h-7 rounded-full flex items-center justify-center transition-colors"
                      style={{ border: `1px solid ${t.border}`, color: t.faint }}
                      onMouseOver={e => (e.currentTarget.style.color = '#ff6b6b')}
                      onMouseOut={e => (e.currentTarget.style.color = t.faint)}>✕</button>
                  </div>
                )
              })}
            </div>
          )}
          <div className="flex gap-2">
            <input type="email" value={newReviewerName}
              onChange={e => setNewReviewerName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addReviewer() }}
              placeholder="client@email.com"
              className="flex-1 rounded-xl px-4 py-2.5 text-sm focus:outline-none transition-colors"
              style={{ backgroundColor: t.inputBg, border: `1px solid ${t.border}`, color: t.text }} />
            <button onClick={addReviewer} disabled={!newReviewerName.trim() || addingReviewer}
              className="shrink-0 px-5 py-2.5 rounded-xl text-sm font-semibold text-black transition-all disabled:opacity-40"
              style={{ backgroundColor: PINK }}>
              {addingReviewer ? '...' : '+ Add'}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex gap-1">
            {(['posts', 'grid'] as PageTab[]).map(tab => (
              <button key={tab} onClick={() => setPageTab(tab)}
                className="px-4 py-1.5 rounded-full text-xs font-medium transition-all"
                style={pageTab === tab ? { backgroundColor: PINK, color: '#000' } : { color: t.subtext }}>
                {tab === 'posts' ? 'Posts' : 'Grid'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {selectMode ? (
              <>
                <button onClick={deleteSelected} disabled={!selectedIds.size}
                  className="text-xs px-4 py-1.5 rounded-full font-medium transition-colors disabled:opacity-40"
                  style={{ backgroundColor: '#ff6b6b15', border: '1px solid #ff6b6b40', color: '#ff6b6b' }}>
                  Delete {selectedIds.size ? selectedIds.size : ''}
                </button>
                <button onClick={() => { setSelectMode(false); setSelectedIds(new Set()) }}
                  className="text-xs px-4 py-1.5 rounded-full font-medium"
                  style={{ border: `1px solid ${t.border}`, color: t.subtext }}>
                  Cancel
                </button>
              </>
            ) : (
              <button onClick={() => setSelectMode(true)}
                className="text-xs px-4 py-1.5 rounded-full font-medium transition-colors"
                style={{ border: `1px solid ${t.border}`, color: t.subtext }}>
                Select
              </button>
            )}
            <Link href={`/admin/new?addTo=${campaign.id}`}
              className="text-xs px-4 py-1.5 rounded-full font-medium transition-colors"
              style={{ backgroundColor: t.inputBg, border: `1px solid ${t.border}`, color: t.subtext }}
              onMouseOver={e => (e.currentTarget.style.color = t.text)}
              onMouseOut={e => (e.currentTarget.style.color = t.subtext)}>
              + Add posts
            </Link>
          </div>
        </div>

        {/* Posts list */}
        {pageTab === 'posts' && (
          <div className="space-y-4">
            {[...posts].sort((a, b) => {
              if (!a.scheduled_date && !b.scheduled_date) return 0
              if (!a.scheduled_date) return 1
              if (!b.scheduled_date) return -1
              return new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime()
            }).map(post => {
              const cover = post.assets[0]
              const isCarousel = post.assets.length > 1
              return (
                <div key={post.id} id={`post-${post.id}`}
                  onClick={selectMode ? () => toggleSelect(post.id) : undefined}
                  className={`rounded-2xl p-4 flex gap-4 scroll-mt-20 ${selectMode ? 'cursor-pointer' : ''}`}
                  style={{
                    border: `1px solid ${selectedIds.has(post.id) ? PINK : (post.status === 'changes_requested' || post.status === 'rejected') ? '#ff6b6b30' : t.border}`,
                    backgroundColor: selectedIds.has(post.id) ? `${PINK}10` : t.card,
                  }}>
                  {selectMode && (
                    <div className="shrink-0 flex items-start pt-1">
                      <div className="w-5 h-5 rounded-md flex items-center justify-center text-xs font-bold"
                        style={selectedIds.has(post.id)
                          ? { backgroundColor: PINK, color: '#fff' }
                          : { border: `1.5px solid ${t.border}`, color: 'transparent' }}>
                        ✓
                      </div>
                    </div>
                  )}
                  <div className="w-24 h-24 rounded-xl overflow-hidden shrink-0 relative"
                    style={{ backgroundColor: t.inputBg }}>
                    {cover ? (
                      cover.file_type === 'video'
                        ? cover.thumbnail_url
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={cover.thumbnail_url} alt="" className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center" style={{ color: t.faint, fontSize: '20px' }}>🎥</div>
                        // eslint-disable-next-line @next/next/no-img-element
                        : <img src={cover.file_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs" style={{ color: t.faint }}>no file</div>
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
                        <span key={p} className="text-xs rounded-full px-2 py-0.5"
                          style={{ border: `1px solid ${t.border}`, color: t.faint }}>{p}</span>
                      ))}
                      <span className="text-xs px-2.5 py-0.5 rounded-full font-medium"
                        style={
                          post.status === 'approved' ? { backgroundColor: '#f6a7d720', color: PINK }
                          : post.status === 'changes_requested' ? { backgroundColor: '#ff6b6b20', color: '#ff6b6b' }
                          : post.status === 'rejected' ? { backgroundColor: '#ff3b3b20', color: '#ff6b6b' }
                          : { backgroundColor: t.inputBg, color: t.subtext }
                        }>
                        {post.status === 'approved' ? '✓ Approved' : post.status === 'changes_requested' ? '⚡ Changes' : post.status === 'rejected' ? '✕ Rejected' : '· Pending'}
                      </span>
                    </div>
                    {post.scheduled_date && (
                      <p className="text-xs mb-1" style={{ color: PINK }}>
                        📅 {new Date(post.scheduled_date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    )}
                    {post.caption && <p className="text-sm leading-relaxed line-clamp-2" style={{ color: t.subtext }}>{post.caption}</p>}
                    {reviewers.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {getReviewerChips(post.id).map(chip => (
                          <span key={chip.name} className="text-xs px-2 py-0.5 rounded-full font-medium"
                            style={chip.status === 'approved' ? { backgroundColor: `${PINK}20`, color: PINK }
                              : chip.status === 'changes_requested' || chip.status === 'rejected' ? { backgroundColor: '#ff6b6b15', color: '#ff9999' }
                              : { border: `1px solid ${t.border}`, color: t.faint }}>
                            {chip.status === 'approved' ? '✓' : chip.status === 'changes_requested' ? '⚡' : chip.status === 'rejected' ? '✕' : '·'} {chip.name}
                          </span>
                        ))}
                      </div>
                    )}
                    {reviewers.length === 0 && (post.status === 'changes_requested' || post.status === 'rejected') && (
                      <div className="mt-2 rounded-lg px-3 py-2 text-xs" style={{ backgroundColor: '#ff6b6b12', border: '1px solid #ff6b6b25' }}>
                        <span style={{ color: '#ff6b6b80' }}>Client note: </span>
                        <span style={{ color: '#ff9999' }}>{post.feedback || <em style={{ opacity: 0.5 }}>No note left</em>}</span>
                      </div>
                    )}
                    <div className="flex gap-2 mt-2 flex-wrap items-center">
                      <button onClick={() => openEdit(post)}
                        className="text-xs px-3 py-1 rounded-full border transition-colors"
                        style={{ borderColor: t.border, color: t.faint }}
                        onMouseOver={e => (e.currentTarget.style.color = t.text)}
                        onMouseOut={e => (e.currentTarget.style.color = t.faint)}>
                        ✎ Edit
                      </button>
                      {post.assets.length > 0 && (
                        <button onClick={() => downloadPostFiles(post)}
                          className="text-xs px-3 py-1 rounded-full border transition-colors"
                          style={{ borderColor: t.border, color: t.faint }}
                          onMouseOver={e => (e.currentTarget.style.color = t.text)}
                          onMouseOut={e => (e.currentTarget.style.color = t.faint)}>
                          ⬇ Files ({post.assets.length})
                        </button>
                      )}
                      <button onClick={() => toggleScheduled(post.id)}
                        className="text-xs px-3 py-1 rounded-full border transition-all"
                        style={post.scheduled_at
                          ? { backgroundColor: `${PINK}20`, borderColor: `${PINK}60`, color: PINK }
                          : { borderColor: t.border, color: t.faint }
                        }>
                        {post.scheduled_at ? '✓ Posted' : '📅 Mark as posted'}
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
                      <button onClick={() => deletePost(post.id)}
                        className="text-xs px-3 py-1 rounded-full border transition-colors ml-auto"
                        style={{ borderColor: '#ff6b6b30', color: '#ff6b6b80' }}
                        onMouseOver={e => (e.currentTarget.style.color = '#ff6b6b')}
                        onMouseOut={e => (e.currentTarget.style.color = '#ff6b6b80')}>
                        🗑 Delete
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Grid tab */}
        {pageTab === 'grid' && (
          <AdminGrid posts={posts} theme={t} onUpdate={setPosts} />
        )}

        {/* Client link */}
        {campaign.status === 'active' && (
          <div className="mt-8 rounded-2xl p-5" style={{ border: `1px solid ${t.border}` }}>
            <p className="text-xs uppercase tracking-widest mb-2" style={{ color: t.faint }}>Client review link</p>
            <p className="text-sm font-mono break-all" style={{ color: t.subtext }}>
              {typeof window !== 'undefined' ? window.location.origin : ''}/review/{campaign.token}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
