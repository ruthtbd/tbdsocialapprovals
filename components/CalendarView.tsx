'use client'

import { useState } from 'react'
import { parsePlatforms, type PostWithAssets } from '@/lib/supabase'

const PINK = '#f6a7d7'
const IG = '#e0308c'
const TT = '#000'

type Props = {
  posts: PostWithAssets[]
  // If true, only posts fully approved (client + internal) show; otherwise approved-by-client is enough.
  requireFullApproval?: boolean
}

function startOfMonth(y: number, m: number) { return new Date(y, m, 1) }
function monthName(d: Date) { return d.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' }) }

function PlatformChip({ name }: { name: string }) {
  const style = name === 'Instagram'
    ? { backgroundColor: IG, color: '#fff' }
    : name === 'TikTok'
      ? { backgroundColor: TT, color: '#fff' }
      : { backgroundColor: '#888', color: '#fff' }
  return (
    <span className="text-[9px] font-bold px-1 py-0.5 rounded-full uppercase leading-none" style={style}>
      {name === 'Instagram' ? 'IG' : name === 'TikTok' ? 'TT' : name.slice(0, 2)}
    </span>
  )
}

export function CalendarView({ posts, requireFullApproval = false }: Props) {
  const today = new Date()
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() })

  // Only surface posts that are approved + (optionally) internally approved + have a date
  const visible = posts.filter(p => {
    if (!p.scheduled_date) return false
    if (p.status !== 'approved') return false
    if (requireFullApproval && !(p as PostWithAssets & { internal_approved_at?: string | null }).internal_approved_at) return false
    return true
  })

  // Group by date (YYYY-MM-DD)
  const byDate = new Map<string, PostWithAssets[]>()
  for (const p of visible) {
    const key = p.scheduled_date!
    if (!byDate.has(key)) byDate.set(key, [])
    byDate.get(key)!.push(p)
  }

  // Build the 6-row calendar grid (Mon-start). Blank cells for days outside the month.
  const first = startOfMonth(cursor.year, cursor.month)
  const firstWeekday = first.getDay() // 0 = Sun
  const monOffset = firstWeekday === 0 ? 6 : firstWeekday - 1
  const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate()
  const cells: (number | null)[] = Array.from({ length: monOffset }, () => null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  function shift(delta: number) {
    setCursor(c => {
      const m = c.month + delta
      const y = c.year + Math.floor(m / 12)
      const nm = ((m % 12) + 12) % 12
      return { year: y, month: nm }
    })
  }

  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">{monthName(first)}</h2>
        <div className="flex gap-1">
          <button onClick={() => shift(-1)} className="w-8 h-8 rounded-full flex items-center justify-center text-sm" style={{ border: '1px solid rgba(0,0,0,0.1)' }}>←</button>
          <button onClick={() => setCursor({ year: today.getFullYear(), month: today.getMonth() })}
            className="text-xs px-3 h-8 rounded-full" style={{ border: '1px solid rgba(0,0,0,0.1)' }}>Today</button>
          <button onClick={() => shift(1)} className="w-8 h-8 rounded-full flex items-center justify-center text-sm" style={{ border: '1px solid rgba(0,0,0,0.1)' }}>→</button>
        </div>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
          <div key={d} className="text-[10px] uppercase tracking-widest text-center py-1" style={{ color: '#888' }}>{d}</div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (d === null) return <div key={`blank-${i}`} className="aspect-square rounded-lg" style={{ border: '1px dashed rgba(0,0,0,0.05)' }} />
          const key = `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
          const dayPosts = byDate.get(key) || []
          const isToday = key === todayKey
          return (
            <div key={key} className="aspect-square rounded-lg p-1 overflow-hidden flex flex-col"
              style={{
                border: `1px solid ${isToday ? PINK : 'rgba(0,0,0,0.08)'}`,
                backgroundColor: isToday ? `${PINK}08` : '#fff',
              }}>
              <div className="text-[10px] font-semibold mb-0.5" style={{ color: isToday ? PINK : '#333' }}>{d}</div>
              <div className="flex flex-col gap-0.5 flex-1 overflow-hidden">
                {dayPosts.slice(0, 3).map(p => {
                  const platforms = parsePlatforms(p.platform)
                  const caption = (p.caption || '').slice(0, 30).replace(/\n/g, ' ')
                  return (
                    <div key={p.id} className="rounded px-1 py-0.5 text-[9px] leading-tight flex items-center gap-1 overflow-hidden"
                      style={{ backgroundColor: 'rgba(0,0,0,0.04)' }}
                      title={p.caption || ''}>
                      {platforms.slice(0, 2).map(pf => <PlatformChip key={pf} name={pf} />)}
                      <span className="truncate" style={{ color: '#333' }}>{caption}</span>
                    </div>
                  )
                })}
                {dayPosts.length > 3 && (
                  <div className="text-[9px]" style={{ color: '#888' }}>+{dayPosts.length - 3} more</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
