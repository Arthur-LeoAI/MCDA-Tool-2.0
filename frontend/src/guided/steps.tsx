// The steps of the guided mode (S8). Each reuses the parts of the expert pages.
import { ChevronUp, FileDown, LayoutTemplate, Save, Settings2, Sparkles, SquarePen } from 'lucide-react'
import { useEffect, useState } from 'react'
import { type ApiError, asApiError, downloadFile, getJson, uploadFile } from '../api/client'
import type { Criterion, Direction, Project, TableInspection, TemplateInfo } from '../api/types'
import { ColumnMapper } from '../components/ColumnMapper'
import { ConclusionCard } from '../components/ConclusionCard'
import { CriterionSettings } from '../components/CriterionSettings'
import { FileDrop } from '../components/FileDrop'
import { ApiErrorBox, IssueList } from '../components/IssueList'
import { QualityPanel } from '../components/QualityPanel'
import { WeightLevels } from '../components/WeightLevels'
import { Badge, Button, Card, PageHeader, Segmented, Select, Spinner } from '../components/ui'
import { useApiPost, useCheckedProject, useConclusion, useTemplates } from '../hooks'
import { describeIssue } from '../i18n/describe'
import type { MessageKey } from '../i18n/messages'
import { useT } from '../i18n/useT'
import { directionOf, setDirection } from '../lib/project'
import { isProjectFile, openProjectFile, saveProjectFile } from '../lib/projectFile'
import { type GuidedStepId, useStore } from '../store'
import type { PendingTable } from './GuidedApp'

type Go = (step: GuidedStepId) => void

// --- 1 Scenario -------------------------------------------------------------------------------

