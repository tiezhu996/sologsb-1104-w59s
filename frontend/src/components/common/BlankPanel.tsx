import type { ReactNode } from 'react'

interface BlankPanelProps {
  title: string
  description: string
  action?: ReactNode
}

export function BlankPanel({ title, description, action }: BlankPanelProps) {
  return (
    <section className="rounded-2xl border border-dashed border-wood-100 bg-wood-50/70 px-6 py-10 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-wood-100 bg-white text-wood-700">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5z" />
          <path d="m4 7.5 8 4.5 8-4.5M12 12v9" />
        </svg>
      </div>
      <h2 className="text-lg font-semibold text-wood-900">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-stone-600">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </section>
  )
}
