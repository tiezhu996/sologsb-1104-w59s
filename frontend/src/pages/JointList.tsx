import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { BlankPanel } from '../components/common/BlankPanel'
import { DifficultyTag } from '../components/common/DifficultyTag'
import { useJointStore } from '../stores/jointStore'
import type { JointDifficulty, JointFamily, JointName, JointType } from '../types/jointType'
import { exportAllData } from '../utils/export'

interface JointFormState {
  name: JointName
  family: JointFamily
  difficulty: JointDifficulty
  strengthNote: string
  glueNeeded: boolean
}

const initialForm: JointFormState = {
  name: '燕尾榫',
  family: '出头',
  difficulty: '入门',
  strengthNote: '',
  glueNeeded: false,
}

const families: JointFamily[] = ['出头', '闷榫', '圆材']
const difficulties: JointDifficulty[] = ['入门', '进阶', '高难']

export default function JointList() {
  const joints = useJointStore((state) => state.joints)
  const members = useJointStore((state) => state.members)
  const stepCounts = useJointStore((state) => state.stepCounts)
  const loading = useJointStore((state) => state.loading)
  const loadAll = useJointStore((state) => state.loadAll)
  const addJoint = useJointStore((state) => state.addJoint)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<JointFormState>(initialForm)
  const familyGroups = Array.from(new Set([...families, ...joints.map((joint) => joint.family)]))
  const difficultyGroups = Array.from(new Set([...difficulties, ...joints.map((joint) => joint.difficulty)]))

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  const submitJoint = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!form.name.trim() || !form.strengthNote.trim()) return
    await addJoint({
      ...form,
      name: form.name.trim() as JointName,
      strengthNote: form.strengthNote.trim(),
    })
    setForm(initialForm)
    setShowForm(false)
  }

  return (
    <div className="space-y-7">
      <section className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-2 text-xs font-semibold tracking-[0.24em] text-wood-500">JOINT ATLAS</p>
          <h1 className="text-3xl font-bold tracking-tight text-wood-900 sm:text-4xl">榫卯图鉴总览</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-stone-600">
            按木作家族与难度整理榫卯节点，查看构件尺度、拆装步序和适用家具。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-xl border border-wood-100 bg-white px-4 py-2.5 text-sm text-stone-600 shadow-sm">
            已收录 <span className="mx-1 text-lg font-bold text-wood-700" data-testid="count-joint">{joints.length}</span> 类
          </div>
          <button type="button" className="secondary-button" onClick={() => void exportAllData()}>
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 19h14" /></svg>
            导出全部数据
          </button>
          <button type="button" className="primary-button" data-testid="new-joint" onClick={() => setShowForm(true)}>
            <span className="text-lg leading-none">＋</span>
            新建榫卯类型
          </button>
        </div>
      </section>

      {showForm ? (
        <form className="panel grid gap-5 p-5 sm:p-6" data-testid="form-joint" onSubmit={(event) => void submitJoint(event)}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-wood-900">登记新的榫卯类型</h2>
              <p className="mt-1 text-xs text-stone-500">先建立类型，再进入详情补充构件、拆装步骤与示意图。</p>
            </div>
            <button type="button" className="rounded-lg px-3 py-2 text-sm text-stone-500 hover:bg-stone-100" onClick={() => setShowForm(false)}>收起</button>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-stone-700">类型名称</span>
              <input
                required
                className="input-field"
                data-testid="field-name"
                list="joint-name-options"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value as JointName }))}
                placeholder="例如：燕尾榫"
              />
              <datalist id="joint-name-options">
                <option value="燕尾榫" />
                <option value="格肩榫" />
                <option value="粽角榫" />
                <option value="抱肩榫" />
              </datalist>
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-stone-700">榫卯家族</span>
              <input
                required
                className="input-field"
                data-testid="field-family"
                list="joint-family-options"
                value={form.family}
                onChange={(event) => setForm((current) => ({ ...current, family: event.target.value as JointFamily }))}
              />
              <datalist id="joint-family-options">
                <option value="出头" />
                <option value="闷榫" />
                <option value="圆材" />
              </datalist>
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-stone-700">制作难度</span>
              <input
                required
                className="input-field"
                data-testid="field-difficulty"
                list="joint-difficulty-options"
                value={form.difficulty}
                onChange={(event) => setForm((current) => ({ ...current, difficulty: event.target.value as JointDifficulty }))}
              />
              <datalist id="joint-difficulty-options">
                <option value="入门" />
                <option value="进阶" />
                <option value="高难" />
              </datalist>
            </label>
            <label className="space-y-1.5 text-sm md:col-span-2">
              <span className="font-medium text-stone-700">受力特点</span>
              <textarea
                required
                rows={3}
                className="input-field resize-y"
                data-testid="field-strengthNote"
                value={form.strengthNote}
                onChange={(event) => setForm((current) => ({ ...current, strengthNote: event.target.value }))}
                placeholder="说明主要受力方向、抗拉或抗扭特点"
              />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-stone-700">是否需胶</span>
              <select
                className="input-field"
                data-testid="field-glueNeeded"
                value={String(form.glueNeeded)}
                onChange={(event) => setForm((current) => ({ ...current, glueNeeded: event.target.value === 'true' }))}
              >
                <option value="false">无需用胶</option>
                <option value="true">需要配合胶合</option>
              </select>
            </label>
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" className="secondary-button" onClick={() => setShowForm(false)}>取消</button>
            <button type="submit" className="primary-button" data-testid="submit-joint">保存榫卯类型</button>
          </div>
        </form>
      ) : null}

      {joints.length === 0 && !loading ? (
        <BlankPanel title="图鉴尚无记录" description="点击“新建榫卯类型”，录入第一项木作节点。" />
      ) : (
        <div className="space-y-7">
          {familyGroups.map((family) => {
            const familyJoints = joints.filter((joint) => joint.family === family)
            if (familyJoints.length === 0) return null
            return (
              <section key={family} className="space-y-4">
                <div className="flex items-end justify-between border-b border-wood-100 pb-3">
                  <div>
                    <h2 className="text-xl font-semibold text-wood-900">{family}榫卯</h2>
                    <p className="mt-1 text-xs text-stone-500">按难度递进整理同一家族的构造变化</p>
                  </div>
                  <span className="text-xs text-wood-700">{familyJoints.length} 类</span>
                </div>
                <div className="space-y-4">
                  {difficultyGroups.map((difficulty) => {
                    const group = familyJoints.filter((joint) => joint.difficulty === difficulty)
                    if (group.length === 0) return null
                    return (
                      <div key={`${family}-${difficulty}`} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {group.map((joint) => (
                          <JointCard
                            key={joint.id}
                            joint={joint}
                            memberCount={members.filter((member) => member.jointTypeId === joint.id).length}
                            stepCount={stepCounts[joint.id] ?? 0}
                          />
                        ))}
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}

interface JointCardProps {
  joint: JointType
  memberCount: number
  stepCount: number
}

function JointCard({ joint, memberCount, stepCount }: JointCardProps) {
  return (
    <Link
      to={`/joints/${joint.id}`}
      data-testid="row-joint"
      className="panel group relative overflow-hidden p-5 transition hover:-translate-y-0.5 hover:border-wood-500 hover:shadow-md"
    >
      <div className="absolute right-0 top-0 h-20 w-20 rounded-bl-full bg-wood-50 transition group-hover:bg-wood-100" />
      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="text-xs text-wood-500">{joint.family}</span>
            <h3 className="mt-1 text-xl font-bold text-wood-900">{joint.name}</h3>
          </div>
          <DifficultyTag difficulty={joint.difficulty} compact />
        </div>
        <p className="mt-4 min-h-12 text-sm leading-6 text-stone-600">{joint.strengthNote}</p>
        <div className="mt-5 flex items-center gap-4 border-t border-stone-100 pt-4 text-xs text-stone-500">
          <span><strong className="mr-1 text-base text-wood-700">{memberCount}</strong>件构件</span>
          <span><strong className="mr-1 text-base text-wood-700">{stepCount}</strong>步拆装</span>
          <span className="ml-auto text-wood-700">{joint.glueNeeded ? '配合用胶' : '免胶结构'}</span>
        </div>
      </div>
    </Link>
  )
}
