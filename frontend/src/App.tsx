import { Activity, CircleAlert, Download, Languages, Save, SlidersHorizontal, Table2, Trophy } from 'lucide-react'
import { lazy, Suspense, useEffect } from 'react'
import { Spinner } from './components/ui'
import { useMigratePendingDraft } from './hooks'
import { saveProjectFile } from './lib/projectFile'
import type { MessageKey } from './i18n/messages'
import { useT } from './i18n/useT'
import { DataPage } from './pages/DataPage'
import { ExportPage } from './pages/ExportPage'
import { WeightsPage } from './pages/WeightsPage'
import { type StepId, useStore } from './store'

// Chart pages load on demand, so the charting library is not part of the first download.
const ResultsPage = lazy(() => import('./pages/ResultsPage').then((m) => ({ default: m.ResultsPage })))
const SensitivityPage = lazy(() => import('./pages/SensitivityPage').then((m) => ({ default: m.SensitivityPage })))

const STEPS: { id: StepId; label: MessageKey; icon: typeof Table2 }[] = [
  { id: 'data', label: 'step.data', icon: Table2 },
  { id: 'weights', label: 'step.weights', icon: SlidersHorizontal },
  { id: 'results', label: 'step.results', icon: Trophy },
  { id: 'sensitivity', label: 'step.sensitivity', icon: Activity },
  { id: 'export', label: 'step.export', icon: Download },
]

const PAGES: Record<StepId, React.ComponentType> = {
  data: DataPage,
  weights: WeightsPage,
  results: ResultsPage,
  sensitivity: SensitivityPage,
  export: ExportPage,
}

export default function App() {
  const t = useT()
  const { step, setStep, project, language, setLanguage, storageFull } = useStore()
  const migration = useMigratePendingDraft()
  const current = project ? step : 'data'
  const Page = PAGES[current]

  useEffect(() => {
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en'
    document.title = `MCDA · ${t('app.title')}`
  }, [language, t])

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between px-4">
          <div className="flex items-center gap-2.5">
            <img src="/favicon.svg" alt="" className="size-7" />
            <div className="leading-tight">
              <div className="text-sm font-semibold text-slate-900">{t('app.title')}</div>
              <div className="text-xs text-slate-500">{t('app.subtitle')}</div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {project && (
              <button
                type="button"
                onClick={() => saveProjectFile(project)}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
              >
                <Save className="size-4" />
                {t('project.save')}
              </button>
            )}
            <button
              type="button"
              onClick={() => setLanguage(language === 'zh' ? 'en' : 'zh')}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
            >
              <Languages className="size-4" />
              {t('lang.switch')}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col md:flex-row">
        <nav className="border-b border-slate-200 bg-white md:w-56 md:shrink-0 md:border-r md:border-b-0 md:bg-transparent">
          <ol className="flex gap-1 overflow-x-auto p-2 md:sticky md:top-14 md:flex-col md:p-4">
            {STEPS.map(({ id, label, icon: Icon }, index) => {
              const disabled = !project && id !== 'data'
              const active = current === id
              return (
                <li key={id}>
                  <button
                    type="button"
                    disabled={disabled}
                    title={disabled ? t('step.needsData') : undefined}
                    onClick={() => setStep(id)}
                    aria-current={active ? 'step' : undefined}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm whitespace-nowrap transition ${
                      active
                        ? 'bg-accent-50 text-accent-700 font-semibold'
                        : 'text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent'
                    }`}
                  >
                    <span
                      className={`flex size-6 items-center justify-center rounded-full text-xs ${active ? 'bg-accent-600 text-white' : 'bg-slate-200 text-slate-600'}`}
                    >
                      {index + 1}
                    </span>
                    <Icon className="size-4" />
                    {t(label)}
                  </button>
                </li>
              )
            })}
          </ol>
        </nav>

        <main className="min-w-0 flex-1 p-4 md:p-8">
          {(migration.migrating || migration.error || storageFull) && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              {migration.migrating ? <Spinner /> : <CircleAlert className="size-4 shrink-0" />}
              {migration.migrating
                ? t('project.migrating')
                : migration.error
                  ? t('project.migrateFailed')
                  : t('project.storageFull')}
            </div>
          )}
          <Suspense fallback={<Spinner />}>
            <Page />
          </Suspense>
        </main>
      </div>
    </div>
  )
}
