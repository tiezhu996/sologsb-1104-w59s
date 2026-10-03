import type { Diagram } from '../types/diagram'
import type { Furniture } from '../types/furniture'
import type { JointType } from '../types/jointType'
import type { Member } from '../types/member'
import type { DisassemblyStep } from '../types/step'
import type {
  JointCatalogEntry,
  VolumeEnvelope,
  VolumeIssue,
  VolumeManifest,
  VolumePayload,
  VolumeSetValidation,
} from '../types/volume'
import {
  CHECKSUM_HEX_LENGTH,
  VOLUME_FORMAT,
  VOLUME_FORMAT_VERSION,
  VOLUME_SCHEMA_REV,
} from '../types/volume'

export class VolumePackError extends Error {
  constructor(
    message: string,
    readonly reason: 'oversized' | 'missing-data',
  ) {
    super(message)
    this.name = 'VolumePackError'
  }
}

/** 一个榫卯的完整资料：榫卯本体、构件、拆装步骤、示意图——分卷的最小原子单位。 */
export interface JointBundle {
  joint: JointType
  members: Member[]
  steps: DisassemblyStep[]
  diagrams: Diagram[]
}

interface VolumeBucket {
  joints: JointType[]
  members: Member[]
  steps: DisassemblyStep[]
  diagrams: Diagram[]
  furniture: Furniture[]
  definesJoints: string[]
  referencesJoints: string[]
  furnitureIds: string[]
}

export interface VolumePlan {
  volumeNo: number
  payload: VolumePayload
  definesJoints: string[]
  referencesJoints: string[]
  furnitureIds: string[]
}

export interface VolumePlanResult {
  setId: string
  createdAt: string
  capacityBytes: number
  jointCatalog: JointCatalogEntry[]
  volumes: VolumePlan[]
}

export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length
}

/** 键排序的规范化 JSON，保证校验和在重新解析后仍可复现。 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function emptyBucket(): VolumeBucket {
  return {
    joints: [],
    members: [],
    steps: [],
    diagrams: [],
    furniture: [],
    definesJoints: [],
    referencesJoints: [],
    furnitureIds: [],
  }
}

/** 以全量榫卯目录的字节数上界预留余量，保证最终成品卷必然不超容量。 */
function buildCatalogSlack(furnitureInOrder: Furniture[], bundles: Map<string, JointBundle>): JointCatalogEntry[] {
  const distinctJoints = Array.from(new Set(furnitureInOrder.map((item) => item.jointTypeId)))
  const maxIdLength = distinctJoints.reduce((max, id) => Math.max(max, id.length), 1)
  const digitCount = String(Math.max(1, furnitureInOrder.length)).length
  const definedInPad = Number('9'.repeat(digitCount))
  return distinctJoints.map((jointId) => ({
    jointId: 'x'.repeat(maxIdLength).replace(/x/g, jointId[0] ?? 'x').padEnd(maxIdLength, '0'),
    definedIn: definedInPad,
  }))
}

function buildProvisionalEnvelope(
  setId: string,
  createdAt: string,
  capacityBytes: number,
  volumeNo: number,
  totalVolumes: number,
  plan: Pick<VolumePlan, 'payload' | 'definesJoints' | 'referencesJoints' | 'furnitureIds'>,
  catalog: JointCatalogEntry[],
): VolumeEnvelope {
  const manifest: VolumeManifest = {
    format: VOLUME_FORMAT,
    formatVersion: VOLUME_FORMAT_VERSION,
    schemaRev: VOLUME_SCHEMA_REV,
    setId,
    volumeNo,
    totalVolumes,
    createdAt,
    capacityBytes,
    sizeBytes: byteLength(JSON.stringify(plan.payload)),
    furnitureIds: plan.furnitureIds,
    definesJoints: plan.definesJoints,
    referencesJoints: plan.referencesJoints,
    jointCatalog: catalog,
    checksum: '0'.repeat(CHECKSUM_HEX_LENGTH),
  }
  return { manifest, data: plan.payload }
}

