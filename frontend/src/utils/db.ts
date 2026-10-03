import Dexie, { type Table } from 'dexie'
import type { Diagram, HitArea } from '../types/diagram'
import type { Furniture } from '../types/furniture'
import type { JointType } from '../types/jointType'
import type { Member } from '../types/member'
import type { DisassemblyStep } from '../types/step'

export class MortiseDatabase extends Dexie {
  joints!: Table<JointType, string>
  members!: Table<Member, string>
  steps!: Table<DisassemblyStep, string>
  diagrams!: Table<Diagram, string>
  furniture!: Table<Furniture, string>

  constructor() {
    super('gbmortise-db')
    const schema = {
      joints: 'id, name, family, difficulty',
      members: 'id, jointTypeId, name, part, lengthMm',
      steps: 'id, jointTypeId, seq, action',
      diagrams: 'id, jointTypeId, stepId, view',
      furniture: 'id, jointTypeId, name',
    }

    this.version(1).stores(schema)
    this.version(2).stores(schema).upgrade(async (transaction) => {
      await transaction.table<JointType, string>('joints').toCollection().modify((joint) => {
        joint.schemaRev = 2
      })
      await transaction.table<Member, string>('members').toCollection().modify((member) => {
        member.schemaRev = 2
      })
      await transaction.table<DisassemblyStep, string>('steps').toCollection().modify((step) => {
        step.schemaRev = 2
      })
      await transaction.table<Diagram, string>('diagrams').toCollection().modify((diagram) => {
        diagram.schemaRev = 2
      })
      await transaction.table<Furniture, string>('furniture').toCollection().modify((furniture) => {
        furniture.schemaRev = 2
      })
    })
  }
}

function makeSeedSvg(title: string, memberIds: [string, string, string], labels: [string, string, string]): string {
  const [firstId, secondId, thirdId] = memberIds
  const [firstLabel, secondLabel, thirdLabel] = labels
  return `<svg viewBox="0 0 520 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${title}">
  <rect x="8" y="8" width="504" height="284" rx="18" fill="#f7efe3" stroke="#c8a97d" stroke-width="2"/>
  <path d="M20 92 H500 M20 214 H500" stroke="#dfc9a8" stroke-width="1" stroke-dasharray="5 7"/>
  <text x="28" y="42" fill="#5b3a20" font-size="19" font-family="serif" font-weight="700">${title}</text>
  <text x="28" y="66" fill="#8c6b4b" font-size="12" font-family="sans-serif">点击木构件查看尺寸与命名</text>
  <g data-member-id="${firstId}" style="cursor:pointer">
    <polygon points="40,188 190,188 214,252 18,252" fill="#d89a5b" stroke="#6f4a26" stroke-width="3"/>
    <path d="M65 205 L177 205 M75 220 L188 220 M86 235 L197 235" stroke="#9f6535" stroke-width="3" stroke-linecap="round"/>
    <text x="103" y="278" text-anchor="middle" fill="#4b2d17" font-size="15" font-family="serif">${firstLabel}</text>
  </g>
  <g data-member-id="${secondId}" style="cursor:pointer">
    <polygon points="196,50 324,50 324,148 196,148" fill="#b77942" stroke="#593619" stroke-width="3"/>
    <rect x="218" y="69" width="84" height="16" rx="4" fill="#f4dfc4"/>
    <rect x="218" y="101" width="84" height="16" rx="4" fill="#f4dfc4"/>
    <text x="260" y="176" text-anchor="middle" fill="#4b2d17" font-size="15" font-family="serif">${secondLabel}</text>
  </g>
  <g data-member-id="${thirdId}" style="cursor:pointer">
    <polygon points="336,116 498,116 498,254 352,254" fill="#c88c55" stroke="#66401f" stroke-width="3"/>
    <path d="M355 137 L472 237 M472 137 L355 237" stroke="#8e542b" stroke-width="5" stroke-linecap="round"/>
    <text x="421" y="278" text-anchor="middle" fill="#4b2d17" font-size="15" font-family="serif">${thirdLabel}</text>
  </g>
  <path d="M220 148 L260 188 L352 188" fill="none" stroke="#3d2814" stroke-width="2" stroke-dasharray="4 4"/>
</svg>`
}

