import { ArrowRight, CircleCheck, FileDown, History, Sparkles, Trash2, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { ApiError, asApiError, downloadFile, getBlob, uploadFile } from '../api/client'
import type { ImportResponse, Problem } from '../api/types'
import { DataGrid } from '../components/DataGrid'
import { FileDrop } from '../components/FileDrop'
import { ApiErrorBox, IssueList } from '../components/IssueList'
import { Badge, Button, Card, PageHeader, Spinner } from '../components/ui'
import { useApiPost, useCheckedDraft } from '../hooks'
import { useT } from '../i18n/useT'
import { useStore } from '../store'

export function DataPage() {
  const t = useT()
  const { source, loadImport, updateDraft, clear, setStep } = useStore()
  const checked = useCheckedDraft()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  const replaceInput = useRef<HTMLInputElement>(null)
  // Rules only the server checks (duplicate names, weights, ...).
  const validation = useApiPost<Problem>('/problems/validate', checked?.problem ?? null, 400)

  const importBlob = async (blob: Blob, filename: string) => {
    setBusy(true)
    setError(null)
    try {
      loadImport(await uploadFile<ImportResponse>('/problems/import', blob, filename))
    } catch (err) {
      setError(asApiError(err))
    } finally {
      setBusy(false)
    }
  }

  const loadExample = async () => {
    try {
      await importBlob(await getBlob('/template?format=csv'), 'example.csv')
    } catch (err) {
      setError(asApiError(err))
    }
  }

  const download = (format: 'xlsx' | 'csv') =>
    downloadFile(`/template?format=${format}`).catch((err) => setError(asApiError(err)))

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
          <FileDrop onFile={(file) => importBlob(file, file.name)} busy={busy} />
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <Button variant="primary" icon={<Sparkles className="size-4" />} onClick={loadExample} disabled={busy}>
              {t('data.example')}
            </Button>
            <div className="flex flex-wrap gap-1">{templateButtons}</div>
          </div>
          {error && (
            <div className="mt-4">
              <ApiErrorBox error={error} />
            </div>
          )}
        </Card>
      </div>
    )
  }

  const { draft, problem, issues } = checked

  return (
    <div>
      <PageHeader
        title={t('data.title')}
        actions={
          <>
            <Button icon={<Upload className="size-4" />} onClick={() => replaceInput.current?.click()} disabled={busy}>
              {t('data.replace')}
            </Button>
            <Button
              variant="danger"
              icon={<Trash2 className="size-4" />}
              onClick={() => window.confirm(t('data.clearConfirm')) && clear()}
            >
              {t('data.clear')}
            </Button>
            <input
              ref={replaceInput}
              type="file"
              accept=".xlsx,.xlsm,.csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) importBlob(file, file.name)
                e.target.value = ''
              }}
            />
          </>
        }
      />

      {error && (
        <div className="mb-4">
          <ApiErrorBox error={error} />
        </div>
      )}

      {source?.legacy && (
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
            {source?.filename}
            <Badge>{t('data.summary', { alts: draft.alternatives.length, crits: draft.criteria.length })}</Badge>
          </span>
        }
        actions={
          validation.loading ? (
            <Spinner />
          ) : (
            problem &&
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
        <DataGrid draft={draft} update={updateDraft} />
        {issues.length > 0 && (
          <div className="mt-4">
            <IssueList issues={issues} />
          </div>
        )}
        {validation.error && (
          <div className="mt-4">
            <ApiErrorBox error={validation.error} draft={draft} />
          </div>
        )}
      </Card>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">{templateButtons}</div>
        <Button variant="primary" onClick={() => setStep('weights')} disabled={!problem || validation.error !== null}>
          {t('step.weights')} <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  )
}
