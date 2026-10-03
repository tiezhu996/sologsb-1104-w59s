import { db } from './db'
import type { JointBundle } from './volumeCore'
import {
  coerceEnvelope,
  createVolumePlan,
  envelopeSizeBytes,
  finalizeVolumeEnvelope,
  validateVolumeSet,
} from './volumeCore'
import type {
  ExportTaskRecord,
  ImportStagingRecord,
  ImportTaskRecord,
  VolumeEnvelope,
} from '../types/volume'

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function downloadText(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export function volumeFileName(taskId: string, volumeNo: number, totalVolumes: number): string {
  const padded = String(volumeNo).padStart(String(totalVolumes).length, '0')
  return `榫卯资料卷-${taskId.slice(-6)}-第${padded}卷_共${totalVolumes}卷.json`
}

export function downloadVolumeFile(envelope: VolumeEnvelope, taskId: string): void {
  const { volumeNo, totalVolumes } = envelope.manifest
  downloadText(volumeFileName(taskId, volumeNo, totalVolumes), JSON.stringify(envelope, null, 2))
}

export async function listExportTasks(): Promise<ExportTaskRecord[]> {
  const tasks = await db.exportTasks.toArray()
  return tasks.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/**
 * 制定分卷计划并固化为打包任务：计划一次生成、永不重算。
 * 失败或刷新后只从 completedThrough 之后继续，已完成卷不重复写、不重复下载。
 */
export async function startExportTask(params: {
  furnitureInOrder: Parameters<typeof createVolumePlan>[0]['furnitureInOrder']
  bundlesByJoint: Map<string, JointBundle>
  capacityBytes: number
}): Promise<ExportTaskRecord> {
  const now = new Date()
  const setId = createId('set')
  const plan = createVolumePlan({
    furnitureInOrder: params.furnitureInOrder,
    bundlesByJoint: params.bundlesByJoint,
    capacityBytes: params.capacityBytes,
    setId,
    createdAt: now.toISOString(),
  })

  const envelopes: VolumeEnvelope[] = []
  for (let no = 1; no <= plan.volumes.length; no += 1) {
    envelopes.push(await finalizeVolumeEnvelope(plan, no))
  }

  const task: ExportTaskRecord = {
    id: createId('export'),
    capacityBytes: params.capacityBytes,
    furnitureIds: plan.volumes.flatMap((volume) => volume.furnitureIds),
    createdAt: now.toISOString(),
    totalVolumes: envelopes.length,
    completedThrough: 0,
    status: 'active',
    volumes: envelopes,
  }
  await db.exportTasks.add(task)
  return task
}

/** 下载并标记一卷；只写一次进度，重试不会重复写入。 */
export async function markVolumeDownloaded(taskId: string, volumeNo: number): Promise<void> {
  await db.transaction('rw', db.exportTasks, async () => {
    const task = await db.exportTasks.get(taskId)
    if (!task) return
    const completedThrough = Math.max(task.completedThrough, volumeNo)
    const status = completedThrough >= task.totalVolumes ? 'completed' : 'active'
    await db.exportTasks.update(taskId, {
      completedThrough,
      status,
      finishedAt: status === 'completed' ? new Date().toISOString() : task.finishedAt,
    })
  })
}

/** 从最后完成的卷之后续发，已下载过的卷不会重复下载。 */
export async function continueExportTask(taskId: string): Promise<void> {
  const task = await db.exportTasks.get(taskId)
  if (!task || task.status === 'completed') return
  for (let no = task.completedThrough + 1; no <= task.totalVolumes; no += 1) {
    const envelope = task.volumes[no - 1]
    if (!envelope) break
    downloadVolumeFile(envelope, task.id)
    await markVolumeDownloaded(task.id, no)
    if (no < task.totalVolumes) await delay(700)
  }
}

export async function downloadSingleVolume(taskId: string, volumeNo: number): Promise<void> {
  const task = await db.exportTasks.get(taskId)
  const envelope = task?.volumes[volumeNo - 1]
  if (!task || !envelope) return
  downloadVolumeFile(envelope, task.id)
  await markVolumeDownloaded(task.id, volumeNo)
}

export async function removeExportTask(taskId: string): Promise<void> {
  await db.exportTasks.delete(taskId)
}

// ---- 导入侧 ----

export interface StagedGroupSummary {
  setId: string
  totalVolumes: number | null
  received: number
  files: ImportStagingRecord[]
}

/** 读取并暂存资料卷文件：同卷号重复收取只保留最后一份，校验失败前绝不写业务库。 */
export async function receiveVolumeFiles(fileList: File[]): Promise<{ groups: StagedGroupSummary[]; errors: string[] }> {
  const errors: string[] = []

  for (const file of fileList) {
    let parsed: unknown
    try {
      parsed = JSON.parse(await file.text())
    } catch {
      errors.push(`「${file.name}」不是有效的 JSON 文件。`)
      continue
    }
    const result = await coerceEnvelope(parsed, file.name)
    if (!result.ok) {
      errors.push(result.issue.message)
      continue
    }
    const record: ImportStagingRecord = {
      setId: result.envelope.manifest.setId,
      volumeNo: result.envelope.manifest.volumeNo,
      envelope: result.envelope,
      fileName: file.name,
      receivedAt: new Date().toISOString(),
    }
    await db.importStaging.put(record)
  }

  const groups = await listStagedGroups()
  return { groups, errors }
}

export async function listStagedGroups(): Promise<StagedGroupSummary[]> {
  const records = await db.importStaging.orderBy('receivedAt').toArray()
  const bySet = new Map<string, ImportStagingRecord[]>()
  for (const record of records) {
    const list = bySet.get(record.setId) ?? []
    list.push(record)
    bySet.set(record.setId, list)
  }
  return Array.from(bySet.entries()).map(([setId, files]) => {
    const totals = files
      .map((file) => file.envelope.manifest.totalVolumes)
      .filter((value, index, all) => all.indexOf(value) === index)
    return {
      setId,
      totalVolumes: totals.length === 1 ? totals[0] : null,
      received: files.length,
      files: files.sort((a, b) => a.volumeNo - b.volumeNo),
    }
  })
}

export async function getStagedSet(setId: string): Promise<ImportStagingRecord[]> {
  const records = await db.importStaging.where('setId').equals(setId).toArray()
  return records.sort((a, b) => a.volumeNo - b.volumeNo)
}

export async function validateStagedSet(setId: string) {
  const records = await getStagedSet(setId)
  return validateVolumeSet(records.map((record) => record.envelope))
}

/**
 * 导入已通过全量校验的资料卷：按卷号顺序落库，每卷一个事务。
 * 已 appliedThrough 的卷直接跳过；bulkPut 幂等，重试不产生重复记录。
 */
export async function importValidatedSet(setId: string, onProgress?: (applied: number, total: number) => void): Promise<ImportTaskRecord> {
  const records = await getStagedSet(setId)
  const validation = validateVolumeSet(records.map((record) => record.envelope))
  if (!validation.ok || validation.totalVolumes === null) {
    throw new Error(validation.issues[0]?.message ?? '资料卷校验未通过，已停止导入。')
  }
  const totalVolumes = validation.totalVolumes
  const taskId = `import-${setId}`

  const existing = await db.importTasks.get(taskId)
  let appliedThrough = existing?.status === 'completed' ? totalVolumes : (existing?.appliedThrough ?? 0)

  for (const record of records) {
    if (record.volumeNo <= appliedThrough) continue
    const envelope = record.envelope
    await db.transaction(
      'rw',
      [db.joints, db.members, db.steps, db.diagrams, db.furniture, db.importTasks],
      async () => {
        if (envelope.data.joints.length) await db.joints.bulkPut(envelope.data.joints)
        if (envelope.data.members.length) await db.members.bulkPut(envelope.data.members)
        if (envelope.data.steps.length) await db.steps.bulkPut(envelope.data.steps)
        if (envelope.data.diagrams.length) await db.diagrams.bulkPut(envelope.data.diagrams)
        if (envelope.data.furniture.length) await db.furniture.bulkPut(envelope.data.furniture)
        await db.importTasks.put({
          id: taskId,
          totalVolumes,
          appliedThrough: record.volumeNo,
          status: record.volumeNo >= totalVolumes ? 'completed' : 'importing',
          updatedAt: new Date().toISOString(),
        })
      },
    )
    appliedThrough = record.volumeNo
    onProgress?.(appliedThrough, totalVolumes)
  }

  const finalTask = await db.importTasks.get(taskId)
  if (!finalTask) throw new Error('导入进度丢失。')
  return finalTask
}

export async function getImportTask(setId: string): Promise<ImportTaskRecord | undefined> {
  return db.importTasks.get(`import-${setId}`)
}

export async function removeStagedSet(setId: string): Promise<void> {
  const records = await db.importStaging.where('setId').equals(setId).primaryKeys()
  await db.importStaging.bulkDelete(records)
  await db.importTasks.delete(`import-${setId}`)
}

export { envelopeSizeBytes }
