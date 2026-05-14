'use client'

import { useState } from 'react'
import { MediaCarousel, type CarouselAsset } from '@/components/MediaCarousel'

const PINK = '#f6a7d7'
type PostStatus = 'pending' | 'approved' | 'changes_requested'
type Tab = 'review' | 'grid'
type GridPlatform = 'Instagram' | 'TikTok'

type MockPost = {
  id: string
  assets: CarouselAsset[]
  caption: string
  platforms: string[]
  scheduled_date: string | null
  status: PostStatus
}

const MOCK_POSTS: MockPost[] = [
  {
    id: '1',
    assets: [
      { id: 'a1', file_url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80', file_type: 'image' },
    ],
    caption: "Golden hour hits different when you're this high up ✨\n\n#travel #mountains #adventure #goldenhour",
    platforms: ['Instagram', 'Facebook'],
    scheduled_date: '2025-05-20',
    status: 'pending',
  },
  {
    id: '2',
    assets: [
      { id: 'b1', file_url: 'https://images.unsplash.com/photo-1501854140801-50d01698950b?w=800&q=80', file_type: 'image' },
      { id: 'b2', file_url: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800&q=80', file_type: 'image' },
      { id: 'b3', file_url: 'https://images.unsplash.com/photo-1518020382113-a7e8fc38eac9?w=800&q=80', file_type: 'image' },
    ],
    caption: "Swipe to see our favourite spots from this month 🌿\n\nWhere would you go first? Drop a number below 👇",
    platforms: ['Instagram'],
    scheduled_date: '2025-05-22',
    status: 'pending',
  },
  {
    id: '3',
    assets: [
      { id: 'c1', file_url: 'https://images.unsplash.com/photo-1518173946687-a4c8892bbd9f?w=800&q=80', file_type: 'image' },
    ],
    caption: "New season, new energy 🌸",
    platforms: ['TikTok', 'Instagram'],
    scheduled_date: '2025-05-18',
    status: 'pending',
  },
  {
    id: '4',
    assets: [
      { id: 'd1', file_url: 'https://images.unsplash.com/photo-1470770903676-69b98201ea1c?w=800&q=80', file_type: 'image' },
      { id: 'd2', file_url: 'https://images.unsplash.com/photo-1433086966358-54859d0ed716?w=800&q=80', file_type: 'image' },
    ],
    caption: "Before & after — the light changes everything 📸",
    platforms: ['TikTok'],
    scheduled_date: '2025-05-15',
    status: 'pending',
  },
]

type Theme = { bg: string; border: string; text: string; subtext: string; faint: string; inputBg: string; mediaBg: string; logo: string; dark: boolean }

function makeTheme(dark: boolean): Theme {
  return dark
    ? { bg: '#000', border: 'rgba(255,255,255,0.08)', text: '#fff', subtext: 'rgba(255,255,255,0.5)', faint: 'rgba(255,255,255,0.2)', inputBg: 'rgba(255,255,255,0.05)', mediaBg: '#0a0a0a', logo: '/WHITE_PINK.png', dark: true }
    : { bg: '#fff', border: 'rgba(0,0,0,0.08)', text: '#000', subtext: 'rgba(0,0,0,0.5)', faint: 'rgba(0,0,0,0.25)', inputBg: 'rgba(0,0,0,0.03)', mediaBg: '#f0f0f0', logo: '/BLACK_PINK.png', dark: false }
}

function formatDate(d: string | null) {
  if (!d) return null
  return new Date(d + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

function GridPreview({ posts, theme }: { posts: MockPost[]; theme: Theme }) {
  const [platform, setPlatform] = useState<GridPlatform>('Instagram')

  const filtered = posts
    .filter(p => p.platforms.includes(platform))
    .sort((a, b) => {
      if (!a.scheduled_date && !b.scheduled_date) return 0
      if (!a.scheduled_date) return 1
      if (!b.scheduled_date) return -1
      return new Date(b.scheduled_date).getTime() - new Date(a.scheduled_date).getTime()
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
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={cover.file_url} alt="" className="w-full h-full object-cover" />
                  <div className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full shadow" style={{
                    backgroundColor: post.status === 'approved' ? PINK : post.status === 'changes_requested' ? '#ff6b6b' : 'rgba(255,255,255,0.5)'
                  }} />
                </div>
                {post.scheduled_date && (
                  <p className="text-center mt-1 text-xs" style={{ color: theme.faint }}>{formatDate(post.scheduled_date)}</p>
                )}
              </div>
            )
          })}
        </div>
      )}
      {filtered.length > 0 && (
        <p className="text-xs text-center" style={{ color: theme.faint }}>
          {filtered.length} post{filtered.length !== 1 ? 's' : ''} · sorted newest first
        </p>
      )}
    </div>
  )
}

