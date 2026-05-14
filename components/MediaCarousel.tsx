'use client'

import { useState, useRef } from 'react'

const PINK = '#f6a7d7'

export type CarouselAsset = {
  id: string
  file_url: string
  file_type: 'image' | 'video'
}

function VideoPlayer({ src }: { src: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)

  function toggle() {
    if (!ref.current) return
    if (playing) { ref.current.pause(); setPlaying(false) }
    else { ref.current.play(); setPlaying(true) }
  }

  return (
    <div className="relative w-full cursor-pointer" onClick={toggle}>
      <video ref={ref} src={src} className="w-full max-h-[70vh] object-contain" playsInline onEnded={() => setPlaying(false)} />
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
        <div className="absolute top-3 right-3 z-10 text-xs font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: 'rgba(0,0,0,0.55)', color: '#fff', backdropFilter: 'blur(4px)' }}>
          {idx + 1} / {assets.length}
        </div>
      )}

      {/* Carousel icon (top-left) */}
      {isMulti && (
        <div className="absolute top-3 left-3 z-10">
          <svg viewBox="0 0 24 24" fill="white" className="w-5 h-5 drop-shadow" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' }}>
            <path d="M2 6h2v12H2V6zm3-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm14 2H5v12h14V6zm3 2h2v8h-2V8z" />
          </svg>
        </div>
      )}

      {/* Media */}
      {asset.file_type === 'video'
        ? <VideoPlayer src={asset.file_url} key={asset.id} />
        // eslint-disable-next-line @next/next/no-img-element
        : <img src={asset.file_url} alt="" className="w-full max-h-[70vh] object-contain" key={asset.id} />
      }

      {/* Left / right arrows */}
      {isMulti && (
        <>
          <button
            onClick={() => setIdx(i => Math.max(0, i - 1))}
            disabled={idx === 0}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full flex items-center justify-center transition-all disabled:opacity-0"
            style={{ backgroundColor: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}
          >
            <svg viewBox="0 0 24 24" fill="white" className="w-4 h-4"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" /></svg>
          </button>
          <button
            onClick={() => setIdx(i => Math.min(assets.length - 1, i + 1))}
            disabled={idx === assets.length - 1}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full flex items-center justify-center transition-all disabled:opacity-0"
            style={{ backgroundColor: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}
          >
            <svg viewBox="0 0 24 24" fill="white" className="w-4 h-4"><path d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z" /></svg>
          </button>

          {/* Dot indicators */}
          <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5 z-10">
            {assets.map((_, i) => (
              <button
                key={i}
                onClick={() => setIdx(i)}
                className="rounded-full transition-all"
                style={{
                  width: i === idx ? '18px' : '6px',
                  height: '6px',
                  backgroundColor: i === idx ? PINK : 'rgba(255,255,255,0.5)',
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
