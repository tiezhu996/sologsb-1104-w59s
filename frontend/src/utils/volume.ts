import {
  MANIFEST_RESERVE_BYTES,
  VOLUME_FORMAT,
  VOLUME_FORMAT_VERSION,
  type VolumeDataCollections,
  type VolumeFurnitureManifestItem,
  type VolumeFile,
  type VolumeJointReference,
  type VolumeManifest,
  type VolumePayload,
} from '../types/volume'
import type { Diagram, HitArea } from '../types/diagram'
import type { Furniture } from '../types/furniture'
import type { JointType } from '../types/jointType'
import type { Member } from '../types/member'
import type { DisassemblyStep } from '../types/step'

export class VolumeValidationError extends Error {}

interface PackUnit {
  furniture: Furniture
  joint: JointType
  members: Member[]
  steps: DisassemblyStep[]
  diagrams: Diagram[]
  payloadBytes: number
  isJointFirst: boolean
}

interface PackGroup { units: PackUnit[]; payloadBytes: number }
export interface PlannedVolume { manifest: Omit<VolumeManifest, 'format' | 'formatVersion' | 'createdAt' | 'capacityBytes' | 'sizeBytes'>; payload: VolumePayload }
export interface FurnitureVolumePlan { setId: string; volumes: PlannedVolume[] }

const encoder = new TextEncoder()

export function measurePayloadBytes(payload: VolumePayload, pretty = true): number {
  return encoder.encode(JSON.stringify(payload, null, pretty ? 2 : 0)).byteLength
}

function emptyPayload(): VolumePayload { return { joints: [], members: [], steps: [], diagrams: [], furniture: [] } }

function unique<T>(items: T[]): T[] { return Array.from(new Set(items)) }

function buildUnit(data: VolumeDataCollections, furniture: Furniture, isJointFirst: boolean): PackUnit {
  const joint = data.joints.find((item) => item.id === furniture.jointTypeId)
  if (!joint) throw new VolumeValidationError(`家具“${furniture.name}”引用的榫卯 ${furniture.jointTypeId} 不存在，不能打包。`)
  const members = data.members.filter((item) => item.jointTypeId === joint.id)
  const steps = data.steps.filter((item) => item.jointTypeId === joint.id)
  const diagrams = data.diagrams.filter((item) => item.jointTypeId === joint.id)
  if (members.length === 0 || steps.length === 0 || diagrams.length === 0) {
    throw new VolumeValidationError(`榫卯“${joint.name}”缺少构件、步骤或示意图，资料不完整，不能散卷。`)
  }
  const payload: VolumePayload = {
    joints: isJointFirst ? [joint] : [],
    members: isJointFirst ? members : [],
    steps: isJointFirst ? steps : [],
    diagrams: isJointFirst ? diagrams : [],
    furniture: [furniture],
  }
  return { furniture, joint, members, steps, diagrams, payloadBytes: measurePayloadBytes(payload), isJointFirst }
}

function groupUnits(units: PackUnit[], capacityBytes: number, manifestReserveBytes: number): PackGroup[] {
  const usable = capacityBytes - manifestReserveBytes
  if (!Number.isFinite(usable) || usable <= 0) throw new VolumeValidationError('U盘容量必须大于清单预留空间。')
  const groups: PackGroup[] = []
  let current: PackGroup = { units: [], payloadBytes: 2 }
  for (const unit of units) {
    if (unit.payloadBytes > usable) {
      throw new VolumeValidationError(`家具“${unit.furniture.name}”的一个完整榫卯资料包已有 ${unit.payloadBytes} B，超过单卷可用容量 ${usable} B；同一榫卯资料不能拆卷。`)
    }
    const nextSize = current.payloadBytes + unit.payloadBytes
    if (current.units.length > 0 && nextSize > usable) {
      groups.push(current)
      current = { units: [], payloadBytes: 2 }
    }
    current.units.push(unit)
    current.payloadBytes = current.payloadBytes === 2 && current.units.length === 1
      ? unit.payloadBytes
      : current.payloadBytes + unit.payloadBytes
  }
  if (current.units.length > 0) groups.push(current)
  return groups
}