export function ScenarioStep({ go, alt }: { go: Go; alt: string }) {
  const t = useT()
  const { project, guidedTemplate, setGuidedTemplate, loadProject, language } = useStore()
  const { templates, error } = useTemplates()
  const [busy, setBusy] = useState<string | null>(null)
  const [failed, setFailed] = useState<ApiError | null>(null)

  const choose = (templateId: string | null) => {
    setGuidedTemplate(templateId)
    go('import')
  }
  const example = async (template: TemplateInfo, preset: string) => {
    setBusy(template.id)
    setFailed(null)
    try {
      const query = new URLSearchParams({ language, example: 'true' })
      if (preset) query.set('preset', preset)
      loadProject(await getJson<Project>(`/templates/${template.id}/project?${query}`))
      setGuidedTemplate(template.id)
      go('check')
    } catch (err) {
      setFailed(asApiError(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <PageHeader title={t('g.scenario.title')} intro={t('g.scenario.intro')} />
      {project && (
        <button
          type="button"
          onClick={() => go('check')}
          className="border-accent-200 bg-accent-50 hover:bg-accent-100 mb-4 flex w-full items-center gap-3 rounded-xl border p-4 text-left"
        >
          <SquarePen className="text-accent-600 size-5 shrink-0" />
          <span>
            <span className="text-accent-700 block text-sm font-semibold">{t('g.scenario.current')}</span>
            <span className="text-xs text-slate-600">
              {t('g.scenario.currentDesc', {
                name: project.meta.name || project.source?.filename || '—',
                alts: project.alternatives.length,
                alt,
                crits: project.criteria.length,
              })}
            </span>
          </span>
        </button>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        {templates.map((template) => (
          <ScenarioCard
            key={template.id}
            template={template}
            chosen={guidedTemplate === template.id}
            busy={busy === template.id}
            onChoose={() => choose(template.id)}
            onExample={(preset) => example(template, preset)}
          />
        ))}
        <section
          aria-label={t('g.scenario.blank')}
          className="flex flex-col rounded-xl border border-dashed border-slate-300 bg-white p-4"
        >
          <h3 className="mb-1 text-sm font-semibold text-slate-800">{t('g.scenario.blank')}</h3>
          <p className="mb-4 flex-1 text-xs leading-relaxed text-slate-500">{t('g.scenario.blankDesc')}</p>
          <div>
            <Button onClick={() => choose(null)}>{t('g.scenario.choose')}</Button>
          </div>
        </section>
      </div>
      {(failed ?? error) && (
        <div className="mt-4">
          <ApiErrorBox error={(failed ?? error)!} />
        </div>
      )}
    </div>
  )
}

function ScenarioCard({
  template,
  chosen,
  busy,
  onChoose,
  onExample,
}: {
  template: TemplateInfo
  chosen: boolean
  busy: boolean
  onChoose: () => void
  onExample: (preset: string) => void
}) {
  const t = useT()
  const language = useStore((s) => s.language)
  const [preset, setPreset] = useState(template.default_preset ?? '')
  return (
    <section
      aria-label={template.name[language]}
      className={`flex flex-col rounded-xl border bg-white p-4 ${chosen ? 'border-accent-500 ring-accent-100 ring-2' : 'border-slate-200'}`}
    >
      <div className="mb-1 flex items-start justify-between gap-2">
        <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-800">
          <LayoutTemplate className="text-accent-600 size-4" />
          {template.name[language]}
        </h3>
        {chosen && <Badge tone="accent">{t('g.scenario.chosen')}</Badge>}
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
        <Button variant="primary" onClick={onChoose}>
          {t('g.scenario.choose')}
        </Button>
        {template.has_example && (
          <Button icon={<Sparkles className="size-4" />} disabled={busy} onClick={() => onExample(preset)}>
            {t('tpl.example')}
          </Button>
        )}
        {busy && <Spinner />}
      </div>
    </section>
  )
}

// --- 2 Import ---------------------------------------------------------------------------------

const ACCEPT = '.xlsx,.xlsm,.csv,.json'

export function ImportStep({
  go,
  alt,
  onPending,
}: {
  go: Go
  alt: string
  onPending: (pending: PendingTable | null) => void
}) {
  const t = useT()
  const { loadProject, guidedTemplate, language } = useStore()
  const { templates } = useTemplates()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  const template = templates.find((tpl) => tpl.id === guidedTemplate)

  const open = async (file: File) => {
    setBusy(true)
    setError(null)
    try {
      if (isProjectFile(file.name)) {
        loadProject(await openProjectFile(file))
        onPending(null)
        go('check')
        return
      }
      const query = guidedTemplate ? `?template_id=${encodeURIComponent(guidedTemplate)}` : ''
      const inspection = await uploadFile<TableInspection>(`/tables/inspect${query}`, file, file.name)
      if (inspection.project) {
        loadProject(inspection.project) // standard template or legacy workbook
        onPending(null)
        go('check')
      } else {
        onPending({ file, filename: file.name, inspection })
        go('columns')
      }
    } catch (err) {
      setError(asApiError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader title={t('g.import.title', { alt })} intro={t('g.import.intro', { alt })} />
      {template && (
        <p className="text-accent-700 mb-3 text-sm">{t('g.import.template', { name: template.name[language] })}</p>
      )}
      <Card>
        <FileDrop onFile={open} busy={busy} accept={ACCEPT} />
        {error && (
          <div className="mt-4">
            <ApiErrorBox error={error} />
          </div>
        )}
      </Card>
    </div>
  )
}

// --- 3 Columns --------------------------------------------------------------------------------

export function ColumnsStep({ go, pending, onDone }: { go: Go; pending: PendingTable | null; onDone: () => void }) {
  const t = useT()
  const { loadProject, guidedTemplate } = useStore()
  if (!pending) return <p className="text-sm text-slate-500">{t('g.columns.none')}</p>
  return (
    <div>
      <PageHeader title={t('g.columns.title')} />
      <ColumnMapper
        file={pending.file}
        filename={pending.filename}
        initial={pending.inspection}
        initialTemplate={guidedTemplate}
        onDone={(project) => {
          loadProject(project)
          onDone()
          go('check')
        }}
        onCancel={() => go('import')}
      />
    </div>
  )
}

// --- 4 Check ----------------------------------------------------------------------------------

export function CheckStep({ alt, onValid }: { alt: string; onValid: (valid: boolean) => void }) {
  const t = useT()
  const checked = useCheckedProject()
  const validation = useApiPost<{ valid: true }>('/projects/validate', checked?.apiProject ?? null, 300)
  const valid = Boolean(checked?.apiProject && validation.data && !validation.error && !validation.loading)
  useEffect(() => onValid(valid), [valid, onValid])
  if (!checked) return null
  const { project, issues, apiProject } = checked

  return (
    <div>
      <PageHeader title={t('g.check.title')} intro={t('g.check.intro', { alt })} />
      <Card
        title={t('g.check.summary', { alts: project.alternatives.length, alt, crits: project.criteria.length })}
        actions={validation.loading && <Spinner />}
      >
        {issues.length > 0 && <IssueList issues={issues} project={project} />}
        {validation.error && <ApiErrorBox error={validation.error} project={project} />}
        {valid && <p className="text-sm text-emerald-700">{t('g.check.ok')}</p>}
        {!valid && !validation.loading && <p className="mt-3 text-xs text-slate-500">{t('g.check.fixFirst')}</p>}
      </Card>
      <div className="mt-4">
        <QualityPanel project={apiProject} />
      </div>
    </div>
  )
}

// --- 5 Criteria -------------------------------------------------------------------------------

export function CriteriaStep() {
  const t = useT()
  const checked = useCheckedProject()
  const updateProject = useStore((s) => s.updateProject)
  const [openId, setOpenId] = useState<string | null>(null)
  if (!checked) return null
  const { project, apiProject } = checked
  const groups = new Map((project.groups ?? []).map((g) => [g.id, g.name]))

  return (
    <div>
      <PageHeader title={t('g.criteria.title')} intro={t('g.criteria.intro')} />
      <Card>
        <ul className="divide-y divide-slate-100">
          {project.criteria.map((criterion) => (
            <li key={criterion.id} className="py-3">
              <CriterionLine
                criterion={criterion}
                group={criterion.group_id ? groups.get(criterion.group_id) : undefined}
                open={openId === criterion.id}
                onToggle={() => setOpenId(openId === criterion.id ? null : criterion.id)}
                onDirection={(direction) => updateProject((p) => setDirection(p, criterion.id, direction))}
              />
              {openId === criterion.id && (
                <CriterionSettings
                  project={project}
                  apiProject={apiProject}
                  criterion={criterion}
                  update={updateProject}
                />
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}

function scoringLabel(t: ReturnType<typeof useT>, criterion: Criterion): string {
  if (criterion.type === 'numeric' && criterion.value_function) {
    return t(`vf.${criterion.value_function.kind}` as MessageKey)
  }
  return t(`type.${criterion.type ?? 'numeric'}` as MessageKey)
}

function CriterionLine({
  criterion,
  group,
  open,
  onToggle,
  onDirection,
}: {
  criterion: Criterion
  group?: string
  open: boolean
  onToggle: () => void
  onDirection: (direction: Direction) => void
}) {
  const t = useT()
  const direction = directionOf(criterion)
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-slate-800">{criterion.name}</span>
          {criterion.unit && <span className="text-xs text-slate-400">{criterion.unit}</span>}
          {group && <Badge>{group}</Badge>}
        </div>
        <div className="text-xs text-slate-500">{scoringLabel(t, criterion)}</div>
      </div>
      {direction && (
        <Segmented<Direction>
          size="sm"
          value={direction}
          onChange={onDirection}
          options={[
            { value: 'benefit', label: t('common.benefit'), title: t('common.benefitHint') },
            { value: 'cost', label: t('common.cost'), title: t('common.costHint') },
          ]}
        />
      )}
      <Button
        variant="ghost"
        className="!px-2 !py-1 text-xs"
        aria-expanded={open}
        aria-label={`${open ? t('settings.close') : t('settings.open')}: ${criterion.name}`}
        icon={open ? <ChevronUp className="size-3.5" /> : <Settings2 className="size-3.5" />}
        onClick={onToggle}
      >
        {open ? t('settings.close') : t('settings.open')}
      </Button>
    </div>
  )
}

// --- 6 Weights --------------------------------------------------------------------------------

export function WeightsStep() {
  const t = useT()
  const checked = useCheckedProject()
  const updateProject = useStore((s) => s.updateProject)
  if (!checked) return null
  return (
    <div>
      <PageHeader title={t('g.weights.title')} intro={t('g.weights.intro')} />
      <WeightLevels project={checked.project} apiProject={checked.apiProject} update={updateProject} />
    </div>
  )
}

// --- 7 Conclusion -----------------------------------------------------------------------------

export function ConclusionStep() {
  const t = useT()
  const checked = useCheckedProject()
  const { language, setMode, setStep } = useStore()
  const conclusion = useConclusion(checked!.project, checked!.apiProject)
  const [error, setError] = useState<ApiError | null>(null)
  const [busy, setBusy] = useState(false)
  if (!checked) return null
  const { project, apiProject } = checked
  const evaluation = conclusion.evaluation.data
  const names = new Map(project.alternatives.map((a) => [a.id, a.name]))
  const preparing = conclusion.evaluation.loading || conclusion.robustness.loading

  const report = async () => {
    setBusy(true)
    setError(null)
    try {
      await downloadFile('/projects/report', {
        project: apiProject,
        conclusion: conclusion.paragraphs.map((p) => p.text),
      })
    } catch (err) {
      setError(asApiError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader title={t('g.conclusion.title')} intro={t('g.conclusion.intro')} />
      {conclusion.evaluation.error && <ApiErrorBox error={conclusion.evaluation.error} project={project} />}
      {evaluation ? (
        <ConclusionCard project={project} apiProject={apiProject} conclusion={evaluation.conclusion} />
      ) : (
        <Spinner />
      )}
      {evaluation && evaluation.excluded.length > 0 && (
        <Card className="mt-4" title={t('results.excludedTitle')}>
          <ul className="space-y-1 text-sm text-slate-600">
            {evaluation.excluded.map((e) => (
              <li key={e.alternative_id}>
                <span className="font-medium">{names.get(e.alternative_id)}</span>:{' '}
                {e.reasons.map((r) => describeIssue(language, r, project).text).join('; ')}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {error && (
        <div className="mt-4">
          <ApiErrorBox error={error} project={project} />
        </div>
      )}
      <div className="mt-6 flex flex-wrap gap-2">
        <Button
          variant="primary"
          icon={<FileDown className="size-4" />}
          disabled={!apiProject || busy || preparing}
          onClick={report}
        >
          {t('g.conclusion.report')}
        </Button>
        <Button icon={<Save className="size-4" />} onClick={() => saveProjectFile(project)}>
          {t('project.save')}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setStep('results')
            setMode('expert')
          }}
        >
          {t('g.conclusion.expert')}
        </Button>
        {(busy || preparing) && <Spinner />}
      </div>
    </div>
  )
}
