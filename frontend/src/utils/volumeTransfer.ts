import Dexie, { type Table } from 'dexie'
import { db as mainDb } from './db'
import {
  VOLUME_FORMAT,
  VOLUME_FORMAT_VERSION,
  type VolumeDataCollections,
  type VolumeFile,
  type VolumeManifest,
} from '../types/volume'
import { assertVolumeSet, buildFurniturePlan } from './volume'

interface TransferJobBase {
  id: string
  kind: 'pack' | 'import'
  status: 'active' | 'failed' | 'completed'
  totalVolumes: number
  completedVolumes: number[]
  createdAt: string
  updatedAt: string
  lastError: string | null
}

export interface PackTransferJob extends TransferJobBase {
  kind: 'pack'
  setId: string
  capacityBytes: number
  volumes: Array<{ manifest: VolumeManifest; json: string }>
}

interface StagedFile {
  name: string
  addedAt: string
  text: string
  detectedVolumeNo: number | null
  parseError: string | null
}

export interface ImportTransferJob extends TransferJobBase {
  kind: 'import'
  setId: string | null
  expectedVersion: number | null
  staged: StagedFile[]
}

export type TransferJob = PackTransferJob | ImportTransferJob

class TransferDatabase extends Dexie {
  transferJobs!: Table<TransferJob, string>

  constructor() {
    super('gbmortise-transfer-db')
    this.version(1).stores({
      transferJobs: 'id, kind, status, updatedAt',
    })
  }
}

export const transferDb = new TransferDatabase()

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function nowIso(): string {
  return new Date().toISOString()
}

function touch<T extends TransferJob>(job: T, patch: Partial<T>): T {
  return { ...job, ...patch, updatedAt: nowIso() }
}

export async function getLatestActiveJob(kind?: TransferJob['kind']): Promise<TransferJob | undefined> {
  const collection = kind
    ? transferDb.transferJobs.where('kind').equals(kind)
    : transferDb.transferJobs
  const jobs = await collection.toArray()
  return jobs
    .filter((job) => job.status === 'active' || job.status === 'failed')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
}