function mergePayload(units: PackUnit[]): VolumePayload {
  const payload = emptyPayload()
  const jointIds = new Set<string>()
  const memberIds = new Set<string>()
  const stepIds = new Set<string>()
  const diagramIds = new Set<string>()
  for (const unit of units) {
    payload.furniture.push(unit.furniture)
    if (unit.isJointFirst && !jointIds.has(unit.joint.id)) {
      jointIds.add(unit.joint.id)
      payload.joints.push(unit.joint)
      unit.members.filter((item) => !memberIds.has(item.id)).forEach((item) => { memberIds.add(item.id); payload.members.push(item) })
      unit.steps.filter((item) => !stepIds.has(item.id)).forEach((item) => { stepIds.add(item.id); payload.steps.push(item) })
      unit.diagrams.filter((item) => !diagramIds.has(item.id)).forEach((item) => { diagramIds.add(item.id); payload.diagrams.push(item) })
    }
  }
  return payload
}

function buildPlannedVolumes(groups: PackGroup[], jointFirstVolume: Map<string, number>): PlannedVolume[] {
  return groups.map((group, index) => {
    const volumeNo = index + 1
    const units = group.units
    const includedJointIds = unique(units.filter((unit) => unit.isJointFirst).map((unit) => unit.joint.id))
    const jointReferences: VolumeJointReference[] = unique(units
      .filter((unit) => !unit.isJointFirst)
      .map((unit) => `${unit.joint.id}:${jointFirstVolume.get(unit.joint.id) ?? 0}`))
      .map((value) => {
        const [jointTypeId, volumeNo] = value.split(':')
        return { jointTypeId: jointTypeId as string, volumeNo: Number(volumeNo) }
      })
      .filter((reference) => reference.volumeNo !== volumeNo)
    const furniture: VolumeFurnitureManifestItem[] = units.map((unit) => ({
      id: unit.furniture.id, name: unit.furniture.name, jointTypeId: unit.joint.id,
    }))
    return {
      manifest: {
        setId: '',
        volumeNo,
        totalVolumes: groups.length,
        furnitureIds: units.map((unit) => unit.furniture.id),
        furniture,
        includedJointIds,
        jointReferences,
        selectionOrder: units.map((unit) => unit.furniture.id),
      },
      payload: mergePayload(units),
    }
  })
}

function createSetId(units: PackUnit[]): string {
  const source = `${new Date().toISOString()}-${units.map((unit) => unit.furniture.id).join('|')}`
  let hash = 2166136261
  const bytes = encoder.encode(source)
  bytes.forEach((byte) => { hash = Math.imul(hash ^ byte, 16777619) })
  const random = Math.random().toString(36).slice(2, 8)
  return `${(hash >>> 0).toString(36)}-${random}`
}