const memberSeeds: Member[] = [
  { id: 'member-dt-tenon', jointTypeId: 'joint-dovetail', name: '榫头', part: '出榫件', grainDir: '顺纹', lengthMm: 128, widthMm: 54, thicknessMm: 28, toleranceMm: 0.15, note: '燕尾斜面须顺纹修切，肩部保留铅笔线。' },
  { id: 'member-dt-socket', jointTypeId: 'joint-dovetail', name: '榫眼', part: '受榫件', grainDir: '横纹', lengthMm: 126, widthMm: 52, thicknessMm: 30, toleranceMm: 0.18, note: '眼口略收，试装以木槌轻推为准。' },
  { id: 'member-dt-frame', jointTypeId: 'joint-dovetail', name: '大边', part: '受榫件', grainDir: '顺纹', lengthMm: 680, widthMm: 72, thicknessMm: 34, toleranceMm: 0.2, note: '长料纹理连续，端面垂直于基准边。' },
  { id: 'member-mt-tenon', jointTypeId: 'joint-mitre', name: '榫头', part: '出榫件', grainDir: '顺纹', lengthMm: 92, widthMm: 42, thicknessMm: 26, toleranceMm: 0.12, note: '肩部做45度斜肩，避免端面崩口。' },
  { id: 'member-mt-socket', jointTypeId: 'joint-mitre', name: '榫眼', part: '受榫件', grainDir: '横纹', lengthMm: 88, widthMm: 40, thicknessMm: 28, toleranceMm: 0.15, note: '暗眼深度留2毫米余量，便于胶线排出。' },
  { id: 'member-mt-rail', jointTypeId: 'joint-mitre', name: '抹头', part: '出榫件', grainDir: '横纹', lengthMm: 420, widthMm: 58, thicknessMm: 31, toleranceMm: 0.16, note: '格肩先试合外肩，再修内肩。' },
  { id: 'member-zj-frame', jointTypeId: 'joint-corner', name: '大边', part: '出榫件', grainDir: '顺纹', lengthMm: 760, widthMm: 78, thicknessMm: 36, toleranceMm: 0.2, note: '三向交汇处先留线，最后统一校肩。' },
  { id: 'member-zj-rail', jointTypeId: 'joint-corner', name: '抹头', part: '出榫件', grainDir: '横纹', lengthMm: 430, widthMm: 62, thicknessMm: 34, toleranceMm: 0.18, note: '接口两侧受力不同，不可互换方向。' },
  { id: 'member-zj-socket', jointTypeId: 'joint-corner', name: '榫眼', part: '受榫件', grainDir: '顺纹', lengthMm: 154, widthMm: 62, thicknessMm: 38, toleranceMm: 0.16, note: '眼内清角，以三角凿逐层修整。' },
  { id: 'member-bs-tenon', jointTypeId: 'joint-shoulder', name: '榫头', part: '出榫件', grainDir: '顺纹', lengthMm: 108, widthMm: 46, thicknessMm: 29, toleranceMm: 0.13, note: '抱肩弧面顺腿足外圆加工。' },
  { id: 'member-bs-socket', jointTypeId: 'joint-shoulder', name: '榫眼', part: '受榫件', grainDir: '横纹', lengthMm: 104, widthMm: 44, thicknessMm: 31, toleranceMm: 0.15, note: '圆材开眼不可过深，保留腿足承载截面。' },
  { id: 'member-bs-rail', jointTypeId: 'joint-shoulder', name: '抹头', part: '出榫件', grainDir: '横纹', lengthMm: 470, widthMm: 50, thicknessMm: 30, toleranceMm: 0.17, note: '肩线随圆材弧度修配，避免硬压。' },
]

