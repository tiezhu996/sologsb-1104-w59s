import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useJointStore } from '../stores/jointStore'
import { useVolumeStore } from '../stores/volumeStore'
import type { ExportTaskRecord } from '../types/volume'
import type { VolumeSetValidation } from '../types/volume'
import { envelopeSizeBytes } from '../utils/volumeCore'
import {
  getImportTask,
  validateStagedSet,
} from '../utils/volumeService'

type TabKey = 'pack' | 'restore'

const capacityPresets = [
  { label: '8 KB（小U盘演示）', bytes: 8 * 1024 },
  { label: '16 KB', bytes: 16 * 1024 },
  { label: '64 KB', bytes: 64 * 1024 },
  { label: '1 MB', bytes: 1024 * 1024 },
  { label: '16 MB', bytes: 16 * 1024 * 1024 },
]

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export default function VolumeWorkshop() {
  const [tab, setTab] = useState<TabKey>('pack')

  return (
    <div className="space-y-7">
      <section>
        <p className="mb-2 text-xs font-semibold tracking-[0.24em] text-wood-500">VOLUME WORKSHOP</p>
        <h1 className="text-3xl font-bold tracking-tight text-wood-900 sm:text-4xl">资料卷工坊</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-stone-600">
          按选中家具把榫卯、构件、步骤、示意图与家具关系分卷写入固定容量的 U 盘。共用榫卯只在首卷保存，后续卷在清单中引用；
          导入时先校验全部卷，缺卷或版本不对立即停止并保留已收卷，失败后从最后完成的卷续传、重试不重复写入。
        </p>
      </section>

      <div className="flex gap-2 border-b border-wood-100">
        {([
          { key: 'pack', label: '分卷打包' },
          { key: 'restore', label: '校验导入' },
        ] as const).map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition ${
              tab === item.key
                ? 'border-wood-700 text-wood-900'
                : 'border-transparent text-stone-500 hover:text-wood-700'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'pack' ? <PackPanel /> : <RestorePanel />}
    </div>
  )
}

// ---------------- 打包 ----------------

function PackPanel() {
  const furnitureInOrder = useVolumeStore((state) => state.furnitureInOrder)
  const bundlesByJoint = useVolumeStore((state) => state.bundlesByJoint)
  const exportTasks = useVolumeStore((state) => state.exportTasks)
  const loading = useVolumeStore((state) => state.loading)
  const busy = useVolumeStore((state) => state.busy)
  const loadWorkshop = useVolumeStore((state) => state.loadWorkshop)
  const createTask = useVolumeStore((state) => state.createTask)

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [capacity, setCapacity] = useState(capacityPresets[0].bytes)
  const [customValue, setCustomValue] = useState('')
  const [customUnit, setCustomUnit] = useState<'KB' | 'MB'>('KB')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void loadWorkshop()
  }, [loadWorkshop])

  const effectiveCapacity = customValue.trim()
    ? Math.max(1, Math.floor(Number(customValue))) * (customUnit === 'MB' ? 1024 * 1024 : 1024)
    : capacity

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    setSelected((current) =>
      current.size === furnitureInOrder.length ? new Set() : new Set(furnitureInOrder.map((item) => item.id)),
    )
  }

  const submit = async () => {
    setError(null)
    if (!selected.size) {
      setError('请先勾选需要打包的家具。')
      return
    }
    if (!Number.isFinite(effectiveCapacity) || effectiveCapacity < 1) {
      setError('U 盘容量填写有误。')
      return
    }
    const orderedIds = furnitureInOrder.filter((item) => selected.has(item.id)).map((item) => item.id)
    try {
      await createTask(orderedIds, effectiveCapacity)
      setSelected(new Set())
      setCustomValue('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '分卷失败，请重试。')
    }
  }

  return (
    <div className="space-y-6">
      <section className="panel p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-wood-900">第一步 · 按顺序勾选家具</h2>
            <p className="mt-1 text-xs text-stone-500">
              序号即分批顺序；容量不够时按此顺序拆卷，同一榫卯的完整资料始终落在同一卷。
            </p>
          </div>
          <button type="button" className="secondary-button" onClick={toggleAll} disabled={loading}>
            {selected.size === furnitureInOrder.length ? '全部取消' : '全选'}
          </button>
        </div>

        <div className="mt-4 divide-y divide-stone-100 rounded-xl border border-wood-100">
          {furnitureInOrder.map((item, index) => {
            const bundle = bundlesByJoint.get(item.jointTypeId)
            const bundleSize = bundle
              ? envelopeSizeBytes({
                  manifest: {
                    format: 'x', formatVersion: 0, schemaRev: 0, setId: 'x', volumeNo: 1, totalVolumes: 1,
                    createdAt: 'x', capacityBytes: 0, sizeBytes: 0, furnitureIds: [], definesJoints: [],
                    referencesJoints: [], jointCatalog: [], checksum: '0'.repeat(64),
                  },
                  data: {
                    joints: [bundle.joint],
                    members: bundle.members,
                    steps: bundle.steps,
                    diagrams: bundle.diagrams,
                    furniture: [item],
                  },
                })
              : 0
            return (
              <label
                key={item.id}
                className="flex cursor-pointer items-center gap-4 px-4 py-3 text-sm hover:bg-wood-50/60"
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[#8c6b4b]"
                  checked={selected.has(item.id)}
                  onChange={() => toggle(item.id)}
                />
                <span className="w-7 shrink-0 text-center text-xs font-semibold text-stone-400">{index + 1}</span>
                <span className="shrink-0 font-semibold text-wood-900">{item.name}</span>
                <span className="hidden shrink-0 rounded-full bg-wood-50 px-2 py-0.5 text-xs text-wood-700 sm:inline">{item.era}</span>
                <span className="min-w-0 flex-1 truncate text-stone-600">{item.position}</span>
                <span className="shrink-0 text-xs text-stone-500">
                  {bundle ? `${bundle.joint.name} · 约 ${formatBytes(bundleSize)}` : '榫卯资料缺失'}
                </span>
              </label>
            )
          })}
        </div>
      </section>

      <section className="panel p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-wood-900">第二步 · 指定 U 盘容量</h2>
        <p className="mt-1 text-xs text-stone-500">工坊只有几只固定容量的 U 盘，请选择或填写实际容量，每卷成品都不得超过它。</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <select
            className="input-field max-w-xs"
            value={customValue.trim() ? -1 : capacity}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => {
              setCustomValue('')
              setCapacity(Number(event.target.value))
            }}
          >
            {capacityPresets.map((preset) => (
              <option key={preset.bytes} value={preset.bytes}>{preset.label}</option>
            ))}
            {customValue.trim() ? <option value={-1}>自定义：{customValue} {customUnit}</option> : null}
          </select>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-stone-500">或自定义</span>
            <input
              className="input-field w-28"
              inputMode="numeric"
              placeholder="容量数值"
              value={customValue}
              onChange={(event) => setCustomValue(event.target.value.replace(/[^\d]/g, ''))}
            />
            <select
              className="input-field w-20"
              value={customUnit}
              onChange={(event) => setCustomUnit(event.target.value as 'KB' | 'MB')}
            >
              <option value="KB">KB</option>
              <option value="MB">MB</option>
            </select>
          </div>
          <div className="text-sm text-stone-600">
            单卷上限 <strong className="text-wood-800">{formatBytes(effectiveCapacity)}</strong>
          </div>
        </div>

        {error ? <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

        <div className="mt-5 flex justify-end">
          <button type="button" className="primary-button" disabled={busy || loading} onClick={() => void submit()}>
            {busy ? '正在分卷…' : '生成资料卷并开始写入 U 盘'}
          </button>
        </div>
      </section>

      {exportTasks.length > 0 ? (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-wood-900">打包任务 · 断点续传</h2>
          {exportTasks.map((task) => <ExportTaskCard key={task.id} task={task} />)}
        </section>
      ) : null}
    </div>
  )
}

function ExportTaskCard({ task }: { task: ExportTaskRecord }) {
  const busy = useVolumeStore((state) => state.busy)
  const resumeTask = useVolumeStore((state) => state.resumeTask)
  const downloadVolume = useVolumeStore((state) => state.downloadVolume)
  const deleteTask = useVolumeStore((state) => state.deleteTask)

  return (
    <article className="panel p-5">
      <header className="flex flex-wrap items-center gap-3">
        <div>
          <h3 className="font-semibold text-wood-900">
            套卷 {task.id.slice(-6)} · 共 {task.totalVolumes} 卷
          </h3>
          <p className="mt-0.5 text-xs text-stone-500">
            {new Date(task.createdAt).toLocaleString('zh-CN')} · 单卷上限 {formatBytes(task.capacityBytes)} ·
            含 {task.furnitureIds.length} 件家具
            {task.status === 'completed' ? ' · 已全部写入' : ` · 已完成 ${task.completedThrough} 卷`}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          {task.status !== 'completed' ? (
            <button type="button" className="primary-button" disabled={busy} onClick={() => void resumeTask(task.id)}>
              从第 {task.completedThrough + 1} 卷续发
            </button>
          ) : null}
          <button type="button" className="secondary-button" disabled={busy} onClick={() => void deleteTask(task.id)}>
            删除任务记录
          </button>
        </div>
      </header>
      <div className="mt-4 flex flex-wrap gap-2">
        {task.volumes.map((envelope) => {
          const done = envelope.manifest.volumeNo <= task.completedThrough
          return (
            <button
              key={envelope.manifest.volumeNo}
              type="button"
              disabled={busy}
              title={`${envelope.manifest.definesJoints.length} 个榫卯全量资料，${envelope.data.furniture.length} 件家具关系，${formatBytes(envelopeSizeBytes(envelope))}`}
              onClick={() => void downloadVolume(task.id, envelope.manifest.volumeNo)}
              className={`flex h-11 min-w-[4.5rem] flex-col items-center justify-center rounded-lg border px-3 text-xs transition ${
                done
                  ? 'border-wood-500 bg-wood-50 text-wood-800 hover:bg-wood-100'
                  : 'border-dashed border-stone-300 bg-white text-stone-500 hover:border-wood-400'
              }`}
            >
              <span className="text-sm font-bold">第{envelope.manifest.volumeNo}卷</span>
              <span>{done ? '已写入·可重取' : '待写入'}</span>
            </button>
          )
        })}
      </div>
      <p className="mt-3 text-xs text-stone-500">
        卷内提示：实线块为已下载卷，点击可重新下载该卷文件；续发只从最后完成卷之后继续，不会重复生成或重复记录。
      </p>
    </article>
  )
}

// ---------------- 导入 ----------------

function RestorePanel() {
  const stagedGroups = useVolumeStore((state) => state.stagedGroups)
  const busy = useVolumeStore((state) => state.busy)
  const loadWorkshop = useVolumeStore((state) => state.loadWorkshop)
  const ingestFiles = useVolumeStore((state) => state.ingestFiles)
  const fileRef = useRef<HTMLInputElement>(null)
  const [fileErrors, setFileErrors] = useState<string[]>([])

  useEffect(() => {
    void loadWorkshop()
  }, [loadWorkshop])

  const pick = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (!files.length) return
    setFileErrors(await ingestFiles(files))
  }

  return (
    <div className="space-y-6">
      <section className="panel p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-wood-900">第一步 · 收卷（可分多次拷贝到本机）</h2>
        <p className="mt-1 text-xs text-stone-500">
          选择一个或多个资料卷 JSON 文件，系统会先暂存已收卷；同一卷重复收取时以最后一份为准。校验通过前不会写入图鉴数据。
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" className="primary-button" disabled={busy} onClick={() => fileRef.current?.click()}>
            选择资料卷文件
          </button>
          <input ref={fileRef} type="file" accept=".json,application/json" multiple hidden onChange={(event) => void pick(event)} />
          <span className="text-xs text-stone-500">支持一次多选，也可以陆续从多只 U 盘补齐。</span>
        </div>
        {fileErrors.length > 0 ? (
          <ul className="mt-4 space-y-1.5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {fileErrors.map((message, index) => <li key={index}>· {message}</li>)}
          </ul>
        ) : null}
      </section>

      {stagedGroups.length === 0 ? (
        <section className="panel p-8 text-center text-sm text-stone-500">尚未收到任何资料卷。</section>
      ) : (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-wood-900">第二步 · 校验并恢复</h2>
          {stagedGroups.map((group) => (
            <StagedSetCard key={group.setId} setId={group.setId} totalVolumes={group.totalVolumes} receivedCount={group.received} />
          ))}
        </section>
      )}
    </div>
  )
}

