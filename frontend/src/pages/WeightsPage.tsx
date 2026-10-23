import { ArrowDown, ArrowRight, ArrowUp, Equal, Percent, RotateCcw, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { Criterion, Direction, Project, ProjectEvaluation } from '../api/types'
import { ApiErrorBox, IssueList } from '../components/IssueList'
import { NumberInput } from '../components/NumberInput'
import { Button, Card, PageHeader, Segmented, Spinner } from '../components/ui'
import { useApiPost, useCheckedProject } from '../hooks'
import { useT } from '../i18n/useT'
import { formatPercent, formatScore } from '../lib/format'
import { formatResultScore } from '../lib/methods'
import {
  directionOf,
  equalWeights,
  normalizedWeights,
  setDirection,
  setWeight,
  setWeights,
  totalWeight,
  weightsOf,
} from '../lib/project'
import { useStore } from '../store'

export function WeightsPage() {
  const t = useT()
  const checked = useCheckedProject()!
  const { updateProject, importedWeights, setStep } = useStore()
  const [query, setQuery] = useState('')
  const [hideZero, setHideZero] = useState(false)

  const { project } = checked
  const weights = weightsOf(project)
  const total = totalWeight(project)
  const importedTotal = importedWeights ? Object.values(importedWeights).reduce((a, b) => a + b, 0) : 0
  const sliderMax = Math.max(1, importedTotal, ...project.criteria.map((c) => weights[c.id] ?? 0))
  const visible = project.criteria
    .filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()))
    .filter((c) => !hideZero || (weights[c.id] ?? 0) > 0)

  return (
    <div>
      <PageHeader title={t('weights.title')} intro={t('weights.intro')} />
      {checked.issues.length > 0 && (
        <div className="mb-4">
          <IssueList issues={checked.issues} project={project} />
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card
          title={
            <span>
              {t('weights.total')}: <span className="tabular-nums">{formatScore(total)}</span>
            </span>
          }
          actions={
            <>
              <Button
                variant="ghost"
                icon={<Equal className="size-4" />}
                onClick={() => updateProject((p) => setWeights(p, equalWeights(p)))}
              >
                {t('weights.equal')}
              </Button>
              <Button
                variant="ghost"
                icon={<Percent className="size-4" />}
                onClick={() => updateProject((p) => setWeights(p, normalizedWeights(p)))}
              >
                {t('weights.normalize')}
              </Button>
              {importedWeights && (
                <Button
                  variant="ghost"
                  icon={<RotateCcw className="size-4" />}
                  onClick={() => updateProject((p) => setWeights(p, { ...importedWeights }))}
                >
                  {t('weights.resetImported')}
                </Button>
              )}
            </>
          }
        >
          <div className="mb-4 flex flex-wrap items-center gap-4">
            <label className="relative">
              <Search className="pointer-events-none absolute top-2 left-2.5 size-4 text-slate-400" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('weights.search')}
                className="focus:border-accent-500 w-56 rounded-lg border border-slate-300 py-1.5 pr-3 pl-8 text-sm focus:outline-none"
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

          <ul className="divide-y divide-slate-100">
            {visible.map((criterion) => (
              <CriterionRow
                key={criterion.id}
                criterion={criterion}
                weight={weights[criterion.id] ?? 0}
                share={total > 0 ? (weights[criterion.id] ?? 0) / total : 0}
                sliderMax={sliderMax}
                onWeight={(weight) => updateProject((p) => setWeight(p, criterion.id, weight))}
                onDirection={(direction) => updateProject((p) => setDirection(p, criterion.id, direction))}
              />
            ))}
          </ul>
        </Card>

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

function CriterionRow({
  criterion,
  weight,
  share,
  sliderMax,
  onWeight,
  onDirection,
}: {
  criterion: Criterion
  weight: number
  share: number
  sliderMax: number
  onWeight: (weight: number) => void
  onDirection: (direction: Direction) => void
}) {
  const t = useT()
  const direction = directionOf(criterion)
  return (
    <li className="grid grid-cols-1 items-center gap-x-4 gap-y-2 py-3 sm:grid-cols-[minmax(0,14rem)_8.5rem_minmax(0,1fr)]">
      <div className="truncate text-sm font-medium text-slate-800" title={criterion.name}>
        {criterion.name}
      </div>
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
        <span className="text-xs text-slate-400">—</span>
      )}
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={sliderMax}
          step={sliderMax / 1000}
          value={weight}
          aria-label={`${t('common.weight')} ${criterion.name}`}
          onChange={(e) => onWeight(Number(e.target.value))}
          className="accent-accent-600 min-w-0 flex-1"
        />
        <NumberInput
          value={weight}
          label={`${t('common.weight')} ${criterion.name}`}
          onCommit={(value) => value !== null && value >= 0 && onWeight(value)}
          className="w-20"
        />
        <div className="w-14 text-right text-xs text-slate-500 tabular-nums">{formatPercent(share)}</div>
      </div>
    </li>
  )
}

const weightedSumOnly = (project: Project): Project => ({
  ...project,
  analysis: { ...project.analysis, methods: [{ method: 'weighted_sum' }] },
})

function LiveRanking({ project }: { project: Project | null }) {
  const t = useT()
  const importedWeights = useStore((s) => s.importedWeights)

  const current = useApiPost<ProjectEvaluation>('/projects/evaluate', project && weightedSumOnly(project), 150)
  const baselineProject = useMemo(
    () => (project && importedWeights ? weightedSumOnly(setWeights(project, importedWeights)) : null),
    [project, importedWeights],
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
