import { useCallback, useMemo } from 'react'
import { useDiagramStore } from '../stores/diagramStore'
import { useJointStore } from '../stores/jointStore'
import type { Diagram, HitArea } from '../types/diagram'
import type { Member } from '../types/member'

interface SvgHitAreaResult {
  diag: Diagram | undefined
  hitAreas: HitArea[]
  selectedMemberId: string | null
  selectedMember: Member | undefined
  selectMember: (memberId: string) => void
}

export function useSvgHitAreas(svgId: string | null): SvgHitAreaResult {
  const diagrams = useDiagramStore((state) => state.diagrams)
  const draftSvgMarkup = useDiagramStore((state) => state.draftSvgMarkup)
  const selectedDiagramId = useDiagramStore((state) => state.selectedDiagramId)
  const selectedMemberId = useDiagramStore((state) => state.selectedMemberId)
  const setSelectedMember = useDiagramStore((state) => state.setSelectedMember)
  const members = useJointStore((state) => state.members)

  const diag = useMemo(
    () => diagrams.find((item) => item.id === svgId),
    [diagrams, svgId],
  )

  const hitAreas = useMemo(() => {
    const source = diag?.id === selectedDiagramId ? draftSvgMarkup : diag?.svgMarkup
    if (!source) return []
    const documentNode = new DOMParser().parseFromString(source, 'image/svg+xml')
    const groups = Array.from(documentNode.querySelectorAll('g[data-member-id]'))
    return groups.map((group, index) => {
      const memberId = group.getAttribute('data-member-id') ?? ''
      const fallback = diag?.hitAreas[index]
      const polygon = group.querySelector('polygon')
      return {
        id: group.getAttribute('data-hit-id') ?? fallback?.id ?? `hit-${index}`,
        memberId,
        label: group.getAttribute('data-label') ?? fallback?.label ?? memberId,
        points: polygon?.getAttribute('points') ?? fallback?.points ?? '',
      }
    }).filter((area) => area.memberId.length > 0)
  }, [diag, draftSvgMarkup, selectedDiagramId])

  const selectedMember = useMemo(
    () => members.find((member) => member.id === selectedMemberId),
    [members, selectedMemberId],
  )

  const selectMember = useCallback((memberId: string) => {
    setSelectedMember(memberId)
  }, [setSelectedMember])

  return { diag, hitAreas, selectedMemberId, selectedMember, selectMember }
}