export async function listTransferJobs(): Promise<TransferJob[]> {
  const jobs = await transferDb.transferJobs.toArray()
  return jobs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function deleteTransferJob(jobId: string): Promise<void> {
  await transferDb.transferJobs.delete(jobId)
}

export async function loadTransferCollections(): Promise<VolumeDataCollections> {
  const [joints, members, steps, diagrams, furniture] = await Promise.all([
    mainDb.joints.toArray(),
    mainDb.members.toArray(),
    mainDb.steps.toArray(),
    mainDb.diagrams.toArray(),
    mainDb.furniture.toArray(),
  ])
  return { joints, members, steps, diagrams, furniture }
}

export async function createPackJob(furnitureIds: string[], capacityBytes: number): Promise<PackTransferJob> {
  const data = await loadTransferCollections()
  const plan = buildFurniturePlan(data, furnitureIds, capacityBytes)
  const timestamp = nowIso()
  const job: PackTransferJob = {
    id: createId('pack'),
    kind: 'pack',
    status: 'active',
    setId: plan.setId,
    totalVolumes: plan.volumes.length,
    capacityBytes,
    completedVolumes: [],
    volumes: plan.volumes.map((volume) => {
      const manifest: VolumeManifest = {
        format: VOLUME_FORMAT,
        formatVersion: VOLUME_FORMAT_VERSION,
        setId: plan.setId,
        createdAt: timestamp,
        volumeNo: volume.manifest.volumeNo,
        totalVolumes: volume.manifest.totalVolumes,
        capacityBytes,
        sizeBytes: 0,
        furnitureIds: volume.manifest.furnitureIds,
        furniture: volume.manifest.furniture,
        includedJointIds: volume.manifest.includedJointIds,
        jointReferences: volume.manifest.jointReferences,
        selectionOrder: volume.manifest.selectionOrder,
      }
      let json = JSON.stringify({ manifest, payload: volume.payload } satisfies VolumeFile, null, 2)
      for (let attempt = 0; attempt < 4; attempt += 1) {
        manifest.sizeBytes = new TextEncoder().encode(json).byteLength
        const nextJson = JSON.stringify({ manifest, payload: volume.payload } satisfies VolumeFile, null, 2)
        if (nextJson === json) break
        json = nextJson
      }
      return { manifest, json }
    }),
    createdAt: timestamp,
    updatedAt: timestamp,
    lastError: null,
  }

  const asserted = await assertVolumeSet(job.volumes.map((item) => {
    const parsed = JSON.parse(item.json) as VolumeFile
    return { manifest: parsed.manifest, payload: parsed.payload }
  }))
  void asserted
  await transferDb.transferJobs.add(job)
  return job
}

export async function markPackVolume(jobId: string, volumeNo: number): Promise<PackTransferJob> {
  const current = await requireJob(jobId, 'pack')
  if (current.id !== jobId) throw new Error('资料卷任务不匹配')
  if (!current.volumes.some((volume) => volume.manifest.volumeNo === volumeNo)) {
    throw new Error(`第 ${volumeNo} 卷不在打包清单中`)
  }
  const completedVolumes = current.completedVolumes.includes(volumeNo)
    ? current.completedVolumes
    : [...current.completedVolumes, volumeNo].sort((a, b) => a - b)
  const completed = completedVolumes.length === current.totalVolumes
  const updated = touch(current, {
    completedVolumes,
    status: completed ? 'completed' : 'active',
    lastError: completed ? null : current.lastError,
  })
  await transferDb.transferJobs.put(updated)
  return updated
}

export async function failPackJob(jobId: string, error: unknown): Promise<PackTransferJob> {
  const current = await requireJob(jobId, 'pack')
  const message = error instanceof Error ? error.message : String(error)
  const updated = touch(current, { status: 'failed', lastError: message })
  await transferDb.transferJobs.put(updated)
  return updated
}

function requireJob<T extends TransferJob['kind']>(jobOrId: TransferJob | string, kind: T): Promise<Extract<TransferJob, { kind: T }>> {
  return typeof jobOrId === 'string' ? loadJob(jobOrId, kind) : Promise.resolve(ensureKind(jobOrId, kind))
}

function ensureKind<T extends TransferJob['kind']>(job: TransferJob, kind: T): Extract<TransferJob, { kind: T }> {
  if (job.kind !== kind) throw new Error(`任务类型应为 ${kind}`)
  return job as Extract<TransferJob, { kind: T }>
}

async function loadJob<T extends TransferJob['kind']>(jobId: string, kind: T): Promise<Extract<TransferJob, { kind: T }>> {
  const job = await transferDb.transferJobs.get(jobId)
  if (!job) throw new Error('未找到可恢复的资料卷任务')
  return ensureKind(job, kind)
}

export async function getOrCreateImportJob(): Promise<ImportTransferJob> {
  const existing = await getLatestActiveJob('import')
  if (existing) return ensureKind(existing, 'import')

  const timestamp = nowIso()
  const job: ImportTransferJob = {
    id: createId('import'),
    kind: 'import',
    status: 'active',
    setId: null,
    expectedVersion: null,
    totalVolumes: 0,
    completedVolumes: [],
    staged: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    lastError: null,
  }
  await transferDb.transferJobs.add(job)
  return job
}

export async function stageImportFiles(files: File[]): Promise<ImportTransferJob> {
  const job = await getOrCreateImportJob()
  const added: StagedFile[] = []
  for (const file of files) {
    try {
      const text = await file.text()
      let detectedVolumeNo: number | null = null
      let parseError: string | null = null
      try {
        const parsed = JSON.parse(text) as unknown
        detectedVolumeNo = readBasicManifest(parsed)?.volumeNo ?? null
      } catch (error) {
        parseError = error instanceof Error ? error.message : 'JSON 无法解析'
      }
      const duplicate = job.staged.some((item) => item.detectedVolumeNo === detectedVolumeNo && detectedVolumeNo !== null)
        || added.some((item) => item.detectedVolumeNo === detectedVolumeNo && detectedVolumeNo !== null)
      if (duplicate) continue
      added.push({ name: file.name, addedAt: nowIso(), text, detectedVolumeNo, parseError })
    } catch (error) {
      added.push({
        name: file.name,
        addedAt: nowIso(),
        text: '',
        detectedVolumeNo: null,
        parseError: error instanceof Error ? error.message : '文件无法读取',
      })
    }
  }
  const updated = touch(job, {
    staged: [...job.staged, ...added],
    status: job.status === 'failed' ? 'active' : job.status,
    lastError: added.length > 0 ? null : job.lastError,
  })
  return refreshImportState(updated)
}

export async function removeStagedFile(index: number): Promise<ImportTransferJob> {
  const job = await getOrCreateImportJob()
  if (index < 0 || index >= job.staged.length) return job
  const removed = job.staged[index]
  const staged = job.staged.filter((_, itemIndex) => itemIndex !== index)
  const removedNo = removed?.detectedVolumeNo
  const stillStaged = removedNo !== null && removedNo !== undefined && staged.some((file) => file.detectedVolumeNo === removedNo)
  const completedVolumes = removedNo !== null && removedNo !== undefined && !stillStaged
    ? job.completedVolumes.filter((no) => no !== removedNo)
    : job.completedVolumes
  const next = touch(job, {
    staged,
    completedVolumes,
    status: job.status === 'failed' ? 'active' : job.status,
  })
  return refreshImportState(next)
}

function readBasicManifest(value: unknown): Pick<VolumeManifest, 'setId' | 'formatVersion' | 'volumeNo' | 'totalVolumes'> | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as { manifest?: unknown }
  const manifest = candidate.manifest
  if (!manifest || typeof manifest !== 'object') return null
  const item = manifest as Record<string, unknown>
  const setId = typeof item.setId === 'string' ? item.setId : null
  const formatVersion = typeof item.formatVersion === 'number' ? item.formatVersion : null
  const volumeNo = typeof item.volumeNo === 'number' ? item.volumeNo : null
  const totalVolumes = typeof item.totalVolumes === 'number' ? item.totalVolumes : null
  if (!setId || formatVersion === null || volumeNo === null || totalVolumes === null) return null
  return { setId, formatVersion, volumeNo, totalVolumes }
}

