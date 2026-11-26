'use client'

// Per-reviewer, per-campaign approval. Requires a logged-in Supabase Auth session
// whose email matches a reviewers row for this campaign. Each reviewer's approval is
// tracked separately in post_reviews; the post's own `status` is updated to the
// aggregate ("approved" only when every assigned reviewer has approved; "changes_requested"
// or "rejected" as soon as any reviewer sets that).

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase, parsePlatforms, fetchPostsWithAssets, type Campaign, type PostWithAssets, type PostStatus } from '@/lib/supabase'
import { MediaCarousel } from '@/components/MediaCarousel'

const PINK = '#f6a7d7'

type PostUI = PostWithAssets & { myStatus: PostStatus | null; myFeedback: string | null; feedbackDraft: string; submitting: boolean }

function formatDate(d: string | null) {
  if (!d) return null
  return new Date(d + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

function PlatformChip({ name }: { name: string }) {
  const IG = '#e0308c'
  const style = name === 'Instagram'
    ? { backgroundColor: `${IG}15`, color: IG, border: `1px solid ${IG}40` }
    : name === 'TikTok'
      ? { backgroundColor: '#00000010', color: '#000', border: '1px solid rgba(0,0,0,0.3)' }
      : { backgroundColor: 'rgba(0,0,0,0.05)', color: '#666', border: '1px solid rgba(0,0,0,0.1)' }
  return (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide" style={style}>
      {name === 'Instagram' ? 'IG' : name === 'TikTok' ? 'TT' : name}
    </span>
  )
}

export default function ReviewerCampaignPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [posts, setPosts] = useState<PostUI[]>([])
  const [reviewerId, setReviewerId] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    (async () => {
      const { data: s } = await supabase.auth.getSession()
      if (!s.session?.user?.email) { router.replace('/review'); return }
      const myEmail = s.session.user.email.toLowerCase()
      setUserEmail(myEmail)

      // Check this user is actually assigned to this campaign
      const { data: revs } = await supabase.from('reviewers').select('id').eq('campaign_id', id).ilike('email', myEmail).maybeSingle()
      if (!revs) { setError('You are not assigned to this campaign. Ask the admin to add you.'); setLoading(false); return }
      setReviewerId(revs.id)

      const { data: c } = await supabase.from('campaigns').select('*').eq('id', id).single()
      if (!c) { setError('Campaign not found.'); setLoading(false); return }
      setCampaign(c)

      const all = await fetchPostsWithAssets(id)
      const { data: myReviews } = await supabase.from('post_reviews').select('post_id, status, feedback').eq('reviewer_id', revs.id)
      const map = new Map((myReviews || []).map(r => [r.post_id as string, r]))
      setPosts(all.map(p => {
        const r = map.get(p.id) as { status: PostStatus | null; feedback: string | null } | undefined
        return { ...p, myStatus: r?.status ?? null, myFeedback: r?.feedback ?? null, feedbackDraft: r?.feedback ?? '', submitting: false }
      }))
      setLoading(false)
    })()
  }, [id, router])

  async function setMyStatus(postId: string, status: PostStatus | null, feedback: string) {
    if (!reviewerId || !campaign) return
    setPosts(p => p.map(x => x.id === postId ? { ...x, submitting: true } : x))

    // Upsert this reviewer's row — the DB trigger recompute_post_status() aggregates
    // across all reviewers and sets posts.status accordingly. Reviewers don't have
    // UPDATE rights on posts, so this must happen server-side.
    await supabase.from('post_reviews').upsert({
      post_id: postId, reviewer_id: reviewerId, status, feedback: feedback || null, updated_at: new Date().toISOString(),
    }, { onConflict: 'post_id,reviewer_id' })

    // Fire email notification for admin
    if (status) {
      fetch('/api/notify-approval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, status, reviewerName: userEmail, feedback: feedback || null }),
      }).catch(() => {})
    }

    setPosts(p => p.map(x => x.id === postId ? { ...x, myStatus: status, myFeedback: feedback || null, submitting: false } : x))
  }

  if (loading) return <div className="min-h-screen p-10 text-sm" style={{ color: '#888' }}>Loading…</div>
  if (error) return <div className="min-h-screen p-10" style={{ color: '#000' }}>
    <Link href="/review" className="text-sm" style={{ color: PINK }}>← Back</Link>
    <p className="mt-6 text-sm">{error}</p>
  </div>
  if (!campaign) return null

  const outstanding = posts.filter(p => p.myStatus === null || p.myStatus === 'changes_requested' || p.myStatus === 'rejected').length

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#fff', color: '#000' }}>
      <div className="max-w-xl mx-auto p-6 md:p-10">
        <div className="flex items-center justify-between mb-2">
          <Link href="/review" className="text-sm" style={{ color: '#888' }}>← All campaigns</Link>
          <span className="text-xs" style={{ color: '#888' }}>Signed in as {userEmail}</span>
        </div>
        <h1 className="text-2xl font-bold mb-1" style={{ color: PINK }}>{campaign.title}</h1>
        {campaign.client_name && <p className="text-sm mb-6" style={{ color: '#666' }}>{campaign.client_name}</p>}

        <div className="mb-6 rounded-2xl p-4 text-sm" style={{ backgroundColor: `${PINK}10`, border: `1px solid ${PINK}40` }}>
          <strong>{outstanding}</strong> of {posts.length} posts still need your review.
        </div>

        <div className="space-y-6">
          {posts.map((post, i) => {
            const isApproved = post.myStatus === 'approved'
            const isChanges = post.myStatus === 'changes_requested'
            const isRejected = post.myStatus === 'rejected'
            const platforms = parsePlatforms(post.platform)
            return (
              <div key={post.id} className="rounded-3xl overflow-hidden" style={{ border: `1px solid ${isApproved ? `${PINK}40` : (isChanges || isRejected) ? '#ff6b6b40' : 'rgba(0,0,0,0.1)'}` }}>
                <p className="text-xs px-5 pt-4 uppercase tracking-widest" style={{ color: '#888' }}>Post {i + 1}</p>
                <div style={{ backgroundColor: '#f8f8f8' }}>
                  <MediaCarousel assets={post.assets} mediaBg="#f8f8f8" />
                </div>
                <div className="p-5 space-y-3">
                  {platforms.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">{platforms.map(p => <PlatformChip key={p} name={p} />)}</div>
                  )}
                  {post.scheduled_date && (
                    <p className="text-xs font-medium" style={{ color: PINK }}>📅 {formatDate(post.scheduled_date)}</p>
                  )}
                  {post.caption && (
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{post.caption}</p>
                  )}

                  {isApproved ? (
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium py-2 px-4 rounded-full" style={{ backgroundColor: `${PINK}20`, color: PINK }}>✓ You approved</div>
                      <button onClick={() => setMyStatus(post.id, null, '')} disabled={post.submitting}
                        className="text-xs px-3 py-1.5 rounded-full" style={{ border: '1px solid rgba(0,0,0,0.1)', color: '#888' }}>Undo</button>
                    </div>
                  ) : (
                    <>
                      <textarea value={post.feedbackDraft}
                        onChange={e => setPosts(p => p.map(x => x.id === post.id ? { ...x, feedbackDraft: e.target.value } : x))}
                        placeholder="Add a note (required for changes or rejection)"
                        rows={2}
                        className="w-full rounded-xl px-4 py-2.5 text-sm focus:outline-none"
                        style={{ backgroundColor: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.1)' }} />
                      <div className="flex gap-2 flex-wrap">
                        <button onClick={() => setMyStatus(post.id, 'approved', '')} disabled={post.submitting}
                          className="px-4 py-2 rounded-full text-sm font-semibold text-black transition-opacity"
                          style={{ backgroundColor: PINK }}>Approve</button>
                        <button onClick={() => {
                          if (!post.feedbackDraft.trim()) { alert('Please write a note so we know what to change.'); return }
                          setMyStatus(post.id, 'changes_requested', post.feedbackDraft)
                        }} disabled={post.submitting}
                          className="px-4 py-2 rounded-full text-sm font-medium"
                          style={{ border: '1px solid #ff6b6b40', color: '#ff6b6b' }}>Request changes</button>
                        <button onClick={() => {
                          if (!post.feedbackDraft.trim()) { alert('Please write a note explaining the rejection.'); return }
                          setMyStatus(post.id, 'rejected', post.feedbackDraft)
                        }} disabled={post.submitting}
                          className="px-4 py-2 rounded-full text-sm font-medium"
                          style={{ border: '1px solid #ff6b6b40', color: '#ff6b6b' }}>Reject</button>
                      </div>
                      {(isChanges || isRejected) && post.myFeedback && (
                        <p className="text-xs" style={{ color: '#ff6b6b' }}>Your note: &quot;{post.myFeedback}&quot;</p>
                      )}
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
