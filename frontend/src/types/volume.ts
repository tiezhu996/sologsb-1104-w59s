import type { Diagram } from './diagram'
import type { Furniture } from './furniture'
import type { JointType } from './jointType'
import type { Member } from './member'
import type { DisassemblyStep } from './step'

export const VOLUME_FORMAT = 'gbmortise-furniture-volume'
export const VOLUME_FORMAT_VERSION = 2
export const MANIFEST_RESERVE_BYTES = 1024

export interface VolumeDataCollections {
  joints: JointType[]
  members: Member[]
  steps: DisassemblyStep[]
  diagrams: Diagram[]
  furniture: Furniture[]
}

export interface VolumeFurnitureManifestItem { id: string; name: string; jointTypeId: string }
export interface VolumeJointReference { jointTypeId: string; volumeNo: number }
export interface VolumePayload { joints: JointType[]; members: Member[]; steps: DisassemblyStep[]; diagrams: Diagram[]; furniture: Furniture[] }
export interface VolumeManifest {
  format: string
  formatVersion: number
  setId: string
  createdAt: string
  volumeNo: number
  totalVolumes: number
  capacityBytes: number
  sizeBytes: number
  furnitureIds: string[]
  furniture: VolumeFurnitureManifestItem[]
  includedJointIds: string[]
  jointReferences: VolumeJointReference[]
  selectionOrder: string[]
}
export interface VolumeFile { manifest: VolumeManifest; payload: VolumePayload }