const stepSeeds: DisassemblyStep[] = [
  { id: 'step-dt-1', jointTypeId: 'joint-dovetail', seq: 1, action: '拆卸', direction: '轴向', tool: '木槌', riskNote: '先垫软木再轻敲榫肩，避免压伤外露木纹。', holdSec: 6 },
  { id: 'step-dt-2', jointTypeId: 'joint-dovetail', seq: 2, action: '拆卸', direction: '侧向', tool: '鱼线', riskNote: '沿燕尾斜面缓慢带出，不可强扭大边。', holdSec: 8 },
  { id: 'step-dt-3', jointTypeId: 'joint-dovetail', seq: 3, action: '装配', direction: '斜向', tool: '木槌', riskNote: '对准齿肩后顺纹推进，听到密实声即停。', holdSec: 7 },
  { id: 'step-mt-1', jointTypeId: 'joint-mitre', seq: 1, action: '拆卸', direction: '轴向', tool: '撬板', riskNote: '撬板只接触内肩，保护45度外角。', holdSec: 7 },
  { id: 'step-mt-2', jointTypeId: 'joint-mitre', seq: 2, action: '拆卸', direction: '侧向', tool: '木槌', riskNote: '格肩与暗榫同时退出，防止单侧受力。', holdSec: 8 },
  { id: 'step-mt-3', jointTypeId: 'joint-mitre', seq: 3, action: '装配', direction: '斜向', tool: '木槌', riskNote: '先合暗榫再落格肩，外角不得挤裂。', holdSec: 9 },
  { id: 'step-zj-1', jointTypeId: 'joint-corner', seq: 1, action: '拆卸', direction: '轴向', tool: '木槌', riskNote: '三向角点用软垫承托，逐面释放咬合。', holdSec: 8 },
  { id: 'step-zj-2', jointTypeId: 'joint-corner', seq: 2, action: '拆卸', direction: '斜向', tool: '鱼线', riskNote: '鱼线绕过内角，防止大边端头劈裂。', holdSec: 10 },
  { id: 'step-zj-3', jointTypeId: 'joint-corner', seq: 3, action: '装配', direction: '轴向', tool: '木槌', riskNote: '三面同时校线，任一面过紧都会抬起另两面。', holdSec: 11 },
  { id: 'step-bs-1', jointTypeId: 'joint-shoulder', seq: 1, action: '拆卸', direction: '侧向', tool: '撬板', riskNote: '圆材包肩处先松胶线，避免刮伤弧面。', holdSec: 8 },
  { id: 'step-bs-2', jointTypeId: 'joint-shoulder', seq: 2, action: '拆卸', direction: '轴向', tool: '木槌', riskNote: '沿腿足方向退出，不在抱肩薄壁处施力。', holdSec: 9 },
  { id: 'step-bs-3', jointTypeId: 'joint-shoulder', seq: 3, action: '装配', direction: '斜向', tool: '木槌', riskNote: '抱肩弧面完全贴服后再压实定位。', holdSec: 10 },
]

const diagramSeeds: Diagram[] = [
  {
    id: 'diagram-dovetail',
    jointTypeId: 'joint-dovetail',
    stepId: 'step-dt-1',
    title: '燕尾榫轴向拆解',
    view: '轴测',
    svgMarkup: makeSeedSvg('燕尾榫 · 轴测拆解', ['member-dt-tenon', 'member-dt-frame', 'member-dt-socket'], ['榫头', '大边', '榫眼']),
    hitAreas: [
      { id: 'hit-dt-tenon', memberId: 'member-dt-tenon', label: '榫头', points: '40,188 190,188 214,252 18,252' },
      { id: 'hit-dt-frame', memberId: 'member-dt-frame', label: '大边', points: '196,50 324,50 324,148 196,148' },
      { id: 'hit-dt-socket', memberId: 'member-dt-socket', label: '榫眼', points: '336,116 498,116 498,254 352,254' },
    ],
  },
  {
    id: 'diagram-mitre',
    jointTypeId: 'joint-mitre',
    stepId: 'step-mt-1',
    title: '格肩榫斜肩检查',
    view: '正视',
    svgMarkup: makeSeedSvg('格肩榫 · 正面试合', ['member-mt-tenon', 'member-mt-socket', 'member-mt-rail'], ['榫头', '榫眼', '抹头']),
    hitAreas: [
      { id: 'hit-mt-tenon', memberId: 'member-mt-tenon', label: '榫头', points: '40,188 190,188 214,252 18,252' },
      { id: 'hit-mt-socket', memberId: 'member-mt-socket', label: '榫眼', points: '196,50 324,50 324,148 196,148' },
      { id: 'hit-mt-rail', memberId: 'member-mt-rail', label: '抹头', points: '336,116 498,116 498,254 352,254' },
    ],
  },
  {
    id: 'diagram-corner',
    jointTypeId: 'joint-corner',
    stepId: 'step-zj-1',
    title: '粽角榫三向咬合',
    view: '俯视',
    svgMarkup: makeSeedSvg('粽角榫 · 三向咬合', ['member-zj-frame', 'member-zj-socket', 'member-zj-rail'], ['大边', '榫眼', '抹头']),
    hitAreas: [
      { id: 'hit-zj-frame', memberId: 'member-zj-frame', label: '大边', points: '40,188 190,188 214,252 18,252' },
      { id: 'hit-zj-socket', memberId: 'member-zj-socket', label: '榫眼', points: '196,50 324,50 324,148 196,148' },
      { id: 'hit-zj-rail', memberId: 'member-zj-rail', label: '抹头', points: '336,116 498,116 498,254 352,254' },
    ],
  },
  {
    id: 'diagram-shoulder',
    jointTypeId: 'joint-shoulder',
    stepId: 'step-bs-1',
    title: '抱肩榫圆弧贴合',
    view: '轴测',
    svgMarkup: makeSeedSvg('抱肩榫 · 圆弧贴合', ['member-bs-tenon', 'member-bs-socket', 'member-bs-rail'], ['榫头', '榫眼', '抹头']),
    hitAreas: [
      { id: 'hit-bs-tenon', memberId: 'member-bs-tenon', label: '榫头', points: '40,188 190,188 214,252 18,252' },
      { id: 'hit-bs-socket', memberId: 'member-bs-socket', label: '榫眼', points: '196,50 324,50 324,148 196,148' },
      { id: 'hit-bs-rail', memberId: 'member-bs-rail', label: '抹头', points: '336,116 498,116 498,254 352,254' },
    ],
  },
]

