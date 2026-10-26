import { ArrowRight, Crown, Info } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { MethodName, MethodResult, Project, ProjectEvaluation, TopsisMethod } from '../api/types'
import { EChart } from '../components/EChart'
import { ApiErrorBox, IssueList } from '../components/IssueList'
import { Badge, Button, Card, PageHeader, Segmented, Select, Spinner } from '../components/ui'
import { useApiPost, useCheckedProject } from '../hooks'
import type { MessageKey } from '../i18n/messages'
import { describeIssue } from '../i18n/describe'
import { useT } from '../i18n/useT'
import { breakdownChart, rankChart, scoreChart } from '../lib/charts'
import { displayScale, formatResultScore, methodLabel } from '../lib/methods'
import { METHOD_NAMES, useStore } from '../store'

type TopsisVariant = 'values_data' | 'values_fixed' | 'raw'

const topsisVariant = (spec: TopsisMethod): TopsisVariant =>
  spec.basis === 'raw' ? 'raw' : spec.ideal === 'fixed' ? 'values_fixed' : 'values_data'

const topsisSpec = (variant: TopsisVariant): TopsisMethod => ({
  method: 'topsis',
  basis: variant === 'raw' ? 'raw' : 'values',
  ideal: variant === 'values_fixed' ? 'fixed' : 'data',
})

