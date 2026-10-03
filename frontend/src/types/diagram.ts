export type DiagramView = '正视' | '俯视' | '轴测'

export interface HitArea {
  id: string
  memberId: string
  label: string
  points: string
}

export interface Diagram {
  id: string
  jointTypeId: string
  stepId: string
  title: string
  view: DiagramView
  svgMarkup: string
  hitAreas: HitArea[]
  schemaRev?: number
}
