import { ArrowDown, ArrowRight, ArrowUp, ChevronUp, FolderPlus, RotateCcw, Search, Settings2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { Criterion, Direction, Project, ProjectEvaluation } from '../api/types'
import { CriterionSettings } from '../components/CriterionSettings'
import { ApiErrorBox, IssueList } from '../components/IssueList'
import type { LevelItem } from '../components/WeightLevel'
import { WeightLevels } from '../components/WeightLevels'
import { Button, Card, PageHeader, Segmented, Spinner } from '../components/ui'
import { useApiPost, useCheckedProject } from '../hooks'
import { useT } from '../i18n/useT'
import { formatResultScore } from '../lib/methods'
import { directionOf, setDirection } from '../lib/project'
import { withNewGroup } from '../lib/weighting'
import { useStore } from '../store'

export function WeightsPage() {
  const t = useT()
  const checked = useCheckedProject()!
  const { updateProject, importedWeighting, setStep } = useStore()
  const [query, setQuery] = useState('')
  const [hideZero, setHideZero] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)

  const { project } = checked
  const criteria = new Map(project.criteria.map((c) => [c.id, c]))
  const matches = (item: LevelItem, overall: Record<string, number> | undefined) =>
    item.name.toLowerCase().includes(query.trim().toLowerCase()) && (!hideZero || (overall?.[item.id] ?? 1) > 0)

  const criterionControls = (id: string) => (
    <CriterionControls
      criterion={criteria.get(id)!}
      open={openId === id}
      onToggle={() => setOpenId(openId === id ? null : id)}
      onDirection={(direction) => updateProject((p) => setDirection(p, id, direction))}
    />
  )
  const criterionDetails = (id: string) =>
    openId === id && (
      <CriterionSettings
        project={project}
        apiProject={checked.apiProject}
        criterion={criteria.get(id)!}
        update={updateProject}
      />
    )

  return (
    <div>
      <PageHeader
        title={t('weights.title')}
        intro={t('weights.intro')}
        actions={
          <>
            <Button
              icon={<FolderPlus className="size-4" />}
              onClick={() => updateProject((p) => withNewGroup(p, t('groups.newName')))}
            >
              {t('groups.add')}
            </Button>
            {importedWeighting && (
              <Button
                variant="ghost"
                icon={<RotateCcw className="size-4" />}
                onClick={() => updateProject((p) => ({ ...p, weighting: importedWeighting }))}
              >
                {t('weights.resetImported')}
              </Button>
            )}
          </>
        }
      />
      {checked.issues.length > 0 && (
        <div className="mb-4">
          <IssueList issues={checked.issues} project={project} />
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-4">
            <label className="relative">
              <Search className="pointer-events-none absolute top-2 left-2.5 size-4 text-slate-400" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('weights.search')}
                className="focus:border-accent-500 w-56 rounded-lg border border-slate-300 bg-white py-1.5 pr-3 pl-8 text-sm focus:outline-none"
              />
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={hideZero}
                onChange={(e) => setHideZero(e.target.checked)}
                className="accent-accent-600"
              />
              {t('weights.hideZero')}
            </label>
          </div>

          <WeightLevels
            project={project}
            apiProject={checked.apiProject}
            update={updateProject}
            visible={matches}
            controls={criterionControls}
            details={criterionDetails}
          />
        </div>

        <div className="xl:sticky xl:top-20 xl:self-start">
          <LiveRanking project={checked.apiProject} />
          <div className="mt-4 flex justify-end">
            <Button variant="primary" onClick={() => setStep('results')} disabled={!checked.apiProject}>
              {t('step.results')} <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function CriterionControls({
  criterion,
  open,
  onToggle,
  onDirection,
}: {
  criterion: Criterion
  open: boolean
  onToggle: () => void
  onDirection: (direction: Direction) => void
}) {
  const t = useT()
  const direction = directionOf(criterion)
  return (
    <>
      {direction ? (
        <Segmented<Direction>
          size="sm"
          value={direction}
          onChange={onDirection}
          options={[
            { value: 'benefit', label: t('common.benefit'), title: t('common.benefitHint') },
            { value: 'cost', label: t('common.cost'), title: t('common.costHint') },
          ]}
        />
      ) : (
        <span className="w-[6.5rem] text-xs text-slate-400">—</span>
      )}
      <Button
        variant="ghost"
        className="!px-2 !py-1 text-xs"
        aria-expanded={open}
        aria-label={`${open ? t('settings.close') : t('settings.open')}: ${criterion.name}`}
        icon={open ? <ChevronUp className="size-3.5" /> : <Settings2 className="size-3.5" />}
        onClick={onToggle}
      >
        {open ? t('settings.close') : t('settings.open')}
      </Button>
    </>
  )
}

const weightedSumOnly = (project: Project): Project => ({
  ...project,
  analysis: { ...project.analysis, methods: [{ method: 'weighted_sum' }] },
})

function LiveRanking({ project }: { project: Project | null }) {
  const t = useT()
  const importedWeighting = useStore((s) => s.importedWeighting)

  const current = useApiPost<ProjectEvaluation>('/projects/evaluate', project && weightedSumOnly(project), 150)
  const baselineProject = useMemo(
    () => (project && importedWeighting ? weightedSumOnly({ ...project, weighting: importedWeighting }) : null),
    [project, importedWeighting],
  )
  const baseline = useApiPost<ProjectEvaluation>('/projects/evaluate', baselineProject, 150)

  const result = current.data?.results[0]
  const baselineRanks = new Map(baseline.data?.results[0].alternatives.map((a) => [a.id, a.rank]))
  const rows = result ? [...result.alternatives].sort((a, b) => a.rank - b.rank) : []
  const maxScore = Math.max(...rows.map((r) => Math.abs(r.score)), 1e-12)

  return (
    <Card title={t('weights.liveRanking')} actions={current.loading && <Spinner />}>
      <p className="mb-3 text-xs text-slate-500">{t('weights.liveHint')}</p>
      {current.error && <ApiErrorBox error={current.error} project={project} />}
      <ol className="space-y-2">
        {rows.map((row) => {
          const before = baselineRanks.get(row.id)
          const delta = before === undefined ? 0 : before - row.rank
          return (
            <li key={row.id} className="flex items-center gap-2 text-sm">
              <span
                className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${row.rank === 1 ? 'bg-accent-600 text-white' : 'bg-slate-100 text-slate-600'}`}
              >
                {row.rank}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate" title={row.name}>
                    {row.name}
                  </span>
                  <span className="text-xs text-slate-500 tabular-nums">
                    {formatResultScore({ method: 'weighted_sum' }, row.score)}
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-slate-100">
                  <div
                    className="bg-accent-500 h-1.5 rounded-full transition-all"
                    style={{ width: `${(Math.abs(row.score) / maxScore) * 100}%` }}
                  />
                </div>
              </div>
              <span className="w-8 text-right text-xs">
                {delta > 0 && (
                  <span className="inline-flex items-center text-emerald-600" title={t('weights.rankUp', { n: delta })}>
                    <ArrowUp className="size-3" />
                    {delta}
                  </span>
                )}
                {delta < 0 && (
                  <span className="inline-flex items-center text-red-600" title={t('weights.rankDown', { n: -delta })}>
                    <ArrowDown className="size-3" />
                    {-delta}
                  </span>
                )}
              </span>
            </li>
          )
        })}
      </ol>
    </Card>
  )
}