function candidateEnvelope(
  bucket: VolumeBucket,
  context: {
    setId: string
    createdAt: string
    capacityBytes: number
    futureVolumeNo: number
    totalVolumes: number
    catalogSlack: JointCatalogEntry[]
  },
): VolumeEnvelope {
  return buildProvisionalEnvelope(
    context.setId,
    context.createdAt,
    context.capacityBytes,
    context.futureVolumeNo,
    context.totalVolumes,
    {
      payload: {
        joints: bucket.joints,
        members: bucket.members,
        steps: bucket.steps,
        diagrams: bucket.diagrams,
        furniture: bucket.furniture,
      },
      definesJoints: bucket.definesJoints,
      referencesJoints: bucket.referencesJoints,
      furnitureIds: bucket.furnitureIds,
    },
    context.catalogSlack,
  )
}

function envelopeBytes(envelope: VolumeEnvelope): number {
  return byteLength(JSON.stringify(envelope))
}

/**
 * 按家具顺序贪心分批：家具逐条入当前卷；
 * 榫卯完整资料作为原子整体只放入首卷，放不下就封卷新开；
 * 同一榫卯的资料不会散落到多卷。
 */
export function createVolumePlan(params: {
  furnitureInOrder: Furniture[]
  bundlesByJoint: Map<string, JointBundle>
  capacityBytes: number
  setId: string
  createdAt: string
}): VolumePlanResult {
  const { furnitureInOrder, bundlesByJoint, capacityBytes, setId, createdAt } = params
  if (!furnitureInOrder.length) throw new VolumePackError('至少需要选择一件家具。', 'missing-data')

  const catalogSlack = buildCatalogSlack(furnitureInOrder, bundlesByJoint)
  const owners = new Map<string, number>()
  const buckets: VolumeBucket[] = []
  let current = emptyBucket()

  const contextFor = (futureVolumeNo: number) => ({
    setId,
    createdAt,
    capacityBytes,
    futureVolumeNo,
    totalVolumes: furnitureInOrder.length,
    catalogSlack,
  })

  for (const item of furnitureInOrder) {
    const jointId = item.jointTypeId
    const bundle = bundlesByJoint.get(jointId)
    if (!bundle) {
      throw new VolumePackError(
        `家具「${item.name}」关联的榫卯资料缺失（${jointId}），无法打包。`,
        'missing-data',
      )
    }

    const ownerVolumeNo = owners.get(jointId)
    if (ownerVolumeNo === undefined) {
      // 首次出现：榫头、构件、步骤、示意图与本件家具关系一起整体进卷。
      const trial: VolumeBucket = {
        ...current,
        joints: [...current.joints, bundle.joint],
        members: [...current.members, ...bundle.members],
        steps: [...current.steps, ...bundle.steps],
        diagrams: [...current.diagrams, ...bundle.diagrams],
        furniture: [...current.furniture, item],
        definesJoints: [...current.definesJoints, jointId],
        furnitureIds: [...current.furnitureIds, item.id],
      }

      if (envelopeBytes(candidateEnvelope(trial, contextFor(buckets.length + 1))) <= capacityBytes) {
        current = trial
        owners.set(jointId, buckets.length + 1)
        continue
      }

      // 当前卷装不下：若已有家具则先封卷，再用空卷整体重试，保证榫卯资料不散卷。
      if (current.furniture.length > 0) buckets.push(current)
      current = emptyBucket()
      current.joints.push(bundle.joint)
      current.members.push(...bundle.members)
      current.steps.push(...bundle.steps)
      current.diagrams.push(...bundle.diagrams)
      current.furniture.push(item)
      current.definesJoints.push(jointId)
      current.furnitureIds.push(item.id)

      if (envelopeBytes(candidateEnvelope(current, contextFor(buckets.length + 1))) <= capacityBytes) {
        owners.set(jointId, buckets.length + 1)
        continue
      }

      throw new VolumePackError(
        `榫卯「${bundle.joint.name}」的完整资料（含构件、步骤、示意图）超过单卷容量，任何 U 盘都装不下，请换更大的容量。`,
        'oversized',
      )
    }

    // 榫卯已在更早的卷保存：本卷只放家具关系，清单里引用。
    current.furniture.push(item)
    current.furnitureIds.push(item.id)
    if (!current.referencesJoints.includes(jointId)) current.referencesJoints.push(jointId)

    if (envelopeBytes(candidateEnvelope(current, contextFor(buckets.length + 1))) <= capacityBytes) continue

    // 当前卷封卷，家具转入下一卷（引用在新卷里同样成立）。
    buckets.push(current)
    current = emptyBucket()
    current.furniture.push(item)
    current.furnitureIds.push(item.id)
    current.referencesJoints.push(jointId)

    if (envelopeBytes(candidateEnvelope(current, contextFor(buckets.length + 1))) > capacityBytes) {
      throw new VolumePackError(
        `单件家具「${item.name}」的关系记录超过单卷容量，请换更大的容量。`,
        'oversized',
      )
    }
  }

  if (current.furniture.length > 0 || buckets.length === 0) buckets.push(current)

  const jointCatalog: JointCatalogEntry[] = []
  for (const bucket of buckets) {
    for (const jointId of bucket.definesJoints) jointCatalog.push({ jointId, definedIn: 0 })
  }
  jointCatalog.forEach((entry) => {
    entry.definedIn = owners.get(entry.jointId) ?? 0
  })

  const volumes: VolumePlan[] = buckets.map((bucket, index) => ({
    volumeNo: index + 1,
    payload: {
      joints: bucket.joints,
      members: bucket.members,
      steps: bucket.steps,
      diagrams: bucket.diagrams,
      furniture: bucket.furniture,
    },
    definesJoints: bucket.definesJoints,
    referencesJoints: bucket.referencesJoints,
    furnitureIds: bucket.furnitureIds,
  }))

  return { setId, createdAt, capacityBytes, jointCatalog, volumes }
}

