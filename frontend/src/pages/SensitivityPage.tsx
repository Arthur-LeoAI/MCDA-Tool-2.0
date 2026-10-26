import { ArrowRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { ProjectStability, StabilityScope } from '../api/types'
import { EChart } from '../components/EChart'
import { ApiErrorBox, IssueList } from '../components/IssueList'
import { Button, Card, PageHeader, Segmented, Spinner } from '../components/ui'
import { useApiPost, useCheckedProject } from '../hooks'
import { useT } from '../i18n/useT'
import { type IntervalRow, intervalRows, stabilityChart } from '../lib/charts'
import { formatPercent, formatScore } from '../lib/format'
import { useStore } from '../store'

export function SensitivityPage() {
  const t = useT()
  const checked = useCheckedProject()!
  const { setStabilityScope, setStep } = useStore()
  const [includeZero, setIncludeZero] = useState(false)
  const { project, apiProject } = checked
  const stabilityScope = project.analysis.stability_scope ?? 'full_order'

  const stability = useApiPost<ProjectStability>(
    '/projects/stability',
    apiProject && { project: apiProject, scope: stabilityScope },
  )
  const rows = useMemo(() => intervalRows(stability.data?.intervals ?? [], includeZero), [stability.data, includeZero])
  const option = useMemo(
    () => stabilityChart(rows, { current: t('sens.current'), unbounded: t('common.unbounded') }),
    [rows, t],
  )

  return (
    <div>
      <PageHeader title={t('sens.title')} intro={t('sens.intro')} />
      {checked.issues.length > 0 && (
        <div className="mb-4">
          <IssueList issues={checked.issues} project={project} />
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-4 text-sm text-slate-600">
        <span className="inline-flex items-center gap-2">
          {t('sens.scope')}
          <Segmented<StabilityScope>
            value={stabilityScope}
            onChange={setStabilityScope}
            options={[
              { value: 'full_order', label: t('sens.full_order') },
              { value: 'top1', label: t('sens.top1') },
            ]}
          />
        </span>
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={includeZero}
            onChange={(e) => setIncludeZero(e.target.checked)}
            className="accent-accent-600"
          />
          {t('sens.showZero')}
        </label>
        <span className="text-xs text-slate-500">{t('sens.basedOn')}</span>
        {stability.loading && <Spinner />}
      </div>

      {stability.error && (
        <div className="mb-4">
          <ApiErrorBox error={stability.error} project={project} />
        </div>
      )}

      {rows.length > 0 && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <Card title={t('sens.chart')} actions={<Legend />}>
            <EChart option={option} height={Math.max(220, rows.length * 26 + 40)} />
          </Card>
          <Card title={t('sens.mostSensitive')} className="xl:self-start">
            <IntervalList rows={rows.slice(0, 8)} />
          </Card>
        </div>
      )}

      <div className="mt-6 flex justify-end">
        <Button variant="primary" onClick={() => setStep('export')}>
          {t('step.export')} <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  )
}

function Legend() {
  const t = useT()
  const item = (swatch: string, label: string) => (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
      <span className={swatch} />
      {label}
    </span>
  )
  return (
    <div className="flex flex-wrap gap-3">
      {item('h-2.5 w-4 rounded-sm bg-indigo-500', `${t('sens.lower')} – ${t('sens.upper')}`)}
      {item('h-2.5 w-4 rounded-sm bg-indigo-300', t('common.unbounded'))}
      {item('size-2.5 rounded-full bg-slate-900', t('sens.current'))}
    </div>
  )
}

function IntervalList({ rows }: { rows: IntervalRow[] }) {
  const t = useT()
  return (
    <ol className="space-y-3 text-sm">
      {rows.map((row) => (
        <li key={row.criterion}>
          <div className="flex justify-between gap-2">
            <span className="truncate font-medium text-slate-800" title={row.criterion}>
              {row.criterion}
            </span>
            <span className="shrink-0 text-xs text-slate-500 tabular-nums">
              {t('sens.current')} {formatPercent(row.share)}
            </span>
          </div>
          <div className="text-xs text-slate-500 tabular-nums">
            {row.collapsed ? (
              <span className="text-red-600">{t('sens.collapsed')}</span>
            ) : (
              <>
                {formatPercent(row.lower_share)} –{' '}
                {row.upper === null ? t('common.unbounded') : formatPercent(row.upper_share)}
                <span className="ml-2 text-slate-400">
                  ({t('common.weight')} {formatScore(row.lower)} – {row.upper === null ? '∞' : formatScore(row.upper)})
                </span>
              </>
            )}
          </div>
        </li>
      ))}
    </ol>
  )
}
