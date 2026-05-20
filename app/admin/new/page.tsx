'use client'

import { useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const PINK = '#f6a7d7'
const MAX_FILE_MB = 500

type Theme = { bg: string; card: string; border: string; text: string; subtext: string; faint: string; inputBg: string; dark: boolean }

function makeTheme(dark: boolean): Theme {
  return dark
    ? { bg: '#0a0a0a', card: '#111', border: 'rgba(255,255,255,0.1)', text: '#fff', subtext: 'rgba(255,255,255,0.5)', faint: 'rgba(255,255,255,0.25)', inputBg: 'rgba(255,255,255,0.06)', dark: true }
    : { bg: '#f4f4f4', card: '#fff', border: 'rgba(0,0,0,0.08)', text: '#0a0a0a', subtext: 'rgba(0,0,0,0.5)', faint: 'rgba(0,0,0,0.3)', inputBg: 'rgba(0,0,0,0.04)', dark: false }
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

type AssetDraft = {
  id: string
  file: File
  preview: string
  fileType: 'image' | 'video'
  thumbnailDataUrl?: string
}

// ─── Full-screen thumbnail picker modal ──────────────────────────────────────

function ThumbnailPickerModal({ src, currentThumb, onCapture, onClose }: {
  src: string
  currentThumb?: string
  onCapture: (dataUrl: string) => void
  onClose: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [duration, setDuration] = useState(0)
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [canCapture, setCanCapture] = useState(false)
  const [captured, setCaptured] = useState<string | null>(currentThumb || null)
  const [captureError, setCaptureError] = useState<string | null>(null)
  const [captureSuccess, setCaptureSuccess] = useState(false)

  // Local blob URLs are already same-origin — no fetch needed
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
    if (!v || !c) return
    if (!canCapture) { setCaptureError('Video still loading — wait a moment'); return }
    v.pause(); setPlaying(false)
    // Force a fresh seek so the frame is fully decoded
    const targetTime = v.currentTime
    v.currentTime = targetTime
    await new Promise<void>(res => {
      const h = () => { v.removeEventListener('seeked', h); res() }
      v.addEventListener('seeked', h)
    })
    if (!v.videoWidth || !v.videoHeight) { setCaptureError('Try scrubbing first'); return }
    try {
      c.width = v.videoWidth; c.height = v.videoHeight
      c.getContext('2d')!.drawImage(v, 0, 0)
      const dataUrl = c.toDataURL('image/jpeg', 0.92)
      setCaptured(dataUrl); onCapture(dataUrl)
      setCaptureSuccess(true)
      setTimeout(() => setCaptureSuccess(false), 1500)
    } catch (e) { setCaptureError(`Error: ${e}`) }
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string
      setCaptured(dataUrl); onCapture(dataUrl); setCaptureError(null)
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.95)', backdropFilter: 'blur(8px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-2xl rounded-2xl overflow-hidden"
        style={{ backgroundColor: '#0a0a0a', border: '1px solid rgba(255,255,255,0.12)' }}>

        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10">
          <h3 className="text-sm font-semibold text-white">Pick thumbnail</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors text-xl leading-none">✕</button>
        </div>

        <div className="relative bg-black cursor-pointer" onClick={togglePlay}>
          <video ref={videoRef} src={src} playsInline preload="auto" muted
            className="w-full max-h-[55vh] object-contain"
            onLoadedData={() => setCanCapture(true)}
            onLoadedMetadata={e => setDuration((e.target as HTMLVideoElement).duration)}
            onTimeUpdate={e => setTime((e.target as HTMLVideoElement).currentTime)}
            onEnded={() => setPlaying(false)} />
          <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
            <div className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{ backgroundColor: 'rgba(246,167,215,0.2)', border: `2px solid ${PINK}` }}>
              {playing
                ? <svg viewBox="0 0 24 24" fill={PINK} className="w-6 h-6"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                : <svg viewBox="0 0 24 24" fill={PINK} className="w-6 h-6 ml-1"><path d="M8 5v14l11-7z"/></svg>}
            </div>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <input type="range" min={0} max={duration || 1} step={0.01} value={time}
            onChange={e => seekTo(parseFloat(e.target.value))}
            disabled={!canCapture}
            className="w-full cursor-pointer disabled:opacity-30"
            style={{ accentColor: PINK }} />

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
                <button type="button" onClick={() => { onCapture(captured); onClose() }}
                  className="px-4 py-2 rounded-full text-sm font-semibold text-black"
                  style={{ backgroundColor: PINK }}>Done</button>
              )}
              <button type="button" onClick={capture} disabled={!canCapture}
                className="px-4 py-2 rounded-full text-sm font-medium transition-all disabled:opacity-40"
                style={{ border: `1px solid ${PINK}`, color: captureSuccess ? '#000' : PINK, backgroundColor: captureSuccess ? PINK : 'transparent' }}>
                {captureSuccess ? '✓ Captured!' : captured ? 'Recapture' : 'Capture frame'}
              </button>
              <button type="button" onClick={() => fileInputRef.current?.click()}
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

// ─── Types & helpers ──────────────────────────────────────────────────────────

type PostDraft = {
  id: string
  assets: AssetDraft[]
  caption: string
  platforms: string[]
  scheduledDate: string
}

const PLATFORMS = ['Instagram', 'TikTok', 'Facebook', 'LinkedIn', 'Twitter/X', 'YouTube', 'Other']

function generateToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0')).join('')
}

