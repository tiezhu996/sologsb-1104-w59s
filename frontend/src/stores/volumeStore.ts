import { create } from 'zustand'
import type { Furniture } from '../types/furniture'
import type { ExportTaskRecord } from '../types/volume'
import { db, ensureSeedData } from '../utils/db'
import type { JointBundle } from '../utils/volumeCore'
import {
  continueExportTask,
  downloadSingleVolume,
  importValidatedSet,
  listExportTasks,
  listStagedGroups,
  receiveVolumeFiles,
  removeExportTask,
  removeStagedSet,
  startExportTask,
  type StagedGroupSummary,
} from '../utils/volumeService'

interface VolumeWorkshopState {
  furnitureInOrder: Furniture[]
  bundlesByJoint: Map<string, JointBundle>
  exportTasks: ExportTaskRecord[]
  stagedGroups: StagedGroupSummary[]
  loading: boolean
  busy: boolean
  loadWorkshop: () => Promise<void>
  createTask: (furnitureIds: string[], capacityBytes: number) => Promise<ExportTaskRecord>
  resumeTask: (taskId: string) => Promise<void>
  downloadVolume: (taskId: string, volumeNo: number) => Promise<void>
  deleteTask: (taskId: string) => Promise<void>
  ingestFiles: (files: File[]) => Promise<string[]>
  importSet: (setId: string, onProgress?: (applied: number, total: number) => void) => Promise<void>
  discardSet: (setId: string) => Promise<void>
}

async function loadBundles(): Promise<Map<string, JointBundle>> {
  const [joints, members, steps, diagrams] = await Promise.all([
    db.joints.toArray(),
    db.members.toArray(),
    db.steps.toArray(),
    db.diagrams.toArray(),
  ])
  const bundles = new Map<string, JointBundle>()
  for (const joint of joints) {
    bundles.set(joint.id, {
      joint,
      steps: steps
        .filter((step) => step.jointTypeId === joint.id)
        .sort((a, b) => a.seq - b.seq),
      members: members.filter((member) => member.jointTypeId === joint.id),
      diagrams: diagrams.filter((diagram) => diagram.jointTypeId === joint.id),
    })
  }
  return bundles
}

export const useVolumeStore = create<VolumeWorkshopState>((set, get) => ({
  furnitureInOrder: [],
  bundlesByJoint: new Map(),
  exportTasks: [],
  stagedGroups: [],
  loading: false,
  busy: false,

  loadWorkshop: async () => {
    if (get().loading) return
    set({ loading: true })
    try {
      await ensureSeedData()
      const [furniture, bundlesByJoint, exportTasks, stagedGroups] = await Promise.all([
        db.furniture.toArray(),
        loadBundles(),
        listExportTasks(),
        listStagedGroups(),
      ])
      // 家具顺序即分批顺序：按名称、部位排序固定，教师所见顺序与落卷顺序一致。
      furniture.sort((a, b) =>
        a.name === b.name
          ? a.position.localeCompare(b.position, 'zh-CN')
          : a.name.localeCompare(b.name, 'zh-CN'),
      )
      set({ furnitureInOrder: furniture, bundlesByJoint, exportTasks, stagedGroups })
    } finally {
      set({ loading: false })
    }
  },

  createTask: async (furnitureIds, capacityBytes) => {
    set({ busy: true })
    try {
      const chosen = get().furnitureInOrder.filter((item) => furnitureIds.includes(item.id))
      const task = await startExportTask({
        furnitureInOrder: chosen,
        bundlesByJoint: get().bundlesByJoint,
        capacityBytes,
      })
      await continueExportTask(task.id)
      set({ exportTasks: await listExportTasks() })
      return task
    } finally {
      set({ busy: false })
    }
  },

  resumeTask: async (taskId) => {
    set({ busy: true })
    try {
      await continueExportTask(taskId)
      set({ exportTasks: await listExportTasks() })
    } finally {
      set({ busy: false })
    }
  },

  downloadVolume: async (taskId, volumeNo) => {
    set({ busy: true })
    try {
      await downloadSingleVolume(taskId, volumeNo)
      set({ exportTasks: await listExportTasks() })
    } finally {
      set({ busy: false })
    }
  },

  deleteTask: async (taskId) => {
    await removeExportTask(taskId)
    set({ exportTasks: await listExportTasks() })
  },

  ingestFiles: async (files) => {
    set({ busy: true })
    try {
      const { errors } = await receiveVolumeFiles(files)
      set({ stagedGroups: await listStagedGroups() })
      return errors
    } finally {
      set({ busy: false })
    }
  },

  importSet: async (setId, onProgress) => {
    set({ busy: true })
    try {
      await importValidatedSet(setId, onProgress)
      set({ stagedGroups: await listStagedGroups() })
    } finally {
      set({ busy: false })
    }
  },

  discardSet: async (setId) => {
    await removeStagedSet(setId)
    set({ stagedGroups: await listStagedGroups() })
  },
}))
