import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useJointStore } from '../stores/jointStore'
import {
  attemptImport,
  createPackJob,
  deleteTransferJob,
  formatBytes,
  getLatestActiveJob,
  getOrCreateImportJob,
  getPackVolumeJson,
  getPackVolumeName,
  markPackVolume,
  removeStagedFile,
  stageImportFiles,
  type ImportTransferJob,
  type PackTransferJob,
  type TransferJob,
} from '../utils/volumeTransfer'
import { saveJsonFile } from '../utils/saveFile'
import { VolumeValidationError } from '../utils/volume'

type JobMode = 'pack' | 'import'

function isPackJob(job: TransferJob | undefined): job is PackTransferJob {
  return job?.kind === 'pack'
}

function isImportJob(job: TransferJob | undefined): job is ImportTransferJob {
  return job?.kind === 'import'
}

export default function VolumeWorkshop() {
  const joints = useJointStore((state) => state.joints)
  const furniture = useJointStore((state) => state.furniture)
  const loadAll = useJointStore((state) => state.loadAll)
  const [mode, setMode] = useState<JobMode>('pack')
  const [selected, setSelected] = useState<string[]>([])
  const [capacityKiB, setCapacityKiB] = useState(16)
  const [job, setJob] = useState<TransferJob>()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ type: 'info' | 'error' | 'success'; text: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  useEffect(() => {
    void getLatestActiveJob(mode).then(setJob)
  }, [mode])

  const orderedFurniture = useMemo(() => furniture, [furniture])
  const orderedSelected = useMemo(
    () => orderedFurniture.map((item) => item.id).filter((id) => selected.includes(id)),
    [orderedFurniture, selected],
  )
  const jointName = (jointTypeId: string) => joints.find((joint) => joint.id === jointTypeId)?.name ?? '未知榫卯'

  useEffect(() => {
    if (selected.length === 0 && orderedFurniture.length > 0) setSelected(orderedFurniture.map((item) => item.id))
  }, [orderedFurniture, selected.length])

  const toggleFurniture = (id: string) => {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  }

  const startPacking = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const created = await createPackJob(orderedSelected, Math.round(capacityKiB * 1024))
      setJob(created)
      setMessage({ type: 'success', text: `已生成 ${created.totalVolumes} 个资料卷；从第 1 卷开始写入U盘。` })
    } catch (error) {
      const text = error instanceof VolumeValidationError ? error.message : error instanceof Error ? error.message : String(error)
      setMessage({ type: 'error', text })
    } finally {
      setBusy(false)
    }
  }

  const writePackVolume = async (volumeNo: number) => {
    if (!isPackJob(job)) return
    setBusy(true)
    setMessage(null)
    try {
      const result = await saveJsonFile(getPackVolumeName(job, volumeNo), getPackVolumeJson(job, volumeNo))
      if (result === 'cancelled') {
        setMessage({ type: 'info', text: `第 ${volumeNo} 卷尚未标记完成，可换U盘后重试，不会重复计数。` })
        return
      }
      const updated = await markPackVolume(job.id, volumeNo)
      setJob(updated)
      setMessage({ type: 'success', text: `第 ${volumeNo} 卷已完成。${updated.status === 'completed' ? '全部资料卷打包结束。' : '请继续下一卷。'}` })
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : String(error) })
    } finally {
      setBusy(false)
    }
  }

  const prepareImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (files.length === 0) return
    setBusy(true)
    setMessage(null)
    try {
      const updated = await stageImportFiles(files)
      setJob(updated)
      setMessage({ type: 'info', text: `已暂存 ${files.length} 个文件；全部卷校验通过前不会写入图鉴数据。` })
    } finally {
      setBusy(false)
    }
  }

  const runImport = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const updated = await attemptImport()
      setJob(updated)
      setMessage({
        type: updated.status === 'completed' ? 'success' : 'error',
        text: updated.status === 'completed' ? '全部资料卷已恢复。' : updated.lastError ?? '导入失败，已保留已完成卷。',
      })
      if (updated.status === 'completed') await loadAll()
    } finally {
      setBusy(false)
    }
  }

  const removeFile = async (index: number) => {
    if (!isImportJob(job)) return
    setBusy(true)
    const updated = await removeStagedFile(index)
    setJob(updated)
    setBusy(false)
  }

  const startNewTransfer = async () => {
    if (job) await deleteTransferJob(job.id)
    if (mode === 'import') {
      const fresh = await getOrCreateImportJob()
      await deleteTransferJob(fresh.id)
      setJob(undefined)
    } else {
      setJob(undefined)
    }
    setMessage(null)
  }

  const packJob = isPackJob(job) ? job : undefined
  const importJob = isImportJob(job) ? job : undefined

  return (
    <div className="space-y-7">
      <section>
        <p className="mb-2 text-xs font-semibold tracking-[0.24em] text-wood-500">USB VOLUMES</p>
        <h1 className="text-3xl font-bold tracking-tight text-wood-900 sm:text-4xl">资料卷工坊</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-stone-600">
          按家具顺序把榫卯、构件、步骤、示意图和家具关系分卷；共用榫卯只在首卷保存，后续卷只在清单中引用。导入时先校验全部卷，缺卷或版本不对会立即停止。
        </p>
      </section>

      <div className="flex gap-3">
        <button type="button" className={mode === 'pack' ? 'primary-button' : 'secondary-button'} onClick={() => setMode('pack')}>打包到U盘</button>
        <button type="button" className={mode === 'import' ? 'primary-button' : 'secondary-button'} onClick={() => setMode('import')}>从U盘恢复</button>
      </div>

      {message ? (
        <div className={`rounded-xl border px-4 py-3 text-sm ${
          message.type === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800'
            : message.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-amber-200 bg-amber-50 text-amber-800'
        }`}>{message.text}</div>
      ) : null}

      {mode === 'pack' ? (
        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <div className="panel p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-wood-900">1. 按顺序选择家具</h2>
                <p className="mt-1 text-xs text-stone-500">保持勾选顺序即分卷顺序；同一榫卯资料会作为不可拆散的整体。</p>
              </div>
              <button type="button" className="text-xs font-semibold text-wood-700 hover:underline" onClick={() => setSelected(orderedFurniture.map((item) => item.id))}>全选</button>
            </div>
            <div className="mt-5 space-y-2">
              {orderedFurniture.map((item, index) => (
                <label key={item.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm ${selected.includes(item.id) ? 'border-wood-500 bg-wood-50' : 'border-stone-200 bg-white'}`}>
                  <input type="checkbox" className="h-4 w-4 accent-wood-700" checked={selected.includes(item.id)} onChange={() => toggleFurniture(item.id)} />
                  <span className="w-6 text-xs text-stone-400">{(() => {
                    const selectedIndex = orderedSelected.indexOf(item.id)
                    return selectedIndex >= 0 ? selectedIndex + 1 : index + 1
                  })()}</span>
                  <span className="font-semibold text-stone-900">{item.name}</span>
                  <span className="text-stone-500">{item.position}</span>
                  <span className="ml-auto rounded-full bg-white px-2.5 py-1 text-xs text-wood-700">{jointName(item.jointTypeId)}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-5">
            <div className="panel p-5 sm:p-6">
              <h2 className="text-lg font-semibold text-wood-900">2. U盘固定容量</h2>
              <label className="mt-4 block text-sm">
                <span className="font-medium text-stone-700">每只U盘可用容量（KiB）</span>
                <input type="number" min={1} step={1} className="input-field mt-2" value={capacityKiB} onChange={(event) => setCapacityKiB(Number(event.target.value))} />
              </label>
              <button type="button" className="primary-button mt-5 w-full" disabled={busy || selected.length === 0 || Boolean(packJob)} onClick={() => void startPacking()}>
                生成资料卷
              </button>
              {packJob ? <p className="mt-3 text-xs leading-5 text-amber-700">已有未完成任务。失败或中断后可从最后完成卷之后继续，无需重新写入。</p> : null}
            </div>

            {packJob ? <PackJobPanel job={packJob} busy={busy} onWrite={writePackVolume} onReset={() => void startNewTransfer()} /> : null}
          </div>
        </section>
      ) : (
        <section className="grid gap-6 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <div className="panel p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-wood-900">接收U盘资料卷</h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">可一次选择多卷，也可分多次添加。系统只暂存文件，完成“校验全部卷”后才写入 IndexedDB。</p>
            <input ref={fileInputRef} type="file" accept="application/json,.json" multiple className="mt-5 block w-full text-sm" onChange={(event) => void prepareImport(event)} />
            <button type="button" className="primary-button mt-5 w-full" disabled={busy || !importJob || importJob.staged.length === 0} onClick={() => void runImport()}>
              先校验全部卷，再恢复
            </button>
            {importJob?.status === 'failed' ? <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-800">{importJob.lastError}</p> : null}
            {importJob?.status === 'completed' ? <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-800">恢复完成；重试已完成卷会使用相同ID覆盖，不会产生重复记录。</p> : null}
          </div>
          <ImportJobPanel job={importJob} busy={busy} onRemove={removeFile} onReset={() => void startNewTransfer()} />
        </section>
      )}
    </div>
  )
}

function PackJobPanel({ job, busy, onWrite, onReset }: { job: PackTransferJob; busy: boolean; onWrite: (no: number) => void; onReset: () => void }) {
  return (
    <div className="panel p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-wood-900">3. 逐卷写入</h2>
          <p className="mt-1 text-xs break-all text-stone-500">卷组：{job.setId}</p>
        </div>
        <button type="button" className="text-xs text-stone-500 hover:text-rose-700" onClick={onReset}>清除任务</button>
      </div>
      <div className="mt-5 space-y-3">
        {job.volumes.map(({ manifest }) => {
          const done = job.completedVolumes.includes(manifest.volumeNo)
          const next = job.completedVolumes.length + 1 === manifest.volumeNo
          return (
            <article key={manifest.volumeNo} className={`rounded-xl border px-4 py-3 ${done ? 'border-emerald-200 bg-emerald-50' : next ? 'border-wood-400 bg-wood-50' : 'border-stone-200 bg-white'}`}>
              <div className="flex items-center gap-3">
                <strong className="text-sm text-stone-900">第 {manifest.volumeNo}/{job.totalVolumes} 卷</strong>
                <span className="text-xs text-stone-500">{manifest.furnitureIds.length} 件家具 · {manifest.includedJointIds.length} 个首存榫卯 · {manifest.jointReferences.length} 个引用</span>
                <span className="ml-auto text-xs text-stone-500">{formatBytes(manifest.sizeBytes)} / {formatBytes(manifest.capacityBytes)}</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-stone-600">{manifest.furniture.map((item) => item.name).join('、')}</p>
              <button type="button" className="mt-3 text-xs font-semibold text-wood-700 underline-offset-2 hover:underline disabled:text-stone-400" disabled={busy || (!done && !next)} onClick={() => onWrite(manifest.volumeNo)}>
                {done ? '重新保存此卷（幂等覆盖）' : '保存到U盘并标记完成'}
              </button>
            </article>
          )
        })}
      </div>
    </div>
  )
}

function ImportJobPanel({ job, busy, onRemove, onReset }: { job?: ImportTransferJob; busy: boolean; onRemove: (index: number) => void; onReset: () => void }) {
  if (!job) return <div className="panel p-6 text-sm text-stone-500">添加资料卷后会在此显示恢复进度。</div>
  const detected = new Map<number, number>()
  job.staged.forEach((file) => {
    if (file.detectedVolumeNo !== null) detected.set(file.detectedVolumeNo, (detected.get(file.detectedVolumeNo) ?? 0) + 1)
  })
  return (
    <div className="panel p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-wood-900">已收卷清单</h2>
          <p className="mt-1 text-xs text-stone-500">{job.totalVolumes ? `共 ${job.totalVolumes} 卷，已完成 ${job.completedVolumes.length} 卷` : '等待识别卷文件'}</p>
        </div>
        <button type="button" className="text-xs text-stone-500 hover:text-rose-700" onClick={onReset}>清除暂存</button>
      </div>
      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        {Array.from({ length: job.totalVolumes || 0 }, (_, index) => index + 1).map((no) => {
          const done = job.completedVolumes.includes(no)
          const received = detected.has(no)
          return <div key={no} className={`rounded-lg border px-3 py-2 text-xs ${done ? 'border-emerald-200 bg-emerald-50' : received ? 'border-wood-300 bg-wood-50' : 'border-stone-200 bg-white text-stone-500'}`}>第 {no} 卷 · {done ? '已恢复' : received ? '已暂存' : '缺失'}</div>
        })}
      </div>
      <ul className="mt-5 space-y-2">
        {job.staged.map((file, index) => (
          <li key={`${file.name}-${index}`} className="flex items-center gap-3 rounded-lg bg-stone-50 px-3 py-2 text-xs">
            <span className="min-w-0 flex-1 truncate">{file.name}</span>
            {file.parseError ? <span className="text-rose-700">无法识别</span> : <span className="text-stone-500">{file.detectedVolumeNo ? `第${file.detectedVolumeNo}卷` : '信息不完整'}</span>}
            <button type="button" className="text-stone-500 hover:text-rose-700 disabled:opacity-50" disabled={busy} onClick={() => void onRemove(index)}>移除</button>
          </li>
        ))}
      </ul>
    </div>
  )
}
