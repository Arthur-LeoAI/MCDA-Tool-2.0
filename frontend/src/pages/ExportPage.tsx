import { FileDown, FileJson, FileSpreadsheet } from 'lucide-react'
import { useState } from 'react'
import { ApiError, asApiError, downloadFile } from '../api/client'
import { ApiErrorBox, IssueList } from '../components/IssueList'
import { Button, Card, PageHeader, Spinner } from '../components/ui'
import { useCheckedProject, useConclusion } from '../hooks'
import { useT } from '../i18n/useT'
import { methodLabel } from '../lib/methods'
import { projectFilename, saveProjectFile } from '../lib/projectFile'

export function ExportPage() {
  const t = useT()
  const checked = useCheckedProject()!
  const { project, apiProject } = checked
  const [includeStability, setIncludeStability] = useState(true)
  const [includePareto, setIncludePareto] = useState(true)
  const [includeRobustness, setIncludeRobustness] = useState(true)
  // The report carries the conclusion exactly as the interface writes it (ADR 0007).
  const conclusion = useConclusion(project, apiProject)
  const preparing = conclusion.evaluation.loading || conclusion.robustness.loading
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)

  const downloadReport = async () => {
    setBusy(true)
    setError(null)
    try {
      await downloadFile('/projects/report', {
        project: apiProject,
        include_stability: includeStability,
        include_pareto: includePareto,
        include_robustness: includeRobustness,
        conclusion: conclusion.paragraphs.map((p) => p.text),
      })
    } catch (err) {
      setError(asApiError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-3xl">
      <PageHeader title={t('export.title')} />
      {checked.issues.length > 0 && (
        <div className="mb-4">
          <IssueList issues={checked.issues} project={project} />
        </div>
      )}
      {error && (
        <div className="mb-4">
          <ApiErrorBox error={error} project={project} />
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
          {t('export.methodsUsed', { methods: project.analysis.methods.map((m) => methodLabel(t, m)).join(', ') })}
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
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={includeRobustness}
              onChange={(e) => setIncludeRobustness(e.target.checked)}
              className="accent-accent-600"
            />
            {t('export.includeRobustness')}
          </label>
        </div>
        <div className="mt-5 flex items-center gap-3">
          <Button
            variant="primary"
            icon={<FileDown className="size-4" />}
            disabled={!apiProject || busy || preparing}
            onClick={downloadReport}
          >
            {t('export.download')}
          </Button>
          {(busy || preparing) && <Spinner />}
        </div>
      </Card>

      <Card
        className="mt-6"
        title={
          <span className="inline-flex items-center gap-2">
            <FileJson className="text-accent-600 size-4" />
            {t('export.projectFile')}
          </span>
        }
      >
        <p className="text-sm text-slate-600">{t('export.projectFileDesc')}</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button icon={<FileDown className="size-4" />} onClick={() => saveProjectFile(project)}>
            {t('project.save')}
          </Button>
          <code className="text-xs text-slate-500">{projectFilename(project)}</code>
        </div>
      </Card>
    </div>
  )
}
