import { ArrowRight, Crown } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { EvaluateResponse, MethodName, MethodResult, Normalization, ParetoResponse } from '../api/types'
import { EChart } from '../components/EChart'
import { ApiErrorBox, IssueList } from '../components/IssueList'
import { NumberInput } from '../components/NumberInput'
import { Badge, Button, Card, PageHeader, Segmented, Select, Spinner } from '../components/ui'
import { useApiPost, useCheckedDraft } from '../hooks'
import type { MessageKey } from '../i18n/messages'
import { useT } from '../i18n/useT'
import { breakdownChart, rankChart, scoreChart } from '../lib/charts'
import { formatScore } from '../lib/format'
import { METHOD_NAMES, type MethodSettings, selectEnabledSpecs, useStore } from '../store'

const NORMALIZATIONS: Record<MethodName, Normalization[]> = {
  weighted_sum: ['min_max', 'fixed_range', 'none'],
  topsis: ['vector', 'min_max', 'fixed_range', 'none'],
  compromise_programming: ['min_max', 'fixed_range'],
}

export function ResultsPage() {
  const t = useT()
  const checked = useCheckedDraft()!
  const settings = useStore((s) => s.settings)
  const enabledMethods = useStore((s) => s.enabledMethods)
  const specs = useMemo(() => selectEnabledSpecs({ settings, enabledMethods }), [settings, enabledMethods])
  const setStep = useStore((s) => s.setStep)
  const problem = checked.problem

  const evaluation = useApiPost<EvaluateResponse>(
    '/api/evaluate',
    problem && specs.length ? { problem, methods: specs } : null,
  )
  const pareto = useApiPost<ParetoResponse>('/api/pareto', problem && { problem })
  const results = evaluation.data?.results ?? []

  return (
    <div>
      <PageHeader title={t('results.title')} />
      {checked.issues.length > 0 && (
        <div className="mb-4">
          <IssueList issues={checked.issues} />
        </div>
      )}

      <MethodSettingsCard />

      {evaluation.error && (
        <div className="mt-4">
          <ApiErrorBox error={evaluation.error} draft={checked.draft} />
        </div>
      )}
      {!specs.length && <p className="mt-4 text-sm text-slate-500">{t('results.noMethod')}</p>}

      {results.length > 0 && (
        <>
          <RankingTable results={results} pareto={pareto.data} loading={evaluation.loading} />
          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <ScoresCard results={results} />
            {results.length > 1 && (
              <Card title={t('results.rankChart')}>
                <EChart option={rankChart(results)} height={Math.max(260, results[0].alternatives.length * 34)} />
              </Card>
            )}
          </div>
          <BreakdownCard results={results} criteria={checked.draft.criteria.map((c) => c.name)} />
        </>
      )}

      {pareto.data && <ParetoCard pareto={pareto.data} />}

      <div className="mt-6 flex justify-end">
        <Button variant="primary" onClick={() => setStep('sensitivity')}>
          {t('step.sensitivity')} <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  )
}