export default function DemoPage() {
  const [statuses, setStatuses] = useState<Record<string, PostStatus>>({ '1': 'pending', '2': 'pending', '3': 'pending', '4': 'pending' })
  const [feedback, setFeedback] = useState<Record<string, string>>({ '1': '', '2': '', '3': '', '4': '' })
  const [tab, setTab] = useState<Tab>('review')
  const [dark, setDark] = useState(true)

  const theme = makeTheme(dark)
  const posts = MOCK_POSTS.map(p => ({ ...p, status: statuses[p.id] }))
  const allDone = posts.every(p => p.status !== 'pending')
  const allApproved = posts.every(p => p.status === 'approved')

  return (
    <div className="min-h-screen transition-colors duration-300" style={{ backgroundColor: theme.bg }}>
      {/* Top bar */}
      <div className="sticky top-0 z-20 px-4 py-3 backdrop-blur-xl" style={{ backgroundColor: dark ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.85)', borderBottom: `1px solid ${theme.border}` }}>
        <div className="max-w-xl mx-auto flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate" style={{ color: theme.text }}>May Content — Acme Co</p>
            <p className="text-xs" style={{ color: theme.faint }}>Review & approve</p>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={theme.logo} alt="The Break Digital" className="h-7 w-auto shrink-0 object-contain" />
          <button onClick={() => setDark(d => !d)} className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors" style={{ backgroundColor: theme.inputBg, border: `1px solid ${theme.border}` }}>
            {dark
              ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4" style={{ color: theme.subtext }}><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
              : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4" style={{ color: theme.subtext }}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            }
          </button>
        </div>
        <div className="max-w-xl mx-auto flex gap-1 mt-3">
          {(['review', 'grid'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className="px-4 py-1.5 rounded-full text-xs font-medium transition-all"
              style={tab === t ? { backgroundColor: PINK, color: '#000' } : { color: theme.subtext }}>
              {t === 'review' ? 'Review' : 'Grid Preview'}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 py-8">
        <div className="text-center py-2 px-4 rounded-full text-xs mb-6 w-fit mx-auto" style={{ border: `1px solid ${theme.border}`, color: theme.faint }}>
          ✦ Demo preview
        </div>

        {tab === 'review' && (
          <div className="space-y-8">
            {posts.map((post, i) => {
              const isApproved = post.status === 'approved'
              const isChanges = post.status === 'changes_requested'
              const isDone = isApproved || isChanges
              return (
                <div key={post.id}>
                  <p className="text-xs mb-3 uppercase tracking-widest" style={{ color: theme.faint }}>Post {i + 1}</p>
                  <div className="rounded-3xl overflow-hidden" style={{ border: `1px solid ${isApproved ? '#f6a7d740' : isChanges ? '#ff6b6b40' : theme.border}` }}>
                    <MediaCarousel assets={post.assets} mediaBg={theme.mediaBg} />
                    <div className="p-5 space-y-3">
                      {post.scheduled_date && (
                        <p className="text-xs font-medium" style={{ color: PINK }}>📅 {formatDate(post.scheduled_date)}</p>
                      )}
                      <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: theme.subtext }}>{post.caption}</p>
                      {isApproved && (
                        <div className="flex items-center gap-2 text-sm font-medium py-2 px-4 rounded-full w-fit" style={{ backgroundColor: '#f6a7d720', color: PINK }}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4"><path d="M20 6L9 17l-5-5" /></svg>
                          Approved
                        </div>
                      )}
                      {isChanges && (
                        <div className="rounded-xl p-3 text-sm" style={{ backgroundColor: '#ff6b6b15', color: '#ff6b6b' }}>
                          <span className="font-medium">Changes requested</span>
                          {feedback[post.id] && <p className="mt-1 text-xs opacity-80">"{feedback[post.id]}"</p>}
                        </div>
                      )}
                      {!isDone && (
                        <div className="space-y-3 pt-1">
                          <textarea value={feedback[post.id]} onChange={e => setFeedback(f => ({ ...f, [post.id]: e.target.value }))}
                            placeholder="Feedback / change request (optional)" rows={2}
                            className="w-full rounded-xl px-4 py-2.5 text-sm focus:outline-none resize-none"
                            style={{ backgroundColor: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.text }} />
                          <div className="flex gap-3">
                            <button onClick={() => setStatuses(s => ({ ...s, [post.id]: 'approved' }))}
                              className="flex-1 py-3 rounded-full text-sm font-semibold text-black hover:opacity-80 transition-opacity"
                              style={{ backgroundColor: PINK }}>✓ Approve</button>
                            <button onClick={() => setStatuses(s => ({ ...s, [post.id]: 'changes_requested' }))}
                              className="flex-1 py-3 rounded-full text-sm font-semibold transition-colors"
                              style={{ border: `1px solid ${theme.border}`, color: theme.subtext }}>⚡ Request changes</button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
            {allDone && (
              <div className="rounded-3xl p-8 text-center" style={{ border: `1px solid ${allApproved ? '#f6a7d730' : '#ff6b6b30'}`, backgroundColor: allApproved ? '#f6a7d708' : '#ff6b6b08' }}>
                <div className="text-3xl mb-3">{allApproved ? '🎉' : '✍️'}</div>
                <h2 className="font-semibold text-lg mb-1" style={{ color: allApproved ? PINK : '#ff9999' }}>
                  {allApproved ? 'All approved!' : 'Review complete'}
                </h2>
                <p className="text-sm" style={{ color: theme.subtext }}>
                  {allApproved ? "You're all set. We'll get these scheduled." : "We've received your feedback and will make the changes."}
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
