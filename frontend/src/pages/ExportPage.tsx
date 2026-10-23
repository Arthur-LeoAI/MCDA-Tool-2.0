import { FileDown, FileSpreadsheet } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ApiError, downloadFile } from '../api/client'
import { ApiErrorBox, IssueList } from '../components/IssueList'
import { Button, Card, PageHeader, Spinner } from '../components/ui'
import { useCheckedDraft } from '../hooks'
import { useT } from '../i18n/useT'
import { selectEnabledSpecs, useStore } from '../store'

export function ExportPage() {
  const t = useT()
  const checked = useCheckedDraft()!
  const settings = useStore((s) => s.settings)
  const enabledMethods = useStore((s) => s.enabledMethods)
  const specs = useMemo(() => selectEnabledSpecs({ settings, enabledMethods }), [settings, enabledMethods])
  const [includeStability, setIncludeStability] = useState(true)
  const [includePareto, setIncludePareto] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const problem = checked.problem

  const run = async (id: string, action: () => Promise<void>) => {
    setBusy(id)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, String(err)))
    } finally {
      setBusy(null)
    }
  }

  const ws = settings.weighted_sum
  const downloadReport = () =>
    run('report', () =>
      downloadFile('/api/export/report', {
        problem,
        methods: specs,
        stability: includeStability ? { normalization: ws.normalization, bounds: ws.bounds } : null,
        include_pareto: includePareto,
      }),
    )

  return (
    <div className="max-w-3xl">
      <PageHeader title={t('export.title')} />
      {checked.issues.length > 0 && (
        <div className="mb-4">
          <IssueList issues={checked.issues} />
        </div>
      )}
      {error && (
        <div className="mb-4">
          <ApiErrorBox error={error} draft={checked.draft} />
        </div>
      )}

      <Card
        title={
          <span className="inline-flex items-center gap-2">
            <FileSpreadsheet className="text-accent-600 size-4" />
            {t('export.report')}
          </span>
        }
      >
        <p className="text-sm text-slate-600">{t('export.reportDesc')}</p>
        <p className="mt-2 text-xs text-slate-500">
          {t('export.methodsUsed', { methods: specs.map((s) => t(`method.${s.method}`)).join(', ') || '—' })}
        </p>
        <div className="mt-4 space-y-2 text-sm text-slate-700">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={includeStability}
              onChange={(e) => setIncludeStability(e.target.checked)}
              className="accent-accent-600"
            />
            {t('export.includeStability')}
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={includePareto}
              onChange={(e) => setIncludePareto(e.target.checked)}
              className="accent-accent-600"
            />
            {t('export.includePareto')}
          </label>
        </div>
        <div className="mt-5 flex items-center gap-3">
          <Button
            variant="primary"
            icon={<FileDown className="size-4" />}
            disabled={!problem || !specs.length || busy !== null}
            onClick={downloadReport}
          >
            {t('export.download')}
          </Button>
          {busy === 'report' && <Spinner />}
        </div>
      </Card>

      <Card className="mt-6" title={t('export.problem')}>
        <p className="text-sm text-slate-600">{t('export.problemDesc')}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {(['xlsx', 'csv'] as const).map((format) => (
            <Button
              key={format}
              icon={<FileDown className="size-4" />}
              disabled={!problem || busy !== null}
              onClick={() => run(format, () => downloadFile(`/api/export/problem?format=${format}`, problem))}
            >
              .{format}
            </Button>
          ))}
          {(busy === 'xlsx' || busy === 'csv') && <Spinner />}
        </div>
      </Card>
    </div>
  )
}
