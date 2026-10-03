import type { JointDifficulty } from '../../types/jointType'

interface DifficultyTagProps {
  difficulty: JointDifficulty
  compact?: boolean
}

const toneMap: Record<JointDifficulty, string> = {
  入门: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  进阶: 'border-amber-200 bg-amber-50 text-amber-800',
  高难: 'border-rose-200 bg-rose-50 text-rose-800',
}

export function DifficultyTag({ difficulty, compact = false }: DifficultyTagProps) {
  return (
    <span className={`inline-flex items-center rounded-full border font-medium ${toneMap[difficulty] ?? 'border-stone-200 bg-stone-50 text-stone-700'} ${compact ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'}`}>
      <span aria-hidden="true" className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current" />
      {difficulty}
    </span>
  )
}
