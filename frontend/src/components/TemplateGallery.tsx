// Start a project from a built-in template (S7): with its example data or only its settings.
import { LayoutTemplate } from 'lucide-react'
import { useState } from 'react'
import { type ApiError, asApiError, getJson } from '../api/client'
import type { Project, TemplateInfo } from '../api/types'
import { useTemplates } from '../hooks'
import { useT } from '../i18n/useT'
import { useStore } from '../store'
import { ApiErrorBox } from './IssueList'
import { Badge, Button, Card, Select, Spinner } from './ui'

export function TemplateGallery({ onProject }: { onProject: (project: Project) => void }) {
  const t = useT()
  const { templates, error: listError } = useTemplates()
  const [error, setError] = useState<ApiError | null>(null)

  if (!templates.length && !listError) return null
  return (
    <Card
      className="mt-6"
      title={
        <span className="inline-flex items-center gap-2">
          <LayoutTemplate className="text-accent-600 size-4" />
          {t('tpl.title')}
        </span>
      }
    >
      <p className="mb-4 text-sm text-slate-600">{t('tpl.intro')}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {templates.map((template) => (
          <TemplateCard key={template.id} template={template} onProject={onProject} onError={setError} />
        ))}
      </div>
      {(error ?? listError) && (
        <div className="mt-4">
          <ApiErrorBox error={(error ?? listError)!} />
        </div>
      )}
    </Card>
  )
}

function TemplateCard({
  template,
  onProject,
  onError,
}: {
  template: TemplateInfo
  onProject: (project: Project) => void
  onError: (error: ApiError | null) => void
}) {
  const t = useT()
  const language = useStore((s) => s.language)
  const [preset, setPreset] = useState(template.default_preset ?? '')
  const [busy, setBusy] = useState(false)

  const start = async (example: boolean) => {
    setBusy(true)
    onError(null)
    try {
      const query = new URLSearchParams({ language, example: String(example) })
      if (preset) query.set('preset', preset)
      onProject(await getJson<Project>(`/templates/${template.id}/project?${query}`))
    } catch (err) {
      onError(asApiError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="flex flex-col rounded-lg border border-slate-200 p-4" aria-label={template.name[language]}>
      <div className="mb-1 flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800">{template.name[language]}</h3>
        <Badge>{t('tpl.criteria', { n: template.criteria.length })}</Badge>
      </div>
      <p className="mb-3 flex-1 text-xs leading-relaxed text-slate-500">{template.description[language]}</p>
      {template.presets.length > 0 && (
        <div className="mb-3">
          <Select<string>
            label={t('tpl.preset')}
            value={preset}
            onChange={setPreset}
            options={template.presets.map((p) => ({ value: p.id, label: p.name[language] }))}
          />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {template.has_example && (
          <Button variant="primary" disabled={busy} onClick={() => start(true)}>
            {t('tpl.example')}
          </Button>
        )}
        <Button disabled={busy} onClick={() => start(false)}>
          {t('tpl.blank')}
        </Button>
        {busy && <Spinner />}
      </div>
    </section>
  )
}
