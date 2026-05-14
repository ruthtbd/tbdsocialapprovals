'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type AssetDraft = {
  id: string
  file: File
  preview: string
  fileType: 'image' | 'video'
}

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

function PlatformPills({ selected, onChange }: { selected: string[]; onChange: (v: string[]) => void }) {
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
              ? { backgroundColor: '#f6a7d7', borderColor: '#f6a7d7', color: '#000' }
              : { backgroundColor: 'transparent', borderColor: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.4)' }
            }>
            {p}
          </button>
        )
      })}
    </div>
  )
}

export default function NewCampaignPage() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [clientName, setClientName] = useState('')
  const [posts, setPosts] = useState<PostDraft[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [dragOver, setDragOver] = useState(false)

  // Drop zone: each file → its own post
  function addFilesAsPosts(files: FileList | null) {
    if (!files) return
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

  // "Add to carousel" button on a specific post
  function addAssetsToPost(postId: string) {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.accept = 'image/*,video/*'
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

  function removePost(id: string) {
    setPosts(p => p.filter(x => x.id !== id))
  }

  function updatePost<K extends keyof PostDraft>(id: string, field: K, value: PostDraft[K]) {
    setPosts(p => p.map(x => x.id === id ? { ...x, [field]: value } : x))
  }

  function movePost(id: string, dir: -1 | 1) {
    setPosts(p => {
      const idx = p.findIndex(x => x.id === id)
      if (idx < 0) return p
      const next = idx + dir
      if (next < 0 || next >= p.length) return p
      const arr = [...p];
      [arr[idx], arr[next]] = [arr[next], arr[idx]]
      return arr
    })
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    addFilesAsPosts(e.dataTransfer.files)
  }, [])

  async function handleSubmit(e: React.FormEvent, asDraft = false) {
    e.preventDefault()
    if (!title.trim() || posts.length === 0) return
    setUploading(true)

    const token = generateToken()
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .insert({ title: title.trim(), client_name: clientName.trim() || null, token, status: asDraft ? 'draft' : 'active' })
      .select().single()

    if (campaignError || !campaign) {
      alert('Failed to create campaign: ' + campaignError?.message)
      setUploading(false)
      return
    }

    for (let i = 0; i < posts.length; i++) {
      const post = posts[i]
      setUploadProgress(Math.round((i / posts.length) * 100))

      // Create post record (no file_url — assets are separate)
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
        alert('Failed to create post: ' + postError?.message)
        continue
      }

      // Upload each asset
      for (let j = 0; j < post.assets.length; j++) {
        const asset = post.assets[j]
        const ext = asset.file.name.split('.').pop()
        const path = `${campaign.id}/${postRecord.id}/${asset.id}.${ext}`

        const { error: uploadError } = await supabase.storage
          .from('posts')
          .upload(path, asset.file, { cacheControl: '3600', upsert: false })

        if (uploadError) {
          alert(`Upload failed for ${asset.file.name}: ${uploadError.message}`)
          continue
        }

        const { data: { publicUrl } } = supabase.storage.from('posts').getPublicUrl(path)

        await supabase.from('post_assets').insert({
          post_id: postRecord.id,
          file_url: publicUrl,
          file_type: asset.fileType,
          position: j,
        })
      }
    }

    setUploadProgress(100)
    router.push(`/admin/campaign/${campaign.id}`)
  }

  return (
    <div className="min-h-screen bg-black p-6 md:p-10">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <button onClick={() => router.push('/admin')} className="text-white/40 hover:text-white transition-colors text-sm">← Back</button>
          <h1 className="text-xl font-bold" style={{ color: '#f6a7d7' }}>New Campaign</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Campaign info */}
          <div className="space-y-4">
            <div>
              <label className="text-xs uppercase tracking-widest text-white/40 mb-2 block">Campaign Title *</label>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. May Content" required
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-[#f6a7d7] transition-colors" />
            </div>
            <div>
              <label className="text-xs uppercase tracking-widest text-white/40 mb-2 block">Client Name</label>
              <input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="e.g. Acme Co"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-[#f6a7d7] transition-colors" />
            </div>
          </div>

          {/* Drop zone */}
          <div>
            <label className="text-xs uppercase tracking-widest text-white/40 mb-2 block">Posts *</label>
            <div
              onDrop={handleDrop}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => document.getElementById('file-input')?.click()}
              className="border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-colors"
              style={{ borderColor: dragOver ? '#f6a7d7' : 'rgba(255,255,255,0.1)' }}
            >
              <p className="text-white/40 text-sm">Drop files here, or <span style={{ color: '#f6a7d7' }}>click to browse</span></p>
              <p className="text-white/20 text-xs mt-1">Each file becomes its own post — add more files to a post to make a carousel</p>
              <input id="file-input" type="file" multiple accept="image/*,video/*" className="hidden"
                onChange={e => addFilesAsPosts(e.target.files)} />
            </div>
          </div>

          {/* Post list */}
          {posts.length > 0 && (
            <div className="space-y-5">
              {posts.map((post, idx) => (
                <div key={post.id} className="border border-white/10 rounded-2xl p-4 space-y-3">

                  {/* Top row: index + move + delete */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-white/30 uppercase tracking-widest">
                      Post {idx + 1}
                      {post.assets.length > 1 && (
                        <span className="ml-2 px-2 py-0.5 rounded-full text-xs" style={{ backgroundColor: '#f6a7d720', color: '#f6a7d7' }}>
                          Carousel · {post.assets.length}
                        </span>
                      )}
                    </span>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => movePost(post.id, -1)} disabled={idx === 0} className="text-white/30 hover:text-white disabled:opacity-20 px-1.5 py-1">↑</button>
                      <button type="button" onClick={() => movePost(post.id, 1)} disabled={idx === posts.length - 1} className="text-white/30 hover:text-white disabled:opacity-20 px-1.5 py-1">↓</button>
                      <button type="button" onClick={() => removePost(post.id)} className="text-white/30 hover:text-red-400 px-1.5 py-1 ml-1">✕</button>
                    </div>
                  </div>

                  {/* Asset thumbnails */}
                  <div className="flex gap-2 flex-wrap">
                    {post.assets.map((asset, aIdx) => (
                      <div key={asset.id} className="relative w-16 h-16 rounded-lg overflow-hidden bg-white/5 shrink-0">
                        {asset.fileType === 'video'
                          ? <video src={asset.preview} className="w-full h-full object-cover" muted />
                          // eslint-disable-next-line @next/next/no-img-element
                          : <img src={asset.preview} alt="" className="w-full h-full object-cover" />
                        }
                        {aIdx === 0 && post.assets.length > 1 && (
                          <span className="absolute bottom-0 left-0 right-0 text-center text-white text-[9px] bg-black/60 py-0.5">cover</span>
                        )}
                        {asset.fileType === 'video' && (
                          <div className="absolute top-1 left-1">
                            <svg viewBox="0 0 24 24" fill="white" className="w-3 h-3"><path d="M8 5v14l11-7z" /></svg>
                          </div>
                        )}
                        <button type="button" onClick={() => removeAsset(post.id, asset.id)}
                          className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 flex items-center justify-center text-white/80 hover:text-white text-[10px] leading-none">
                          ✕
                        </button>
                      </div>
                    ))}

                    {/* Add more to carousel */}
                    {post.assets.length < 5 && (
                      <button type="button" onClick={() => addAssetsToPost(post.id)}
                        className="w-16 h-16 rounded-lg border border-dashed flex items-center justify-center transition-colors shrink-0"
                        style={{ borderColor: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.3)' }}
                        title="Add more assets (carousel)">
                        <span className="text-xl leading-none">+</span>
                      </button>
                    )}
                  </div>

                  {/* Date */}
                  <div>
                    <p className="text-xs text-white/20 mb-1">Scheduled date</p>
                    <input type="date" value={post.scheduledDate}
                      onChange={e => updatePost(post.id, 'scheduledDate', e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[#f6a7d7] transition-colors"
                      style={{ colorScheme: 'dark' }} />
                  </div>

                  {/* Platforms */}
                  <div>
                    <p className="text-xs text-white/20 mb-1.5">Platforms</p>
                    <PlatformPills selected={post.platforms} onChange={v => updatePost(post.id, 'platforms', v)} />
                  </div>

                  {/* Caption */}
                  <textarea value={post.caption} onChange={e => updatePost(post.id, 'caption', e.target.value)}
                    placeholder="Caption (optional)" rows={2}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-[#f6a7d7] transition-colors resize-none" />
                </div>
              ))}
            </div>
          )}

          {/* Submit */}
          <div className="pt-2">
            {uploading ? (
              <div className="space-y-2">
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${uploadProgress}%`, backgroundColor: '#f6a7d7' }} />
                </div>
                <p className="text-white/40 text-xs text-center">Uploading... {uploadProgress}%</p>
              </div>
            ) : (
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={e => handleSubmit(e, true)}
                  disabled={!title.trim() || posts.length === 0}
                  className="flex-1 py-3 rounded-full font-semibold transition-opacity hover:opacity-80 disabled:opacity-30"
                  style={{ border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.5)' }}>
                  Save as Draft
                </button>
                <button
                  type="submit"
                  disabled={!title.trim() || posts.length === 0}
                  className="flex-1 py-3 rounded-full font-semibold text-black transition-opacity hover:opacity-80 disabled:opacity-30"
                  style={{ backgroundColor: '#f6a7d7' }}>
                  Publish ({posts.length} post{posts.length !== 1 ? 's' : ''})
                </button>
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
