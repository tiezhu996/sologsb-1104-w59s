import { useCallback, useEffect, useMemo } from 'react'
import { useStepStore } from '../stores/stepStore'
import type { DisassemblyStep } from '../types/step'

interface StepOrderResult {
  steps: DisassemblyStep[]
  totalDurationSec: number
  currentStepIndex: number
  move: (from: number, to: number) => Promise<void>
  setCurrentStep: (index: number) => void
}

export function useStepOrder(jointTypeId: string): StepOrderResult {
  const allSteps = useStepStore((state) => state.steps)
  const currentStepIndex = useStepStore((state) => state.currentStepIndex)
  const loadSteps = useStepStore((state) => state.loadSteps)
  const setCurrentStep = useStepStore((state) => state.setCurrentStep)

  useEffect(() => {
    if (!jointTypeId) return
    void loadSteps(jointTypeId)
  }, [jointTypeId, loadSteps])

  const steps = useMemo(
    () => allSteps
      .filter((step) => step.jointTypeId === jointTypeId)
      .sort((a, b) => a.seq - b.seq),
    [allSteps, jointTypeId],
  )

  const totalDurationSec = useMemo(
    () => steps.reduce((total, step) => total + step.holdSec, 0),
    [steps],
  )

  const move = useCallback(async (from: number, to: number) => {
    await useStepStore.getState().moveStep(from, to)
  }, [])

  return {
    steps,
    totalDurationSec,
    currentStepIndex: Math.min(currentStepIndex, Math.max(0, steps.length - 1)),
    move,
    setCurrentStep,
  }
}