export function ResultsPage() {
  const t = useT()
  const checked = useCheckedProject()!
  const setStep = useStore((s) => s.setStep)
  const language = useStore((s) => s.language)
  const { project, apiProject } = checked

  const evaluation = useApiPost<ProjectEvaluation>('/projects/evaluate', apiProject)
  const data = evaluation.data
  const results = data?.results ?? []
  const names = new Map(project.alternatives.map((a) => [a.id, a.name]))

  return (
    <div>
      <PageHeader title={t('results.title')} />
      {checked.issues.length > 0 && (
        <div className="mb-4">
          <IssueList issues={checked.issues} project={project} />
        </div>
      )}

      <MethodSettingsCard project={project} />

      {evaluation.error && (
        <div className="mt-4">
          <ApiErrorBox error={evaluation.error} project={project} />
        </div>
      )}

      {data && (data.excluded.length > 0 || data.imputed.length > 0) && (
        <div className="mt-4 space-y-1 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-600">
          {data.excluded.length > 0 && (
            <div>
              <p className="flex items-center gap-1.5 font-medium text-slate-700">
                <Info className="size-4 text-amber-500" />
                {t('results.excludedTitle')}
              </p>
              <ul className="mt-1 ml-6 space-y-0.5">
                {data.excluded.map((e) => (
                  <li key={e.alternative_id}>
                    <span className="font-medium">{names.get(e.alternative_id)}</span>:{' '}
                    {e.reasons.map((r) => describeIssue(language, r, project).text).join('; ')}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {data.imputed.length > 0 && (
            <p className="flex items-center gap-1.5">
              <Info className="size-4 text-slate-400" />
              {t('results.imputed', { n: data.imputed.length })}
            </p>
          )}
        </div>
      )}

      {data && results.length > 0 && (
        <>
          <RankingTable results={results} paretoFront={data.pareto.front} loading={evaluation.loading} />
          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <ScoresCard results={results} />
            {results.length > 1 && (
              <Card title={t('results.rankChart')}>
                <EChart
                  option={rankChart(
                    results,
                    results.map((r) => methodLabel(t, r.spec)),
                  )}
                  height={Math.max(260, results[0].alternatives.length * 34)}
                />
              </Card>
            )}
          </div>
          <BreakdownCard results={results} criteria={project.criteria} />
          <ParetoCard evaluation={data} names={names} />
        </>
      )}

      <div className="mt-6 flex justify-end">
        <Button variant="primary" onClick={() => setStep('sensitivity')}>
          {t('step.sensitivity')} <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  )
}

function MethodSettingsCard({ project }: { project: Project }) {
  const t = useT()
  const { methodMemory, toggleMethod, setMethod } = useStore()
  const active = project.analysis.methods

  return (
    <Card title={t('results.methods')}>
      <div className="grid gap-4 lg:grid-cols-3">
        {METHOD_NAMES.map((method) => {
          const spec = active.find((m) => m.method === method) ?? methodMemory[method]
          const enabled = active.some((m) => m.method === method)
          return (
            <div
              key={method}
              className={`rounded-lg border p-4 transition ${enabled ? 'border-accent-500/40 bg-accent-50/40' : 'border-slate-200 opacity-70'}`}
            >
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={enabled}
                  disabled={enabled && active.length === 1}
                  onChange={() => toggleMethod(method)}
                  className="accent-accent-600 mt-1"
                />
                <span>
                  <span className="block text-sm font-semibold text-slate-800">{t(`method.${method}`)}</span>
                  <span className="block text-xs text-slate-500">{t(`method.${method}.desc` as MessageKey)}</span>
                </span>
              </label>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {spec.method === 'topsis' && (
                  <Select<TopsisVariant>
                    label={t('results.variant')}
                    value={topsisVariant(spec)}
                    onChange={(variant) => setMethod(topsisSpec(variant))}
                    options={(['values_data', 'values_fixed', 'raw'] as const).map((v) => ({
                      value: v,
                      label: t(`topsis.${v}`),
                    }))}
                  />
                )}
                {spec.method === 'compromise_programming' && (
                  <>
                    <Segmented<string>
                      size="sm"
                      value={String(spec.p)}
                      onChange={(p) => setMethod({ ...spec, p: p === 'inf' ? 'inf' : Number(p) })}
                      options={[
                        { value: '1', label: 'p=1' },
                        { value: '2', label: 'p=2' },
                        { value: 'inf', label: 'p=∞' },
                      ]}
                    />
                    <Select<'data' | 'fixed'>
                      label={t('results.ideal')}
                      value={spec.ideal ?? 'data'}
                      onChange={(ideal) => setMethod({ ...spec, ideal })}
                      options={[
                        { value: 'data', label: t('ideal.data') },
                        { value: 'fixed', label: t('ideal.fixed') },
                      ]}
                    />
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

function RankingTable({
  results,
  paretoFront,
  loading,
}: {
  results: MethodResult[]
  paretoFront: string[]
  loading: boolean
}) {
  const t = useT()
  const optimal = new Set(paretoFront)
  const byId = results[0].alternatives.reduce<Record<string, string>>((names, a) => ({ ...names, [a.id]: a.name }), {})

  return (
    <Card className="mt-6" title={t('results.ranking')} actions={loading && <Spinner label={t('common.loading')} />}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
              <th className="py-2 pr-4 font-medium">{t('common.alternative')}</th>
              {results.map((r) => (
                <th key={r.method} className="px-3 py-2 text-center font-medium">
                  <div className="text-slate-700">{methodLabel(t, r.spec)}</div>
                  <div className="font-normal">
                    {r.higher_is_better ? t('results.higherBetter') : t('results.lowerBetter')}
                  </div>
                </th>
              ))}
              <th className="py-2 pl-3 font-medium">{t('results.pareto')}</th>
            </tr>
          </thead>
          <tbody>
            {results[0].order.map((id) => (
              <tr key={id} className="border-b border-slate-100 last:border-0">
                <td className="py-2 pr-4 font-medium text-slate-800">{byId[id]}</td>
                {results.map((r) => {
                  const a = r.alternatives.find((x) => x.id === id)!
                  return (
                    <td key={r.method} className="px-3 py-2 text-center">
                      <span
                        className={`inline-flex min-w-8 items-center justify-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                          a.rank === 1
                            ? 'bg-accent-600 text-white'
                            : a.rank <= 3
                              ? 'bg-accent-100 text-accent-700'
                              : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {a.rank === 1 && <Crown className="size-3" />}
                        {a.rank}
                      </span>
                      <div className="mt-0.5 text-xs text-slate-500 tabular-nums">{formatResultScore(r, a.score)}</div>
                    </td>
                  )
                })}
                <td className="py-2 pl-3">
                  {optimal.has(id) && <Badge tone="green">{t('results.paretoOptimal')}</Badge>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function ScoresCard({ results }: { results: MethodResult[] }) {
  const t = useT()
  const [selected, setSelected] = useState(results[0].method)
  const result = results.find((r) => r.method === selected) ?? results[0]
  const option = useMemo(() => scoreChart(result, displayScale(result)), [result])
  return (
    <Card
      title={`${t('results.scores')} · ${result.higher_is_better ? t('results.higherBetter') : t('results.lowerBetter')}`}
      actions={
        results.length > 1 && (
          <Segmented<MethodName>
            size="sm"
            value={result.method as MethodName}
            onChange={setSelected}
            options={results.map((r) => ({
              value: r.method as MethodName,
              label: t(`method.${r.method as MethodName}`),
            }))}
          />
        )
      }
    >
      <EChart option={option} height={Math.max(220, result.alternatives.length * 34)} />
    </Card>
  )
}

function BreakdownCard({ results, criteria }: { results: MethodResult[]; criteria: { id: string; name: string }[] }) {
  const t = useT()
  const weighted = results.find((r) => r.method === 'weighted_sum')
  const option = useMemo(() => (weighted ? breakdownChart(weighted, criteria) : null), [weighted, criteria])
  if (!weighted || !option) return null
  return (
    <Card
      className="mt-6"
      title={t('results.breakdown')}
      actions={<span className="text-xs text-slate-500">{t('results.breakdownHint')}</span>}
    >
      <EChart option={option} height={Math.max(280, weighted.alternatives.length * 40 + 60)} />
    </Card>
  )
}

function ParetoCard({ evaluation, names }: { evaluation: ProjectEvaluation; names: Map<string, string> }) {
  const t = useT()
  return (
    <Card className="mt-6" title={t('results.pareto')}>
      <p className="mb-3 text-xs text-slate-500">{t('results.paretoHint')}</p>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {evaluation.pareto.alternatives.map((a) => (
          <li
            key={a.id}
            className="flex items-start justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            <span className="font-medium text-slate-800">{names.get(a.id)}</span>
            {a.is_pareto_optimal ? (
              <Badge tone="green">{t('results.paretoOptimal')}</Badge>
            ) : (
              <span className="text-right text-xs text-slate-500">
                {t('results.dominatedBy', { names: a.dominated_by.map((id) => names.get(id)).join(', ') })}
              </span>
            )}
          </li>
        ))}
      </ul>
    </Card>
  )
}