function fmtMB(bytes: number) { return (bytes / 1024 / 1024).toFixed(1) + ' MB' }

function makeAssets(files: File[]): AssetDraft[] {
  return files
    .filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'))
    .map(file => ({
      id: Math.random().toString(36).slice(2),
      file,
      preview: URL.createObjectURL(file),
      fileType: file.type.startsWith('video/') ? 'video' : 'image',
    }))
}

function PlatformPills({ selected, theme, onChange }: { selected: string[]; theme: Theme; onChange: (v: string[]) => void }) {
  function toggle(p: string) {
    onChange(selected.includes(p) ? selected.filter(x => x !== p) : [...selected, p])
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {PLATFORMS.map(p => {
        const active = selected.includes(p)
        return (
          <button key={p} type="button" onClick={() => toggle(p)}
            className="text-xs px-3 py-1 rounded-full border transition-all"
            style={active
              ? { backgroundColor: PINK, borderColor: PINK, color: '#000' }
              : { backgroundColor: 'transparent', borderColor: theme.border, color: theme.subtext }
            }>{p}</button>
        )
      })}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NewCampaignPage() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [clientName, setClientName] = useState('')
  const [posts, setPosts] = useState<PostDraft[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadStatus, setUploadStatus] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [thumbPicker, setThumbPicker] = useState<{ postId: string; assetId: string; src: string; current?: string } | null>(null)
  const [uploadErrors, setUploadErrors] = useState<string[]>([])
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

  function addFilesAsPosts(files: FileList | null) {
    if (!files) return
    const oversized = Array.from(files).filter(f => f.size > MAX_FILE_MB * 1024 * 1024)
    if (oversized.length > 0) {
      alert(`These files exceed ${MAX_FILE_MB} MB and may fail to upload:\n${oversized.map(f => `• ${f.name} (${fmtMB(f.size)})`).join('\n')}\n\nTry compressing them first, or check your Supabase storage bucket file size limit.`)
    }
    const newPosts: PostDraft[] = Array.from(files)
      .filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'))
      .map(file => ({
        id: Math.random().toString(36).slice(2),
        assets: makeAssets([file]),
        caption: '',
        platforms: [],
        scheduledDate: '',
      }))
    setPosts(p => [...p, ...newPosts])
  }

  function addAssetsToPost(postId: string) {
    const input = document.createElement('input')
    input.type = 'file'; input.multiple = true; input.accept = 'image/*,video/*'
    input.onchange = e => {
      const files = Array.from((e.target as HTMLInputElement).files || [])
      const newAssets = makeAssets(files)
      setPosts(p => p.map(x => x.id === postId ? { ...x, assets: [...x.assets, ...newAssets] } : x))
    }
    input.click()
  }

  function removeAsset(postId: string, assetId: string) {
    setPosts(p => p.map(x => {
      if (x.id !== postId) return x
      const remaining = x.assets.filter(a => a.id !== assetId)
      return remaining.length === 0 ? null : { ...x, assets: remaining }
    }).filter(Boolean) as PostDraft[])
  }

  function removePost(id: string) { setPosts(p => p.filter(x => x.id !== id)) }

  function updatePost<K extends keyof PostDraft>(id: string, field: K, value: PostDraft[K]) {
    setPosts(p => p.map(x => x.id === id ? { ...x, [field]: value } : x))
  }

  function movePost(id: string, dir: -1 | 1) {
    setPosts(p => {
      const idx = p.findIndex(x => x.id === id)
      if (idx < 0) return p
      const next = idx + dir
      if (next < 0 || next >= p.length) return p
      const arr = [...p];[arr[idx], arr[next]] = [arr[next], arr[idx]]
      return arr
    })
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false); addFilesAsPosts(e.dataTransfer.files)
  }, [])

  async function handleSubmit(e: React.FormEvent, asDraft = false) {
    e.preventDefault()
    if (!title.trim() || posts.length === 0) return
    setUploading(true); setUploadErrors([])

    const token = generateToken()
    setUploadStatus('Creating campaign…')
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .insert({ title: title.trim(), client_name: clientName.trim() || null, token, status: asDraft ? 'draft' : 'active' })
      .select().single()

    if (campaignError || !campaign) {
      alert('Failed to create campaign: ' + campaignError?.message)
      setUploading(false); return
    }

    const errors: string[] = []

    for (let i = 0; i < posts.length; i++) {
      const post = posts[i]
      setUploadProgress(Math.round((i / posts.length) * 90))
      setUploadStatus(`Uploading post ${i + 1} of ${posts.length}…`)

      const { data: postRecord, error: postError } = await supabase
        .from('posts')
        .insert({
          campaign_id: campaign.id,
          caption: post.caption || null,
          platform: post.platforms.length > 0 ? JSON.stringify(post.platforms) : null,
          scheduled_date: post.scheduledDate || null,
          position: i,
          status: 'pending',
        })
        .select().single()

      if (postError || !postRecord) {
        errors.push(`Post ${i + 1}: ${postError?.message}`)
        continue
      }

      for (let j = 0; j < post.assets.length; j++) {
        const asset = post.assets[j]
        const ext = asset.file.name.split('.').pop()
        const path = `${campaign.id}/${postRecord.id}/${asset.id}.${ext}`

        const { error: uploadError } = await supabase.storage
          .from('posts')
          .upload(path, asset.file, {
            contentType: asset.file.type,
            cacheControl: '3600',
            upsert: false,
          })

        if (uploadError) {
          const sizeMB = fmtMB(asset.file.size)
          errors.push(`${asset.file.name} (${sizeMB}): ${uploadError.message}`)
          continue
        }

        const { data: { publicUrl } } = supabase.storage.from('posts').getPublicUrl(path)

        let thumbnailUrl: string | null = null
        if (asset.fileType === 'video' && asset.thumbnailDataUrl) {
          const blob = await (await fetch(asset.thumbnailDataUrl)).blob()
          const thumbPath = `${campaign.id}/${postRecord.id}/${asset.id}_thumb.jpg`
          const { error: te } = await supabase.storage.from('posts').upload(thumbPath, blob, { contentType: 'image/jpeg', cacheControl: '3600' })
          if (!te) thumbnailUrl = supabase.storage.from('posts').getPublicUrl(thumbPath).data.publicUrl
        }

        await supabase.from('post_assets').insert({
          post_id: postRecord.id,
          file_url: publicUrl,
          file_type: asset.fileType,
          thumbnail_url: thumbnailUrl,
          position: j,
        })
      }
    }

    setUploadProgress(100)
    if (errors.length > 0) setUploadErrors(errors)
    else router.push(`/admin/campaign/${campaign.id}`)
    setUploading(false)
  }

  return (
    <div className="min-h-screen transition-colors duration-200 p-6 md:p-10" style={{ backgroundColor: t.bg }}>
      {thumbPicker && (
        <ThumbnailPickerModal
          src={thumbPicker.src}
          currentThumb={thumbPicker.current}
          onCapture={dataUrl => {
            setPosts(p => p.map(x => x.id === thumbPicker.postId
              ? { ...x, assets: x.assets.map(a => a.id === thumbPicker.assetId ? { ...a, thumbnailDataUrl: dataUrl } : a) }
              : x))
            setThumbPicker(prev => prev ? { ...prev, current: dataUrl } : null)
          }}
          onClose={() => setThumbPicker(null)}
        />
      )}

      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <button onClick={() => router.push('/admin')}
              className="text-sm transition-colors"
              style={{ color: t.faint }}
              onMouseOver={e => (e.currentTarget.style.color = t.text)}
              onMouseOut={e => (e.currentTarget.style.color = t.faint)}>
              ← Back
            </button>
            <h1 className="text-xl font-bold" style={{ color: PINK }}>New Campaign</h1>
          </div>
          <ThemeToggle dark={dark} onToggle={toggleDark} border={t.border} subtext={t.subtext} />
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <div>
              <label className="text-xs uppercase tracking-widest mb-2 block" style={{ color: t.faint }}>Campaign Title *</label>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. May Content" required
                className="w-full rounded-xl px-4 py-3 focus:outline-none transition-colors"
                style={{ backgroundColor: t.inputBg, border: `1px solid ${t.border}`, color: t.text }}
                onFocus={e => (e.currentTarget.style.borderColor = PINK)}
                onBlur={e => (e.currentTarget.style.borderColor = t.border)} />
            </div>
            <div>
              <label className="text-xs uppercase tracking-widest mb-2 block" style={{ color: t.faint }}>Client Name</label>
              <input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="e.g. Acme Co"
                className="w-full rounded-xl px-4 py-3 focus:outline-none transition-colors"
                style={{ backgroundColor: t.inputBg, border: `1px solid ${t.border}`, color: t.text }}
                onFocus={e => (e.currentTarget.style.borderColor = PINK)}
                onBlur={e => (e.currentTarget.style.borderColor = t.border)} />
            </div>
          </div>

          {/* Drop zone */}
          <div>
            <label className="text-xs uppercase tracking-widest mb-2 block" style={{ color: t.faint }}>Posts *</label>
            <div
              onDrop={handleDrop}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => document.getElementById('file-input')?.click()}
              className="border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-colors"
              style={{ borderColor: dragOver ? PINK : t.border }}>
              <p className="text-sm" style={{ color: t.subtext }}>Drop files here, or <span style={{ color: PINK }}>click to browse</span></p>
              <p className="text-xs mt-1" style={{ color: t.faint }}>Each file becomes its own post · add more to a post to make a carousel</p>
              <input id="file-input" type="file" multiple accept="image/*,video/*" className="hidden"
                onChange={e => addFilesAsPosts(e.target.files)} />
            </div>
          </div>

          {/* Post list */}
          {posts.length > 0 && (
            <div className="space-y-5">
              {posts.map((post, idx) => (
                <div key={post.id} className="rounded-2xl p-4 space-y-3"
                  style={{ border: `1px solid ${t.border}`, backgroundColor: t.card }}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs uppercase tracking-widest" style={{ color: t.faint }}>
                      Post {idx + 1}
                      {post.assets.length > 1 && (
                        <span className="ml-2 px-2 py-0.5 rounded-full text-xs" style={{ backgroundColor: '#f6a7d720', color: PINK }}>
                          Carousel · {post.assets.length}
                        </span>
                      )}
                    </span>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => movePost(post.id, -1)} disabled={idx === 0}
                        className="px-1.5 py-1 disabled:opacity-20 transition-colors"
                        style={{ color: t.faint }}
                        onMouseOver={e => (e.currentTarget.style.color = t.text)}
                        onMouseOut={e => (e.currentTarget.style.color = t.faint)}>↑</button>
                      <button type="button" onClick={() => movePost(post.id, 1)} disabled={idx === posts.length - 1}
                        className="px-1.5 py-1 disabled:opacity-20 transition-colors"
                        style={{ color: t.faint }}
                        onMouseOver={e => (e.currentTarget.style.color = t.text)}
                        onMouseOut={e => (e.currentTarget.style.color = t.faint)}>↓</button>
                      <button type="button" onClick={() => removePost(post.id)}
                        className="px-1.5 py-1 ml-1 transition-colors"
                        style={{ color: t.faint }}
                        onMouseOver={e => (e.currentTarget.style.color = '#ff6b6b')}
                        onMouseOut={e => (e.currentTarget.style.color = t.faint)}>✕</button>
                    </div>
                  </div>

                  {/* Assets */}
                  <div className="flex gap-2 flex-wrap items-start">
                    {post.assets.map((asset, aIdx) => (
                      <div key={asset.id} className="shrink-0 flex flex-col items-center gap-1">
                        <div className="relative w-16 h-16 rounded-lg overflow-hidden"
                          style={{ backgroundColor: t.inputBg }}>
                          {asset.fileType === 'video'
                            ? asset.thumbnailDataUrl
                              // eslint-disable-next-line @next/next/no-img-element
                              ? <img src={asset.thumbnailDataUrl} alt="" className="w-full h-full object-cover" />
                              : <div className="w-full h-full flex items-center justify-center">
                                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6" style={{ color: t.subtext }}><path d="M8 5v14l11-7z" /></svg>
                                </div>
                            // eslint-disable-next-line @next/next/no-img-element
                            : <img src={asset.preview} alt="" className="w-full h-full object-cover" />
                          }
                          {aIdx === 0 && post.assets.length > 1 && (
                            <span className="absolute bottom-0 left-0 right-0 text-center text-white text-[9px] bg-black/60 py-0.5">cover</span>
                          )}
                          <button type="button" onClick={() => removeAsset(post.id, asset.id)}
                            className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 flex items-center justify-center text-white/80 hover:text-white text-[10px] leading-none">✕</button>
                        </div>
                        {asset.fileType === 'video' && (
                          <button type="button"
                            onClick={() => setThumbPicker({ postId: post.id, assetId: asset.id, src: asset.preview, current: asset.thumbnailDataUrl })}
                            className="w-16 text-[10px] py-0.5 rounded text-center transition-colors"
                            style={asset.thumbnailDataUrl ? { color: PINK } : { color: t.faint }}>
                            {asset.thumbnailDataUrl ? '✓ thumb' : '+ thumb'}
                          </button>
                        )}
                        <p className="text-[9px] text-center max-w-[64px] truncate" style={{ color: t.faint }}>{asset.file.name}</p>
                      </div>
                    ))}

                    {post.assets.length < 10 && (
                      <button type="button" onClick={() => addAssetsToPost(post.id)}
                        className="w-16 h-16 rounded-lg border border-dashed flex items-center justify-center transition-colors shrink-0"
                        style={{ borderColor: t.border, color: t.subtext }}>
                        <span className="text-xl leading-none">+</span>
                      </button>
                    )}
                  </div>

                  <div>
                    <p className="text-xs mb-1" style={{ color: t.faint }}>Scheduled date</p>
                    <input type="date" value={post.scheduledDate}
                      onChange={e => updatePost(post.id, 'scheduledDate', e.target.value)}
                      className="w-full rounded-lg px-3 py-1.5 text-sm focus:outline-none transition-colors"
                      style={{ backgroundColor: t.inputBg, border: `1px solid ${t.border}`, color: t.text, colorScheme: dark ? 'dark' : 'light' }}
                      onFocus={e => (e.currentTarget.style.borderColor = PINK)}
                      onBlur={e => (e.currentTarget.style.borderColor = t.border)} />
                  </div>

                  <div>
                    <p className="text-xs mb-1.5" style={{ color: t.faint }}>Platforms</p>
                    <PlatformPills selected={post.platforms} theme={t} onChange={v => updatePost(post.id, 'platforms', v)} />
                  </div>

                  <textarea value={post.caption} onChange={e => updatePost(post.id, 'caption', e.target.value)}
                    placeholder="Caption (optional)" rows={2}
                    className="w-full rounded-lg px-3 py-1.5 text-sm focus:outline-none transition-colors resize-none"
                    style={{ backgroundColor: t.inputBg, border: `1px solid ${t.border}`, color: t.text }}
                    onFocus={e => (e.currentTarget.style.borderColor = PINK)}
                    onBlur={e => (e.currentTarget.style.borderColor = t.border)} />
                </div>
              ))}
            </div>
          )}

          {/* Upload errors */}
          {uploadErrors.length > 0 && (
            <div className="rounded-xl p-4 space-y-1" style={{ backgroundColor: '#ff6b6b10', border: '1px solid #ff6b6b30' }}>
              <p className="text-xs font-semibold text-red-400 mb-2">Some files failed to upload:</p>
              {uploadErrors.map((e, i) => <p key={i} className="text-xs text-red-300/80">• {e}</p>)}
              <p className="text-xs mt-2" style={{ color: t.subtext }}>Check your Supabase Storage bucket&apos;s max file size setting, or compress large videos before uploading.</p>
              <button type="button" onClick={() => router.push('/admin')}
                className="mt-2 text-xs px-3 py-1.5 rounded-full transition-colors"
                style={{ border: `1px solid ${PINK}`, color: PINK }}>
                Go to admin (campaign was created)
              </button>
            </div>
          )}

          {/* Submit */}
          <div className="pt-2">
            {uploading ? (
              <div className="space-y-2">
                <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: t.inputBg }}>
                  <div className="h-full rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%`, backgroundColor: PINK }} />
                </div>
                <p className="text-xs text-center" style={{ color: t.subtext }}>{uploadStatus}</p>
              </div>
            ) : uploadErrors.length === 0 ? (
              <div className="flex gap-3">
                <button type="button" onClick={e => handleSubmit(e, true)}
                  disabled={!title.trim() || posts.length === 0}
                  className="flex-1 py-3 rounded-full font-semibold transition-opacity hover:opacity-80 disabled:opacity-30"
                  style={{ border: `1px solid ${t.border}`, color: t.subtext }}>
                  Save as Draft
                </button>
                <button type="submit" disabled={!title.trim() || posts.length === 0}
                  className="flex-1 py-3 rounded-full font-semibold text-black transition-opacity hover:opacity-80 disabled:opacity-30"
                  style={{ backgroundColor: PINK }}>
                  Publish ({posts.length} post{posts.length !== 1 ? 's' : ''})
                </button>
              </div>
            ) : null}
          </div>
        </form>
      </div>
    </div>
  )
}
