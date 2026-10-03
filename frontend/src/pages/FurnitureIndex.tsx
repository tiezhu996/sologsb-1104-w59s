import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { BlankPanel } from '../components/common/BlankPanel'
import { useJointStore } from '../stores/jointStore'
import type { FurnitureName } from '../types/furniture'

interface FurnitureFormState {
  jointTypeId: string
  name: FurnitureName
  era: string
  position: string
  loadNote: string
}

const initialForm: FurnitureFormState = {
  jointTypeId: '',
  name: '圈椅',
  era: '明式',
  position: '',
  loadNote: '',
}

export default function FurnitureIndex() {
  const joints = useJointStore((state) => state.joints)
  const furniture = useJointStore((state) => state.furniture)
  const loading = useJointStore((state) => state.loading)
  const loadAll = useJointStore((state) => state.loadAll)
  const addFurniture = useJointStore((state) => state.addFurniture)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<FurnitureFormState>(initialForm)

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  useEffect(() => {
    if (!form.jointTypeId && joints[0]) {
      setForm((current) => ({ ...current, jointTypeId: joints[0]?.id ?? '' }))
    }
  }, [form.jointTypeId, joints])

  const submitFurniture = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!form.jointTypeId || !form.name.trim() || !form.position.trim() || !form.loadNote.trim()) return
    await addFurniture({
      ...form,
      name: form.name.trim() as FurnitureName,
      era: form.era.trim() || '未标注年代',
      position: form.position.trim(),
      loadNote: form.loadNote.trim(),
    })
    setForm({ ...initialForm, jointTypeId: joints[0]?.id ?? '' })
    setShowForm(false)
  }

  const groups = furniture.reduce<Array<{ name: FurnitureName; items: typeof furniture }>>((result, item) => {
    const existing = result.find((group) => group.name === item.name)
    if (existing) existing.items.push(item)
    else result.push({ name: item.name, items: [item] })
    return result
  }, [])

  return (
    <div className="space-y-7">
      <section className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-2 text-xs font-semibold tracking-[0.24em] text-wood-500">FURNITURE INDEX</p>
          <h1 className="text-3xl font-bold tracking-tight text-wood-900 sm:text-4xl">家具榫卯反查</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-stone-600">
            从家具部位反查所用榫卯，并记录承力方式与年代特征。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-xl border border-wood-100 bg-white px-4 py-2.5 text-sm text-stone-600 shadow-sm">
            家具关联 <span className="mx-1 text-lg font-bold text-wood-700" data-testid="count-furniture">{furniture.length}</span> 条
          </div>
          <button
            type="button"
            className="primary-button"
            data-testid="new-furniture"
            disabled={joints.length === 0}
            onClick={() => setShowForm(true)}
          >
            <span className="text-lg leading-none">＋</span>
            新建家具关联
          </button>
        </div>
      </section>

      {showForm ? (
        <form className="panel grid gap-5 p-5 sm:p-6" data-testid="form-furniture" onSubmit={(event) => void submitFurniture(event)}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-wood-900">登记家具使用部位</h2>
              <p className="mt-1 text-xs text-stone-500">把家具名称、年代、使用部位和承力说明挂接到榫卯类型。</p>
            </div>
            <button type="button" className="rounded-lg px-3 py-2 text-sm text-stone-500 hover:bg-stone-100" onClick={() => setShowForm(false)}>收起</button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-stone-700">对应榫卯</span>
              <select
                required
                className="input-field"
                data-testid="field-jointTypeId"
                value={form.jointTypeId}
                onChange={(event) => setForm((current) => ({ ...current, jointTypeId: event.target.value }))}
              >
                {joints.map((joint) => <option key={joint.id} value={joint.id}>{joint.name}</option>)}
              </select>
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-stone-700">家具名称</span>
              <input
                required
                className="input-field"
                data-testid="field-name"
                list="furniture-name-options"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value as FurnitureName }))}
              />
              <datalist id="furniture-name-options">
                <option value="圈椅" />
                <option value="条案" />
                <option value="架子床" />
                <option value="官帽椅" />
                <option value="方桌" />
                <option value="柜架" />
              </datalist>
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-stone-700">年代</span>
              <input
                required
                className="input-field"
                data-testid="field-era"
                value={form.era}
                onChange={(event) => setForm((current) => ({ ...current, era: event.target.value }))}
                placeholder="例如：明式"
              />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-stone-700">使用部位</span>
              <input
                required
                className="input-field"
                data-testid="field-position"
                value={form.position}
                onChange={(event) => setForm((current) => ({ ...current, position: event.target.value }))}
                placeholder="例如：扶手与腿足交接处"
              />
            </label>
            <label className="space-y-1.5 text-sm md:col-span-2">
              <span className="font-medium text-stone-700">承力说明</span>
              <textarea
                required
                rows={3}
                className="input-field resize-y"
                data-testid="field-loadNote"
                value={form.loadNote}
                onChange={(event) => setForm((current) => ({ ...current, loadNote: event.target.value }))}
                placeholder="说明该部位长期承受的拉力、压力或扭力"
              />
            </label>
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" className="secondary-button" onClick={() => setShowForm(false)}>取消</button>
            <button type="submit" className="primary-button" data-testid="submit-furniture">保存家具关联</button>
          </div>
        </form>
      ) : null}

      {furniture.length === 0 && !loading ? (
        <BlankPanel title="尚无可反查家具" description="先建立榫卯类型，再登记家具的使用部位和承力方式。" />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {groups.map((group) => (
            <section key={group.name} className="panel overflow-hidden" data-testid="row-furniture">
              <header className="flex items-center justify-between border-b border-wood-100 bg-wood-50/70 px-5 py-4">
                <div>
                  <h2 className="text-xl font-bold text-wood-900">{group.name}</h2>
                  <p className="mt-1 text-xs text-stone-500">{group.items.length} 个关联部位</p>
                </div>
                <svg aria-hidden="true" viewBox="0 0 48 48" className="h-10 w-10 text-wood-500" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M8 38h32M12 34V19h24v15M16 19v-6h16v6M18 25h12M18 30h12" />
                </svg>
              </header>
              <div className="divide-y divide-stone-100">
                {group.items.map((item) => {
                  const joint = joints.find((candidate) => candidate.id === item.jointTypeId)
                  return (
                    <article key={item.id} className="px-5 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-wood-50 px-2.5 py-1 text-xs text-wood-700">{item.era}</span>
                        <span className="text-sm font-medium text-stone-900">{item.position}</span>
                        {joint ? (
                          <Link className="ml-auto text-xs font-semibold text-wood-700 underline-offset-4 hover:underline" to={`/joints/${joint.id}`}>
                            榫卯：{joint.name}
                          </Link>
                        ) : null}
                      </div>
                      <p className="mt-2 text-sm leading-6 text-stone-600">{item.loadNote}</p>
                    </article>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
