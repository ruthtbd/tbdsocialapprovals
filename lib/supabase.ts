import { createClient, SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

export function getSupabase() {
  if (!_client) {
    _client = createClient(
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

export type Campaign = {
  id: string
  title: string
  client_name: string | null
  token: string
  status: 'draft' | 'active'
  created_at: string
  approved_at: string | null
}

// Post is now a container — files live in post_assets
export type Post = {
  id: string
  campaign_id: string
  caption: string | null
  platform: string | null
  scheduled_date: string | null
  position: number
  status: 'pending' | 'approved' | 'changes_requested'
  feedback: string | null
  created_at: string
}

export type PostAsset = {
  id: string
  post_id: string
  file_url: string
  file_type: 'image' | 'video'
  thumbnail_url: string | null
  position: number
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

// Fetch posts + their assets for a campaign, return as PostWithAssets[]
export async function fetchPostsWithAssets(campaignId: string): Promise<PostWithAssets[]> {
  const [{ data: posts }, { data: assets }] = await Promise.all([
    supabase.from('posts').select('*').eq('campaign_id', campaignId).order('position'),
    supabase.from('post_assets').select('*').order('position'),
  ])
  const assetMap: Record<string, PostAsset[]> = {}
  for (const a of assets || []) {
    if (!assetMap[a.post_id]) assetMap[a.post_id] = []
    assetMap[a.post_id].push(a)
  }
  return (posts || []).map(p => ({ ...p, assets: assetMap[p.id] || [] }))
}