const jointSeeds: JointType[] = [
  { id: 'joint-dovetail', name: '燕尾榫', family: '出头', difficulty: '入门', strengthNote: '齿肩互锁，抵抗水平拉脱，同时允许木材轻微呼吸。', glueNeeded: false },
  { id: 'joint-mitre', name: '格肩榫', family: '闷榫', difficulty: '进阶', strengthNote: '暗榫承担拉力，格肩封闭端面，适合框料角部。', glueNeeded: true },
  { id: 'joint-corner', name: '粽角榫', family: '出头', difficulty: '高难', strengthNote: '三向互扣，节点刚度高，适合桌案与床架的角部。', glueNeeded: true },
  { id: 'joint-shoulder', name: '抱肩榫', family: '圆材', difficulty: '高难', strengthNote: '牙板抱合腿足，弧面分散压力并限制侧向晃动。', glueNeeded: false },
]

const furnitureSeeds: Furniture[] = [
  { id: 'furniture-quanyi', jointTypeId: 'joint-shoulder', name: '圈椅', era: '明式', position: '扶手与联帮棍交接处', loadNote: '抱肩弧面分担手臂压力，使圆材连接保持顺纹完整。' },
  { id: 'furniture-tiaoan', jointTypeId: 'joint-dovetail', name: '条案', era: '明式', position: '翘头与大边端部', loadNote: '燕尾齿肩抵抗案面横向收缩，减少端面开缝。' },
  { id: 'furniture-jiazichuang', jointTypeId: 'joint-corner', name: '架子床', era: '明末清初', position: '围子转角与立柱交会处', loadNote: '三向咬合控制床架角部扭动，保证立柱垂直。' },
  { id: 'furniture-guanmaoyi', jointTypeId: 'joint-mitre', name: '官帽椅', era: '明式', position: '搭脑与后腿交接处', loadNote: '格肩封闭可见端面，暗榫承受靠背反复拉力。' },
  { id: 'furniture-fangzhuo', jointTypeId: 'joint-corner', name: '方桌', era: '清式', position: '桌面边框三材交汇处', loadNote: '粽角结构把桌面荷载分配到相邻两向构件。' },
  { id: 'furniture-guijia', jointTypeId: 'joint-dovetail', name: '柜架', era: '明清', position: '柜体侧板与横枨端部', loadNote: '燕尾榫限制横枨外拔，兼顾客体板面伸缩。' },
]

export const db = new MortiseDatabase()

async function writeSeedData(): Promise<void> {
  await db.transaction('rw', [db.joints, db.members, db.steps, db.diagrams, db.furniture], async () => {
    await db.joints.bulkAdd(jointSeeds.map((item) => ({ ...item, schemaRev: 2 })))
    await db.members.bulkAdd(memberSeeds.map((item) => ({ ...item, schemaRev: 2 })))
    await db.steps.bulkAdd(stepSeeds.map((item) => ({ ...item, schemaRev: 2 })))
    await db.diagrams.bulkAdd(diagramSeeds.map((item) => ({ ...item, schemaRev: 2 })))
    await db.furniture.bulkAdd(furnitureSeeds.map((item) => ({ ...item, schemaRev: 2 })))
  })
}

export async function ensureSeedData(): Promise<void> {
  if (await db.joints.count() > 0) return
  await writeSeedData()
}

db.on('populate', () => writeSeedData())

export type { HitArea }