async function refreshImportState(job: ImportTransferJob): Promise<ImportTransferJob> {
  const validBasics = job.staged
    .map((file) => {
      if (file.parseError) return null
      try {
        return readBasicManifest(JSON.parse(file.text) as unknown)
      } catch {
        return null
      }
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)

  const first = validBasics[0]
  let updated = job
  if (first) {
    const sameSet = validBasics.filter((item) => item.setId === first.setId && item.totalVolumes === first.totalVolumes)
    const sameVersion = validBasics.filter((item) => item.formatVersion === first.formatVersion)
    const problems: string[] = []
    if (validBasics.length !== sameSet.length) problems.push('收到了其他资料卷组或卷数不一致的文件，请移除后重试。')
    if (validBasics.length !== sameVersion.length) problems.push(`资料卷版本不一致（首卷为版本 ${first.formatVersion}），请使用同一批资料卷。`)
    const mismatchHints = ['其他资料卷组', '版本不一致']
    const previousMismatch = mismatchHints.some((hint) => job.lastError?.includes(hint))
    updated = touch(job, {
      setId: first.setId,
      expectedVersion: first.formatVersion,
      totalVolumes: first.totalVolumes,
      lastError: problems.length > 0 ? problems.join(' ') : previousMismatch ? null : job.lastError,
    })
  }
  return persistImportJob(updated)
}

async function persistImportJob(job: ImportTransferJob): Promise<ImportTransferJob> {
  await transferDb.transferJobs.put(job)
  return job
}

export async function attemptImport(): Promise<ImportTransferJob> {
  const job = await getOrCreateImportJob()
  if (job.totalVolumes === 0) {
    return persistImportJob(touch(job, { status: 'failed', lastError: '尚未收到任何可识别的资料卷。' }))
  }

  const files = job.staged.map((file) => {
    try {
      return JSON.parse(file.text) as VolumeFile
    } catch {
      return null
    }
  })
  const volumes: VolumeFile[] = []
  const byNo = new Map<number, VolumeFile>()
  files.forEach((file) => {
    if (!file || !file.manifest || !file.payload) return
    const no = file.manifest.volumeNo
    if (typeof no !== 'number' || byNo.has(no)) return
    byNo.set(no, file)
  })

  try {
    for (let volumeNo = 1; volumeNo <= job.totalVolumes; volumeNo += 1) {
      const file = byNo.get(volumeNo)
      if (!file) throw new Error(`缺少第 ${volumeNo} 卷；已收到的卷已保留。`)
      volumes[volumeNo - 1] = file
    }
    assertVolumeSet(volumes)
    if (job.expectedVersion !== VOLUME_FORMAT_VERSION) {
      throw new Error(`资料卷版本为 ${job.expectedVersion ?? '未知'}，本机仅支持版本 ${VOLUME_FORMAT_VERSION}。`)
    }

    for (let volumeNo = 1; volumeNo <= volumes.length; volumeNo += 1) {
      if (job.completedVolumes.includes(volumeNo)) continue
      const volume = volumes[volumeNo - 1]
      if (!volume) throw new Error(`第 ${volumeNo} 卷缺失，导入已停止。`)
      await mainDb.transaction(
        'rw',
        [mainDb.joints, mainDb.members, mainDb.steps, mainDb.diagrams, mainDb.furniture],
        async () => {
          await mainDb.joints.bulkPut(volume.payload.joints)
          await mainDb.members.bulkPut(volume.payload.members)
          await mainDb.steps.bulkPut(volume.payload.steps)
          await mainDb.diagrams.bulkPut(volume.payload.diagrams)
          await mainDb.furniture.bulkPut(volume.payload.furniture)
        },
      )
      job.completedVolumes = [...job.completedVolumes, volumeNo].sort((a, b) => a - b)
      await persistImportJob(job)
    }

    return persistImportJob(touch(job, { status: 'completed', lastError: null }))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return persistImportJob(touch(job, {
      status: job.completedVolumes.length === job.totalVolumes ? 'completed' : 'failed',
      lastError: message,
    }))
  }
}

export function getPackVolumeJson(job: PackTransferJob, volumeNo: number): string {
  const volume = job.volumes.find((item) => item.manifest.volumeNo === volumeNo)
  if (!volume) throw new Error(`第 ${volumeNo} 卷尚未生成。`)
  return volume.json
}

export function getPackVolumeName(job: PackTransferJob, volumeNo: number): string {
  return `gbmortise-volume-${job.setId}-${String(volumeNo).padStart(2, '0')}-of-${String(job.totalVolumes).padStart(2, '0')}.json`
}

export function getPackVolumeSize(job: PackTransferJob, volumeNo: number): number {
  return job.volumes.find((item) => item.manifest.volumeNo === volumeNo)?.manifest.sizeBytes ?? 0
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`
}
