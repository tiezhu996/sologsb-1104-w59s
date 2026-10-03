import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BlankPanel } from '../components/common/BlankPanel'
import { DifficultyTag } from '../components/common/DifficultyTag'
import { SizeField } from '../components/common/SizeField'
import { StepRail } from '../components/common/StepRail'
import { useStepOrder } from '../hooks/useStepOrder'
import { useJointStore } from '../stores/jointStore'
import { checkTolerance, formatDimension } from '../utils/measure'
import { exportJointData } from '../utils/export'

export default function JointDetail() {
  const { id: idParam } = useParams()
  const id = idParam ?? ''
  const joints = useJointStore((state) => state.joints)
  const members = useJointStore((state) => state.members)
  const furniture = useJointStore((state) => state.furniture)
  const loading = useJointStore((state) => state.loading)
  const loadAll = useJointStore((state) => state.loadAll)
  const updateMemberDimensions = useJointStore((state) => state.updateMemberDimensions)
  const { steps, totalDurationSec, currentStepIndex, move, setCurrentStep } = useStepOrder(id)

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  const joint = joints.find((item) => item.id === id)
  const currentMembers = members
    .filter((member) => member.jointTypeId === id)
    .sort((a, b) => a.lengthMm - b.lengthMm)
  const currentFurniture = furniture.filter((item) => item.jointTypeId === id)

  if (!joint && !loading) {
    return (
      <div data-testid="detail-joint">
        <BlankPanel title="未找到这项榫卯" description="记录可能已被移除，请返回图鉴重新选择。" />
      </div>
    )
  }

  if (!joint) {
    return <div className="py-16 text-center text-sm text-stone-500" data-testid="detail-joint">正在读取木作数据…</div>
  }

  return (
    <div className="space-y-7" data-testid="detail-joint">
      <div>
        <Link to="/joints" className="inline-flex items-center gap-1.5 text-sm text-wood-700 hover:underline">
          <span aria-hidden="true">←</span> 返回图鉴总览
        </Link>
      </div>

      <section className="panel overflow-hidden">
        <div className="relative grid gap-6 p-6 lg:grid-cols-[1fr_auto] lg:items-start sm:p-8">
          <div className="absolute right-0 top-0 h-32 w-32 rounded-bl-full bg-wood-50" />
          <div className="relative">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-wood-100 bg-white px-3 py-1 text-xs text-wood-700">{joint.family}</span>
              <DifficultyTag difficulty={joint.difficulty} />
              <span className="text-xs text-stone-500">{joint.glueNeeded ? '建议配合胶合' : '可拆式干装'}</span>
            </div>
            <h1 className="mt-5 text-3xl font-bold tracking-tight text-wood-900 sm:text-4xl">{joint.name} · 结构详情</h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-stone-600">{joint.strengthNote}</p>
          </div>
          <div className="relative grid grid-cols-3 gap-3">
            <Stat label="构件" value={currentMembers.length} unit="件" />
            <Stat label="步序" value={steps.length} unit="步" />
            <Stat label="演示" value={totalDurationSec} unit="秒" />
          </div>
        </div>
        <div className="flex flex-wrap gap-3 border-t border-wood-100 bg-wood-50/60 px-6 py-4 sm:px-8">
          <Link className="primary-button" to={`/joints/${joint.id}/steps`}>编排拆装步序</Link>
          <Link className="secondary-button" to={`/joints/${joint.id}/diagram`}>进入示意图绘制台</Link>
          <button type="button" className="secondary-button" onClick={() => void exportJointData(joint.id, joint.name)}>导出当前类型</button>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-wood-900">构件尺寸与公差</h2>
            <p className="mt-1 text-sm text-stone-500">按短料优先排列，可直接在毫米与寸之间切换录入。</p>
          </div>
          <span className="text-xs text-stone-500">基准间隙 0.20 mm，允许偏离 ±0.12 mm</span>
        </div>
        {currentMembers.length === 0 ? (
          <BlankPanel title="尚无构件记录" description="当前类型的构件尺寸仍待补充。" />
        ) : (
          <div className="panel overflow-x-auto">
            <table className="min-w-[980px] w-full border-collapse text-left text-sm">
              <thead className="bg-wood-50 text-xs text-wood-700">
                <tr>
                  <th className="px-4 py-3 font-semibold">构件</th>
                  <th className="px-4 py-3 font-semibold">归属</th>
                  <th className="px-4 py-3 font-semibold">纹理</th>
                  <th className="px-4 py-3 font-semibold">长</th>
                  <th className="px-4 py-3 font-semibold">宽</th>
                  <th className="px-4 py-3 font-semibold">厚</th>
                  <th className="px-4 py-3 font-semibold">配合校验</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {currentMembers.map((member) => {
                  const tolerance = checkTolerance(member.toleranceMm, 0.2, 0.12)
                  return (
                    <tr key={member.id} className="align-top">
                      <td className="px-4 py-4">
                        <strong className="block text-stone-900">{member.name}</strong>
                        <span className="mt-1 block max-w-52 text-xs leading-5 text-stone-500">{member.note}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-stone-600">{member.part}</td>
                      <td className="whitespace-nowrap px-4 py-4 text-stone-600">{member.grainDir}</td>
                      <td className="w-32 px-3 py-3">
                        <SizeField
                          label={`${member.name}长度`}
                          valueMm={member.lengthMm}
                          toleranceMm={member.toleranceMm}
                          onChange={(value) => void updateMemberDimensions(member.id, {
                            lengthMm: value,
                            widthMm: member.widthMm,
                            thicknessMm: member.thicknessMm,
                            toleranceMm: member.toleranceMm,
                          })}
                        />
                      </td>
                      <td className="w-32 px-3 py-3">
                        <SizeField
                          label={`${member.name}宽度`}
                          valueMm={member.widthMm}
                          toleranceMm={member.toleranceMm}
                          onChange={(value) => void updateMemberDimensions(member.id, {
                            lengthMm: member.lengthMm,
                            widthMm: value,
                            thicknessMm: member.thicknessMm,
                            toleranceMm: member.toleranceMm,
                          })}
                        />
                      </td>
                      <td className="w-32 px-3 py-3">
                        <SizeField
                          label={`${member.name}厚度`}
                          valueMm={member.thicknessMm}
                          toleranceMm={member.toleranceMm}
                          onChange={(value) => void updateMemberDimensions(member.id, {
                            lengthMm: member.lengthMm,
                            widthMm: member.widthMm,
                            thicknessMm: value,
                            toleranceMm: member.toleranceMm,
                          })}
                        />
                      </td>
                      <td className="w-52 px-4 py-4">
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                          tolerance.withinTolerance
                            ? 'bg-emerald-50 text-emerald-800'
                            : 'bg-rose-50 text-rose-800'
                        }`}>
                          {tolerance.withinTolerance ? '配合合适' : '需要修配'}
                        </span>
                        <p className="mt-2 text-xs leading-5 text-stone-500">{tolerance.message}</p>
                        <p className="mt-1 text-[11px] text-stone-400">登记公差 {formatDimension(member.toleranceMm, 'mm', 2)}</p>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold text-wood-900">适用家具</h2>
            <p className="mt-1 text-sm text-stone-500">反查该榫卯在实际家具中的位置与承力作用。</p>
          </div>
          {currentFurniture.length === 0 ? (
            <BlankPanel title="尚未关联家具" description="可在家具反查页登记使用部位。" />
          ) : (
            <div className="space-y-3">
              {currentFurniture.map((item) => (
                <article key={item.id} className="panel p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-wood-900">{item.name}</h3>
                    <span className="rounded-full bg-wood-50 px-2.5 py-1 text-xs text-wood-700">{item.era}</span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-stone-700">{item.position}</p>
                  <p className="mt-2 text-xs leading-5 text-stone-500">{item.loadNote}</p>
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-wood-900">拆装步序</h2>
              <p className="mt-1 text-sm text-stone-500">点击步骤查看风险提醒，也可直接拖动调整顺序。</p>
            </div>
            <span className="text-xs text-wood-700">共 {totalDurationSec} 秒</span>
          </div>
          {steps.length === 0 ? (
            <BlankPanel title="尚无拆装步骤" description="进入步序编排页补充拆装动作。" />
          ) : (
            <StepRail steps={steps} currentIndex={currentStepIndex} onSelect={setCurrentStep} onMove={(from, to) => void move(from, to)} />
          )}
        </div>
      </section>
    </div>
  )
}

function Stat({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div className="rounded-xl border border-wood-100 bg-white/90 px-3 py-3 text-center shadow-sm">
      <strong className="block text-xl text-wood-700">{value}</strong>
      <span className="mt-1 block text-[11px] text-stone-500">{label} · {unit}</span>
    </div>
  )
}
