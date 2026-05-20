'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase, parsePlatforms, fetchPostsWithAssets, type Campaign, type PostWithAssets } from '@/lib/supabase'
import { MediaCarousel } from '@/components/MediaCarousel'

type PostWithUI = PostWithAssets & { feedbackDraft: string; submitting: boolean }
type Tab = 'review' | 'grid'
type GridPlatform = 'Instagram' | 'TikTok'

const PINK = '#f6a7d7'

type Theme = { bg: string; card: string; border: string; text: string; subtext: string; faint: string; inputBg: string; mediaBg: string; logo: string; dark: boolean }

function makeTheme(dark: boolean): Theme {
  return dark
    ? { bg: '#000', card: '#0d0d0d', border: 'rgba(255,255,255,0.08)', text: '#fff', subtext: 'rgba(255,255,255,0.5)', faint: 'rgba(255,255,255,0.2)', inputBg: 'rgba(255,255,255,0.05)', mediaBg: '#0a0a0a', logo: '/WHITE_PINK.png', dark: true }
    : { bg: '#fff', card: '#f9f9f9', border: 'rgba(0,0,0,0.08)', text: '#000', subtext: 'rgba(0,0,0,0.5)', faint: 'rgba(0,0,0,0.25)', inputBg: 'rgba(0,0,0,0.03)', mediaBg: '#f0f0f0', logo: '/BLACK_PINK.png', dark: false }
}

