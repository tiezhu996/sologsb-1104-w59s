import { useRef, useState, type PointerEvent } from 'react'
import type { HitArea } from '../../types/diagram'

interface SvgCanvasProps {
  svgMarkup: string
  title: string
  hitAreas?: HitArea[]
  selectedMemberId?: string | null
  onSelectMember?: (memberId: string) => void
  emptyMessage?: string
}

interface PanOrigin {
  x: number
  y: number
  offsetX: number
  offsetY: number
}

export function SvgCanvas({
  svgMarkup,
  title,
  hitAreas = [],
  selectedMemberId = null,
  onSelectMember,
  emptyMessage = '暂无可预览的示意图',
}: SvgCanvasProps) {
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const panOrigin = useRef<PanOrigin | null>(null)

  const selectFromEvent = (target: EventTarget | null) => {
    if (!onSelectMember || !(target instanceof Element)) return
    const hitGroup = target.closest('[data-member-id]')
    const memberId = hitGroup?.getAttribute('data-member-id')
    if (memberId) onSelectMember(memberId)
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    panOrigin.current = {
      x: event.clientX,
      y: event.clientY,
      offsetX: offset.x,
      offsetY: offset.y,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!panOrigin.current) return
    setOffset({
      x: panOrigin.current.offsetX + event.clientX - panOrigin.current.x,
      y: panOrigin.current.offsetY + event.clientY - panOrigin.current.y,
    })
  }

  const stopPan = (event: PointerEvent<HTMLDivElement>) => {
    panOrigin.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-wood-100 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-wood-100 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-wood-900">{title}</h2>
          <p className="mt-0.5 text-xs text-stone-500">拖动空白处平移，点击木构件查看命名</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" className="canvas-control" aria-label="缩小" onClick={() => setScale((value) => Math.max(0.65, Number((value - 0.15).toFixed(2))))}>−</button>
          <span className="min-w-12 text-center text-xs text-stone-500">{Math.round(scale * 100)}%</span>
          <button type="button" className="canvas-control" aria-label="放大" onClick={() => setScale((value) => Math.min(1.75, Number((value + 0.15).toFixed(2))))}>+</button>
          <button type="button" className="ml-1 rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs text-stone-600 hover:bg-stone-50" onClick={() => { setScale(1); setOffset({ x: 0, y: 0 }) }}>复位</button>
        </div>
      </header>
      {svgMarkup ? (
        <div
          className="relative h-[360px] cursor-grab overflow-hidden bg-[#fbf8f2] active:cursor-grabbing"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={stopPan}
          onPointerCancel={stopPan}
          onClick={(event) => selectFromEvent(event.target)}
        >
          <div
            className="pointer-events-auto absolute inset-0 flex items-center justify-center p-5 [&_svg]:h-auto [&_svg]:w-full [&_svg]:max-w-[620px]"
            style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
            dangerouslySetInnerHTML={{ __html: svgMarkup }}
          />
        </div>
      ) : (
        <div className="flex h-[360px] items-center justify-center bg-[#fbf8f2] px-6 text-center text-sm text-stone-500">
          {emptyMessage}
        </div>
      )}
      {hitAreas.length > 0 ? (
        <div className="flex flex-wrap gap-2 border-t border-wood-100 px-4 py-3">
          {hitAreas.map((area) => (
            <button
              key={area.id}
              type="button"
              onClick={() => onSelectMember?.(area.memberId)}
              className={`rounded-full border px-3 py-1.5 text-xs transition ${
                selectedMemberId === area.memberId
                  ? 'border-wood-700 bg-wood-700 text-white'
                  : 'border-wood-100 bg-wood-50 text-wood-700 hover:border-wood-500'
              }`}
            >
              {area.label}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  )
}