/** 给计划卷生成正式清单与校验和，并复核容量。 */
export async function finalizeVolumeEnvelope(plan: VolumePlanResult, volumeNo: number): Promise<VolumeEnvelope> {
  const volume = plan.volumes[volumeNo - 1]
  if (!volume) throw new Error(`卷号 ${volumeNo} 不在计划内。`)

  const manifestWithoutChecksum: Omit<VolumeManifest, 'checksum'> = {
    format: VOLUME_FORMAT,
    formatVersion: VOLUME_FORMAT_VERSION,
    schemaRev: VOLUME_SCHEMA_REV,
    setId: plan.setId,
    volumeNo,
    totalVolumes: plan.volumes.length,
    createdAt: plan.createdAt,
    capacityBytes: plan.capacityBytes,
    sizeBytes: byteLength(JSON.stringify(volume.payload)),
    furnitureIds: volume.furnitureIds,
    definesJoints: volume.definesJoints,
    referencesJoints: volume.referencesJoints,
    jointCatalog: plan.jointCatalog,
  }
  const checksum = await sha256Hex(
    stableStringify({ manifest: manifestWithoutChecksum, data: volume.payload }),
  )
  const envelope: VolumeEnvelope = { manifest: { ...manifestWithoutChecksum, checksum }, data: volume.payload }

  if (envelopeBytes(envelope) > plan.capacityBytes) {
    throw new VolumePackError(`第 ${volumeNo} 卷成品超出容量，请重新分包。`, 'oversized')
  }
  return envelope
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export type CoerceResult =
  | { ok: true; envelope: VolumeEnvelope }
  | { ok: false; issue: VolumeIssue }

/** 解析单个资料卷文件：识别格式、版本，并重算校验和。 */
export async function coerceEnvelope(raw: unknown, fileName: string): Promise<CoerceResult> {
  if (!isRecord(raw) || !isRecord(raw.manifest) || !isRecord(raw.data)) {
    return { ok: false, issue: { code: 'PARSE_ERROR', message: `「${fileName}」不是资料卷文件。` } }
  }
  const manifest = raw.manifest
  if (manifest.format !== VOLUME_FORMAT) {
    return { ok: false, issue: { code: 'FOREIGN_FILE', message: `「${fileName}」不是本工坊的资料卷。` } }
  }
  if (manifest.formatVersion !== VOLUME_FORMAT_VERSION) {
    return {
      ok: false,
      issue: {
        code: 'VERSION_MISMATCH',
        message: `「${fileName}」资料卷版本为 ${String(manifest.formatVersion)}，当前仅支持版本 ${VOLUME_FORMAT_VERSION}，已停止导入。`,
      },
    }
  }
  if (manifest.schemaRev !== VOLUME_SCHEMA_REV) {
    return {
      ok: false,
      issue: {
        code: 'VERSION_MISMATCH',
        message: `「${fileName}」数据模型版本为 ${String(manifest.schemaRev)}，当前版本为 ${VOLUME_SCHEMA_REV}，已停止导入。`,
      },
    }
  }

  const volumeNo = Number(manifest.volumeNo)
  const totalVolumes = Number(manifest.totalVolumes)
  if (
    typeof manifest.setId !== 'string' ||
    !Number.isInteger(volumeNo) ||
    !Number.isInteger(totalVolumes) ||
    volumeNo < 1 ||
    totalVolumes < 1 ||
    volumeNo > totalVolumes ||
    typeof manifest.checksum !== 'string'
  ) {
    return { ok: false, issue: { code: 'MALFORMED', message: `「${fileName}」清单字段不完整。` } }
  }
  for (const key of ['joints', 'members', 'steps', 'diagrams', 'furniture'] as const) {
    if (!Array.isArray(raw.data[key])) {
      return { ok: false, issue: { code: 'MALFORMED', volumeNo, message: `第 ${volumeNo} 卷缺少 ${key} 数据。` } }
    }
  }

  const { checksum, ...manifestWithoutChecksum } = manifest as Partial<VolumeManifest> & { checksum?: string }
  const actualChecksum = await sha256Hex(stableStringify({ manifest: manifestWithoutChecksum, data: raw.data }))
  if (actualChecksum !== checksum) {
    return {
      ok: false,
      issue: { code: 'CHECKSUM_MISMATCH', volumeNo, message: `第 ${volumeNo} 卷校验和不一致，文件可能已损坏或被改动。` },
    }
  }

  return { ok: true, envelope: raw as unknown as VolumeEnvelope }
}

function issue(code: VolumeIssue['code'], message: string, volumeNo?: number): VolumeIssue {
  return { code, message, volumeNo }
}

/** 对同一套资料卷做全量交叉校验：齐套、版本、引用、目录一致。 */
export function validateVolumeSet(envelopes: VolumeEnvelope[]): VolumeSetValidation {
  const sorted = [...envelopes].sort((a, b) => a.manifest.volumeNo - b.manifest.volumeNo)
  const setId = sorted[0]?.manifest.setId ?? null
  const totalVolumes = sorted[0]?.manifest.totalVolumes ?? null
  const issues: VolumeIssue[] = []
  const received = sorted.map((item) => item.manifest.volumeNo)

  if (!sorted.length) {
    return { ok: false, setId: null, totalVolumes: null, received: [], missing: [], issues: [issue('MALFORMED', '没有可校验的资料卷。')] }
  }

  for (const envelope of sorted) {
    const m = envelope.manifest
    if (m.setId !== setId) issues.push(issue('MALFORMED', `第 ${m.volumeNo} 卷不属于当前这套资料卷。`, m.volumeNo))
    if (m.totalVolumes !== totalVolumes) issues.push(issue('MALFORMED', `第 ${m.volumeNo} 卷登记的总卷数不一致。`, m.volumeNo))
    if (m.formatVersion !== VOLUME_FORMAT_VERSION) issues.push(issue('VERSION_MISMATCH', `第 ${m.volumeNo} 卷格式版本不对。`, m.volumeNo))
    if (m.schemaRev !== VOLUME_SCHEMA_REV) issues.push(issue('VERSION_MISMATCH', `第 ${m.volumeNo} 卷数据版本不对。`, m.volumeNo))
  }

  const seen = new Set<number>()
  for (const envelope of sorted) {
    const no = envelope.manifest.volumeNo
    if (seen.has(no)) issues.push(issue('DUPLICATE_RECORD', `第 ${no} 卷收到了重复文件。`, no))
    seen.add(no)
  }

  const expected = Array.from({ length: totalVolumes ?? 0 }, (_, index) => index + 1)
  const missing = expected.filter((no) => !seen.has(no))
  if (missing.length) {
    issues.push(issue('MISSING_VOLUMES', `缺少第 ${missing.join('、')} 卷，已保留收到的卷，补齐后再校验。`))
  }

  const baseCatalog = sorted[0].manifest.jointCatalog
  for (const envelope of sorted) {
    const m = envelope.manifest
    const catalogKey = (entries: JointCatalogEntry[]) =>
      entries
        .map((entry) => `${entry.jointId}@${entry.definedIn}`)
        .sort()
        .join('|')
    if (catalogKey(m.jointCatalog) !== catalogKey(baseCatalog)) {
      issues.push(issue('MALFORMED', `第 ${m.volumeNo} 卷的榫卯目录与首卷不一致。`, m.volumeNo))
    }

    const definedByCatalog = new Map(m.jointCatalog.map((entry) => [entry.jointId, entry.definedIn]))
    for (const jointId of m.definesJoints) {
      if (definedByCatalog.get(jointId) !== m.volumeNo) {
        issues.push(issue('BROKEN_REFERENCE', `第 ${m.volumeNo} 卷声称包含榫卯 ${jointId}，但目录登记不在本卷。`, m.volumeNo))
      }
      if (!envelope.data.joints.some((joint) => joint.id === jointId)) {
        issues.push(issue('BROKEN_REFERENCE', `第 ${m.volumeNo} 卷清单列出榫卯 ${jointId}，卷内却没有完整资料。`, m.volumeNo))
      }
    }
    for (const jointId of m.referencesJoints) {
      const definedIn = definedByCatalog.get(jointId)
      if (definedIn === undefined) {
        issues.push(issue('BROKEN_REFERENCE', `第 ${m.volumeNo} 卷引用了榫卯 ${jointId}，整套卷中都没有其资料。`, m.volumeNo))
      } else if (definedIn >= m.volumeNo) {
        issues.push(issue('BROKEN_REFERENCE', `第 ${m.volumeNo} 卷引用的榫卯 ${jointId} 未保存在更早的卷中。`, m.volumeNo))
      }
      if (envelope.data.joints.some((joint) => joint.id === jointId)) {
        issues.push(issue('BROKEN_REFERENCE', `榫卯 ${jointId} 的资料在第 ${m.volumeNo} 卷重复出现，违反“共用榫卯只存首卷”。`, m.volumeNo))
      }
    }
    if (m.furnitureIds.length !== envelope.data.furniture.length) {
      issues.push(issue('MALFORMED', `第 ${m.volumeNo} 卷家具清单与卷内家具关系数量不符。`, m.volumeNo))
    }
  }

  return {
    ok: issues.length === 0,
    setId,
    totalVolumes,
    received,
    missing,
    issues,
  }
}

export function envelopeSizeBytes(envelope: VolumeEnvelope): number {
  return envelopeBytes(envelope)
}
