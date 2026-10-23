import { ArrowRight, CircleCheck, FileDown, FolderOpen, History, Info, Sparkles, Trash2, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { ApiError, asApiError, downloadFile, getBlob, uploadFile } from '../api/client'
import type { ProjectImport } from '../api/types'
import { DataGrid } from '../components/DataGrid'
import { FileDrop } from '../components/FileDrop'
import { ApiErrorBox, IssueList } from '../components/IssueList'
import { Badge, Button, Card, PageHeader, Spinner } from '../components/ui'
import { useApiPost, useCheckedProject } from '../hooks'
import { useT } from '../i18n/useT'
import { missingCount } from '../lib/project'
import { isProjectFile, openProjectFile } from '../lib/projectFile'
import { useStore } from '../store'

const ACCEPT = '.xlsx,.xlsm,.csv,.json'

export function DataPage() {
  const t = useT()
  const { loadProject, updateProject, clear, setStep } = useStore()
  const checked = useCheckedProject()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  // Rules only the server checks (references, types, values, ...).
  const validation = useApiPost<{ valid: true }>('/projects/validate', checked?.apiProject ?? null, 400)

  /** Spreadsheets are imported; .json files are opened as projects. */
  const openFile = async (file: Blob, filename: string) => {
    setBusy(true)
    setError(null)
    try {
      if (isProjectFile(filename)) {
        loadProject(await openProjectFile(file))
      } else {
        loadProject((await uploadFile<ProjectImport>('/projects/import', file, filename)).project)
      }
    } catch (err) {
      setError(asApiError(err))
    } finally {
      setBusy(false)
    }
  }

  const loadExample = async () => {
    try {
      await openFile(await getBlob('/template?format=csv'), 'example.csv')
    } catch (err) {
      setError(asApiError(err))
    }
  }

  const download = (format: 'xlsx' | 'csv') =>
    downloadFile(`/template?format=${format}`).catch((err) => setError(asApiError(err)))

  const hiddenInput = (
    <input
      ref={fileInput}
      type="file"
      accept={ACCEPT}
      className="hidden"
      onChange={(e) => {
        const file = e.target.files?.[0]
        if (file) openFile(file, file.name)
        e.target.value = ''
      }}
    />
  )

  const templateButtons = (
    <>
      <Button variant="ghost" icon={<FileDown className="size-4" />} onClick={() => download('xlsx')}>
        {t('data.templateXlsx')}
      </Button>
      <Button variant="ghost" icon={<FileDown className="size-4" />} onClick={() => download('csv')}>
        {t('data.templateCsv')}
      </Button>
    </>
  )

  if (!checked) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title={t('data.title')} intro={t('data.intro')} />
        <Card>
          <FileDrop onFile={(file) => openFile(file, file.name)} busy={busy} accept={ACCEPT} />
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" icon={<Sparkles className="size-4" />} onClick={loadExample} disabled={busy}>
                {t('data.example')}
              </Button>
              <Button
                icon={<FolderOpen className="size-4" />}
                onClick={() => fileInput.current?.click()}
                disabled={busy}
              >
                {t('project.open')}
              </Button>
            </div>
            <div className="flex flex-wrap gap-1">{templateButtons}</div>
          </div>
          {hiddenInput}
          {error && (
            <div className="mt-4">
              <ApiErrorBox error={error} />
            </div>
          )}
        </Card>
      </div>
    )
  }

  const { project, issues, apiProject } = checked
  const missing = missingCount(project)
  const source = project.source

  return (
    <div>
      <PageHeader
        title={t('data.title')}
        actions={
          <>
            <Button icon={<Upload className="size-4" />} onClick={() => fileInput.current?.click()} disabled={busy}>
              {t('data.replace')}
            </Button>
            <Button
              variant="danger"
              icon={<Trash2 className="size-4" />}
              onClick={() => window.confirm(t('data.clearConfirm')) && clear()}
            >
              {t('data.clear')}
            </Button>
            {hiddenInput}
          </>
        }
      />

      {error && (
        <div className="mb-4">
          <ApiErrorBox error={error} />
        </div>
      )}

      {source?.kind === 'legacy' && (
        <div className="border-accent-100 bg-accent-50 text-accent-700 mb-4 flex gap-3 rounded-lg border p-4 text-sm">
          <History className="mt-0.5 size-5 shrink-0" />
          <div>
            <div className="font-semibold">{t('data.legacyTitle')}</div>
            <p className="mt-0.5">{t('data.legacyText')}</p>
          </div>
        </div>
      )}

      <Card
        title={
          <span className="flex flex-wrap items-center gap-2">
            {project.meta.name || source?.filename}
            <Badge>{t('data.summary', { alts: project.alternatives.length, crits: project.criteria.length })}</Badge>
          </span>
        }
        actions={
          validation.loading ? (
            <Spinner />
          ) : (
            apiProject &&
            validation.data && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                <CircleCheck className="size-4" />
                {t('data.valid')}
              </span>
            )
          )
        }
      >
        <p className="mb-3 text-xs text-slate-500">{t('data.tableHint')}</p>
        <DataGrid project={project} update={updateProject} />
        {missing > 0 && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-600">
            <Info className="size-4 text-slate-400" />
            {t('data.missingInfo', { n: missing })}
          </p>
        )}
        {issues.length > 0 && (
          <div className="mt-4">
            <IssueList issues={issues} project={project} />
          </div>
        )}
        {validation.error && (
          <div className="mt-4">
            <ApiErrorBox error={validation.error} project={project} />
          </div>
        )}
      </Card>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">{templateButtons}</div>
        <Button
          variant="primary"
          onClick={() => setStep('weights')}
          disabled={!apiProject || validation.error !== null}
        >
          {t('step.weights')} <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  )
}
