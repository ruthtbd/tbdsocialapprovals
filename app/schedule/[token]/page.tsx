'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase, parsePlatforms, fetchPostsWithAssets, type Campaign, type PostWithAssets } from '@/lib/supabase'
import { MediaCarousel } from '@/components/MediaCarousel'

const PINK = '#f6a7d7'
const IG = '#e0308c'
const TT = '#000'
const THEME = {
  bg: '#fff', card: '#fff', border: 'rgba(0,0,0,0.1)',
  text: '#000', subtext: '#444', faint: '#888', inputBg: 'rgba(0,0,0,0.03)', mediaBg: '#f8f8f8',
}

type Tab = 'feed' | 'grid'
type GridPlatform = 'Instagram' | 'TikTok'

function formatDay(d: Date) {
  return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
}
function formatWeek(start: Date, end: Date) {
  const sameMonth = start.getMonth() === end.getMonth()
  const s = start.toLocaleDateString('en-AU', { day: 'numeric', month: sameMonth ? undefined : 'short' })
  const e = end.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
  return `Week of ${s} – ${e}`
}
function formatDate(d: string | null) {
  if (!d) return null
  return new Date(d + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}
function startOfWeek(d: Date) {
  const day = d.getDay() // 0 = Sun
  const diff = day === 0 ? -6 : 1 - day // Monday as start of week
  const out = new Date(d)
  out.setDate(d.getDate() + diff)
  out.setHours(0, 0, 0, 0)
  return out
}
function isoDate(d: Date) { return d.toISOString().slice(0, 10) }

type ApprovedPost = PostWithAssets & { platformList: string[] }

function PlatformChip({ name }: { name: string }) {
  const style = name === 'Instagram'
    ? { backgroundColor: `${IG}15`, color: IG, border: `1px solid ${IG}40` }
    : name === 'TikTok'
      ? { backgroundColor: '#00000010', color: TT, border: `1px solid ${TT}30` }
      : { backgroundColor: 'rgba(0,0,0,0.05)', color: '#666', border: '1px solid rgba(0,0,0,0.1)' }
  return (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide" style={style}>
      {name === 'Instagram' ? 'IG' : name === 'TikTok' ? 'TT' : name}
    </span>
  )
}

function PostCard({ post }: { post: ApprovedPost }) {
  return (
    <div className="rounded-3xl overflow-hidden" style={{ border: `1px solid ${THEME.border}`, backgroundColor: THEME.card }}>
      <MediaCarousel assets={post.assets} mediaBg={THEME.mediaBg} />
      <div className="p-5 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {post.platformList.map(p => <PlatformChip key={p} name={p} />)}
        </div>
        {post.caption && (
          <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: THEME.text }}>{post.caption}</p>
        )}
      </div>
    </div>
  )
}

