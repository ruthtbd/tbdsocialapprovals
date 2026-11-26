import { createBrowserClient } from '@supabase/ssr'
import { SupabaseClient } from '@supabase/supabase-js'

// createBrowserClient writes the auth session into a cookie the server can also read,
// so middleware and server components see the same signed-in user as the browser.
let _client: SupabaseClient | null = null

export function getSupabase() {
  if (!_client) {
    _client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  return _client
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    return getSupabase()[prop as keyof SupabaseClient]
  },
})

export type PostStatus = 'approved' | 'changes_requested' | 'rejected'

export type Campaign = {
  id: string
  title: string
  client_name: string | null
  token: string
  status: 'draft' | 'active'
  created_at: string
  approved_at: string | null
  deleted_at: string | null
}

// Post is now a container — files live in post_assets
// status: null = not yet reviewed
export type Post = {
  id: string
  campaign_id: string
  caption: string | null
  platform: string | null
  scheduled_date: string | null
  position: number
  status: PostStatus | null
  feedback: string | null
  scheduled_at: string | null
  deleted_at: string | null
  // Internal approval — client approves via /review, then an admin internally signs off.
  // Only posts with BOTH status='approved' AND internal_approved_at set are "fully approved".
  internal_approved_at: string | null
  internal_approved_by: string | null
  created_at: string
}

export type Reviewer = {
  id: string
  campaign_id: string
  name: string
  email: string | null
  token: string
  created_at: string
}

export type PostReview = {
  id: string
  post_id: string
  reviewer_id: string
  status: PostStatus | null
  feedback: string | null
  created_at: string
  updated_at: string
}

export type PostAsset = {
  id: string
  post_id: string
  file_url: string
  file_type: 'image' | 'video'
  thumbnail_url: string | null
  position: number
  crop_x: number | null  // % from left (0-100), null = 50 (center)
  crop_y: number | null  // % from top (0-100), null = 50 (center)
  created_at: string
}

// Post enriched with its assets (used everywhere outside admin list)
export type PostWithAssets = Post & { assets: PostAsset[] }

// Parse the platform field — handles JSON arrays and legacy plain strings
export function parsePlatforms(platform: string | null): string[] {
  if (!platform) return []
  try {
    const parsed = JSON.parse(platform)
    return Array.isArray(parsed) ? parsed : [platform]
  } catch {
    return [platform]
  }
}

// Generate a random URL-safe token
export function generateToken(): string {
  const bytes = new Uint8Array(18)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 24)
}

// Aggregate reviewer statuses: rejected > changes_requested > all-approved > null (still pending)
export function computeAggregateStatus(statuses: (PostStatus | null)[]): PostStatus | null {
  if (!statuses.length) return null
  if (statuses.includes('rejected')) return 'rejected'
  if (statuses.includes('changes_requested')) return 'changes_requested'
  if (statuses.every(s => s === 'approved')) return 'approved'
  return null
}

// Fetch posts + their assets for a campaign, return as PostWithAssets[]
export async function fetchPostsWithAssets(campaignId: string): Promise<PostWithAssets[]> {
  const { data } = await supabase
    .from('posts')
    .select('*, post_assets(*)')
    .eq('campaign_id', campaignId)
    .is('deleted_at', null)
    .order('position')
    .order('position', { referencedTable: 'post_assets' })

  return (data || []).map(p => {
    const { post_assets, ...post } = p as Post & { post_assets: PostAsset[] }
    return { ...post, assets: post_assets || [] }
  })
}
