import { create } from 'zustand'
import type { Diagram } from '../types/diagram'
import { db } from '../utils/db'

interface DiagramState {
  diagrams: Diagram[]
  selectedDiagramId: string | null
  selectedMemberId: string | null
  draftSvgMarkup: string
  draftTitle: string
  loading: boolean
  loadDiagrams: (jointTypeId: string) => Promise<void>
  setSelectedDiagram: (id: string) => void
  setSelectedMember: (id: string | null) => void
  setDraftSvgMarkup: (markup: string) => void
  setDraftTitle: (title: string) => void
  saveDraft: () => Promise<void>
  saveDiagram: (diagram: Diagram) => Promise<void>
}

export const useDiagramStore = create<DiagramState>((set, get) => ({
  diagrams: [],
  selectedDiagramId: null,
  selectedMemberId: null,
  draftSvgMarkup: '',
  draftTitle: '',
  loading: false,

  loadDiagrams: async (jointTypeId) => {
    set({ loading: true })
    try {
      const diagrams = await db.diagrams.where('jointTypeId').equals(jointTypeId).toArray()
      set((state) => {
        const selectedDiagramId = diagrams.some((diagram) => diagram.id === state.selectedDiagramId)
          ? state.selectedDiagramId
          : diagrams[0]?.id ?? null
        const selected = diagrams.find((diagram) => diagram.id === selectedDiagramId)
        return {
          diagrams,
          selectedDiagramId,
          selectedMemberId: selectedDiagramId === state.selectedDiagramId ? state.selectedMemberId : null,
          draftSvgMarkup: selected?.svgMarkup ?? '',
          draftTitle: selected?.title ?? '',
        }
      })
    } finally {
      set({ loading: false })
    }
  },

  setSelectedDiagram: (id) => set((state) => {
    const selected = state.diagrams.find((diagram) => diagram.id === id)
    return {
      selectedDiagramId: id,
      selectedMemberId: null,
      draftSvgMarkup: selected?.svgMarkup ?? '',
      draftTitle: selected?.title ?? '',
    }
  }),

  setSelectedMember: (id) => set({ selectedMemberId: id }),
  setDraftSvgMarkup: (markup) => set({ draftSvgMarkup: markup }),
  setDraftTitle: (title) => set({ draftTitle: title }),

  saveDraft: async () => {
    const state = get()
    const selected = state.diagrams.find((diagram) => diagram.id === state.selectedDiagramId)
    if (!selected) return
    const updated: Diagram = {
      ...selected,
      title: state.draftTitle.trim() || selected.title,
      svgMarkup: state.draftSvgMarkup,
    }
    await state.saveDiagram(updated)
  },

  saveDiagram: async (diagram) => {
    await db.diagrams.put(diagram)
    set((state) => ({
      diagrams: state.diagrams.map((item) => item.id === diagram.id ? diagram : item),
      draftSvgMarkup: state.selectedDiagramId === diagram.id ? diagram.svgMarkup : state.draftSvgMarkup,
      draftTitle: state.selectedDiagramId === diagram.id ? diagram.title : state.draftTitle,
    }))
  },
}))
