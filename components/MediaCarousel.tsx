'use client'

import { useState, useRef } from 'react'

const PINK = '#f6a7d7'

export type CarouselAsset = {
  id: string
  file_url: string
  file_type: 'image' | 'video'
  thumbnail_url?: string | null
}

function VideoPlayer({ src, poster }: { src: string; poster?: string | null }) {
  const ref = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)

  function toggle() {
    if (!ref.current) return
    if (playing) { ref.current.pause(); setPlaying(false) }
    else { ref.current.play(); setPlaying(true) }
  }

  return (
    <div className="relative w-full cursor-pointer" onClick={toggle}>
      <video ref={ref} src={src} poster={poster ?? undefined} className="w-full max-h-[70vh] object-contain" playsInline onEnded={() => setPlaying(false)} />
      {!playing && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-16 h-16 rounded-full flex items-center justify-center backdrop-blur-sm" style={{ backgroundColor: '#f6a7d730', border: `2px solid ${PINK}` }}>
            <svg viewBox="0 0 24 24" fill={PINK} className="w-7 h-7 ml-1"><path d="M8 5v14l11-7z" /></svg>
          </div>
        </div>
      )}
    </div>
  )
}

export function MediaCarousel({ assets, mediaBg }: { assets: CarouselAsset[]; mediaBg: string }) {
  const [idx, setIdx] = useState(0)
  const asset = assets[idx]
  if (!asset) return null

  const isMulti = assets.length > 1

  return (
    <div className="relative select-none" style={{ backgroundColor: mediaBg }}>
      {/* Counter badge */}
      {isMulti && (
        <div className="absolute top-3 right-3 z-10 text-xs font-semibold px-2.5 py-1 rounded-full"
          style={{ backgroundColor: 'rgba(0,0,0,0.55)', color: '#fff', backdropFilter: 'blur(4px)' }}>
          {idx + 1} / {assets.length}
        </div>
      )}

      {/* Media */}
      {asset.file_type === 'video'
        ? <VideoPlayer src={asset.file_url} poster={asset.thumbnail_url} key={asset.id} />
        // eslint-disable-next-line @next/next/no-img-element
        : <img src={asset.file_url} alt="" className="w-full max-h-[70vh] object-contain" key={asset.id} />
      }

      {/* Left / right arrows */}
      {isMulti && (
        <>
          <button onClick={() => setIdx(i => Math.max(0, i - 1))} disabled={idx === 0}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full flex items-center justify-center transition-all disabled:opacity-0"
            style={{ backgroundColor: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}>
            <svg viewBox="0 0 24 24" fill="white" className="w-4 h-4"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" /></svg>
          </button>
          <button onClick={() => setIdx(i => Math.min(assets.length - 1, i + 1))} disabled={idx === assets.length - 1}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full flex items-center justify-center transition-all disabled:opacity-0"
            style={{ backgroundColor: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}>
            <svg viewBox="0 0 24 24" fill="white" className="w-4 h-4"><path d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z" /></svg>
          </button>
        </>
      )}

      {/* Thumbnail strip — replaces dot indicators */}
      {isMulti && (
        <div className="flex gap-1.5 px-3 py-2.5 overflow-x-auto" style={{ backgroundColor: mediaBg }}>
          {assets.map((a, i) => (
            <button key={a.id} onClick={() => setIdx(i)}
              className="shrink-0 w-14 h-14 rounded-lg overflow-hidden transition-all"
              style={{
                outline: i === idx ? `2px solid ${PINK}` : '2px solid transparent',
                outlineOffset: '1px',
                opacity: i === idx ? 1 : 0.4,
              }}>
              {a.file_type === 'video'
                ? a.thumbnail_url
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={a.thumbnail_url} alt="" className="w-full h-full object-cover" />
                  : <video src={a.file_url} className="w-full h-full object-cover" muted preload="metadata" />
                // eslint-disable-next-line @next/next/no-img-element
                : <img src={a.file_url} alt="" className="w-full h-full object-cover" />
              }
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
