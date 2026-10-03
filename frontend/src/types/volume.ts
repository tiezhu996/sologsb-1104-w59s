import type { Diagram } from './diagram'
import type { Furniture } from './furniture'
import type { JointType } from './jointType'
import type { Member } from './member'
import type { DisassemblyStep } from './step'

export const VOLUME_FORMAT = 'gbmortise-volume'
export const VOLUME_FORMAT_VERSION = 1
export const VOLUME_SCHEMA_REV = 2
export const CHECKSUM_HEX_LENGTH = 64

/** 一卷中实际承载的数据载荷。 */
export interface VolumePayload {
  joints: JointType[]
  members: Member[]
  steps: DisassemblyStep[]
  diagrams: Diagram[]
  furniture: Furniture[]
}

/** 榫卯目录条目：声明某个榫卯的完整资料定义在哪一卷。 */
export interface JointCatalogEntry {
  jointId: string
  definedIn: number
}

export interface VolumeManifest {
  /** 固定为 gbmortise-volume，用于识别资料卷文件。 */
  format: string
  /** 资料卷容器格式版本，版本不一致则拒绝导入。 */
  formatVersion: number
  /** 数据模型版本（与记录 schemaRev 对齐）。 */
  schemaRev: number
  /** 同一套资料卷的共享编号。 */
  setId: string
  /** 从 1 开始的卷号。 */
  volumeNo: number
  totalVolumes: number
  createdAt: string
  /** 打包时设定的单卷容量上限（字节）。 */
  capacityBytes: number
  /** 载荷 JSON 的 UTF-8 字节数。 */
  sizeBytes: number
  /** 本卷包含的家具关系 id，顺序与选择顺序一致。 */
  furnitureIds: string[]
  /** 完整资料保存在本卷的榫卯 id。 */
  definesJoints: string[]
  /** 本卷家具用到、但完整资料保存在更早卷的榫卯 id。 */
  referencesJoints: string[]
  /** 全卷通用的榫卯目录，恢复时据此解析引用。 */
  jointCatalog: JointCatalogEntry[]
  /** 对 {manifest(去掉checksum), data} 规范化 JSON 的 SHA-256。 */
  checksum: string
}

export interface VolumeEnvelope {
  manifest: VolumeManifest
  data: VolumePayload
}

export type ExportTaskStatus = 'active' | 'completed'
export type ImportTaskStatus = 'pending' | 'importing' | 'completed' | 'failed'

/** 打包任务：计划在创建时固定，失败后从 completedThrough 之后继续，已完成卷不重复写。 */
export interface ExportTaskRecord {
  id: string
  capacityBytes: number
  furnitureIds: string[]
  createdAt: string
  totalVolumes: number
  completedThrough: number
  status: ExportTaskStatus
  volumes: VolumeEnvelope[]
  finishedAt?: string
}

/** 已收到的资料卷暂存记录，按 [setId, volumeNo] 去重。 */
export interface ImportStagingRecord {
  setId: string
  volumeNo: number
  envelope: VolumeEnvelope
  fileName: string
  receivedAt: string
}

/** 导入进度：appliedThrough 之前的卷已落库，重试时跳过。 */
export interface ImportTaskRecord {
  id: string
  totalVolumes: number
  appliedThrough: number
  status: ImportTaskStatus
  updatedAt: string
  error?: string
}

export type VolumeIssueCode =
  | 'PARSE_ERROR'
  | 'FOREIGN_FILE'
  | 'MALFORMED'
  | 'VERSION_MISMATCH'
  | 'MISSING_VOLUMES'
  | 'CHECKSUM_MISMATCH'
  | 'BROKEN_REFERENCE'
  | 'DUPLICATE_RECORD'

export interface VolumeIssue {
  code: VolumeIssueCode
  message: string
  volumeNo?: number
}

export interface VolumeSetValidation {
  ok: boolean
  setId: string | null
  totalVolumes: number | null
  received: number[]
  missing: number[]
  issues: VolumeIssue[]
}