function StagedSetCard({ setId, totalVolumes, receivedCount }: { setId: string; totalVolumes: number | null; receivedCount: number }) {
  const busy = useVolumeStore((state) => state.busy)
  const importSet = useVolumeStore((state) => state.importSet)
  const discardSet = useVolumeStore((state) => state.discardSet)
  const loadJoints = useJointStore((state) => state.loadAll)

  const [validation, setValidation] = useState<VolumeSetValidation | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [done, setDone] = useState(false)
  const [fatal, setFatal] = useState<string | null>(null)

  const receivedNumbers = useMemo(() => validation?.received ?? [], [validation])

  const runValidation = async () => {
    setFatal(null)
    const result = await validateStagedSet(setId)
    setValidation(result)
    if (result.ok) {
      const task = await getImportTask(setId)
      if (task?.status === 'completed') {
        setDone(true)
        setProgress(task.appliedThrough)
      } else if (task) {
        setProgress(task.appliedThrough)
      }
    }
  }

  const runImport = async () => {
    setFatal(null)
    try {
      await importSet(setId, (applied) => setProgress(applied))
      setDone(true)
      await loadJoints()
    } catch (cause) {
      setFatal(cause instanceof Error ? cause.message : '恢复失败，已保留已收卷，可从断点重试。')
      const task = await getImportTask(setId)
      if (task) setProgress(task.appliedThrough)
    }
  }

  return (
    <article className="panel p-5">
      <header className="flex flex-wrap items-center gap-3">
        <div>
          <h3 className="font-semibold text-wood-900">套卷 {setId.slice(-6)}</h3>
          <p className="mt-0.5 text-xs text-stone-500">
            已收 {receivedCount} 卷 / 应共 {totalVolumes ?? '卷数信息冲突'} 卷
            {progress !== null ? ` · 已恢复 ${progress} 卷` : ''}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <button type="button" className="secondary-button" disabled={busy} onClick={() => void runValidation()}>
            校验全部卷
          </button>
          <button type="button" className="secondary-button" disabled={busy} onClick={() => void discardSet(setId)}>
            清空已收卷
          </button>
        </div>
      </header>

      {validation ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: validation.totalVolumes ?? receivedNumbers.length }, (_, index) => index + 1).map((no) => {
              const got = receivedNumbers.includes(no)
              return (
                <span
                  key={no}
                  className={`flex h-8 w-12 items-center justify-center rounded-md text-xs font-semibold ${
                    got ? 'bg-wood-100 text-wood-800' : 'bg-red-50 text-red-700 ring-1 ring-red-200'
                  }`}
                >
                  {got ? `第${no}卷` : `缺${no}`}
                </span>
              )
            })}
          </div>

          {validation.ok ? (
            <div className="space-y-3 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <p>全部 {validation.totalVolumes} 卷齐备，版本与校验和均通过，引用完整，可以恢复到本机。</p>
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" className="primary-button" disabled={busy || done} onClick={() => void runImport()}>
                  {done ? '已全部恢复' : progress !== null ? `从第 ${progress + 1} 卷继续恢复` : '开始恢复到本机'}
                </button>
                {done ? <span>图鉴数据已刷新，可前往榫卯图鉴查看。</span> : null}
              </div>
            </div>
          ) : (
            <ul className="space-y-1.5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              {validation.issues.map((item, index) => (
                <li key={index}>· [{item.code.replace(/_/g, '')}] {item.message}</li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <p className="mt-3 text-xs text-stone-500">收卷后点击“校验全部卷”：缺卷、版本不符或校验和错误都会在此停下，已收卷继续保留。</p>
      )}

      {fatal ? <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{fatal}</p> : null}
    </article>
  )
}
