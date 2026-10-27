// Guided mode (S8): seven steps from scenario to conclusion, on the same project as the expert pages.
import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { useState } from 'react'
import type { TableInspection } from '../api/types'
import { useCheckedProject, useTemplates } from '../hooks'
import type { MessageKey } from '../i18n/messages'
import { useT } from '../i18n/useT'
import { alternativeTerm } from '../lib/terms'
import { GUIDED_STEPS, type GuidedStepId, useStore } from '../store'
import { CheckStep, ColumnsStep, ConclusionStep, CriteriaStep, ImportStep, ScenarioStep, WeightsStep } from './steps'
import { Button } from '../components/ui'

/** A table waiting for column choices (between the import and columns steps). */
export interface PendingTable {
  file: Blob
  filename: string
  inspection: TableInspection
}

export function GuidedApp() {
  const t = useT()
  const { guidedStep: step, setGuidedStep, guidedTemplate, project, language } = useStore()
  const checked = useCheckedProject()
  const { templates } = useTemplates()
  const [pending, setPending] = useState<PendingTable | null>(null)
  const [valid, setValid] = useState(false)

  const alt = alternativeTerm(language, templates, project?.meta.template_id ?? guidedTemplate)
  const index = GUIDED_STEPS.indexOf(step)
  const reachable = (id: GuidedStepId) => {
    if (id === 'scenario' || id === 'import') return true
    if (id === 'columns') return pending !== null
    return project !== null
  }
  // Without a project only the first steps make sense.
  const current: GuidedStepId = reachable(step) ? step : project ? 'check' : 'scenario'

  const next: GuidedStepId | null = {
    scenario: 'import',
    import: project ? 'check' : null,
    columns: project ? 'check' : null,
    check: valid ? 'criteria' : null,
    criteria: checked?.apiProject ? 'weights' : null,
    weights: checked?.apiProject ? 'conclusion' : null,
    conclusion: null,
  }[current] as GuidedStepId | null
  const back: GuidedStepId | null = {
    scenario: null,
    import: 'scenario',
    columns: 'import',
    check: pending ? 'columns' : 'import',
    criteria: 'check',
    weights: 'criteria',
    conclusion: 'weights',
  }[current] as GuidedStepId | null

  const go = (id: GuidedStepId) => {
    setGuidedStep(id)
    window.scrollTo({ top: 0 })
  }

  const body = {
    scenario: <ScenarioStep go={go} alt={alt} />,
    import: <ImportStep go={go} alt={alt} onPending={setPending} />,
    columns: <ColumnsStep go={go} pending={pending} onDone={() => setPending(null)} />,
    check: <CheckStep alt={alt} onValid={setValid} />,
    criteria: <CriteriaStep />,
    weights: <WeightsStep />,
    conclusion: <ConclusionStep />,
  }[current]

  return (
    <div className="mx-auto w-full max-w-5xl">
      <nav aria-label={t('mode.guided')} className="mb-6">
        <ol className="flex flex-wrap gap-1.5">
          {GUIDED_STEPS.map((id, k) => {
            const active = id === current
            const done = k < GUIDED_STEPS.indexOf(current)
            return (
              <li key={id}>
                <button
                  type="button"
                  disabled={!reachable(id)}
                  aria-current={active ? 'step' : undefined}
                  onClick={() => go(id)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
                    active
                      ? 'bg-accent-600 text-white'
                      : done
                        ? 'bg-accent-50 text-accent-700 hover:bg-accent-100'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {done ? <Check className="size-3.5" /> : <span className="tabular-nums">{k + 1}</span>}
                  {t(`g.step.${id}` as MessageKey)}
                </button>
              </li>
            )
          })}
        </ol>
        <p className="mt-2 text-xs text-slate-400">{t('g.stepOf', { n: index + 1, total: GUIDED_STEPS.length })}</p>
      </nav>

      {body}

      <div className="mt-8 flex items-center justify-between border-t border-slate-200 pt-4">
        {back ? (
          <Button variant="ghost" icon={<ArrowLeft className="size-4" />} onClick={() => go(back)}>
            {t('g.back')}
          </Button>
        ) : (
          <span />
        )}
        {current !== 'conclusion' && (
          <Button variant="primary" disabled={!next} onClick={() => next && go(next)}>
            {t('g.next')} <ArrowRight className="size-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
