import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BlankPanel } from '../components/common/BlankPanel'
import { SizeField } from '../components/common/SizeField'
import { SvgCanvas } from '../components/common/SvgCanvas'
import { useSvgHitAreas } from '../hooks/useSvgHitAreas'
import { useDiagramStore } from '../stores/diagramStore'
import { useJointStore } from '../stores/jointStore'
import type { MemberName } from '../types/member'

export default function DiagramEditor() {
  const { id: idParam } = useParams()
  const id = idParam ?? ''
  const joints = useJointStore((state) => state.joints)
  const members = useJointStore((state) => state.members)
  const loadAll = useJointStore((state) => state.loadAll)
  const renameMember = useJointStore((state) => state.renameMember)
  const updateMemberDimensions = useJointStore((state) => state.updateMemberDimensions)
  const diagrams = useDiagramStore((state) => state.diagrams)
  const selectedDiagramId = useDiagramStore((state) => state.selectedDiagramId)
  const draftSvgMarkup = useDiagramStore((state) => state.draftSvgMarkup)
  const draftTitle = useDiagramStore((state) => state.draftTitle)
  const loadDiagrams = useDiagramStore((state) => state.loadDiagrams)
  const setSelectedDiagram = useDiagramStore((state) => state.setSelectedDiagram)
  const setDraftSvgMarkup = useDiagramStore((state) => state.setDraftSvgMarkup)
  const setDraftTitle = useDiagramStore((state) => state.setDraftTitle)
  const saveDraft = useDiagramStore((state) => state.saveDraft)
  const { hitAreas, selectedMemberId, selectedMember, selectMember } = useSvgHitAreas(selectedDiagramId)

  useEffect(() => {
    void loadAll()
    if (id) void loadDiagrams(id)
  }, [id, loadAll, loadDiagrams])

  const joint = joints.find((item) => item.id === id)
  const jointMembers = members.filter((member) => member.jointTypeId === id)

  return (
    <div className="space-y-7">
      <div>
        <Link to={`/joints/${id}`} className="inline-flex items-center gap-1.5 text-sm text-wood-700 hover:underline">
          <span aria-hidden="true">←</span> 返回类型详情
        </Link>
      </div>

      <section className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-2 text-xs font-semibold tracking-[0.24em] text-wood-500">DIAGRAM WORKBENCH</p>
          <h1 className="text-3xl font-bold tracking-tight text-wood-900 sm:text-4xl">{joint?.name ?? '榫卯'} · 示意图绘制台</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-stone-600">
            点击内联 SVG 中的木构件回填名称与尺寸，也可以直接调整 SVG 源并保存。
          </p>
        </div>
        <button type="button" className="primary-button" disabled={!selectedDiagramId} onClick={() => void saveDraft()}>保存示意图修改</button>
      </section>

      {diagrams.length === 0 ? (
        <BlankPanel title="当前类型没有示意图" description="示意图数据尚未建立，暂时无法进入热区标定。" />
      ) : (
        <>
          <section className="flex flex-wrap gap-2">
            {diagrams.map((diagram) => (
              <button
                key={diagram.id}
                type="button"
                className={`rounded-lg border px-4 py-2 text-sm transition ${
                  selectedDiagramId === diagram.id
                    ? 'border-wood-700 bg-wood-700 text-white'
                    : 'border-wood-100 bg-white text-wood-700 hover:border-wood-500'
                }`}
                onClick={() => setSelectedDiagram(diagram.id)}
              >
                {diagram.title}
              </button>
            ))}
          </section>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.8fr)]">
            <div className="space-y-5">
              <div className="panel p-4">
                <label className="space-y-1.5 text-sm">
                  <span className="font-medium text-stone-700">示意图标题</span>
                  <input className="input-field" value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} />
                </label>
              </div>
              <SvgCanvas
                svgMarkup={draftSvgMarkup}
                title={draftTitle || '示意图预览'}
                hitAreas={hitAreas}
                selectedMemberId={selectedMemberId}
                onSelectMember={selectMember}
              />
            </div>

            <aside className="space-y-5">
              <section className="panel p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-wood-900">构件回填</h2>
                    <p className="mt-1 text-xs text-stone-500">点击 SVG 热区或下方标签选择构件</p>
                  </div>
                  <span className={`h-2.5 w-2.5 rounded-full ${selectedMember ? 'bg-emerald-500' : 'bg-stone-300'}`} />
                </div>
                {selectedMember ? (
                  <div className="mt-5 space-y-5">
                    <label className="space-y-1.5 text-sm">
                      <span className="font-medium text-stone-700">构件名称</span>
                      <input
                        className="input-field"
                        value={selectedMember.name}
                        onChange={(event) => void renameMember(selectedMember.id, event.target.value as MemberName)}
                      />
                    </label>
                    <div className="grid grid-cols-2 gap-4">
                      <SizeField
                        label="长度"
                        valueMm={selectedMember.lengthMm}
                        toleranceMm={selectedMember.toleranceMm}
                        onChange={(value) => void updateMemberDimensions(selectedMember.id, {
                          lengthMm: value,
                          widthMm: selectedMember.widthMm,
                          thicknessMm: selectedMember.thicknessMm,
                          toleranceMm: selectedMember.toleranceMm,
                        })}
                      />
                      <SizeField
                        label="宽度"
                        valueMm={selectedMember.widthMm}
                        toleranceMm={selectedMember.toleranceMm}
                        onChange={(value) => void updateMemberDimensions(selectedMember.id, {
                          lengthMm: selectedMember.lengthMm,
                          widthMm: value,
                          thicknessMm: selectedMember.thicknessMm,
                          toleranceMm: selectedMember.toleranceMm,
                        })}
                      />
                      <SizeField
                        label="厚度"
                        valueMm={selectedMember.thicknessMm}
                        toleranceMm={selectedMember.toleranceMm}
                        onChange={(value) => void updateMemberDimensions(selectedMember.id, {
                          lengthMm: selectedMember.lengthMm,
                          widthMm: selectedMember.widthMm,
                          thicknessMm: value,
                          toleranceMm: selectedMember.toleranceMm,
                        })}
                      />
                      <SizeField
                        label="配合公差"
                        valueMm={selectedMember.toleranceMm}
                        toleranceMm={selectedMember.toleranceMm}
                        onChange={(value) => void updateMemberDimensions(selectedMember.id, {
                          lengthMm: selectedMember.lengthMm,
                          widthMm: selectedMember.widthMm,
                          thicknessMm: selectedMember.thicknessMm,
                          toleranceMm: value,
                        })}
                      />
                    </div>
                    <dl className="grid grid-cols-2 gap-3 rounded-xl bg-wood-50 p-4 text-xs">
                      <div><dt className="text-stone-500">归属</dt><dd className="mt-1 font-medium text-wood-900">{selectedMember.part}</dd></div>
                      <div><dt className="text-stone-500">纹理</dt><dd className="mt-1 font-medium text-wood-900">{selectedMember.grainDir}</dd></div>
                    </dl>
                    <p className="text-xs leading-5 text-stone-500">{selectedMember.note}</p>
                  </div>
                ) : (
                  <div className="mt-5 rounded-xl border border-dashed border-wood-100 bg-wood-50/60 px-4 py-8 text-center text-sm text-stone-500">
                    尚未选择构件
                  </div>
                )}
              </section>

              <section className="panel p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-wood-900">SVG 源</h2>
                    <p className="mt-1 text-xs text-stone-500">保留 data-member-id 才能继续点击回填</p>
                  </div>
                  <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] text-stone-500">内联</span>
                </div>
                <textarea
                  rows={12}
                  spellCheck={false}
                  className="mt-4 w-full resize-y rounded-xl border border-wood-100 bg-stone-950 p-3 font-mono text-xs leading-5 text-stone-100 outline-none focus:border-wood-500"
                  value={draftSvgMarkup}
                  onChange={(event) => setDraftSvgMarkup(event.target.value)}
                />
              </section>

              <section className="rounded-xl border border-wood-100 bg-wood-50 p-4 text-xs leading-6 text-stone-600">
                该类型共有 {jointMembers.length} 件构件、{diagrams.length} 张示意图。修改保存后会写入浏览器本地数据库。
              </section>
            </aside>
          </div>
        </>
      )}
    </div>
  )
}
