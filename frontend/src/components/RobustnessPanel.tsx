// Monte Carlo robustness of the weighted-sum ranking (S5).
import { useMemo } from 'react'
import type { Project, ProjectRobustness, RobustnessSettings } from '../api/types'
import { useApiPost } from '../hooks'
import type { MessageKey } from '../i18n/messages'
import { useT } from '../i18n/useT'
import { rankDistributionChart, winsChart } from '../lib/charts'
import { formatPercent } from '../lib/format'
import { EChart } from './EChart'
import { ApiErrorBox } from './IssueList'
import { NumberInput } from './NumberInput'
import { Badge, Card, Segmented, Select, Spinner } from './ui'

/** Alternatives shown in the pairwise heatmap. */
const WINS_LIMIT = 12
const SAMPLES = [1000, 5000, 20000]

const DEFAULTS: RobustnessSettings = { mode: 'around', spread: 0.2, samples: 5000, seed: 1 }

export function RobustnessPanel({
  project,
  apiProject,
  update,
}: {
  project: Project
  apiProject: Project | null
  update: (change: (project: Project) => Project) => void
}) {
  const t = useT()
  const settings = { ...DEFAULTS, ...project.analysis.robustness }
  const set = (patch: Partial<RobustnessSettings>) =>
    update((p) => ({ ...p, analysis: { ...p.analysis, robustness: { ...settings, ...patch } } }))

  const result = useApiPost<ProjectRobustness>('/projects/robustness', apiProject, 300)
  const data = result.data
  const distribution = useMemo(
    () =>
      data &&
      rankDistributionChart(data, {
        rank: (r) => t('robust.rank', { r }),
        rest: (r) => t('robust.rest', { r }),
      }),
    [data, t],
  )
  const wins = useMemo(() => data && winsChart(data, WINS_LIMIT, t('robust.beats')), [data, t])
  const winner = data?.alternatives.find((a) => a.id === data.confidence.id)
  const tone = { high: 'green', medium: 'amber', low: 'amber' } as const

  return (
    <Card title={t('robust.title')} actions={result.loading && <Spinner />}>
      <p className="mb-4 text-sm text-slate-500">{t('robust.intro')}</p>
      <div className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-slate-600">
        <span className="inline-flex items-center gap-2">
          {t('robust.mode')}
          <Segmented<RobustnessSettings['mode'] & string>
            value={settings.mode ?? 'around'}
            onChange={(mode) => set({ mode })}
            options={[
              { value: 'around', label: t('robust.around'), title: t('robust.aroundHint') },
              { value: 'unknown', label: t('robust.unknown'), title: t('robust.unknownHint') },
            ]}
          />
        </span>
        {settings.mode !== 'unknown' && (
          <label className="inline-flex items-center gap-2">
            {t('robust.spread')}
            <input
              type="range"
              min={0.05}
              max={1}
              step={0.05}
              value={settings.spread}
              aria-label={t('robust.spread')}
              onChange={(e) => set({ spread: Number(e.target.value) })}
              className="accent-accent-600 w-32"
            />
            <span className="w-10 text-xs tabular-nums">±{formatPercent(settings.spread ?? 0.2, 0)}</span>
          </label>
        )}
        <Select
          label={t('robust.samples')}
          value={String(settings.samples)}
          onChange={(samples) => set({ samples: Number(samples) })}
          // A project may carry another sample count; keep it selectable.
          options={[...new Set([...SAMPLES, settings.samples ?? 5000])]
            .sort((a, b) => a - b)
            .map((s) => ({ value: String(s), label: s.toLocaleString() }))}
        />
        <label className="inline-flex items-center gap-2">
          {t('robust.seed')}
          <NumberInput
            value={settings.seed ?? 1}
            label={t('robust.seed')}
            className="w-20"
            onCommit={(seed) => seed !== null && Number.isInteger(seed) && set({ seed })}
          />
        </label>
      </div>

      {result.error && <ApiErrorBox error={result.error} project={project} />}

      {data && winner && (
        <>
          <div className="mb-5 flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 px-4 py-3 text-sm">
            <span className="text-slate-500">{t('robust.confidence')}</span>
            <Badge tone={tone[data.confidence.level]}>{t(`robust.level.${data.confidence.level}` as MessageKey)}</Badge>
            <span className="text-slate-700">
              {t('robust.summary', { name: winner.name, p: formatPercent(data.confidence.p_best) })}
            </span>
            <span className="text-xs text-slate-400">{t('robust.levelHint')}</span>
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
            <section>
              <h3 className="mb-2 text-xs font-semibold text-slate-600">{t('robust.distribution')}</h3>
              <EChart option={distribution!} height={Math.max(180, data.alternatives.length * 28 + 60)} />
            </section>
            <section>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500">
                    <th className="pb-2 font-medium" />
                    <th className="pb-2 text-right font-medium">{t('robust.pBest')}</th>
                    <th className="pb-2 text-right font-medium">{t('robust.meanRank')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.alternatives.map((a) => (
                    <tr key={a.id}>
                      <td className="max-w-40 truncate py-1.5 text-slate-800" title={a.name}>
                        {a.name}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">{formatPercent(a.p_best)}</td>
                      <td className="py-1.5 text-right text-slate-500 tabular-nums">{a.mean_rank.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>

          <section className="mt-6">
            <h3 className="text-xs font-semibold text-slate-600">{t('robust.wins')}</h3>
            <p className="mb-2 text-xs text-slate-500">
              {t('robust.winsHint')}
              {data.alternatives.length > WINS_LIMIT && ` ${t('robust.winsLimited', { n: WINS_LIMIT })}`}
            </p>
            <EChart option={wins!} height={Math.min(data.alternatives.length, WINS_LIMIT) * 34 + 90} />
          </section>
        </>
      )}
    </Card>
  )
}
