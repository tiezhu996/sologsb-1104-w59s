export const MM_PER_CUN = 100 / 3

export function cunToMm(value: number): number {
  return value * MM_PER_CUN
}

export function mmToCun(value: number): number {
  return value / MM_PER_CUN
}

export function roundMeasure(value: number, digits = 2): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

export function formatDimension(valueMm: number, unit: 'mm' | '寸' = 'mm', digits = 1): string {
  if (!Number.isFinite(valueMm)) return '--'
  const value = unit === 'mm' ? valueMm : mmToCun(valueMm)
  return `${roundMeasure(value, digits)} ${unit}`
}

export interface ToleranceResult {
  deviationMm: number
  exceededByMm: number
  withinTolerance: boolean
  message: string
}

export function checkTolerance(actualMm: number, nominalMm: number, toleranceMm: number): ToleranceResult {
  const deviationMm = actualMm - nominalMm
  const absoluteDeviation = Math.abs(deviationMm)
  const exceededByMm = Math.max(0, absoluteDeviation - Math.max(0, toleranceMm))
  const withinTolerance = exceededByMm === 0

  return {
    deviationMm: roundMeasure(deviationMm, 2),
    exceededByMm: roundMeasure(exceededByMm, 2),
    withinTolerance,
    message: withinTolerance
      ? `偏差 ${formatDimension(absoluteDeviation)}，在 ±${formatDimension(toleranceMm)} 内`
      : `偏差 ${formatDimension(absoluteDeviation)}，超差 ${formatDimension(exceededByMm)}`,
  }
}