// Instagram-style 3-column grid preview, same look as the review page's Grid tab
function GridPreview({ posts, platform, setPlatform }: {
  posts: ApprovedPost[]; platform: GridPlatform; setPlatform: (p: GridPlatform) => void
}) {
  const theme = THEME
  const ig = posts.filter(p => p.platformList.includes('Instagram')).length
  const tt = posts.filter(p => p.platformList.includes('TikTok')).length

  const filtered = posts.filter(p => p.platformList.length === 0 || p.platformList.includes(platform))
    .slice()
    .sort((a, b) => {
      // Oldest first so newest posts appear at the top of the feed (Instagram convention)
      if (!a.scheduled_date && !b.scheduled_date) return 0
      if (!a.scheduled_date) return 1
      if (!b.scheduled_date) return -1
      return new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime()
    })

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(['Instagram', 'TikTok'] as GridPlatform[]).map(p => (
          <button key={p} onClick={() => setPlatform(p)}
            className="text-xs px-3 py-1.5 rounded-full font-medium transition-colors"
            style={platform === p
              ? { backgroundColor: `${PINK}18`, color: PINK, border: `1px solid ${PINK}40` }
              : { border: `1px solid ${theme.border}`, color: theme.faint }}>
            {p === 'Instagram' ? `📷 Instagram (${ig})` : `🎵 TikTok (${tt})`}
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
                      ? cover.thumbnail_url
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={cover.thumbnail_url} alt="" className="w-full h-full object-cover" style={{ objectPosition: `${cover.crop_x ?? 50}% ${cover.crop_y ?? 50}%` }} />
                        : <div className="w-full h-full flex items-center justify-center" style={{ color: theme.faint }}>🎥</div>
                      // eslint-disable-next-line @next/next/no-img-element
                      : <img src={cover.file_url} alt="" className="w-full h-full object-cover" style={{ objectPosition: `${cover.crop_x ?? 50}% ${cover.crop_y ?? 50}%` }} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center" style={{ color: theme.faint }}>?</div>
                  )}
                  {!isCarousel && cover?.file_type === 'video' && (
                    <div className="absolute bottom-1.5 left-1.5">
                      <svg viewBox="0 0 24 24" fill="white" className="w-3.5 h-3.5 drop-shadow"><path d="M8 5v14l11-7z" /></svg>
                    </div>
                  )}
                  {isCarousel && (
                    <div className="absolute top-1.5 right-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                      style={{ backgroundColor: 'rgba(0,0,0,0.55)', color: '#fff' }}>
                      {post.assets.length}
                    </div>
                  )}
                </div>
                {post.scheduled_date && (
                  <p className="text-center mt-1 text-xs" style={{ color: theme.faint }}>{formatDate(post.scheduled_date)}</p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function SchedulePage() {
  const { token } = useParams<{ token: string }>()
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [posts, setPosts] = useState<ApprovedPost[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [tab, setTab] = useState<Tab>('feed')
  const [gridPlatform, setGridPlatform] = useState<GridPlatform>('Instagram')
  const theme = THEME

  useEffect(() => {
    if (!token) return
    async function load() {
      // Schedule view now requires login. Check session first; if none, send to the sign-in flow.
      const { data: s } = await supabase.auth.getSession()
      if (!s.session?.user?.email) {
        if (typeof window !== 'undefined') window.location.href = '/review'
        return
      }
      const myEmail = s.session.user.email.toLowerCase()
      const isAdmin = (s.session.user.app_metadata as { is_admin?: boolean } | undefined)?.is_admin === true

      const { data: c } = await supabase.from('campaigns').select('*').eq('token', token).is('deleted_at', null).maybeSingle()
      if (!c) { setNotFound(true); setLoading(false); return }

      // Non-admins must be an assigned approver on this campaign
      if (!isAdmin) {
        const { data: me } = await supabase.from('reviewers').select('id').eq('campaign_id', c.id).ilike('email', myEmail).maybeSingle()
        if (!me) { setNotFound(true); setLoading(false); return }
      }

      setCampaign(c)
      const all = await fetchPostsWithAssets(c.id)
      const filtered: ApprovedPost[] = all
        .filter(p => p.status === 'approved')
        .map(p => ({ ...p, platformList: parsePlatforms(p.platform) }))
      setPosts(filtered)
      const ig = filtered.filter(p => p.platformList.includes('Instagram')).length
      const tt = filtered.filter(p => p.platformList.includes('TikTok')).length
      setGridPlatform(tt > ig ? 'TikTok' : 'Instagram')
      setLoading(false)
    }
    load()
  }, [token])

  if (loading) return <div className="min-h-screen p-10 text-sm" style={{ backgroundColor: theme.bg, color: theme.faint }}>Loading…</div>
  if (notFound) return <div className="min-h-screen p-10" style={{ backgroundColor: theme.bg, color: theme.text }}>Campaign not found.</div>
  if (!campaign) return null

  // Split into scheduled (has scheduled_date) and undated (no scheduled_date)
  const dated = posts.filter(p => p.scheduled_date)
  const undated = posts.filter(p => !p.scheduled_date)

  // Group scheduled posts by scheduled_date, then bucket into weeks (Mon start)
  const byDate = new Map<string, ApprovedPost[]>()
  for (const p of dated) {
    const key = p.scheduled_date!
    if (!byDate.has(key)) byDate.set(key, [])
    byDate.get(key)!.push(p)
  }
  const sortedDates = [...byDate.keys()].sort()
  const weekBuckets = new Map<string, { start: Date; end: Date; dates: string[] }>()
  for (const dateStr of sortedDates) {
    const d = new Date(dateStr + 'T00:00:00')
    const wStart = startOfWeek(d)
    const wEnd = new Date(wStart); wEnd.setDate(wStart.getDate() + 6)
    const key = isoDate(wStart)
    if (!weekBuckets.has(key)) weekBuckets.set(key, { start: wStart, end: wEnd, dates: [] })
    weekBuckets.get(key)!.dates.push(dateStr)
  }
  const weeks = [...weekBuckets.values()]

  return (
    <div className="min-h-screen" style={{ backgroundColor: theme.bg, color: theme.text }}>
      <div className="max-w-2xl mx-auto p-6 md:p-10">
        <header className="mb-6">
          <p className="text-xs uppercase tracking-widest" style={{ color: theme.faint }}>Approved content</p>
          <h1 className="text-2xl font-bold mt-1" style={{ color: PINK }}>{campaign.title}</h1>
          {campaign.client_name && <p className="text-sm mt-1" style={{ color: theme.subtext }}>{campaign.client_name}</p>}
          <a href="https://jetmgmt.box.com/s/aec049vdwg2n7t2m06o5wdw0gzrqmmgt"
            target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 mt-4 text-sm font-medium rounded-full px-4 py-2 transition-opacity hover:opacity-80"
            style={{ backgroundColor: `${PINK}18`, color: PINK, border: `1px solid ${PINK}40` }}>
            📁 Content library →
          </a>
        </header>

        {/* Feed / Grid tabs */}
        <div className="flex gap-2 mb-6">
          {(['feed', 'grid'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className="text-sm px-4 py-1.5 rounded-full font-medium transition-colors"
              style={tab === t
                ? { backgroundColor: PINK, color: '#000' }
                : { color: theme.subtext }}>
              {t === 'feed' ? 'Feed' : 'Grid preview'}
            </button>
          ))}
        </div>

        {posts.length === 0 ? (
          <div className="rounded-2xl p-10 text-center" style={{ border: `1px dashed ${theme.border}`, color: theme.faint }}>
            Nothing approved yet.
          </div>
        ) : tab === 'grid' ? (
          <GridPreview posts={posts} platform={gridPlatform} setPlatform={setGridPlatform} />
        ) : (
          <div className="space-y-12">
            {weeks.map(week => (
              <section key={week.start.toISOString()}>
                <h2 className="text-xs uppercase tracking-widest mb-4" style={{ color: theme.faint }}>
                  {formatWeek(week.start, week.end)}
                </h2>
                <div className="space-y-8">
                  {week.dates.map(dateStr => {
                    const dayPosts = byDate.get(dateStr)!
                    return (
                      <div key={dateStr}>
                        <p className="text-sm font-semibold mb-3" style={{ color: theme.text }}>
                          {formatDay(new Date(dateStr + 'T00:00:00'))}
                        </p>
                        <div className="space-y-6">
                          {dayPosts.map(post => <PostCard key={post.id} post={post} />)}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            ))}

            {undated.length > 0 && (
              <section>
                <h2 className="text-xs uppercase tracking-widest mb-4" style={{ color: theme.faint }}>No date set</h2>
                <div className="space-y-6">
                  {undated.map(post => <PostCard key={post.id} post={post} />)}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