function MethodSettingsCard() {
  const t = useT()
  const { settings, enabledMethods, toggleMethod, setMethodSettings } = useStore()

  return (
    <Card title={t('results.methods')}>
      <div className="grid gap-4 lg:grid-cols-3">
        {METHOD_NAMES.map((method) => {
          const spec = settings[method]
          const enabled = enabledMethods.includes(method)
          const set = (patch: Partial<MethodSettings[typeof method]>) => setMethodSettings(method, patch)
          return (
            <div
              key={method}
              className={`rounded-lg border p-4 transition ${enabled ? 'border-accent-500/40 bg-accent-50/40' : 'border-slate-200 opacity-70'}`}
            >
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={() => toggleMethod(method)}
                  className="accent-accent-600 mt-1"
                />
                <span>
                  <span className="block text-sm font-semibold text-slate-800">{t(`method.${method}`)}</span>
                  <span className="block text-xs text-slate-500">{t(`method.${method}.desc` as MessageKey)}</span>
                </span>
              </label>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Select<Normalization>
                  label={t('results.normalization')}
                  value={spec.normalization}
                  onChange={(normalization) => set({ normalization } as never)}
                  options={NORMALIZATIONS[method].map((n) => ({ value: n, label: t(`norm.${n}`) }))}
                />
                {spec.method === 'compromise_programming' && (
                  <Segmented<string>
                    size="sm"
                    value={String(spec.p)}
                    onChange={(p) =>
                      setMethodSettings('compromise_programming', { p: p === 'inf' ? 'inf' : Number(p) })
                    }
                    options={[
                      { value: '1', label: 'p=1' },
                      { value: '2', label: 'p=2' },
                      { value: 'inf', label: 'p=∞' },
                    ]}
                  />
                )}
              </div>
              {spec.normalization === 'fixed_range' && (
                <BoundsInput bounds={spec.bounds} onChange={(bounds) => set({ bounds } as never)} />
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}

function BoundsInput({
  bounds,
  onChange,
}: {
  bounds: MethodSettings['weighted_sum']['bounds']
  onChange: (b: [number, number]) => void
}) {
  const t = useT()
  const [low, high] = (Array.isArray(bounds[0]) ? [0, 100] : bounds) as [number, number]
  return (
    <div className="mt-3 flex items-center gap-2 text-sm text-slate-600">
      {t('results.bounds')}
      <NumberInput value={low} label="min" className="w-16" onCommit={(v) => v !== null && onChange([v, high])} />
      –
      <NumberInput value={high} label="max" className="w-16" onCommit={(v) => v !== null && onChange([low, v])} />
    </div>
  )
}

function RankingTable({
  results,
  pareto,
  loading,
}: {
  results: MethodResult[]
  pareto: ParetoResponse | null
  loading: boolean
}) {
  const t = useT()
  const order = results[0].order
  const optimal = new Set(pareto?.front)

  return (
    <Card className="mt-6" title={t('results.ranking')} actions={loading && <Spinner label={t('common.loading')} />}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
              <th className="py-2 pr-4 font-medium">{t('common.alternative')}</th>
              {results.map((r) => (
                <th key={r.label} className="px-3 py-2 text-center font-medium">
                  <div className="text-slate-700">{r.label}</div>
                  <div className="font-normal">
                    {r.higher_is_better ? t('results.higherBetter') : t('results.lowerBetter')}
                  </div>
                </th>
              ))}
              <th className="py-2 pl-3 font-medium">{t('results.pareto')}</th>
            </tr>
          </thead>
          <tbody>
            {order.map((name) => (
              <tr key={name} className="border-b border-slate-100 last:border-0">
                <td className="py-2 pr-4 font-medium text-slate-800">{name}</td>
                {results.map((r) => {
                  const a = r.alternatives.find((x) => x.name === name)!
                  return (
                    <td key={r.label} className="px-3 py-2 text-center">
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
                      <div className="mt-0.5 text-xs text-slate-500 tabular-nums">{formatScore(a.score)}</div>
                    </td>
                  )
                })}
                <td className="py-2 pl-3">
                  {optimal.has(name) && <Badge tone="green">{t('results.paretoOptimal')}</Badge>}
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
  const option = useMemo(() => scoreChart(result), [result])
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

function BreakdownCard({ results, criteria }: { results: MethodResult[]; criteria: string[] }) {
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

function ParetoCard({ pareto }: { pareto: ParetoResponse }) {
  const t = useT()
  return (
    <Card className="mt-6" title={t('results.pareto')}>
      <p className="mb-3 text-xs text-slate-500">{t('results.paretoHint')}</p>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {pareto.alternatives.map((a) => (
          <li
            key={a.alternative}
            className="flex items-start justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            <span className="font-medium text-slate-800">{a.alternative}</span>
            {a.is_pareto_optimal ? (
              <Badge tone="green">{t('results.paretoOptimal')}</Badge>
            ) : (
              <span className="text-right text-xs text-slate-500">
                {t('results.dominatedBy', { names: a.dominated_by.join(', ') })}
              </span>
            )}
          </li>
        ))}
      </ul>
    </Card>
  )
}