function formatDate(d: string | null) {
  if (!d) return null
  return new Date(d + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

function PostCard({ post, theme, onApprove, onRequestChanges, onReject, onUndo, onFeedbackChange }: {
  post: PostWithUI; theme: Theme
  onApprove: () => void; onRequestChanges: () => void; onReject: () => void; onUndo: () => void; onFeedbackChange: (v: string) => void
}) {
  const [needsFeedback, setNeedsFeedback] = useState(false)
  const isApproved = post.status === 'approved'
  const isChanges = post.status === 'changes_requested'
  const isRejected = post.status === 'rejected'
  const isDone = isApproved || isChanges || isRejected

  function handleChanges() {
    if (!post.feedbackDraft.trim()) { setNeedsFeedback(true); return }
    setNeedsFeedback(false)
    onRequestChanges()
  }

  function handleReject() {
    if (!post.feedbackDraft.trim()) { setNeedsFeedback(true); return }
    setNeedsFeedback(false)
    onReject()
  }

  return (
    <div className="rounded-3xl overflow-hidden transition-all" style={{
      border: `1px solid ${isApproved ? '#f6a7d740' : (isChanges || isRejected) ? '#ff6b6b40' : theme.border}`,
    }}>
      <div style={{ backgroundColor: theme.mediaBg }}>
        <MediaCarousel assets={post.assets} mediaBg={theme.mediaBg} />
      </div>

      <div className="p-5 space-y-3">
        {post.scheduled_date && (
          <p className="text-xs font-medium" style={{ color: PINK }}>📅 {formatDate(post.scheduled_date)}</p>
        )}
        {post.caption && (
          <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: theme.text }}>{post.caption}</p>
        )}

        {isApproved && (
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-medium py-2 px-4 rounded-full" style={{ backgroundColor: '#f6a7d720', color: PINK }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4"><path d="M20 6L9 17l-5-5" /></svg>
              Approved
            </div>
            <button onClick={onUndo} disabled={post.submitting}
              className="text-xs px-3 py-1.5 rounded-full transition-colors disabled:opacity-40"
              style={{ border: `1px solid ${theme.border}`, color: theme.faint }}>
              Undo
            </button>
          </div>
        )}
        {isChanges && (
          <div className="space-y-2">
            <div className="rounded-xl p-3 text-sm" style={{ backgroundColor: '#ff6b6b15', color: '#ff6b6b' }}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">Changes requested</span>
                <button onClick={onUndo} disabled={post.submitting}
                  className="text-xs px-3 py-1 rounded-full transition-colors disabled:opacity-40 shrink-0"
                  style={{ border: '1px solid rgba(255,107,107,0.3)', color: 'rgba(255,107,107,0.6)' }}>
                  Undo
                </button>
              </div>
              {post.feedback && <p className="mt-1 text-xs opacity-80">"{post.feedback}"</p>}
            </div>
          </div>
        )}
        {isRejected && (
          <div className="space-y-2">
            <div className="rounded-xl p-3 text-sm" style={{ backgroundColor: '#ff3b3b15', color: '#ff6b6b' }}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">Rejected</span>
                <button onClick={onUndo} disabled={post.submitting}
                  className="text-xs px-3 py-1 rounded-full transition-colors disabled:opacity-40 shrink-0"
                  style={{ border: '1px solid rgba(255,107,107,0.3)', color: 'rgba(255,107,107,0.6)' }}>
                  Undo
                </button>
              </div>
              {post.feedback && <p className="mt-1 text-xs opacity-80">"{post.feedback}"</p>}
            </div>
          </div>
        )}

        {!isDone && (
          <div className="space-y-3 pt-1">
            <div>
              <textarea value={post.feedbackDraft}
                onChange={e => { onFeedbackChange(e.target.value); if (e.target.value.trim()) setNeedsFeedback(false) }}
                placeholder="Feedback (optional for approval, required for changes/reject)"
                rows={2}
                className="w-full rounded-xl px-4 py-2.5 text-sm focus:outline-none resize-none transition-colors"
                style={{ backgroundColor: theme.inputBg, border: `1px solid ${needsFeedback ? '#ff6b6b80' : theme.border}`, color: theme.text }} />
              {needsFeedback && (
                <p className="text-xs mt-1 px-1" style={{ color: '#ff6b6b' }}>Please describe what needs changing.</p>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={onApprove} disabled={post.submitting}
                className="flex-1 py-3 rounded-full text-sm font-semibold text-black transition-opacity hover:opacity-80 disabled:opacity-40"
                style={{ backgroundColor: PINK }}>
                {post.submitting ? '...' : '✓ Approve'}
              </button>
              <button onClick={handleChanges} disabled={post.submitting}
                className="flex-1 py-3 rounded-full text-sm font-semibold transition-opacity hover:opacity-80 disabled:opacity-40"
                style={{ backgroundColor: theme.dark ? '#ffffff' : '#000000', color: theme.dark ? '#000' : '#fff' }}>
                {post.submitting ? '...' : '⚡ Changes'}
              </button>
              <button onClick={handleReject} disabled={post.submitting}
                className="flex-1 py-3 rounded-full text-sm font-semibold transition-colors disabled:opacity-40"
                style={{ border: '1px solid rgba(255,59,59,0.4)', color: '#ff6b6b' }}>
                {post.submitting ? '...' : '✕ Reject'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function GridPreview({ posts, theme }: { posts: PostWithUI[]; theme: Theme }) {
  const defaultPlatform: GridPlatform = (() => {
    const ig = posts.filter(p => parsePlatforms(p.platform).includes('Instagram')).length
    const tt = posts.filter(p => parsePlatforms(p.platform).includes('TikTok')).length
    return tt > ig ? 'TikTok' : 'Instagram'
  })()
  const [platform, setPlatform] = useState<GridPlatform>(defaultPlatform)

  const filtered = posts
    .filter(p => {
      const platforms = parsePlatforms(p.platform)
      // Posts with no platform assigned appear in all grids
      return platforms.length === 0 || platforms.includes(platform)
    })
    .sort((a, b) => {
      if (!a.scheduled_date && !b.scheduled_date) return 0
      if (!a.scheduled_date) return 1
      if (!b.scheduled_date) return -1
      return new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime()
    })

  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        {(['Instagram', 'TikTok'] as GridPlatform[]).map(p => (
          <button key={p} onClick={() => setPlatform(p)}
            className="px-5 py-2 rounded-full text-sm font-medium transition-all"
            style={platform === p
              ? { backgroundColor: PINK, color: '#000' }
              : { backgroundColor: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.subtext }
            }>
            {p === 'Instagram' ? '◻ Instagram' : '▷ TikTok'}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="py-16 text-center rounded-2xl" style={{ border: `1px dashed ${theme.border}` }}>
          <p style={{ color: theme.subtext }} className="text-sm">No posts assigned to {platform}</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1">
          {filtered.map(post => {
            const cover = post.assets[0]
            const isCarousel = post.assets.length > 1
            return (
              <div key={post.id} className="relative">
                <div className="aspect-[3/4] overflow-hidden rounded-sm relative" style={{ backgroundColor: theme.mediaBg }}>
                  {cover ? (
                    cover.file_type === 'video'
                      // eslint-disable-next-line @next/next/no-img-element
                      ? cover.thumbnail_url ? <img src={cover.thumbnail_url} alt="" className="w-full h-full object-cover" /> : <video src={cover.file_url} className="w-full h-full object-cover" muted playsInline preload="metadata" />
                      // eslint-disable-next-line @next/next/no-img-element
                      : <img src={cover.file_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center" style={{ color: theme.faint }}>?</div>
                  )}
                  <div className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full shadow" style={{
                    backgroundColor: post.status === 'approved' ? PINK : (post.status === 'changes_requested' || post.status === 'rejected') ? '#ff6b6b' : theme.faint
                  }} />
                  {!isCarousel && cover?.file_type === 'video' && (
                    <div className="absolute bottom-1.5 left-1.5">
                      <svg viewBox="0 0 24 24" fill="white" className="w-3.5 h-3.5 drop-shadow"><path d="M8 5v14l11-7z" /></svg>
                    </div>
                  )}
                </div>
                {post.scheduled_date && (
                  <p className="text-center mt-1 text-xs" style={{ color: theme.faint }}>{formatDate(post.scheduled_date)}</p>
                )}
              </div>
            )
          })}
          {/* Pad to at least 9 cells */}
          {Array.from({ length: Math.max(0, 9 - filtered.length) }).map((_, i) => (
            <div key={`pad-${i}`} className="relative">
              <div className="aspect-[3/4] rounded-sm" style={{ backgroundColor: theme.mediaBg, border: `1px solid ${theme.border}` }} />
            </div>
          ))}
        </div>
      )}

      {filtered.length > 0 && (
        <p className="text-xs text-center" style={{ color: theme.faint }}>
          {filtered.length} post{filtered.length !== 1 ? 's' : ''} · oldest first
        </p>
      )}
    </div>
  )
}

export default function ReviewPage() {
  const { token } = useParams<{ token: string }>()
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [posts, setPosts] = useState<PostWithUI[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [tab, setTab] = useState<Tab>('review')
  const [dark, setDark] = useState(false)

  const theme = makeTheme(dark)

  useEffect(() => {
    if (!token) return
    supabase.from('campaigns').select('*').eq('token', token).single()
      .then(async ({ data: c, error }) => {
        if (error || !c) { setNotFound(true); setLoading(false); return }
        setCampaign(c)
        const enriched = await fetchPostsWithAssets(c.id)
        setPosts(enriched.map(x => ({ ...x, feedbackDraft: '', submitting: false })))
        setLoading(false)
      })
  }, [token])

  async function updatePost(postId: string, status: 'approved' | 'changes_requested' | 'rejected' | 'pending', feedback: string) {
    setPosts(p => p.map(x => x.id === postId ? { ...x, submitting: true } : x))
    await supabase.from('posts').update({ status, feedback: feedback || null }).eq('id', postId)
    setPosts(p => p.map(x => x.id === postId ? { ...x, status, feedback: feedback || null, submitting: false } : x))
  }

  const allDone = posts.length > 0 && posts.every(p => p.status !== 'pending')
  const allApproved = posts.length > 0 && posts.every(p => p.status === 'approved')
  const anyRejected = posts.some(p => p.status === 'rejected')

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: theme.bg }}>
      <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: PINK, borderTopColor: 'transparent' }} />
    </div>
  )

  if (notFound || !campaign) return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: theme.bg }}>
      <p style={{ color: theme.subtext }}>This review link is invalid or has expired.</p>
    </div>
  )

  if (campaign.status === 'draft') return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 gap-3" style={{ backgroundColor: theme.bg }}>
      <div className="text-3xl">🚧</div>
      <p className="font-semibold" style={{ color: theme.text }}>Not ready yet</p>
      <p className="text-sm text-center max-w-xs" style={{ color: theme.subtext }}>
        This campaign is still being prepared. Check back soon.
      </p>
    </div>
  )

  return (
    <div className="min-h-screen transition-colors duration-300" style={{ backgroundColor: theme.bg }}>
      {/* Top bar */}
      <div className="sticky top-0 z-20 px-4 py-3 backdrop-blur-xl" style={{ backgroundColor: dark ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.85)', borderBottom: `1px solid ${theme.border}` }}>
        <div className="max-w-xl mx-auto flex items-center justify-between gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={theme.logo} alt="The Break Digital" className="h-7 w-auto shrink-0 object-contain" />
          <div className="flex gap-1">
            {(['review', 'grid'] as Tab[]).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className="px-4 py-1.5 rounded-full text-xs font-medium transition-all"
                style={tab === t ? { backgroundColor: PINK, color: '#000' } : { color: theme.subtext }}>
                {t === 'review' ? 'Review' : 'Grid Preview'}
              </button>
            ))}
          </div>
          <button onClick={() => setDark(d => !d)} className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors" style={{ backgroundColor: theme.inputBg, border: `1px solid ${theme.border}` }}>
            {dark
              ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4" style={{ color: theme.subtext }}><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
              : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4" style={{ color: theme.subtext }}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            }
          </button>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 py-8">
        {/* Campaign title */}
        <div className="mb-8 pb-7" style={{ borderBottom: `1px solid ${theme.border}` }}>
          <p className="text-xs uppercase tracking-widest mb-3" style={{ color: theme.faint, fontFamily: "'Futura', 'Century Gothic', 'Trebuchet MS', sans-serif", letterSpacing: '0.12em' }}>
            Review &amp; approve
          </p>
          <h1 className="font-bold leading-tight" style={{
            fontSize: 'clamp(1.75rem, 6vw, 2.5rem)',
            color: theme.text,
            fontFamily: "'Futura', 'Century Gothic', 'Trebuchet MS', sans-serif",
          }}>
            {campaign.title}
          </h1>
          {campaign.client_name && (
            <p className="text-sm mt-2" style={{ color: theme.faint }}>{campaign.client_name}</p>
          )}
        </div>

        {tab === 'review' && (
          <div className="space-y-8">
            {[...posts].sort((a, b) => {
              if (!a.scheduled_date && !b.scheduled_date) return 0
              if (!a.scheduled_date) return 1
              if (!b.scheduled_date) return -1
              return new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime()
            }).map((post, i) => (
              <div key={post.id}>
                <p className="text-xs mb-3 uppercase tracking-widest" style={{ color: theme.faint }}>Post {i + 1}</p>
                <PostCard post={post} theme={theme}
                  onApprove={() => updatePost(post.id, 'approved', post.feedbackDraft)}
                  onRequestChanges={() => updatePost(post.id, 'changes_requested', post.feedbackDraft)}
                  onReject={() => updatePost(post.id, 'rejected', post.feedbackDraft)}
                  onUndo={() => updatePost(post.id, 'pending', '')}
                  onFeedbackChange={v => setPosts(p => p.map(x => x.id === post.id ? { ...x, feedbackDraft: v } : x))} />
              </div>
            ))}
            {allDone && (
              <div className="rounded-3xl p-8 text-center" style={{ border: `1px solid ${allApproved ? '#f6a7d730' : '#ff6b6b30'}`, backgroundColor: allApproved ? '#f6a7d708' : '#ff6b6b08' }}>
                <div className="text-3xl mb-3">{allApproved ? '🎉' : anyRejected ? '🚫' : '✍️'}</div>
                <h2 className="font-semibold text-lg mb-1" style={{ color: allApproved ? PINK : '#ff9999' }}>
                  {allApproved ? 'All approved!' : 'Review complete'}
                </h2>
                <p className="text-sm" style={{ color: theme.subtext }}>
                  {allApproved ? "You're all set. We'll get these scheduled." : "We've received your feedback and will be in touch."}
                </p>
              </div>
            )}
          </div>
        )}
        {tab === 'grid' && <GridPreview posts={posts} theme={theme} />}
      </div>
    </div>
  )
}
