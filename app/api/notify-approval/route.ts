import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

type NotifyStatus = 'approved' | 'changes_requested' | 'rejected'

const STATUS_CONFIG: Record<NotifyStatus, { label: string; subjectPrefix: string; color: string; emoji: string; heading: string }> = {
  approved: { label: 'Approved', subjectPrefix: '✓ Approved', color: '#f6a7d7', emoji: '✓', heading: 'Post approved' },
  changes_requested: { label: 'Changes requested', subjectPrefix: '⚡ Changes requested', color: '#ff6b6b', emoji: '⚡', heading: 'Changes requested' },
  rejected: { label: 'Rejected', subjectPrefix: '✕ Rejected', color: '#ff6b6b', emoji: '✕', heading: 'Post rejected' },
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export async function POST(req: Request) {
  try {
    const { postId, status, reviewerName, feedback } = await req.json() as {
      postId?: string
      status?: NotifyStatus
      reviewerName?: string | null
      feedback?: string | null
    }
    if (!postId) return NextResponse.json({ error: 'postId required' }, { status: 400 })
    const effectiveStatus: NotifyStatus = status && STATUS_CONFIG[status] ? status : 'approved'

    const RESEND_API_KEY = process.env.RESEND_API_KEY
    const NOTIFICATION_EMAIL = process.env.NOTIFICATION_EMAIL
    const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'The Break Digital <no-reply@thebreakdigital.com>'

    if (!RESEND_API_KEY || !NOTIFICATION_EMAIL) {
      console.warn('Skipping email — RESEND_API_KEY or NOTIFICATION_EMAIL not set')
      return NextResponse.json({ skipped: true, reason: 'env not configured' })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const { data: post } = await supabase
      .from('posts')
      .select('*, post_assets(*), campaigns(title, client_name)')
      .eq('id', postId)
      .single()

    if (!post) return NextResponse.json({ error: 'post not found' }, { status: 404 })

    const campaign = post.campaigns as { title: string; client_name: string | null } | null
    const assets = (post.post_assets || []) as { id: string; file_url: string; file_type: string; position: number }[]
    assets.sort((a, b) => a.position - b.position)

    const platforms = (() => {
      try { return JSON.parse(post.platform || '[]') } catch { return post.platform ? [post.platform] : [] }
    })()

    const scheduledDate = post.scheduled_date
      ? new Date(post.scheduled_date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
      : null

    const captionHtml = escapeHtml(post.caption || '(no caption)').replace(/\n/g, '<br>')
    const cfg = STATUS_CONFIG[effectiveStatus]

    const reviewerLine = reviewerName
      ? `<p style="color: #666; margin: 0 0 4px; font-size: 13px;"><strong>Reviewer:</strong> ${escapeHtml(reviewerName)}</p>`
      : ''

    const feedbackBlock = (effectiveStatus !== 'approved' && feedback)
      ? `
        <h3 style="margin: 24px 0 8px; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; color: #999;">Client note</h3>
        <div style="background: #fff5f5; border: 1px solid ${cfg.color}40; padding: 16px; border-radius: 12px; white-space: pre-wrap; line-height: 1.5; color: #333;">${escapeHtml(feedback).replace(/\n/g, '<br>')}</div>
      `
      : ''

    // For feedback / rejected emails, link straight to the campaign in the admin console
    // with the affected post anchored, so editing is one click away.
    const host = req.headers.get('host') || 'tbdsocialapprovals.vercel.app'
    const proto = req.headers.get('x-forwarded-proto') || 'https'
    const baseUrl = `${proto}://${host}`
    const editLinkBlock = (effectiveStatus !== 'approved' && post.campaign_id)
      ? `
        <div style="margin: 24px 0 8px;">
          <a href="${baseUrl}/admin/campaign/${post.campaign_id}#post-${post.id}"
             style="display: inline-block; background: ${cfg.color}; color: #fff; text-decoration: none; padding: 12px 20px; border-radius: 999px; font-weight: 600; font-size: 14px;">
            Edit this post in admin →
          </a>
        </div>
      `
      : ''

    // Build download URLs — Supabase storage honours ?download=<filename> by setting
    // Content-Disposition: attachment, so the browser saves the file instead of playing it inline.
    const downloadUrl = (a: { file_url: string; file_type: string }, i: number) => {
      const ext = (a.file_url.split('?')[0].split('.').pop() || (a.file_type === 'video' ? 'mp4' : 'jpg')).toLowerCase()
      const safeTitle = (campaign?.title || 'post').replace(/[^a-z0-9-_]+/gi, '_').slice(0, 40) || 'post'
      const filename = `${safeTitle}_${i + 1}.${ext}`
      const sep = a.file_url.includes('?') ? '&' : '?'
      return `${a.file_url}${sep}download=${encodeURIComponent(filename)}`
    }

    // No file links in emails — direct downloads pull the full asset out of Supabase storage
    // and drive egress. The "Open in admin" link covers the case where files are actually needed.
    const filesBlock = ''
    // Add an "Open in admin" CTA for approved posts so the user can grab files when ready.
    const openInAdminBlock = effectiveStatus === 'approved' && post.campaign_id
      ? `
        <div style="margin: 24px 0 8px;">
          <a href="${baseUrl}/admin/campaign/${post.campaign_id}#post-${post.id}"
             style="display: inline-block; background: ${cfg.color}; color: #fff; text-decoration: none; padding: 12px 20px; border-radius: 999px; font-weight: 600; font-size: 14px;">
            Open in admin →
          </a>
        </div>
      `
      : ''

    const subject = `${cfg.subjectPrefix}: ${campaign?.title || 'Post'}${campaign?.client_name ? ` — ${campaign.client_name}` : ''}`

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
        <h2 style="color: ${cfg.color}; margin: 0 0 8px;">${cfg.heading} ${cfg.emoji}</h2>
        <p style="color: #666; margin: 0 0 20px;">${escapeHtml(campaign?.title || '')}${campaign?.client_name ? ` · ${escapeHtml(campaign.client_name)}` : ''}</p>
        ${reviewerLine}
        ${scheduledDate ? `<p style="margin: 4px 0 16px;"><strong>📅 Scheduled:</strong> ${scheduledDate}</p>` : ''}
        ${platforms.length ? `<p style="margin: 0 0 16px;"><strong>Platforms:</strong> ${platforms.map((p: string) => escapeHtml(p)).join(', ')}</p>` : ''}
        ${feedbackBlock}
        ${editLinkBlock}
        ${openInAdminBlock}
        <h3 style="margin: 24px 0 8px; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; color: #999;">Caption</h3>
        <div style="background: #f8f8f8; padding: 16px; border-radius: 12px; white-space: pre-wrap; line-height: 1.5;">${captionHtml}</div>
        ${filesBlock}
      </div>
    `

    const resend = new Resend(RESEND_API_KEY)
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: NOTIFICATION_EMAIL,
      subject,
      html,
    })

    if (error) {
      console.error('Resend error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ sent: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error'
    console.error('notify-approval error:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