export function buildFurniturePlan(data: VolumeDataCollections, selectedFurnitureIds: string[], capacityBytes: number, manifestReserveBytes = MANIFEST_RESERVE_BYTES): FurnitureVolumePlan {
  if (!Number.isInteger(capacityBytes) || capacityBytes <= 0) throw new VolumeValidationError('请输入有效的U盘固定容量（字节）。')
  if (selectedFurnitureIds.length === 0) throw new VolumeValidationError('请先选择要制作资料卷的家具。')
  const byId = new Map(data.furniture.map((item) => [item.id, item]))
  const selected = selectedFurnitureIds.map((id) => byId.get(id)).filter((item): item is Furniture => Boolean(item))
  if (selected.length !== unique(selectedFurnitureIds).length) throw new VolumeValidationError('选择的家具有缺失记录，请刷新后重试。')

  const firstJointSeen = new Set<string>()
  const units = selected.map((furniture) => {
    const isJointFirst = !firstJointSeen.has(furniture.jointTypeId)
    firstJointSeen.add(furniture.jointTypeId)
    return buildUnit(data, furniture, isJointFirst)
  })

  let groups = groupUnits(units, capacityBytes, manifestReserveBytes)
  let firstVolumeByGroup = new Map<string, number>()
  for (let attempt = 0; attempt < 6; attempt += 1) {
    firstVolumeByGroup = new Map<string, number>()
    groups.forEach((group, groupIndex) => {
      group.units.forEach((unit) => {
        if (unit.isJointFirst && !firstVolumeByGroup.has(unit.joint.id)) firstVolumeByGroup.set(unit.joint.id, groupIndex + 1)
      })
    })
    const planned = buildPlannedVolumes(groups, firstVolumeByGroup)
    const createdAt = new Date().toISOString()
    const oversized = planned.find((volume) => {
      const manifest: VolumeManifest = {
        ...volume.manifest, format: VOLUME_FORMAT, formatVersion: VOLUME_FORMAT_VERSION,
        createdAt, capacityBytes, sizeBytes: 0,
      }
      const json = JSON.stringify({ manifest, payload: volume.payload }, null, 2)
      return encoder.encode(json).byteLength > capacityBytes
    })
    if (!oversized) {
      const setId = createSetId(units)
      return { setId, volumes: planned.map((volume) => ({ ...volume, manifest: { ...volume.manifest, setId } })) }
    }
    groups = groupUnits(units, capacityBytes, manifestReserveBytes + 256 * (attempt + 1))
  }
  throw new VolumeValidationError('容量不足：即使预留完整清单空间，仍无法把这些家具分卷写入U盘。')
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function requireString(value: unknown, field: string, errors: string[], volumeNo?: number): value is string {
  const prefix = volumeNo ? `第${volumeNo}卷：` : ''
  if (typeof value !== 'string' || value.length === 0) { errors.push(`${prefix}字段 ${field} 必须是非空字符串`); return false }
  return true
}
function requireArray(value: unknown, field: string, errors: string[], volumeNo?: number): value is unknown[] {
  const prefix = volumeNo ? `第${volumeNo}卷：` : ''
  if (!Array.isArray(value)) { errors.push(`${prefix}字段 ${field} 必须是数组`); return false }
  return true
}
function checkBaseRecord(record: Record<string, unknown>, idField: string, errors: string[], volumeNo: number): boolean {
  let valid = true
  valid = requireString(record[idField], idField, errors, volumeNo) && valid
  if (record.schemaRev !== undefined && record.schemaRev !== VOLUME_FORMAT_VERSION) {
    errors.push(`第${volumeNo}卷：记录 ${String(record[idField] ?? '')} 的 schemaRev=${String(record.schemaRev)}，与资料卷版本 ${VOLUME_FORMAT_VERSION} 不一致`)
    valid = false
  }
  return valid
}

function validateArrays(payload: Record<string, unknown>, errors: string[], volumeNo: number): payload is Partial<Record<keyof VolumePayload, unknown[]>> & Record<string, unknown> {
  return ['joints', 'members', 'steps', 'diagrams', 'furniture'].every((field) => requireArray(payload[field], field, errors, volumeNo))
}


interface ParsedVolume { no: number; m: Record<string, unknown>; p: Record<string, unknown[]>; raw: unknown }

export function assertVolumeSet(input: unknown): void {
  const errors: string[] = []
  if (!Array.isArray(input) || input.length === 0) throw new VolumeValidationError('没有可校验的资料卷。')

  const parsed: ParsedVolume[] = []
  input.forEach((raw) => {
    if (!isRecord(raw) || !isRecord(raw.manifest) || !isRecord(raw.payload)) { errors.push('存在不是资料卷对象的文件'); return }
    const m = raw.manifest
    const payloadRecord = raw.payload
    if (typeof m.volumeNo !== 'number') { errors.push('存在缺少卷号的资料卷'); return }
    const pArrays: Record<string, unknown[]> = {}
    const fields: Array<keyof VolumePayload> = ['joints', 'members', 'steps', 'diagrams', 'furniture']
    let arraysOk = true
    fields.forEach((field) => {
      if (Array.isArray(payloadRecord[field])) pArrays[field] = payloadRecord[field] as unknown[]
      else { arraysOk = false; errors.push(`第${m.volumeNo}卷：字段 ${field} 必须是数组`) }
    })
    if (!arraysOk) return
    parsed.push({ no: m.volumeNo, m, p: pArrays as Record<string, unknown[]>, raw })
  })

  const first = parsed.find((item) => item.no === 1) ?? parsed[0]
  const total = first && typeof first.m.totalVolumes === 'number' ? first.m.totalVolumes : 0
  const setId = first && typeof first.m.setId === 'string' ? first.m.setId : null
  if (total > 0 && input.length !== total) errors.push(`应收到 ${total} 卷，实际只有 ${input.length} 卷`)

  const seenVolumeNos = new Set<number>()
  const jointVolume = new Map<string, number>()
  const allJoints = new Set<string>()
  const allFurniture = new Set<string>()
  const memberOwners = new Map<string, number>()
  const stepOwners = new Map<string, number>()
  const diagramOwners = new Map<string, number>()

  parsed.forEach(({ no, m, raw }) => {
    if (m.format !== VOLUME_FORMAT) errors.push(`第${no}卷格式不是 ${VOLUME_FORMAT}`)
    if (m.formatVersion !== VOLUME_FORMAT_VERSION) errors.push(`第${no}卷版本 ${String(m.formatVersion)} 与要求版本 ${VOLUME_FORMAT_VERSION} 不一致`)
    if (m.setId !== setId) errors.push(`第${no}卷卷组编号不一致`)
    if (seenVolumeNos.has(no)) errors.push(`第${no}卷重复接收`)
    seenVolumeNos.add(no)
    if (m.totalVolumes !== total) errors.push(`第${no}卷总卷数标记不一致`)
    if (typeof m.capacityBytes !== 'number' || m.capacityBytes <= 0) errors.push(`第${no}卷容量标记无效`)
    if (typeof m.sizeBytes !== 'number' || m.sizeBytes <= 0) errors.push(`第${no}卷大小标记无效`)
    if (typeof m.capacityBytes === 'number' && typeof m.sizeBytes === 'number' && m.sizeBytes > m.capacityBytes) {
      errors.push(`第${no}卷超出U盘固定容量`)
    }
    void raw
  })

  parsed.forEach(({ no, p }) => {
    ;(p.joints as unknown[]).forEach((value) => {
      if (!isRecord(value) || !checkBaseRecord(value, 'id', errors, no)) return
      const id = value.id as string
      if (allJoints.has(id)) errors.push(`榫卯 ${id} 在多卷重复保存`)
      allJoints.add(id); jointVolume.set(id, no)
    })
    ;(p.members as unknown[]).forEach((value) => {
      if (!isRecord(value) || !checkBaseRecord(value, 'id', errors, no)) return
      if (typeof value.jointTypeId !== 'string') { errors.push(`第${no}卷构件 ${String(value.id)} 缺少 jointTypeId`); return }
      const existing = memberOwners.get(value.id as string)
      if (existing !== undefined && existing !== no) errors.push(`构件 ${String(value.id)} 被拆散到第${existing}、${no}卷`)
      memberOwners.set(value.id as string, no)
    })
    ;(p.steps as unknown[]).forEach((value) => {
      if (!isRecord(value) || !checkBaseRecord(value, 'id', errors, no)) return
      if (typeof value.jointTypeId !== 'string') { errors.push(`第${no}卷步骤 ${String(value.id)} 缺少 jointTypeId`); return }
      if (stepOwners.has(value.id as string)) errors.push(`步骤 ${String(value.id)} 重复`)
      stepOwners.set(value.id as string, no)
    })
    ;(p.diagrams as unknown[]).forEach((value) => {
      if (!isRecord(value) || !checkBaseRecord(value, 'id', errors, no)) return
      if (typeof value.jointTypeId !== 'string' || typeof value.stepId !== 'string') { errors.push(`第${no}卷示意图 ${String(value.id)} 缺少归属`); return }
      if (diagramOwners.has(value.id as string)) errors.push(`示意图 ${String(value.id)} 重复`)
      diagramOwners.set(value.id as string, no)
      if (!Array.isArray(value.hitAreas)) errors.push(`第${no}卷示意图 ${String(value.id)} 缺少热区清单`)
    })
    ;(p.furniture as unknown[]).forEach((value) => {
      if (!isRecord(value) || !checkBaseRecord(value, 'id', errors, no)) return
      if (typeof value.jointTypeId !== 'string') { errors.push(`第${no}卷家具关系 ${String(value.id)} 缺少 jointTypeId`); return }
      if (allFurniture.has(value.id as string)) errors.push(`家具关系 ${String(value.id)} 重复`)
      allFurniture.add(value.id as string)
    })
  })

  parsed.forEach(({ no, m, p }) => {
    const payload = p as unknown as VolumePayload
    payload.furniture.forEach((item) => {
      if (!allJoints.has(item.jointTypeId)) errors.push(`第${no}卷家具关系 ${item.id} 引用的榫卯 ${item.jointTypeId} 在整组卷中不存在`)
    })
    payload.members.forEach((item) => { if (!allJoints.has(item.jointTypeId)) errors.push(`第${no}卷构件 ${item.id} 的榫卯不存在`) })
    payload.steps.forEach((item) => { if (!allJoints.has(item.jointTypeId)) errors.push(`第${no}卷步骤 ${item.id} 的榫卯不存在`) })
    payload.diagrams.forEach((item) => { if (!allJoints.has(item.jointTypeId)) errors.push(`第${no}卷示意图 ${item.id} 的榫卯不存在`) })

    const refs = m.jointReferences
    if (!Array.isArray(refs)) errors.push(`第${no}卷缺少 jointReferences 清单`)
    else refs.forEach((value) => {
      if (!isRecord(value) || typeof value.jointTypeId !== 'string' || typeof value.volumeNo !== 'number') {
        errors.push(`第${no}卷榫卯引用格式不正确`); return
      }
      const owner = jointVolume.get(value.jointTypeId)
      if (owner === undefined) errors.push(`第${no}卷引用了整组卷中不存在的榫卯 ${value.jointTypeId}`)
      else if (owner !== value.volumeNo) errors.push(`第${no}卷清单声称榫卯 ${value.jointTypeId} 在第${value.volumeNo}卷，实际首存在第${owner}卷`)
      if (owner === no) errors.push(`第${no}卷清单引用的榫卯 ${value.jointTypeId} 已在本卷首存，引用无效`)
    })

    const included = m.includedJointIds
    if (!Array.isArray(included)) errors.push(`第${no}卷缺少 includedJointIds 清单`)
    else included.forEach((value) => {
      if (typeof value !== 'string' || jointVolume.get(value) !== no) errors.push(`第${no}卷清单包含榫卯 ${String(value)}，但资料未在本卷首存`)
    })

    payload.members.forEach((item) => {
      const owner = jointVolume.get(item.jointTypeId)
      if (owner !== undefined && owner !== no) errors.push(`构件 ${item.id} 与榫卯 ${item.jointTypeId} 分散在第${owner}卷和第${no}卷`)
    })
    payload.steps.forEach((item) => {
      const owner = jointVolume.get(item.jointTypeId)
      if (owner !== undefined && owner !== no) errors.push(`步骤 ${item.id} 与榫卯 ${item.jointTypeId} 分散在第${owner}卷和第${no}卷`)
    })
    payload.diagrams.forEach((item) => {
      const owner = jointVolume.get(item.jointTypeId)
      if (owner !== undefined && owner !== no) errors.push(`示意图 ${item.id} 与榫卯 ${item.jointTypeId} 分散在第${owner}卷和第${no}卷`)
      if (owner === no && !payload.steps.some((step) => step.id === item.stepId)) {
        errors.push(`第${no}卷示意图 ${item.id} 引用的步骤 ${item.stepId} 不在同一榫卯资料中`)
      }
    })

    if (!Array.isArray(m.furnitureIds) || !Array.isArray(m.furniture)) {
      errors.push(`第${no}卷家具清单字段缺失`)
    } else {
      const ids = m.furnitureIds as unknown[]
      if (ids.some((value) => typeof value !== 'string') || ids.join('|') !== payload.furniture.map((item) => item.id).join('|')) {
        errors.push(`第${no}卷家具清单顺序与家具关系数据不一致`)
      }
      ;(m.furniture as unknown[]).forEach((value) => {
        if (!isRecord(value) || typeof value.id !== 'string' || typeof value.jointTypeId !== 'string' ||
          !payload.furniture.some((item) => item.id === value.id && item.jointTypeId === value.jointTypeId)) {
          errors.push(`第${no}卷家具清单与关系数据不匹配`)
        }
      })
    }
  })

  for (let no = 1; no <= total; no += 1) {
    if (!seenVolumeNos.has(no)) errors.push(`缺少第 ${no} 卷`)
  }
  if (errors.length > 0) throw new VolumeValidationError(Array.from(new Set(errors)).join('；'))
}
